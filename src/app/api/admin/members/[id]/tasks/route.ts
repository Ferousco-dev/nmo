// Admin-only: list a member's roadmap tasks, or create a new one.
//
// GET  → all rows for the member, ordered by day then created
// POST → insert a new task. Body: { day_number, task_title, task_description?, skool_lesson_url?, task_id? }
//
// Auth: middleware gates /admin/* + every RPC is SECURITY DEFINER with
// is_admin() check, so this route can use the user's session client.

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

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc('admin_list_user_tasks', {
    p_user_id: params.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tasks: data ?? [] });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });
  }

  let body: {
    day_number?: number;
    task_title?: string;
    task_description?: string | null;
    skool_lesson_url?: string | null;
    task_id?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc('admin_upsert_user_task', {
    p_id: null,
    p_user_id: params.id,
    p_day_number: body.day_number,
    p_task_title: body.task_title,
    p_task_description: body.task_description ?? null,
    p_skool_lesson_url: body.skool_lesson_url ?? null,
    p_task_id: body.task_id ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, task: data });
}
