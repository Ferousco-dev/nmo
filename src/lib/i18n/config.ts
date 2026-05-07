import { t as zhHant } from '@/messages/zh-Hant';
import { t as en } from '@/messages/en';

export const LOCALES = ['zh-Hant', 'en'] as const;
export type Locale = typeof LOCALES[number];

export const DEFAULT_LOCALE: Locale = 'zh-Hant';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

// Both message files export the SAME shape; this is the canonical type.
export type Messages = typeof zhHant;

const messages: Record<Locale, Messages> = {
  'zh-Hant': zhHant,
  'en': en,
};

export function getMessages(locale: Locale): Messages {
  return messages[locale] ?? messages[DEFAULT_LOCALE];
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-Hant': '繁體中文',
  'en': 'English',
};
