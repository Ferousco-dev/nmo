// Vercel Cron: keeps Apify runs reconciled when no admin is on /admin.
//
// Without this cron, the reconciler only fires when /api/admin/bot/status
// is hit — which means a user clicking "Refresh activity" would see
// nothing happen until the next admin page-load.
//
// vercel.json registers this at `/api/cron/reconcile` on a 5-minute
// schedule (or whatever you set). Vercel sends an
// `Authorization: Bearer ${CRON_SECRET}` header on cron invocations;
// we reject anything else.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { reconcilePendingApifyRuns } from '@/lib/apify/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Allow unauthenticated invocations in dev only.
    return process.env.NODE_ENV !== 'production';
  }
  return req.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apifyToken = process.env.APIFY_TOKEN;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'missing_supabase_env', need: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
      { status: 500 }
    );
  }

  // Service-role client so the reconciler can write through RLS
  // without an admin's session cookie.
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Token can live in env OR app_settings; env wins, falls back.
  let token = apifyToken ?? null;
  if (!token) {
    const { data } = await supabase.rpc('admin_get_setting', { p_key: 'apify_token' });
    token = (data as string | null) ?? null;
  }
  if (!token) {
    return NextResponse.json({ ok: false, reason: 'no_apify_token' });
  }

  await reconcilePendingApifyRuns(supabase, token);

  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
