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

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export async function POST(req: Request) {
  const { supabase, error: authErr } = await assertAdmin();
  if (authErr) {
    return NextResponse.json(
      { ok: false, error: authErr },
      { status: authErr === 'forbidden' ? 403 : 401 }
    );
  }

  let body: {
    skool_handle?: string;
    role?: string;
    region?: string | null;
    bio?: string | null;
    display_order?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const handle = normalizeHandle(body.skool_handle ?? '');
  const role = (body.role ?? '').trim();
  if (!handle || handle.length < 2) {
    return NextResponse.json({ ok: false, error: 'missing_handle' }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ ok: false, error: 'missing_role' }, { status: 400 });
  }

  // Pull the live member from nmo_members so name + avatar match Skool.
  // If the handle isn't in nmo_members yet, accept the row anyway with
  // handle as a placeholder name — the next sync run will fill it.
  const { data: member } = await supabase
    .from('nmo_members')
    .select('handle, display_name, avatar_url')
    .eq('handle', handle)
    .maybeSingle();

  const name = (member?.display_name || handle).toString();
  const photoUrl = member?.avatar_url ?? null;

  // Default display_order = max + 1 so new rows show at the end of
  // their tier unless the admin overrides.
  let displayOrder = body.display_order;
  if (displayOrder == null) {
    const { data: maxRow } = await supabase
      .from('family_tree')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    displayOrder = ((maxRow?.display_order as number | undefined) ?? 0) + 1;
  }

  const { data: inserted, error } = await supabase
    .from('family_tree')
    .insert({
      name,
      role,
      region: body.region ?? null,
      bio: body.bio ?? null,
      photo_url: photoUrl,
      skool_handle: handle,
      display_order: displayOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, member: inserted });
}

export async function GET() {
  const { supabase, error: authErr } = await assertAdmin();
  if (authErr) {
    return NextResponse.json(
      { ok: false, error: authErr },
      { status: authErr === 'forbidden' ? 403 : 401 }
    );
  }

  const { data, error } = await supabase
    .from('family_tree')
    .select('id, name, role, region, photo_url, skool_handle, bio, display_order, created_at')
    .order('display_order', { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, members: data ?? [] });
}
