'use client';

// Compact day card for the /roadmap timeline. Clicking it opens the
// rich /roadmap/[day] detail page. Days are sequentially locked: Day N
// is unlocked iff Day N-1 has every task complete (Day 1 is always
// unlocked).

import Link from 'next/link';
import { CheckCircle2, Circle, ChevronRight, Lock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserTask } from '@/types';

interface DayCardProps {
  day: number;
  tasks: UserTask[];
  /** True iff the previous day is not yet fully complete (and day > 1) */
  locked?: boolean;
}

export function DayCard({ day, tasks, locked = false }: DayCardProps) {
  const completed = tasks.filter((task) => task.is_completed).length;
  const total = tasks.length;
  const allDone = total > 0 && completed === total;

  const inner = (
    <div
      className={cn(
        'card-premium overflow-hidden transition-all flex items-center gap-4 p-4 sm:p-5',
        allDone && 'border-success/30 bg-gradient-to-br from-success/5 to-transparent',
        locked && 'opacity-60',
        !locked && 'group hover:border-accent/40 hover:bg-bg-hover/40 cursor-pointer'
      )}
    >
      {/* Day number badge */}
      <div
        className={cn(
          'h-12 w-12 rounded-xl flex items-center justify-center font-display text-xl font-bold shrink-0 border',
          allDone
            ? 'bg-success/10 border-success/30 text-success'
            : locked
            ? 'bg-bg-raised border-line text-ink-faint'
            : completed > 0
            ? 'bg-accent/10 border-accent/30 text-accent'
            : 'bg-bg-raised border-line-strong text-ink-muted'
        )}
      >
        {locked ? <Lock className="h-5 w-5" /> : day}
      </div>

      {/* Title + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={cn('font-semibold', locked ? 'text-ink-muted' : 'text-ink')}>
            第 {day} 天
          </h3>
          {!locked && allDone && <CheckCircle2 className="h-4 w-4 text-success" />}
          {!locked && !allDone && completed > 0 && (
            <span className="text-xs text-accent font-mono">
              {completed}/{total}
            </span>
          )}
          {!locked && !allDone && completed === 0 && (
            <Circle className="h-4 w-4 text-ink-faint" />
          )}
        </div>
        <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-1">
          {locked ? (
            '尚未解鎖'
          ) : allDone ? (
            <>
              <Sparkles className="h-3 w-3 text-success" />
              <span>已全部完成</span>
            </>
          ) : (
            `${completed} / ${total} 項任務完成`
          )}
        </p>
      </div>

      {/* Chevron — only when clickable */}
      {!locked && (
        <ChevronRight className="h-5 w-5 text-ink-dim group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
      )}
    </div>
  );

  // Locked: render the card non-interactively
  if (locked) {
    return inner;
  }

  // Unlocked: link to the detail page
  return (
    <Link href={`/roadmap/${day}`} className="block">
      {inner}
    </Link>
  );
}
