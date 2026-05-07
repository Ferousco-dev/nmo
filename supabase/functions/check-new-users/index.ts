// Edge Function: check-new-users
//
// Three ways to invoke:
//
//   1) GET /functions/v1/check-new-users
//      → Logs into Skool with SKOOL_EMAIL / SKOOL_PASSWORD (or uses
//        SKOOL_SESSION_COOKIE if provided), fetches the community feed
//        as an authenticated user, parses __NEXT_DATA__, and upserts
//        any new user-shaped objects into nmo_members.
//
//   2) POST /functions/v1/check-new-users
//      Body: {"members": [{handle, display_name, avatar_url, level}, ...]}
//      Header: x-secret: <UPSERT_SECRET>
//      → Upserts the provided members. Use from your browser snippet
//        or the Railway bot.
//
//   3) GET /functions/v1/check-new-users?probe=1
//      → Diagnostic: tries each login endpoint and reports what worked.
//        Useful when Skool changes their auth flow.
//
// Required secrets (set with `supabase secrets set ...`):
//   SUPABASE_URL                 (auto-provided by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY    (auto-provided by Supabase)
//   SKOOL_EMAIL                  watcher account email
//   SKOOL_PASSWORD               watcher account password
//   SKOOL_COMMUNITY_SLUG         e.g. "nmo"
//   UPSERT_SECRET                shared secret for the POST path
//
// Optional:
//   SKOOL_SESSION_COOKIE         pre-captured cookie string (skips login)

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

interface MemberInput {
  handle?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  level?: number | null;
}

interface Normalized {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  level: number | null;
}

// =====================================================================
// Cookie jar — Deno fetch doesn't auto-manage cookies between requests
// =====================================================================
class CookieJar {
  private store = new Map<string, string>();

  ingest(setCookieHeader: string | null) {
    if (!setCookieHeader) return;
    // A response can carry multiple Set-Cookie headers; Deno joins them
    // with comma+space, but commas inside values (e.g. dates) make naive
    // splitting unsafe. Walk character-by-character.
    for (const piece of splitSetCookies(setCookieHeader)) {
      const eq = piece.indexOf('=');
      if (eq < 0) continue;
      const name = piece.slice(0, eq).trim();
      const valuePart = piece.slice(eq + 1);
      const value = valuePart.split(';')[0].trim();
      if (name) this.store.set(name, value);
    }
  }

