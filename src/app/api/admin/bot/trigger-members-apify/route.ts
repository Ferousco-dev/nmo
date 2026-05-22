// Admin-only: kicks off the Apify members scrape ASYNCHRONOUSLY.
//
// Returns within ~1-3s with the bot_runs id and the apify_run_id.
// The actual scrape runs in Apify's cloud (typically 30-90s); when
// it finishes, the next /admin/bot/status poll picks it up via
// reconcilePendingApifyRuns(), fetches the dataset, upserts to
// nmo_members, and flips the bot_runs row to status='success'.
//
// Why async: synchronous run-sync was blowing past browser/proxy
// idle timeouts on long runs (3-7+ min), causing "ghost failures"
// where Apify completed cleanly but our server never saw the
// response. Async keeps every individual HTTP request short.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SCRAPE_MEMBERS_PAGE_FUNCTION } from '@/lib/apify/scrape-members-page-function';
import { apifyStartRun, ApifyError } from '@/lib/apify/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const APIFY_ACTOR = 'apify~playwright-scraper';
const COMMUNITY_SLUG = 'nmo';

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: 'not_authenticated' };
  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return { ok: false as const, status: 403, error: 'not_admin' };
  return { ok: true as const, supabase, user };
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // 1. Pull credentials
  const [tokenRes, emailRes, pwRes] = await Promise.all([
    auth.supabase.rpc('admin_get_setting', { p_key: 'apify_token' }),
    auth.supabase.rpc('admin_get_setting', { p_key: 'skool_email' }),
    auth.supabase.rpc('admin_get_setting', { p_key: 'skool_password' }),
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
      { error: 'settings_missing', missing, hint: 'Set in /admin → Integrations.' },
      { status: 412 },
    );
  }

  // 2. Build actor input
  const actorInput = {
    startUrls: [{ url: 'https://www.skool.com/login' }],
    pseudoUrls: [],
    linkSelector: '',
    keepUrlFragments: false,
    pageFunction: SCRAPE_MEMBERS_PAGE_FUNCTION,
    proxyConfiguration: { useApifyProxy: true },
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
    pageFunctionTimeoutSecs: 240,
    pageLoadTimeoutSecs: 60,
    maxRequestRetries: 0,
    customData: { skoolEmail, skoolPassword, communitySlug: COMMUNITY_SLUG },
  };

  // 3. Fire async run — 2 GB RAM (half the Playwright default → half the
  // CU cost) and a hard 10-min wall-clock so a stuck run can't bleed.
  let runMeta;
  try {
    runMeta = await apifyStartRun(APIFY_ACTOR, actorInput, apifyToken!, {
      memoryMbytes: 2048,
      timeoutSecs: 600,
    });
  } catch (e: unknown) {
    if (e instanceof ApifyError) {
      return NextResponse.json(
        {
          error: 'apify_run_failed',
          http: e.http,
          detail: e.bodyText.slice(0, 500),
          approvalUrl: e.approvalUrl,
          hint: e.approvalUrl
            ? `One-time consent: open ${e.approvalUrl} → Approve → click again.`
            : e.http === 401 || e.http === 403
            ? 'Check apify_token in /admin → Integrations'
            : undefined,
        },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'apify_unreachable', detail: msg }, { status: 502 });
  }

  // 4. Open bot_runs row tagged with the apify_run_id so the
  //    reconciler in /status can find it.
  const { data: runRow } = await auth.supabase
    .from('bot_runs')
    .insert({
      status: 'running',
      notes: { mode: 'members_only_apify', apify_run_id: runMeta.id },
    })
    .select('id')
    .single();

  return NextResponse.json({
    ok: true,
    queued: true,
    run_id: (runRow as { id: string } | null)?.id ?? null,
    apify_run_id: runMeta.id,
    apify_status: runMeta.status,
    hint: 'Run kicked off in Apify cloud. Status will update automatically.',
  });
}
