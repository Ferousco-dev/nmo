// Leaderboard — gamification rank by total roadmap points (the number
// the client cares about: tasks completed, codes redeemed, admin grants).
//
// Layout:
//   1. Top-3 podium — gold / silver / bronze with avatars and points
//   2. Ranks 4–50 in a tight list
//   3. Sticky-ish "your rank" card if the viewer isn't in the displayed top
//
// The previous bot-scraped Activity tab is preserved at ?tab=activity for
// completeness but no longer the default — per project memory, engagement
// tracking is not the gamification source the client wants emphasized.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Trophy, Medal, Award, Activity, Zap, FileText,
  MessageSquare, Reply, Heart, Crown, CalendarRange,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { getT, getLocale } from '@/lib/i18n/server';
import { BadgeChip } from '@/components/badges/BadgeChip';
import { currentTier } from '@/lib/badges';
import type { Badge } from '@/types';

type Tab = 'roadmap' | 'quarter' | 'activity';

interface ActivityEntry {
  user_id: string;
  display_name: string;
  skool_handle: string | null;
  avatar_url: string | null;
  tenure: string | null;
  engagement_score: number;
  posts_count: number;
  comments_count: number;
  replies_count: number;
  likes_count: number;
}

interface RoadmapEntry {
  id: string;
  display_name: string | null;
  skool_display_name: string | null;
  email: string;
  skool_handle: string | null;
  skool_avatar_url: string | null;
  total_points: number;
}

