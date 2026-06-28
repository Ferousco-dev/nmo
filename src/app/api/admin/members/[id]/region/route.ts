// Admin-only: assign (or clear) a region for one member.
//
// PUT → body: { region_id: string | null }

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isUuid(params.id)) return NextResponse.json({ error: 'invalid_member_id' }, { status: 400 });

  let body: { region_id?: string | null };
  try { body = await req.json(); } catch { body = {}; }

  const rid = body.region_id;
  if (rid !== null && rid !== undefined && !isUuid(rid)) {
    return NextResponse.json({ error: 'invalid_region_id' }, { status: 400 });
  }

  const { error } = await auth.supabase.rpc('admin_set_member_region', {
    p_user_id: params.id,
    p_region_id: rid ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
