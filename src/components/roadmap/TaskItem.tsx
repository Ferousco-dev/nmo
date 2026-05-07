'use client';

import { useState, useTransition } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';
import type { UserTask } from '@/types';
import { useRouter } from 'next/navigation';

export function TaskItem({ task }: { task: UserTask }) {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();
  const [optimisticDone, setOptimisticDone] = useState(task.is_completed);

  const toggle = async () => {
    const next = !optimisticDone;
    setOptimisticDone(next);

    const rpc = next ? 'complete_task' : 'uncomplete_task';
    const { data, error } = await supabase.rpc(rpc, { p_task_id: task.task_id });

    if (error || (data && !data.success)) {
      // revert on error
      setOptimisticDone(!next);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div
      className={cn(
        'group flex items-start gap-3 p-4 rounded-lg border transition-all',
        optimisticDone
          ? 'bg-accent/5 border-accent/20'
          : 'bg-bg-raised border-line hover:border-line-strong'
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-label={optimisticDone ? t.roadmap.markIncomplete : t.roadmap.markComplete}
        className={cn(
          'mt-0.5 h-6 w-6 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
          optimisticDone
            ? 'bg-accent border-accent'
            : 'border-line-strong hover:border-accent group-hover:border-accent/60'
        )}
      >
        {optimisticDone && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        <h4
          className={cn(
            'font-medium text-sm transition-all',
            optimisticDone ? 'text-ink-muted line-through' : 'text-ink'
          )}
        >
          {task.task_title}
        </h4>
        {task.task_description && (
          <p className="text-xs text-ink-muted mt-1">{task.task_description}</p>
        )}
        {task.skool_lesson_url && (
          <a
            href={task.skool_lesson_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-xs text-accent hover:text-accent-glow font-medium"
          >
            <ExternalLink className="h-3 w-3" />
            {t.roadmap.viewLesson}
          </a>
        )}
      </div>
    </div>
  );
}
