// Compact badge pill used inline next to a user's name (leaderboard,
// search results, etc). Shows the icon + abbreviated label.

import { badgeIcon } from '@/lib/badges';
import { cn } from '@/lib/utils';
import type { Badge } from '@/types';

interface Props {
  badge: Pick<Badge, 'name_zh' | 'name_en' | 'icon' | 'color' | 'tier'>;
  locale?: string;
  size?: 'sm' | 'md';
  className?: string;
  /** When true, render dimmed (used for locked tier previews) */
  locked?: boolean;
}

export function BadgeChip({ badge, locale, size = 'sm', locked = false, className }: Props) {
  const Icon = badgeIcon(badge.icon);
  const isZh = locale === 'zh-Hant';
  const label = isZh ? badge.name_zh : badge.name_en;
  const color = badge.color ?? '#71717a';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        locked && 'opacity-40 grayscale',
        className
      )}
      style={
        locked
          ? undefined
          : {
              borderColor: `${color}55`,
              backgroundColor: `${color}1a`, // ~10% opacity
              color,
            }
      }
      title={label}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={2.4} />
      <span className="truncate max-w-[140px]">
        {badge.tier ? `Lv${badge.tier} · ` : ''}{label}
      </span>
    </span>
  );
}
