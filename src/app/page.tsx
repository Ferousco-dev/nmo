import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WelcomeSearch } from '@/components/welcome/WelcomeSearch';

export const dynamic = 'force-dynamic';

// Flow:
//   - not signed in              → show WelcomeSearch (find-yourself-in-Skool)
//   - signed in + questionnaire incomplete → /questionnaire
//   - signed in + onboarded     → /dashboard
//
// The legacy /onboarding screen is no longer in the user journey —
// /questionnaire handles all new-user setup.
export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single();
    redirect(profile?.onboarding_completed ? '/dashboard' : '/questionnaire');
  }

  // Public landing: rounded community count + a small avatar gallery
  // pulled from nmo_members for social proof.
  const [{ count }, { data: gallery }] = await Promise.all([
    supabase
      .from('nmo_members')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('nmo_members')
      .select('avatar_url, level, last_seen_at')
      .not('avatar_url', 'is', null)
      .order('level', { ascending: false, nullsFirst: false })
      .order('last_seen_at', { ascending: false })
      .limit(20),
  ]);

  const galleryAvatars = (gallery ?? [])
    .map((r) => r.avatar_url as string)
    .filter(Boolean)
    .slice(0, 7);

  return (
    <WelcomeSearch
      galleryAvatars={galleryAvatars}
      memberCount={count ?? 0}
    />
  );
}
