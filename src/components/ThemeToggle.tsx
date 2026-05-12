'use client';

// Theme toggle. The actual theme switch is just `document.documentElement
// .classList.toggle('light')` — the rest of the app is themed via CSS
// variables in globals.css that flip when that class changes.
//
// State is persisted in localStorage under `nmo:theme`. The initial class
// is set by an inline anti-flicker script in src/app/layout.tsx so the
// page never paints the wrong theme on first load.

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'nmo:theme';

type Theme = 'light' | 'dark';

interface Props {
  /** Render style — `icon` is a 40px square (default), `pill` matches the LanguageSwitcher chip */
  variant?: 'icon' | 'pill';
  className?: string;
}

export function ThemeToggle({ variant = 'icon', className }: Props = {}) {
  // Hydrate from the actual class on <html> — set by the bootstrap script
  // pre-paint, so this matches what the user is seeing.
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* private mode — ignore */ }
  };

  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  const Icon = isDark ? Sun : Moon;

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          className
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'flex items-center justify-center h-10 w-10 rounded-lg text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        className
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}
