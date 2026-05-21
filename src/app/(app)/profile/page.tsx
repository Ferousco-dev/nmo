import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ExternalLink, Mail, Trophy, Target, Flame, Activity, ShieldCheck, ShieldAlert,
  Sword, Shield, Wand2, Crown,
  Building2, Code2, Video, GraduationCap,
  Sprout, Rocket,
  Compass, TrendingUp, Award,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TRACK_NAMES_ZH } from '@/lib/roadmap/generator';
import { calculateLevel, cn } from '@/lib/utils';
import { getT, getLocale } from '@/lib/i18n/server';
import { BadgeCard } from '@/components/badges/BadgeCard';
import { BadgeSlots } from '@/components/badges/BadgeSlots';
import { LinkSkoolPanel } from '@/components/profile/LinkSkoolPanel';
import { DeleteAccountPanel } from '@/components/profile/DeleteAccountPanel';
import { currentTier, nextTier } from '@/lib/badges';
import type { Badge, Pathway, SkoolMembershipStatus } from '@/types';

export default async function ProfilePage() {
  const t = getT();
  const locale = getLocale();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_completed) redirect('/onboarding');

  const tenureIcons: Record<string, LucideIcon> = {
    warrior: Sword,
    ninja: Shield,
    wizard: Wand2,
    dragon: Crown,
  };
  const goalIcons: Record<string, LucideIcon> = {
    agency: Building2,
    saas: Code2,
    content: Video,
    coaching: GraduationCap,
  };
  const intensityIcons: Record<string, LucideIcon> = {
    easy: Sprout,
    pro: Rocket,
  };
  const pathwayIcons: Record<Pathway, LucideIcon> = {
    foundation: Compass,
    growth: TrendingUp,
    scale: Award,
  };

  const level = calculateLevel(profile.total_points);
  const trackLabel = profile.track_assigned ? TRACK_NAMES_ZH[profile.track_assigned] : '-';
  const displayName =
    profile.skool_display_name ||
    (profile.skool_handle ? `@${profile.skool_handle}` : null) ||
    profile.display_name ||
    user.email?.split('@')[0] ||
    '夥伴';
  const initials = displayName.replace(/^@/, '').slice(0, 2).toUpperCase();
  const status: SkoolMembershipStatus = profile.skool_membership_status || 'unverified';

  const { data: grade } = await supabase
    .from('engagement_grades')
    .select('engagement_score, posts_count, comments_count, replies_count, likes_count')
    .eq('user_id', user.id)
    .maybeSingle();

  // Fetch the full badge catalog + the user's earned badges in parallel.
  const [{ data: allBadges }, { data: earned }] = await Promise.all([
    supabase
      .from('badges')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', user.id),
  ]);

  const catalog = (allBadges ?? []) as Badge[];
  const earnedIds = new Set((earned ?? []).map((row: { badge_id: string }) => row.badge_id));
  const tierBadges = catalog.filter((b) => b.category === 'tier');
  const specialBadges = catalog.filter((b) => b.category !== 'tier');
  const earnedBadges = catalog.filter((b) => earnedIds.has(b.id));
  const userTier = currentTier(profile.total_points);
  const userNextTier = nextTier(profile.total_points);

  // 5-slot showcase: highest-tier badge they hold (primary) + their
  // earned specials, capped at 4, in display_order.
  const primaryBadge =
    tierBadges
      .filter((b) => earnedIds.has(b.id))
      .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0))[0] ?? null;
  const earnedSpecials = specialBadges.filter((b) => earnedIds.has(b.id));

  return (
          <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up">
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
            <span className="gradient-text">{t.profile.title}</span>
          </h1>
        </div>

        {/* Skool-linking prompt — only shown when the user hasn't
            connected their Skool account yet. */}
        {!profile.skool_handle && <LinkSkoolPanel />}

        {/* Hero card */}
        <div className="card-premium p-5 sm:p-8 mb-6">
          <div className="flex items-start gap-5">
            {profile.skool_avatar_url ? (
              <img
                src={profile.skool_avatar_url}
                alt=""
                decoding="async"
                className="h-20 w-20 rounded-2xl object-cover shrink-0 glow-blue border-2 border-accent/40"
              />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center font-display text-3xl font-bold text-white shrink-0 glow-blue">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-2xl font-bold text-ink">{displayName}</h2>
              {profile.skool_handle && (
                <div className="text-sm text-ink-muted font-mono">@{profile.skool_handle}</div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-ink-muted mt-1 min-w-0">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <MembershipBadge status={status} />
                {profile.skool_handle && (
                  <a
                    href={`https://www.skool.com/@${profile.skool_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-glow font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    {t.profile.skoolUrl}
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-line">
            <ProfileStat icon={<Activity className="h-4 w-4" />} label={t.activity.score} value={(grade?.engagement_score ?? 0).toLocaleString()} />
            <ProfileStat icon={<Trophy className="h-4 w-4" />} label={t.profile.totalPoints} value={profile.total_points.toLocaleString()} />
            <ProfileStat icon={<Target className="h-4 w-4" />} label={t.profile.currentLevel} value={`Lv. ${level}`} />
            <ProfileStat icon={<Flame className="h-4 w-4" />} label={t.dashboard.streak} value={`${profile.streak_count} ${t.dashboard.days}`} />
          </div>
        </div>

        {/* Details */}
        <div className="card-premium p-5 sm:p-8">
          <h3 className="font-display text-xl font-bold mb-5">{t.profile.questionnaireAnswers}</h3>
          <dl className="space-y-4">
            {/* Pathway/archetype intentionally hidden — every user
                walks the same 30-day plan, no need to reveal a
                category. Column stays in DB for analytics. */}
            <ProfileRow
              label={t.profile.tenure}
              value={
                profile.tenure ? (
                  <IconLabel Icon={tenureIcons[profile.tenure]} text={t.onboarding.tenure[profile.tenure as keyof typeof t.onboarding.tenure].label} />
                ) : '-'
              }
            />
            <ProfileRow
              label={t.profile.goal}
              value={
                profile.goal ? (
                  <IconLabel Icon={goalIcons[profile.goal]} text={t.onboarding.goal[profile.goal as keyof typeof t.onboarding.goal].label} />
                ) : '-'
              }
            />
            <ProfileRow
              label={t.profile.intensity}
              value={
                profile.intensity ? (
                  <IconLabel Icon={intensityIcons[profile.intensity]} text={t.onboarding.intensity[profile.intensity as keyof typeof t.onboarding.intensity].label} />
                ) : '-'
              }
            />
            <ProfileRow label={t.profile.track} value={trackLabel} highlight />
          </dl>

          <div className="mt-6 pt-6 border-t border-line">
            <Link
              href="/roadmap"
              className="text-sm text-accent hover:text-accent-glow font-medium"
            >
              {t.profile.viewRoadmapCta}
            </Link>
          </div>
        </div>

        {/* Badges */}
        <div className="card-premium p-5 sm:p-8 mt-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display text-xl font-bold">{t.badges.sectionTitle}</h3>
            {userNextTier ? (
              <span className="text-xs text-ink-dim font-mono">
                {t.badges.nextTier}: Lv {userNextTier.tier} ·{' '}
                {(t.badges.pointsToNext as string).replace(
                  '{points}',
                  userNextTier.pointsToGo.toLocaleString()
                )}
              </span>
            ) : (
              <span className="text-xs text-success font-mono">{t.badges.maxTierReached}</span>
            )}
          </div>
          <p className="text-xs text-ink-muted mb-5">
            {earnedBadges.length} {t.badges.earned} · Lv {userTier}
          </p>

          {/* 5-slot showcase (primary + 4 specials with locked placeholders) */}
          <div className="mb-6">
            <BadgeSlots
              primary={primaryBadge}
              specials={earnedSpecials}
              locale={locale}
              primaryLabel={t.badges.primarySlot}
              specialLabel={t.badges.specialSlot}
              emptyLabel={t.badges.slotEmpty}
            />
          </div>

          {catalog.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-8">{t.badges.empty}</p>
          ) : (
            <>
              {/* Earned specials (collectibles) — shown first if any */}
              {specialBadges.some((b) => earnedIds.has(b.id)) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
                  {specialBadges
                    .filter((b) => earnedIds.has(b.id))
                    .map((badge) => (
                      <BadgeCard key={badge.id} badge={badge} locale={locale} />
                    ))}
                </div>
              )}

              {/* Tier ladder — earned bright, future tiers locked-preview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {tierBadges.map((badge) => (
                  <BadgeCard
                    key={badge.id}
                    badge={badge}
                    locale={locale}
                    locked={!earnedIds.has(badge.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Danger zone — sits at the bottom of the profile because
            it's a destructive action and shouldn't be the first
            thing the user sees. */}
        <DeleteAccountPanel />
      </main>
  );
}

function ProfileStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1.5 text-xs text-ink-muted uppercase tracking-wider font-mono">
        {icon}
        {label}
      </div>
      <div className="font-display text-2xl font-bold text-ink mt-1">{value}</div>
    </div>
  );
}

function ProfileRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-line-subtle last:border-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={highlight ? 'font-semibold text-accent' : 'text-ink'}>{value}</dd>
    </div>
  );
}

function IconLabel({ Icon, text }: { Icon: LucideIcon | undefined; text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-accent shrink-0" />}
      <span>{text}</span>
    </span>
  );
}

function MembershipBadge({ status }: { status: SkoolMembershipStatus }) {
  const t = getT();
  const labels = t.profile.statusLabels;
  const map = {
    unverified: { Icon: ShieldAlert, color: 'text-ink-dim border-line', label: labels.unverified },
    pending: { Icon: ShieldAlert, color: 'text-warn border-warn/40 bg-warn/5', label: labels.pending },
    verified: { Icon: ShieldCheck, color: 'text-success border-success/40 bg-success/5', label: labels.verified },
    rejected: { Icon: ShieldAlert, color: 'text-danger border-danger/40 bg-danger/5', label: labels.rejected },
  } as const;
  const cfg = map[status] ?? map.unverified;
  const { Icon } = cfg;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium', cfg.color)}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}
