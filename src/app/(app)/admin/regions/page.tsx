import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { RegionsManager } from '@/components/admin/RegionsManager';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

interface RegionRow {
  id: string;
  name: string;
  display_order: number;
  member_count: number;
  leader_count: number;
}

export default async function AdminRegionsPage() {
  const t = getT();
  const supabase = createClient();

  const { data: rows } = await supabase
    .from('region_roster')
    .select('id, name, display_order, member_count, leader_count')
    .order('display_order', { ascending: true });

  const regions = (rows ?? []) as RegionRow[];

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-5"
      >
        <ChevronLeft className="h-4 w-4" />
        {t.admin.nav}
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          <span className="gradient-text">Regions</span>
        </h1>
        <p className="mt-2 text-ink-muted">
          Organize members and leaders by geographic region. Useful for offline events,
          local meetups, and regional moderation.
        </p>
      </div>

      <RegionsManager initialRegions={regions} />
    </main>
  );
}