  asHeader(): string {
    return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  has(name: string): boolean {
    return this.store.has(name);
  }

  size(): number {
    return this.store.size;
  }
}

function splitSetCookies(header: string): string[] {
  // Split on commas that aren't inside an "Expires=" date.
  const parts: string[] = [];
  let buf = '';
  let inExpires = false;
  for (let i = 0; i < header.length; i++) {
    const c = header[i];
    if (c === ',' && !inExpires) {
      parts.push(buf);
      buf = '';
      continue;
    }
    if (header.slice(i, i + 8).toLowerCase() === 'expires=') inExpires = true;
    if (c === ';') inExpires = false;
    buf += c;
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}

// =====================================================================
// Skool auth — try several login endpoints
// =====================================================================
const LOGIN_ENDPOINT_CANDIDATES = [
  // Most common patterns based on how Skool is built (Next.js + REST API)
  { url: 'https://api.skool.com/auth/login', shape: 'json' as const },
  { url: 'https://www.skool.com/api/auth/login', shape: 'json' as const },
  { url: 'https://www.skool.com/api/login', shape: 'json' as const },
  { url: 'https://api.skool.com/v1/auth/login', shape: 'json' as const },
];

interface LoginResult {
  ok: boolean;
  jar: CookieJar;
  via: string;
  error?: string;
}

async function loginToSkool(email: string, password: string): Promise<LoginResult> {
  const jar = new CookieJar();

  // 1) Hit the login page to seed any baseline cookies (CSRF, session ID, etc.)
  try {
    const seed = await fetch('https://www.skool.com/login', {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    jar.ingest(seed.headers.get('set-cookie'));
  } catch (e) {
    return { ok: false, jar, via: 'seed', error: `seed failed: ${(e as Error).message}` };
  }

  // 2) Try each candidate login endpoint until one succeeds
  for (const candidate of LOGIN_ENDPOINT_CANDIDATES) {
    try {
      const res = await fetch(candidate.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          Origin: 'https://www.skool.com',
          Referer: 'https://www.skool.com/login',
          ...(jar.size() > 0 ? { Cookie: jar.asHeader() } : {}),
        },
        body: JSON.stringify({ email, password }),
        redirect: 'follow',
      });
      jar.ingest(res.headers.get('set-cookie'));

      if (res.ok) {
        // Verify by hitting a known authenticated endpoint
        const authed = await isAuthenticated(jar);
        if (authed) return { ok: true, jar, via: candidate.url };
      }
      // Read body for diagnostics on failure
      // (Don't return yet — keep trying other candidates)
    } catch {
      // try next candidate
    }
  }

  return { ok: false, jar, via: 'none', error: 'all login endpoints failed' };
}

async function isAuthenticated(jar: CookieJar): Promise<boolean> {
  try {
    const res = await fetch('https://www.skool.com/me', {
      headers: { Cookie: jar.asHeader(), 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    // If we land on /login, session is invalid
    return res.ok && !res.url.includes('/login');
  } catch {
    return false;
  }
}

// =====================================================================
// Fetch + parse community page (authenticated)
// =====================================================================
async function fetchCommunity(jar: CookieJar, slug: string): Promise<string> {
  const url = `https://www.skool.com/${slug}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: jar.asHeader(),
    },
    redirect: 'follow',
  });
  if (res.url.includes('maintenance.skool.com')) {
    throw new Error('skool is in maintenance mode');
  }
  if (res.url.includes('/login')) {
    throw new Error('redirected to /login — session not authenticated');
  }
  if (!res.ok) {
    throw new Error(`community fetch failed: ${res.status}`);
  }
  return res.text();
}

function extractNextData(html: string): unknown {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no __NEXT_DATA__ in page');
  return JSON.parse(m[1]);
}

// =====================================================================
// JSON walking — same heuristics as the browser snippet
// =====================================================================
function looksLikeUser(n: unknown): n is Record<string, unknown> {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return false;
  const k = Object.keys(n as Record<string, unknown>);
  const hasName = k.some((x) => ['name', 'username', 'handle', 'slug'].includes(x));
  const hasId = k.some((x) => ['id', '_id', 'userId'].includes(x));
  const isPost = k.some((x) => ['content', 'body', 'text', 'title'].includes(x));
  return hasName && hasId && !isPost;
}

function extractHandle(n: Record<string, unknown>): string | null {
  for (const key of ['name', 'username', 'handle', 'slug']) {
    const v = n[key];
    if (typeof v === 'string' && v) return v.replace(/^@+/, '').toLowerCase().trim();
  }
  return null;
}
function extractDisplay(n: Record<string, unknown>): string | null {
  for (const key of ['displayName', 'fullName', 'title']) {
    const v = n[key];
    if (typeof v === 'string' && v) return v.trim();
  }
  const v = n['name'];
  return typeof v === 'string' ? v.trim() : null;
}
function extractAvatar(n: Record<string, unknown>): string | null {
  for (const key of ['avatarUrl', 'profilePictureUrl', 'image', 'imageUrl']) {
    const v = n[key];
    if (typeof v === 'string' && v.startsWith('http')) return v;
  }
  return null;
}
function extractLevel(n: Record<string, unknown>): number | null {
  for (const key of ['level', 'memberLevel', 'userLevel', 'rank']) {
    const v = n[key];
    if (typeof v === 'number' && v > 0 && v < 100) return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
  }
  for (const nk of ['membership', 'communityMembership', 'stats']) {
    const sub = n[nk];
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      for (const key of ['level', 'memberLevel', 'rank']) {
        const v = (sub as Record<string, unknown>)[key];
        if (typeof v === 'number' && v > 0 && v < 100) return v;
      }
    }
  }
  return null;
}

function* walk(node: unknown): Generator<unknown> {
  yield node;
  if (Array.isArray(node)) for (const v of node) yield* walk(v);
  else if (node && typeof node === 'object') for (const v of Object.values(node)) yield* walk(v);
}

function harvestUsers(json: unknown): Normalized[] {
  const seen = new Map<string, Normalized>();
  for (const node of walk(json)) {
    if (!looksLikeUser(node)) continue;
    const handle = extractHandle(node);
    if (!handle || handle.length < 2) continue;
    const cur = seen.get(handle);
    seen.set(handle, {
      handle,
      display_name: extractDisplay(node) ?? cur?.display_name ?? null,
      avatar_url: extractAvatar(node) ?? cur?.avatar_url ?? null,
      level: extractLevel(node) ?? cur?.level ?? null,
    });
  }
  return [...seen.values()];
}

// =====================================================================
// Upsert + audit
// =====================================================================
function normalize(input: MemberInput): Normalized | null {
  if (!input || typeof input.handle !== 'string') return null;
  const handle = input.handle.replace(/^@+/, '').toLowerCase().trim();
  if (handle.length < 2) return null;
  return {
    handle,
    display_name: input.display_name ?? null,
    avatar_url: input.avatar_url ?? null,
    level: typeof input.level === 'number' ? input.level : null,
  };
}

async function upsertMembers(supabase: SupabaseClient, members: Normalized[]) {
  if (members.length === 0) return { newCount: 0, totalUpserted: 0, newHandles: [] as string[] };

  const handles = members.map((m) => m.handle);
  const { data: existing } = await supabase
    .from('nmo_members')
    .select('handle')
    .in('handle', handles);
  const existingSet = new Set((existing ?? []).map((r: { handle: string }) => r.handle));
  const newHandles = handles.filter((h) => !existingSet.has(h));

  const rows = members.map((m) => ({
    handle: m.handle,
    display_name: m.display_name,
    avatar_url: m.avatar_url,
    level: m.level,
    last_seen_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('nmo_members')
    .upsert(rows, { onConflict: 'handle' });
  if (error) throw new Error(`upsert failed: ${error.message}`);

  return { newCount: newHandles.length, totalUpserted: rows.length, newHandles };
}

async function logRun(
  supabase: SupabaseClient,
  status: 'success' | 'failed',
  notes: Record<string, unknown>,
  error?: string
) {
  await supabase.from('bot_runs').insert({
    started_at: notes.startedAt as string,
    finished_at: new Date().toISOString(),
    status,
    posts_seen: (notes.harvestedCount as number) ?? 0,
    events_inserted: (notes.newCount as number) ?? 0,
    error: error?.slice(0, 1000),
    notes,
  });
}

// =====================================================================
// HTTP handler
// =====================================================================
function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const startedAt = new Date().toISOString();
  const url = new URL(req.url);
  const isProbe = url.searchParams.get('probe') === '1';

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: 'missing_env' }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  // POST: receive members from external caller (browser snippet, Railway bot)
  if (req.method === 'POST') {
    const secret = Deno.env.get('UPSERT_SECRET');
    if (!secret || req.headers.get('x-secret') !== secret) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
    let body: { members?: MemberInput[] };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }
    const members = (body.members ?? []).map(normalize).filter((m): m is Normalized => m !== null);
    try {
      const result = await upsertMembers(supabase, members);
      await logRun(supabase, 'success', {
        startedAt,
        source: 'post',
        receivedCount: body.members?.length ?? 0,
        harvestedCount: members.length,
        newCount: result.newCount,
      });
      return jsonResponse({ ok: true, ...result });
    } catch (e) {
      const msg = (e as Error).message;
      await logRun(supabase, 'failed', { startedAt, source: 'post' }, msg);
      return jsonResponse({ ok: false, error: msg }, 500);
    }
  }

  // GET: authenticated scrape
  if (req.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const slug = Deno.env.get('SKOOL_COMMUNITY_SLUG') ?? 'nmo';
  const sessionCookie = Deno.env.get('SKOOL_SESSION_COOKIE');
  const email = Deno.env.get('SKOOL_EMAIL');
  const password = Deno.env.get('SKOOL_PASSWORD');

  // 1) Get a cookie jar — either pre-supplied or by logging in
  const jar = new CookieJar();
  let authVia = 'none';
  let loginError: string | undefined;

  if (sessionCookie) {
    jar.ingest(sessionCookie);
    authVia = 'preset_cookie';
  } else if (email && password) {
    const result = await loginToSkool(email, password);
    if (result.ok) {
      // Move cookies from result into our jar
      jar.ingest(result.jar.asHeader().split('; ').map((c) => c + ';').join(', '));
      authVia = result.via;
    } else {
      loginError = result.error;
    }
  } else {
    loginError = 'no auth: set SKOOL_EMAIL+SKOOL_PASSWORD or SKOOL_SESSION_COOKIE';
  }

  // Probe mode: report which login endpoint worked + cookie count, don't scrape
  if (isProbe) {
    return jsonResponse({
      ok: !loginError,
      authVia,
      cookieCount: jar.size(),
      error: loginError ?? null,
      hint: loginError
        ? 'Login flow failed. Try setting SKOOL_SESSION_COOKIE manually (see README in this folder).'
        : 'Login worked. Remove ?probe=1 to run the actual scrape.',
    });
  }

  if (loginError) {
    await logRun(supabase, 'failed', { startedAt, source: 'auth' }, loginError);
    return jsonResponse({ ok: false, error: loginError, authVia }, 200);
  }

  // 2) Fetch community + harvest users
  try {
    const html = await fetchCommunity(jar, slug);
    const data = extractNextData(html);
    const harvested = harvestUsers(data);
    const result = await upsertMembers(supabase, harvested);
    await logRun(supabase, 'success', {
      startedAt,
      source: 'authenticated_scrape',
      authVia,
      harvestedCount: harvested.length,
      newCount: result.newCount,
      sampleNew: result.newHandles.slice(0, 10),
    });
    return jsonResponse({
      ok: true,
      authVia,
      harvested: harvested.length,
      ...result,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await logRun(supabase, 'failed', { startedAt, source: 'authenticated_scrape', authVia }, msg);
    return jsonResponse({ ok: false, error: msg, authVia }, 200);
  }
});
