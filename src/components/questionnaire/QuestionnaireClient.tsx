'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Flame } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT, useLocale } from '@/lib/i18n/client';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { cn } from '@/lib/utils';
import { QUESTIONS, TOTAL_QUESTIONS, deriveDimensions, type QuestionOption } from '@/data/questionnaire';
import { assignTrack, generateRoadmap } from '@/lib/roadmap/generator';

export function QuestionnaireClient() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();
  const isZh = locale === 'zh-Hant';

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<number | null>(null); // brief flash before advancing

  const q = QUESTIONS[index];
  const progressPct = ((index + (chosen != null ? 1 : 0)) / TOTAL_QUESTIONS) * 100;

  const choose = (optIdx: number) => {
    if (submitting || chosen !== null) return;
    setChosen(optIdx);
    // Briefly highlight the selection so the tap feels acknowledged
    setTimeout(() => {
      const newAnswers = [...answers.slice(0, index), optIdx];
      setAnswers(newAnswers);
      setChosen(null);
      if (index < TOTAL_QUESTIONS - 1) {
        setIndex(index + 1);
      } else {
        void submit(newAnswers);
      }
    }, 250);
  };

  const goBack = () => {
    if (submitting || index === 0) return;
    setIndex(index - 1);
  };

  const submit = async (allAnswers: number[]) => {
    setSubmitting(true);
    setSubmitError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return;
    }

    const derived = deriveDimensions(allAnswers);
    const track = assignTrack(derived.tenure, derived.goal, derived.intensity);

    // 1. Save profile fields + raw answers
    const { error: pErr } = await supabase
      .from('profiles')
      .update({
        tenure: derived.tenure,
        goal: derived.goal,
        intensity: derived.intensity,
        track_assigned: track,
        questionnaire_answers: allAnswers,
        questionnaire_completed_at: new Date().toISOString(),
        onboarding_completed: true,
      })
      .eq('id', user.id);
    if (pErr) {
      setSubmitError(pErr.message);
      setSubmitting(false);
      return;
    }

    // 2. Generate the 30-day roadmap (only if user_tasks is empty so we don't dupe)
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

  const optionText = (o: QuestionOption) => (isZh ? o.zh : o.en);
  const questionText = isZh ? q.zh : q.en;

  // Submitting / finishing state
  if (submitting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-accent/10 blur-[140px]" />
        </div>
        <div className="h-12 w-12 rounded-full border-4 border-accent border-t-transparent animate-spin mb-6" />
        <p className="text-ink-muted">{t.questionnaire.finishing}</p>
        {submitError && (
          <p className="mt-3 text-xs text-danger max-w-sm">{submitError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Fixed top bar — same treatment as welcome/confirm */}
      <header className="fixed top-0 left-0 right-0 z-30 backdrop-blur-xl bg-bg/70 border-b border-line/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Flame className="h-6 w-6 text-accent shrink-0" strokeWidth={2.5} />
            <span className="font-display text-lg sm:text-xl font-bold tracking-tight truncate">
              NMO <span className="gradient-text">Roadmap</span>
            </span>
          </div>
          <LanguageSwitcher />
        </div>
        {/* Progress bar inside the header */}
        <div className="h-1 bg-bg-raised">
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-glow transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* Decorative glow */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent/10 blur-[140px]" />
      </div>

      <main className="flex-1 flex items-center justify-center px-4 pt-24 pb-12">
        <div className="w-full max-w-md animate-fade-in">
          {/* Question header */}
          <div className="mb-6 text-center">
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-accent mb-3">
              {(t.questionnaire.progressLabel as string)
                .replace('{current}', String(index + 1))
                .replace('{total}', String(TOTAL_QUESTIONS))}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight leading-snug text-ink">
              {questionText}
            </h1>
          </div>

          {/* Options — full width, big tap targets, vertical stack */}
          <div className="space-y-3">
            {q.options.map((opt, i) => {
              const isChosen = chosen === i;
              return (
                <button
                  key={`${q.id}-${i}`}
                  type="button"
                  onClick={() => choose(i)}
                  disabled={chosen !== null}
                  className={cn(
                    'w-full min-h-[64px] sm:min-h-[68px] px-5 py-4 rounded-2xl border text-left text-base font-medium transition-all',
                    'flex items-center gap-3',
                    'disabled:cursor-not-allowed',
                    isChosen
                      ? 'border-accent bg-accent text-white shadow-lg shadow-accent/30 scale-[0.99]'
                      : 'border-line-strong bg-bg-raised text-ink hover:border-accent/60 hover:bg-bg-hover active:scale-[0.99]'
                  )}
                >
                  <span
                    className={cn(
                      'h-7 w-7 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-mono',
                      isChosen
                        ? 'border-white bg-white text-accent'
                        : 'border-line-strong text-ink-dim'
                    )}
                  >
                    {isChosen ? <Check className="h-4 w-4" strokeWidth={3} /> : String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1 leading-snug">{optionText(opt)}</span>
                </button>
              );
            })}
          </div>

          {/* Footer — back button + counter */}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={index === 0 || chosen !== null}
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.questionnaire.back}
            </button>
            <span className="text-xs font-mono text-ink-dim">
              {index + 1} / {TOTAL_QUESTIONS}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
