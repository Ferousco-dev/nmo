'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT, useLocale } from '@/lib/i18n/client';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';
import { RoadmapGenerationLoader } from '@/components/questionnaire/RoadmapGenerationLoader';
import { cn } from '@/lib/utils';
import {
  QUESTIONS,
  TOTAL_QUESTIONS,
  deriveDimensions,
  type Question,
  type QuestionOption,
} from '@/data/questionnaire';
import { assignTrack, generateRoadmap } from '@/lib/roadmap/generator';

// PostgreSQL unique-violation: SQLSTATE 23505. Surfaces from supabase-js
// either as `error.code === '23505'` or with a message containing
// "duplicate key" / "already exists" depending on the version.
function isDuplicateKeyError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  return /duplicate key|already exists/i.test(err.message ?? '');
}

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

  const submit = () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    // From here the RoadmapGenerationLoader takes over the screen
    // and runs persistRoadmap() in the background.
  };

  /** The actual DB work — invoked by the loader's onFinish.
   *
   *  Order of operations is intentional:
   *    1. Make sure the profile row exists (FK target for user_tasks)
   *    2. Insert the 30-day task set
   *    3. VERIFY the tasks actually landed (count > 0)
   *    4. Only THEN mark onboarding_completed = true
   *
   *  If step 3 fails, the user stays in the questionnaire flow on next
   *  visit — better than getting stuck on an empty /roadmap forever
   *  because step 1 succeeded but step 2 silently inserted zero rows.
   */
  const persistRoadmap = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      throw new Error('Not authenticated');
    }

    const derived = deriveDimensions(answers);
    const track = assignTrack(derived.pathway, derived.goal, derived.intensity);

    // Profile row should already exist (created by the handle_new_user
    // auth trigger on signup). We UPDATE instead of upsert because the
    // 2026-05 lockdown migration revoked table-wide UPDATE — upsert
    // becomes INSERT...ON CONFLICT and PostgREST hits the table-level
    // check, failing with "permission denied for table profiles" even
    // though the column-level grants are fine.
    //
    // Two passes: the columns we know are granted in every install,
    // then a best-effort pass for metadata columns added by optional
    // migrations (archetype, pathway, questionnaire_*).
    const { error: coreErr } = await supabase
      .from('profiles')
      .update({
        goal: derived.goal,
        intensity: derived.intensity,
        track_assigned: track,
      })
      .eq('id', user.id);
    if (coreErr) throw new Error(`profile: ${coreErr.message}`);

    const { error: metaErr } = await supabase
      .from('profiles')
      .update({
        archetype: derived.archetype,
        pathway: derived.pathway,
        tenure: derived.tenure,
        questionnaire_answers: answers,
        questionnaire_completed_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    if (metaErr) {
      // eslint-disable-next-line no-console
      console.warn('Questionnaire metadata write skipped:', metaErr.message);
    }

    // 2. Insert the 30-day task set. Idempotent via unique(user_id, task_id).
    const roadmap = generateRoadmap(derived.pathway, derived.goal, derived.intensity);
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
    const { error: tErr } = await supabase
      .from('user_tasks')
      .upsert(taskRows, { onConflict: 'user_id,task_id', ignoreDuplicates: true });
    if (tErr && !isDuplicateKeyError(tErr)) {
      throw new Error(`tasks: ${tErr.message}`);
    }

    // 3. Verify tasks actually landed. With ignoreDuplicates, the upsert
    // returns no error when every row conflicted — so the only honest
    // proof the roadmap exists is to count it back out.
    const { count, error: cErr } = await supabase
      .from('user_tasks')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', user.id);
    if (cErr) throw new Error(`verify: ${cErr.message}`);
    if (!count || count === 0) {
      throw new Error('Roadmap was not saved. Please try again.');
    }

    // 4. Now safe to mark onboarding complete.
    const { error: cmErr } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', user.id);
    if (cmErr) throw new Error(`complete: ${cmErr.message}`);
  };

  const onLoaderComplete = () => {
    // Drop new users straight onto their 30-day roadmap (where Day 1 is
    // the only thing unlocked) so the very next step is obvious. They
    // can navigate to /dashboard from the top nav whenever.
    router.push('/roadmap');
    router.refresh();
  };

  // Submitting state — theatrical roadmap-generation loader
  if (submitting) {
    return (
      <RoadmapGenerationLoader
        onFinish={persistRoadmap}
        onComplete={onLoaderComplete}
        onError={(msg) => {
          setSubmitError(msg);
          setSubmitting(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Fixed top bar with progress */}
      <header className="fixed top-0 left-0 right-0 z-30 backdrop-blur-xl bg-bg/70 border-b border-line/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Logo size={26} className="shrink-0" priority />
            <span className="font-display text-base sm:text-xl font-bold tracking-tight truncate">
              NMO <span className="gradient-text">Roadmap</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="hidden sm:inline text-xs font-mono text-ink-dim">
              {(t.questionnaire.answeredLabel as string)
                .replace('{answered}', String(answeredCount))
                .replace('{total}', String(TOTAL_QUESTIONS))}
            </span>
            <LanguageSwitcher />
          </div>
        </div>
        <div
          className="h-1 bg-bg-raised"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
          aria-label={t.questionnaire.title}
        >
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-glow transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* Decorative background */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-accent/10 blur-[140px]" />
      </div>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 pt-24 pb-28 sm:pb-32">
        {/* Page header */}
        <div className="mb-8 sm:mb-10 text-center animate-slide-up">
          <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight mb-2 sm:mb-3 leading-tight">
            <span className="gradient-text">{t.questionnaire.title}</span>
          </h1>
          <p className="text-ink-muted text-sm sm:text-base">
            {(t.questionnaire.subtitle as string).replace('{total}', String(TOTAL_QUESTIONS))}
          </p>
        </div>

        {/* All questions in one scrollable form */}
        <div className="space-y-8 sm:space-y-12">
          {QUESTIONS.map((q) => {
            const selectedIdx = answers[q.id];
            const cols = optionGridCols(q.options.length);
            const labelId = `q-${q.id}-label`;
            return (
              <section
                key={q.id}
                role="group"
                aria-labelledby={labelId}
                className="animate-fade-in"
              >
                <h2 id={labelId} className="text-base sm:text-lg font-semibold text-ink mb-1 flex items-baseline gap-2">
                  <span className="text-xl sm:text-2xl shrink-0" aria-hidden>{q.emoji}</span>
                  <span className="leading-snug">{qText(q)}</span>
                </h2>
                {qDesc(q) && (
                  <p className="text-xs sm:text-sm text-ink-muted mb-4 ml-9">{qDesc(q)}</p>
                )}

                <div className={cn('grid gap-2.5 sm:gap-3', cols)}>
                  {q.options.map((opt, i) => {
                    const isSelected = selectedIdx === i;
                    return (
                      <button
                        key={`${q.id}-${i}`}
                        type="button"
                        onClick={() => choose(q.id, i)}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex flex-col items-center justify-start text-center px-2 sm:px-3 py-4 sm:py-5 rounded-2xl border transition-all',
                          'min-h-[124px] sm:min-h-[140px]',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                          'active:scale-[0.97]',
                          isSelected
                            ? 'border-accent bg-accent/10 glow-blue'
                            : 'border-line-strong bg-bg-raised hover:border-accent/50 hover:bg-bg-hover'
                        )}
                      >
                        <span className="text-3xl sm:text-4xl mb-1.5 sm:mb-2 leading-none" aria-hidden>{opt.emoji}</span>
                        <span className="font-semibold text-ink text-sm sm:text-base leading-tight">
                          {optText(opt)}
                        </span>
                        <span className="text-xs text-ink-muted mt-1 leading-snug">
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

      {submitError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)]">
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            <p className="font-semibold mb-1">儲存失敗 / Save failed</p>
            <p className="text-xs font-mono break-words">{submitError}</p>
            <p className="text-xs mt-2 text-danger/80">點下方按鈕重試。Tap the button below to retry.</p>
          </div>
        </div>
      )}

      {/* Sticky submit footer */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-30 backdrop-blur-xl bg-bg/90 border-t border-line/60"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <span className="text-sm font-mono text-ink-muted sm:hidden shrink-0">
            <span className={cn('font-bold', allAnswered ? 'text-accent' : 'text-ink')}>
              {answeredCount}
            </span>
            <span className="text-ink-dim">/{TOTAL_QUESTIONS}</span>
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
            aria-label={allAnswered ? t.questionnaire.submitCta : t.questionnaire.submitCtaIncomplete}
            className={cn(
              'inline-flex items-center justify-center gap-2 h-12 sm:h-13 px-5 sm:px-7 rounded-lg font-medium text-sm sm:text-base transition-all whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              allAnswered
                ? 'bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-0.5 active:translate-y-0'
                : 'bg-bg-raised text-ink-dim cursor-not-allowed'
            )}
          >
            <span className="truncate">
              {allAnswered ? t.questionnaire.submitCta : t.questionnaire.submitCtaIncomplete}
            </span>
            {allAnswered && <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />}
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
