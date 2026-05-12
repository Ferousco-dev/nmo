// Brand mark — the NMO 男兒幫 shield logo at /public/logo.png.
//
// Usage: drop in wherever you previously rendered <Flame /> as a brand
// affordance (header bars, sidebar, hero icons, loaders). Keep <Flame />
// for places where the icon is *about fire* — streak counts, daily
// non-negotiable, etc.
//
// The image already has its own background framing, so we don't add any
// container chrome here — sizing is the only thing the caller controls.

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface Props {
  /** Rendered pixel size for both width and height. Defaults to 32. */
  size?: number;
  /** How the image fills its box. `cover` (default) crops the source image's
   *  side padding so the actual mark fills the frame; `contain` letterboxes
   *  for cases where you need the full image visible. */
  fit?: 'cover' | 'contain';
  /** Decorative? Set false to render meaningful alt text. Default true. */
  decorative?: boolean;
  className?: string;
  priority?: boolean;
}

export function Logo({
  size = 32,
  fit = 'cover',
  decorative = true,
  className,
  priority = false,
}: Props) {
  return (
    <Image
      src="/logo.png"
      alt={decorative ? '' : 'NMO 男兒幫'}
      width={size}
      height={size}
      priority={priority}
      // Default `object-cover`: the source PNG has dark padding around
      // the actual mark, so cover crops the sides and lets the centered
      // shield + text fill the frame. `select-none` so it doesn't
      // ghost-drag on double-click.
      className={cn(
        'select-none',
        fit === 'cover' ? 'object-cover' : 'object-contain',
        className
      )}
      aria-hidden={decorative || undefined}
    />
  );
}
