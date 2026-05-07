import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateLevel(points: number): number {
  // Simple curve: every 100 points = 1 level, capped at 50
  return Math.min(50, Math.floor(points / 100) + 1);
}

export function calculateStreak(lastActiveAt: string | null): number {
  // Streak logic is handled server-side; this is a client display helper
  if (!lastActiveAt) return 0;
  const last = new Date(lastActiveAt).getTime();
  const now = Date.now();
  const hoursSince = (now - last) / (1000 * 60 * 60);
  return hoursSince < 48 ? 1 : 0;
}
