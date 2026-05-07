'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Flame } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT, useLocale } from '@/lib/i18n/client';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { cn } from '@/lib/utils';
import {
  QUESTIONS,
  TOTAL_QUESTIONS,
  deriveDimensions,
  type Question,
  type QuestionOption,
} from '@/data/questionnaire';
import { assignTrack, generateRoadmap } from '@/lib/roadmap/generator';

export function QuestionnaireClient() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();
  const isZh = locale === 'zh-Hant';

  // Answers keyed by question id so questions can be reordered without re-mapping
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === TOTAL_QUESTIONS;
  const progressPct = (answeredCount / TOTAL_QUESTIONS) * 100;

  const optText = (o: QuestionOption) => (isZh ? o.zh : o.en);
  const optDesc = (o: QuestionOption) => (isZh ? o.desc.zh : o.desc.en);
  const qText = (q: Question) => (isZh ? q.zh : q.en);
  const qDesc = (q: Question) => (q.desc ? (isZh ? q.desc.zh : q.desc.en) : null);

  const choose = (qId: string, optionIdx: number) => {
    setAnswers((prev) => ({ ...prev, [qId]: optionIdx }));
  };

  const submit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return;
    }

    const derived = deriveDimensions(answers);
    const track = assignTrack(derived.tenure, derived.goal, derived.intensity);

    const { error: pErr } = await supabase
      .from('profiles')
      .update({
        tenure: derived.tenure,
        goal: derived.goal,
        intensity: derived.intensity,
        track_assigned: track,
        questionnaire_answers: answers,
        questionnaire_completed_at: new Date().toISOString(),
        onboarding_completed: true,
      })
      .eq('id', user.id);
    if (pErr) {
      setSubmitError(pErr.message);
      setSubmitting(false);
      return;
    }

    // Generate roadmap if user_tasks empty
    const { count } = await supabase
      .from('user_tasks')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', user.id);

    if (!count) {
      const roadmap = generateRoadmap(derived.tenure, derived.goal, derived.intensity);
      const taskRows = roadmap.flatMap((day) =>
        day.tasks.map((task) => ({
          user_id: user.id,
          day_number: day.day,
          task_id: task.id,
          task_title: task.title,
          task_description: task.description,
          skool_lesson_url: task.skool_lesson_url || null,
        }))
      );
      const { error: tErr } = await supabase.from('user_tasks').insert(taskRows);
      if (tErr) {
        setSubmitError(tErr.message);
        setSubmitting(false);
        return;
      }
    }

    router.push('/dashboard');
    router.refresh();
  };

  // Submitting state — full-page spinner
  if (submitting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-accent/10 blur-[140px]" />
        </div>
        <div className="relative">
          <Flame className="h-7 w-7 text-accent/60 absolute inset-0 m-auto" strokeWidth={2.5} />
          <div className="h-16 w-16 rounded-full border-4 border-accent/30 border-t-accent animate-spin" />
        </div>
        <p className="mt-6 text-ink-muted">{t.questionnaire.finishing}</p>
        {submitError && (
          <p className="mt-3 text-xs text-danger max-w-sm">{submitError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Fixed top bar with progress */}
      <header className="fixed top-0 left-0 right-0 z-30 backdrop-blur-xl bg-bg/70 border-b border-line/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Flame className="h-6 w-6 text-accent shrink-0" strokeWidth={2.5} />
            <span className="font-display text-lg sm:text-xl font-bold tracking-tight truncate">
              NMO <span className="gradient-text">Roadmap</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline text-xs font-mono text-ink-dim">
              {(t.questionnaire.answeredLabel as string)
                .replace('{answered}', String(answeredCount))
                .replace('{total}', String(TOTAL_QUESTIONS))}
            </span>
            <LanguageSwitcher />
          </div>
        </div>
        <div className="h-1 bg-bg-raised">
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-glow transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* Decorative background */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-accent/8 blur-[140px]" />
      </div>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 pt-24 pb-32">
        {/* Page header */}
        <div className="mb-10 text-center animate-slide-up">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            <span className="gradient-text">{t.questionnaire.title}</span>
          </h1>
          <p className="text-ink-muted text-sm sm:text-base">
            {(t.questionnaire.subtitle as string).replace('{total}', String(TOTAL_QUESTIONS))}
          </p>
        </div>

        {/* All questions in one scrollable form */}
        <div className="space-y-10 sm:space-y-12">
          {QUESTIONS.map((q) => {
            const selectedIdx = answers[q.id];
            const cols = optionGridCols(q.options.length);
            return (
              <section key={q.id} className="animate-fade-in">
                <h2 className="text-base sm:text-lg font-semibold text-ink mb-1 flex items-baseline gap-2">
                  <span className="text-xl sm:text-2xl">{q.emoji}</span>
                  <span className="leading-snug">{qText(q)}</span>
                </h2>
                {qDesc(q) && (
                  <p className="text-xs sm:text-sm text-ink-muted mb-4 ml-9">{qDesc(q)}</p>
                )}

                <div className={cn('grid gap-3', cols)}>
                  {q.options.map((opt, i) => {
                    const isSelected = selectedIdx === i;
                    return (
                      <button
                        key={`${q.id}-${i}`}
                        type="button"
                        onClick={() => choose(q.id, i)}
                        className={cn(
                          'flex flex-col items-center justify-start text-center px-3 py-5 rounded-2xl border transition-all',
                          'min-h-[128px] sm:min-h-[140px]',
                          isSelected
                            ? 'border-accent bg-accent/10 glow-blue scale-[0.99]'
                            : 'border-line-strong bg-bg-raised hover:border-accent/50 hover:bg-bg-hover active:scale-[0.99]'
                        )}
                      >
                        <span className="text-3xl sm:text-4xl mb-2 leading-none">{opt.emoji}</span>
                        <span className="font-semibold text-ink text-sm sm:text-base leading-tight">
                          {optText(opt)}
                        </span>
                        <span className="text-[11px] sm:text-xs text-ink-muted mt-1 leading-snug">
                          {optDesc(opt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      {/* Sticky submit footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 backdrop-blur-xl bg-bg/85 border-t border-line/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <span className="text-xs sm:text-sm font-mono text-ink-dim sm:hidden">
            {answeredCount}/{TOTAL_QUESTIONS}
          </span>
          <span className="hidden sm:inline text-sm text-ink-muted">
            {(t.questionnaire.answeredLabel as string)
              .replace('{answered}', String(answeredCount))
              .replace('{total}', String(TOTAL_QUESTIONS))}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered}
            className={cn(
              'inline-flex items-center justify-center gap-2 h-12 sm:h-13 px-6 sm:px-7 rounded-lg font-medium text-sm sm:text-base transition-all',
              allAnswered
                ? 'bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-0.5'
                : 'bg-bg-raised text-ink-dim cursor-not-allowed'
            )}
          >
            {allAnswered ? t.questionnaire.submitCta : t.questionnaire.submitCtaIncomplete}
            {allAnswered && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </footer>
    </div>
  );
}

/**
 * Pick a responsive grid column count based on how many options the
 * question has. Mobile defaults to 2 columns (compact) and expands on sm+.
 */
function optionGridCols(n: number): string {
  if (n <= 2) return 'grid-cols-2';
  if (n === 3) return 'grid-cols-1 sm:grid-cols-3';
  if (n === 4) return 'grid-cols-2 sm:grid-cols-4';
  return 'grid-cols-2 sm:grid-cols-3'; // fallback for 5+
}
