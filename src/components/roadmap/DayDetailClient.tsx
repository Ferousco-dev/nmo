'use client';

// Interactive task list for the rich day detail page. Mirrors the
// design from the product reference: each row shows a checkbox + the
// task text + a Skool resource pill that opens the linked classroom
// module in a new tab.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT, useLocale } from '@/lib/i18n/client';
import { resourcePillLabel } from '@/data/roadmap-days';
import { cn } from '@/lib/utils';
import type { UserTask } from '@/types';

export function DayDetailClient({ tasks }: { tasks: UserTask[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();
  const isZh = locale === 'zh-Hant';

  // Local optimistic state — keyed by task_id so we render fast
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tasks.map((task) => [task.task_id, task.is_completed]))
  );

  const toggle = async (task: UserTask) => {
    const next = !optimistic[task.task_id];
    setOptimistic((prev) => ({ ...prev, [task.task_id]: next }));

    const rpc = next ? 'complete_task' : 'uncomplete_task';
    const { data, error } = await supabase.rpc(rpc, { p_task_id: task.task_id });
    if (error || (data && !data.success)) {
      // Revert on failure
      setOptimistic((prev) => ({ ...prev, [task.task_id]: !next }));
      return;
    }
    startTransition(() => {
      router.refresh();
    });
  };

  const allDone = tasks.length > 0 && tasks.every((task) => optimistic[task.task_id]);

  return (
    <ul className="space-y-3">
      {tasks.map((task, index) => {
        const isDone = optimistic[task.task_id];
        const pill = resourcePillLabel(index);
        const pillLabel = isZh ? pill.label.zh : pill.label.en;
        return (
          <li key={task.id} className="group">
            <div
              className={cn(
                'flex items-start gap-3 p-4 rounded-xl border transition-all',
                isDone
                  ? 'bg-success/5 border-success/20'
                  : 'bg-bg-raised border-line hover:border-line-strong'
              )}
            >
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => toggle(task)}
                disabled={isPending}
                aria-label={isDone ? t.roadmap.markIncomplete : t.roadmap.markComplete}
                className={cn(
                  'mt-0.5 h-6 w-6 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
                  isDone
                    ? 'bg-success border-success'
                    : 'border-line-strong hover:border-accent group-hover:border-accent/60'
                )}
              >
                {isDone && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
              </button>

              {/* Body — text + resource pill underneath */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-sm sm:text-base leading-snug transition-all',
                    isDone ? 'text-ink-muted line-through' : 'text-ink'
                  )}
                >
                  {task.task_title}
                </p>
                {task.task_description && (
                  <p
                    className={cn(
                      'text-xs sm:text-sm mt-1 leading-snug',
                      isDone ? 'text-ink-faint' : 'text-ink-muted'
                    )}
                  >
                    {task.task_description}
                  </p>
                )}
                {task.skool_lesson_url && (
                  <a
                    href={task.skool_lesson_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                      'bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20'
                    )}
                  >
                    <span aria-hidden>{pill.emoji}</span>
                    <span>{pillLabel}</span>
                    <ExternalLink className="h-3 w-3 opacity-70" />
                  </a>
                )}
              </div>
            </div>
          </li>
        );
      })}

      {allDone && (
        <li className="mt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-success/30 bg-success/5 text-xs font-medium text-success animate-fade-in">
            <Sparkles className="h-3.5 w-3.5" />
            {t.roadmap.allDoneCelebration}
          </div>
        </li>
      )}
    </ul>
  );
}
