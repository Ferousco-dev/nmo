import { NextResponse } from 'next/server';
import { LOCALE_COOKIE, isLocale } from '@/lib/i18n/config';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  if (!isLocale(body.locale)) {
    return NextResponse.json({ ok: false, error: 'invalid_locale' }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, locale: body.locale });
  res.cookies.set(LOCALE_COOKIE, body.locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return res;
}
