// 6-question archetype quiz. Every question has 4 options that each
// vote on ONE of the four archetypes — mind / body / money / direction.
// The plurality wins. Ties fall back to the first archetype hit.
//
// The new questionnaire is the primary signal for the user's roadmap
// experience. The legacy (pathway, tenure, goal, intensity) columns
// still exist on profiles because the existing 30-day roadmap
// generator (lib/roadmap/generator.ts) reads them — so this file also
// derives sensible defaults for those columns from the chosen
// archetype. Treat the legacy mapping as INTERIM. Once archetype-
// native roadmap content lands the four legacy fields can retire.

import type {
  Tenure,
  Pathway,
  Goal,
  Intensity,
  Archetype,
} from '@/types';

export interface QuestionOption {
  /** Emoji glyph rendered above the label */
  emoji: string;
  /** Primary label */
  en: string;
  zh: string;
  /** Sub-label / descriptor (one short phrase) */
  desc: { en: string; zh: string };
  /** Which archetype this option votes on. Required on every option. */
  archetype: Archetype;
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
    id: 'q1_change',
    emoji: '🎯',
    en: 'What do you most want to change about yourself right now?',
    zh: '現在的你，最想改變的是哪一個問題？',
    options: [
      {
        emoji: '🧠',
        en: "My mind is easily distracted; I can't control my urges",
        zh: '我的大腦很容易分心，控制不了慾望',
        desc: { en: 'Mind & self-control', zh: '大腦與自制力' },
        archetype: 'mind',
      },
      {
        emoji: '💪',
        en: 'My body is weak; I have no energy',
        zh: '我的身體狀態太差，沒有能量',
        desc: { en: 'Body & energy', zh: '身體與能量' },
        archetype: 'body',
      },
      {
        emoji: '💰',
        en: "I earn too little; I'm anxious about my future",
        zh: '我賺的錢太少，對未來很焦慮',
        desc: { en: 'Money & income', zh: '金錢與收入' },
        archetype: 'money',
      },
      {
        emoji: '🧭',
        en: 'My life feels like it has no direction',
        zh: '我感覺人生沒有方向感',
        desc: { en: 'Direction & purpose', zh: '方向與目標' },
        archetype: 'direction',
      },
    ],
  },
  {
    id: 'q2_pain',
    emoji: '🔥',
    en: 'What is your biggest pain point right now?',
    zh: '你現在最大的痛苦是什麼？',
    options: [
      {
        emoji: '🚫',
        en: "I keep returning to porn / masturbation, knowing I shouldn't",
        zh: '明知道不該做，還是一直看A片／手淫',
        desc: { en: 'Compulsion loop', zh: '無法停止的循環' },
        archetype: 'mind',
      },
      {
        emoji: '🪫',
        en: 'No physical energy, easily exhausted',
        zh: '沒有體能、沒有精神、容易累',
        desc: { en: 'Body running on empty', zh: '身體耗盡' },
        archetype: 'body',
      },
      {
        emoji: '📉',
        en: 'Income stuck, no sense of growth',
        zh: '收入停滯，沒有成長感',
        desc: { en: 'Career flatline', zh: '事業停滯' },
        archetype: 'money',
      },
      {
        emoji: '🌀',
        en: "I procrastinate constantly and can't actually execute",
        zh: '常常拖延，無法真正執行',
        desc: { en: 'Stuck in the loop', zh: '陷入拖延' },
        archetype: 'direction',
      },
    ],
  },
  {
    id: 'q3_one_year',
    emoji: '🌟',
    en: 'A year from now, the version of you that has truly transformed — which one is it?',
    zh: '如果一年後的你徹底蛻變了，你最希望是哪一種狀態？',
    options: [
      {
        emoji: '🧘',
        en: 'In complete control of my urges and impulses',
        zh: '完全掌控自己的慾望與衝動',
        desc: { en: 'Master of your mind', zh: '掌控自己的大腦' },
        archetype: 'mind',
      },
      {
        emoji: '🏋️',
        en: 'A strong, disciplined, attractive body',
        zh: '擁有強壯、自律、有吸引力的身體',
        desc: { en: 'Built and sharp', zh: '強壯且敏捷' },
        archetype: 'body',
      },
      {
        emoji: '🚀',
        en: 'Income up sharply, my own business under way',
        zh: '收入大幅提升，開始建立自己的事業',
        desc: { en: 'Building real wealth', zh: '建立財富' },
        archetype: 'money',
      },
      {
        emoji: '👑',
        en: 'A truly confident man with real presence',
        zh: '成為一個真正有自信、有存在感的男人',
        desc: { en: 'Owning every room', zh: '展現存在感' },
        archetype: 'direction',
      },
    ],
  },
  {
    id: 'q4_lacking',
    emoji: '🪞',
    en: 'What are you most lacking right now?',
    zh: '你現在最缺乏的是什麼？',
    options: [
      {
        emoji: '🧠',
        en: 'Self-control',
        zh: '自制力',
        desc: { en: 'Mastering urges', zh: '掌控慾望' },
        archetype: 'mind',
      },
      {
        emoji: '⚙️',
        en: 'Discipline',
        zh: '紀律',
        desc: { en: 'Consistent habits', zh: '穩定的習慣' },
        archetype: 'body',
      },
      {
        emoji: '💵',
        en: 'Money and opportunity',
        zh: '金錢與機會',
        desc: { en: 'Resources & doors', zh: '資源與機會' },
        archetype: 'money',
      },
      {
        emoji: '⚡',
        en: 'Action and follow-through',
        zh: '行動力',
        desc: { en: 'Doing, not thinking', zh: '行動而非空想' },
        archetype: 'direction',
      },
    ],
  },
  {
    id: 'q5_waste_time',
    emoji: '⏳',
    en: 'Where do you waste the most time each day?',
    zh: '你每天最容易浪費時間在哪裡？',
    options: [
      {
        emoji: '📱',
        en: 'Porn, short-form video, urge-driven content',
        zh: '色情內容、短影音、慾望刺激',
        desc: { en: 'Dopamine traps', zh: '多巴胺陷阱' },
        archetype: 'mind',
      },
      {
        emoji: '🛋️',
        en: 'Staying up late, slacking off, no exercise',
        zh: '熬夜、耍廢、不運動',
        desc: { en: 'Body neglect', zh: '忽略身體' },
        archetype: 'body',
      },
      {
        emoji: '📲',
        en: 'Endlessly scrolling with no purpose',
        zh: '漫無目的地滑手機',
        desc: { en: 'Aimless scrolling', zh: '無意義滑動' },
        archetype: 'money',
      },
      {
        emoji: '💭',
        en: "Overthinking but never actually starting",
        zh: '想很多，但沒有真正開始',
        desc: { en: 'Stuck in your head', zh: '困在腦中' },
        archetype: 'direction',
      },
    ],
  },
  {
    id: 'q6_focus',
    emoji: '🎯',
    en: 'If you could only focus on improving ONE thing for 30 days, which would it be?',
    zh: '如果只能先專注提升一件事情 30 天，你會選哪一個？',
    options: [
      {
        emoji: '🚫',
        en: 'Quit porn / masturbation, rewire my brain',
        zh: '戒掉A片與手淫，重建大腦',
        desc: { en: 'Reset the mind', zh: '重啟大腦' },
        archetype: 'mind',
      },
      {
        emoji: '🏋️',
        en: 'Build a stronger body and rhythm',
        zh: '打造更強的身體與作息',
        desc: { en: 'Forge the body', zh: '鍛造身體' },
        archetype: 'body',
      },
      {
        emoji: '💼',
        en: 'Boost income and business skills',
        zh: '提升收入與事業能力',
        desc: { en: 'Sharpen the craft', zh: '磨練本領' },
        archetype: 'money',
      },
      {
        emoji: '⚔️',
        en: 'Build true masculine discipline',
        zh: '建立真正的男性自律',
        desc: { en: 'Discipline as identity', zh: '自律即身份' },
        archetype: 'direction',
      },
    ],
  },
];

