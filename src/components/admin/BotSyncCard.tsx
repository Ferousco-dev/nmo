'use client';

// Admin-only widget on /admin: trigger the bot, watch it run, see
// recent runs at a glance.
//
// Polls /api/admin/bot/status every 4s while a cycle is in flight, and
// every 30s otherwise. The bot's /run is async (kicks off background
// task and returns immediately) so the click here is non-blocking — we
// poll to surface progress.

import { useCallback, useEffect, useState } from 'react';
import { Bot, PlayCircle, RefreshCcw, CheckCircle2, AlertTriangle, Activity, Clock, Copy, Check, Users, Cloud, Database, Link2, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Health = 'green' | 'amber' | 'red' | 'gray';

interface BotRunNotes {
  mode?:
    | 'members_only'
    | 'members_only_attach'
    | 'members_only_apify'
    | 'avatar_backfill_apify'
    | string;
  members_scraped?: number;
  members_written?: number;
  members_added?: number;
  // avatar backfill specific
  batch_size?: number;
  found?: number;
  written?: number;
}

interface BotRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed' | null;
  posts_seen: number | null;
  events_inserted: number | null;
  error: string | null;
  notes: BotRunNotes | null;
}

interface StatusResponse {
  ok: boolean;
  health: Health;
  successes5: number;
  failures5: number;
  inflight: {
    running: boolean | null;
    run_id: string | null;
    elapsed_seconds: number | null;
    reachable: boolean;
    mode: 'headless' | 'cdp_attach' | null;
    cdp_wait_seconds: number | null;
    cdp_launch_command: string | null;
  };
  runs: BotRun[];
  nmo_members?: {
    total: number;
    most_recent_seen_at: string | null;
    linked_profiles: number;
    missing_avatar: number;
  };
}

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const dt = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - dt) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function HealthDot({ health }: { health: Health }) {
  const cls = {
    green: 'bg-success',
    amber: 'bg-warn',
    red: 'bg-danger',
    gray: 'bg-ink-dim',
  }[health];
  return <span className={cn('inline-block h-2 w-2 rounded-full', cls)} />;
}

