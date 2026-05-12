'use client';

import { useState, useTransition } from 'react';
import { Globe, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/config';
import { useLocale } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

interface Props {
  /** Where the dropdown should open relative to the trigger. Default 'bottom'. */
  placement?: 'top' | 'bottom';
  /** Stretch the trigger to fill its container — for sidebar bottom slot. */
  fullWidth?: boolean;
}

export function LanguageSwitcher({ placement = 'bottom', fullWidth = false }: Props = {}) {
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
    <div className={cn('relative', fullWidth && 'w-full')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors',
          fullWidth && 'w-full'
        )}
        aria-label="Change language"
        aria-expanded={open}
      >
        <Globe className="h-4 w-4 shrink-0" aria-hidden />
        <span className={cn(fullWidth ? 'inline' : 'hidden sm:inline')}>{LOCALE_LABELS[current]}</span>
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
          <div
            className={cn(
              'absolute z-50 min-w-[160px] rounded-lg border border-line bg-bg-card shadow-xl overflow-hidden',
              placement === 'top' ? 'bottom-full mb-1 left-0' : 'top-full mt-1 right-0',
              fullWidth && 'w-full'
            )}
          >
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
                {loc === current && <Check className="ml-auto h-3.5 w-3.5" aria-hidden />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
