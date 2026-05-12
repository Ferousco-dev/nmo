import Link from 'next/link';
import { Users, Ticket, ScrollText, ArrowRight, Network } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TopNav } from '@/components/TopNav';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const t = getT();
  const supabase = createClient();

  // Quick counts for the overview cards
  const [
    { count: memberCount },
    { count: codeCount },
    { count: familyTreeCount },
    { data: recentActions },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('event_codes').select('code', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('family_tree').select('id', { count: 'exact', head: true }),
    supabase
      .from('admin_actions')
      .select('id, action_type, target_user_id, payload, created_at, admin_id')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const cards = [
    { href: '/admin/members', icon: Users, count: memberCount ?? 0, ...t.admin.cards.members },
    { href: '/admin/codes', icon: Ticket, count: codeCount ?? 0, ...t.admin.cards.codes },
    {
      href: '/admin/family-tree',
      icon: Network,
      count: familyTreeCount ?? 0,
      title: '家族樹管理',
      desc: '搜尋 Skool 用戶並加入家族樹',
    },
  ];

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent mb-1">
            {t.admin.nav}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="gradient-text">{t.admin.overviewTitle}</span>
          </h1>
          <p className="mt-2 text-ink-muted">{t.admin.overviewSubtitle}</p>
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.href}
                href={c.href}
                className="card-premium p-6 hover:border-accent/50 transition-colors group flex items-start gap-4"
              >
                <div className="h-11 w-11 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-ink group-hover:text-accent transition-colors">
                      {c.title}
                    </h3>
                    <ArrowRight className="h-4 w-4 text-ink-dim group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-xs text-ink-muted mb-2">{c.desc}</p>
                  <p className="text-2xl font-display font-bold text-ink">
                    {c.count.toLocaleString()}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Recent admin actions */}
        <div className="card-premium p-6">
          <div className="flex items-center gap-2 mb-4">
            <ScrollText className="h-4 w-4 text-ink-muted" />
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
              {t.admin.cards.audit.title}
            </h2>
          </div>
          {!recentActions || recentActions.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-6">
              {t.admin.cards.audit.desc}
            </p>
          ) : (
            <ul className="space-y-2">
              {recentActions.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-raised/40 text-sm"
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-accent shrink-0">
                    {a.action_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-ink-muted truncate flex-1 min-w-0 font-mono text-xs">
                    {JSON.stringify(a.payload ?? {}).slice(0, 80)}
                  </span>
                  <span className="text-[10px] text-ink-dim font-mono shrink-0">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