const TOP_LIMIT = 50;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const t = getT();
  const locale = getLocale();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Roadmap (all-time) is the default — points are the canonical
  // gamification metric. Quarter is the same data filtered to the last
  // 90 days via the leaderboard_quarter view; activity is a read-only
  // breakdown of bot-scraped engagement (which now also feeds points).
  const requestedTab = searchParams.tab;
  const tab: Tab =
    requestedTab === 'quarter' ? 'quarter' :
    requestedTab === 'activity' ? 'activity' :
    'roadmap';

  const [
    roadmapRes,
    rankCountRes,
    selfRes,
    quarterRes,
    selfQuarterRes,
    allTimeActivityRes,
    recentActivityRes,
    tierBadgesRes,
  ] = await Promise.all([
    // Top N members all-time (total_points)
    supabase
      .from('profiles')
      .select('id, display_name, skool_display_name, email, skool_handle, skool_avatar_url, total_points')
      .gt('total_points', 0)
      .order('total_points', { ascending: false })
      .limit(TOP_LIMIT),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('total_points', 0),
    supabase
      .from('profiles')
      .select('id, display_name, skool_display_name, email, skool_handle, skool_avatar_url, total_points')
      .eq('id', user.id)
      .maybeSingle(),
    // Quarter (last 90 days) — joins ledger view to profiles
    supabase
      .from('leaderboard_quarter')
      .select('user_id, quarter_points')
      .order('quarter_points', { ascending: false })
      .limit(TOP_LIMIT),
    supabase
      .from('leaderboard_quarter')
      .select('user_id, quarter_points')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('engagement_grades')
      .select('*')
      .order('engagement_score', { ascending: false })
      .limit(50),
    supabase
      .from('engagement_grades_recent')
      .select('*')
      .order('engagement_score', { ascending: false })
      .limit(50),
    supabase
      .from('badges')
      .select('*')
      .eq('category', 'tier')
      .eq('is_active', true)
      .order('tier', { ascending: true }),
  ]);

  const roadmap = (roadmapRes.data ?? []) as RoadmapEntry[];
  const totalScorers = rankCountRes.count ?? 0;
  const self = selfRes.data as RoadmapEntry | null;
  const allTimeActivity = (allTimeActivityRes.data ?? []) as ActivityEntry[];
  const recentActivity = (recentActivityRes.data ?? []) as ActivityEntry[];
  const tierBadges = (tierBadgesRes.data ?? []) as Badge[];

  // Hydrate quarter rows with profile fields (the view returns user_id +
  // points only; we need name/avatar/handle to render the same UI).
  const quarterRaw = (quarterRes.data ?? []) as Array<{ user_id: string; quarter_points: number }>;
  let quarterEntries: RoadmapEntry[] = [];
  let quarterTotal = 0;
  let quarterSelfRank: number | null = null;
  let quarterSelfPoints: number | null = null;
  if (quarterRaw.length > 0) {
    const ids = quarterRaw.map((r) => r.user_id);
    const { data: qProfiles } = await supabase
      .from('profiles')
      .select('id, display_name, skool_display_name, email, skool_handle, skool_avatar_url')
      .in('id', ids);
    const profileById = new Map(
      (qProfiles ?? []).map((p) => [p.id as string, p as Omit<RoadmapEntry, 'total_points'>])
    );
    quarterEntries = quarterRaw
      .map((r) => {
        const p = profileById.get(r.user_id);
        if (!p) return null;
        return { ...p, total_points: r.quarter_points } as RoadmapEntry;
      })
      .filter((r): r is RoadmapEntry => r !== null);

    const { count: qCount } = await supabase
      .from('leaderboard_quarter')
      .select('user_id', { count: 'exact', head: true })
      .gt('quarter_points', 0);
    quarterTotal = qCount ?? 0;
  }
  const selfQ = selfQuarterRes.data as { user_id: string; quarter_points: number } | null;
  if (selfQ && selfQ.quarter_points > 0) {
    quarterSelfPoints = selfQ.quarter_points;
    const inTop = quarterRaw.findIndex((r) => r.user_id === user.id);
    if (inTop >= 0) {
      quarterSelfRank = inTop + 1;
    } else {
      const { count } = await supabase
        .from('leaderboard_quarter')
        .select('user_id', { count: 'exact', head: true })
        .gt('quarter_points', selfQ.quarter_points);
      quarterSelfRank = (count ?? 0) + 1;
    }
  }

  // All-time viewer rank
  let myRank: number | null = null;
  if (self && self.total_points > 0) {
    const inTop = roadmap.findIndex((r) => r.id === user.id);
    if (inTop >= 0) {
      myRank = inTop + 1;
    } else {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gt('total_points', self.total_points);
      myRank = (count ?? 0) + 1;
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 animate-slide-up">
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
          <span className="gradient-text">{t.leaderboard.title}</span>
        </h1>
        <p className="mt-3 text-ink-muted">{t.leaderboard.subtitle}</p>
      </div>

      {/* Tab switcher */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-bg-raised border border-line mb-6 flex-wrap">
        <TabLink tab="roadmap" current={tab} icon={<Trophy className="h-4 w-4" />} label={t.leaderboard.tabRoadmap} />
        <TabLink tab="quarter" current={tab} icon={<CalendarRange className="h-4 w-4" />} label={t.leaderboard.tabQuarter} />
        <TabLink tab="activity" current={tab} icon={<Activity className="h-4 w-4" />} label={t.leaderboard.tabActivity} />
      </div>

      {tab === 'roadmap' && (
        <RoadmapBoard
          entries={roadmap}
          self={self}
          myRank={myRank}
          totalScorers={totalScorers}
          currentUserId={user.id}
          tierBadges={tierBadges}
          locale={locale}
        />
      )}
      {tab === 'quarter' && (
        <RoadmapBoard
          entries={quarterEntries}
          self={
            self && quarterSelfPoints != null
              ? { ...self, total_points: quarterSelfPoints }
              : self
          }
          myRank={quarterSelfRank}
          totalScorers={quarterTotal}
          currentUserId={user.id}
          tierBadges={tierBadges}
          locale={locale}
        />
      )}
      {tab === 'activity' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActivitySection title={t.leaderboard.activityRecent} Icon={Zap} entries={recentActivity} currentUserId={user.id} />
          <ActivitySection title={t.leaderboard.activityAllTime} Icon={Trophy} entries={allTimeActivity} currentUserId={user.id} />
        </div>
      )}
    </main>
  );
}

