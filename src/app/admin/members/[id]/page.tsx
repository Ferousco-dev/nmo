import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Trophy, Activity, Flame, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TopNav } from '@/components/TopNav';
import { GrantPointsForm, GrantBadgeForm, RevokeBadgeButton } from '@/components/admin/MemberActions';
import { getT } from '@/lib/i18n/server';
import { currentTier } from '@/lib/badges';
import type { Badge } from '@/types';

export const dynamic = 'force-dynamic';

interface MemberRow {
  id: string;
  email: string;
  display_name: string | null;
  skool_handle: string | null;
  skool_avatar_url: string | null;
  skool_display_name: string | null;
  total_points: number;
  streak_count: number;
  current_level: number;
}

export default async function AdminMemberDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const t = getT();
  const supabase = createClient();

  const [{ data: member }, { data: catalog }, { data: held }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, display_name, skool_handle, skool_avatar_url, skool_display_name, total_points, streak_count, current_level')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('badges')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', params.id),
  ]);

  if (!member) notFound();
  const m = member as MemberRow;
  const allBadges = (catalog ?? []) as Badge[];
  const earnedIds = new Set((held ?? []).map((r: { badge_id: string }) => r.badge_id));
  const earnedBadges = allBadges.filter((b) => earnedIds.has(b.id));
  const earnedKeys = earnedBadges.map((b) => b.key);

  const name = m.skool_display_name || m.display_name || m.email.split('@')[0];
  const tier = currentTier(m.total_points);

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <Link
          href="/admin/members"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-6"
        >
          <ChevronLeft className="h-4 w-4" />
          {t.admin.member.backToMembers}
        </Link>

        {/* Hero card */}
        <div className="card-premium p-6 sm:p-8 mb-6">
          <div className="flex items-start gap-4">
            {m.skool_avatar_url ? (
              <img
                src={m.skool_avatar_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover border-2 border-accent/40 shrink-0"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-bg-raised border border-line flex items-center justify-center text-base font-mono text-ink-muted shrink-0">
                {name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight truncate">
                  {name}
                </h1>
                {m.skool_handle && (
                  <a
                    href={`https://www.skool.com/@${m.skool_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink-dim hover:text-accent shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
              {m.skool_handle && (
                <p className="text-xs text-ink-dim font-mono">@{m.skool_handle}</p>
              )}
              <p className="text-xs text-ink-muted mt-1">{m.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-line">
            <Stat icon={<Trophy className="h-3.5 w-3.5" />} label="pts" value={m.total_points.toLocaleString()} />
            <Stat icon={<Activity className="h-3.5 w-3.5" />} label="tier" value={`Lv ${tier}`} />
            <Stat icon={<Flame className="h-3.5 w-3.5" />} label="streak" value={`${m.streak_count}d`} />
          </div>
        </div>

        {/* Grant points */}
        <div className="card-premium p-6 mb-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-3">
            {t.admin.member.grantPoints}
          </h2>
          <GrantPointsForm targetUserId={m.id} />
        </div>

        {/* Grant badge */}
        <div className="card-premium p-6 mb-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-3">
            {t.admin.member.grantBadge}
          </h2>
          <GrantBadgeForm targetUserId={m.id} catalog={allBadges} earnedKeys={earnedKeys} />
        </div>

        {/* Current badges + revoke */}
        <div className="card-premium p-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-3">
            {t.admin.member.currentBadges}
          </h2>
          {earnedBadges.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-4">{t.admin.member.noBadges}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {earnedBadges.map((b) => (
                <RevokeBadgeButton key={b.id} targetUserId={m.id} badge={b} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wider text-ink-dim">
        {icon}
        {label}
      </div>
      <div className="font-display text-xl font-bold text-ink mt-0.5">{value}</div>
    </div>
  );
}
