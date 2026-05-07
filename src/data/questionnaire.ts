// Quick post-signup check-in. 5 substantive questions that map onto the
// existing tenure / goal / intensity dimensions and seed a personalised
// 30-day roadmap. Each question can have any number of options (2-4),
// each with an emoji glyph + a short descriptor underneath the label.

import type { Tenure, Goal, Intensity } from '@/types';

export interface QuestionOption {
  /** Emoji glyph rendered above the label */
  emoji: string;
  /** Primary label */
  en: string;
  zh: string;
  /** Sub-label / descriptor (one short phrase) */
  desc: { en: string; zh: string };
  /** Optional dimension hint — pulls schema fields toward this value when chosen */
  maps?: { tenure?: Tenure; goal?: Goal; intensity?: Intensity };
}

export interface Question {
  id: string;
  /** Emoji shown next to the question title */
  emoji: string;
  /** Primary question text */
  en: string;
  zh: string;
  /** Optional one-line context shown under the question */
  desc?: { en: string; zh: string };
  options: QuestionOption[];
}

export const QUESTIONS: Question[] = [
  {
    id: 'paying_customers',
    emoji: '💼',
    en: 'How many paying clients do you have?',
    zh: '您有多少付費客戶？',
    desc: {
      en: 'Helps us pace the early weeks of your roadmap.',
      zh: '幫助我們調整地圖前期的節奏。',
    },
    options: [
      {
        emoji: '👋',
        en: 'Not yet',
        zh: '還沒有',
        desc: { en: 'Pre-revenue', zh: '尚未獲利' },
        maps: { tenure: 'warrior' },
      },
      {
        emoji: '💪',
        en: '1–2',
        zh: '1–2 位',
        desc: { en: 'Getting started', zh: '開始起步' },
        maps: { tenure: 'ninja' },
      },
      {
        emoji: '🚀',
        en: '3–5',
        zh: '3–5 位',
        desc: { en: 'Building', zh: '正在建立' },
        maps: { tenure: 'wizard' },
      },
      {
        emoji: '⭐',
        en: '5+',
        zh: '5 位以上',
        desc: { en: 'Growing', zh: '快速成長' },
        maps: { tenure: 'wizard' },
      },
    ],
  },
  {
    id: 'built_for_client',
    emoji: '🪄',
    en: 'Have you built anything for a client?',
    zh: '您曾為客戶建立任何東西嗎？',
    options: [
      {
        emoji: '👀',
        en: 'Not yet',
        zh: '還沒有',
        desc: { en: "Haven't built for anyone", zh: '尚未為他人建立' },
      },
      {
        emoji: '🎁',
        en: 'Yes, free',
        zh: '有，免費的',
        desc: { en: 'Built for free / no fee', zh: '免費或無收費建立' },
      },
      {
        emoji: '✅',
        en: 'Yes, paid',
        zh: '有，付費的',
        desc: { en: 'Delivered & got paid', zh: '已交付並收費' },
      },
    ],
  },
  {
    id: 'product_or_service',
    emoji: '🚀',
    en: 'Do you have a product or service to sell?',
    zh: '您有產品或服務可以販售嗎？',
    desc: {
      en: 'This decides whether week one focuses on niching down or selling.',
      zh: '這決定第一週要找定位還是專注於銷售。',
    },
    options: [
      {
        emoji: '🤔',
        en: 'Not yet',
        zh: '還沒有',
        desc: { en: 'Still figuring out what to sell', zh: '還在思考要賣什麼' },
      },
      {
        emoji: '💡',
        en: 'I have an idea',
        zh: '我有想法',
        desc: { en: "Haven't packaged or tested it", zh: '尚未包裝或測試' },
      },
      {
        emoji: '✅',
        en: 'Yes, clear offer',
        zh: '有，明確方案',
        desc: { en: "I know what I'm selling", zh: '我知道要賣什麼' },
      },
    ],
  },
  {
    id: 'business_kind',
    emoji: '📚',
    en: 'What kind of business are you building?',
    zh: '您正在打造什麼類型的事業？',
    desc: {
      en: 'This tailors your roadmap to your specific business model.',
      zh: '這會根據您的商業模式量身打造地圖。',
    },
    options: [
      {
        emoji: '🏢',
        en: 'Service / Agency',
        zh: '服務 / 代理',
        desc: { en: 'Doing work for clients', zh: '為客戶提供服務' },
        maps: { goal: 'agency' },
      },
      {
        emoji: '💻',
        en: 'SaaS / Software',
        zh: '軟體產品',
        desc: { en: 'Building a product', zh: '打造產品' },
        maps: { goal: 'saas' },
      },
      {
        emoji: '🎬',
        en: 'Content',
        zh: '內容創作',
        desc: { en: 'Audience-first business', zh: '以受眾為中心' },
        maps: { goal: 'content' },
      },
      {
        emoji: '🎓',
        en: 'Coaching',
        zh: '教練諮詢',
        desc: { en: 'Teaching others to grow', zh: '指導他人成長' },
        maps: { goal: 'coaching' },
      },
    ],
  },
  {
    id: 'time_commit',
    emoji: '⏰',
    en: 'How many hours can you commit each day?',
    zh: '您每天可以投入多少時間？',
    options: [
      {
        emoji: '🌱',
        en: '1–2 hours',
        zh: '1–2 小時',
        desc: { en: 'Easy mode', zh: '輕量版' },
        maps: { intensity: 'easy' },
      },
      {
        emoji: '💪',
        en: '3–4 hours',
        zh: '3–4 小時',
        desc: { en: 'Steady', zh: '穩定推進' },
        maps: { intensity: 'easy' },
      },
      {
        emoji: '🚀',
        en: '5+ hours',
        zh: '5 小時以上',
        desc: { en: 'Pro mode', zh: '專業版' },
        maps: { intensity: 'pro' },
      },
    ],
  },
];

export const TOTAL_QUESTIONS = QUESTIONS.length;

/**
 * Walk the user's answers and derive the (tenure, goal, intensity) tuple
 * the existing onboarding flow stores. Falls back to safe defaults so we
 * always have something to seed the roadmap with.
 */
export function deriveDimensions(answers: Record<string, number>): {
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

  for (const q of QUESTIONS) {
    const idx = answers[q.id];
    if (idx == null) continue;
    const opt = q.options[idx];
    if (!opt?.maps) continue;
    if (opt.maps.tenure) tenureCount[opt.maps.tenure]++;
    if (opt.maps.goal) goalCount[opt.maps.goal]++;
    if (opt.maps.intensity) intensityCount[opt.maps.intensity]++;
  }

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
