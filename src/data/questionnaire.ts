// Quick post-signup check-in. 5 substantive questions that give us enough
// signal to seed the user's tenure / goal / intensity and generate a
// personalized 30-day roadmap. Each question can have any number of
// options (2-4 typical) — not all questions are 3-option.

import type { Tenure, Goal, Intensity } from '@/types';

export interface QuestionOption {
  /** English text */
  en: string;
  /** Traditional Chinese text */
  zh: string;
  /** Optional dimension hint — the answer pulls these schema fields toward this value. */
  maps?: { tenure?: Tenure; goal?: Goal; intensity?: Intensity };
}

export interface Question {
  id: string;
  en: string;
  zh: string;
  options: QuestionOption[]; // can be 2, 3, or 4 options
}

export const QUESTIONS: Question[] = [
  {
    id: 'business_stage',
    en: 'Where are you in your business right now?',
    zh: '您目前的事業處於哪個階段？',
    options: [
      { en: 'Just starting out', zh: '剛開始', maps: { tenure: 'warrior' } },
      { en: 'Got my first wins', zh: '已有初步成果', maps: { tenure: 'ninja' } },
      { en: 'Scaling up', zh: '正在擴大規模', maps: { tenure: 'wizard' } },
    ],
  },
  {
    id: 'paying_customers',
    en: 'Do you have paying customers yet?',
    zh: '您已經有付費客戶了嗎？',
    options: [
      { en: 'Not yet', zh: '還沒有', maps: { tenure: 'warrior' } },
      { en: '1–5', zh: '1–5 位', maps: { tenure: 'ninja' } },
      { en: '6 or more', zh: '6 位以上', maps: { tenure: 'wizard' } },
    ],
  },
  {
    id: 'main_goal',
    en: 'What are you mainly trying to build?',
    zh: '您主要想打造什麼？',
    options: [
      { en: 'A content brand', zh: '內容品牌', maps: { goal: 'content' } },
      { en: 'A service or agency', zh: '服務或代理事業', maps: { goal: 'agency' } },
      { en: 'A software product', zh: '軟體產品', maps: { goal: 'saas' } },
      { en: 'A coaching business', zh: '教練諮詢事業', maps: { goal: 'coaching' } },
    ],
  },
  {
    id: 'time_commit',
    en: 'How many hours can you commit each day?',
    zh: '您每天可以投入多少時間？',
    options: [
      { en: '1–2 hours', zh: '1–2 小時', maps: { intensity: 'easy' } },
      { en: '3–4 hours', zh: '3–4 小時', maps: { intensity: 'easy' } },
      { en: '5+ hours', zh: '5 小時以上', maps: { intensity: 'pro' } },
    ],
  },
  {
    id: 'tenure',
    en: 'How long have you been part of NMO?',
    zh: '您加入 NMO 多久了？',
    options: [
      { en: 'Less than a month', zh: '不到一個月', maps: { tenure: 'warrior' } },
      { en: '1–3 months', zh: '1–3 個月', maps: { tenure: 'ninja' } },
      { en: '3+ months', zh: '3 個月以上', maps: { tenure: 'wizard' } },
    ],
  },
];

export const TOTAL_QUESTIONS = QUESTIONS.length;

/**
 * Walk the user's answers and derive the (tenure, goal, intensity) tuple
 * the existing onboarding flow stores. Falls back to safe defaults so we
 * always have something to seed the roadmap with.
 */
export function deriveDimensions(answers: number[]): {
  tenure: Tenure;
  goal: Goal;
  intensity: Intensity;
} {
  let tenure: Tenure = 'warrior';
  let goal: Goal = 'agency';
  let intensity: Intensity = 'easy';

  const tenureCount: Record<Tenure, number> = { warrior: 0, ninja: 0, wizard: 0, dragon: 0 };
  const goalCount: Record<Goal, number> = { agency: 0, saas: 0, content: 0, coaching: 0 };
  const intensityCount: Record<Intensity, number> = { easy: 0, pro: 0 };

  for (let i = 0; i < QUESTIONS.length; i++) {
    const ans = answers[i];
    if (ans == null) continue;
    const opt = QUESTIONS[i].options[ans];
    if (!opt?.maps) continue;
    if (opt.maps.tenure) tenureCount[opt.maps.tenure]++;
    if (opt.maps.goal) goalCount[opt.maps.goal]++;
    if (opt.maps.intensity) intensityCount[opt.maps.intensity]++;
  }

  // Pick the most-voted (or default) for each dimension
  const top = <T extends string>(counts: Record<T, number>, fallback: T): T => {
    const sorted = (Object.entries(counts) as [T, number][]).sort((a, b) => b[1] - a[1]);
    const [winner, votes] = sorted[0];
    return votes > 0 ? winner : fallback;
  };

  tenure = top(tenureCount, tenure);
  goal = top(goalCount, goal);
  intensity = top(intensityCount, intensity);

  return { tenure, goal, intensity };
}
