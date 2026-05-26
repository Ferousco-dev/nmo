'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { useT } from '@/lib/i18n/client';

const HANDLE_REGEX = /^[a-zA-Z0-9_-]{2,40}$/;

interface PrefilledMember {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prefilled, setPrefilled] = useState<PrefilledMember | null>(null);

  // If we arrived from the welcome search with ?handle=…, fetch that
  // member's profile from nmo_members so we can render an "is this you?"
  // card above the form. Purely cosmetic confirmation — the actual login
  // still validates email + password against api2.skool.com.
  useEffect(() => {
    const raw = (searchParams.get('handle') ?? '').trim().replace(/^@+/, '').toLowerCase();
    if (!raw || !HANDLE_REGEX.test(raw)) {
      setPrefilled(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/skool/search?handle=${encodeURIComponent(raw)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.ok && data.isMember) {
          setPrefilled({
            handle: data.handle,
            displayName: data.displayName ?? null,
            avatarUrl: data.avatarUrl ?? null,
          });
        }
      } catch {
        // Non-fatal: form still works without the preview card.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let res: Response;
    try {
      res = await fetch('/api/auth/skool-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      setError(t.auth.networkError);
      setLoading(false);
      return;
    }

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      step?: string;
      detail?: string;
      status?: number;
      nextPath?: string;
      onboardingCompleted?: boolean;
      identityConfirmed?: boolean;
      skoolUserId?: string;
      handle?: string;
    };

    // Dev-time visibility: log the full response so testing surfaces
    // the failing step. Remove once flow is validated.
    // eslint-disable-next-line no-console
    console.log('[login] /api/auth/skool-login →', res.status, data);

    if (!res.ok || !data.ok) {
      // Map server error codes to user-facing copy. Anything unmapped
      // falls through to a generic invalid-creds message.
      const code = data.error ?? '';
      if (code === 'not_a_member') setError(t.auth.notAMember);
      else if (code === 'skool_unreachable' || code === 'skool_error')
        setError(t.auth.skoolUnreachable);
      else setError(t.auth.invalidCreds);
      setLoading(false);
      return;
    }

    // Fire-and-forget per-user engagement refresh via Apify. The
    // route is cooldown-throttled (10 min) so re-logins don't spam
    // runs. Errors don't block login — the daily cron is the
    // safety net.
    fetch('/api/me/refresh-engagement', { method: 'POST' }).catch(() => {});

    router.push(data.nextPath ?? '/dashboard');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent/10 blur-[120px]" />
      </div>

      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl overflow-hidden border border-accent/30 mb-4 glow-blue">
            <Logo size={64} priority />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight">
            <span className="gradient-text">{t.auth.loginTitle}</span>
          </h1>
          <p className="mt-2 text-ink-muted">{t.auth.loginSubtitle}</p>
        </div>

        {/* "Is this you?" preview when arriving from /?handle=… */}
        {prefilled && (
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
            {prefilled.avatarUrl ? (
              <img
                src={prefilled.avatarUrl}
                alt=""
                decoding="async"
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-success/10 border border-success/40 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-success" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink truncate">
                {prefilled.displayName || `@${prefilled.handle}`}
              </div>
              <div className="text-xs text-ink-muted font-mono">@{prefilled.handle}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="card-premium p-6 sm:p-8 space-y-5">
          <Input
            label={t.auth.email}
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            label={t.auth.password}
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            error={error}
          />
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {loading ? t.auth.loading : t.auth.login}
          </Button>
        </form>

      </div>
    </div>
  );
}