export function BotSyncCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  // Tracks WHICH endpoint we just hit so we can spin only that
  // button (no flicker on the wrong button while status catches up).
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/bot/status', { cache: 'no-store' });
      if (!res.ok) return;
      const body: StatusResponse = await res.json();
      setStatus(body);
    } catch {
      /* ignore — next poll will retry */
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Live polling — fast while ANY run is in-flight (Python bot OR
  // a bot_runs row with status='running'), slower otherwise. Also
  // poll fast while we have an outgoing request in `busy` state, so
  // the row created by a synchronous Apify run shows up promptly.
  useEffect(() => {
    const pythonInflight = !!status?.inflight.running;
    const dbInflight =
      !!status?.runs[0] &&
      status.runs[0].status === 'running' &&
      !status.runs[0].finished_at;
    const anyActive = busy || pythonInflight || dbInflight;
    const ms = anyActive ? 4_000 : 30_000;
    const id = setInterval(fetchStatus, ms);
    return () => clearInterval(id);
  }, [status?.inflight.running, status?.runs, busy, fetchStatus]);

  // Generic kick-off: same auth + UX for /trigger and /trigger-members.
  // Bot serializes runs internally so concurrent click→409 is handled.
  const kick = async (path: string, label: string) => {
    setBusy(true);
    setBusyPath(path);
    setFeedback(null);
    // Refresh once almost-immediately so the running bot_runs row
    // shows up while the synchronous Apify route is still pending.
    setTimeout(fetchStatus, 800);
    try {
      const res = await fetch(path, { method: 'POST' });
      const body: {
        run_id?: string;
        error?: string;
        detail?: string;
        hint?: string;
        members_written?: number;
      } = await res.json().catch(() => ({}));
      if (res.ok) {
        const written = body.members_written;
        setFeedback({
          kind: 'ok',
          text:
            written != null
              ? `${label} done · ${written} members upserted`
              : `${label} queued · run_id ${body.run_id?.slice(0, 8) ?? '?'}…`,
        });
        // Final refresh so the row flips to ✓
        setTimeout(fetchStatus, 600);
      } else {
        const msg = body.detail || body.hint || body.error || 'Trigger failed';
        setFeedback({ kind: 'err', text: msg });
      }
    } catch (e: unknown) {
      setFeedback({ kind: 'err', text: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setBusy(false);
      setBusyPath(null);
    }
  };

  const trigger = () => kick('/api/admin/bot/trigger', 'Full sync');
  const triggerMembers = () => kick('/api/admin/bot/trigger-members', 'Member sync');
  const triggerApify = () => kick('/api/admin/bot/trigger-members-apify', 'Apify sync');
  const triggerBackfill = () => kick('/api/admin/bot/trigger-backfill-avatars-apify', 'Avatar backfill');

  const runs = status?.runs ?? [];

  // In-flight detection has THREE possible signals, in order:
  //   1. busy        — we have an outgoing fetch right now (button just clicked)
  //   2. dbInflight  — most recent bot_runs row has status='running' (Apify or Python — works without bot reachable)
  //   3. pythonInflight — Python bot's /inflight endpoint says running (Python bot only)
  // Any of them = show the running state.
  const pythonInflight = !!status?.inflight.running;
  const dbInflight =
    !!runs[0] && runs[0].status === 'running' && !runs[0].finished_at;
  const inFlight = busy || pythonInflight || dbInflight;
  const reachable = !!status?.inflight.reachable;

  // Elapsed seconds — Python bot reports its own; for DB-only runs
  // (Apify) we compute from started_at.
  const dbElapsedSecs =
    dbInflight && runs[0]?.started_at
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(runs[0].started_at).getTime()) / 1000),
        )
      : null;
  const elapsedSecs = status?.inflight.elapsed_seconds ?? dbElapsedSecs;

  // What KIND of run is in flight, for the user-facing label.
  const runMode = dbInflight ? runs[0]?.notes?.mode ?? null : null;
  const inFlightLabel =
    runMode === 'members_only_apify'
      ? 'Apify members sync'
      : runMode === 'avatar_backfill_apify'
      ? 'Avatar backfill'
      : runMode === 'members_only' || runMode === 'members_only_attach'
      ? 'Members sync'
      : pythonInflight
      ? 'Full sync'
      : busy
      ? 'Starting…'
      : 'Sync';

  const mode = status?.inflight.mode ?? null;
  const cdpWaitSecs = status?.inflight.cdp_wait_seconds ?? 20;
  const cdpCmd = status?.inflight.cdp_launch_command ?? null;
  const isAttachMode = mode === 'cdp_attach';
  const remainingWait = isAttachMode && pythonInflight && elapsedSecs != null
    ? Math.max(0, cdpWaitSecs - elapsedSecs)
    : null;

  const [copied, setCopied] = useState(false);
  const copyCmd = async () => {
    if (!cdpCmd) return;
    try {
      await navigator.clipboard.writeText(cdpCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can manually select+copy */
    }
  };

  return (
    <div className="card-premium p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent">
            <Bot className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold text-ink flex items-center gap-2">
              Skool sync bot
              {status && <HealthDot health={status.health} />}
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              {inFlight
                ? `${inFlightLabel}… ${elapsedSecs != null ? `${Math.floor(elapsedSecs)}s` : ''}`
                : !reachable
                ? 'Python bot offline — Apify sync still works without it'
                : status
                ? `${status.successes5}/${status.successes5 + status.failures5} of last 5 cycles ok`
                : 'Loading…'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
          {!!status?.nmo_members?.missing_avatar && status.nmo_members.missing_avatar > 0 && (
            <button
              type="button"
              onClick={triggerBackfill}
              disabled={busy || inFlight}
              title={`Visit each missing-avatar profile on Skool and pull its og:image. Processes up to 200 per click. ${status.nmo_members.missing_avatar} rows currently missing.`}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                'border border-line-strong text-ink hover:bg-bg-hover hover:border-accent/50',
                (busy || inFlight) && 'opacity-60 cursor-not-allowed hover:bg-transparent hover:border-line-strong',
              )}
            >
              {busyPath === '/api/admin/bot/trigger-backfill-avatars-apify' ||
              (inFlight && runMode === 'avatar_backfill_apify') ? (
                <>
                  <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden />
                  Backfilling {elapsedSecs != null ? `${Math.floor(elapsedSecs)}s` : '…'}
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4" aria-hidden />
                  Backfill avatars · {status.nmo_members.missing_avatar.toLocaleString()}
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={triggerApify}
            disabled={busy || inFlight}
            title="Run the members scrape via Apify (cloud). Region-block-proof. Requires Apify token + Skool creds in Integrations."
            className={cn(
              'inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              'border border-line-strong text-ink hover:bg-bg-hover hover:border-accent/50',
              (busy || inFlight) && 'opacity-60 cursor-not-allowed hover:bg-transparent hover:border-line-strong',
            )}
          >
            {busyPath === '/api/admin/bot/trigger-members-apify' ||
            (inFlight && runMode === 'members_only_apify') ? (
              <>
                <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden />
                Apify {elapsedSecs != null ? `${Math.floor(elapsedSecs)}s` : '…'}
              </>
            ) : (
              <>
                <Cloud className="h-4 w-4" aria-hidden />
                Apify sync
              </>
            )}
          </button>
          <button
            type="button"
            onClick={triggerMembers}
            disabled={busy || inFlight}
            title="Refresh handle / display name / avatar for every NMO member. Faster than full sync."
            className={cn(
              'inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              'border border-line-strong text-ink hover:bg-bg-hover hover:border-accent/50',
              (busy || inFlight) && 'opacity-60 cursor-not-allowed hover:bg-transparent hover:border-line-strong',
            )}
          >
            {busyPath === '/api/admin/bot/trigger-members' ||
            (inFlight && (runMode === 'members_only' || runMode === 'members_only_attach')) ? (
              <>
                <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden />
                Members {elapsedSecs != null ? `${Math.floor(elapsedSecs)}s` : '…'}
              </>
            ) : (
              <>
                <Users className="h-4 w-4" aria-hidden />
                Sync members
              </>
            )}
          </button>
          <button
            type="button"
            onClick={trigger}
            disabled={busy || inFlight}
            title="Full sync: members + engagement events + per-post detail"
            className={cn(
              'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              busy || inFlight
                ? 'bg-bg-raised text-ink-dim cursor-not-allowed'
                : 'bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20',
            )}
          >
            {inFlight ? (
              <>
                <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden />
                Running
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" aria-hidden />
                Run now
              </>
            )}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={cn(
            'rounded-lg border px-3 py-2 mb-3 text-xs',
            feedback.kind === 'ok'
              ? 'border-success/30 bg-success/5 text-success'
              : 'border-danger/30 bg-danger/5 text-danger',
          )}
        >
          {feedback.text}
        </div>
      )}

      {/* Attach mode (testing) — show the launch command + countdown */}
      {isAttachMode && cdpCmd && (
        <div
          className={cn(
            'rounded-lg border px-3 py-3 mb-3 text-xs',
            inFlight
              ? 'border-accent/40 bg-accent/5'
              : 'border-line-strong bg-bg-raised/40',
          )}
        >
          <div className="flex items-start gap-2">
            <Activity
              className={cn('h-4 w-4 mt-0.5 shrink-0', inFlight ? 'text-accent animate-pulse' : 'text-ink-muted')}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-ink mb-1">
                {inFlight && remainingWait != null
                  ? `Waiting for your Chrome — ${Math.ceil(remainingWait)}s left`
                  : 'Attach mode (testing) — uses your Chrome with VPN'}
              </div>
              <p className="text-ink-muted leading-snug mb-2">
                {inFlight
                  ? "Open this in a terminal NOW (or click below to copy). Make sure your VPN extension is on."
                  : "When you click Run, the bot will wait up to 20s for your Chrome to be available with the debug port. Run this once before clicking Run:"}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 px-2 py-1.5 rounded bg-bg-card border border-line text-[11px] font-mono text-ink overflow-x-auto whitespace-nowrap">
                  {cdpCmd}
                </code>
                <button
                  type="button"
                  onClick={copyCmd}
                  className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md text-ink-muted hover:text-ink hover:bg-bg-hover border border-line"
                  aria-label="Copy command"
                  title={copied ? 'Copied' : 'Copy'}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Database snapshot — total NMO members in our DB right now */}
      {status?.nmo_members && (
        <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-dim mb-1">
              <Database className="h-3 w-3" aria-hidden />
              <span>Roster</span>
            </div>
            <div className="font-display text-2xl font-bold text-ink leading-none">
              {status.nmo_members.total.toLocaleString()}
            </div>
            <div className="text-[10px] text-ink-muted mt-1">
              total in <code className="font-mono">nmo_members</code>
            </div>
          </div>
          <div className="rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-dim mb-1">
              <Link2 className="h-3 w-3" aria-hidden />
              <span>Linked</span>
            </div>
            <div className="font-display text-2xl font-bold text-ink leading-none">
              {status.nmo_members.linked_profiles.toLocaleString()}
            </div>
            <div className="text-[10px] text-ink-muted mt-1">
              signed up + claimed handle
            </div>
          </div>
          <div className="rounded-lg border border-line/60 bg-bg-raised/40 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-dim mb-1">
              <Clock className="h-3 w-3" aria-hidden />
              <span>Last refresh</span>
            </div>
            <div className="font-display text-2xl font-bold text-ink leading-none">
              {relTime(status.nmo_members.most_recent_seen_at)}
            </div>
            <div className="text-[10px] text-ink-muted mt-1">
              via any sync
            </div>
          </div>
        </div>
      )}

      {/* Recent runs */}
      <div>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim mb-2">
          Recent cycles
        </h3>
        {runs.length === 0 ? (
          <p className="text-xs text-ink-muted py-4 text-center">No cycles recorded yet</p>
        ) : (
          <ul className="space-y-1">
            {runs.slice(0, 6).map((r) => {
              const isMembersOnly =
                r.notes?.mode === 'members_only' ||
                r.notes?.mode === 'members_only_attach' ||
                r.notes?.mode === 'members_only_apify';
              const isApify = r.notes?.mode === 'members_only_apify';
              const isBackfill = r.notes?.mode === 'avatar_backfill_apify';
              const memberCount =
                r.notes?.members_written ?? r.notes?.members_scraped ?? null;
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-bg-raised/50"
                >
                  <span className="shrink-0">
                    {r.status === 'success' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
                    ) : r.status === 'failed' ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-danger" aria-hidden />
                    ) : r.status === 'running' ? (
                      <Activity className="h-3.5 w-3.5 text-accent animate-pulse" aria-hidden />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
                    )}
                  </span>
                  <span className="font-mono text-ink-muted w-16 shrink-0">
                    {relTime(r.started_at)}
                  </span>
                  {isBackfill ? (
                    <span className="text-ink-muted inline-flex items-center gap-1">
                      <ImageIcon className="h-3 w-3 text-ink-dim" aria-hidden />
                      <span className="text-accent font-medium">{r.notes?.found ?? 0}</span>{' '}
                      <span className="text-ink-dim">
                        avatars · {r.notes?.batch_size ?? 0} tried
                      </span>
                    </span>
                  ) : isMembersOnly ? (
                    <span className="text-ink-muted inline-flex items-center gap-1">
                      {isApify ? (
                        <Cloud className="h-3 w-3 text-ink-dim" aria-hidden />
                      ) : (
                        <Users className="h-3 w-3 text-ink-dim" aria-hidden />
                      )}
                      <span className="text-accent font-medium">{memberCount ?? 0}</span>{' '}
                      <span className="text-ink-dim">
                        {isApify ? 'members (apify)' : 'members'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-ink-muted">
                      {r.posts_seen ?? 0}{' '}
                      <span className="text-ink-dim">posts</span> ·{' '}
                      <span className="text-accent font-medium">{r.events_inserted ?? 0}</span>{' '}
                      <span className="text-ink-dim">events</span>
                    </span>
                  )}
                  {r.error && (
                    <span className="ml-auto text-danger truncate max-w-[280px]" title={r.error}>
                      {r.error.split('\n')[0].slice(0, 60)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
