// Member-facing resources library — a grid of admin-curated cards
// (articles, videos, Skool lessons, anything with a thumbnail + link).
// Mirrors the visual pattern from the client reference: image on top,
// title, description, and a colored category tag chip.

import { redirect } from 'next/navigation';
import { ExternalLink, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
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
  created_at: string;
}

export default async function ResourcesPage() {
  const t = getT();
  const locale = getLocale();
  const isZh = locale === 'zh-Hant';
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('resources')
    .select('id, title_en, title_zh, description_en, description_zh, thumbnail_url, link_url, tag, display_order, created_at')
    .eq('is_active', true)
    .order('display_order', { ascending: false })
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as ResourceRow[];

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 animate-slide-up">
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
          <span className="gradient-text">{t.resources.title}</span>
        </h1>
        <p className="mt-3 text-ink-muted">{t.resources.subtitle}</p>
      </div>

      {rows.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <Sparkles className="h-10 w-10 text-accent mx-auto mb-3" aria-hidden />
          <p className="text-ink-muted">{t.resources.empty}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {rows.map((r) => {
            const title = (isZh ? r.title_zh : r.title_en) || r.title_en || r.title_zh || 'Untitled';
            const description = (isZh ? r.description_zh : r.description_en) || r.description_en || r.description_zh || '';
            const href = r.link_url || '#';
            const isExternal = !!r.link_url;
            return (
              <li key={r.id}>
                <a
                  href={href}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  className="card-premium overflow-hidden block group hover:border-accent/50 hover:-translate-y-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  aria-label={`${title} — ${t.resources.open}`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-[16/10] bg-bg-raised border-b border-line overflow-hidden relative">
                    {r.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumbnail_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-bg-raised">
                        <Sparkles className="h-8 w-8 text-accent/60" aria-hidden />
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4 sm:p-5">
                    <h3 className="font-semibold text-ink leading-snug group-hover:text-accent transition-colors line-clamp-2">
                      {title}
                    </h3>
                    {description && (
                      <p className="mt-2 text-sm text-ink-muted leading-snug line-clamp-3">
                        {description}
                      </p>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-2">
                      {r.tag ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/10 border border-accent/30 font-mono text-[10px] uppercase tracking-[0.15em] text-accent shrink-0">
                          {r.tag}
                        </span>
                      ) : (
                        <span />
                      )}
                      {isExternal && (
                        <ExternalLink className="h-4 w-4 text-ink-dim group-hover:text-accent transition-colors shrink-0" aria-hidden />
                      )}
                    </div>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
