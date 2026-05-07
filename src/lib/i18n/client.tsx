'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Locale, Messages } from './config';

interface I18nContextValue {
  locale: Locale;
  t: Messages;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, t: messages }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT(): Messages {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useT() must be used inside <I18nProvider>');
  }
  return ctx.t;
}

export function useLocale(): Locale {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useLocale() must be used inside <I18nProvider>');
  }
  return ctx.locale;
}
