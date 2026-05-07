// Step list + rotating quotes for the theatrical "generating your
// roadmap" loader. Visible only between questionnaire submit and
// /dashboard. The actual roadmap is generated in <100ms — this UI
// is paced (~45s total) so the user feels their plan was crafted.
//
// Editing is safe: add/remove steps freely. The loader divides the
// list across two columns and animates through them in order.

export interface GenStep {
  en: string;
  zh: string;
}

export interface GenQuote {
  en: string;
  zh: string;
  author: string;
}

export const GENERATION_STEPS: GenStep[] = [
  { en: 'Goals accepted',                          zh: '目標已接收' },
  { en: 'Classroom progress notes',                zh: '課堂進度筆記' },
  { en: 'Pulling community discussions',           zh: '整理社群討論' },
  { en: 'Scanning the latest NMO content',         zh: '掃描最新 NMO 內容' },
  { en: 'Searching proven frameworks',             zh: '搜尋成熟的方法' },
  { en: 'Designing your 30-day blueprint',         zh: '設計 30 天藍圖' },
  { en: 'Day 1 → Day 7: Foundations',              zh: '第 1–7 天：建立基礎' },
  { en: 'Day 8 → Day 14: Acceleration',            zh: '第 8–14 天：加速成長' },
  { en: 'Day 15 → Day 22: Breakthrough',           zh: '第 15–22 天：突破' },
  { en: 'Day 23 → Day 30: Consolidation',          zh: '第 23–30 天：鞏固' },
  { en: 'Matching resources to each day',          zh: '為每一天配對資源' },
];

export const GENERATION_QUOTES: GenQuote[] = [
  {
    en: 'The rule of 100: do 100 primary actions every day for 100 days. I promise you will have customers.',
    zh: '一百法則：每天做 100 個關鍵動作，連續 100 天，您一定會有客戶。',
    author: 'Alex Hormozi',
  },
  {
    en: "You don't have to be great to start, but you have to start to be great.",
    zh: '您不必先變得偉大才能開始；您必須先開始，才會變得偉大。',
    author: 'Zig Ziglar',
  },
  {
    en: 'Compound interest is the eighth wonder of the world. He who understands it, earns it; he who doesn\'t, pays it.',
    zh: '複利是世界第八大奇蹟。理解它的人賺錢；不理解的人付錢。',
    author: 'Albert Einstein',
  },
];
