'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Trash2, UserPlus, Loader2, ExternalLink, MapPin } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

interface SearchResult {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: number | null;
  profileUrl?: string | null;
}

interface FamilyTreeRow {
  id: string;
  name: string;
  role: string;
  region: string | null;
  photo_url: string | null;
  skool_handle: string | null;
  bio: string | null;
  display_order: number;
}

const ROLE_PRESETS = [
  'CEO / Founder',
  'COO',
  'CMO',
  'CSMO',
  'Regional Commander',
  'Subregional Commander',
  'Admin',
  'Moderator',
];

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 250;

export function FamilyTreeManager({ initialMembers }: { initialMembers: FamilyTreeRow[] }) {
  const t = useT();
  const f = t.admin.familyTree;
  const [members, setMembers] = useState<FamilyTreeRow[]>(initialMembers);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [role, setRole] = useState('Admin');
  const [region, setRegion] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  const pick = (r: SearchResult) => {
    setPicked(r);
    setQuery('');
    setResults(null);
    setErrorMsg(null);
  };

  const reset = () => {
    setPicked(null);
    setRole('Admin');
    setRegion('');
    setBio('');
  };

  const submit = async () => {
    if (!picked) {
      setErrorMsg(f.errors.pickFirst);
      return;
    }
    if (!role.trim()) {
      setErrorMsg(f.errors.roleRequired);
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/family-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skool_handle: picked.handle,
          role: role.trim(),
          region: region.trim() || null,
          bio: bio.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(f.errors.addFailed);
        return;
      }
      setMembers((prev) => [...prev, data.member as FamilyTreeRow]);
      setSuccessMsg(`${f.successPrefix} ${data.member?.name ?? picked.displayName ?? picked.handle}`);
      reset();
    } catch {
      setErrorMsg(t.common.networkError);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(f.removeConfirm)) return;
    const prev = members;
    setMembers((m) => m.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/admin/family-tree/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMembers(prev);
        setErrorMsg(f.errors.deleteFailed);
      }
    } catch {
      setMembers(prev);
      setErrorMsg(t.common.networkError);
    }
  };

  const showResults = results !== null && results.length > 0;
  const noResults =
    !searching && results !== null && results.length === 0 && query.trim().length >= MIN_QUERY_LEN;

  return (
    <div className="space-y-8">
      <section className="card-premium p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold mb-1">{f.addTitle}</h2>
        <p className="text-sm text-ink-muted mb-5">{f.addDesc}</p>

        {picked ? (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-accent/40 bg-accent/5 mb-4">
            {picked.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picked.avatarUrl}
                alt={picked.displayName ?? picked.handle}
                className="h-12 w-12 rounded-lg object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-accent/10 border border-accent/20" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink truncate">
                {picked.displayName ?? picked.handle}
              </p>
              <p className="text-xs text-ink-muted font-mono truncate">@{picked.handle}</p>
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-xs text-ink-muted hover:text-accent transition-colors"
            >
              {f.pickedChange}
            </button>
          </div>
        ) : (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-dim pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={f.searchPlaceholder}
              className="w-full pl-9 pr-3 h-11 rounded-lg bg-bg-raised/60 border border-line focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none text-sm"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-dim animate-spin" />
            )}
            {showResults && (
              <ul className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-bg-raised shadow-xl">
                {results!.map((r) => (
                  <li key={r.handle}>
                    <button
                      type="button"
                      onClick={() => pick(r)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/10 transition-colors text-left"
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
                        <p className="text-[11px] text-ink-muted font-mono truncate">
                          @{r.handle}
                        </p>
                      </div>
                      {typeof r.level === 'number' && (
                        <span className="text-[10px] font-mono text-accent">L{r.level}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {noResults && (
              <p className="absolute z-20 left-0 right-0 mt-1 px-3 py-2 rounded-lg border border-line bg-bg-raised text-sm text-ink-muted">
                {t.profile.linkSkool.noResults}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted mb-1">
              {f.roleLabel} *
            </label>
            <input
              type="text"
              list="role-presets"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={f.rolePlaceholder}
              className="w-full px-3 h-10 rounded-lg bg-bg-raised/60 border border-line focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none text-sm"
            />
            <datalist id="role-presets">
              {ROLE_PRESETS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted mb-1">
              {f.regionLabel}
            </label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder={f.regionPlaceholder}
              className="w-full px-3 h-10 rounded-lg bg-bg-raised/60 border border-line focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none text-sm"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted mb-1">
            {f.bioLabel}
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={f.bioPlaceholder}
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-bg-raised/60 border border-line focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none text-sm resize-none"
          />
        </div>

        {errorMsg && <p className="mb-3 text-sm text-red-400 font-medium">{errorMsg}</p>}
        {successMsg && (
          <p className="mb-3 text-sm text-emerald-400 font-medium">{successMsg}</p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !picked}
          className={cn(
            'inline-flex items-center gap-2 px-4 h-10 rounded-lg font-medium text-sm transition-colors',
            'bg-accent text-bg hover:bg-accent/90',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          {submitting ? f.submitting : f.submit}
        </button>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xl font-bold">{f.currentList}</h2>
          <span className="text-xs font-mono text-ink-muted">{members.length}</span>
          <div className="h-px flex-1 bg-gradient-to-r from-line via-line to-transparent" />
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-ink-muted">{f.empty}</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {members.map((m) => (
              <li key={m.id} className="card-premium p-4 flex items-start gap-3">
                {m.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.photo_url}
                    alt={m.name}
                    className="h-12 w-12 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-accent/10 border border-accent/20 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink truncate">{m.name}</p>
                  <p className="text-[11px] uppercase tracking-wider font-mono text-accent">
                    {m.role}
                  </p>
                  {m.region && (
                    <div className="flex items-center gap-1 text-[11px] text-ink-muted mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {m.region}
                    </div>
                  )}
                  {m.skool_handle && (
                    <a
                      href={`https://www.skool.com/@${m.skool_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-accent transition-colors mt-1 font-mono"
                    >
                      @{m.skool_handle}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  className="p-1.5 rounded-md text-ink-dim hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  aria-label={f.removeAria}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
