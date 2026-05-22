// Admin-only: kicks off the avatar-backfill scrape ASYNCHRONOUSLY.
//
// Same async pattern as trigger-members-apify. Returns ~1-3s with
// the bot_runs id; reconciler in /status fetches the dataset when
// Apify finishes (typically 7-15 min for 200 profiles) and writes
// to nmo_members.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SCRAPE_PROFILE_AVATARS_PAGE_FUNCTION } from '@/lib/apify/scrape-profile-avatars-page-function';
import { apifyStartRun, ApifyError } from '@/lib/apify/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const APIFY_ACTOR = 'apify~playwright-scraper';
const COMMUNITY_SLUG = 'nmo';
const DEFAULT_BATCH = 200;
const MAX_BATCH = 500;

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

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const requested = parseInt(searchParams.get('limit') || '', 10);
  const batch = Math.max(1, Math.min(MAX_BATCH, isNaN(requested) ? DEFAULT_BATCH : requested));

  // 1. Credentials
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
      { error: 'settings_missing', missing, hint: 'Set these in /admin → Integrations.' },
      { status: 412 },
    );
  }

  // 2. Handles to backfill
  const { data: handlesRes, error: handlesErr } = await auth.supabase.rpc(
    'admin_handles_missing_avatar',
    { p_limit: batch },
  );
  if (handlesErr) {
    return NextResponse.json({ error: 'handles_query_failed', detail: handlesErr.message }, { status: 500 });
  }
  const handles = ((handlesRes ?? []) as Array<{ handle: string }>).map(r => r.handle);
  if (handles.length === 0) {
    return NextResponse.json({ ok: true, message: 'No missing avatars to backfill.', batch_size: 0 });
  }

  // 3. Actor input
  const actorInput = {
    startUrls: [{ url: 'https://www.skool.com/login' }],
    pseudoUrls: [],
    linkSelector: '',
    keepUrlFragments: false,
    pageFunction: SCRAPE_PROFILE_AVATARS_PAGE_FUNCTION,
    proxyConfiguration: { useApifyProxy: true },
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
    // 200 profiles × ~3s + ~30s login + buffer = 15 min budget. The
    // 1500s ceiling we had before was the actor's default unlimited.
    pageFunctionTimeoutSecs: 900,
    pageLoadTimeoutSecs: 45,
    maxRequestRetries: 0,
    customData: { skoolEmail, skoolPassword, handles, communitySlug: COMMUNITY_SLUG },
  };

  // 4. Fire async run — half the default RAM + a hard wall-clock cap
  // so a stuck run can't burn unlimited compute units.
  let runMeta;
  try {
    runMeta = await apifyStartRun(APIFY_ACTOR, actorInput, apifyToken!, {
      memoryMbytes: 2048,
      timeoutSecs: 1200,
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
            : undefined,
        },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'apify_unreachable', detail: msg }, { status: 502 });
  }

  // 5. bot_runs row with the apify_run_id so the reconciler can claim it
  const { data: runRow } = await auth.supabase
    .from('bot_runs')
    .insert({
      status: 'running',
      notes: {
        mode: 'avatar_backfill_apify',
        batch_size: handles.length,
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
    batch_size: handles.length,
    hint: `Backfilling ${handles.length} profiles. Status will update automatically (~7-15 min).`,
  });
}