export const TOTAL_QUESTIONS = QUESTIONS.length;

/**
 * Plurality-vote across the user's six A/B/C/D answers and pick the
 * dominant archetype. Then derive INTERIM defaults for the legacy
 * (pathway, tenure, goal, intensity) columns so the existing 30-day
 * roadmap generator still has something coherent to seed from.
 *
 * The legacy mapping below is deliberately conservative — every
 * archetype lands a sensible-but-generic combo that won't break the
 * generator. Replace it once archetype-native roadmap content ships
 * (i.e. when lib/roadmap/generator.ts learns to switch on archetype).
 */
export function deriveDimensions(answers: Record<string, number>): {
  archetype: Archetype;
  pathway: Pathway;
  tenure: Tenure;
  goal: Goal;
  intensity: Intensity;
} {
  const tally: Record<Archetype, number> = {
    mind: 0, body: 0, money: 0, direction: 0,
  };

  for (const q of QUESTIONS) {
    const idx = answers[q.id];
    if (idx == null) continue;
    const opt = q.options[idx];
    if (!opt) continue;
    tally[opt.archetype]++;
  }

  // Plurality winner; fall back to 'direction' if the user somehow
  // submitted with zero answers (shouldn't happen — the submit button
  // is disabled until every question is answered).
  const archetype: Archetype =
    (Object.entries(tally) as [Archetype, number][])
      .sort((a, b) => b[1] - a[1])[0][0] ?? 'direction';

  // INTERIM legacy mapping. See file-level comment.
  const legacy = LEGACY_DEFAULTS[archetype];

  return { archetype, ...legacy };
}

const LEGACY_DEFAULTS: Record<Archetype, {
  pathway: Pathway;
  tenure: Tenure;
  goal: Goal;
  intensity: Intensity;
}> = {
  mind:      { pathway: 'foundation', tenure: 'warrior', goal: 'coaching', intensity: 'easy' },
  body:      { pathway: 'foundation', tenure: 'ninja',   goal: 'coaching', intensity: 'pro'  },
  money:     { pathway: 'growth',     tenure: 'wizard',  goal: 'agency',   intensity: 'pro'  },
  direction: { pathway: 'foundation', tenure: 'warrior', goal: 'coaching', intensity: 'easy' },
};
