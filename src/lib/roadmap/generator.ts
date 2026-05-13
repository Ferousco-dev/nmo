import type { Tenure, Pathway, Goal, Intensity, RoadmapDay } from '@/types';

// =====================================================================
// 男兒幫 30 天重置計畫 — single fixed roadmap for every user.
//
// Source of truth: client xlsx "男兒幫_30天重置計畫_更新版" (2026-05-12).
// The questionnaire still runs to capture the user's archetype / goal /
// intensity (we keep those columns for analytics), but the answers no
// longer change the tasks they see. Everyone walks the same 30 days.
//
// Three pathway variants are coming later — once the client delivers
// them they'll plug into the same shape this generator already returns.
// =====================================================================

interface FixedDay {
  body: string;     // 身體啟動 — wake-up exercise
  videoUrl: string; // 每日影片 — Skool classroom lesson link
}

const VIDEO_IDS: string[] = [
  '2dc22ef36691452c8cefd05adda490cb', // Day 1
  'fb1331df53ed4d4e9508c931690e7950',
  '7672421e958545da83f060b2f92575b6',
  '6698d2e124c943a0863225f075076e48',
  '23910993b436487c902755a2ff6c5f85',
  '497e3cfc447c4369a352a992f18e0492',
  'caf5cb27a6b54f09af5eebd1903a0fb0',
  '10c31b3b317343afa966b98cb16a930b', // Day 8
  '91a125f79ce24ff3b6903d0753b1193b',
  '20ac077e882846728f8cfea0c36ee8ef',
  'a58ae53b547f41f1872ed17d968d9578',
  'e83b5c86cc57437fa1d43620696b7ee0',
  'a6b3683549ed4ffea11e53787487cd6a',
  '2d9ba1f1603c4d64891dfdcd9e161240',
  '98d6facffb064464aec1fd49473b5280', // Day 15
  '6db946ad9f884cbbaeb62500b1f47d03',
  'abda57a2bc0f429780e7ffd05aecf61d',
  '6a7b0b0734f743e5abf1b28273fcb621',
  'eb60ac3f35124b3bb6390ca1f7c3baf6',
  'fa14001fed7c488485dada37cea46556',
  '53fc1180a1634973b4745ac690b4109b',
  'c084058ea719415aa0ce4fc6755af9da', // Day 22
  'cccae82ef2e74cc498718f292b444771',
  '873bc6fe5cf74287ae662c83b7616e29',
  '45d8a037fa8a472f8ce66bbfa19ade9a',
  '8f32e9ff31614dec995fa29b5862e27f',
  'f8079fe116eb4278b833d0f4147cc7b7',
  'c347ab2b3ea14435a92d421c77977fa3',
  '1749044119d345fe91bfd2c090486015',
  '6772ab89ff84455799b2ac94bcb913d7', // Day 30
];

function bodyForDay(day: number): string {
  if (day <= 7) return '10 下伏地挺身';
  if (day <= 14) return '15 下伏地挺身 + 15 下深蹲';
  if (day <= 21) return '20 下伏地挺身 + 20 下深蹲';
  return '25 下伏地挺身 + 25 下深蹲 + 30 秒平板撐';
}

function videoUrlForDay(day: number): string {
  const id = VIDEO_IDS[day - 1];
  return `https://www.skool.com/nmo/classroom/b92c3c82?md=${id}`;
}

const TODAY_TASK_DESC = '在社群發文，寫下今日目標並完成它（和身體、事業或紀律相關的小任務）。';
const BROTHER_LINK_DESC = '按讚並支持另一位兄弟的貼文。';

// =====================================================================
// Track label — a single unified label since archetypes no longer
// branch the content. Legacy keys are mapped to the same label so old
// rows in `profiles.track_assigned` still render cleanly.
// =====================================================================
const UNIFIED_LABEL = '男兒幫 30 天重置計畫';

export const TRACK_NAMES_ZH: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  {
    get: () => UNIFIED_LABEL,
  }
);

// `assignTrack` is kept so existing callers compile. The questionnaire
// passes its result here but the value is now cosmetic — the generator
// below ignores it.
export function assignTrack(
  _pathwayOrTenure: Pathway | Tenure,
  _goal: Goal,
  _intensity: Intensity
): string {
  return 'unified_v1';
}

// =====================================================================
// 30-day task generator. Signature kept for backwards compatibility,
// arguments ignored — every user gets the same plan.
// =====================================================================
export function generateRoadmap(
  _pathwayOrTenure?: Pathway | Tenure,
  _goal?: Goal,
  _intensity?: Intensity
): RoadmapDay[] {
  const days: RoadmapDay[] = [];

  for (let day = 1; day <= 30; day++) {
    const body = bodyForDay(day);
    const videoUrl = videoUrlForDay(day);

    days.push({
      day,
      title: `第 ${day} 天`,
      tasks: [
        {
          id: `day${day}_body`,
          title: '身體啟動',
          description: `起床後先完成：${body}。`,
        },
        {
          id: `day${day}_video`,
          title: '觀看今日影片',
          description: '進入 NMO 教室，看完今天的指定影片。',
          skool_lesson_url: videoUrl,
        },
        {
          id: `day${day}_task`,
          title: '今日任務',
          description: TODAY_TASK_DESC,
        },
        {
          id: `day${day}_brother`,
          title: '兄弟連結',
          description: BROTHER_LINK_DESC,
        },
      ],
    });
  }

  return days;
}
