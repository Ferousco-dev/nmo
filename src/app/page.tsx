// Entry point. Signup is dead; everyone goes through Skool credentials.
//
//   - Not signed in → /login
//   - Signed in + identity not confirmed yet → /confirm-identity
//   - Signed in + confirmed + onboarding incomplete → /questionnaire
//   - Signed in + fully onboarded → /dashboard

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('skool_identity_confirmed_at, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.skool_identity_confirmed_at) {
    redirect('/confirm-identity');
  }
  if (!profile.onboarding_completed) {
    redirect('/questionnaire');
  }
  redirect('/dashboard');
}
