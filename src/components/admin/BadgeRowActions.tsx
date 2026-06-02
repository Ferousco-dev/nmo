'use client';

// Soft-delete button for an admin-uploaded badge. Tier badges hide
// this button (they can't be deleted via the RPC anyway).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/lib/i18n/client';

export function BadgeRowActions({ badgeKey }: { badgeKey: string }) {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const onDelete = async () => {
    if (!confirm(t.admin.badges.confirmDelete)) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_soft_delete_badge', {
      p_badge_key: badgeKey,
    });
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    startTransition(() => router.refresh());
  };

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      aria-label={t.admin.badges.delete}
      className="h-10 w-10 rounded-md text-ink-dim hover:text-danger hover:bg-danger/10 flex items-center justify-center transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