function TabLink({ tab, current, icon, label }: { tab: Tab; current: Tab; icon: React.ReactNode; label: string }) {
  const active = tab === current;
  return (
    <Link
      href={`/leaderboard?tab=${tab}`}
      scroll={false}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-2 px-4 h-9 rounded-md text-sm font-medium transition-colors',
        active ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-ink-muted hover:text-ink hover:bg-bg-hover'
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

// ============================================================
// Roadmap board
// ============================================================
function RoadmapBoard({
  entries,
  self,
  myRank,
  totalScorers,
  currentUserId,
  tierBadges,
  locale,
}: {
  entries: RoadmapEntry[];
  self: RoadmapEntry | null;
  myRank: number | null;
  totalScorers: number;
  currentUserId: string;
  tierBadges: Badge[];
  locale: string;
}) {
  const t = getT();
  const tierByNumber = new Map<number, Badge>();
  for (const badge of tierBadges) {
    if (badge.tier != null) tierByNumber.set(badge.tier, badge);
  }

  if (entries.length === 0) {
    return (
      <div className="card-premium p-6 sm:p-10 text-center">
        <Trophy className="h-10 w-10 text-accent mx-auto mb-3" aria-hidden />
        <p className="text-ink-muted">{t.leaderboard.leaderboardEmpty}</p>
      </div>
    );
  }

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  // Visual order for the podium so 1st sits centered+tallest:
  // [2nd, 1st, 3rd] when there are 3 winners, else just sequential.
  const podiumOrder: RoadmapEntry[] =
    top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;

  return (
    <div className="space-y-6">
      {/* Top-3 podium */}
      <section>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim mb-4">
          {t.leaderboard.podiumTitle}
        </h2>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-4 items-end">
          {podiumOrder.map((entry) => {
            const rank = entries.findIndex((e) => e.id === entry.id) + 1;
            const isMe = entry.id === currentUserId;
            const tierBadge = tierByNumber.get(currentTier(entry.total_points));
            return (
              <PodiumCard
                key={entry.id}
                entry={entry}
                rank={rank}
                isMe={isMe}
                tierBadge={tierBadge}
                locale={locale}
              />
            );
          })}
        </div>
      </section>

      {/* Your rank — only shown if signed-in user has points */}
      {self && myRank != null && (
        <YourRankCard
          self={self}
          rank={myRank}
          totalScorers={totalScorers}
          tierBadge={tierByNumber.get(currentTier(self.total_points))}
          locale={locale}
        />
      )}

      {/* Not yet ranked nudge — only when user has 0 pts */}
      {self && self.total_points === 0 && (
        <div className="card-premium p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-bg-raised border border-line flex items-center justify-center text-ink-muted shrink-0">
            <Trophy className="h-4 w-4" aria-hidden />
          </div>
          <p className="text-sm text-ink-muted">{t.leaderboard.notRankedYet}</p>
        </div>
      )}

      {/* Ranks 4–50 */}
      {rest.length > 0 && (
        <section className="card-premium p-4 sm:p-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim mb-4">
            {t.leaderboard.topRanks}
          </h2>
          <ol className="space-y-1.5">
            {rest.map((entry, idx) => {
              const rank = idx + 4;
              const isMe = entry.id === currentUserId;
              const tierBadge = tierByNumber.get(currentTier(entry.total_points));
              return (
                <RankRow
                  key={entry.id}
                  entry={entry}
                  rank={rank}
                  isMe={isMe}
                  tierBadge={tierBadge}
                  locale={locale}
                />
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function PodiumCard({
  entry,
  rank,
  isMe,
  tierBadge,
  locale,
}: {
  entry: RoadmapEntry;
  rank: number;
  isMe: boolean;
  tierBadge: Badge | undefined;
  locale: string;
}) {
  const t = getT();
  const name = entry.skool_display_name || entry.display_name || (entry.skool_handle ? `@${entry.skool_handle}` : entry.email.split('@')[0]);
  const initials = name.slice(0, 2).toUpperCase();
  const skoolUrl = entry.skool_handle ? `https://www.skool.com/@${entry.skool_handle}` : null;

  // 1st gets the tallest box, then 2nd, then 3rd
  const tone =
    rank === 1
      ? 'from-yellow-400/30 to-yellow-600/10 border-yellow-400/40 ring-yellow-400/30'
      : rank === 2
      ? 'from-zinc-300/20 to-zinc-500/10 border-zinc-400/30 ring-zinc-400/20'
      : 'from-amber-700/20 to-amber-900/10 border-amber-600/30 ring-amber-600/20';

  const minH =
    rank === 1 ? 'min-h-[180px] sm:min-h-[220px]' :
    rank === 2 ? 'min-h-[160px] sm:min-h-[200px]' :
                 'min-h-[140px] sm:min-h-[180px]';

  const RankIcon = rank === 1 ? Crown : rank === 2 ? Medal : Award;
  const rankColor = rank === 1 ? 'text-yellow-300' : rank === 2 ? 'text-zinc-200' : 'text-amber-300';

  const inner = (
    <div
      className={cn(
        'relative card-premium p-4 sm:p-5 flex flex-col items-center text-center bg-gradient-to-b border ring-1',
        tone,
        minH,
        isMe && 'ring-accent/50 border-accent/50'
      )}
    >
      {/* Rank icon at the top */}
      <div className={cn('absolute -top-3 left-1/2 -translate-x-1/2 h-7 w-7 rounded-full bg-bg-raised border border-line flex items-center justify-center', rankColor)}>
        <RankIcon className="h-4 w-4" aria-hidden />
      </div>

      {/* Avatar */}
      <div className="mt-2 mb-3">
        {entry.skool_avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.skool_avatar_url}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(
              'rounded-full object-cover border-2',
              rank === 1 ? 'h-16 w-16 sm:h-20 sm:w-20 border-yellow-400/60' :
              rank === 2 ? 'h-14 w-14 sm:h-16 sm:w-16 border-zinc-400/60' :
                           'h-12 w-12 sm:h-14 sm:w-14 border-amber-600/60'
            )}
          />
        ) : (
          <div
            className={cn(
              'rounded-full bg-bg-raised border-2 flex items-center justify-center font-mono font-bold text-ink',
              rank === 1 ? 'h-16 w-16 sm:h-20 sm:w-20 border-yellow-400/60 text-base sm:text-xl' :
              rank === 2 ? 'h-14 w-14 sm:h-16 sm:w-16 border-zinc-400/60 text-sm sm:text-lg' :
                           'h-12 w-12 sm:h-14 sm:w-14 border-amber-600/60 text-xs sm:text-base'
            )}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Name + handle */}
      <div className="font-semibold text-ink text-sm sm:text-base leading-tight truncate max-w-full">
        {name}
      </div>
      {entry.skool_handle && (
        <div className="text-[10px] sm:text-xs text-ink-dim font-mono truncate max-w-full">
          @{entry.skool_handle}
        </div>
      )}

      {/* Tier chip */}
      {tierBadge && (
        <div className="mt-2">
          <BadgeChip badge={tierBadge} locale={locale} />
        </div>
      )}

      {/* Points */}
      <div className="mt-auto pt-3">
        <div className="font-display text-xl sm:text-3xl font-bold text-ink">
          {entry.total_points.toLocaleString()}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
          {t.leaderboard.pts}
        </div>
      </div>

      {isMe && (
        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] bg-accent text-white font-bold uppercase tracking-wide">
          {t.leaderboard.you}
        </span>
      )}
    </div>
  );

  if (skoolUrl) {
    return (
      <a
        href={skoolUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl"
      >
        {inner}
      </a>
    );
  }
  return inner;
}

function YourRankCard({
  self,
  rank,
  totalScorers,
  tierBadge,
  locale,
}: {
  self: RoadmapEntry;
  rank: number;
  totalScorers: number;
  tierBadge: Badge | undefined;
  locale: string;
}) {
  const t = getT();
  const name = self.skool_display_name || self.display_name || (self.skool_handle ? `@${self.skool_handle}` : self.email.split('@')[0]);

  return (
    <div className="card-premium p-4 sm:p-5 border-accent/40 bg-accent/5">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="h-12 w-12 rounded-lg bg-accent/10 border border-accent/40 flex items-center justify-center font-display text-lg font-bold text-accent shrink-0">
          {rank <= 99 ? `#${rank}` : rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            {t.leaderboard.yourRank}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="font-medium text-ink truncate">{name}</span>
            {tierBadge && <BadgeChip badge={tierBadge} locale={locale} />}
          </div>
          <div className="text-xs text-ink-muted mt-0.5">
            {(t.leaderboard.yourRankAt as string)
              .replace('{rank}', String(rank))
              .replace('{total}', String(totalScorers))}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-2xl font-bold text-accent">
            {self.total_points.toLocaleString()}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
            {t.leaderboard.pts}
          </div>
        </div>
      </div>
    </div>
  );
}

function RankRow({
  entry,
  rank,
  isMe,
  tierBadge,
  locale,
}: {
  entry: RoadmapEntry;
  rank: number;
  isMe: boolean;
  tierBadge: Badge | undefined;
  locale: string;
}) {
  const t = getT();
  const name = entry.skool_display_name || entry.display_name || (entry.skool_handle ? `@${entry.skool_handle}` : entry.email.split('@')[0]);
  const skoolUrl = entry.skool_handle ? `https://www.skool.com/@${entry.skool_handle}` : null;

  const inner = (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-colors',
        isMe ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-bg-hover'
      )}
    >
      <div className="h-9 w-9 rounded-lg bg-bg-raised border border-line flex items-center justify-center font-mono text-sm text-ink-muted shrink-0">
        {rank}
      </div>
      {entry.skool_avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.skool_avatar_url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-9 w-9 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="h-9 w-9 rounded-full bg-bg-hover border border-line flex items-center justify-center text-xs font-mono text-ink-muted shrink-0">
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-ink truncate">{name}</span>
          {tierBadge && <BadgeChip badge={tierBadge} locale={locale} />}
          {isMe && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent text-white font-bold uppercase tracking-wide">
              {t.leaderboard.you}
            </span>
          )}
        </div>
        {entry.skool_handle && (
          <div className="text-xs text-ink-dim font-mono truncate">@{entry.skool_handle}</div>
        )}
      </div>
      <div className="text-right">
        <div className="font-mono font-bold text-ink">{entry.total_points.toLocaleString()}</div>
        <div className="text-[10px] text-ink-dim uppercase tracking-wider">{t.leaderboard.pts}</div>
      </div>
    </div>
  );

  if (skoolUrl) {
    return (
      <li>
        <a
          href={skoolUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
        >
          {inner}
        </a>
      </li>
    );
  }
  return <li>{inner}</li>;
}

// ============================================================
// Activity board (preserved at ?tab=activity)
// ============================================================
function ActivitySection({
  title,
  Icon,
  entries,
  currentUserId,
}: {
  title: string;
  Icon: LucideIcon;
  entries: ActivityEntry[];
  currentUserId: string;
}) {
  const t = getT();
  return (
    <div className="card-premium p-6">
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-5 flex items-center gap-2">
        <Icon className="h-6 w-6 text-accent shrink-0" aria-hidden />
        {title}
      </h2>

      {entries.length === 0 ? (
        <p className="text-ink-muted text-center py-8 text-sm">{t.leaderboard.noData}</p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((entry, idx) => {
            const rank = idx + 1;
            const isMe = entry.user_id === currentUserId;
            const name = entry.display_name || (entry.skool_handle ? `@${entry.skool_handle}` : '匿名');
            const skoolUrl = entry.skool_handle ? `https://www.skool.com/@${entry.skool_handle}` : null;
            // Conditional element: render <a> only when there's a real
            // URL. Plain <div> otherwise — avoids an onClick handler in
            // a server component (which Next 14 rejects with
            // "Event handlers cannot be passed to Client Component props").
            const RowTag = skoolUrl ? 'a' : 'div';
            const rowProps = skoolUrl
              ? { href: skoolUrl, target: '_blank' as const, rel: 'noopener noreferrer' }
              : {};
            return (
              <li key={entry.user_id}>
                <RowTag
                  {...rowProps}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                    skoolUrl && 'cursor-pointer',
                    isMe ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-bg-hover'
                  )}
                >
                  <div className="h-9 w-9 rounded-lg bg-bg-raised border border-line flex items-center justify-center font-mono text-sm text-ink-muted shrink-0">
                    {rank}
                  </div>
                  {entry.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={entry.avatar_url} alt="" loading="lazy" decoding="async" className="h-9 w-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-bg-hover border border-line flex items-center justify-center text-xs font-mono text-ink-muted shrink-0">
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink truncate">{name}</span>
                      {isMe && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent text-white font-bold uppercase tracking-wide">
                          {t.leaderboard.you}
                        </span>
                      )}
                    </div>
                    {entry.skool_handle && (
                      <div className="text-xs text-ink-dim font-mono truncate">@{entry.skool_handle}</div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-ink-dim flex-wrap mt-0.5">
                      <span className="inline-flex items-center gap-0.5"><FileText className="h-3 w-3" aria-hidden />{entry.posts_count}</span>
                      <span className="inline-flex items-center gap-0.5"><MessageSquare className="h-3 w-3" aria-hidden />{entry.comments_count}</span>
                      <span className="inline-flex items-center gap-0.5"><Reply className="h-3 w-3" aria-hidden />{entry.replies_count}</span>
                      <span className="inline-flex items-center gap-0.5"><Heart className="h-3 w-3" aria-hidden />{entry.likes_count}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-ink">{entry.engagement_score.toLocaleString()}</div>
                    <div className="text-[10px] text-ink-dim uppercase tracking-wider">{t.leaderboard.score}</div>
                  </div>
                </RowTag>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
