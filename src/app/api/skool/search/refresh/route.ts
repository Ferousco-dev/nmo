// Public-facing fallback for the welcome search flow.
//
// When the local nmo_members table doesn't contain a user yet (e.g. they
// just joined Skool and the periodic Apify reconcile hasn't caught up),
// the WelcomeSearch UI surfaces a "Search Again" button. That button hits
// POST here to kick off an Apify members scrape, then polls GET to find
// out when the scrape lands and the user has been upserted.
//
// Unlike /api/admin/bot/trigger-members-apify, this route is public
// (anonymous users finding themselves on first visit can't be authed
// yet). To keep this from burning Apify quota:
//   - in-flight runs are reused: if a members_only_apify run is already
//     'running', POST returns its id instead of starting a new one
//   - recent successes are reused: if one succeeded < REUSE_RECENT_MS ago,
//     we return a sentinel so the UI can prompt the user to just retry
//     their search instead of paying for another scrape
//
// Service-role Supabase client is used because anonymous callers can't
// invoke `admin_get_setting` and can't read `app_settings` under RLS.

import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { apifyStartRun, ApifyError } from '@/lib/apify/api';
import { reconcilePendingApifyRuns } from '@/lib/apify/reconcile';
import { SCRAPE_MEMBERS_PAGE_FUNCTION } from '@/lib/apify/scrape-members-page-function';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const APIFY_ACTOR = 'apify~playwright-scraper';
const COMMUNITY_SLUG = 'nmo';
const MODE = 'members_only_apify';

// If a run finished within this window, treat the DB as "already fresh"
// and don't kick off another scrape.
const REUSE_RECENT_MS = 5 * 60 * 1000;

const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 8;

interface ServiceClientResult {
  supabase: SupabaseClient;
  apifyToken: string;
}

async function getServiceClient(): Promise<
  | { ok: true; client: ServiceClientResult }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apifyToken = process.env.APIFY_TOKEN;
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!apifyToken) missing.push('APIFY_TOKEN');
  if (missing.length) {
    return {
      ok: false,
      status: 500,
      body: { error: 'server_env_missing', missing },
    };
  }
  const supabase = createClient(supabaseUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { ok: true, client: { supabase, apifyToken: apifyToken! } };
}

// POST — kick off (or piggyback on) an Apify members scrape.
export async function POST() {
  const svc = await getServiceClient();
  if (!svc.ok) return NextResponse.json(svc.body, { status: svc.status });
  const { supabase, apifyToken } = svc.client;

  // 1. Already-running? Return that run id.
  const { data: runningRows } = await supabase
    .from('bot_runs')
    .select('id, started_at, notes')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(10);
  const inflight = (runningRows ?? []).find((r) => {
    const n = (r as { notes?: Record<string, unknown> }).notes;
    return (
      n &&
      typeof n === 'object' &&
      (n as Record<string, unknown>).mode === MODE &&
      typeof (n as Record<string, unknown>).apify_run_id === 'string'
    );
  });
  if (inflight) {
    const notes = (inflight as { notes: Record<string, unknown> }).notes;
    return NextResponse.json({
      ok: true,
      queued: false,
      reused: 'inflight',
      run_id: (inflight as { id: string }).id,
      apify_run_id: notes.apify_run_id as string,
    });
  }

  // 2. Just finished? Skip the scrape, tell the UI to retry the DB search.
  const { data: recentRows } = await supabase
    .from('bot_runs')
    .select('id, finished_at, notes')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(5);
  const recent = (recentRows ?? []).find((r) => {
    const row = r as { finished_at: string | null; notes?: Record<string, unknown> };
    const n = row.notes;
    if (!n || typeof n !== 'object') return false;
    if ((n as Record<string, unknown>).mode !== MODE) return false;
    if (!row.finished_at) return false;
    return Date.now() - new Date(row.finished_at).getTime() < REUSE_RECENT_MS;
  });
  if (recent) {
    return NextResponse.json({
      ok: true,
      queued: false,
      reused: 'recent_success',
      run_id: (recent as { id: string }).id,
      finished_at: (recent as { finished_at: string }).finished_at,
    });
  }

  // 3. Need a fresh run — pull skool creds and fire.
  const [emailRow, pwRow] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'skool_email').maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'skool_password').maybeSingle(),
  ]);
  const skoolEmail = (emailRow.data as { value: string } | null)?.value ?? null;
  const skoolPassword = (pwRow.data as { value: string } | null)?.value ?? null;
  const missing: string[] = [];
  if (!skoolEmail) missing.push('skool_email');
  if (!skoolPassword) missing.push('skool_password');
  if (missing.length) {
    return NextResponse.json(
      { error: 'settings_missing', missing },
      { status: 412 },
    );
  }

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

  let runMeta;
  try {
    runMeta = await apifyStartRun(APIFY_ACTOR, actorInput, apifyToken, {
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
      notes: { mode: MODE, apify_run_id: runMeta.id, trigger: 'welcome_search_refresh' },
    })
    .select('id')
    .single();

  return NextResponse.json({
    ok: true,
    queued: true,
    run_id: (runRow as { id: string } | null)?.id ?? null,
    apify_run_id: runMeta.id,
    apify_status: runMeta.status,
  });
}

