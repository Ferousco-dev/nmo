// Static metadata for each of the 30 roadmap days. The user-specific
// task list comes from the DB (`user_tasks`) — this file provides the
// shared narrative around it: day theme, daily non-negotiable, wisdom.
//
// Template-driven so we get sensible content for all 30 days without
// hand-authoring 30 entries. The client can later override individual
// days by adding entries to OVERRIDES.

export interface BiText {
  en: string;
  zh: string;
}

export interface RoadmapDayMeta {
  day: number;
  weekIndex: 0 | 1 | 2 | 3; // 0 = week 1, 3 = week 4+
  title: BiText;
  subtitle: BiText;
  nonNegotiable: BiText;
  wisdom: {
    quote: BiText;
    author: string;
    source?: BiText;
  };
}

// =====================================================================
// Week themes — title + subtitle + non-negotiable templates
// =====================================================================
const WEEKS: {
  range: [number, number];
  weekIndex: 0 | 1 | 2 | 3;
  title: BiText;
  subtitle: BiText;
  nonNegotiable: BiText;
}[] = [
  {
    range: [1, 7],
    weekIndex: 0,
    title: { en: 'AI Foundations Deep Dive', zh: 'AI 基礎深度探索' },
    subtitle: {
      en: 'Complete core foundation modules and identify automation opportunities available to beginners.',
      zh: '完成核心基礎模組，找出適合新手的自動化機會。',
    },
    nonNegotiable: {
      en: 'Spend 60 minutes refining your offer and studying successful examples in the community.',
      zh: '花 60 分鐘打磨您的方案，並研究社群中的成功案例。',
    },
  },
  {
    range: [8, 14],
    weekIndex: 1,
    title: { en: 'Acceleration Week', zh: '加速週' },
    subtitle: {
      en: 'Move from theory to action — start building, posting, and outreaching every day.',
      zh: '從理論進入行動 — 每天建立、發文、主動聯繫。',
    },
    nonNegotiable: {
      en: 'Ship one tangible piece of work today. Share it in the community for feedback.',
      zh: '今天交付一個具體成果，並分享到社群獲得回饋。',
    },
  },
  {
    range: [15, 21],
    weekIndex: 2,
    title: { en: 'Breakthrough Week', zh: '突破週' },
    subtitle: {
      en: 'Push past plateaus. Charge more. Talk to people. Refine the offer until it sells.',
      zh: '突破停滯。提高定價。多與人對話。打磨提案直到能夠成交。',
    },
    nonNegotiable: {
      en: 'Have one real conversation with a potential client or collaborator today.',
      zh: '今天與一位潛在客戶或合作夥伴真實對話一次。',
    },
  },
  {
    range: [22, 30],
    weekIndex: 3,
    title: { en: 'Consolidation & Scale', zh: '鞏固與擴展' },
    subtitle: {
      en: 'Lock in the systems that work, drop what doesn\'t, and prepare to scale into next month.',
      zh: '鞏固有效的系統、放下無效的，為下個月的擴展做準備。',
    },
    nonNegotiable: {
      en: 'Document one repeatable process so future-you can run it without thinking.',
      zh: '把一個可重複的流程記錄下來，未來的您不需思考就能執行。',
    },
  },
];

// =====================================================================
// Wisdom rotation — paired across the 30 days deterministically
// =====================================================================
const WISDOM_POOL: { quote: BiText; author: string }[] = [
  {
    quote: {
      en: 'The rule of 100: do 100 primary actions every day for 100 days. I promise you will have customers.',
      zh: '一百法則：每天做 100 個關鍵動作，連續 100 天，您一定會有客戶。',
    },
    author: 'Alex Hormozi',
  },
  {
    quote: {
      en: 'You don\'t have to be great to start, but you have to start to be great.',
      zh: '您不必先變得偉大才能開始；您必須先開始，才會變得偉大。',
    },
    author: 'Zig Ziglar',
  },
  {
    quote: {
      en: 'Compound interest is the eighth wonder of the world. He who understands it, earns it.',
      zh: '複利是世界第八大奇蹟。理解它的人賺錢。',
    },
    author: 'Albert Einstein',
  },
  {
    quote: {
      en: 'Your network is your net worth. Spend 30 minutes a day strengthening it.',
      zh: '您的人脈就是您的財富。每天花 30 分鐘鞏固它。',
    },
    author: 'Porter Gale',
  },
  {
    quote: {
      en: 'Make it simple. Make it memorable. Make it inviting to look at. Make it fun to read.',
      zh: '做得簡單，做得難忘，做得引人注目，做得有趣易讀。',
    },
    author: 'Leo Burnett',
  },
  {
    quote: {
      en: 'The fastest way to grow your business is to focus on what is already working.',
      zh: '快速成長最有效的方式，是專注於已經有效的事情。',
    },
    author: 'Naval Ravikant',
  },
  {
    quote: {
      en: 'You are the average of the five people you spend the most time with.',
      zh: '您就是與您相處時間最長的五個人的平均值。',
    },
    author: 'Jim Rohn',
  },
];

