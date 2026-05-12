// Shared shell for all authenticated app pages. Hoisting <TopNav /> here
// keeps it mounted across in-app navigation, so we stop refetching admin
// status / profile / user chip on every route change — and the sidebar
// stays visually stable instead of remounting.
//
// `--sidebar-w` is set to 4rem (collapsed) by default in globals.css and
// updated to 16rem (expanded) by TopNav when the user toggles the rail.

import type { ReactNode } from 'react';
import { TopNav } from '@/components/TopNav';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:pl-[var(--sidebar-w,4rem)] transition-[padding] duration-200">
      <TopNav />
      {children}
    </div>
  );
}
