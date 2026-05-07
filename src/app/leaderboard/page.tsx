import { redirect } from 'next/navigation';
import { Trophy, Medal, Award, Activity, Map as MapIcon, Zap, FileText, MessageSquare, Reply, Heart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TopNav } from '@/components/TopNav';
import { calculateLevel, cn } from '@/lib/utils';
import { getT, getLocale } from '@/lib/i18n/server';
import { BadgeChip } from '@/components/badges/BadgeChip';
import { currentTier } from '@/lib/badges';
import type { Badge } from '@/types';

type Tab = 'activity' | 'roadmap';

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
  email: string;
  skool_handle: string | null;
  skool_avatar_url: string | null;
  total_points: number;
  tenure: string | null;
}

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

  const tab: Tab = searchParams.tab === 'roadmap' ? 'roadmap' : 'activity';

  const [allTimeActivityRes, recentActivityRes, roadmapRes, tierBadgesRes] = await Promise.all([
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
      .from('profiles')
      .select('id, display_name, email, skool_handle, skool_avatar_url, total_points, tenure')
      .order('total_points', { ascending: false })
      .limit(50),
    supabase
      .from('badges')
      .select('*')
      .eq('category', 'tier')
      .eq('is_active', true)
      .order('tier', { ascending: true }),
  ]);

  const allTimeActivity = (allTimeActivityRes.data || []) as ActivityEntry[];
  const recentActivity = (recentActivityRes.data || []) as ActivityEntry[];
  const roadmap = (roadmapRes.data || []) as RoadmapEntry[];
  const tierBadges = (tierBadgesRes.data || []) as Badge[];

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up">
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
            <span className="gradient-text">{t.leaderboard.title}</span>
          </h1>
          <p className="mt-3 text-ink-muted">{t.leaderboard.subtitle}</p>
        </div>

        {/* Tab switcher */}
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-bg-raised border border-line mb-6">
          <TabLink tab="activity" current={tab} icon={<Activity className="h-4 w-4" />} label={t.leaderboard.tabActivity} />
          <TabLink tab="roadmap" current={tab} icon={<MapIcon className="h-4 w-4" />} label={t.leaderboard.tabRoadmap} />
        </div>

        {tab === 'activity' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ActivitySection title={t.leaderboard.activityRecent} Icon={Zap} entries={recentActivity} currentUserId={user.id} />
            <ActivitySection title={t.leaderboard.activityAllTime} Icon={Trophy} entries={allTimeActivity} currentUserId={user.id} />
          </div>
        ) : (
          <RoadmapSection
            title={t.leaderboard.roadmapPoints}
            Icon={MapIcon}
            entries={roadmap}
            currentUserId={user.id}
            tierBadges={tierBadges}
            locale={locale}
          />
        )}
      </main>
    </div>
  );
}

function TabLink({ tab, current, icon, label }: { tab: Tab; current: Tab; icon: React.ReactNode; label: string }) {
  const active = tab === current;
  return (
    <a
      href={`/leaderboard?tab=${tab}`}
      className={cn(
        'inline-flex items-center gap-2 px-4 h-9 rounded-md text-sm font-medium transition-colors',
        active ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-ink-muted hover:text-ink hover:bg-bg-hover'
      )}
    >
      {icon}
      {label}
    </a>
  );
}

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
        <Icon className="h-6 w-6 text-accent shrink-0" />
        {title}
      </h2>

      {entries.length === 0 ? (
        <p className="text-ink-muted text-center py-8 text-sm">尚無資料</p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((entry, idx) => {
            const rank = idx + 1;
            const isMe = entry.user_id === currentUserId;
            const name = entry.display_name || (entry.skool_handle ? `@${entry.skool_handle}` : '匿名');
            const skoolUrl = entry.skool_handle ? `https://www.skool.com/@${entry.skool_handle}` : null;
            return (
              <li key={entry.user_id}>
                <a
                  href={skoolUrl ?? '#'}
                  target={skoolUrl ? '_blank' : undefined}
                  rel={skoolUrl ? 'noopener noreferrer' : undefined}
                  onClick={(e) => { if (!skoolUrl) e.preventDefault(); }}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                    skoolUrl && 'cursor-pointer',
                    isMe ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-bg-hover'
                  )}
                >
                  <RankBadge rank={rank} />
                  {entry.avatar_url ? (
                    <img src={entry.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
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
                      <span className="inline-flex items-center gap-0.5"><FileText className="h-3 w-3" />{entry.posts_count}</span>
                      <span className="inline-flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{entry.comments_count}</span>
                      <span className="inline-flex items-center gap-0.5"><Reply className="h-3 w-3" />{entry.replies_count}</span>
                      <span className="inline-flex items-center gap-0.5"><Heart className="h-3 w-3" />{entry.likes_count}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-ink">{entry.engagement_score.toLocaleString()}</div>
                    <div className="text-[10px] text-ink-dim uppercase tracking-wider">{t.leaderboard.score}</div>
                  </div>
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function RoadmapSection({
  title,
  Icon,
  entries,
  currentUserId,
  tierBadges,
  locale,
}: {
  title: string;
  Icon: LucideIcon;
  entries: RoadmapEntry[];
  currentUserId: string;
  tierBadges: Badge[];
  locale: string;
}) {
  const t = getT();
  const tierByNumber = new Map<number, Badge>();
  for (const badge of tierBadges) {
    if (badge.tier != null) tierByNumber.set(badge.tier, badge);
  }
  return (
    <div className="card-premium p-6">
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-5 flex items-center gap-2">
        <Icon className="h-6 w-6 text-accent shrink-0" />
        {title}
      </h2>

      {entries.length === 0 ? (
        <p className="text-ink-muted text-center py-8 text-sm">尚無資料</p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((entry, idx) => {
            const rank = idx + 1;
            const isMe = entry.id === currentUserId;
            const name = entry.display_name || (entry.skool_handle ? `@${entry.skool_handle}` : entry.email.split('@')[0]);
            const tierNum = currentTier(entry.total_points);
            const tierBadge = tierByNumber.get(tierNum);
            const skoolUrl = entry.skool_handle ? `https://www.skool.com/@${entry.skool_handle}` : null;
            return (
              <li key={entry.id}>
                <a
                  href={skoolUrl ?? '#'}
                  target={skoolUrl ? '_blank' : undefined}
                  rel={skoolUrl ? 'noopener noreferrer' : undefined}
                  onClick={(e) => { if (!skoolUrl) e.preventDefault(); }}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                    skoolUrl && 'cursor-pointer',
                    isMe ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-bg-hover'
                  )}
                >
                  <RankBadge rank={rank} />
                  {entry.skool_avatar_url ? (
                    <img src={entry.skool_avatar_url} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
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
                    <div className="text-[10px] text-ink-dim uppercase tracking-wider">pts</div>
                  </div>
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shrink-0">
        <Trophy className="h-5 w-5 text-yellow-50" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-zinc-300 to-zinc-500 flex items-center justify-center shrink-0">
        <Medal className="h-5 w-5 text-zinc-50" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center shrink-0">
        <Award className="h-5 w-5 text-amber-50" />
      </div>
    );
  }
  return (
    <div className="h-9 w-9 rounded-lg bg-bg-raised border border-line flex items-center justify-center font-mono text-sm text-ink-muted shrink-0">
      {rank}
    </div>
  );
}

function tenureLabel(tenure: string | null): string {
  switch (tenure) {
    case 'warrior': return '戰士';
    case 'ninja': return '忍者';
    case 'wizard': return '巫師';
    case 'dragon': return '巨龍';
    default: return '-';
  }
}
