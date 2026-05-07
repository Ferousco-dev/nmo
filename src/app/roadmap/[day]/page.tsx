import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Lock, ArrowLeft, ArrowRight, Flame, ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TopNav } from '@/components/TopNav';
import { DayDetailClient } from '@/components/roadmap/DayDetailClient';
import { getRoadmapDayMeta } from '@/data/roadmap-days';
import { getT, getLocale } from '@/lib/i18n/server';
import type { UserTask } from '@/types';

export const dynamic = 'force-dynamic';

const TOTAL_DAYS = 30;

export default async function RoadmapDayPage({
  params,
}: {
  params: { day: string };
}) {
  const dayNum = parseInt(params.day, 10);
  if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > TOTAL_DAYS) {
    notFound();
  }

  const t = getT();
  const locale = getLocale();
  const isZh = locale === 'zh-Hant';

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed) redirect('/onboarding');

  // Pull the current day + the previous day in one round-trip so we can
  // tell whether THIS day is unlocked (prev day must be fully complete).
  const { data: relevantTasks } = await supabase
    .from('user_tasks')
    .select('*')
    .eq('user_id', user.id)
    .in('day_number', [dayNum, dayNum - 1])
    .order('day_number', { ascending: true });

  const allTasks = (relevantTasks ?? []) as UserTask[];
  const tasks = allTasks.filter((task) => task.day_number === dayNum);
  const prevDayTasks = allTasks.filter((task) => task.day_number === dayNum - 1);

  // Locked iff: not the first day AND prev day has any incomplete tasks.
  // (Day 1 is always unlocked.)
  const isLocked =
    dayNum > 1 &&
    (prevDayTasks.length === 0 || prevDayTasks.some((task) => !task.is_completed));

  const meta = getRoadmapDayMeta(dayNum);
  const completed = tasks.filter((task) => task.is_completed).length;
  const total = tasks.length;
  const allDone = total > 0 && completed === total;

  // -------------------------------------------------------------------
  // Locked state — render a slim "go finish day N-1 first" view
  // -------------------------------------------------------------------
  if (isLocked) {
    return (
      <div className="min-h-screen">
        <TopNav />
        <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12">
          <Link
            href="/roadmap"
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-6"
          >
            <ChevronLeft className="h-4 w-4" />
            {t.roadmap.backToRoadmap}
          </Link>

          <div className="card-premium p-8 sm:p-10 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-ink-faint/10 border border-line-strong mb-5">
              <Lock className="h-8 w-8 text-ink-dim" />
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-dim mb-2">
              {t.roadmap.day} {dayNum} {t.roadmap.dayUnit}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold mb-3">
              {t.roadmap.locked}
            </h1>
            <p className="text-ink-muted mb-6">
              {(t.roadmap.lockedHint as string).replace('{prev}', String(dayNum - 1))}
            </p>
            <Link
              href={`/roadmap/${dayNum - 1}`}
              className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover shadow-lg shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-0.5 transition-all"
            >
              {t.roadmap.day} {dayNum - 1}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Unlocked state — full rich detail view
  // -------------------------------------------------------------------
  const title = isZh ? meta.title.zh : meta.title.en;
  const subtitle = isZh ? meta.subtitle.zh : meta.subtitle.en;
  const nonNegotiable = isZh ? meta.nonNegotiable.zh : meta.nonNegotiable.en;
  const wisdomQuote = isZh ? meta.wisdom.quote.zh : meta.wisdom.quote.en;
  const wisdomSource = meta.wisdom.source ? (isZh ? meta.wisdom.source.zh : meta.wisdom.source.en) : null;

  const hasPrev = dayNum > 1;
  const hasNext = dayNum < TOTAL_DAYS;

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        {/* Breadcrumb */}
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-6"
        >
          <ChevronLeft className="h-4 w-4" />
          {t.roadmap.backToRoadmap}
        </Link>

        {/* Header — day number + title + subtitle */}
        <div className="flex items-start gap-4 sm:gap-5 mb-8 animate-slide-up">
          <div
            className={`h-14 w-14 sm:h-16 sm:w-16 rounded-2xl flex items-center justify-center font-display text-2xl sm:text-3xl font-bold shrink-0 border ${
              allDone
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-accent/10 border-accent/30 text-accent'
            }`}
          >
            {dayNum}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim mb-1">
              {t.roadmap.day} {dayNum} {t.roadmap.dayUnit} · {(t.roadmap.progressLabel as string)
                .replace('{completed}', String(completed))
                .replace('{total}', String(total))}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-2">
              {title}
            </h1>
            <p className="text-sm sm:text-base text-ink-muted leading-snug">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Daily non-negotiable */}
        <div className="card-premium border-flame/30 bg-gradient-to-br from-flame/10 to-flame/5 p-5 sm:p-6 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-4 w-4 text-flame" strokeWidth={2.5} />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-flame font-semibold">
              {t.roadmap.dailyNonNegotiable}
            </span>
          </div>
          <p className="text-base sm:text-lg text-ink leading-snug">
            {nonNegotiable}
          </p>
        </div>

        {/* Today's actions — interactive (client component) */}
        <div className="mb-10">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim mb-3">
            {t.roadmap.todayActions}
          </h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-ink-muted">No tasks for this day.</p>
          ) : (
            <DayDetailClient tasks={tasks} />
          )}
        </div>

        {/* Wisdom */}
        <div className="card-premium border-warn/30 bg-gradient-to-br from-warn/8 to-transparent p-5 sm:p-6 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-warn font-semibold">
              {t.roadmap.wisdom}
            </span>
          </div>
          <p className="font-display italic text-lg sm:text-xl leading-snug text-ink mb-2">
            &ldquo;{wisdomQuote}&rdquo;
          </p>
          <p className="text-xs text-ink-dim">
            — {meta.wisdom.author}
            {wisdomSource && <span className="text-ink-faint"> · {wisdomSource}</span>}
          </p>
        </div>

        {/* Day navigation footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line pt-6">
          {hasPrev ? (
            <Link
              href={`/roadmap/${dayNum - 1}`}
              className="inline-flex items-center gap-2 px-4 h-11 rounded-lg text-sm text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.roadmap.prevDay}
              <span className="font-mono text-ink-dim">·</span>
              <span className="font-mono">{dayNum - 1}</span>
            </Link>
          ) : (
            <span />
          )}
          {hasNext && (
            <Link
              href={`/roadmap/${dayNum + 1}`}
              className={`inline-flex items-center gap-2 px-4 h-11 rounded-lg text-sm transition-colors ${
                allDone
                  ? 'bg-accent text-white hover:bg-accent-hover'
                  : 'text-ink-muted hover:text-ink hover:bg-bg-hover'
              }`}
            >
              <span className="font-mono">{dayNum + 1}</span>
              <span className="font-mono opacity-60">·</span>
              {t.roadmap.nextDay}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
