'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

interface ApiResponse {
  ok?: boolean;
  error?: string;
  hint?: string;
  apify_run_id?: string;
  handle?: string;
}

export function RefreshEngagementButton() {
  const t = useT();
  const r = t.activity.refresh;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err' | 'queued'; text: string } | null>(
    null
  );

  const click = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/me/refresh-engagement', { method: 'POST' });
      const data = (await res.json()) as ApiResponse;

      if (res.ok && data.ok) {
        setMessage({ tone: 'queued', text: r.queued });
        // The reconciler runs on each /api/admin/bot/status poll; the
        // dashboard reads from engagement_grades, so a router refresh
        // 90s later will pull the new totals.
        setTimeout(() => {
          startTransition(() => router.refresh());
        }, 90_000);
      } else if (res.status === 429) {
        setMessage({ tone: 'err', text: r.cooldown });
      } else if (data.error === 'no_handle') {
        setMessage({ tone: 'err', text: r.noHandle });
      } else if (data.error === 'settings_missing') {
        setMessage({ tone: 'err', text: r.settingsMissing });
      } else {
        setMessage({ tone: 'err', text: r.failed });
      }
    } catch {
      setMessage({ tone: 'err', text: t.common.networkError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={click}
        disabled={busy || isPending}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-colors border',
          'border-accent/30 text-accent hover:bg-accent/10',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : message?.tone === 'queued' ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {busy ? r.working : r.cta}
      </button>
      {message && (
        <span
          className={cn(
            'text-xs font-medium',
            message.tone === 'ok' && 'text-emerald-400',
            message.tone === 'queued' && 'text-accent',
            message.tone === 'err' && 'text-red-400'
          )}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
