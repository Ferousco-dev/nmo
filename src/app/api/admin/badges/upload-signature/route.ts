// Admin-only: returns a signed Cloudinary upload envelope so the
// browser can POST the badge image directly to Cloudinary. Server
// never sees the file bytes — only signs, then receives the resulting
// URL when the admin submits the create-badge form.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildSignedUpload } from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 });
  }

  let hint = 'badge';
  try {
    const body = (await req.json()) as { hint?: string };
    if (typeof body?.hint === 'string' && body.hint.trim().length > 0) {
      hint = body.hint.trim();
    }
  } catch {
    // No body / invalid JSON — use default hint.
  }

  try {
    const signed = buildSignedUpload(hint);
    return NextResponse.json({ ok: true, ...signed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
