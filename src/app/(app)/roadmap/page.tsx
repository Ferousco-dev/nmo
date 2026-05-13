import { Fragment } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DayCard } from '@/components/roadmap/DayCard';
import { TRACK_NAMES_ZH } from '@/lib/roadmap/generator';
import { ensureCurrentRoadmap } from '@/lib/roadmap/auto-regenerate';
import { getT } from '@/lib/i18n/server';
import type { UserTask } from '@/types';

const WEEK_BOUNDARIES = [1, 8, 15, 22, 29] as const;

function weekIndexForDay(day: number): number {
  if (day >= 29) return 4;
  return Math.floor((day - 1) / 7);
}

function weekRangeLabel(weekIndex: number): string {
  if (weekIndex === 4) return 'Day 29 – 30';
  const start = weekIndex * 7 + 1;
  const end = start + 6;
  return `Day ${start} – ${end}`;
}

export default async function RoadmapPage() {
  const t = getT();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('track_assigned, onboarding_completed')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_completed) redirect('/onboarding');

  // Self-heal stale roadmap rows before reading them.
  await ensureCurrentRoadmap(supabase, user.id);

  const { data: tasks } = await supabase
    .from('user_tasks')
    .select('*')
    .eq('user_id', user.id)
    .order('day_number', { ascending: true });

  const allTasks = (tasks || []) as UserTask[];

  // Group by day
  const tasksByDay = new Map<number, UserTask[]>();
  for (let d = 1; d <= 30; d++) tasksByDay.set(d, []);
  for (const task of allTasks) {
    tasksByDay.get(task.day_number)?.push(task);
  }

  const trackLabel = profile.track_assigned ? TRACK_NAMES_ZH[profile.track_assigned] : '';
  const totalCompleted = allTasks.filter((t) => t.is_completed).length;
  const totalTasks = allTasks.length;

  return (
          <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up">
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
            <span className="gradient-text">{t.roadmap.title}</span>
          </h1>
          <p className="mt-3 text-ink-muted">{t.roadmap.subtitle}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 font-mono">
              {trackLabel}
            </span>
            <span className="text-ink-muted">
              {(t.roadmap.tasksCompleted as string)
                .replace('{done}', String(totalCompleted))
                .replace('{total}', String(totalTasks))}
            </span>
          </div>
        </div>

        {/* Vertical timeline with connecting line */}
        <div className="relative space-y-3">
          <div className="absolute left-[2.6rem] top-12 bottom-12 w-px bg-gradient-to-b from-line-strong via-line to-transparent pointer-events-none" />
          {Array.from({ length: 30 }).map((_, i) => {
            const day = i + 1;
            const dayTasks = tasksByDay.get(day) || [];
            const isWeekStart = (WEEK_BOUNDARIES as readonly number[]).includes(day);
            const weekIdx = weekIndexForDay(day);
            const weekStart = WEEK_BOUNDARIES[weekIdx];
            const weekEnd = weekIdx === 4 ? 30 : weekStart + 6;
            const weekTasks = allTasks.filter(
              (task) => task.day_number >= weekStart && task.day_number <= weekEnd
            );
            const weekDone = weekTasks.filter((task) => task.is_completed).length;

            // Locked iff: not the first day AND prev day has any incomplete tasks
            const prevDayTasks = tasksByDay.get(day - 1) || [];
            const isLocked =
              day > 1 &&
              (prevDayTasks.length === 0 || prevDayTasks.some((task) => !task.is_completed));

            return (
              <Fragment key={day}>
                {isWeekStart && (
                  <WeekDivider
                    label={t.roadmap.weeks[weekIdx]}
                    range={weekRangeLabel(weekIdx)}
                    done={weekDone}
                    total={weekTasks.length}
                  />
                )}
                <DayCard day={day} tasks={dayTasks} locked={isLocked} />
              </Fragment>
            );
          })}
        </div>
      </main>
  );
}

function WeekDivider({
  label,
  range,
  done,
  total,
}: {
  label: string;
  range: string;
  done: number;
  total: number;
}) {
  const t = getT();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="relative pt-6 pb-2 first:pt-0">
      <div className="flex items-end justify-between gap-4 mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-mono text-ink-dim">
            {range}
          </div>
          <h2 className="font-display text-xl md:text-2xl font-bold gradient-text">
            {label}
          </h2>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-[0.2em] font-mono text-ink-dim">
            {t.roadmap.weekProgress}
          </div>
          <div className="text-sm font-mono text-ink">
            <span className="text-accent font-bold">{done}</span>
            <span className="text-ink-muted"> / {total}</span>
            <span className="ml-2 text-ink-muted">({pct}%)</span>
          </div>
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-accent/40 via-line to-transparent" />
    </div>
  );
}
