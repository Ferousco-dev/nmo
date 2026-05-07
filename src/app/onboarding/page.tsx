import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingClient } from '@/components/onboarding/OnboardingClient';

export default async function OnboardingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single();

  if (profile?.onboarding_completed) redirect('/dashboard');

  return <OnboardingClient />;
}
