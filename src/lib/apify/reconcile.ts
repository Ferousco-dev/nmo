// Reconciler — bridges async Apify runs to bot_runs audit rows.
//
// Called from the admin status route on every poll. Looks for
// bot_runs rows with status='running' and notes.apify_run_id set,
// asks Apify for their current state, and if any are terminal
// (SUCCEEDED / FAILED / ABORTED / TIMED-OUT) finishes the row:
//   - SUCCEEDED → fetch dataset, parse the pageFunction return
//     value, upsert via the SECURITY DEFINER RPC, mark success
//   - FAILED/ABORTED/TIMED-OUT → mark failed with the Apify status
//
// Does up to MAX_PER_POLL rows per call so a backlog doesn't slow
// the status route.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  apifyGetRun,
  apifyGetDatasetItems,
  isTerminalApifyStatus,
} from './api';

const MAX_PER_POLL = 5;

interface MemberRow {
  handle: string;
  display_name?: string | null;
  avatar_url?: string | null;
  level?: number | null;
}

interface MembersPageFunctionSuccess {
  ok: true;
  count: number;
  source: string;
  members: MemberRow[];
  debug?: unknown;
}
interface BackfillResult {
  handle: string;
  avatar_url?: string | null;
  error?: string;
}
interface BackfillPageFunctionSuccess {
  ok: true;
  count: number;
  found: number;
  results: BackfillResult[];
}
interface EngagementEvent {
  skool_handle: string;
  event_type: 'post' | 'comment' | 'reply' | 'like';
  source_id: string;
  target_post_id?: string | null;
  target_post_url?: string | null;
  content_excerpt?: string | null;
  occurred_at?: string | null;
  likes_received?: number;
  comments_received?: number;
}
interface EngagementPageFunctionSuccess {
  ok: true;
  count: number;
  per_handle?: Record<string, number>;
  events: EngagementEvent[];
  /**
   * Profile avatars harvested in-flight from each /@handle's og:image
   * tag. Free byproduct of the engagement scrape — saves us from
   * having to spin up a separate avatar-backfill run.
   */
  avatars?: Record<string, string>;
}
interface PageFunctionError {
  error: string;
  current_url?: string;
  detail?: string;
}

interface BotRunsRow {
  id: string;
  notes: Record<string, unknown> | null;
  started_at: string;
}

