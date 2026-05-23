// Stamp skool_identity_confirmed_at on the caller's profile after
// they've seen the confirm screen on first login and clicked "Yes,
// that's me". Idempotent — re-calls are a no-op (we don't overwrite
// an existing stamp).
//
// Returns the next path so the page can navigate cleanly.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('skool_identity_confirmed_at, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();
  const p = profile as {
    skool_identity_confirmed_at: string | null;
    onboarding_completed: boolean | null;
  } | null;

  if (!p?.skool_identity_confirmed_at) {
    await supabase
      .from('profiles')
      .update({ skool_identity_confirmed_at: new Date().toISOString() })
      .eq('id', user.id);
  }

  const nextPath = p?.onboarding_completed === true ? '/dashboard' : '/questionnaire';
  return NextResponse.json({ ok: true, nextPath });
}
