import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// =====================================================================
// Daily Skool member sync, driven by Apify.
//
// Vercel Cron hits this route at 19:00 UTC (= 20:00 West Africa Time,
// = 03:00 Taipei the next day — change vercel.json if you want a
// different window). It runs the `apify/cheerio-scraper` actor against
// the community page, harvests user-shaped records out of __NEXT_DATA__,
// and upserts them into public.nmo_members.
//
// Env vars (set in Vercel project settings):
//   APIFY_TOKEN                 required — Apify API token
//   SKOOL_COMMUNITY_SLUG        default 'nmo'
//   SKOOL_SESSION_COOKIE        optional — `cookie: ...` string captured
//                               from a logged-in browser session. Without
//                               it, only the public members view works.
//   SUPABASE_SERVICE_ROLE_KEY   required — to write to nmo_members
//   NEXT_PUBLIC_SUPABASE_URL    required
//   CRON_SECRET                 set automatically by Vercel Cron
//   TRIGGER_SECRET              optional — accept this on x-trigger-secret
//                               for manual POST runs
// =====================================================================

interface ApifyMember {
  handle?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  level?: number | null;
  profile_url?: string | null;
}

interface NormalizedMember {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  level: number | null;
  profile_url: string | null;
}

const APIFY_ACTOR = 'apify~cheerio-scraper';

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const triggerSecret = process.env.TRIGGER_SECRET;
  if (triggerSecret && req.headers.get('x-trigger-secret') === triggerSecret) return true;

  // Allow unauthenticated runs in dev only.
  return process.env.NODE_ENV !== 'production';
}

function parseCookieHeader(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const eq = c.indexOf('=');
      if (eq < 0) return null;
      return {
        name: c.slice(0, eq).trim(),
        value: c.slice(eq + 1).trim(),
        domain: '.skool.com',
        path: '/',
      };
    })
    .filter(Boolean) as Array<{ name: string; value: string; domain: string; path: string }>;
}

function normalize(raw: ApifyMember): NormalizedMember | null {
  if (!raw || typeof raw.handle !== 'string') return null;
  const handle = raw.handle.replace(/^@+/, '').toLowerCase().trim();
  if (handle.length < 2) return null;

  const profileUrl =
    raw.profile_url && raw.profile_url.startsWith('http')
      ? raw.profile_url
      : `https://www.skool.com/@${handle}`;

  return {
    handle,
    display_name: raw.display_name ?? null,
    avatar_url: raw.avatar_url ?? null,
    level: typeof raw.level === 'number' && raw.level > 0 ? raw.level : null,
    profile_url: profileUrl,
  };
}

