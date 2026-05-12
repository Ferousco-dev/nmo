// Route-segment loading state for the (app) group. Because this lives
// INSIDE the layout (alongside <TopNav />), the sidebar stays mounted
// while a page's data fetches — only the main content swaps to this
// skeleton. Keeps navigation visually anchored.

import { Logo } from '@/components/Logo';

export default function AppLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 flex items-start justify-center">
      <div className="mt-16 sm:mt-24 flex flex-col items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 m-auto h-6 w-6 opacity-60">
            <Logo size={24} />
          </div>
          <div
            className="h-14 w-14 rounded-full border-4 border-accent/30 border-t-accent animate-spin"
            role="status"
            aria-label="Loading"
          />
        </div>
      </div>
    </main>
  );
}
