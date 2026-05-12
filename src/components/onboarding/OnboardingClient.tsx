'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, ArrowLeft, Check,
  Sword, Shield, Wand2, Crown,
  Building2, Code2, Video, GraduationCap,
  Sprout, Rocket,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { assignTrack, generateRoadmap } from '@/lib/roadmap/generator';
import type { Tenure, Goal, Intensity } from '@/types';

const TOTAL_STEPS = 3;

// PostgreSQL unique-violation: SQLSTATE 23505. Surfaces from supabase-js
// either as `error.code === '23505'` or with a message containing
// "duplicate key" / "already exists" depending on the version.
function isDuplicateKeyError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  return /duplicate key|already exists/i.test(err.message ?? '');
}

export function OnboardingClient() {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [tenure, setTenure] = useState<Tenure | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canProceed = () => {
    if (step === 1) return tenure !== null;
    if (step === 2) return goal !== null;
    if (step === 3) return intensity !== null;
    return false;
  };

  const handleNext = () => {
    if (!canProceed()) return;
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    if (!tenure || !goal || !intensity) return;
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const track = assignTrack(tenure, goal, intensity);

    // Upsert (not update) so we self-heal when the on_auth_user_created
    // trigger never fired and the profile row is missing — the task
    // insert below would otherwise 23503 on the FK to profiles(id).
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email,
          tenure,
          goal,
          intensity,
          track_assigned: track,
          onboarding_completed: true,
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    const roadmap = generateRoadmap(tenure, goal, intensity);
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

    // Upsert idempotently. The unique(user_id, task_id) constraint means
    // re-running this flow (or running both /onboarding and /questionnaire)
    // hits 23505 on rows that are already there — which is functionally
    // fine, so we swallow that specific error and let real failures surface.
    const { error: tasksError } = await supabase
      .from('user_tasks')
      .upsert(taskRows, { onConflict: 'user_id,task_id', ignoreDuplicates: true });

    if (tasksError && !isDuplicateKeyError(tasksError)) {
      setError(tasksError.message);
      setLoading(false);
      return;
    }

    // Drop new users straight onto their 30-day roadmap (where Day 1 is
    // the only thing unlocked) so the very next step is obvious.
    router.push('/roadmap');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-accent/10 blur-[140px]" />
      </div>

      <div className="w-full max-w-2xl animate-slide-up">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-ink-dim uppercase tracking-wider">
              {t.onboarding.step} {step} {t.onboarding.of} {TOTAL_STEPS}
            </span>
            <span className="text-xs font-mono text-accent">
              {Math.round((step / TOTAL_STEPS) * 100)}%
            </span>
          </div>
          <div className="h-1 bg-bg-raised rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-glow transition-all duration-500 ease-out"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        <div className="card-premium p-6 sm:p-8 md:p-10">
          {step === 1 && <Step1Tenure value={tenure} onChange={setTenure} />}
          {step === 2 && <Step2Goal value={goal} onChange={setGoal} />}
          {step === 3 && <Step3Intensity value={intensity} onChange={setIntensity} />}

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}

          <div className="mt-8 flex items-center justify-between gap-3">
            {step > 1 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={loading}>
                <ArrowLeft className="h-4 w-4" />
                {t.onboarding.back}
              </Button>
            ) : (
              <div />
            )}

            <Button onClick={handleNext} disabled={!canProceed()} loading={loading} size="lg">
              {step === TOTAL_STEPS ? t.onboarding.finish : t.onboarding.next}
              {step !== TOTAL_STEPS && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TENURE_OPTIONS: { key: Tenure; Icon: LucideIcon }[] = [
  { key: 'warrior', Icon: Sword },
  { key: 'ninja', Icon: Shield },
  { key: 'wizard', Icon: Wand2 },
  { key: 'dragon', Icon: Crown },
];

function Step1Tenure({ value, onChange }: { value: Tenure | null; onChange: (v: Tenure) => void }) {
  const t = useT();
  return (
    <div>
      <h2 className="font-display text-2xl sm:text-3xl font-bold mb-2 gradient-text">
        {t.onboarding.tenureStepTitle}
      </h2>
      <p className="text-ink-muted mb-6">{t.onboarding.tenureStepDesc}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TENURE_OPTIONS.map(({ key, Icon }) => {
          const opt = t.onboarding.tenure[key];
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={cn(
                'group flex items-center gap-3 p-4 rounded-xl text-left border transition-all',
                selected
                  ? 'border-accent bg-accent/10 glow-blue'
                  : 'border-line-strong bg-bg-raised hover:border-accent/50 hover:bg-bg-hover'
              )}
            >
              <div className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                selected ? 'bg-accent/20 text-accent' : 'bg-bg-card text-ink-muted'
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink">{opt.label}</div>
                <div className="text-xs text-ink-muted mt-0.5">{opt.desc}</div>
              </div>
              {selected && <Check className="h-5 w-5 text-accent shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const GOAL_OPTIONS: { key: Goal; Icon: LucideIcon }[] = [
  { key: 'agency', Icon: Building2 },
  { key: 'saas', Icon: Code2 },
  { key: 'content', Icon: Video },
  { key: 'coaching', Icon: GraduationCap },
];

function Step2Goal({ value, onChange }: { value: Goal | null; onChange: (v: Goal) => void }) {
  const t = useT();
  return (
    <div>
      <h2 className="font-display text-2xl sm:text-3xl font-bold mb-2 gradient-text">
        {t.onboarding.goalStepTitle}
      </h2>
      <p className="text-ink-muted mb-6">{t.onboarding.goalStepDesc}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GOAL_OPTIONS.map(({ key, Icon }) => {
          const opt = t.onboarding.goal[key];
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={cn(
                'group flex items-center gap-3 p-4 rounded-xl text-left border transition-all',
                selected
                  ? 'border-accent bg-accent/10 glow-blue'
                  : 'border-line-strong bg-bg-raised hover:border-accent/50 hover:bg-bg-hover'
              )}
            >
              <div className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                selected ? 'bg-accent/20 text-accent' : 'bg-bg-card text-ink-muted'
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink">{opt.label}</div>
                <div className="text-xs text-ink-muted mt-0.5">{opt.desc}</div>
              </div>
              {selected && <Check className="h-5 w-5 text-accent shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const INTENSITY_OPTIONS: { key: Intensity; Icon: LucideIcon }[] = [
  { key: 'easy', Icon: Sprout },
  { key: 'pro', Icon: Rocket },
];

function Step3Intensity({
  value,
  onChange,
}: {
  value: Intensity | null;
  onChange: (v: Intensity) => void;
}) {
  const t = useT();
  return (
    <div>
      <h2 className="font-display text-2xl sm:text-3xl font-bold mb-2 gradient-text">
        {t.onboarding.intensityStepTitle}
      </h2>
      <p className="text-ink-muted mb-6">{t.onboarding.intensityStepDesc}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {INTENSITY_OPTIONS.map(({ key, Icon }) => {
          const opt = t.onboarding.intensity[key];
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={cn(
                'group flex flex-col items-start gap-3 p-6 rounded-xl text-left border transition-all',
                selected
                  ? 'border-accent bg-accent/10 glow-blue'
                  : 'border-line-strong bg-bg-raised hover:border-accent/50 hover:bg-bg-hover'
              )}
            >
              <div className={cn(
                'h-12 w-12 rounded-lg flex items-center justify-center',
                selected ? 'bg-accent/20 text-accent' : 'bg-bg-card text-ink-muted'
              )}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="font-semibold text-lg text-ink">{opt.label}</div>
              <div className="text-sm text-ink-muted">{opt.desc}</div>
              {selected && (
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-accent">
                  <Check className="h-3 w-3" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
