import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Activity, FileText, MessageSquare, Reply, Heart, ExternalLink, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TopNav } from '@/components/TopNav';
import { getT } from '@/lib/i18n/server';
import type { EngagementEventType } from '@/types';

const EVENT_ICONS: Record<EngagementEventType, React.ComponentType<{ className?: string }>> = {
  post: FileText,
  comment: MessageSquare,
  reply: Reply,
  like: Heart,
};

const EVENT_WEIGHTS: Record<EngagementEventType, number> = {
  post: 10,
  comment: 5,
  reply: 3,
  like: 1,
};

export default async function ActivityPage() {
  const t = getT();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [profileRes, gradeAllRes, gradeRecentRes, eventsRes, lastBotRunRes, rankRes] = await Promise.all([
    supabase.from('profiles').select('skool_handle, skool_avatar_url, skool_display_name, skool_membership_status').eq('id', user.id).single(),
    supabase.from('engagement_grades').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('engagement_grades_recent').select('*').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('engagement_events')
      .select('id, event_type, source_id, target_post_id, target_post_url, content_excerpt, occurred_at')
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: false })
      .limit(50),
    supabase
      .from('bot_runs')
      .select('finished_at, status, posts_seen, events_inserted')
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('engagement_grades')
      .select('user_id, engagement_score')
      .order('engagement_score', { ascending: false }),
  ]);

  const profile = profileRes.data;
  const gradeAll = gradeAllRes.data;
  const gradeRecent = gradeRecentRes.data;
  const events = eventsRes.data || [];
  const lastBotRun = lastBotRunRes.data;
  const allRanks = rankRes.data || [];
  const myRank = allRanks.findIndex((r) => r.user_id === user.id) + 1; // 0 means not found

  if (!profile?.skool_handle) {
    return (
      <div className="min-h-screen">
        <TopNav />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <div className="card-premium p-8 text-center">
            <Activity className="h-12 w-12 text-accent mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold mb-2">{t.activity.title}</h1>
            <p className="text-ink-muted mb-6">請先連結您的 Skool 帳戶以開始追蹤活躍度。</p>
            <Link href="/onboarding" className="text-accent hover:text-accent-glow font-medium">
              前往連結 →
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const score = gradeRecent?.engagement_score ?? 0;
  const allTimeScore = gradeAll?.engagement_score ?? 0;

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up">
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
            <span className="gradient-text">{t.activity.title}</span>
          </h1>
          <p className="mt-3 text-ink-muted">{t.activity.subtitle}</p>
        </div>

        {/* Score cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card-premium p-6">
            <div className="text-xs text-ink-muted uppercase tracking-wider font-mono mb-2">
              {t.activity.last30Days}
            </div>
            <div className="font-display text-5xl font-bold gradient-text">
              {score.toLocaleString()}
            </div>
            <div className="text-xs text-ink-dim mt-1">{t.activity.score}</div>
          </div>
          <div className="card-premium p-6">
            <div className="text-xs text-ink-muted uppercase tracking-wider font-mono mb-2">
              {t.activity.allTime}
            </div>
            <div className="font-display text-5xl font-bold text-ink">
              {allTimeScore.toLocaleString()}
            </div>
            <div className="text-xs text-ink-dim mt-1">{t.activity.score}</div>
          </div>
          <div className="card-premium p-6">
            <div className="text-xs text-ink-muted uppercase tracking-wider font-mono mb-2">
              {t.activity.rank}
            </div>
            <div className="font-display text-5xl font-bold text-accent">
              {myRank > 0 ? `#${myRank}` : '—'}
            </div>
            <div className="text-xs text-ink-dim mt-1">/ {allRanks.length} 位成員</div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="card-premium p-6 md:p-8 mb-6">
          <h2 className="font-display text-xl font-bold mb-1">{t.activity.breakdown}</h2>
          <p className="text-xs text-ink-dim mb-5">{t.activity.weights}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BreakdownTile type="post" count={gradeAll?.posts_count ?? 0} />
            <BreakdownTile type="comment" count={gradeAll?.comments_count ?? 0} />
            <BreakdownTile type="reply" count={gradeAll?.replies_count ?? 0} />
            <BreakdownTile type="like" count={gradeAll?.likes_count ?? 0} />
          </div>
        </div>

        {/* Bot status */}
        <div className="card-premium p-5 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <RefreshCw className={`h-5 w-5 ${lastBotRun ? 'text-success' : 'text-ink-dim'}`} />
            <div>
              <div className="text-xs text-ink-muted uppercase tracking-wider font-mono">
                {t.activity.botStatus}
              </div>
              <div className="text-sm text-ink mt-0.5">
                {lastBotRun?.finished_at
                  ? `${t.activity.lastSync}: ${formatRelative(lastBotRun.finished_at)}`
                  : t.activity.neverSynced}
              </div>
            </div>
          </div>
          {lastBotRun && (
            <div className="text-right text-xs text-ink-dim">
              <div>偵測 {lastBotRun.posts_seen ?? 0} 篇貼文</div>
              <div>新增 {lastBotRun.events_inserted ?? 0} 則互動</div>
            </div>
          )}
        </div>

        {/* Recent events */}
        <div className="card-premium p-6 md:p-8">
          <h2 className="font-display text-xl font-bold mb-5">{t.activity.recentEvents}</h2>
          {events.length === 0 ? (
            <p className="text-ink-muted text-center py-8 text-sm">{t.activity.noEvents}</p>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => {
                const Icon = EVENT_ICONS[e.event_type as EngagementEventType] || Activity;
                const weight = EVENT_WEIGHTS[e.event_type as EngagementEventType] ?? 0;
                return (
                  <li key={e.id} className="flex items-start gap-3 p-3 rounded-lg bg-bg-raised border border-line-subtle">
                    <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink">
                        {t.activity.eventTypeLabels[e.event_type as EngagementEventType] || e.event_type}
                        <span className="ml-2 text-xs text-ink-dim">+{weight} 分</span>
                      </div>
                      {e.content_excerpt && (
                        <div className="text-xs text-ink-muted mt-0.5 line-clamp-2">{e.content_excerpt}</div>
                      )}
                      <div className="text-xs text-ink-dim mt-1 flex items-center gap-2">
                        <span>{formatRelative(e.occurred_at)}</span>
                        {e.target_post_url && (
                          <a
                            href={e.target_post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-accent hover:text-accent-glow"
                          >
                            <ExternalLink className="h-3 w-3" />
                            原文
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </main>
    </div>
  );
}

function BreakdownTile({ type, count }: { type: EngagementEventType; count: number }) {
  const t = getT();
  const Icon = EVENT_ICONS[type];
  const weight = EVENT_WEIGHTS[type];
  const label = t.activity.eventTypeLabels[type];
  return (
    <div className="p-4 rounded-lg bg-bg-raised border border-line">
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-5 w-5 text-accent" />
        <span className="text-[10px] font-mono text-ink-dim">×{weight}</span>
      </div>
      <div className="font-display text-3xl font-bold text-ink">{count}</div>
      <div className="text-xs text-ink-muted mt-0.5">{label}</div>
      <div className="text-xs text-accent font-mono mt-1">{count * weight} 分</div>
    </div>
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
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString('zh-Hant');
}
