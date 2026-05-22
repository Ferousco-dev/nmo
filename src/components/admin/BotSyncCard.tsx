'use client';

// Admin-only card: live status + manual triggers for the Apify-driven
// Skool sync. All work runs on Apify; this app just kicks off runs
// and reconciles their results into the DB.
//
// Three actions are exposed:
//   1. Sync members          (apify~playwright-scraper → members list)
//   2. Backfill avatars      (apify~playwright-scraper → per-profile)
//   3. Refresh engagement    (apify~playwright-scraper → per-profile)
//
// Status auto-refreshes every 4s while a run is in flight, every 30s
// otherwise. Recent run history is read from bot_runs.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play, RefreshCw, Activity, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BotRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  posts_seen: number | null;
  events_inserted: number | null;
  error: string | null;
  notes: Record<string, unknown> | null;
}

interface NmoSnap {
  total: number;
  most_recent_seen_at: string | null;
  linked_profiles: number;
  missing_avatar: number;
}

interface StatusResponse {
  ok: boolean;
  health: 'green' | 'amber' | 'red' | 'gray';
  successes5: number;
  failures5: number;
  inflight: {
    running: boolean;
    run_id: string | null;
    apify_run_id: string | null;
    mode: string | null;
    elapsed_seconds: number | null;
  };
  runs: BotRun[];
  nmo_members: NmoSnap;
}

type ActionKey = 'members' | 'backfill' | 'engagement' | 'direct';

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function modeLabel(mode: string | null): string {
  if (!mode) return 'Sync';
  if (mode === 'members_only_apify') return 'Members sync';
  if (mode === 'avatar_backfill_apify') return 'Avatar backfill';
  if (mode === 'engagement_events_apify') return 'Engagement refresh';
  return mode;
}

const HEALTH_TONE: Record<StatusResponse['health'], string> = {
  green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  red: 'text-red-400 bg-red-500/10 border-red-500/30',
  gray: 'text-ink-muted bg-bg-raised border-line',
};

export function BotSyncCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<ActionKey | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/bot/status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as StatusResponse;
      setStatus(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll every 4s while any run is in flight, 30s otherwise.
  const inflight = !!status?.inflight.running;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchStatus, inflight ? 4000 : 30_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [inflight, fetchStatus]);

  const trigger = async (action: ActionKey) => {
    setBusyAction(action);
    setActionError(null);
    setActionInfo(null);
    const url =
      action === 'members'
        ? '/api/admin/bot/trigger-members-apify'
        : action === 'backfill'
          ? '/api/admin/bot/trigger-backfill-avatars-apify'
          : action === 'engagement'
            ? '/api/admin/bot/trigger-engagement-apify'
            : '/api/admin/bot/trigger-skool-direct?pages=5';
    try {
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionError(
          data?.hint ?? data?.detail ?? data?.error ?? `Request failed (${res.status})`
        );
      } else {
        setActionInfo(data?.hint ?? `${modeLabel(action)} queued.`);
        fetchStatus();
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusyAction(null);
    }
  };

  const last = status?.runs?.[0];
  const lastStatus = last?.status;
  const health = status?.health ?? 'gray';
  const nmo = status?.nmo_members;

  return (
    <div className="card-premium p-5 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'h-10 w-10 rounded-lg border flex items-center justify-center shrink-0',
              HEALTH_TONE[health]
            )}
          >
            <Activity className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-ink">Skool sync (Apify)</h2>
            <p className="text-xs text-ink-muted">
              {loading
                ? 'Loading…'
                : inflight
                  ? `${modeLabel(status?.inflight.mode ?? null)} running · ${status?.inflight.elapsed_seconds ?? 0}s elapsed`
                  : last
                    ? `Last run: ${lastStatus} · ${relTime(last.finished_at ?? last.started_at)}`
                    : 'No runs yet'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => trigger('members')}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-xs font-medium border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {busyAction === 'members' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Sync members
          </button>
          <button
            type="button"
            onClick={() => trigger('backfill')}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-xs font-medium border border-line text-ink-muted hover:text-ink hover:border-accent/40 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {busyAction === 'backfill' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Backfill avatars
            {nmo && nmo.missing_avatar > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px]">
                {nmo.missing_avatar}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => trigger('engagement')}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-xs font-medium border border-line text-ink-muted hover:text-ink hover:border-accent/40 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {busyAction === 'engagement' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh engagement
          </button>
          <button
            type="button"
            onClick={() => trigger('direct')}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-xs font-medium border border-accent/40 bg-accent/5 text-accent hover:bg-accent/15 transition-colors disabled:opacity-50 whitespace-nowrap"
            title="Pull recent posts via Skool's direct API (sub-second per page, no Apify quota)"
          >
            {busyAction === 'direct' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Sync direct (Skool API)
          </button>
        </div>
      </div>

      {/* Inline action messages */}
      {actionError && <p className="mb-3 text-sm text-red-400 font-medium">{actionError}</p>}
      {actionInfo && !actionError && (
        <p className="mb-3 text-sm text-emerald-400 font-medium">{actionInfo}</p>
      )}

      {/* Roster snapshot */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
        <Stat label="Total members" value={nmo ? nmo.total.toLocaleString() : '—'} />
        <Stat
          label="Linked profiles"
          value={nmo ? nmo.linked_profiles.toLocaleString() : '—'}
          sub="signed up + claimed"
        />
        <Stat
          label="Last refresh"
          value={nmo?.most_recent_seen_at ? relTime(nmo.most_recent_seen_at) : '—'}
        />
      </div>

      {/* Recent runs */}
      <div>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-2">
          Recent cycles
        </h3>
        {(status?.runs ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted py-4 text-center border border-dashed border-line rounded-md">
            No cycles recorded yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {(status?.runs ?? []).slice(0, 5).map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-raised/40 text-sm"
              >
                <RunIcon status={r.status} />
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink-muted shrink-0 w-24 truncate">
                  {modeLabel((r.notes?.mode as string | undefined) ?? null)}
                </span>
                <span className="flex-1 min-w-0 truncate text-xs text-ink-muted">
                  {r.status === 'failed' && r.error ? (
                    <span className="text-red-400">{r.error.slice(0, 120)}</span>
                  ) : r.events_inserted ? (
                    `${r.events_inserted} events`
                  ) : r.posts_seen ? (
                    `${r.posts_seen} items`
                  ) : (
                    '—'
                  )}
                </span>
                <span className="text-[11px] text-ink-dim font-mono shrink-0">
                  {relTime(r.finished_at ?? r.started_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg-raised/40 p-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-ink-muted mb-1">
        {label}
      </p>
      <p className="font-display text-xl font-bold text-ink truncate">{value}</p>
      {sub && <p className="text-[10px] text-ink-dim mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function RunIcon({ status }: { status: BotRun['status'] }) {
  if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (status === 'failed') return <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />;
  return <Clock className="h-4 w-4 text-amber-400 shrink-0 animate-pulse" />;
}
