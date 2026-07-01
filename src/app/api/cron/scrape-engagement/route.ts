// External cron: every 15 min via GitHub Actions
// (.github/workflows/scrape-engagement-cron.yml).
//
// Why not Vercel Cron? Hobby only allows daily. Rather than pay $20/mo
// for Pro, we ping this endpoint from GitHub Actions on a `*/15 * * * *`
// schedule — free tier is fine for our volume.
//
// This route does BOTH jobs each tick:
//   1. Reconcile any in-flight Apify runs — finalises bot_runs rows,
//      ingests datasets into engagement_events
//   2. Kick off a fresh batch of per-profile engagement scrapes
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` header. Configurable
// batch + skip-recent via env vars.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apifyStartRun, ApifyError } from '@/lib/apify/api';
import { reconcilePendingApifyRuns } from '@/lib/apify/reconcile';
import { SCRAPE_PROFILE_ENGAGEMENT_PAGE_FUNCTION } from '@/lib/apify/scrape-profile-engagement-page-function';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const APIFY_ACTOR = 'apify~playwright-scraper';
const COMMUNITY_SLUG = 'nmo';

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apifyToken = process.env.APIFY_TOKEN;
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!apifyToken) missing.push('APIFY_TOKEN');
  if (missing.length) {
    return NextResponse.json({ error: 'server_env_missing', missing }, { status: 500 });
  }

  const batch = parseInt(process.env.CRON_ENGAGEMENT_BATCH ?? '50', 10) || 50;
  // Runs every 15 min in prod (vercel.json). Each handle can be
  // refreshed at most once per hour so a user's post is visible on the
  // dashboard within ~1h worst-case. Set CRON_ENGAGEMENT_SKIP_HOURS
  // higher to save Apify credits, or lower for fresher data.
  const skipRecentHours = parseInt(process.env.CRON_ENGAGEMENT_SKIP_HOURS ?? '1', 10) || 1;

  const supabase = createClient(supabaseUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // STEP 1 — drain yesterday's in-flight Apify runs into the DB. On the
  // Hobby plan this is the only cron we get, so reconcile gets bundled
  // in. Errors here are non-fatal: even if reconcile is unhappy, we
  // still want today's batch to fire.
  let reconcileError: string | null = null;
  try {
    await reconcilePendingApifyRuns(supabase, apifyToken!);
  } catch (e) {
    reconcileError = e instanceof Error ? e.message : 'unknown';
  }

  // STEP 2 — pull skool creds for today's run (service role bypasses RLS).
  const [emailRow, pwRow] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'skool_email').maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'skool_password').maybeSingle(),
  ]);
  const skoolEmail = (emailRow.data as { value: string } | null)?.value ?? null;
  const skoolPassword = (pwRow.data as { value: string } | null)?.value ?? null;
  if (!skoolEmail || !skoolPassword) {
    return NextResponse.json(
      { error: 'settings_missing', missing: [!skoolEmail && 'skool_email', !skoolPassword && 'skool_password'].filter(Boolean) },
      { status: 412 },
    );
  }

  // Pick the next batch of handles to refresh — anyone whose latest
  // event landed > skipRecentHours ago. If everyone is fresh, we
  // no-op and wait for the next hour.
  const { data: handlesRes, error: handlesErr } = await supabase.rpc(
    'admin_handles_for_engagement',
    { p_limit: batch, p_only_linked: true, p_skip_recent_hours: skipRecentHours },
  );
  if (handlesErr) {
    return NextResponse.json({ error: 'handles_query_failed', detail: handlesErr.message }, { status: 500 });
  }
  const handles = ((handlesRes ?? []) as Array<{ handle: string }>).map((r) => r.handle);
  if (handles.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: 'all_handles_fresh',
      reconcile_error: reconcileError,
      at: new Date().toISOString(),
    });
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
    pageFunctionTimeoutSecs: 900,
    pageLoadTimeoutSecs: 120,
    maxRequestRetries: 0,
    customData: { skoolEmail, skoolPassword, handles, communitySlug: COMMUNITY_SLUG },
  };

  let runMeta;
  try {
    runMeta = await apifyStartRun(APIFY_ACTOR, actorInput, apifyToken!, {
      memoryMbytes: 2048,
      timeoutSecs: 1200,
    });
  } catch (e: unknown) {
    if (e instanceof ApifyError) {
      return NextResponse.json(
        { error: 'apify_run_failed', http: e.http, detail: e.bodyText.slice(0, 500) },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'apify_unreachable', detail: msg }, { status: 502 });
  }

  const { data: runRow } = await supabase
    .from('bot_runs')
    .insert({
      status: 'running',
      notes: {
        mode: 'engagement_events_apify',
        batch_size: handles.length,
        only_linked: true,
        trigger: 'cron_daily',
        apify_run_id: runMeta.id,
      },
    })
    .select('id')
    .single();

  return NextResponse.json({
    ok: true,
    queued: true,
    reconcile_error: reconcileError,
    run_id: (runRow as { id: string } | null)?.id ?? null,
    apify_run_id: runMeta.id,
    batch_size: handles.length,
    at: new Date().toISOString(),
  });
}
