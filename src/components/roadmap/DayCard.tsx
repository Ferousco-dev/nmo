'use client';

import { useState } from 'react';
import { ChevronDown, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskItem } from './TaskItem';
import type { UserTask } from '@/types';

interface DayCardProps {
  day: number;
  tasks: UserTask[];
  defaultOpen?: boolean;
}

export function DayCard({ day, tasks, defaultOpen = false }: DayCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const completed = tasks.filter((t) => t.is_completed).length;
  const total = tasks.length;
  const allDone = total > 0 && completed === total;

  return (
    <div
      className={cn(
        'card-premium overflow-hidden transition-all',
        allDone && 'border-success/30 bg-gradient-to-br from-success/5 to-transparent'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-bg-hover/50 transition-colors"
      >
        <div
          className={cn(
            'h-12 w-12 rounded-xl flex items-center justify-center font-display text-xl font-bold shrink-0 border',
            allDone
              ? 'bg-success/10 border-success/30 text-success'
              : completed > 0
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-bg-raised border-line-strong text-ink-muted'
          )}
        >
          {day}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-ink">
              第 {day} 天
            </h3>
            {allDone ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : completed > 0 ? (
              <span className="text-xs text-accent font-mono">
                {completed}/{total}
              </span>
            ) : (
              <Circle className="h-4 w-4 text-ink-faint" />
            )}
          </div>
          <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-1">
            {allDone ? (
              <>
                <Sparkles className="h-3 w-3 text-success" />
                <span>已全部完成</span>
              </>
            ) : (
              `${completed} / ${total} 項任務完成`
            )}
          </p>
        </div>

        <ChevronDown
          className={cn(
            'h-5 w-5 text-ink-muted transition-transform shrink-0',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-2 animate-fade-in">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
