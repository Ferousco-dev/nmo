'use client';

// Theatrical roadmap-generation loader. Drops in for the "submitting"
// state of the questionnaire. The visual metaphor is a 30-cell grid
// filling in day by day — the user is literally watching their plan
// assemble. Below that: a single-line current step, a slim progress
// bar, and a rotating wisdom quote.
//
// Behaviour:
//  - Total animated runtime ≈ TOTAL_DURATION_MS (default 45s)
//  - Grid cells fill at the same pace as the % readout, with a small
//    stagger so it feels like a wave rather than a flash
//  - When the parent's `onFinish` resolves AND animation has played
//    out at least MIN_DURATION_MS, we snap to 100 and call onComplete
//  - If the parent's promise rejects, we surface the error inline
//
// Theme: every color uses Tailwind tokens that resolve through CSS
// variables in globals.css, so the loader auto-adapts to light/dark.

import { useEffect, useRef, useState } from 'react';
import { Confetti } from '@/components/Confetti';
import { useT, useLocale } from '@/lib/i18n/client';
import { GENERATION_STEPS, GENERATION_QUOTES } from '@/data/generation';
import { cn } from '@/lib/utils';

interface Props {
  /** Promise that performs the real work (DB writes, etc). Must resolve when done. */
  onFinish: () => Promise<void>;
  /** Called once the loader animation has fully played AND onFinish resolved. */
  onComplete: () => void;
  /** Called if onFinish rejects — message displayed inline to the user. */
  onError?: (message: string) => void;
}

const MIN_DURATION_MS = 22_000;
const TOTAL_DURATION_MS = 45_000;
const TICK_MS = 100;
const TOTAL_DAYS = 30;
const GRID_COLUMNS = 5;

export function RoadmapGenerationLoader({ onFinish, onComplete, onError }: Props) {
  const t = useT();
  const locale = useLocale();
  const isZh = locale === 'zh-Hant';

  const stepCount = GENERATION_STEPS.length;
  const stepDurationMs = TOTAL_DURATION_MS / stepCount;

  const [activeStep, setActiveStep] = useState(0);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [quoteIdx, setQuoteIdx] = useState(0);

  const startedAt = useRef<number>(Date.now());
  const finishResolvedAt = useRef<number | null>(null);
  const completedRef = useRef(false);

  // Kick off the parent work immediately
  useEffect(() => {
    onFinish()
      .then(() => {
        finishResolvedAt.current = Date.now();
      })
      .catch((e: Error) => {
        setError(e.message || 'Generation failed');
        onError?.(e.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animation loop — % + step + quote rotation, plus completion detection
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;

      const stepIdx = Math.min(stepCount - 1, Math.floor(elapsed / stepDurationMs));
      setActiveStep(stepIdx);

      // Hold at 95 until parent resolves, so the bar never rushes ahead
      const animatedPct = Math.min(95, (elapsed / TOTAL_DURATION_MS) * 95);
      setPercent(animatedPct);

      setQuoteIdx(Math.floor(elapsed / 12_000) % GENERATION_QUOTES.length);

      const minElapsed = elapsed >= MIN_DURATION_MS;
      const finished = finishResolvedAt.current !== null;
      if (finished && minElapsed && !completedRef.current) {
        completedRef.current = true;
        setPercent(100);
        setActiveStep(stepCount);
        clearInterval(interval);
        setTimeout(onComplete, 600);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [stepCount, stepDurationMs, onComplete]);

  const currentStep = activeStep < stepCount ? GENERATION_STEPS[activeStep] : null;
  const currentStepText = currentStep ? (isZh ? currentStep.zh : currentStep.en) : '';

  const quote = GENERATION_QUOTES[quoteIdx];
  const quoteText = isZh ? quote.zh : quote.en;

  // Map % → cells filled. Visual is "your 30-day plan, day by day".
  const filledDays = Math.min(TOTAL_DAYS, Math.round((percent / 100) * TOTAL_DAYS));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 overflow-hidden relative">
      <Confetti count={30} />

      {/* Soft background glows */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-accent/10 blur-[140px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-success/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md flex flex-col items-center text-center">
        {/* Headline */}
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-1">
          <span className="gradient-text">{t.questionnaire.finishing}</span>
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-dim mb-8">
          {filledDays} / {TOTAL_DAYS}
        </p>

        {/* 30-day grid — fills in as % advances */}
        <DayGrid filled={filledDays} total={TOTAL_DAYS} columns={GRID_COLUMNS} />

        {/* Current step — single line, crossfades */}
        <div className="h-6 mt-8 mb-5 flex items-center justify-center">
          <p
            key={activeStep}
            className={cn(
              'text-sm sm:text-base font-medium animate-fade-in',
              error ? 'text-danger' : 'text-ink'
            )}
          >
            {error ? error : currentStepText}
          </p>
        </div>

        {/* Slim progress bar + percentage */}
        <div className="w-full mb-10">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-label={t.questionnaire.finishing}
            className="h-1.5 rounded-full bg-bg-raised overflow-hidden"
          >
            <div
              className="h-full bg-gradient-to-r from-success via-accent to-accent-glow transition-[width] duration-200 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 font-mono text-[11px] text-ink-dim">
            {Math.round(percent)}%
          </div>
        </div>

        {/* Wisdom quote */}
        <blockquote className="max-w-sm">
          <p
            key={quoteIdx}
            className="font-display italic text-base sm:text-lg leading-snug text-ink animate-fade-in"
          >
            &ldquo;{quoteText}&rdquo;
          </p>
          <footer className="text-xs text-ink-dim mt-2 not-italic">— {quote.author}</footer>
        </blockquote>

        {/* Disclaimer */}
        <p className="mt-8 text-[11px] text-ink-dim max-w-xs">
          {error ? null : percent >= 100 ? t.generation.enteringDashboard : t.generation.disclaimer}
        </p>
      </div>
    </div>
  );
}

/**
 * 30 small squares laid out in a 5×6 grid. Filled cells use the accent
 * color with a soft glow, the next one (currently being worked on) gets
 * a subtle pulse, and unfilled cells are flat surface tiles. Cells fade
 * in via a small stagger so the fill progresses like a wave rather than
 * a flicker.
 */
function DayGrid({
  filled,
  total,
  columns,
}: {
  filled: number;
  total: number;
  columns: number;
}) {
  return (
    <div
      className="grid gap-1.5 sm:gap-2 w-full max-w-[280px]"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {Array.from({ length: total }).map((_, i) => {
        const isFilled = i < filled;
        const isCurrent = i === filled - 1;
        return (
          <div
            key={i}
            className={cn(
              'aspect-square rounded-md transition-all duration-300',
              isFilled
                ? 'bg-accent border border-accent shadow-[0_0_12px_rgb(var(--accent)/0.45)]'
                : 'bg-bg-raised border border-line',
              isCurrent && 'animate-pulse-glow'
            )}
            style={{ transitionDelay: `${(i % columns) * 30}ms` }}
          />
        );
      })}
    </div>
  );
}
