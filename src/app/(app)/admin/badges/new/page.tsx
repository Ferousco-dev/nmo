// Admin → Badges → New: Cloudinary-backed upload form. The form
// component handles the multi-step flow (signature → Cloudinary upload
// → admin_create_badge RPC).

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { BadgeUploadForm } from '@/components/admin/BadgeUploadForm';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default function AdminBadgeNewPage() {
  const t = getT();
  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <Link
        href="/admin/badges"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        {t.admin.badges.title}
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          <span className="gradient-text">{t.admin.badges.newTitle}</span>
        </h1>
        <p className="mt-2 text-ink-muted text-sm">{t.admin.badges.newSubtitle}</p>
      </div>

      <div className="card-premium p-6">
        <BadgeUploadForm />
      </div>
    </main>
  );
}
