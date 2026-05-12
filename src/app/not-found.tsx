// Branded 404 page. Same visual language as the loading screen and
// post-signup celebration so the product feels intentional even on
// error paths.

import Link from 'next/link';
import { Compass } from 'lucide-react';
import { getT } from '@/lib/i18n/server';

export default function NotFound() {
  const t = getT();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 text-center">
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent/10 blur-[140px]" />
      </div>

      <div className="w-full max-w-md animate-slide-up">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-accent/10 border border-accent/30 mb-5 glow-blue">
          <Compass className="h-8 w-8 text-accent" strokeWidth={2.5} aria-hidden />
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink-dim mb-2">404</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          <span className="gradient-text">{t.common.notFoundTitle}</span>
        </h1>
        <p className="text-ink-muted mb-8">{t.common.notFoundDesc}</p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-hover shadow-lg shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-0.5 transition-all"
          >
            {t.common.backToDashboard}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg border border-line-strong bg-bg-raised text-ink-muted hover:text-ink hover:border-accent transition-colors text-sm font-medium"
          >
            {t.common.backHome}
          </Link>
        </div>
      </div>
    </div>
  );
}
