'use client';

// Theatrical roadmap-generation loader. Drops in for the "submitting"
// state of the questionnaire. Shows a confetti background, an animated
// circular progress dial, two columns of staged steps (done / active /
// pending), and a rotating wisdom quote.
//
// Behaviour:
//  - Total animated runtime ≈ TOTAL_DURATION_MS (default 45s)
//  - Steps advance on a constant cadence; the % readout interpolates
//    smoothly so it never jumps in big chunks.
//  - When the parent's `onFinish` resolves AND the animation has played
//    out at least MIN_DURATION_MS, we call `onComplete()`.
//  - If the parent finishes early we still pace the UI through to at
//    least MIN_DURATION_MS so the experience feels intentional.
//  - If the parent's promise rejects, we surface the error inline and
//    halt the animation.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Confetti } from '@/components/Confetti';
import { useT, useLocale } from '@/lib/i18n/client';
import { GENERATION_STEPS, GENERATION_QUOTES, type GenStep } from '@/data/generation';
import { cn } from '@/lib/utils';

interface Props {
  /** Promise that performs the real work (DB writes, etc). Must resolve when done. */
  onFinish: () => Promise<void>;
  /** Called once the loader animation has fully played AND onFinish resolved. */
  onComplete: () => void;
  /** Called if onFinish rejects — message displayed inline to the user. */
  onError?: (message: string) => void;
}

const MIN_DURATION_MS = 22_000; // never less than this
const TOTAL_DURATION_MS = 45_000; // typical animated duration
const TICK_MS = 100; // % readout interpolation cadence

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

  // Kick off the parent work immediately + capture failure
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

  // % readout + step advance + quote rotation
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;

      // Step index based on elapsed, capped to last step
      const stepIdx = Math.min(stepCount - 1, Math.floor(elapsed / stepDurationMs));
      setActiveStep(stepIdx);

      // Smoothly interpolated percentage. Holds at 95% if waiting on parent.
      const animatedPct = Math.min(95, (elapsed / TOTAL_DURATION_MS) * 95);
      setPercent(animatedPct);

      // Rotate quote every ~12s
      setQuoteIdx(Math.floor(elapsed / 12_000) % GENERATION_QUOTES.length);

      const minElapsed = elapsed >= MIN_DURATION_MS;
      const finished = finishResolvedAt.current !== null;
      if (finished && minElapsed && !completedRef.current) {
        completedRef.current = true;
        // Snap to 100, then hand off after a brief moment
        setPercent(100);
        setActiveStep(stepCount); // mark all done
        clearInterval(interval);
        setTimeout(onComplete, 600);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [stepCount, stepDurationMs, onComplete]);

  // Split steps across two columns
  const { left, right } = useMemo(() => {
    const half = Math.ceil(GENERATION_STEPS.length / 2);
    return {
      left: GENERATION_STEPS.slice(0, half),
      right: GENERATION_STEPS.slice(half),
    };
  }, []);

  const stepText = (s: GenStep) => (isZh ? s.zh : s.en);
  const quote = GENERATION_QUOTES[quoteIdx];
  const quoteText = isZh ? quote.zh : quote.en;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      <Confetti count={50} />

      {/* Background glows */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-accent/10 blur-[140px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-success/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-3xl flex flex-col items-center text-center">
        {/* Big circular progress */}
        <div className="relative h-32 w-32 sm:h-40 sm:w-40 mb-10">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="rgba(63, 63, 70, 0.4)"
              strokeWidth="6"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="url(#progressGradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 45}
              strokeDashoffset={2 * Math.PI * 45 * (1 - percent / 100)}
              className="transition-[stroke-dashoffset] duration-200 ease-out"
            />
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-3xl sm:text-4xl font-bold gradient-text">
              {Math.round(percent)}%
            </span>
          </div>
        </div>

        {/* Two-column step list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3 w-full max-w-xl text-left mb-10">
          {[left, right].map((column, colIdx) => (
            <ul key={colIdx} className="space-y-3">
              {column.map((s, i) => {
                const absoluteIdx = colIdx === 0 ? i : left.length + i;
                const isDone = absoluteIdx < activeStep;
                const isActive = absoluteIdx === activeStep && !error;
                return (
                  <li
                    key={absoluteIdx}
                    className={cn(
                      'flex items-center gap-3 text-sm transition-all',
                      isDone && 'text-ink',
                      isActive && 'text-ink font-medium',
                      !isDone && !isActive && 'text-ink-dim'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center justify-center h-5 w-5 rounded-full shrink-0 transition-colors',
                        isDone && 'bg-success/15 text-success',
                        isActive && 'bg-accent/20 text-accent',
                        !isDone && !isActive && 'bg-bg-raised text-ink-faint'
                      )}
                    >
                      {isDone ? (
                        <Check className="h-3 w-3" strokeWidth={3} />
                      ) : isActive ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <span className="truncate">{stepText(s)}</span>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>

        {/* Wisdom quote */}
        <div className="max-w-xl mb-8 px-2">
          <p
            key={quoteIdx}
            className="font-display italic text-lg sm:text-xl leading-snug text-ink animate-fade-in"
          >
            &ldquo;{quoteText}&rdquo;
          </p>
          <p className="text-xs text-ink-dim mt-2">— {quote.author}</p>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-ink-dim max-w-md">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : percent >= 100 ? (
            t.generation.enteringDashboard
          ) : (
            t.generation.disclaimer
          )}
        </p>
      </div>
    </div>
  );
}
