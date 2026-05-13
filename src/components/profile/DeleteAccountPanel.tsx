'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function DeleteAccountPanel() {
  const t = useT();
  const d = t.profile.danger;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const click = async () => {
    if (busy) return;
    // Native confirm is locale-agnostic and good enough for a
    // destructive action that should NOT be one-click.
    if (!confirm(d.confirm)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/me/account', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.detail || d.failed);
        setBusy(false);
        return;
      }
      // Profile is gone + session signed out. Route to the public
      // landing so the middleware doesn't try to re-fetch a missing
      // profile.
      router.replace('/');
      router.refresh();
    } catch {
      setError(t.common.networkError);
      setBusy(false);
    }
  };

  return (
    <div className="card-premium p-5 sm:p-8 mt-6 border-red-500/30 bg-red-500/[0.03]">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg font-bold text-ink">{d.title}</h3>
          <p className="text-sm text-ink-muted mt-0.5">{d.desc}</p>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-400 font-medium">{error}</p>}

      <button
        type="button"
        onClick={click}
        disabled={busy}
        className={cn(
          'inline-flex items-center gap-2 px-4 h-10 rounded-lg font-medium text-sm transition-colors',
          'bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {busy ? d.deleting : d.deleteCta}
      </button>
    </div>
  );
}
