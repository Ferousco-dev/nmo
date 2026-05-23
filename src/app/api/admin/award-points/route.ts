// Super-admin manual point award. Calls the admin_award_points RPC,
// which itself enforces is_super_admin() — so even if a regular
// admin learns the route, they'll get not_super_admin back from the
// RPC. Belt-and-braces: we also check is_super_admin here so the UI
// can hide affordances cleanly.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  }

  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('is_super_admin')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!(adminRow as { is_super_admin: boolean | null } | null)?.is_super_admin) {
    return NextResponse.json({ ok: false, error: 'not_super_admin' }, { status: 403 });
  }

  let body: { user_id?: unknown; points?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const targetUserId = typeof body.user_id === 'string' ? body.user_id : '';
  const points = typeof body.points === 'number' ? Math.trunc(body.points) : NaN;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: 'missing_user' }, { status: 400 });
  }
  if (!Number.isFinite(points) || points === 0) {
    return NextResponse.json({ ok: false, error: 'invalid_points' }, { status: 400 });
  }
  // Soft cap so a fat-finger doesn't grant a million points
  if (Math.abs(points) > 10000) {
    return NextResponse.json({ ok: false, error: 'too_many_points' }, { status: 400 });
  }

  const { error: rpcErr } = await supabase.rpc('admin_award_points', {
    p_user_id: targetUserId,
    p_points: points,
    p_reason: reason || null,
  });
  if (rpcErr) {
    return NextResponse.json(
      { ok: false, error: 'rpc_failed', detail: rpcErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, awarded: points, user_id: targetUserId });
}
