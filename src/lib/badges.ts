// Frontend helpers for the badge system. Stable mapping from icon
// names (stored as text in the DB) to Lucide React components, plus
// a tier-resolver so we can show the user's current tier without a
// DB roundtrip.
//
// The `BADGE_ICON_MAP` only includes icons referenced in supabase/
// badges.sql — adding a new badge means seeding it AND adding its
// icon here. Unmapped icons fall back to Award.

import {
  Award,
  Calendar,
  Check,
  Crown,
  Flame,
  Gem,
  Medal,
  Sparkle,
  Sparkles,
  Star,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Badge } from '@/types';

const ICON_MAP: Record<string, LucideIcon> = {
  Award,
  Calendar,
  Check,
  Crown,
  Flame,
  Gem,
  Medal,
  Sparkle,
  Sparkles,
  Star,
  Trophy,
  Zap,
};

export function badgeIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Award;
  return ICON_MAP[name] ?? Award;
}

/**
 * Mirror of supabase/badges.sql tier thresholds. Used to render the
 * "next tier" badge state on the profile without re-fetching the
 * catalog. Update both files together if thresholds change.
 */
export const TIER_THRESHOLDS: { tier: number; points: number }[] = [
  { tier: 1,  points: 0 },
  { tier: 2,  points: 50 },
  { tier: 3,  points: 150 },
  { tier: 4,  points: 400 },
  { tier: 5,  points: 900 },
  { tier: 6,  points: 1800 },
  { tier: 7,  points: 3500 },
  { tier: 8,  points: 6500 },
  { tier: 9,  points: 11000 },
  { tier: 10, points: 18000 },
];

/** Highest tier the user has crossed at the given point total. */
export function currentTier(totalPoints: number): number {
  let tier = 1;
  for (const t of TIER_THRESHOLDS) {
    if (totalPoints >= t.points) tier = t.tier;
  }
  return tier;
}

/** Next tier ahead — null if user is already at max. */
export function nextTier(totalPoints: number):
  | { tier: number; points: number; pointsToGo: number }
  | null {
  const cur = currentTier(totalPoints);
  if (cur >= 10) return null;
  const nxt = TIER_THRESHOLDS.find((t) => t.tier === cur + 1)!;
  return { tier: nxt.tier, points: nxt.points, pointsToGo: nxt.points - totalPoints };
}

/** Sort badges in the order we want to render them. */
export function sortBadges(badges: Badge[]): Badge[] {
  // Tier badges first (ascending), then specials by display_order
  return [...badges].sort((a, b) => {
    if (a.category === 'tier' && b.category !== 'tier') return -1;
    if (a.category !== 'tier' && b.category === 'tier') return 1;
    if (a.category === 'tier' && b.category === 'tier') {
      return (a.tier ?? 0) - (b.tier ?? 0);
    }
    return a.display_order - b.display_order;
  });
}
