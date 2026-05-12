'use client';

// Global error boundary. Renders when a server component throws or a
// client component crashes outside of its own boundary. Same visual
// language as the 404 page.

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    if (typeof console !== 'undefined') {
      // Surface in dev tools; production logs are handled by Next.js.
      console.error(error);
    }
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 text-center">
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-danger/10 blur-[140px]" />
      </div>

      <div className="w-full max-w-md animate-slide-up">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-danger/10 border border-danger/30 mb-5">
          <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={2.5} aria-hidden />
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          {t.common.errorTitle}
        </h1>
        <p className="text-ink-muted mb-2">{t.common.errorDesc}</p>
        {error.digest && (
          <p className="font-mono text-[11px] text-ink-dim mb-6">ref: {error.digest}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-hover shadow-lg shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-0.5 transition-all"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t.common.tryAgain}
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg border border-line-strong bg-bg-raised text-ink-muted hover:text-ink hover:border-accent transition-colors text-sm font-medium"
          >
            {t.common.backToDashboard}
          </a>
        </div>
      </div>
    </div>
  );
}