export async function reconcilePendingApifyRuns(
  supabase: SupabaseClient,
  apifyToken: string | null,
): Promise<void> {
  if (!apifyToken) return;

  // Pull bot_runs rows that look like outstanding Apify work. We can't
  // index into JSON in a .filter() chain on PostgREST without RPCs, so
  // grab recent running rows and filter in JS.
  const { data: rows } = await supabase
    .from('bot_runs')
    .select('id, notes, started_at')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(20);

  // Mark runs that have been "running" for more than STALL_AFTER_MS as
  // failed. Without this guard, a row that never gets a terminal Apify
  // status (Vercel terminated the function mid-poll, network glitch
  // during status read, etc.) stays running forever and blocks the
  // 10-min cooldown on /api/me/refresh-engagement for that handle —
  // user can never trigger another refresh.
  const STALL_AFTER_MS = 5 * 60_000;
  const now = Date.now();
  const stalled = (rows ?? []).filter((r) => {
    const startedAt = new Date((r as { started_at: string }).started_at).getTime();
    return Number.isFinite(startedAt) && now - startedAt > STALL_AFTER_MS;
  });
  for (const r of stalled) {
    await supabase
      .from('bot_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: `Stalled — running > ${STALL_AFTER_MS / 60_000} min without terminal Apify status`,
      })
      .eq('id', (r as { id: string }).id);
  }

  const candidates = (rows ?? [])
    .filter((r): r is BotRunsRow => {
      const n = (r as BotRunsRow).notes;
      if (!n || typeof n !== 'object') return false;
      const mode = (n as Record<string, unknown>).mode;
      const apifyRunId = (n as Record<string, unknown>).apify_run_id;
      return (
        typeof apifyRunId === 'string' &&
        apifyRunId.length > 0 &&
        (mode === 'members_only_apify' ||
          mode === 'avatar_backfill_apify' ||
          mode === 'engagement_events_apify')
      );
    })
    .slice(0, MAX_PER_POLL);

  for (const row of candidates) {
    const notes = row.notes ?? {};
    const apifyRunId = notes.apify_run_id as string;
    const mode = notes.mode as string;

    let runMeta;
    try {
      runMeta = await apifyGetRun(apifyRunId, apifyToken);
    } catch {
      // Apify unreachable — leave row alone, try next poll.
      continue;
    }

    if (!isTerminalApifyStatus(runMeta.status)) continue;

    if (runMeta.status !== 'SUCCEEDED') {
      await supabase
        .from('bot_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: `Apify run ${runMeta.status}`,
          notes: { ...notes, apify_status: runMeta.status, apify_finished_at: runMeta.finishedAt },
        })
        .eq('id', row.id);
      continue;
    }

    // SUCCEEDED — fetch dataset items and process based on mode
    let items: unknown[];
    try {
      items = await apifyGetDatasetItems(runMeta.defaultDatasetId, apifyToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'dataset fetch failed';
      await supabase
        .from('bot_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: msg.slice(0, 1000),
          notes: { ...notes, apify_status: runMeta.status, apify_finished_at: runMeta.finishedAt },
        })
        .eq('id', row.id);
      continue;
    }

    if (mode === 'members_only_apify') {
      await processMembersResult(supabase, row, notes, items, runMeta);
    } else if (mode === 'avatar_backfill_apify') {
      await processBackfillResult(supabase, row, notes, items, runMeta);
    } else if (mode === 'engagement_events_apify') {
      await processEngagementResult(supabase, row, notes, items, runMeta);
    }
  }
}

async function processEngagementResult(
  supabase: SupabaseClient,
  row: BotRunsRow,
  notes: Record<string, unknown>,
  items: unknown[],
  runMeta: { finishedAt: string | null; status: string },
): Promise<void> {
  if (items.length === 0) {
    await markFailed(supabase, row, notes, runMeta, 'Apify dataset empty');
    return;
  }
  const result = items[0] as EngagementPageFunctionSuccess | PageFunctionError;
  if ('error' in result) {
    await markFailed(supabase, row, notes, runMeta, `pageFunction: ${result.error}`);
    return;
  }
  // Avatars piggy-backed on the engagement scrape. Write them first
  // (a single bulk upsert) so even users with zero recent activity
  // still get a fresh avatar out of this run.
  const avatarEntries = Object.entries(result.avatars ?? {}).filter(
    ([handle, url]) =>
      typeof handle === 'string' &&
      handle.length >= 2 &&
      typeof url === 'string' &&
      /^https?:\/\//.test(url)
  );
  if (avatarEntries.length > 0) {
    const avatarRows = avatarEntries.map(([handle, avatar_url]) => ({
      handle: handle.toLowerCase(),
      avatar_url,
    }));
    await supabase.rpc('admin_upsert_nmo_members', { p_members: avatarRows });
  }

  const events = Array.isArray(result.events) ? result.events : [];
  if (events.length === 0) {
    // Not a failure — the user may simply have no recent activity.
    await supabase
      .from('bot_runs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        posts_seen: 0,
        events_inserted: 0,
        error: null,
        notes: {
          ...notes,
          events_emitted: 0,
          events_inserted: 0,
          per_handle: result.per_handle ?? {},
          apify_finished_at: runMeta.finishedAt,
        },
      })
      .eq('id', row.id);
    return;
  }
  const { data: insertedCount, error: writeErr } = await supabase.rpc(
    'admin_upsert_engagement_events',
    { p_events: events },
  );
  if (writeErr) {
    await markFailed(supabase, row, notes, runMeta, `db_upsert_failed: ${writeErr.message}`);
    return;
  }
  const inserted = (insertedCount as number | null) ?? 0;
  await supabase
    .from('bot_runs')
    .update({
      status: 'success',
      finished_at: new Date().toISOString(),
      posts_seen: events.length,
      events_inserted: inserted,
      error: null,
      notes: {
        ...notes,
        events_emitted: events.length,
        events_inserted: inserted,
        per_handle: result.per_handle ?? {},
        apify_finished_at: runMeta.finishedAt,
      },
    })
    .eq('id', row.id);
}

