import Link from 'next/link';
import { ChevronLeft, BookOpenText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CreateResourceForm } from '@/components/admin/CreateResourceForm';
import { ResourceRowActions } from '@/components/admin/ResourceRowActions';
import { getT, getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

interface ResourceRow {
  id: string;
  title_en: string | null;
  title_zh: string | null;
  description_en: string | null;
  description_zh: string | null;
  thumbnail_url: string | null;
  link_url: string | null;
  tag: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export default async function AdminResourcesPage() {
  const t = getT();
  const locale = getLocale();
  const isZh = locale === 'zh-Hant';
  const supabase = createClient();

  // Admin RLS allows reading all rows including hidden ones
  const { data } = await supabase
    .from('resources')
    .select('*')
    .order('is_active', { ascending: false })
    .order('display_order', { ascending: false })
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as ResourceRow[];

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-6"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t.admin.nav}
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          <span className="gradient-text">{t.admin.resources.title}</span>
        </h1>
        <p className="mt-2 text-ink-muted text-sm">{t.admin.resources.desc}</p>
      </div>

      {/* Create form */}
      <div className="card-premium p-6 mb-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-3">
          {t.admin.resources.newResource}
        </h2>
        <CreateResourceForm />
      </div>

      {/* List */}
      <div className="card-premium p-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-4">
          {t.admin.resources.list}
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-8">{t.admin.resources.empty}</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {rows.map((r) => {
              const title =
                (isZh ? r.title_zh : r.title_en) || r.title_en || r.title_zh || '(untitled)';
              return (
                <li key={r.id} className="py-3 flex items-start gap-3">
                  {r.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.thumbnail_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-14 w-20 rounded-md object-cover shrink-0 border border-line"
                    />
                  ) : (
                    <div className="h-14 w-20 rounded-md bg-bg-raised border border-line flex items-center justify-center text-ink-dim shrink-0">
                      <BookOpenText className="h-5 w-5" aria-hidden />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink truncate">{title}</span>
                      {r.tag && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] uppercase tracking-wider text-accent border border-accent/30 bg-accent/5">
                          {r.tag}
                        </span>
                      )}
                      {!r.is_active && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] uppercase tracking-wider text-ink-dim border border-line">
                          {t.admin.resources.hidden}
                        </span>
                      )}
                    </div>
                    {r.link_url && (
                      <a
                        href={r.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:text-accent-glow truncate block mt-0.5 max-w-full"
                      >
                        {r.link_url}
                      </a>
                    )}
                    <div className="text-[11px] text-ink-dim font-mono mt-1">
                      #{r.display_order} · {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <ResourceRowActions resourceId={r.id} isActive={r.is_active} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
