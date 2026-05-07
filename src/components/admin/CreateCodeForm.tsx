'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function CreateCodeForm() {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [code, setCode] = useState('');
  const [points, setPoints] = useState('');
  const [description, setDescription] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pInt = parseInt(points, 10);
    if (!code.trim() || !Number.isFinite(pInt) || pInt <= 0) {
      setFeedback({ kind: 'err', text: 'Enter a code + positive points' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    const { data, error } = await supabase.rpc('admin_create_event_code', {
      p_code: code.trim().toUpperCase(),
      p_points: pInt,
      p_description: description.trim() || null,
      p_max_uses: maxUses ? parseInt(maxUses, 10) : null,
      p_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    setSubmitting(false);
    if (error || !data?.success) {
      setFeedback({ kind: 'err', text: error?.message || data?.error || 'Failed' });
      return;
    }
    setFeedback({ kind: 'ok', text: `${t.admin.codes.success} ${data.code}` });
    setCode('');
    setPoints('');
    setDescription('');
    setMaxUses('');
    setExpiresAt('');
    startTransition(() => router.refresh());
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t.admin.codes.codeLabel}
          className="h-11 px-4 rounded-lg bg-bg-raised border border-line-strong text-ink font-mono uppercase tracking-widest placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
          maxLength={20}
          required
        />
        <input
          type="number"
          inputMode="numeric"
          step="1"
          min="1"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          placeholder={t.admin.codes.pointsLabel}
          className="h-11 px-4 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
          required
        />
      </div>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t.admin.codes.descriptionLabel}
        className="w-full h-11 px-4 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="number"
          inputMode="numeric"
          step="1"
          min="1"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder={t.admin.codes.maxUsesLabel}
          className="h-11 px-4 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
        />
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          placeholder={t.admin.codes.expiresLabel}
          className="h-11 px-4 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg font-medium text-sm transition-all',
            submitting
              ? 'bg-bg-raised text-ink-dim cursor-not-allowed'
              : 'bg-accent text-white hover:bg-accent-hover'
          )}
        >
          <Plus className="h-4 w-4" />
          {submitting ? t.admin.codes.submitting : t.admin.codes.submit}
        </button>
        {feedback && (
          <span className={cn('text-xs font-mono', feedback.kind === 'ok' ? 'text-success' : 'text-danger')}>
            {feedback.text}
          </span>
        )}
      </div>
    </form>
  );
}
