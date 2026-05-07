'use client';

// Pure-CSS confetti. ~40 particles fall with randomised colours, sizes,
// rotation, drift and timing. No JS animation loop — the GPU does the work.
// Pinned to the viewport so it overlays whatever's on screen.

import { useMemo } from 'react';

const COLORS = ['#3b82f6', '#60a5fa', '#a855f7', '#ec4899', '#10b981', '#f59e0b', '#ef4444'];

export function Confetti({ count = 40 }: { count?: number }) {
  // Generate the particle styles once on mount so they don't re-randomise on re-renders
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const left = Math.random() * 100; // %
        const delay = Math.random() * 1.5; // s
        const duration = 2.5 + Math.random() * 2; // s
        const drift = (Math.random() - 0.5) * 80; // px lateral drift
        const rotateStart = Math.random() * 360;
        const rotateEnd = rotateStart + 360 + Math.random() * 720;
        const size = 6 + Math.random() * 6; // px
        const color = COLORS[i % COLORS.length];
        const isRect = Math.random() > 0.5;
        return { id: i, left, delay, duration, drift, rotateStart, rotateEnd, size, color, isRect };
      }),
    [count]
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      style={{ contain: 'strict' }}
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.left}%`,
            width: p.isRect ? `${p.size * 0.4}px` : `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            borderRadius: p.isRect ? '1px' : '50%',
            animation: `confettiFall ${p.duration}s linear ${p.delay}s forwards`,
            // CSS variables consumed by the keyframes
            ['--drift' as string]: `${p.drift}px`,
            ['--rotate-start' as string]: `${p.rotateStart}deg`,
            ['--rotate-end' as string]: `${p.rotateEnd}deg`,
          } as React.CSSProperties}
        />
      ))}
      <style jsx>{`
        .confetti-particle {
          position: absolute;
          top: -20px;
          opacity: 0.9;
          will-change: transform;
        }
        @keyframes confettiFall {
          0% {
            transform: translate(0, 0) rotate(var(--rotate-start));
            opacity: 1;
          }
          100% {
            transform: translate(var(--drift), 110vh) rotate(var(--rotate-end));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
