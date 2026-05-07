import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WelcomeSearch } from '@/components/welcome/WelcomeSearch';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Already signed in → straight to the right place
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single();
    redirect(profile?.onboarding_completed ? '/dashboard' : '/onboarding');
  }

  // Pull data for the welcome state in parallel:
  //   - total community member count (rounded down to "1,800+" style)
  //   - sample of 7 avatars for the social-proof gallery
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

  // Pick 7 from the top-20 for variety. Stable per-render so it's not jarring.
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
