'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ExternalLink, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useT } from '@/lib/i18n/client';

interface Props {
  handle: string | null;
  avatarUrl: string | null;
  skoolUrl: string | null;
  displayName: string | null;
  email: string | null;
}

export function ConfirmIdentityClient({ handle, avatarUrl, skoolUrl, displayName, email }: Props) {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const onConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/me/confirm-identity', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; nextPath?: string };
      router.push(data.nextPath ?? '/questionnaire');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const onReject = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] rounded-full bg-success/10 blur-[120px]" />
      </div>

      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl overflow-hidden border border-accent/30 mb-4 glow-blue">
            <Logo size={64} priority />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            <span className="gradient-text">{t.auth.confirmIdentityTitle}</span>
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t.auth.confirmIdentitySubtitle}</p>
        </div>

        <div className="card-premium p-6 sm:p-8 flex flex-col items-center text-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-24 w-24 rounded-full object-cover ring-4 ring-success/30"
            />
          ) : (
            <div className="h-24 w-24 rounded-full bg-bg-raised border border-line flex items-center justify-center text-2xl font-bold text-ink-muted">
              {(displayName || handle || '?').slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-xl font-semibold text-ink">{displayName || handle || '—'}</h2>
              <ShieldCheck className="h-4 w-4 text-success" />
            </div>
            {handle && (
              <a
                href={skoolUrl ?? `https://www.skool.com/@${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-ink-dim font-mono hover:text-accent inline-flex items-center gap-1"
              >
                @{handle}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {email && (
              <p className="text-xs text-ink-muted mt-1">{email}</p>
            )}
          </div>

          <div className="w-full flex flex-col gap-2 mt-2">
            <Button onClick={onConfirm} size="lg" loading={loading} className="w-full">
              <Check className="h-4 w-4 mr-1" />
              {loading ? t.auth.confirming : t.auth.confirmYes}
            </Button>
            <Button
              onClick={onReject}
              variant="ghost"
              size="lg"
              disabled={loading}
              className="w-full"
            >
              <X className="h-4 w-4 mr-1" />
              {t.auth.confirmNo}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