// pageFunction executes inside Apify's actor. It must be plain JS, no
// imports, and self-contained. Skool ships hydrated data inside
// <script id="__NEXT_DATA__"> — we walk the JSON for user-shaped nodes.
const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { $, request, log } = context;
  const raw = $('#__NEXT_DATA__').first().html();
  if (!raw) {
    log.warning('no __NEXT_DATA__ on ' + request.url);
    return [];
  }

  let data;
  try { data = JSON.parse(raw); }
  catch (e) {
    log.warning('failed to parse __NEXT_DATA__: ' + e.message);
    return [];
  }

  const seen = new Map();

  function pickString(node, keys) {
    for (const k of keys) {
      const v = node[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  }

  function pickHttp(node, keys) {
    for (const k of keys) {
      const v = node[k];
      if (typeof v === 'string' && v.startsWith('http')) return v;
    }
    return null;
  }

  function pickLevel(node) {
    for (const k of ['level', 'memberLevel', 'userLevel', 'rank']) {
      const v = node[k];
      if (typeof v === 'number' && v > 0 && v < 100) return v;
      if (typeof v === 'string' && /^\\d+$/.test(v)) return parseInt(v, 10);
    }
    for (const sk of ['membership', 'communityMembership', 'stats']) {
      const sub = node[sk];
      if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
        for (const k of ['level', 'memberLevel', 'rank']) {
          const v = sub[k];
          if (typeof v === 'number' && v > 0 && v < 100) return v;
        }
      }
    }
    return null;
  }

  function isUserShaped(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    const k = Object.keys(node);
    const hasNameField = k.some((x) => ['name', 'username', 'handle', 'slug', 'displayName', 'fullName'].includes(x));
    const hasIdField = k.some((x) => ['id', '_id', 'userId'].includes(x));
    const looksLikePost = k.some((x) => ['content', 'body', 'commentCount', 'replies'].includes(x));
    return hasNameField && hasIdField && !looksLikePost;
  }

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) { for (const v of node) walk(v); return; }
    if (typeof node !== 'object') return;

    if (isUserShaped(node)) {
      // Prefer the human-readable username for handle; only fall back
      // to numeric id-like fields if nothing else is present.
      const usernameLike = pickString(node, ['username', 'handle', 'slug']);
      const nameLike = pickString(node, ['name']);
      const idLike = node.id || node._id || node.userId;

      let handle = usernameLike;
      // If 'name' looks like a username (no spaces, mostly slug chars), use it
      if (!handle && nameLike && /^[a-zA-Z0-9_.-]{2,40}$/.test(nameLike)) {
        handle = nameLike;
      }
      if (!handle && idLike != null) handle = String(idLike);
      if (!handle) return;
      handle = handle.replace(/^@+/, '').toLowerCase().trim();
      if (handle.length < 2) return;

      const displayName =
        pickString(node, ['displayName', 'fullName', 'title']) ||
        (nameLike && nameLike !== handle ? nameLike : null);

      const avatar = pickHttp(node, ['avatarUrl', 'profilePictureUrl', 'image', 'imageUrl', 'avatar']);
      const level = pickLevel(node);

      // Skool profiles are reachable at /@username. If we only have a
      // numeric id, the URL won't resolve — leave it null in that case
      // and let the caller patch via verify().
      const slugLike = usernameLike || (nameLike && /^[a-zA-Z0-9_.-]{2,40}$/.test(nameLike) ? nameLike : null);
      const profileUrl = slugLike ? 'https://www.skool.com/@' + slugLike.toLowerCase() : null;

      const cur = seen.get(handle) || {};
      seen.set(handle, {
        handle,
        display_name: displayName || cur.display_name || null,
        avatar_url: avatar || cur.avatar_url || null,
        level: level || cur.level || null,
        profile_url: profileUrl || cur.profile_url || null,
      });
    }

    for (const v of Object.values(node)) walk(v);
  }

  walk(data);
  const out = Array.from(seen.values());
  log.info('harvested ' + out.length + ' members from ' + request.url);
  return out;
}
`.trim();

async function runApifyScrape(opts: {
  apifyToken: string;
  slug: string;
  sessionCookie?: string;
}) {
  const startUrls = [
    { url: `https://www.skool.com/${opts.slug}/-/members` },
    { url: `https://www.skool.com/${opts.slug}` },
  ];

  const input: Record<string, unknown> = {
    startUrls,
    pageFunction: PAGE_FUNCTION,
    keepUrlFragments: false,
    ignoreSslErrors: false,
    maxRequestsPerCrawl: 10,
    maxConcurrency: 2,
    maxRequestRetries: 2,
    pageLoadTimeoutSecs: 30,
    proxyConfiguration: { useApifyProxy: true },
    additionalMimeTypes: [],
    suggestResponseEncoding: true,
  };

  const cookies = parseCookieHeader(opts.sessionCookie);
  if (cookies.length > 0) {
    input.initialCookies = cookies;
  }

  // run-sync-get-dataset-items blocks until the actor finishes and
  // streams back the dataset as JSON. Timeout is capped server-side
  // by Apify; we add ?timeout=240 to leave headroom under our 300s
  // maxDuration.
  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(
    opts.apifyToken
  )}&timeout=240&memory=1024&format=json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`apify_${res.status}: ${text.slice(0, 500)}`);
  }

  let items: unknown;
  try {
    items = JSON.parse(text);
  } catch {
    throw new Error('apify returned non-JSON dataset');
  }
  if (!Array.isArray(items)) throw new Error('apify dataset is not an array');

  // The pageFunction returns an array per page; the dataset flattens
  // those into individual items. Both shapes are tolerated here.
  const flat: ApifyMember[] = [];
  for (const it of items) {
    if (Array.isArray(it)) flat.push(...(it as ApifyMember[]));
    else if (it && typeof it === 'object') flat.push(it as ApifyMember);
  }
  return flat;
}

