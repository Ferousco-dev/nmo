import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 8;

// Used to ALSO support exact-handle lookup (legacy), so the signup page
// validating ?handle=jack-nmo still works after this rewrite.
const HANDLE_REGEX = /^[a-zA-Z0-9_-]{2,40}$/;

interface SearchResult {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: number | null;
  /** When set, this member is also in family_tree — shown with a role tag */
  role?: string | null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const handle = url.searchParams.get('handle');
  const q = url.searchParams.get('q');

  // Exact-handle lookup (legacy /signup behaviour)
  if (handle) {
    return exactHandle(handle);
  }

  // Live search
  return liveSearch(q ?? '');
}

export async function POST(req: Request) {
  let body: { handle?: string; q?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  if (body.handle) return exactHandle(body.handle);
  return liveSearch(body.q ?? '');
}

async function exactHandle(rawHandle: string) {
  const handle = rawHandle.trim().replace(/^@+/, '').toLowerCase();
  if (!HANDLE_REGEX.test(handle)) {
    return NextResponse.json({ ok: false, error: 'invalid_handle' }, { status: 400 });
  }
  const supabase = createClient();

  // family_tree first so a leader who hasn't been picked up by the
  // Apify members scrape yet (or whose display_name is still the
  // handle-stub) still resolves with their proper name + photo.
  const [memberRes, familyRes] = await Promise.all([
    supabase
      .from('nmo_members')
      .select('handle, display_name, avatar_url, level, last_seen_at')
      .eq('handle', handle)
      .maybeSingle(),
    supabase
      .from('family_tree')
      .select('skool_handle, name, photo_url, role')
      .ilike('skool_handle', handle)
      .maybeSingle(),
  ]);

  if (memberRes.error && memberRes.error.code !== 'PGRST116') {
    return NextResponse.json({ ok: false, error: memberRes.error.message }, { status: 500 });
  }

  const member = memberRes.data;
  const family = familyRes.data as { skool_handle: string; name: string; photo_url: string | null; role: string } | null;

  if (!member && !family) {
    return NextResponse.json({ ok: true, isMember: false, handle });
  }

  return NextResponse.json({
    ok: true,
    isMember: true,
    handle: member?.handle ?? family?.skool_handle ?? handle,
    // Prefer family_tree's proper-case name + curated photo when present.
    displayName: family?.name ?? member?.display_name ?? null,
    avatarUrl: family?.photo_url ?? member?.avatar_url ?? null,
    level: member?.level ?? null,
    role: family?.role ?? null,
    lastSeenAt: member?.last_seen_at ?? null,
  });
}

async function liveSearch(rawQ: string) {
  const q = rawQ.trim();
  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json({ ok: true, results: [] });
  }

  // Tokenize on whitespace and join with % wildcards so "Jack li" matches
  // both display_name "Jack Liu" AND handle "jack-liu-9368" (where the
  // word break is a hyphen, not a space). Each token is escaped so user-
  // supplied % / _ / \ aren't treated as LIKE metacharacters.
  const tokens = q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[\\%_]/g, (c) => '\\' + c));
  if (tokens.length === 0) {
    return NextResponse.json({ ok: true, results: [] });
  }
  const pattern = `%${tokens.join('%')}%`;

  const supabase = createClient();

  // Query nmo_members + family_tree in parallel. family_tree contains
  // hand-curated leadership entries (Owner / Coach / Regional Commander
  // etc.) that have proper-case names and photos, whereas nmo_members
  // is the bulk Apify roster (often display_name = handle-stub). When
  // the same skool_handle appears in both, family_tree wins.
  const [memberRes, familyRes] = await Promise.all([
    supabase
      .from('nmo_members')
      .select('handle, display_name, avatar_url, level')
      .or(`display_name.ilike.${pattern},handle.ilike.${pattern}`)
      .order('level', { ascending: false, nullsFirst: false })
      .limit(MAX_RESULTS),
    supabase
      .from('family_tree')
      .select('skool_handle, name, photo_url, role, display_order')
      .or(`name.ilike.${pattern},skool_handle.ilike.${pattern}`)
      .not('skool_handle', 'is', null)
      .order('display_order', { ascending: true })
      .limit(MAX_RESULTS),
  ]);

  if (memberRes.error) {
    return NextResponse.json({ ok: false, error: memberRes.error.message }, { status: 500 });
  }
  // family_tree errors are non-fatal — fall back to nmo_members only.

  const byHandle = new Map<string, SearchResult>();

  // 1. Seed with nmo_members (lower priority).
  for (const m of memberRes.data ?? []) {
    const row = m as {
      handle: string;
      display_name: string | null;
      avatar_url: string | null;
      level: number | null;
    };
    byHandle.set(row.handle.toLowerCase(), {
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      level: row.level,
      role: null,
    });
  }

  // 2. Overlay family_tree (higher priority: better name + photo + role).
  for (const f of familyRes.data ?? []) {
    const row = f as {
      skool_handle: string | null;
      name: string;
      photo_url: string | null;
      role: string;
    };
    const handle = (row.skool_handle ?? '').trim().toLowerCase();
    if (!handle) continue;
    const existing = byHandle.get(handle);
    byHandle.set(handle, {
      handle,
      displayName: row.name ?? existing?.displayName ?? null,
      avatarUrl: row.photo_url ?? existing?.avatarUrl ?? null,
      level: existing?.level ?? null,
      role: row.role ?? null,
    });
  }

  // 3. Order: family_tree matches first (they have role set), then the
  //    rest, capped at MAX_RESULTS.
  const all = Array.from(byHandle.values());
  const leaders = all.filter((r) => r.role);
  const members = all.filter((r) => !r.role);
  const merged = [...leaders, ...members].slice(0, MAX_RESULTS);

  return NextResponse.json({ ok: true, results: merged });
}
