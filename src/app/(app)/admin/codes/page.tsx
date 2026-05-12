import Link from 'next/link';
import { ChevronLeft, Ticket } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CreateCodeForm } from '@/components/admin/CreateCodeForm';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

interface CodeRow {
  code: string;
  description: string | null;
  points_value: number;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export default async function AdminCodesPage() {
  const t = getT();
  const supabase = createClient();

  const { data: codes } = await supabase
    .from('event_codes')
    .select('*')
    .order('created_at', { ascending: false });

  const rows = (codes ?? []) as CodeRow[];
  const active = rows.filter((c) => c.is_active);

  return (
          <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-6"
        >
          <ChevronLeft className="h-4 w-4" />
          {t.admin.nav}
        </Link>

        <div className="mb-6">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="gradient-text">{t.admin.codes.title}</span>
          </h1>
        </div>

        {/* Create form */}
        <div className="card-premium p-6 mb-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-3">
            {t.admin.codes.newCode}
          </h2>
          <CreateCodeForm />
        </div>

        {/* Active codes */}
        <div className="card-premium p-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-3">
            {t.admin.codes.activeCodes}
          </h2>
          {active.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-6">{t.admin.codes.noCodes}</p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {active.map((c) => {
                const isExpired = c.expires_at && new Date(c.expires_at).getTime() < Date.now();
                const usesPct =
                  c.max_uses != null ? Math.min(100, (c.current_uses / c.max_uses) * 100) : 0;
                return (
                  <li key={c.code} className="py-3 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                      <Ticket className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold tracking-widest text-ink truncate">
                          {c.code}
                        </span>
                        <span className="text-xs font-mono text-accent">+{c.points_value} pts</span>
                        {isExpired && (
                          <span className="text-[10px] font-mono uppercase text-danger">expired</span>
                        )}
                      </div>
                      {c.description && (
                        <p className="text-xs text-ink-muted truncate">{c.description}</p>
                      )}
                      <div className="text-[11px] font-mono text-ink-dim mt-0.5">
                        {c.current_uses} {t.admin.codes.uses}
                        {c.max_uses != null && ` / ${c.max_uses} ${t.admin.codes.maxUses}`}
                        {c.expires_at && ` · ${new Date(c.expires_at).toLocaleDateString()}`}
                      </div>
                      {c.max_uses != null && (
                        <div className="mt-1 h-0.5 bg-bg-raised rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all"
                            style={{ width: `${usesPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
  );
}
