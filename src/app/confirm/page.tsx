import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';

export const dynamic = 'force-dynamic';

const HANDLE_REGEX = /^[a-zA-Z0-9_-]{2,40}$/;

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: { handle?: string };
}) {
  const t = getT();
  const supabase = createClient();

  // Already signed in → go where they belong
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single();
    redirect(profile?.onboarding_completed ? '/dashboard' : '/questionnaire');
  }

  const raw = (searchParams.handle ?? '').trim().replace(/^@+/, '').toLowerCase();
  if (!raw || !HANDLE_REGEX.test(raw)) {
    redirect('/');
  }

  const { data: member } = await supabase
    .from('nmo_members')
    .select('handle, display_name, avatar_url, level')
    .eq('handle', raw)
    .maybeSingle();

  if (!member) {
    redirect('/');
  }

  const initials = (member.display_name || member.handle).slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar — fixed */}
      <header className="fixed top-0 left-0 right-0 z-30 backdrop-blur-xl bg-bg/70 border-b border-line/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <Logo size={28} className="shrink-0" priority />
            <span className="font-display text-lg sm:text-xl font-bold tracking-tight truncate">
              NMO <span className="gradient-text">Roadmap</span>
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Background glow */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-accent/10 blur-[140px]" />
      </div>

      <main className="flex-1 flex items-center justify-center px-4 py-24">
        <div className="w-full max-w-md animate-slide-up">
          <div className="card-premium p-6 sm:p-10 text-center">
            {/* Big avatar centered */}
            <div className="flex justify-center mb-6">
              {member.avatar_url ? (
                <img
                  src={member.avatar_url}
                  alt={member.display_name || `@${member.handle}`}
                  decoding="async"
                  className="h-32 w-32 sm:h-36 sm:w-36 rounded-full object-cover border-4 border-accent/40 glow-blue"
                />
              ) : (
                <div className="h-32 w-32 sm:h-36 sm:w-36 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center font-display text-5xl font-bold text-white border-4 border-accent/40 glow-blue">
                  {initials}
                </div>
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold mb-4 gradient-text">
              {t.welcome.confirmTitle}
            </h1>

            <div className="space-y-1 mb-6">
              <div className="font-semibold text-xl text-ink">
                {member.display_name || `@${member.handle}`}
              </div>
              <div className="text-sm text-ink-muted font-mono">@{member.handle}</div>
              {member.level != null && (
                <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md bg-accent/10 border border-accent/30 text-xs font-mono text-accent">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Lv{member.level} · NMO
                </div>
              )}
            </div>

            <Link
              href={`/signup?handle=${encodeURIComponent(member.handle)}`}
              className="inline-flex items-center justify-center gap-2 w-full h-13 px-7 rounded-lg bg-accent text-white font-medium text-base hover:bg-accent-hover shadow-lg shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-0.5 transition-all"
            >
              {t.welcome.confirmCta}
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/"
              className="mt-4 inline-flex items-center justify-center gap-1.5 w-full text-sm text-ink-muted hover:text-ink transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t.welcome.confirmBack}
            </Link>
          </div>

          <p className="mt-6 text-center text-sm text-ink-muted">
            {t.welcome.haveAccount}{' '}
            <Link href="/login" className="text-accent hover:text-accent-glow font-medium">
              {t.welcome.signIn}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
