// Per-user manual refresh: scrapes the caller's Skool profile for
// new posts/comments/replies and inserts into engagement_events.
//
// Returns within ~1-3s with the bot_runs id and the apify_run_id.
// The reconciler in /api/admin/bot/status finishes the row when
// Apify completes (~30-90s for one profile). The dashboard reads
// from engagement_grades, so as soon as the events land, the new
// totals show up on next page load.
//
// Rate-limited per user via a recent-success / recent-running check
// so a user smashing the button doesn't queue ten Apify runs.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { SCRAPE_PROFILE_ENGAGEMENT_PAGE_FUNCTION } from '@/lib/apify/scrape-profile-engagement-page-function';
import { apifyStartRun, ApifyError } from '@/lib/apify/api';
import { reconcilePendingApifyRuns } from '@/lib/apify/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const APIFY_ACTOR = 'apify~playwright-scraper';
const COMMUNITY_SLUG = 'nmo';
const COOLDOWN_MINUTES = 10;

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  // Pull the caller's handle.
  const { data: profile } = await supabase
    .from('profiles')
    .select('skool_handle')
    .eq('id', user.id)
    .single();
  const rawHandle = (profile?.skool_handle as string | undefined) ?? '';
  const handle = rawHandle.trim().replace(/^@+/, '').toLowerCase();
  if (!handle || !/^[a-z0-9._-]{2,40}$/.test(handle)) {
    return NextResponse.json(
      { error: 'no_handle', hint: 'Link your Skool handle first.' },
      { status: 400 },
    );
  }

  // Atomic cooldown check + slot reservation. The RPC locks bot_runs,
  // checks for a recent run, and inserts a 'running' placeholder in a
  // single transaction. This closes the TOCTOU race where two parallel
  // requests (login + dashboard mount, observed ~40ms apart in tests)
  // both passed the cooldown check and both queued Apify runs.
  const { data: reservation, error: reserveErr } = await supabase.rpc(
    'reserve_engagement_run',
    { p_handle: handle, p_cooldown_minutes: COOLDOWN_MINUTES },
  );
  if (reserveErr || !reservation || !Array.isArray(reservation) || reservation.length === 0) {
    return NextResponse.json(
      { error: 'reserve_failed', detail: reserveErr?.message ?? null },
      { status: 500 },
    );
  }
  const reserved = reservation[0] as {
    bot_run_id: string | null;
    cooldown_active: boolean;
    recent_run_id: string | null;
    recent_status: string | null;
  };
  if (reserved.cooldown_active) {
    return NextResponse.json(
      {
        ok: false,
        error: 'cooldown',
        recent_run_id: reserved.recent_run_id,
        recent_run_status: reserved.recent_status,
        hint: `Activity refreshes are throttled to once every ${COOLDOWN_MINUTES} minutes.`,
      },
      { status: 429 },
    );
  }
  const reservedRunId = reserved.bot_run_id as string;

  // Pull integration credentials. These live in app_settings (set in
  // /admin → Integrations) — same source the admin trigger uses.
  const [tokenRes, emailRes, pwRes] = await Promise.all([
    supabase.rpc('admin_get_setting', { p_key: 'apify_token' }),
    supabase.rpc('admin_get_setting', { p_key: 'skool_email' }),
    supabase.rpc('admin_get_setting', { p_key: 'skool_password' }),
  ]);
  const apifyToken = (tokenRes.data as string | null) ?? null;
  const skoolEmail = (emailRes.data as string | null) ?? null;
  const skoolPassword = (pwRes.data as string | null) ?? null;
  const missing: string[] = [];
  if (!apifyToken) missing.push('apify_token');
  if (!skoolEmail) missing.push('skool_email');
  if (!skoolPassword) missing.push('skool_password');
  if (missing.length) {
    return NextResponse.json(
      {
        error: 'settings_missing',
        missing,
        hint: 'An admin needs to fill these in /admin → Integrations.',
      },
      { status: 412 },
    );
  }

  const actorInput = {
    startUrls: [{ url: 'https://www.skool.com/login' }],
    pseudoUrls: [],
    linkSelector: '',
    keepUrlFragments: false,
    pageFunction: SCRAPE_PROFILE_ENGAGEMENT_PAGE_FUNCTION,
    proxyConfiguration: { useApifyProxy: true },
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
    // Single profile: login (~20s) + scrape (~30s) + buffer.
    pageFunctionTimeoutSecs: 180,
    pageLoadTimeoutSecs: 45,
    maxRequestRetries: 0,
    customData: { skoolEmail, skoolPassword, handles: [handle], communitySlug: COMMUNITY_SLUG },
  };

  // Helper: mark our reserved slot failed so the cooldown clears and
  // the user can retry without waiting for the reconciler's stall
  // sweep (5 min).
  const markReservedRunFailed = async (errorMessage: string) => {
    const url2 = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key2 = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url2 || !key2 || !reservedRunId) return;
    const svc = createServiceClient(url2, key2, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await svc
      .from('bot_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: errorMessage.slice(0, 500),
      })
      .eq('id', reservedRunId);
  };

  // Run-level cost caps: 2 GB RAM (half default) + 4-min wall-clock.
  let runMeta;
  try {
    runMeta = await apifyStartRun(APIFY_ACTOR, actorInput, apifyToken!, {
      memoryMbytes: 2048,
      timeoutSecs: 240,
    });
  } catch (e: unknown) {
    if (e instanceof ApifyError) {
      await markReservedRunFailed(`apify_run_failed: ${e.bodyText.slice(0, 200)}`);
      return NextResponse.json(
        {
          error: 'apify_run_failed',
          http: e.http,
          detail: e.bodyText.slice(0, 500),
          approvalUrl: e.approvalUrl,
        },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : 'unknown';
    await markReservedRunFailed(`apify_unreachable: ${msg}`);
    return NextResponse.json({ error: 'apify_unreachable', detail: msg }, { status: 502 });
  }

  // Attach the apify_run_id to the bot_runs slot we already reserved
  // atomically via reserve_engagement_run(). The notes column needs
  // service-role to update (RLS is SELECT-only).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey && reservedRunId) {
    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: updateErr } = await service
      .from('bot_runs')
      .update({
        notes: {
          mode: 'engagement_events_apify',
          batch_size: 1,
          only_linked: true,
          triggered_by: 'user_self_refresh',
          explicit_handles: [handle],
          apify_run_id: runMeta.id,
        },
      })
      .eq('id', reservedRunId);
    if (updateErr) {
      console.error('[refresh-engagement] bot_runs update failed', updateErr.message);
    }
  }

  // Sweep any earlier Apify runs that have finished but haven't been
  // ingested yet. Without this, the dataset sits in Apify until someone
  // visits /admin or the daily cron fires — which means after a user
  // posts on Skool + triggers a refresh + waits, they still don't see
  // it on the dashboard until they navigate to /admin.
  //
  // Fire-and-forget so this doesn't slow the response. Errors are
  // swallowed inside the reconciler.
  if (supabaseUrl && serviceKey) {
    const svc = createServiceClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    void reconcilePendingApifyRuns(svc, apifyToken!).catch((e) => {
      console.error('[refresh-engagement] reconciler sweep failed', e);
    });
  }

  return NextResponse.json({
    ok: true,
    queued: true,
    run_id: reservedRunId,
    apify_run_id: runMeta.id,
    apify_status: runMeta.status,
    handle,
    hint: 'Refreshing your Skool activity. It should finish in ~1-2 minutes.',
  });
}
