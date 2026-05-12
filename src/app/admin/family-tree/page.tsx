import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TopNav } from '@/components/TopNav';
import { FamilyTreeManager } from '@/components/admin/FamilyTreeManager';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

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

export default async function AdminFamilyTreePage() {
  const t = getT();
  const supabase = createClient();

  const { data: rows } = await supabase
    .from('family_tree')
    .select('id, name, role, region, photo_url, skool_handle, bio, display_order')
    .order('display_order', { ascending: true });

  const members = (rows ?? []) as FamilyTreeRow[];

  return (
    <div className="min-h-screen">
      <TopNav />
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
            <span className="gradient-text">家族樹管理</span>
          </h1>
          <p className="mt-2 text-ink-muted">
            搜尋 Skool 用戶名稱，加入新的家族樹成員並指派職位。頭像與名稱會持續從 Skool 同步。
          </p>
        </div>

        <FamilyTreeManager initialMembers={members} />
      </main>
    </div>
  );
}