// =====================================================================
// Optional per-day overrides — fill in special days (e.g. milestones).
// Anything missing from this map falls back to the week template.
// =====================================================================
const OVERRIDES: Record<number, Partial<Omit<RoadmapDayMeta, 'day' | 'weekIndex'>>> = {
  7: {
    title: { en: 'Foundations Wrap-Up', zh: '基礎週收尾' },
    subtitle: {
      en: 'Look back at the past 7 days. What worked? What needs to change? Reset before week 2.',
      zh: '回顧過去 7 天：哪些有效？哪些需要調整？在第二週開始前重置。',
    },
  },
  14: {
    title: { en: 'Mid-Month Checkpoint', zh: '月中檢查點' },
    subtitle: {
      en: 'Halfway there. Take stock honestly and double down on the top one or two leverage points.',
      zh: '已完成一半。誠實檢視成果，加倍投入最有槓桿的一兩件事。',
    },
  },
  21: {
    title: { en: 'Three-Week Reflection', zh: '三週反思' },
    subtitle: {
      en: 'You\'ve built more than you realise. Audit, archive, and prepare for the final stretch.',
      zh: '您建立的比想像中多。檢視、存檔、為最後衝刺做準備。',
    },
  },
  30: {
    title: { en: 'Day 30 — Launch Plan', zh: '第 30 天 — 起跳計劃' },
    subtitle: {
      en: 'The roadmap ends here, but momentum doesn\'t. Set the next 30-day target before you log off.',
      zh: '地圖在這裡結束，但動能不會停。在下線之前，先訂下一個 30 天的目標。',
    },
    nonNegotiable: {
      en: 'Write down your single most important goal for the next 30 days. Share it in the community.',
      zh: '寫下您下一個 30 天最重要的目標，並分享到社群。',
    },
  },
};

// =====================================================================
// Public accessor
// =====================================================================
export function getRoadmapDayMeta(day: number): RoadmapDayMeta {
  const week = WEEKS.find((w) => day >= w.range[0] && day <= w.range[1]) ?? WEEKS[3];
  const wisdom = WISDOM_POOL[(day - 1) % WISDOM_POOL.length];
  const override = OVERRIDES[day];

  return {
    day,
    weekIndex: week.weekIndex,
    title: override?.title ?? week.title,
    subtitle: override?.subtitle ?? week.subtitle,
    nonNegotiable: override?.nonNegotiable ?? week.nonNegotiable,
    wisdom: override?.wisdom ?? { quote: wisdom.quote, author: wisdom.author },
  };
}

/**
 * Pretty label for the resource pill that links a task back to Skool.
 * The first task of each day points at the "main" classroom module
 * and gets the graduation cap; subsequent tasks get a generic label.
 */
export function resourcePillLabel(taskIndex: number): { emoji: string; label: BiText } {
  const labels: { emoji: string; label: BiText }[] = [
    { emoji: '🎓', label: { en: 'Classroom', zh: 'Skool 課程' } },
    { emoji: '💬', label: { en: 'Community', zh: '社群討論' } },
    { emoji: '📚', label: { en: 'Resource', zh: '資源' } },
    { emoji: '🪄', label: { en: 'Workshop', zh: '工作坊' } },
  ];
  return labels[taskIndex % labels.length];
}
