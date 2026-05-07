'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Flame, Map, Trophy, Users, Gift, User, LogOut, LayoutDashboard, Activity, Menu, X, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function TopNav() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin status once on mount. Admin link is hidden until resolved
  // to avoid a flash of the link for non-admins.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) setIsAdmin(!!data);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const NAV_ITEMS = [
    { href: '/dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { href: '/activity', label: t.nav.activity, icon: Activity },
    { href: '/roadmap', label: t.nav.roadmap, icon: Map },
    { href: '/leaderboard', label: t.nav.leaderboard, icon: Trophy },
    { href: '/family-tree', label: t.nav.familyTree, icon: Users },
    { href: '/redeem', label: t.nav.redeem, icon: Gift },
    { href: '/profile', label: t.nav.profile, icon: User },
    ...(isAdmin ? [{ href: '/admin', label: t.admin.nav, icon: ShieldCheck }] : []),
  ];

  const handleLogout = async () => {
    setDrawerOpen(false);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Close drawer when route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [drawerOpen]);

  return (
    <>
      <nav className="sticky top-0 z-30 backdrop-blur-xl bg-bg/80 border-b border-line">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
              <Flame className="h-6 w-6 text-accent shrink-0" strokeWidth={2.5} />
              <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-ink truncate">
                NMO <span className="gradient-text">Roadmap</span>
              </span>
            </Link>

            {/* Desktop nav (md+) */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-accent/10 text-accent'
                        : 'text-ink-muted hover:text-ink hover:bg-bg-hover'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center gap-1">
              {/* Language switcher always visible */}
              <LanguageSwitcher />

              {/* Logout — desktop only (mobile has it in drawer) */}
              <button
                onClick={handleLogout}
                className="hidden md:flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:text-danger hover:bg-bg-hover transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden lg:inline">{t.nav.logout}</span>
              </button>

              {/* Hamburger — mobile only */}
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                className="md:hidden flex items-center justify-center h-10 w-10 rounded-lg text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-bg/80 backdrop-blur-sm animate-fade-in"
          />

          {/* Slide-in panel */}
          <div className="absolute top-0 right-0 h-full w-[85%] max-w-sm bg-bg-raised border-l border-line shadow-2xl flex flex-col animate-slide-up">
            <div className="flex items-center justify-between h-16 px-4 border-b border-line shrink-0">
              <span className="font-display text-lg font-bold gradient-text">
                {t.nav.profile === 'Profile' ? 'Menu' : '選單'}
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="flex items-center justify-center h-10 w-10 rounded-lg text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <ul className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setDrawerOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors',
                          active
                            ? 'bg-accent/10 text-accent'
                            : 'text-ink-muted hover:text-ink hover:bg-bg-hover active:bg-bg-card'
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="p-3 border-t border-line shrink-0">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-ink-muted hover:text-danger hover:bg-bg-hover transition-colors"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <span>{t.nav.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
