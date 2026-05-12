'use client';

// Hide / restore toggle for a single resource row. Admin-only via RLS.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

interface Props {
  resourceId: string;
  isActive: boolean;
}

export function ResourceRowActions({ resourceId, isActive }: Props) {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const toggle = async () => {
    setBusy(true);
    const { error } = await supabase
      .from('resources')
      .update({ is_active: !isActive })
      .eq('id', resourceId);
    setBusy(false);
    if (error) return;
    startTransition(() => router.refresh());
  };

  const label = isActive ? t.admin.resources.remove : t.admin.resources.restore;
  const Icon = isActive ? EyeOff : Eye;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        isActive
          ? 'text-ink-muted hover:text-danger hover:bg-danger/10 border border-line'
          : 'text-success border border-success/40 bg-success/5 hover:bg-success/10',
        busy && 'opacity-50 cursor-not-allowed'
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{busy ? t.admin.resources.removing : label}</span>
    </button>
  );
}
