import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { QuestionnaireClient } from '@/components/questionnaire/QuestionnaireClient';

export const dynamic = 'force-dynamic';

export default async function QuestionnairePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // If they've already finished onboarding, skip straight to dashboard
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single();
  if (profile?.onboarding_completed) {
    redirect('/dashboard');
  }

  return <QuestionnaireClient />;
}
