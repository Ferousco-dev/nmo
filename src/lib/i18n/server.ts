import { cookies } from 'next/headers';
import { cache } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  getMessages,
  isLocale,
  type Locale,
  type Messages,
} from './config';

/**
 * Read the current locale from the request cookie.
 * Cached per-request via React's cache().
 */
export const getLocale = cache((): Locale => {
  const value = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/**
 * Get the message dictionary for the current request's locale.
 * Use in server components: `const t = getT();` then `t.foo.bar`.
 */
export function getT(): Messages {
  return getMessages(getLocale());
}
