'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Trophy, ChevronRight, ExternalLink, ShieldAlert, RefreshCw } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 250;
const SKOOL_NMO_URL = 'https://www.skool.com/nmo';
const REFRESH_POLL_MS = 5_000;
const REFRESH_POLL_TIMEOUT_MS = 3 * 60_000;

type RefreshState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'polling'; runId: string; startedAt: number }
  | { kind: 'recently_refreshed' }
  | { kind: 'no_match' }
  | { kind: 'failed'; message?: string };

interface SearchResult {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: number | null;
}

export function WelcomeSearch({
  galleryAvatars,
  memberCount,
}: {
  galleryAvatars: string[];
  memberCount: number;
}) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [refresh, setRefresh] = useState<RefreshState>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults(null);
      setSearching(false);
      setRefresh({ kind: 'idle' });
      return;
    }
    // Editing the query cancels any in-progress refresh feedback so we
    // don't show a stale "we checked Skool" message against a new search.
    setRefresh({ kind: 'idle' });

    const tid = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const res = await fetch(`/api/skool/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('search_failed');
        const data = await res.json();
        if (data.ok) setResults(data.results || []);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(tid);
  }, [query]);

  // Poll the refresh status endpoint while we're waiting on an Apify run.
  useEffect(() => {
    if (refresh.kind !== 'polling') return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      if (Date.now() - refresh.startedAt > REFRESH_POLL_TIMEOUT_MS) {
        setRefresh({ kind: 'failed' });
        return;
      }
      try {
        const res = await fetch(
          `/api/skool/search/refresh?runId=${encodeURIComponent(refresh.runId)}&q=${encodeURIComponent(query.trim())}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!data.ok) {
          setRefresh({ kind: 'failed', message: data.error });
          return;
        }
        if (data.status === 'running') {
          setTimeout(poll, REFRESH_POLL_MS);
          return;
        }
        if (data.status === 'failed') {
          setRefresh({ kind: 'failed', message: data.error });
          return;
        }
        // success
        const fresh = (data.results ?? []) as SearchResult[];
        if (fresh.length > 0) {
          setResults(fresh);
          setRefresh({ kind: 'idle' });
        } else {
          setRefresh({ kind: 'no_match' });
        }
      } catch {
        if (cancelled) return;
        setTimeout(poll, REFRESH_POLL_MS);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [refresh, query]);

  const startRefresh = async () => {
    setRefresh({ kind: 'starting' });
    try {
      const res = await fetch('/api/skool/search/refresh', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setRefresh({ kind: 'failed', message: data?.error });
        return;
      }
      if (data.reused === 'recent_success') {
        // DB was just refreshed by someone else — re-run the local search
        // immediately and tell the user the list is already fresh.
        const trimmed = query.trim();
        if (trimmed.length >= MIN_QUERY_LEN) {
          const r = await fetch(`/api/skool/search?q=${encodeURIComponent(trimmed)}`);
          const j = await r.json();
          if (j.ok && (j.results?.length ?? 0) > 0) {
            setResults(j.results);
            setRefresh({ kind: 'idle' });
            return;
          }
        }
        setRefresh({ kind: 'recently_refreshed' });
        return;
      }
      if (!data.apify_run_id && !data.run_id) {
        setRefresh({ kind: 'failed' });
        return;
      }
      setRefresh({
        kind: 'polling',
        runId: data.run_id ?? data.apify_run_id,
        startedAt: Date.now(),
      });
    } catch {
      setRefresh({ kind: 'failed' });
    }
  };

  const choose = (handle: string) => {
    router.push(`/confirm?handle=${encodeURIComponent(handle)}`);
  };

  const showIdle = query.trim().length < MIN_QUERY_LEN;
  const showResults = !showIdle && results !== null && results.length > 0;
  const noResults = !showIdle && !searching && results !== null && results.length === 0;
  const showSkeleton = !showIdle && searching && (results === null || results.length === 0);
  const memberCountRounded = roundDown(memberCount);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Fixed top bar — stays put while scrolling */}
      <header className="fixed top-0 left-0 right-0 z-30 backdrop-blur-xl bg-bg/70 border-b border-line/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <Logo size={28} className="shrink-0" priority />
            <span className="font-display text-lg sm:text-xl font-bold tracking-tight truncate">
              NMO <span className="gradient-text">Roadmap</span>
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Decorative background glows */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-accent/10 blur-[140px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-md animate-slide-up">
          {/* Header */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl overflow-hidden border border-accent/30 mb-5 glow-blue">
              <Logo size={64} priority />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
              <span className="gradient-text">{t.welcome.title}</span>
            </h1>
            <p className="mt-3 text-ink-muted text-sm sm:text-base">{t.welcome.subtitle}</p>
          </div>

          {/* Search card */}
          <div className="card-premium overflow-hidden">
            {/* Search input */}
            <div className="relative">
              <label htmlFor="welcome-search" className="sr-only">
                {t.welcome.searchPlaceholder}
              </label>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-dim pointer-events-none" aria-hidden />
              <input
                id="welcome-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.welcome.searchPlaceholder}
                className="w-full h-14 pl-12 pr-12 bg-transparent border-b border-line text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              {searching && (
                <div
                  role="status"
                  aria-label={t.welcome.searching}
                  className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
                />
              )}
            </div>

            {/* Idle state */}
            {showIdle && (
              <div className="px-6 py-7 text-center animate-fade-in">
                {galleryAvatars.length > 0 && (
                  <div className="flex items-center justify-center mb-4">
                    {galleryAvatars.slice(0, 7).map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className={cn(
                          'h-9 w-9 rounded-full object-cover border-2 border-bg-card transition-transform hover:scale-110 hover:z-20',
                          i > 0 && '-ml-2'
                        )}
                        style={{ zIndex: galleryAvatars.length - i }}
                      />
                    ))}
                  </div>
                )}
                {memberCountRounded > 0 && (
                  <p className="text-sm text-ink-muted">
                    <span className="text-ink font-semibold">
                      {memberCountRounded.toLocaleString()}+
                    </span>{' '}
                    {t.welcome.communityMembers}
                  </p>
                )}
                <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-success/30 bg-success/5 text-xs">
                  <Trophy className="h-3.5 w-3.5 text-success" />
                  <span className="text-success font-medium">{t.welcome.communityBadge}</span>
                </div>
              </div>
            )}

            {/* Skeleton (searching, no results yet) */}
            {showSkeleton && (
              <ul className="divide-y divide-line-subtle animate-fade-in">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="skeleton h-11 w-11 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="skeleton h-3.5 w-2/3 rounded" />
                      <div className="skeleton h-3 w-1/3 rounded" />
                    </div>
                    <div className="skeleton h-6 w-10 rounded-md shrink-0" />
                  </li>
                ))}
              </ul>
            )}

            {/* Results */}
            {showResults && (
              <ul className="divide-y divide-line-subtle animate-fade-in">
                {results!.map((r) => (
                  <li key={r.handle}>
                    <button
                      type="button"
                      onClick={() => choose(r.handle)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-hover/70 active:bg-bg-card transition-colors group"
                    >
                      {r.avatarUrl ? (
                        <img
                          src={r.avatarUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-11 w-11 rounded-full object-cover shrink-0 ring-2 ring-transparent group-hover:ring-accent/40 transition-all"
                        />
                      ) : (
                        <div className="h-11 w-11 rounded-full bg-bg-raised border border-line flex items-center justify-center text-xs font-mono text-ink-muted shrink-0">
                          {(r.displayName || r.handle).slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink truncate">
                          {r.displayName || `@${r.handle}`}
                        </div>
                        <div className="text-xs text-ink-dim font-mono truncate">
                          @{r.handle}
                        </div>
                      </div>
                      {r.level != null && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/10 border border-accent/30 text-xs font-mono text-accent shrink-0">
                          Lv{r.level}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-ink-dim group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* No results — branches on refresh state */}
            {noResults && refresh.kind === 'idle' && (
              <div className="px-6 py-8 text-center animate-fade-in">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-warn/10 border border-warn/30 mb-3">
                  <ShieldAlert className="h-6 w-6 text-warn" />
                </div>
                <p className="font-medium text-ink">{t.welcome.noResults}</p>
                <p className="text-xs text-ink-muted mt-2 leading-relaxed max-w-sm mx-auto">
                  {t.welcome.noResultsHint}
                </p>
                <div className="mt-4 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={startRefresh}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent/10 border border-accent/30 text-sm text-accent hover:bg-accent/15 hover:text-accent-glow font-medium transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t.welcome.searchAgain}
                  </button>
                  <a
                    href={SKOOL_NMO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-accent font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t.welcome.notFoundCta}
                  </a>
                </div>
              </div>
            )}

            {noResults && (refresh.kind === 'starting' || refresh.kind === 'polling') && (
              <div className="px-6 py-8 text-center animate-fade-in">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-accent/10 border border-accent/30 mb-3">
                  <RefreshCw className="h-6 w-6 text-accent animate-spin" />
                </div>
                <p className="font-medium text-ink">{t.welcome.refreshingTitle}</p>
                <p className="text-xs text-ink-muted mt-2 leading-relaxed max-w-sm mx-auto">
                  {t.welcome.refreshingHint}
                </p>
              </div>
            )}

            {noResults && refresh.kind === 'recently_refreshed' && (
              <div className="px-6 py-8 text-center animate-fade-in">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-warn/10 border border-warn/30 mb-3">
                  <ShieldAlert className="h-6 w-6 text-warn" />
                </div>
                <p className="font-medium text-ink">{t.welcome.refreshRecent}</p>
                <p className="text-xs text-ink-muted mt-2 leading-relaxed max-w-sm mx-auto">
                  {t.welcome.noResultsHint}
                </p>
                <a
                  href={SKOOL_NMO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-glow font-medium"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t.welcome.notFoundCta}
                </a>
              </div>
            )}

            {noResults && refresh.kind === 'no_match' && (
              <div className="px-6 py-8 text-center animate-fade-in">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-warn/10 border border-warn/30 mb-3">
                  <ShieldAlert className="h-6 w-6 text-warn" />
                </div>
                <p className="font-medium text-ink">{t.welcome.refreshNoMatch}</p>
                <a
                  href={SKOOL_NMO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-glow font-medium"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t.welcome.notFoundCta}
                </a>
              </div>
            )}

            {noResults && refresh.kind === 'failed' && (
              <div className="px-6 py-8 text-center animate-fade-in">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-warn/10 border border-warn/30 mb-3">
                  <ShieldAlert className="h-6 w-6 text-warn" />
                </div>
                <p className="font-medium text-ink">{t.welcome.refreshFailed}</p>
                <button
                  type="button"
                  onClick={startRefresh}
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent/10 border border-accent/30 text-sm text-accent hover:bg-accent/15 hover:text-accent-glow font-medium transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t.welcome.searchAgain}
                </button>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-ink-muted">
            {t.welcome.haveAccount}{' '}
            <Link href="/login" className="text-accent hover:text-accent-glow font-medium">
              {t.welcome.signIn}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function roundDown(n: number): number {
  if (n >= 1000) return Math.floor(n / 100) * 100;
  if (n >= 100) return Math.floor(n / 10) * 10;
  return n;
}
