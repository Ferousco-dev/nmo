'use client';

import { useState, useTransition } from 'react';
import { Globe, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/config';
import { useLocale } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function LanguageSwitcher() {
  const current = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const choose = async (locale: Locale) => {
    if (locale === current) {
      setOpen(false);
      return;
    }
    setOpen(false);
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    });
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors"
        aria-label="Change language"
        aria-expanded={open}
      >
        <Globe className="h-4 w-4" />
        <span className="hidden sm:inline">{LOCALE_LABELS[current]}</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40"
          />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-line bg-bg-card shadow-xl overflow-hidden">
            {LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => choose(loc)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  loc === current
                    ? 'bg-accent/10 text-accent'
                    : 'text-ink-muted hover:text-ink hover:bg-bg-hover'
                )}
              >
                <span className="font-medium">{LOCALE_LABELS[loc]}</span>
                {loc === current && <Check className="ml-auto h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
