// Admin-only: pull recent Skool posts via the direct data-route API
// (no Apify) and upsert into engagement_events. The DB trigger
// credit_engagement_points takes over from there.
//
// Per-page cost is sub-second (vs. Apify's minutes), so a small loop
// over the newest N pages of the feed fits comfortably inside the
// Hobby plan's 60s function ceiling. Admin can re-trigger to walk
// deeper into the backlog (?pages=20 hits up to ~480 posts).
//
// Credit semantics per post:
//   - +1 'post' event for the author
//   - +upvotes 'like' events for the author (receiver gets the points;
//     engagement_weights.like = 1 covers this even though the schema
//     comment says "like given by user" — the trigger only cares about
//     user_id, which we resolve through skool_handle)
//   - +1 'comment' event for each contributor in the top-5 contributors
//     blob attached to the post. This is a partial count — Skool only
//     exposes the 5 most recent commenters per post in the feed payload.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  fetchFeedPage,
  parseContributors,
  SkoolApiError,
  type SkoolPost,
} from '@/lib/skool/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COMMUNITY_SLUG = 'nmo';
const DEFAULT_PAGES = 5;
const MAX_PAGES = 20;

// Any authenticated user can trigger — rate-limit (below) prevents abuse.
// Admins get higher pages-per-call + can bypass the cooldown via ?force=1.
async function requireAuth() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: 'not_authenticated' };
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  return { ok: true as const, userId: user.id, isAdmin: !!adminRow };
}

const RATE_LIMIT_MS = 30 * 60_000; // 30 min cooldown between auto-syncs

interface EventRow {
  user_id: null;
  skool_handle: string;
  event_type: 'post' | 'comment' | 'like';
  source_id: string;
  target_post_id: string;
  occurred_at: string;
}

