import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/i18n/client';
import { getLocale } from '@/lib/i18n/server';
import { getMessages } from '@/lib/i18n/config';

export const metadata: Metadata = {
  title: 'NMO Roadmap · AI 商業 30 天成功地圖',
  description: '為 NMO 社群成員打造的個人化 30 天成功地圖',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  const messages = getMessages(locale);

  return (
    <html lang={locale} className="dark" translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body suppressHydrationWarning>
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
