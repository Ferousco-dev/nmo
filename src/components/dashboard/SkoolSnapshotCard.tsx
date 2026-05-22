'use client';

// Live per-user Skool profile snapshot, fetched on dashboard mount.
// Surfaces location / bio / Skool-level / recent posts straight from
// Skool's own data routes via /api/me/skool-snapshot. All error
// states render as a single clean card — no toasts, no blocking.

import { useEffect, useState } from 'react';
import { MapPin, FileText, Heart, MessageSquare, Sparkles, AlertTriangle, ExternalLink } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

interface Snapshot {
  handle: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;
  skoolPts: number | null;
  skoolLv: number | null;
  lastOffline: number | null;
  recentPosts: Array<{
    id: string;
    title: string | null;
    upvotes: number;
    comments: number;
    createdAt: string;
  }>;
}

type State =
  | { kind: 'loading' }
  | { kind: 'no_handle' }
  | { kind: 'ok'; snapshot: Snapshot }
  | { kind: 'error'; code: string };

export function SkoolSnapshotCard() {
  const t = useT();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/skool-snapshot');
        const j = await res.json();
        if (cancelled) return;
        if (!j.ok) {
          setState({ kind: 'error', code: j.error ?? 'unknown' });
          return;
        }
        if (!j.hasHandle) {
          setState({ kind: 'no_handle' });
          return;
        }
        setState({ kind: 'ok', snapshot: j.snapshot });
      } catch {
        if (!cancelled) setState({ kind: 'error', code: 'network' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <div className="card-premium p-5 mb-6 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-bg-raised" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-bg-raised" />
            <div className="h-3 w-1/2 rounded bg-bg-raised" />
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === 'no_handle') {
    return (
      <div className="card-premium p-5 mb-6 border-warn/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warn shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-ink">{t.skoolSnapshot.noHandleTitle}</p>
            <p className="text-ink-muted mt-1">{t.skoolSnapshot.noHandleHint}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    const msg =
      state.code === 'skool_auth_expired'
        ? t.skoolSnapshot.errorAuth
        : state.code === 'skool_geo_blocked'
          ? t.skoolSnapshot.errorGeo
          : state.code === 'no_auth_token'
            ? t.skoolSnapshot.errorNoToken
            : t.skoolSnapshot.errorGeneric;
    return (
      <div className="card-premium p-5 mb-6 border-danger/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-ink">{t.skoolSnapshot.errorTitle}</p>
            <p className="text-ink-muted mt-1">{msg}</p>
            <p className="text-[10px] font-mono text-ink-dim mt-1">code: {state.code}</p>
          </div>
        </div>
      </div>
    );
  }

  const s = state.snapshot;
  const fullName = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.handle;
  const lastOfflineDate = s.lastOffline ? new Date(s.lastOffline / 1000) : null;
  const totalLikes = s.recentPosts.reduce((sum, p) => sum + p.upvotes, 0);
  const totalComments = s.recentPosts.reduce((sum, p) => sum + p.comments, 0);

  return (
    <div className="card-premium p-5 sm:p-6 mb-6 border-accent/20">
      {/* Header — avatar + name + skool link */}
      <div className="flex items-start gap-4 mb-4">
        {s.avatarUrl ? (
          <img
            src={s.avatarUrl}
            alt=""
            className="h-14 w-14 rounded-full object-cover ring-2 ring-accent/30 shrink-0"
          />
        ) : (
          <div className="h-14 w-14 rounded-full bg-bg-raised border border-line flex items-center justify-center text-ink-muted shrink-0">
            {fullName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-ink truncate">{fullName}</h3>
            {s.skoolLv != null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 border border-accent/30 text-[11px] font-mono text-accent">
                <Sparkles className="h-3 w-3" /> Skool Lv {s.skoolLv}
              </span>
            )}
          </div>
          <a
            href={`https://www.skool.com/@${s.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-ink-dim font-mono hover:text-accent inline-flex items-center gap-1"
          >
            @{s.handle}
            <ExternalLink className="h-3 w-3" />
          </a>
          {s.bio && (
            <p className="text-sm text-ink-muted mt-2 line-clamp-2 leading-snug">{s.bio}</p>
          )}
        </div>
      </div>

      {/* Stat strip — location / last seen / Skool pts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4 text-xs">
        {s.location && (
          <StatRow icon={<MapPin className="h-3.5 w-3.5" />} label={t.skoolSnapshot.location} value={s.location} />
        )}
        {lastOfflineDate && (
          <StatRow
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label={t.skoolSnapshot.lastSeen}
            value={relTime(lastOfflineDate, t.skoolSnapshot.justNow)}
          />
        )}
        {s.skoolPts != null && (
          <StatRow
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label={t.skoolSnapshot.skoolPts}
            value={s.skoolPts.toLocaleString()}
          />
        )}
      </div>

      {/* Recent posts */}
      <div className="border-t border-line/50 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            {t.skoolSnapshot.recentPosts} · {s.recentPosts.length}
          </h4>
          {s.recentPosts.length > 0 && (
            <span className="text-[11px] font-mono text-ink-dim">
              <Heart className="h-3 w-3 inline" /> {totalLikes} ·{' '}
              <MessageSquare className="h-3 w-3 inline" /> {totalComments}
            </span>
          )}
        </div>
        {s.recentPosts.length === 0 ? (
          <p className="text-xs text-ink-muted py-2 text-center">{t.skoolSnapshot.noPosts}</p>
        ) : (
          <ul className="space-y-1.5">
            {s.recentPosts.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink transition-colors"
              >
                <FileText className="h-3 w-3 text-ink-dim shrink-0" />
                <span className="truncate flex-1">
                  {p.title || `Post · ${new Date(p.createdAt).toLocaleDateString()}`}
                </span>
                <span className="font-mono text-[10px] text-ink-dim shrink-0">
                  <Heart className="h-2.5 w-2.5 inline" /> {p.upvotes} ·{' '}
                  <MessageSquare className="h-2.5 w-2.5 inline" /> {p.comments}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-ink-muted">
      <span className="text-ink-dim shrink-0">{icon}</span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">{label}</span>
      <span className={cn('text-ink truncate')}>{value}</span>
    </div>
  );
}

function relTime(d: Date, justNowLabel: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return justNowLabel;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
