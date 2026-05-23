// First-login confirmation gate. Shown after a user completes Skool
// login but before they hit /questionnaire. Pulls the avatar + handle
// + name we got from Skool's API during login and asks "is this you?".
//
// On confirm → stamp profile.skool_identity_confirmed_at, redirect onward.
// On reject → sign out, back to /login.
//
// Subsequent logins skip this screen because the stamp is set.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConfirmIdentityClient } from './ConfirmIdentityClient';

export const dynamic = 'force-dynamic';

export default async function ConfirmIdentityPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'skool_handle, skool_avatar_url, skool_url, display_name, email, skool_identity_confirmed_at, onboarding_completed',
    )
    .eq('id', user.id)
    .maybeSingle();

  const p = profile as {
    skool_handle: string | null;
    skool_avatar_url: string | null;
    skool_url: string | null;
    display_name: string | null;
    email: string | null;
    skool_identity_confirmed_at: string | null;
    onboarding_completed: boolean | null;
  } | null;

  // Already confirmed → skip ahead.
  if (p?.skool_identity_confirmed_at) {
    redirect(p.onboarding_completed ? '/dashboard' : '/questionnaire');
  }

  return (
    <ConfirmIdentityClient
      handle={p?.skool_handle ?? null}
      avatarUrl={p?.skool_avatar_url ?? null}
      skoolUrl={p?.skool_url ?? null}
      displayName={p?.display_name ?? null}
      email={p?.email ?? null}
    />
  );
}
