import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WelcomeSearch } from '@/components/welcome/WelcomeSearch';

export const dynamic = 'force-dynamic';

// Flow:
//   - signed in + onboarded → /dashboard
//   - everyone else (signed out, or signed in but not onboarded) → WelcomeSearch
//
// We do NOT auto-redirect mid-onboarding sessions to /questionnaire here —
// a stale auth cookie would otherwise yank a user who thinks they're signed
// out straight into the questionnaire. They can resume setup via /login or
// /questionnaire directly.
export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single();
    if (profile?.onboarding_completed) {
      redirect('/dashboard');
    }
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
