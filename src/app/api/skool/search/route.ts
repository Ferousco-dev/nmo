import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 8;

// Used to ALSO support exact-handle lookup (legacy), so the signup page
// validating ?handle=jack-nmo still works after this rewrite.
const HANDLE_REGEX = /^[a-zA-Z0-9_-]{2,40}$/;

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
  const { data, error } = await supabase
    .from('nmo_members')
    .select('handle, display_name, avatar_url, level, profile_url, last_seen_at')
    .eq('handle', handle)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: true, isMember: false, handle });
  }
  return NextResponse.json({
    ok: true,
    isMember: true,
    handle: data.handle,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    level: data.level,
    profileUrl: data.profile_url ?? `https://www.skool.com/@${data.handle}`,
    lastSeenAt: data.last_seen_at,
  });
}

async function liveSearch(rawQ: string) {
  const q = rawQ.trim();
  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json({ ok: true, results: [] });
  }

  // Sanitize for ILIKE: escape % and _ so they're treated as literals
  const escaped = q.replace(/[\\%_]/g, (c) => '\\' + c);
  const pattern = `%${escaped}%`;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('nmo_members')
    .select('handle, display_name, avatar_url, level, profile_url')
    .or(`display_name.ilike.${pattern},handle.ilike.${pattern}`)
    .order('level', { ascending: false, nullsFirst: false })
    .limit(MAX_RESULTS);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    results: (data || []).map((m) => ({
      handle: m.handle,
      displayName: m.display_name,
      avatarUrl: m.avatar_url,
      level: m.level,
      profileUrl: m.profile_url ?? `https://www.skool.com/@${m.handle}`,
    })),
  });
}
