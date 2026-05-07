import type { Tenure, Pathway, Goal, Intensity, RoadmapDay } from '@/types';

// =====================================================================
// Track assignment
//
// Per the client product brief: only 3 possible roadmap pathways
// (foundation / growth / scale) instead of 4 archetypes. Combined with
// 2 intensity levels we have exactly 6 tracks.
//
// The `assignTrack` function is overloaded so existing callers that
// still pass tenure (legacy) continue to work — we map tenure → pathway
// internally.
// =====================================================================

const PATHWAY_TRACK_PREFIX: Record<Pathway, string> = {
  foundation: 'foundation',
  growth: 'growth',
  scale: 'scale',
};

function tenureToPathway(tenure: Tenure): Pathway {
  if (tenure === 'warrior') return 'foundation';
  if (tenure === 'ninja') return 'growth';
  // wizard + dragon both collapse to scale
  return 'scale';
}

export function assignTrack(
  pathwayOrTenure: Pathway | Tenure,
  goal: Goal,
  intensity: Intensity
): string {
  // Detect pathway vs tenure based on the value
  const pathway: Pathway =
    pathwayOrTenure === 'foundation' || pathwayOrTenure === 'growth' || pathwayOrTenure === 'scale'
      ? pathwayOrTenure
      : tenureToPathway(pathwayOrTenure as Tenure);

  return `${PATHWAY_TRACK_PREFIX[pathway]}_${intensity}`;
  // goal is captured separately on the profile and used for task copy;
  // it doesn't change which TRACK you're on, only what the days say.
}

/**
 * Display label for a track id, in Traditional Chinese.
 * Includes the legacy 8-track names (optimization_*, mastery_*) so
 * users assigned before the pathway refactor still see a label.
 */
export const TRACK_NAMES_ZH: Record<string, string> = {
  // New 3-pathway tracks
  foundation_easy: '基礎軌道（輕量版）',
  foundation_pro: '基礎軌道（專業版）',
  growth_easy: '成長軌道（輕量版）',
  growth_pro: '成長軌道（專業版）',
  scale_easy: '擴展軌道（輕量版）',
  scale_pro: '擴展軌道（專業版）',
  // Legacy 4-archetype tracks (still in DB for old users)
  optimization_easy: '擴展軌道（輕量版）',
  optimization_pro: '擴展軌道（專業版）',
  mastery_easy: '擴展軌道（輕量版）',
  mastery_pro: '擴展軌道（專業版）',
};

// =====================================================================
// Goal-specific task themes (Chinese — placeholder content the client
// will refine. The 5-question quiz votes on `goal`; this drives copy.)
// =====================================================================
const GOAL_FOCUS_ZH: Record<Goal, string> = {
  agency: '代理服務業務',
  saas: 'SaaS 軟體產品',
  content: '內容創作事業',
  coaching: '教練諮詢業務',
};

// =====================================================================
// 30-day task generator. Output shape is unchanged. Accepts either
// pathway (preferred) or tenure (legacy — converted internally).
// =====================================================================
export function generateRoadmap(
  pathwayOrTenure: Pathway | Tenure,
  goal: Goal,
  intensity: Intensity
): RoadmapDay[] {
  const pathway: Pathway =
    pathwayOrTenure === 'foundation' || pathwayOrTenure === 'growth' || pathwayOrTenure === 'scale'
      ? pathwayOrTenure
      : tenureToPathway(pathwayOrTenure as Tenure);

  const focus = GOAL_FOCUS_ZH[goal];
  const tasksPerDay = intensity === 'pro' ? 4 : 2;

  // Pathway-tinted task bank — slight nudges in copy so the same
  // template produces different days for foundation vs scale users.
  const pathwayHint =
    pathway === 'foundation' ? '從零開始建立基礎'
    : pathway === 'growth'   ? '加速擴展現有成果'
    :                          '系統化規模化';

  const dailyTaskBank = [
    { id: 'watch_lesson',      title: '觀看當日 Skool 課程',          desc: `今天的核心課程約 30 分鐘，主題與「${focus}」相關。` },
    { id: 'community_post',    title: '在 NMO 社群發表心得',          desc: '分享你今天學到的最重要的一件事。' },
    { id: 'community_comment', title: '回覆三位夥伴的貼文',          desc: '建立人脈，給予真誠的回饋。' },
    { id: 'action_step',       title: '執行今日行動步驟',            desc: `針對「${focus}」採取一個具體的行動，目標是${pathwayHint}。` },
    { id: 'reflection',        title: '寫下今日反思',                desc: '記錄三個收穫與一個明日重點。' },
    { id: 'outreach',          title: '聯繫一位潛在客戶或合作夥伴',  desc: '主動出擊，每天累積關係。' },
    { id: 'study_case',        title: '研究一個成功案例',            desc: `分析一個與「${focus}」相關的成功案例。` },
    { id: 'metric_track',      title: '更新你的進度指標',            desc: '記錄今天的關鍵數字。' },
  ];

  const days: RoadmapDay[] = [];

  for (let day = 1; day <= 30; day++) {
    const tasks = [];
    for (let i = 0; i < tasksPerDay; i++) {
      const taskTemplate = dailyTaskBank[(day + i) % dailyTaskBank.length];
      tasks.push({
        id: `day${day}_${taskTemplate.id}_${i}`,
        title: taskTemplate.title,
        description: taskTemplate.desc,
        skool_lesson_url: `https://www.skool.com/nmo/classroom?day=${day}`,
      });
    }

    days.push({
      day,
      title: `第 ${day} 天`,
      tasks,
    });
  }

  return days;
}
