// Super-admin-only manual point award. Search a user by handle /
// email / name, enter points (+/-) and an optional reason, submit.
// Gated server-side by the route + RPC + by route shape here.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AwardPointsClient } from './AwardPointsClient';

export const dynamic = 'force-dynamic';

export default async function AwardPointsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('is_super_admin')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!(adminRow as { is_super_admin: boolean | null } | null)?.is_super_admin) {
    redirect('/admin');
  }

  return <AwardPointsClient />;
}
