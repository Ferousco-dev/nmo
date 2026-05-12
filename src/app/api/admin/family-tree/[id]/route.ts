import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function assertAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: 'unauthenticated' as const };
  const { data } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return { supabase, error: 'forbidden' as const };
  return { supabase, error: null };
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, error: authErr } = await assertAdmin();
  if (authErr) {
    return NextResponse.json(
      { ok: false, error: authErr },
      { status: authErr === 'forbidden' ? 403 : 401 }
    );
  }

  const { error } = await supabase.from('family_tree').delete().eq('id', params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { supabase, error: authErr } = await assertAdmin();
  if (authErr) {
    return NextResponse.json(
      { ok: false, error: authErr },
      { status: authErr === 'forbidden' ? 403 : 401 }
    );
  }

  let body: { role?: string; region?: string | null; bio?: string | null; display_order?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.role === 'string' && body.role.trim()) patch.role = body.role.trim();
  if (body.region !== undefined) patch.region = body.region;
  if (body.bio !== undefined) patch.bio = body.bio;
  if (typeof body.display_order === 'number') patch.display_order = body.display_order;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'nothing_to_update' }, { status: 400 });
  }

  const { error } = await supabase.from('family_tree').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
