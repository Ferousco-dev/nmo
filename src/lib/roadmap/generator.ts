import type { Tenure, Goal, Intensity, RoadmapDay } from '@/types';

// =====================================================
// Track assignment logic
// =====================================================
export function assignTrack(tenure: Tenure, goal: Goal, intensity: Intensity): string {
  // Warriors (new) → Foundation tracks
  if (tenure === 'warrior') {
    return intensity === 'pro' ? 'foundation_pro' : 'foundation_easy';
  }
  // Ninjas (1-3 months) → Growth tracks
  if (tenure === 'ninja') {
    return intensity === 'pro' ? 'growth_pro' : 'growth_easy';
  }
  // Wizards (3-6 months) → Optimization tracks
  if (tenure === 'wizard') {
    return intensity === 'pro' ? 'optimization_pro' : 'optimization_easy';
  }
  // Dragons (veteran) → Mastery tracks
  return intensity === 'pro' ? 'mastery_pro' : 'mastery_easy';
}

export const TRACK_NAMES_ZH: Record<string, string> = {
  foundation_easy: '基礎軌道（輕量版）',
  foundation_pro: '基礎軌道（專業版）',
  growth_easy: '成長軌道（輕量版）',
  growth_pro: '成長軌道（專業版）',
  optimization_easy: '優化軌道（輕量版）',
  optimization_pro: '優化軌道（專業版）',
  mastery_easy: '精通軌道（輕量版）',
  mastery_pro: '精通軌道（專業版）',
};

// =====================================================
// Goal-specific themes
// =====================================================
const GOAL_FOCUS_ZH: Record<Goal, string> = {
  agency: '代理服務業務',
  saas: 'SaaS 軟體產品',
  content: '內容創作事業',
  coaching: '教練諮詢業務',
};

// =====================================================
// 30-day task generator
// PLACEHOLDER tasks in Traditional Chinese - client edits later
// =====================================================
export function generateRoadmap(
  tenure: Tenure,
  goal: Goal,
  intensity: Intensity
): RoadmapDay[] {
  const focus = GOAL_FOCUS_ZH[goal];
  const tasksPerDay = intensity === 'pro' ? 4 : 2;

  // Week themes
  const weekThemes = [
    { range: [1, 7], title: '第一週：定位與基礎', skill: '釐清你的方向' },
    { range: [8, 14], title: '第二週：技能養成', skill: '建立核心能力' },
    { range: [15, 21], title: '第三週：實戰執行', skill: '開始真實行動' },
    { range: [22, 30], title: '第四週：擴展與優化', skill: '系統化你的成果' },
  ];

  const dailyTaskBank = [
    { id: 'watch_lesson', title: '觀看當日 Skool 課程', desc: `今天的核心課程約 30 分鐘，主題與「${focus}」相關。` },
    { id: 'community_post', title: '在 NMO 社群發表心得', desc: '分享你今天學到的最重要的一件事。' },
    { id: 'community_comment', title: '回覆三位夥伴的貼文', desc: '建立人脈，給予真誠的回饋。' },
    { id: 'action_step', title: '執行今日行動步驟', desc: `針對「${focus}」採取一個具體的行動。` },
    { id: 'reflection', title: '寫下今日反思', desc: '記錄三個收穫與一個明日重點。' },
    { id: 'outreach', title: '聯繫一位潛在客戶或合作夥伴', desc: '主動出擊，每天累積關係。' },
    { id: 'study_case', title: '研究一個成功案例', desc: `分析一個與「${focus}」相關的成功案例。` },
    { id: 'metric_track', title: '更新你的進度指標', desc: '記錄今天的關鍵數字。' },
  ];

  const days: RoadmapDay[] = [];

  for (let day = 1; day <= 30; day++) {
    const week = weekThemes.find((w) => day >= w.range[0] && day <= w.range[1])!;
    const dayInWeek = ((day - 1) % 7) + 1;

    // Pick tasks deterministically based on day number + intensity
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
      title: `第 ${day} 天 · ${week.skill}`,
      tasks,
    });
  }

  return days;
}
