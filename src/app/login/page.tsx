'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { useT } from '@/lib/i18n/client';

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
