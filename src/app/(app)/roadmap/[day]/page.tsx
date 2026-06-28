import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Lock, ArrowLeft, ArrowRight, Flame, ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { DayDetailClient } from '@/components/roadmap/DayDetailClient';
import { ensureCurrentRoadmap } from '@/lib/roadmap/auto-regenerate';
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

  // Self-heal stale roadmap rows before reading them.
  await ensureCurrentRoadmap(supabase, user.id);

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
              <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-12">
          <Link
            href="/roadmap"
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-5 sm:mb-6"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t.roadmap.backToRoadmap}
          </Link>

          <div className="card-premium p-6 sm:p-10 text-center">
            <div className="inline-flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-ink-faint/10 border border-line-strong mb-4 sm:mb-5">
              <Lock className="h-7 w-7 sm:h-8 sm:w-8 text-ink-dim" aria-hidden />
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-dim mb-2">
              {t.roadmap.day} {dayNum} {t.roadmap.dayUnit}
            </p>
            <h1 className="font-display text-2xl sm:text-4xl font-bold mb-3 leading-tight">
              {t.roadmap.locked}
            </h1>
            <p className="text-sm sm:text-base text-ink-muted mb-6 leading-snug">
              {(t.roadmap.lockedHint as string).replace('{prev}', String(dayNum - 1))}
            </p>
            <Link
              href={`/roadmap/${dayNum - 1}`}
              className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover shadow-lg shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-0.5 transition-all"
            >
              {t.roadmap.day} {dayNum - 1}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </main>
    );
  }

  // -------------------------------------------------------------------
  // Unlocked state — full rich detail view
  // -------------------------------------------------------------------
  const title = isZh ? meta.title.zh : meta.title.en;
  const subtitle = isZh ? meta.subtitle.zh : meta.subtitle.en;
  const nonNegotiable = isZh ? meta.nonNegotiable.zh : meta.nonNegotiable.en;
  // Per client (Jack) — wisdom quote removed because it wasn't always
  // relevant to what the member was going through that day.

  const hasPrev = dayNum > 1;
  const hasNext = dayNum < TOTAL_DAYS;

  return (
          <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Breadcrumb */}
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-5 sm:mb-6"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {t.roadmap.backToRoadmap}
        </Link>

        {/* Header — day number + title + subtitle */}
        <div className="flex items-start gap-3 sm:gap-5 mb-6 sm:mb-8 animate-slide-up">
          <div
            className={`h-12 w-12 sm:h-16 sm:w-16 rounded-2xl flex items-center justify-center font-display text-xl sm:text-3xl font-bold shrink-0 border ${
              allDone
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-accent/10 border-accent/30 text-accent'
            }`}
          >
            {dayNum}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-ink-dim mb-1">
              {t.roadmap.day} {dayNum} {t.roadmap.dayUnit} · {(t.roadmap.progressLabel as string)
                .replace('{completed}', String(completed))
                .replace('{total}', String(total))}
            </p>
            <h1 className="font-display text-xl sm:text-3xl font-bold tracking-tight leading-tight mb-1.5 sm:mb-2">
              {title}
            </h1>
            <p className="text-sm sm:text-base text-ink-muted leading-snug">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Daily non-negotiable */}
        <div className="card-premium border-flame/30 bg-gradient-to-br from-flame/10 to-flame/5 p-4 sm:p-6 mb-6 sm:mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-4 w-4 text-flame shrink-0" strokeWidth={2.5} aria-hidden />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-flame font-semibold">
              {t.roadmap.dailyNonNegotiable}
            </span>
          </div>
          <p className="text-base sm:text-lg text-ink leading-snug">
            {nonNegotiable}
          </p>
        </div>

        {/* Today's actions — interactive (client component) */}
        <div className="mb-8 sm:mb-10">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim mb-3">
            {t.roadmap.todayActions}
          </h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-ink-muted">{t.roadmap.noTasksForDay}</p>
          ) : (
            <DayDetailClient tasks={tasks} />
          )}
        </div>

        {/* Day navigation footer */}
        <nav
          aria-label="Day navigation"
          className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-t border-line pt-5 sm:pt-6"
        >
          {hasPrev ? (
            <Link
              href={`/roadmap/${dayNum - 1}`}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 h-10 sm:h-11 rounded-lg text-xs sm:text-sm text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
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
              className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 h-10 sm:h-11 rounded-lg text-xs sm:text-sm transition-colors ${
                allDone
                  ? 'bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20'
                  : 'text-ink-muted hover:text-ink hover:bg-bg-hover'
              }`}
            >
              <span className="font-mono">{dayNum + 1}</span>
              <span className="font-mono opacity-60">·</span>
              {t.roadmap.nextDay}
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          )}
        </nav>
      </main>
  );
}
