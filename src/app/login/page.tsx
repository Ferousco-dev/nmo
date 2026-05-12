'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { useT } from '@/lib/i18n/client';

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(t.auth.invalidCreds);
      setLoading(false);
      return;
    }

    // Check onboarding status
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single();

      router.push(profile?.onboarding_completed ? '/dashboard' : '/onboarding');
      router.refresh();
    }
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

        <form onSubmit={handleLogin} className="card-premium p-8 space-y-5">
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

        <p className="mt-6 text-center text-sm text-ink-muted">
          {t.auth.noAccount}{' '}
          <Link href="/signup" className="text-accent hover:text-accent-glow font-medium">
            {t.auth.signupLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