async function upsert(
  supabaseUrl: string,
  serviceKey: string,
  members: NormalizedMember[]
) {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (members.length === 0) {
    return { newCount: 0, totalUpserted: 0, newHandles: [] as string[] };
  }

  const handles = members.map((m) => m.handle);
  const { data: existing, error: selErr } = await supabase
    .from('nmo_members')
    .select('handle')
    .in('handle', handles);
  if (selErr) throw new Error(`select_existing: ${selErr.message}`);

  const existingSet = new Set((existing ?? []).map((r: { handle: string }) => r.handle));
  const newHandles = handles.filter((h) => !existingSet.has(h));

  const rows = members.map((m) => ({
    handle: m.handle,
    display_name: m.display_name,
    avatar_url: m.avatar_url,
    level: m.level,
    profile_url: m.profile_url,
    last_seen_at: new Date().toISOString(),
  }));

  const { error: upErr } = await supabase
    .from('nmo_members')
    .upsert(rows, { onConflict: 'handle', ignoreDuplicates: false });
  if (upErr) throw new Error(`upsert: ${upErr.message}`);

  return { newCount: newHandles.length, totalUpserted: rows.length, newHandles };
}

async function logRun(
  supabaseUrl: string,
  serviceKey: string,
  payload: {
    startedAt: string;
    status: 'success' | 'failed';
    harvested: number;
    newCount: number;
    error?: string;
    notes?: Record<string, unknown>;
  }
) {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await supabase.from('bot_runs').insert({
    started_at: payload.startedAt,
    finished_at: new Date().toISOString(),
    status: payload.status,
    posts_seen: payload.harvested,
    events_inserted: payload.newCount,
    error: payload.error?.slice(0, 1000),
    notes: { source: 'vercel_cron_apify', ...(payload.notes ?? {}) },
  });
}

async function handle(req: Request) {
  const startedAt = new Date().toISOString();

  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apifyToken = process.env.APIFY_TOKEN;
  const slug = process.env.SKOOL_COMMUNITY_SLUG || 'nmo';
  const sessionCookie = process.env.SKOOL_SESSION_COOKIE;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'missing_supabase_env' }, { status: 500 });
  }
  if (!apifyToken) {
    return NextResponse.json({ ok: false, error: 'missing_apify_token' }, { status: 500 });
  }

  try {
    const raw = await runApifyScrape({ apifyToken, slug, sessionCookie });
    const members = raw
      .map(normalize)
      .filter((m): m is NormalizedMember => m !== null);

    const result = await upsert(supabaseUrl, serviceKey, members);

    await logRun(supabaseUrl, serviceKey, {
      startedAt,
      status: 'success',
      harvested: members.length,
      newCount: result.newCount,
      notes: {
        rawCount: raw.length,
        slug,
        authenticated: Boolean(sessionCookie),
        sampleNew: result.newHandles.slice(0, 10),
      },
    });

    return NextResponse.json({
      ok: true,
      harvested: members.length,
      ...result,
    });
  } catch (e) {
    const msg = (e as Error).message || 'unknown_error';
    try {
      await logRun(supabaseUrl, serviceKey, {
        startedAt,
        status: 'failed',
        harvested: 0,
        newCount: 0,
        error: msg,
        notes: { slug, authenticated: Boolean(sessionCookie) },
      });
    } catch {
      // swallow logging failures so the original error surfaces
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
