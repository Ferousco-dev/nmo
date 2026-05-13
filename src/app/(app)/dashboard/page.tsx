import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Flame, Trophy, Target, ArrowRight, ExternalLink, Activity, MessageSquare, Heart, FileText, Reply, Gift, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TaskItem } from '@/components/roadmap/TaskItem';
import { RefreshEngagementButton } from '@/components/RefreshEngagementButton';
import { TRACK_NAMES_ZH } from '@/lib/roadmap/generator';
import { ensureCurrentRoadmap } from '@/lib/roadmap/auto-regenerate';
import { getT } from '@/lib/i18n/server';
import { calculateLevel } from '@/lib/utils';

export default async function DashboardPage() {
  const t = getT();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_completed) redirect('/onboarding');

  // Self-heal: if this user is still on the legacy task set (or has
  // an incomplete one), wipe and reinsert the current 男兒幫 plan
  // before reading. One cheap SELECT when nothing needs to change.
  await ensureCurrentRoadmap(supabase, user.id);

  const [{ data: allTasks }, { data: grade }, { data: lastBotRun }] = await Promise.all([
    supabase
      .from('user_tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('day_number', { ascending: true }),
    supabase
      .from('engagement_grades')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('bot_runs')
      .select('finished_at, status')
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const tasks = allTasks || [];
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.is_completed).length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  let currentDay = 1;
  for (let d = 1; d <= 30; d++) {
    const dayTasks = tasks.filter((t) => t.day_number === d);
    if (dayTasks.length > 0 && dayTasks.some((t) => !t.is_completed)) {
      currentDay = d;
      break;
    }
  }
  const todayTasks = tasks.filter((t) => t.day_number === currentDay);

  const level = calculateLevel(profile.total_points);
  const trackLabel = profile.track_assigned ? TRACK_NAMES_ZH[profile.track_assigned] : '-';
  const displayName =
    profile.skool_display_name ||
    (profile.skool_handle ? `@${profile.skool_handle}` : null) ||
    profile.display_name ||
    user.email?.split('@')[0] ||
    t.dashboard.fallbackName;

  const engagementScore = grade?.engagement_score ?? 0;
  const engagementBreakdown = {
    posts: grade?.posts_count ?? 0,
    // Likes the user RECEIVED across all their posts (not likes they gave).
    likesReceived: grade?.likes_received_total ?? 0,
    // Total comments under their posts.
    commentsReceived: grade?.comments_received_total ?? 0,
    // Replies the user authored. Best-effort scrape; may underreport
    // until the next refresh.
    replies: grade?.replies_count ?? 0,
  };

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up flex items-start gap-4">
          {profile.skool_avatar_url && (
            profile.skool_handle ? (
              <a
                href={`https://www.skool.com/@${profile.skool_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open Skool profile"
                className="shrink-0"
              >
                <img
                  src={profile.skool_avatar_url}
                  alt=""
                  decoding="async"
                  className="h-16 w-16 rounded-full object-cover border-2 border-accent/40 hover:border-accent transition-colors"
                />
              </a>
            ) : (
              <img
                src={profile.skool_avatar_url}
                alt=""
                decoding="async"
                className="h-16 w-16 rounded-full object-cover border-2 border-accent/40 shrink-0"
              />
            )
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-muted">{t.dashboard.greeting}</p>
            {profile.skool_handle ? (
              <a
                href={`https://www.skool.com/@${profile.skool_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-baseline gap-2 group max-w-full"
              >
                <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mt-1 group-hover:text-accent transition-colors truncate">
                  {displayName} <span className="text-accent">.</span>
                </h1>
                <ExternalLink className="h-4 w-4 text-ink-dim group-hover:text-accent transition-colors shrink-0" aria-hidden />
              </a>
            ) : (
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mt-1 truncate">
                {displayName} <span className="text-accent">.</span>
              </h1>
            )}
            {profile.skool_handle && (
              <p className="text-xs text-ink-dim font-mono mt-0.5 truncate">@{profile.skool_handle}</p>
            )}
            <p className="mt-2 text-ink-muted text-sm">
              {t.dashboard.track}: <span className="text-ink">{trackLabel}</span>
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<Activity className="h-7 w-7 text-accent" />}
            label={t.activity.score}
            value={engagementScore.toLocaleString()}
            sublabel={t.activity.last30Days}
          />
          <StatCard
            icon={<Flame className="h-7 w-7 text-flame animate-flame-flicker" />}
            label={t.dashboard.streak}
            value={`${profile.streak_count}`}
            sublabel={t.dashboard.days}
          />
          <StatCard
            icon={<Trophy className="h-7 w-7 text-accent" />}
            label={t.dashboard.points}
            value={profile.total_points.toLocaleString()}
            sublabel={`Lv. ${level}`}
          />
          <StatCard
            icon={<ProgressRing pct={progressPct} />}
            label={t.dashboard.progressTitle}
            value={`${progressPct}%`}
            sublabel={`${completedTasks} / ${totalTasks}`}
          />
        </div>

        {/* Engagement breakdown */}
        <div className="card-premium p-6 md:p-8 mb-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                <Activity className="h-6 w-6 text-accent" />
                {t.activity.title}
              </h2>
              <p className="text-sm text-ink-muted mt-1">
                {lastBotRun?.finished_at
                  ? `${t.activity.lastSync}: ${formatRelative(lastBotRun.finished_at)}`
                  : t.activity.neverSynced}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {profile.skool_handle && <RefreshEngagementButton />}
              <Link
                href="/activity"
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-glow font-medium whitespace-nowrap"
              >
                {t.dashboard.viewDetails}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BreakdownTile icon={<FileText className="h-5 w-5" />} label={t.activity.posts} value={engagementBreakdown.posts} weight={10} />
            <BreakdownTile icon={<Heart className="h-5 w-5" />} label={t.activity.likesReceived} value={engagementBreakdown.likesReceived} weight={1} />
            <BreakdownTile icon={<MessageSquare className="h-5 w-5" />} label={t.activity.commentsReceived} value={engagementBreakdown.commentsReceived} weight={5} />
            <BreakdownTile icon={<Reply className="h-5 w-5" />} label={t.activity.replies} value={engagementBreakdown.replies} weight={3} />
          </div>

          {engagementScore === 0 && (
            <p className="mt-5 text-sm text-ink-muted text-center py-4 border border-dashed border-line rounded-lg">
              {t.activity.noEvents}
            </p>
          )}
        </div>

        {/* Today's tasks */}
        <div className="card-premium p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-2xl font-bold">{t.dashboard.todayTasks}</h2>
              <p className="text-sm text-ink-muted mt-1">
                {(t.dashboard.dayLabel as string).replace('{day}', String(currentDay))}
              </p>
            </div>
            <Link
              href="/roadmap"
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-glow font-medium"
            >
              {t.dashboard.viewAll}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {todayTasks.length === 0 ? (
            <p className="text-ink-muted text-center py-8">{t.dashboard.noTasks}</p>
          ) : (
            <div className="space-y-2">
              {todayTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          <Link
            href="/redeem"
            className="card-premium p-5 hover:border-accent/50 transition-colors group"
          >
            <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-3 group-hover:bg-accent/20 transition-colors">
              <Gift className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-ink group-hover:text-accent transition-colors">{t.nav.redeem}</h3>
            <p className="text-xs text-ink-muted mt-1">{t.redeem.subtitle}</p>
          </Link>
          <Link
            href="/leaderboard"
            className="card-premium p-5 hover:border-accent/50 transition-colors group"
          >
            <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-3 group-hover:bg-accent/20 transition-colors">
              <Trophy className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-ink group-hover:text-accent transition-colors">{t.leaderboard.title}</h3>
            <p className="text-xs text-ink-muted mt-1">{t.leaderboard.subtitle}</p>
          </Link>
          <a
            href="https://www.skool.com/nmo"
            target="_blank"
            rel="noopener noreferrer"
            className="card-premium p-5 hover:border-accent/50 transition-colors group"
          >
            <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-3 group-hover:bg-accent/20 transition-colors relative">
              <BookOpen className="h-5 w-5" />
              <ExternalLink className="h-3 w-3 absolute -top-0.5 -right-0.5 text-ink-dim" />
            </div>
            <h3 className="font-semibold text-ink group-hover:text-accent transition-colors">NMO Skool</h3>
            <p className="text-xs text-ink-muted mt-1">{t.onboarding.openSkool}</p>
          </a>
        </div>
      </main>
  );
}

function StatCard({ icon, label, value, sublabel }: { icon: React.ReactNode; label: string; value: string; sublabel?: string }) {
  return (
    <div className="card-premium p-5 min-w-0">
      <div className="flex items-center justify-between mb-3 gap-2">
        <span className="text-xs text-ink-muted uppercase tracking-wider font-mono truncate">{label}</span>
        <span className="shrink-0">{icon}</span>
      </div>
      <div className="font-display text-2xl sm:text-3xl font-bold text-ink truncate">{value}</div>
      {sublabel && <div className="text-xs text-ink-dim mt-1 truncate">{sublabel}</div>}
    </div>
  );
}

function BreakdownTile({
  icon,
  label,
  value,
  weight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  weight: number;
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-bg-raised border border-line">
      <div className="text-accent">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-ink-muted">{label}</div>
        <div className="font-mono font-bold text-ink text-lg leading-tight">{value}</div>
      </div>
      <div className="text-[10px] text-ink-dim font-mono shrink-0">×{weight}</div>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg className="h-7 w-7 -rotate-90" viewBox="0 0 30 30">
      <circle cx="15" cy="15" r={radius} stroke="#27272a" strokeWidth="3" fill="none" />
      <circle
        cx="15"
        cy="15"
        r={radius}
        stroke="#3b82f6"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
      />
    </svg>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  return `${day} 天前`;
}