// GET ?runId=...&q=... — reconcile, return run status + (when finished)
// the result of re-running the welcome search against the now-updated DB.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get('runId');
  const q = (url.searchParams.get('q') ?? '').trim();

  const svc = await getServiceClient();
  if (!svc.ok) return NextResponse.json(svc.body, { status: svc.status });
  const { supabase, apifyToken } = svc.client;

  // Try to drive the run toward terminal state.
  try {
    await reconcilePendingApifyRuns(supabase, apifyToken);
  } catch {
    // Reconciler errors shouldn't break the poll — surface run state from
    // the DB even if Apify is unreachable this tick.
  }

  if (!runId) {
    return NextResponse.json({ ok: false, error: 'missing_runId' }, { status: 400 });
  }

  const { data: runRow } = await supabase
    .from('bot_runs')
    .select('id, status, started_at, finished_at, error, notes')
    .eq('id', runId)
    .maybeSingle();
  if (!runRow) {
    return NextResponse.json({ ok: false, error: 'run_not_found' }, { status: 404 });
  }

  const run = runRow as {
    id: string;
    status: string;
    started_at: string | null;
    finished_at: string | null;
    error: string | null;
    notes: Record<string, unknown> | null;
  };

  const base = {
    ok: true,
    run_id: run.id,
    status: run.status,
    started_at: run.started_at,
    finished_at: run.finished_at,
  } as const;

  if (run.status === 'running') {
    return NextResponse.json(base);
  }

  if (run.status === 'failed') {
    return NextResponse.json({ ...base, error: run.error });
  }

  // SUCCESS — re-run the welcome search against the freshly-upserted DB.
  let results: Array<{
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
    level: number | null;
  }> = [];
  if (q.length >= MIN_QUERY_LEN) {
    const tokens = q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[\\%_]/g, (c) => '\\' + c));
    if (tokens.length > 0) {
      const pattern = `%${tokens.join('%')}%`;
      const { data } = await supabase
        .from('nmo_members')
        .select('handle, display_name, avatar_url, level')
        .or(`display_name.ilike.${pattern},handle.ilike.${pattern}`)
        .order('level', { ascending: false, nullsFirst: false })
        .limit(MAX_RESULTS);
      results = (data ?? []).map((m) => {
        const r = m as {
          handle: string;
          display_name: string | null;
          avatar_url: string | null;
          level: number | null;
        };
        return {
          handle: r.handle,
          displayName: r.display_name,
          avatarUrl: r.avatar_url,
          level: r.level,
        };
      });
    }
  }

  return NextResponse.json({ ...base, results });
}
