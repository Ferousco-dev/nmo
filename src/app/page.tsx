// Entry point.
//
// Authenticated visitors → wherever they belong in the flow:
//   - identity not yet confirmed → /confirm-identity
//   - onboarding incomplete      → /questionnaire
//   - fully onboarded            → /dashboard
//
// Everyone else → WelcomeSearch (find yourself in NMO). Picking yourself
// jumps to /login?handle=… where the prefilled card asks for your Skool
// email + password. If you can't find your handle the page nudges you to
// join skool.com/nmo first.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WelcomeSearch } from '@/components/welcome/WelcomeSearch';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('skool_identity_confirmed_at, onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.skool_identity_confirmed_at) redirect('/confirm-identity');
    if (!profile.onboarding_completed) redirect('/questionnaire');
    redirect('/dashboard');
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
