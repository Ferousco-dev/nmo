'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, Link2, CheckCircle2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

interface SearchResult {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: number | null;
}

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 250;

export function LinkSkoolPanel() {
  const t = useT();
  const l = t.profile.linkSkool;
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults(null);
      setSearching(false);
      return;
    }
    const tid = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const res = await fetch(`/api/skool/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (data.ok) setResults(data.results || []);
        else setResults([]);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(tid);
  }, [query]);

  const linkHandle = async (handle: string) => {
    setLinking(true);
    setError(null);
    try {
      const res = await fetch('/api/skool/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setError(l.failed);
        return;
      }
      setSuccess(true);
      // Pull the freshest profile from the server so the page re-renders
      // with the new name + avatar.
      router.refresh();
    } catch {
      setError(t.common.networkError);
    } finally {
      setLinking(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-xl border border-success/40 bg-success/10 p-4 flex items-center gap-3 mb-6">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
        <p className="text-sm text-success font-medium">{l.success}</p>
      </div>
    );
  }

  return (
    <div className="card-premium p-5 mb-6 border-accent/30 bg-accent/5">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
          <Link2 className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-ink">{l.title}</h3>
          <p className="text-sm text-ink-muted mt-0.5">{l.desc}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-dim pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={l.placeholder}
          disabled={linking}
          className="w-full pl-9 pr-3 h-11 rounded-lg bg-bg-raised/60 border border-line focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none text-sm disabled:opacity-60"
        />
        {(searching || linking) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-dim animate-spin" />
        )}
      </div>

      {results && results.length > 0 && (
        <ul className="mt-2 rounded-lg border border-line bg-bg-raised divide-y divide-line max-h-72 overflow-y-auto">
          {results.map((r) => (
            <li key={r.handle}>
              <button
                type="button"
                onClick={() => linkHandle(r.handle)}
                disabled={linking}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/10 transition-colors text-left',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {r.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.avatarUrl}
                    alt={r.displayName ?? r.handle}
                    className="h-9 w-9 rounded-md object-cover"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-md bg-accent/10 border border-accent/20" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">{r.displayName ?? r.handle}</p>
                  <p className="text-[11px] text-ink-muted font-mono truncate">@{r.handle}</p>
                </div>
                <span className="text-[11px] text-accent font-medium shrink-0">{l.cta}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {results && results.length === 0 && query.trim().length >= MIN_QUERY_LEN && !searching && (
        <p className="mt-2 text-xs text-ink-muted">{l.noResults}</p>
      )}

      {error && <p className="mt-3 text-sm text-danger font-medium">{error}</p>}
    </div>
  );
}
