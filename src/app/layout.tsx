import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/i18n/client';
import { getLocale } from '@/lib/i18n/server';
import { getMessages } from '@/lib/i18n/config';

export const metadata: Metadata = {
  title: 'NMO Roadmap · AI 商業 30 天成功地圖',
  description: '為 NMO 社群成員打造的個人化 30 天成功地圖',
};

// Inline pre-paint script that reads the saved theme out of localStorage
// and applies the matching class to <html> before React hydrates. Without
// this the user sees a flash of the default (dark) theme on every page
// load if they've selected light. Synchronous + tiny so the cost is
// negligible vs. the flicker cost.
const themeBootstrap = `
try {
  var t = localStorage.getItem('nmo:theme');
  if (t === 'light') document.documentElement.classList.add('light');
} catch {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  const messages = getMessages(locale);

  return (
    <html lang={locale} translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body suppressHydrationWarning>
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
