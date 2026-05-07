'use client';

// Client-side admin actions for the member detail page:
//   - Grant or deduct points
//   - Grant a badge (from a select)
//   - Revoke a held badge (button per row)
//
// Each action calls a SECURITY DEFINER RPC; on success we router.refresh()
// so the server component re-fetches the member's state.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT, useLocale } from '@/lib/i18n/client';
import { badgeIcon } from '@/lib/badges';
import { cn } from '@/lib/utils';
import type { Badge } from '@/types';

export function GrantPointsForm({ targetUserId }: { targetUserId: string }) {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(points, 10);
    if (!Number.isFinite(parsed) || parsed === 0) {
      setFeedback({ kind: 'err', text: 'Enter a non-zero number' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    const { data, error } = await supabase.rpc('admin_grant_points', {
      p_target_user_id: targetUserId,
      p_points: parsed,
      p_reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (error || !data?.success) {
      setFeedback({ kind: 'err', text: error?.message || data?.error || 'Failed' });
      return;
    }
    setFeedback({ kind: 'ok', text: `${t.admin.member.success} (${parsed > 0 ? '+' : ''}${parsed})` });
    setPoints('');
    setReason('');
    startTransition(() => router.refresh());
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-ink-dim">{t.admin.member.grantPointsHint}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPoints((p) => String(Math.abs(parseInt(p, 10) || 0)))}
          className="h-9 w-9 rounded-lg border border-line-strong bg-bg-raised text-ink-muted hover:text-success hover:border-success/50 flex items-center justify-center transition-colors"
          aria-label="Positive"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPoints((p) => `-${Math.abs(parseInt(p, 10) || 0)}`)}
          className="h-9 w-9 rounded-lg border border-line-strong bg-bg-raised text-ink-muted hover:text-danger hover:border-danger/50 flex items-center justify-center transition-colors"
          aria-label="Negative"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          step="1"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          placeholder={t.admin.member.pointsLabel}
          className="flex-1 h-11 px-4 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
          required
        />
      </div>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t.admin.member.reasonLabel}
        className="w-full h-11 px-4 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
      />
      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={submitting || !points}
          className={cn(
            'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg font-medium text-sm transition-all',
            submitting || !points
              ? 'bg-bg-raised text-ink-dim cursor-not-allowed'
              : 'bg-accent text-white hover:bg-accent-hover'
          )}
        >
          {submitting ? t.admin.member.submitting : t.admin.member.submit}
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

export function GrantBadgeForm({
  targetUserId,
  catalog,
  earnedKeys,
}: {
  targetUserId: string;
  catalog: Badge[];
  earnedKeys: string[];
}) {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [badgeKey, setBadgeKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const grantable = catalog.filter((b) => !earnedKeys.includes(b.key));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!badgeKey) return;
    setSubmitting(true);
    setFeedback(null);
    const { data, error } = await supabase.rpc('admin_grant_badge', {
      p_target_user_id: targetUserId,
      p_badge_key: badgeKey,
      p_reason: null,
    });
    setSubmitting(false);
    if (error || !data?.success) {
      setFeedback({ kind: 'err', text: error?.message || data?.error || 'Failed' });
      return;
    }
    setFeedback({ kind: 'ok', text: t.admin.member.success });
    setBadgeKey('');
    startTransition(() => router.refresh());
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <select
        value={badgeKey}
        onChange={(e) => setBadgeKey(e.target.value)}
        className="flex-1 h-11 px-3 rounded-lg bg-bg-raised border border-line-strong text-ink focus:outline-none focus:border-accent transition-colors"
        required
      >
        <option value="">— {t.admin.member.grantBadge} —</option>
        {grantable.map((b) => (
          <option key={b.key} value={b.key}>
            {b.tier ? `Lv${b.tier} · ` : ''}{b.name_en} / {b.name_zh}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={submitting || !badgeKey}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg font-medium text-sm transition-all whitespace-nowrap',
          submitting || !badgeKey
            ? 'bg-bg-raised text-ink-dim cursor-not-allowed'
            : 'bg-accent text-white hover:bg-accent-hover'
        )}
      >
        {submitting ? t.admin.member.submitting : t.admin.member.grantBadgeCta}
      </button>
      {feedback && (
        <span className={cn('text-xs font-mono', feedback.kind === 'ok' ? 'text-success' : 'text-danger')}>
          {feedback.text}
        </span>
      )}
    </form>
  );
}

export function RevokeBadgeButton({
  targetUserId,
  badge,
}: {
  targetUserId: string;
  badge: Pick<Badge, 'key' | 'name_zh' | 'name_en' | 'icon' | 'color' | 'tier'>;
}) {
  const t = useT();
  const locale = useLocale();
  const isZh = locale === 'zh-Hant';
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const Icon = badgeIcon(badge.icon);
  const color = badge.color ?? '#71717a';
  const label = isZh ? badge.name_zh : badge.name_en;

  const revoke = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_revoke_badge', {
      p_target_user_id: targetUserId,
      p_badge_key: badge.key,
    });
    setBusy(false);
    if (error) return;
    startTransition(() => router.refresh());
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-bg-raised"
      style={{ borderColor: `${color}40` }}
    >
      <div
        className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.4} />
      </div>
      <span className="text-sm text-ink truncate flex-1">
        {badge.tier ? `Lv${badge.tier} · ` : ''}{label}
      </span>
      <button
        type="button"
        onClick={revoke}
        disabled={busy}
        aria-label={t.admin.member.revoke}
        className="h-7 w-7 rounded-md text-ink-dim hover:text-danger hover:bg-danger/10 flex items-center justify-center transition-colors disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
