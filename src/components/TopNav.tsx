'use client';

// App shell. Renders three views depending on viewport:
//
//   • Mobile (< lg): a sticky top bar with hamburger + brand + lang switcher.
//   • Mobile drawer: full-width labeled nav slides in from the left, with
//     user chip + logout at the bottom.
//   • Desktop (lg+): icon-only sidebar (w-16) pinned to the viewport's left
//     edge for primary nav, plus a sticky top utility bar that hosts the
//     brand wordmark, language switcher, and logout.
//
// Pages that use this shell pad their content with `lg:pl-16` so the main
// area starts to the right of the icon rail.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Map, Trophy, Users, Gift, User, LogOut, LayoutDashboard,
  Activity, Menu, X, ShieldCheck, BookOpenText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';

const DRAWER_ID = 'app-mobile-drawer';
const DRAWER_TITLE_ID = 'app-mobile-drawer-title';
const SIDEBAR_STORAGE_KEY = 'nmo:sidebar-expanded';

interface UserChipState {
  avatarUrl: string | null;
  name: string;
  handle: string | null;
}

export function TopNav() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userChip, setUserChip] = useState<UserChipState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Hydrate sidebar expand state from localStorage on first mount
  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1') setExpanded(true);
    } catch { /* private mode / SSR — ignore */ }
  }, []);

  // Push the current width into a CSS var on <html> so the (app) layout's
  // `lg:pl-[var(--sidebar-w)]` animates page content alongside the rail.
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', expanded ? '16rem' : '4rem');
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, expanded ? '1' : '0');
    } catch { /* ignore */ }
  }, [expanded]);

  // Resolve admin status + identity for the user chip in one trip. Hidden
  // until resolved to avoid a flash of the wrong state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const [adminRes, profileRes] = await Promise.all([
        supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('skool_avatar_url, skool_display_name, skool_handle, display_name, email')
          .eq('id', user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setIsAdmin(!!adminRes.data);
      const p = profileRes.data;
      if (p) {
        setUserChip({
          avatarUrl: p.skool_avatar_url ?? null,
          name:
            p.skool_display_name ||
            p.display_name ||
            (p.skool_handle ? `@${p.skool_handle}` : null) ||
            (p.email ? p.email.split('@')[0] : null) ||
            'You',
          handle: p.skool_handle ?? null,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
    { href: '/dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { href: '/activity', label: t.nav.activity, icon: Activity },
    { href: '/roadmap', label: t.nav.roadmap, icon: Map },
    { href: '/resources', label: t.nav.resources, icon: BookOpenText },
    { href: '/leaderboard', label: t.nav.leaderboard, icon: Trophy },
    { href: '/family-tree', label: t.nav.familyTree, icon: Users },
    { href: '/redeem', label: t.nav.redeem, icon: Gift },
    { href: '/profile', label: t.nav.profile, icon: User },
    ...(isAdmin
      ? [{ href: '/admin', label: t.admin.nav, icon: ShieldCheck as LucideIcon }]
      : []),
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

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (drawerOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [drawerOpen]);

  // Focus management — to close button on open, back to hamburger on close
  useEffect(() => {
    if (drawerOpen) {
      closeButtonRef.current?.focus();
    } else if (typeof document !== 'undefined' && document.activeElement === document.body) {
      hamburgerRef.current?.focus();
    }
  }, [drawerOpen]);

  // Escape closes the drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <>
      {/* Desktop sidebar (lg+) — toggles between 4rem rail and 16rem panel */}
      <aside
        aria-label="Primary navigation"
        className={cn(
          'hidden lg:flex fixed top-0 left-0 z-40 h-screen flex-col py-3 border-r border-line bg-bg-raised/60 backdrop-blur-xl transition-[width] duration-200',
          expanded ? 'w-64 px-3 items-stretch' : 'w-16 items-center'
        )}
      >
        {/* Toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={expanded}
          className={cn(
            'h-10 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            expanded ? 'w-full px-3 justify-between gap-2' : 'w-10'
          )}
        >
          {expanded ? (
            <>
              <span className="flex items-center gap-2 min-w-0">
                <Logo size={24} className="shrink-0" />
                <span className="font-display text-base font-bold tracking-tight text-ink truncate">
                  NMO <span className="gradient-text">Roadmap</span>
                </span>
              </span>
              <X className="h-5 w-5 shrink-0" aria-hidden />
            </>
          ) : (
            <Menu className="h-5 w-5" aria-hidden />
          )}
        </button>

        {/* Divider */}
        <div className={cn('h-px bg-line my-3', expanded ? 'w-full' : 'w-8')} />

        {/* Nav — icons only when collapsed, icon+label when expanded */}
        <nav aria-label="Primary" className={cn('flex-1 flex flex-col gap-1 overflow-y-auto', expanded ? 'items-stretch' : 'items-center')}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={expanded ? undefined : item.label}
                aria-label={expanded ? undefined : item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg flex items-center transition-colors shrink-0 h-10',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                  expanded ? 'gap-3 px-3 text-sm font-medium' : 'w-10 justify-center',
                  active
                    ? 'bg-accent text-white shadow-lg shadow-accent/30'
                    : 'text-ink-muted hover:text-ink hover:bg-bg-hover'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                {expanded && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User chip at bottom */}
        {userChip && (
          <>
            <div className={cn('h-px bg-line my-3', expanded ? 'w-full' : 'w-8')} />
            {expanded ? (
              <UserChip chip={userChip} />
            ) : (
              <Link
                href="/profile"
                title={userChip.name}
                aria-label={`${userChip.name} — view profile`}
                className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {userChip.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userChip.avatarUrl}
                    alt=""
                    decoding="async"
                    className="h-9 w-9 rounded-full object-cover border border-accent/40 hover:border-accent transition-colors"
                  />
                ) : (
                  <span className="h-9 w-9 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center text-xs font-mono font-bold text-accent">
                    {userChip.name.replace(/^@/, '').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </Link>
            )}
          </>
        )}
      </aside>

      {/* Sticky top utility bar (all screens) */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-bg/80 border-b border-line">
        <div className="px-4 sm:px-6 flex h-16 items-center justify-between gap-3">
          {/* Mobile hamburger — drawer trigger */}
          <button
            ref={hamburgerRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls={DRAWER_ID}
            className="lg:hidden flex items-center justify-center h-10 w-10 -ml-1 rounded-lg text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors"
          >
            <Menu className="h-6 w-6" aria-hidden />
          </button>

          {/* Brand wordmark */}
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <Logo size={24} className="shrink-0 lg:hidden" />
            <span className="font-display text-base sm:text-xl font-bold tracking-tight text-ink truncate">
              NMO <span className="gradient-text">Roadmap</span>
            </span>
          </Link>

          {/* Right utilities */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ThemeToggle />
            <LanguageSwitcher />
            <button
              type="button"
              onClick={handleLogout}
              className="hidden lg:inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:text-danger hover:bg-bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden xl:inline">{t.nav.logout}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer — full labeled nav */}
      {drawerOpen && (
        <div
          id={DRAWER_ID}
          role="dialog"
          aria-modal="true"
          aria-labelledby={DRAWER_TITLE_ID}
          className="fixed inset-0 z-50 lg:hidden"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-bg/80 backdrop-blur-sm animate-fade-in"
          />

          {/* Slide-in panel — anchored LEFT to mirror the desktop sidebar */}
          <div className="absolute top-0 left-0 h-full w-[85%] max-w-xs bg-bg-raised border-r border-line shadow-2xl flex flex-col animate-slide-up">
            <div className="flex items-center justify-between h-16 px-4 border-b border-line shrink-0">
              <span id={DRAWER_TITLE_ID} className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
                <Logo size={22} className="shrink-0" />
                <span className="truncate">NMO <span className="gradient-text">Roadmap</span></span>
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="flex items-center justify-center h-10 w-10 rounded-lg text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <nav aria-label="Mobile" className="flex-1 overflow-y-auto p-3">
              <ul className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setDrawerOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors',
                          active
                            ? 'bg-accent/10 text-accent'
                            : 'text-ink-muted hover:text-ink hover:bg-bg-hover active:bg-bg-card'
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="p-3 border-t border-line shrink-0 space-y-2">
              {userChip && <UserChip chip={userChip} />}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-ink-muted hover:text-danger hover:bg-bg-hover transition-colors"
              >
                <LogOut className="h-5 w-5 shrink-0" aria-hidden />
                <span>{t.nav.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function UserChip({ chip }: { chip: UserChipState }) {
  const initials = chip.name.replace(/^@/, '').slice(0, 2).toUpperCase();
  return (
    <Link
      href="/profile"
      aria-label="View profile"
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
    >
      <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-bg-card border border-line">
        {chip.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={chip.avatarUrl}
            alt=""
            decoding="async"
            className="h-8 w-8 rounded-full object-cover shrink-0 border border-accent/30"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-[11px] font-mono font-bold text-accent shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink truncate">{chip.name}</div>
          {chip.handle && (
            <div className="text-[11px] text-ink-dim font-mono truncate">@{chip.handle}</div>
          )}
        </div>
      </div>
    </Link>
  );
}
