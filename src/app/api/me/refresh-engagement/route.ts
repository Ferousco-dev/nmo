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
import { SCRAPE_PROFILE_ENGAGEMENT_PAGE_FUNCTION } from '@/lib/apify/scrape-profile-engagement-page-function';
import { apifyStartRun, ApifyError } from '@/lib/apify/api';

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

  // Cooldown: bail if there's a recent successful or pending run for
  // this user's handle. Cheaper than rate-limiting on Apify side.
  const cutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('bot_runs')
    .select('id, status, started_at, notes')
    .gte('started_at', cutoff)
    .order('started_at', { ascending: false })
    .limit(10);

  const cooled = (recent ?? []).find((r) => {
    const n = (r.notes ?? {}) as Record<string, unknown>;
    if (n.mode !== 'engagement_events_apify') return false;
    const list = n.explicit_handles;
    return Array.isArray(list) && list.includes(handle);
  });
  if (cooled) {
    return NextResponse.json(
      {
        ok: false,
        error: 'cooldown',
        recent_run_id: (cooled as { id: string }).id,
        recent_run_status: (cooled as { status: string }).status,
        hint: `Activity refreshes are throttled to once every ${COOLDOWN_MINUTES} minutes.`,
      },
      { status: 429 },
    );
  }

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

  // Run-level cost caps: 2 GB RAM (half default) + 4-min wall-clock.
  let runMeta;
  try {
    runMeta = await apifyStartRun(APIFY_ACTOR, actorInput, apifyToken!, {
      memoryMbytes: 2048,
      timeoutSecs: 240,
    });
  } catch (e: unknown) {
    if (e instanceof ApifyError) {
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
    return NextResponse.json({ error: 'apify_unreachable', detail: msg }, { status: 502 });
  }

  const { data: runRow } = await supabase
    .from('bot_runs')
    .insert({
      status: 'running',
      notes: {
        mode: 'engagement_events_apify',
        batch_size: 1,
        only_linked: true,
        triggered_by: 'user_self_refresh',
        explicit_handles: [handle],
        apify_run_id: runMeta.id,
      },
    })
    .select('id')
    .single();

  return NextResponse.json({
    ok: true,
    queued: true,
    run_id: (runRow as { id: string } | null)?.id ?? null,
    apify_run_id: runMeta.id,
    apify_status: runMeta.status,
    handle,
    hint: 'Refreshing your Skool activity. It should finish in ~1-2 minutes.',
  });
}
