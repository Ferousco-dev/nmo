import Link from 'next/link';
import { ChevronLeft, Search, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { currentTier } from '@/lib/badges';

export const dynamic = 'force-dynamic';

interface MemberRow {
  id: string;
  email: string;
  display_name: string | null;
  skool_handle: string | null;
  skool_avatar_url: string | null;
  skool_display_name: string | null;
  total_points: number;
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const t = getT();
  const supabase = createClient();
  const q = (searchParams.q ?? '').trim();

  let query = supabase
    .from('profiles')
    .select('id, email, display_name, skool_handle, skool_avatar_url, skool_display_name, total_points')
    .order('total_points', { ascending: false })
    .limit(100);

  if (q.length >= 2) {
    const escaped = q.replace(/[\\%_]/g, (c) => '\\' + c);
    const pattern = `%${escaped}%`;
    query = query.or(
      `display_name.ilike.${pattern},skool_display_name.ilike.${pattern},skool_handle.ilike.${pattern},email.ilike.${pattern}`
    );
  }

  const { data: members } = await query;
  const rows = (members ?? []) as MemberRow[];

  return (
          <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-6"
        >
          <ChevronLeft className="h-4 w-4" />
          {t.admin.nav}
        </Link>

        <div className="mb-6">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="gradient-text">{t.admin.members.title}</span>
          </h1>
        </div>

        {/* Search */}
        <form className="mb-6" role="search">
          <div className="relative">
            <label htmlFor="admin-member-search" className="sr-only">
              {t.admin.members.search}
            </label>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-dim pointer-events-none" aria-hidden />
            <input
              id="admin-member-search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t.admin.members.search}
              className="w-full h-12 pl-12 pr-4 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
              autoComplete="off"
            />
          </div>
        </form>

        {/* List */}
        <div className="card-premium overflow-hidden">
          {rows.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-12">{t.admin.members.noResults}</p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {rows.map((m) => {
                const name = m.skool_display_name || m.display_name || m.email.split('@')[0];
                const tier = currentTier(m.total_points);
                return (
                  <li key={m.id}>
                    <Link
                      href={`/admin/members/${m.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-bg-hover transition-colors group"
                    >
                      {m.skool_avatar_url ? (
                        <img
                          src={m.skool_avatar_url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-10 w-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-bg-raised border border-line flex items-center justify-center text-xs font-mono text-ink-muted shrink-0">
                          {name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink truncate">{name}</div>
                        <div className="text-xs text-ink-dim font-mono truncate">
                          {m.skool_handle ? `@${m.skool_handle}` : m.email}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-ink">
                          {m.total_points.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-ink-dim uppercase tracking-wider">
                          Lv {tier}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-ink-dim group-hover:text-accent transition-colors shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
  );
}
