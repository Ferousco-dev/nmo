'use client';

// Super-admin: search by handle/email/name, award (or deduct) points.

import { useEffect, useState } from 'react';
import { Search, Gift, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useT } from '@/lib/i18n/client';

interface ProfileHit {
  id: string;
  email: string | null;
  display_name: string | null;
  skool_handle: string | null;
  skool_avatar_url: string | null;
  total_points: number | null;
}

export function AwardPointsClient() {
  const t = useT();
  const supabase = createClient();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProfileHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ProfileHit | null>(null);
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Debounced search on the profiles table — by skool_handle / email /
  // display_name. RLS already restricts profiles to admins/self, but
  // is_super_admin sees all rows.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const like = `%${q}%`;
      const { data } = await supabase
        .from('profiles')
        .select('id, email, display_name, skool_handle, skool_avatar_url, total_points')
        .or(`skool_handle.ilike.${like},email.ilike.${like},display_name.ilike.${like}`)
        .limit(10);
      setHits((data ?? []) as ProfileHit[]);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, supabase]);

  const onAward = async () => {
    if (!picked) return;
    const n = parseInt(points, 10);
    if (!Number.isFinite(n) || n === 0) {
      setFlash({ kind: 'err', msg: 'Points must be a non-zero number.' });
      return;
    }
    setSubmitting(true);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/award-points', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: picked.id, points: n, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        awarded?: number;
      };
      if (!res.ok || !data.ok) {
        setFlash({ kind: 'err', msg: data.detail ?? data.error ?? 'Failed to award' });
        return;
      }
      setFlash({
        kind: 'ok',
        msg: `Awarded ${data.awarded} pts to ${picked.display_name || picked.skool_handle || picked.email}.`,
      });
      // Refresh the picked user's local total_points display
      setPicked({ ...picked, total_points: (picked.total_points ?? 0) + (data.awarded ?? 0) });
      setPoints('');
      setReason('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6 text-accent" />
          {t.admin.awardPoints.title}
        </h1>
        <p className="text-sm text-ink-muted">{t.admin.awardPoints.subtitle}</p>
      </div>

      <div className="card-premium p-5 space-y-4">
        <Input
          label={t.admin.awardPoints.searchLabel}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.admin.awardPoints.searchPlaceholder}
          autoComplete="off"
        />

        {searching && (
          <p className="text-xs text-ink-dim flex items-center gap-2">
            <Search className="h-3 w-3 animate-pulse" /> {t.admin.awardPoints.searching}
          </p>
        )}

        {hits.length > 0 && !picked && (
          <ul className="border border-line rounded-md divide-y divide-line/50 max-h-80 overflow-y-auto">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => {
                    setPicked(h);
                    setHits([]);
                    setQuery('');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-bg-raised flex items-center gap-3"
                >
                  {h.skool_avatar_url ? (
                    <img src={h.skool_avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-bg-raised border border-line" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink truncate">{h.display_name || h.skool_handle || h.email}</div>
                    <div className="text-xs text-ink-dim font-mono truncate">
                      {h.skool_handle ? `@${h.skool_handle}` : ''} · {h.email}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-ink-muted">{h.total_points ?? 0} pts</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {picked && (
        <div className="card-premium p-5 space-y-4 border-accent/30">
          <div className="flex flex-wrap items-center gap-3">
            {picked.skool_avatar_url ? (
              <img src={picked.skool_avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-bg-raised border border-line" />
            )}
            <div className="flex-1 min-w-[150px]">
              <div className="font-semibold text-ink truncate">
                {picked.display_name || picked.skool_handle || picked.email}
              </div>
              <div className="text-xs text-ink-dim font-mono truncate">
                {picked.skool_handle ? `@${picked.skool_handle}` : ''} · {picked.email}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-ink-dim">{t.admin.awardPoints.currentLabel}</div>
              <div className="text-lg font-mono font-bold text-ink">{picked.total_points ?? 0}</div>
            </div>
            <button
              onClick={() => setPicked(null)}
              className="text-xs text-ink-dim hover:text-ink shrink-0"
            >
              {t.admin.awardPoints.changeLink}
            </button>
          </div>

          <Input
            label={t.admin.awardPoints.pointsLabel}
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder={t.admin.awardPoints.pointsPlaceholder}
            inputMode="numeric"
          />
          <Input
            label={t.admin.awardPoints.reasonLabel}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.admin.awardPoints.reasonPlaceholder}
          />

          <Button onClick={onAward} loading={submitting} disabled={!points} size="lg" className="w-full">
            {submitting ? t.admin.awardPoints.submitting : t.admin.awardPoints.submit}
          </Button>
        </div>
      )}

      {flash && (
        <div
          className={`card-premium p-4 flex items-start gap-3 ${
            flash.kind === 'ok' ? 'border-success/30' : 'border-danger/30'
          }`}
        >
          {flash.kind === 'ok' ? (
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-danger shrink-0" />
          )}
          <p className="text-sm text-ink">{flash.msg}</p>
        </div>
      )}
    </div>
  );
}
