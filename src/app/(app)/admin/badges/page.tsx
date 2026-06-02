// Admin → Badges: list every badge in the catalog (tier + special) so
// admins can see what's seeded and what's been custom-uploaded.
// Custom (non-tier) badges show a soft-delete button.

import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT, getLocale } from '@/lib/i18n/server';
import { badgeIcon } from '@/lib/badges';
import { BadgeRowActions } from '@/components/admin/BadgeRowActions';
import { TierBadgeImageEditor } from '@/components/admin/TierBadgeImageEditor';
import type { Badge } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AdminBadgesPage() {
  const t = getT();
  const locale = getLocale();
  const isZh = locale === 'zh-Hant';
  const supabase = createClient();

  const { data } = await supabase
    .from('badges')
    .select('*')
    .order('category', { ascending: true })
    .order('display_order', { ascending: true });
  const all = (data ?? []) as Badge[];
  const tier = all.filter((b) => b.category === 'tier');
  const specials = all.filter((b) => b.category !== 'tier');

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        {t.admin.nav}
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="gradient-text">{t.admin.badges.title}</span>
          </h1>
          <p className="mt-2 text-ink-muted text-sm">{t.admin.badges.subtitle}</p>
        </div>
        <Link
          href="/admin/badges/new"
          className="inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          {t.admin.badges.create}
        </Link>
      </div>

      {/* Specials — uploadable / deletable */}
      <section className="card-premium p-6 mb-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-4">
          {t.admin.badges.specialsHeading} · {specials.filter((b) => b.is_active).length}
        </h2>
        {specials.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-6">{t.admin.badges.emptySpecials}</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {specials.map((b) => {
              const name = isZh ? b.name_zh : b.name_en;
              const Icon = badgeIcon(b.icon);
              return (
                <li key={b.id} className="flex items-center gap-3 py-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center border shrink-0"
                    style={{
                      backgroundColor: `${b.color ?? '#71717a'}1a`,
                      borderColor: `${b.color ?? '#71717a'}55`,
                    }}
                  >
                    {b.image_url ? (
                      <img src={b.image_url} alt="" className="h-8 w-8 object-contain rounded" />
                    ) : (
                      <Icon className="h-5 w-5" style={{ color: b.color ?? undefined }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink truncate">{name}</span>
                      {b.is_one_of_one && (
                        <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/30">
                          1-of-1
                        </span>
                      )}
                      {!b.is_active && (
                        <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-raised text-ink-dim border border-line">
                          {t.admin.badges.inactive}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-dim font-mono truncate">{b.key}</div>
                  </div>
                  {b.is_active && <BadgeRowActions badgeKey={b.key} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Tiers — image editable by super-admin (RPC enforces) */}
      <section className="card-premium p-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-4">
          {t.admin.badges.tiersHeading} · {tier.length}
        </h2>
        <p className="text-xs text-ink-muted mb-4">{t.admin.badges.tiersEditableHint}</p>
        <ul className="divide-y divide-line-subtle">
          {tier.map((b) => {
            const name = isZh ? b.name_zh : b.name_en;
            const Icon = badgeIcon(b.icon);
            const color = b.color ?? '#71717a';
            return (
              <li key={b.id} className="flex items-center gap-3 py-3">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center border shrink-0"
                  style={{
                    backgroundColor: `${color}1a`,
                    borderColor: `${color}55`,
                  }}
                >
                  {b.image_url ? (
                    <img src={b.image_url} alt="" className="h-8 w-8 object-contain rounded" />
                  ) : (
                    <Icon className="h-5 w-5" style={{ color }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink truncate">
                    Lv{b.tier} · {name}
                  </div>
                  <div className="font-mono text-xs text-ink-dim">
                    {(b.points_threshold ?? 0).toLocaleString()} pts
                  </div>
                </div>
                <TierBadgeImageEditor
                  badgeId={b.id}
                  badgeKey={b.key}
                  currentImageUrl={b.image_url ?? null}
                />
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