async function processMembersResult(
  supabase: SupabaseClient,
  row: BotRunsRow,
  notes: Record<string, unknown>,
  items: unknown[],
  runMeta: { finishedAt: string | null; status: string },
): Promise<void> {
  if (items.length === 0) {
    await markFailed(supabase, row, notes, runMeta, 'Apify dataset empty');
    return;
  }
  const result = items[0] as MembersPageFunctionSuccess | PageFunctionError;
  if ('error' in result) {
    await markFailed(supabase, row, notes, runMeta, `pageFunction: ${result.error}`);
    return;
  }
  const members = Array.isArray(result.members) ? result.members : [];
  if (members.length === 0) {
    await markFailed(supabase, row, notes, runMeta, 'No members returned');
    return;
  }
  const { data: writeCount, error: writeErr } = await supabase.rpc(
    'admin_upsert_nmo_members',
    { p_members: members },
  );
  if (writeErr) {
    await markFailed(supabase, row, notes, runMeta, `db_upsert_failed: ${writeErr.message}`);
    return;
  }
  const written = (writeCount as number | null) ?? members.length;
  await supabase
    .from('bot_runs')
    .update({
      status: 'success',
      finished_at: new Date().toISOString(),
      posts_seen: 0,
      events_inserted: 0,
      error: null,
      notes: {
        ...notes,
        members_scraped: members.length,
        members_written: written,
        apify_finished_at: runMeta.finishedAt,
      },
    })
    .eq('id', row.id);
}

async function processBackfillResult(
  supabase: SupabaseClient,
  row: BotRunsRow,
  notes: Record<string, unknown>,
  items: unknown[],
  runMeta: { finishedAt: string | null; status: string },
): Promise<void> {
  if (items.length === 0) {
    await markFailed(supabase, row, notes, runMeta, 'Apify dataset empty');
    return;
  }
  const result = items[0] as BackfillPageFunctionSuccess | PageFunctionError;
  if ('error' in result) {
    await markFailed(supabase, row, notes, runMeta, `pageFunction: ${result.error}`);
    return;
  }
  const toWrite = (result.results || [])
    .filter((r) => r.avatar_url && /^https?:\/\//.test(r.avatar_url))
    .map((r) => ({ handle: r.handle, avatar_url: r.avatar_url }));

  let written = 0;
  if (toWrite.length > 0) {
    const { data: cnt, error: writeErr } = await supabase.rpc(
      'admin_upsert_nmo_members',
      { p_members: toWrite },
    );
    if (writeErr) {
      await markFailed(supabase, row, notes, runMeta, `db_upsert_failed: ${writeErr.message}`);
      return;
    }
    written = (cnt as number | null) ?? toWrite.length;
  }

  const errorCounts: Record<string, number> = {};
  for (const r of result.results || []) {
    if (r.error) errorCounts[r.error] = (errorCounts[r.error] || 0) + 1;
  }

  await supabase
    .from('bot_runs')
    .update({
      status: 'success',
      finished_at: new Date().toISOString(),
      posts_seen: 0,
      events_inserted: 0,
      error: null,
      notes: {
        ...notes,
        found: result.found,
        written,
        error_breakdown: errorCounts,
        apify_finished_at: runMeta.finishedAt,
      },
    })
    .eq('id', row.id);
}

async function markFailed(
  supabase: SupabaseClient,
  row: BotRunsRow,
  notes: Record<string, unknown>,
  runMeta: { finishedAt: string | null; status: string },
  err: string,
): Promise<void> {
  await supabase
    .from('bot_runs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error: err.slice(0, 1000),
      notes: { ...notes, apify_status: runMeta.status, apify_finished_at: runMeta.finishedAt },
    })
    .eq('id', row.id);
}
