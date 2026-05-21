// 5-slot badge showcase per client spec.
//   Slot 1 — primary level badge (auto, tied to total_points tier).
//   Slots 2-5 — special badges (admin-assigned). Empty slots render as
//   locked placeholders so the row is visibly aspirational.

import { Lock } from 'lucide-react';
import { badgeIcon } from '@/lib/badges';
import { cn } from '@/lib/utils';
import type { Badge } from '@/types';

const SPECIAL_SLOTS = 4;

interface Props {
  primary: Badge | null;
  specials: Badge[];
  locale?: string;
  primaryLabel: string;
  specialLabel: string;
  emptyLabel: string;
}

export function BadgeSlots({
  primary,
  specials,
  locale,
  primaryLabel,
  specialLabel,
  emptyLabel,
}: Props) {
  const slots: (Badge | null)[] = specials.slice(0, SPECIAL_SLOTS);
  while (slots.length < SPECIAL_SLOTS) slots.push(null);

  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-3">
      <SlotCell badge={primary} label={primaryLabel} locale={locale} primary />
      {slots.map((b, i) => (
        <SlotCell
          key={b?.id ?? `empty-${i}`}
          badge={b}
          label={b ? specialLabel : emptyLabel}
          locale={locale}
        />
      ))}
    </div>
  );
}

function SlotCell({
  badge,
  label,
  locale,
  primary,
}: {
  badge: Badge | null;
  label: string;
  locale?: string;
  primary?: boolean;
}) {
  const isZh = locale === 'zh-Hant';
  const empty = !badge;
  const color = badge?.color ?? '#71717a';
  const Icon = badgeIcon(badge?.icon);
  const name = badge ? (isZh ? badge.name_zh : badge.name_en) : '';

  return (
    <div
      className={cn(
        'aspect-square rounded-xl border flex flex-col items-center justify-center text-center p-2 transition-all',
        empty
          ? 'opacity-60 bg-bg-raised border-line border-dashed'
          : 'bg-bg-card hover:border-line-strong',
        primary && !empty && 'ring-1 ring-accent/40',
      )}
      style={
        empty
          ? undefined
          : {
              backgroundColor: `${color}10`,
              borderColor: `${color}55`,
              boxShadow: `0 0 14px ${color}26`,
            }
      }
    >
      <div
        className={cn(
          'h-9 w-9 rounded-lg flex items-center justify-center mb-1.5 border',
          empty && 'bg-bg-raised border-line',
        )}
        style={
          empty
            ? undefined
            : { backgroundColor: `${color}1a`, borderColor: `${color}55` }
        }
      >
        {empty ? (
          <Lock className="h-4 w-4 text-ink-dim" aria-hidden />
        ) : badge?.image_url ? (
          <img src={badge.image_url} alt="" className="h-6 w-6 object-contain" />
        ) : (
          <Icon className="h-5 w-5" strokeWidth={2.2} style={{ color }} />
        )}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
        {label}
      </div>
      {!empty && (
        <div className="text-[10px] font-medium text-ink leading-tight mt-0.5 line-clamp-2">
          {name}
        </div>
      )}
    </div>
  );
}
