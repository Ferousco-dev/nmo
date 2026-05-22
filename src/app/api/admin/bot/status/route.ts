// Admin-only: returns recent bot_runs + nmo_members snapshot.
//
// Used by the admin dashboard to monitor the Apify-driven sync.
// Reconciles any in-flight Apify runs first (so the runs list we
// return reflects the latest state) then reads recent runs.
//
// No external bot server is involved — every job runs on Apify and
// is reconciled inside this route on each poll. If you need a
// scheduled reconciliation (so admins don't have to keep /admin
// open), add a Vercel Cron entry pointing at /api/cron/reconcile.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { reconcilePendingApifyRuns } from '@/lib/apify/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The reconciler may make 1-2 Apify API calls per pending run. Cap
// the per-poll work at 5 pending runs (inside the reconciler) and
// give the route enough time for those round-trips on slow networks.
export const maxDuration = 60;

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
  return { ok: true as const, supabase };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Reconcile any pending Apify runs FIRST, so the runs list we
  // return reflects the latest state. Errors here are swallowed —
  // the recent-runs list is still useful even if Apify is unreachable.
  try {
    const { data: tokenRow } = await auth.supabase.rpc('admin_get_setting', {
      p_key: 'apify_token',
    });
    const apifyToken = (tokenRow as string | null) ?? null;
    if (apifyToken) {
      await reconcilePendingApifyRuns(auth.supabase, apifyToken);
    }
  } catch {
    // Don't let reconciler errors break the status page
  }

  // Recent runs from DB
  const { data: runs } = await auth.supabase
    .from('bot_runs')
    .select('id, started_at, finished_at, status, posts_seen, events_inserted, error, notes')
    .order('started_at', { ascending: false })
    .limit(10);

  // nmo_members snapshot — total roster size + most-recent refresh
  // timestamp + how many rows are linked to a real signed-up profile
  // via profiles.skool_handle + how many rows are missing avatar_url
  // (drives the "Backfill avatars" button label).
  const [
    { count: nmoTotal },
    { data: latestSeen },
    { count: linkedCount },
    { count: missingAvatarCount },
  ] = await Promise.all([
    auth.supabase.from('nmo_members').select('handle', { count: 'exact', head: true }),
    auth.supabase
      .from('nmo_members')
      .select('last_seen_at')
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    auth.supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .not('skool_handle', 'is', null),
    auth.supabase
      .from('nmo_members')
      .select('handle', { count: 'exact', head: true })
      .is('avatar_url', null),
  ]);
  const nmoMembers = {
    total: nmoTotal ?? 0,
    most_recent_seen_at:
      (latestSeen as { last_seen_at: string | null } | null)?.last_seen_at ?? null,
    linked_profiles: linkedCount ?? 0,
    missing_avatar: missingAvatarCount ?? 0,
  };

  // Health summary from the recent runs
  const recent5 = (runs ?? []).slice(0, 5);
  const successes5 = recent5.filter(r => r.status === 'success').length;
  const failures5 = recent5.filter(r => r.status === 'failed').length;
  const last = (runs ?? [])[0];

  let health: 'green' | 'amber' | 'red' | 'gray' = 'gray';
  if (last) {
    if (last.status === 'success') health = 'green';
    else if (failures5 >= 3) health = 'red';
    else health = 'amber';
  }

  // Are any runs currently in-flight? Pull from bot_runs.
  const { data: runningRows } = await auth.supabase
    .from('bot_runs')
    .select('id, started_at, notes')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1);
  const runningRow = (runningRows ?? [])[0] as
    | { id: string; started_at: string; notes: Record<string, unknown> | null }
    | undefined;

  const inflight = runningRow
    ? {
        running: true,
        run_id: runningRow.id,
        apify_run_id: (runningRow.notes?.apify_run_id as string | undefined) ?? null,
        mode: (runningRow.notes?.mode as string | undefined) ?? null,
        elapsed_seconds: Math.floor(
          (Date.now() - new Date(runningRow.started_at).getTime()) / 1000
        ),
      }
    : { running: false, run_id: null, apify_run_id: null, mode: null, elapsed_seconds: null };

  return NextResponse.json({
    ok: true,
    health,
    successes5,
    failures5,
    inflight,
    runs: runs ?? [],
    nmo_members: nmoMembers,
  });
}
