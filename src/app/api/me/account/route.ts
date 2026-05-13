// User-initiated account deletion.
//
// DELETE /api/me/account
//   1. Verifies the caller is authenticated.
//   2. Calls delete_my_account() RPC, which removes the profile row.
//      Cascading FKs clean up user_tasks, points_log, badges, etc.
//   3. Signs the user out so their cookie no longer resolves to a
//      now-orphaned auth.users row.
//
// The auth.users row itself is left in place (Supabase doesn't expose
// a portable SQL path to delete from the auth schema). Without a
// matching profiles row the user can't access any gated route — every
// page checks profile existence first.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const { error: rpcErr } = await supabase.rpc('delete_my_account');
  if (rpcErr) {
    return NextResponse.json(
      { error: 'delete_failed', detail: rpcErr.message },
      { status: 500 }
    );
  }

  // Best-effort sign-out. If this fails the cookie just expires
  // normally — the profile row is already gone.
  await supabase.auth.signOut().catch(() => {});

  return NextResponse.json({ ok: true });
}
