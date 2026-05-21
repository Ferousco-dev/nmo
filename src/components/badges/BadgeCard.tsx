// Square badge tile used on the profile / dedicated badges page.
// Renders the icon medallion + name + (optional) description. When
// `locked` is true the tile dims and shows the points threshold.

import { Lock } from 'lucide-react';
import { badgeIcon } from '@/lib/badges';
import { cn } from '@/lib/utils';
import type { Badge } from '@/types';

interface Props {
  badge: Pick<
    Badge,
    'name_zh' | 'name_en' | 'description_zh' | 'description_en' | 'icon' | 'image_url' | 'color' | 'tier' | 'points_threshold' | 'category'
  >;
  locale?: string;
  /** Locked tier preview — dims the tile + replaces icon with a lock */
  locked?: boolean;
  className?: string;
}

export function BadgeCard({ badge, locale, locked = false, className }: Props) {
  const Icon = badgeIcon(badge.icon);
  const isZh = locale === 'zh-Hant';
  const name = isZh ? badge.name_zh : badge.name_en;
  const description = isZh ? badge.description_zh : badge.description_en;
  const color = badge.color ?? '#71717a';

  return (
    <div
      className={cn(
        'card-premium p-4 sm:p-5 flex flex-col items-center text-center transition-all',
        locked ? 'opacity-50' : 'hover:border-line-strong',
        className
      )}
      style={locked ? undefined : { borderColor: `${color}40` }}
    >
      <div
        className={cn(
          'h-14 w-14 rounded-2xl flex items-center justify-center mb-3 border',
          locked && 'bg-bg-raised border-line'
        )}
        style={
          locked
            ? undefined
            : {
                backgroundColor: `${color}1a`,
                borderColor: `${color}55`,
                boxShadow: `0 0 24px ${color}33`,
              }
        }
      >
        {locked ? (
          <Lock className="h-6 w-6 text-ink-dim" />
        ) : badge.image_url ? (
          <img src={badge.image_url} alt="" className="h-8 w-8 object-contain" />
        ) : (
          <Icon className="h-7 w-7" strokeWidth={2} style={{ color }} />
        )}
      </div>

      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim mb-1">
        {badge.tier ? `Lv ${badge.tier}` : badge.category}
      </div>
      <div className="font-semibold text-sm text-ink leading-tight">
        {name}
      </div>
      {description && (
        <div className="text-xs text-ink-muted mt-1 leading-snug">
          {description}
        </div>
      )}
      {locked && badge.points_threshold != null && (
        <div className="mt-2 text-[11px] font-mono text-ink-dim">
          {badge.points_threshold.toLocaleString()} pts
        </div>
      )}
    </div>
  );
}