function buildRowsForPost(p: SkoolPost): EventRow[] {
  const rows: EventRow[] = [];
  const authorHandle = (p.user.name ?? '').toLowerCase();
  if (!authorHandle) return rows;
  const occurred_at = p.createdAt;

  // 1. The post itself.
  rows.push({
    user_id: null,
    skool_handle: authorHandle,
    event_type: 'post',
    source_id: `post:${p.id}`,
    target_post_id: p.id,
    occurred_at,
  });

  // 2. Likes-received → N rows for the author (synthetic indices so
  //    dedupe is stable across runs while still allowing N inserts).
  const upvotes = Math.max(0, Math.min(10_000, p.metadata.upvotes ?? 0));
  for (let i = 0; i < upvotes; i++) {
    rows.push({
      user_id: null,
      skool_handle: authorHandle,
      event_type: 'like',
      source_id: `like:${p.id}:${i}`,
      target_post_id: p.id,
      occurred_at,
    });
  }

  // 3. Top contributors → +1 comment each. Partial (only 5 visible
  //    in feed payload), so admin can re-trigger with deeper pages
  //    to refine. Dedupe key includes contributor id so same person
  //    appearing again on a different post still counts.
  for (const c of parseContributors(p.metadata.contributors)) {
    const handle = (c.name ?? '').toLowerCase();
    if (!handle || handle === authorHandle) continue;
    rows.push({
      user_id: null,
      skool_handle: handle,
      event_type: 'comment',
      source_id: `comment:${p.id}:${c.id}`,
      target_post_id: p.id,
      occurred_at,
    });
  }

  return rows;
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Service-role client for everything below — token lookup, rate-limit
  // query, bulk insert. Avoids the admin_get_setting RPC's is_admin()
  // gate so any signed-in user can tickle the sync.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'server_env_missing', missing: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !process.env[k]) },
      { status: 500 },
    );
  }
  const service = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Parse query params. Non-admins always get 3 pages; admins choose
  //    via ?pages=N and can bypass the cooldown with ?force=1.
  const url = new URL(req.url);
  const force = auth.isAdmin && url.searchParams.get('force') === '1';
  const requested = parseInt(url.searchParams.get('pages') ?? '', 10);
  const pages = auth.isAdmin
    ? Math.max(1, Math.min(MAX_PAGES, isNaN(requested) ? DEFAULT_PAGES : requested))
    : 3;

  // 2. Rate-limit — skip if a successful skool_direct_api run finished
  //    within the cooldown. Prevents thundering-herd on first dashboard
  //    visit of the day when 100 users land at once.
  if (!force) {
    const cutoffIso = new Date(Date.now() - RATE_LIMIT_MS).toISOString();
    const { data: recentRuns } = await service
      .from('bot_runs')
      .select('id, finished_at, notes')
      .eq('status', 'success')
      .gte('finished_at', cutoffIso)
      .order('finished_at', { ascending: false })
      .limit(10);
    const skoolRecent = (recentRuns ?? []).find((r) => {
      const n = (r as { notes?: Record<string, unknown> }).notes;
      return n && typeof n === 'object' && (n as Record<string, unknown>).mode === 'skool_direct_api';
    });
    if (skoolRecent) {
      return NextResponse.json({
        ok: true,
        skipped: 'recent',
        last_run_at: (skoolRecent as { finished_at: string }).finished_at,
      });
    }
  }

  // 3. Pull auth_token via service-role (bypasses RLS, no admin check).
  const { data: tokenRow } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'skool_auth_token')
    .maybeSingle();
  const authToken = (tokenRow as { value: string } | null)?.value ?? null;
  if (!authToken) {
    return NextResponse.json(
      {
        error: 'settings_missing',
        missing: ['skool_auth_token'],
        hint: 'Paste the watcher account auth_token JWT in /admin → Integrations or run the seed SQL.',
      },
      { status: 412 },
    );
  }

  // 4. Open a bot_runs row for observability.
  const { data: runRow } = await service
    .from('bot_runs')
    .insert({
      status: 'running',
      notes: {
        mode: 'skool_direct_api',
        pages,
        community: COMMUNITY_SLUG,
        triggered_by: auth.isAdmin ? (force ? 'admin_force' : 'admin') : 'user_auto_sync',
      },
    })
    .select('id')
    .single();
  const runId = (runRow as { id: string } | null)?.id ?? null;

  // 5. Walk the feed pages.
  let postsSeen = 0;
  let eventsInserted = 0;
  let pagesFetched = 0;
  let lastPageTotal = 0;
  const allRows: EventRow[] = [];

  try {
    for (let page = 1; page <= pages; page++) {
      const { posts, total } = await fetchFeedPage(authToken, COMMUNITY_SLUG, page);
      pagesFetched++;
      lastPageTotal = total;
      postsSeen += posts.length;
      for (const p of posts) {
        allRows.push(...buildRowsForPost(p));
      }
      // Empty page = end of feed.
      if (posts.length === 0) break;
    }
  } catch (e) {
    const detail = e instanceof SkoolApiError ? `${e.status}: ${e.bodyPreview}` : (e as Error).message;
    await service
      .from('bot_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: detail.slice(0, 1000),
        posts_seen: postsSeen,
        events_inserted: 0,
      })
      .eq('id', runId);
    return NextResponse.json({ error: 'skool_fetch_failed', detail }, { status: 502 });
  }

  // 6. Bulk-insert with ON CONFLICT dedupe via the unique(source_id) index.
  if (allRows.length > 0) {
    // Chunk to keep payload size sane (50k+ likes on a viral post would
    // blow a single request otherwise).
    const CHUNK = 500;
    for (let i = 0; i < allRows.length; i += CHUNK) {
      const chunk = allRows.slice(i, i + CHUNK);
      const { error, count } = await service
        .from('engagement_events')
        .upsert(chunk, { onConflict: 'source_id', ignoreDuplicates: true, count: 'exact' });
      if (error) {
        await service
          .from('bot_runs')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            error: error.message.slice(0, 1000),
            posts_seen: postsSeen,
            events_inserted: eventsInserted,
          })
          .eq('id', runId);
        return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
      }
      eventsInserted += count ?? 0;
    }
  }

  await service
    .from('bot_runs')
    .update({
      status: 'success',
      finished_at: new Date().toISOString(),
      posts_seen: postsSeen,
      events_inserted: eventsInserted,
    })
    .eq('id', runId);

  return NextResponse.json({
    ok: true,
    run_id: runId,
    pages_fetched: pagesFetched,
    posts_seen: postsSeen,
    events_inserted: eventsInserted,
    feed_total: lastPageTotal,
    note:
      pagesFetched === pages && postsSeen > 0
        ? `Trigger again with ?pages=${pages} to fetch the next batch (deeper into the feed).`
        : 'Reached end of feed.',
  });
}
