'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, ShieldAlert, ShieldCheck, ArrowLeft, Check } from 'lucide-react';
import { Confetti } from '@/components/Confetti';
import { createClient } from '@/lib/supabase/client';
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

export default function SignupPage() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [prefilled, setPrefilled] = useState<PrefilledMember | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  // Validate ?handle= against nmo_members on load. If invalid, kick back to /
  useEffect(() => {
    const raw = searchParams.get('handle');
    if (!raw) {
      // No handle — send back to home so user must search first
      router.replace('/');
      return;
    }
    const handle = raw.toLowerCase();
    if (!HANDLE_REGEX.test(handle)) {
      setVerifyError('invalid');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/skool/search?handle=${encodeURIComponent(handle)}`);
        const data = await res.json();
        if (data.ok && data.isMember) {
          setPrefilled({
            handle: data.handle,
            displayName: data.displayName,
            avatarUrl: data.avatarUrl,
          });
        } else {
          setVerifyError('not_member');
        }
      } catch {
        setVerifyError('network');
      }
    })();
  }, [searchParams, router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefilled) return;
    setLoading(true);
    setError('');
    setSuccess('');

    const { error: signupErr } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });

    if (signupErr) {
      setError(signupErr.message);
      setLoading(false);
      return;
    }

    // Persist the verified handle on the new profile.
    // (May fail silently if Supabase still requires email confirmation —
    //  the verify endpoint will be retried on the user's next visit.)
    try {
      await fetch('/api/skool/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: prefilled.handle }),
      });
    } catch {
      // Non-fatal
    }

    // Always celebrate — Supabase should be configured with email
    // confirmation OFF so the user is signed in immediately.
    setLoading(false);
    setCelebrating(true);
  };

  // Auto-redirect from celebration screen
  useEffect(() => {
    if (!celebrating) return;
    const tid = setTimeout(() => {
      router.push('/questionnaire');
      router.refresh();
    }, 3000);
    return () => clearTimeout(tid);
  }, [celebrating, router]);

  const handleContinueNow = () => {
    router.push('/questionnaire');
    router.refresh();
  };

  // Pre-validation states
  if (verifyError === 'not_member' || verifyError === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <ShieldAlert className="h-12 w-12 text-warn mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold mb-2">
            {t.welcome.notFoundTitle}
          </h1>
          <p className="text-ink-muted mb-6">{t.welcome.notFoundDesc}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-accent hover:text-accent-glow font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.onboarding.back}
          </Link>
        </div>
      </div>
    );
  }

  if (!prefilled) {
    // Validating the handle from the query string
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="text-ink-muted text-sm">{t.common.loading}</div>
      </div>
    );
  }

  // Celebration screen — shown immediately after successful signup, then auto-redirects
  if (celebrating) {
    const displayName = prefilled.displayName || `@${prefilled.handle}`;
    const firstName = displayName.split(/\s+/)[0];
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-success/15 blur-[140px]" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-accent/10 blur-[120px]" />
        </div>

        {/* Confetti */}
        <Confetti />

        <div className="w-full max-w-md animate-slide-up relative">
          <div onClick={handleContinueNow} className="card-premium px-6 py-10 sm:px-8 sm:py-12 text-center cursor-pointer">
            {/* Green check circle */}
            <div className="inline-flex items-center justify-center h-22 w-22 sm:h-24 sm:w-24 rounded-full bg-success/15 border border-success/40 mb-5">
              <Check className="h-12 w-12 sm:h-14 sm:w-14 text-success" strokeWidth={3} />
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink mb-2">
              {(t.welcome.successWelcome ?? 'Welcome,').replace('{name}', firstName)}{' '}
              <span className="inline-block">🎉</span>
            </h1>

            <p className="text-sm text-ink-muted mb-5">
              {t.welcome.successAccountReady}
            </p>

            {/* Identity chip */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-raised border border-line">
              {prefilled.avatarUrl ? (
                <img src={prefilled.avatarUrl} alt="" decoding="async" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <div className="h-6 w-6 rounded-full bg-bg-card border border-line flex items-center justify-center text-[10px] font-mono text-ink-muted">
                  {prefilled.handle.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium text-ink">{displayName}</span>
            </div>
          </div>

          <p className="mt-5 text-xs text-center text-ink-dim flex items-center justify-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            {t.welcome.successRedirecting}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent/10 blur-[120px]" />
      </div>

      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl overflow-hidden border border-accent/30 mb-4 glow-blue">
            <Logo size={64} priority />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight">
            <span className="gradient-text">{t.auth.signupTitle}</span>
          </h1>
          <p className="mt-2 text-ink-muted">{t.auth.signupSubtitle}</p>
        </div>

        {/* Verified Skool identity card */}
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
          <Link href="/" className="text-xs text-ink-dim hover:text-ink-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        {success && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{success}</p>
          </div>
        )}

        <div className="mb-5 flex items-start gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-warn" />
          <div>
            <p className="text-sm font-medium text-ink">{t.auth.skoolEmailNotice}</p>
            <p className="text-xs text-ink-muted mt-1">{t.auth.skoolEmailNoticeDesc}</p>
          </div>
        </div>

        <form onSubmit={handleSignup} className="card-premium p-6 sm:p-8 space-y-5">
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
            minLength={6}
            autoComplete="new-password"
            error={error}
          />
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {loading ? t.auth.loading : t.auth.signup}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {t.auth.haveAccount}{' '}
          <Link href="/login" className="text-accent hover:text-accent-glow font-medium">
            {t.auth.loginLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
