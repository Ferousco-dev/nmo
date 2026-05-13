// One-shot self-healing roadmap regenerator.
//
// The 男兒幫 30-day plan rewrite changed both the *task content* and the
// *task_id pattern* (now: day{N}_(body|video|task|brother)). Anyone who
// completed the questionnaire BEFORE this change still has the legacy
// rows in user_tasks — they'd see stale content with no way to refresh.
//
// This module is called from the dashboard / roadmap server components
// on every load. It runs a cheap signature check (does the user have
// the expected 120 rows AND do their IDs match the new pattern?). If
// the answer is no, it wipes and reinserts in a single transaction.
//
// Completion state from the old plan is intentionally NOT migrated —
// the days are different, the lessons are different, so reusing old
// checkmarks would be misleading.

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateRoadmap } from './generator';

const EXPECTED_TASK_COUNT = 120; // 30 days × 4 tasks
const NEW_ID_PATTERN = /^day([1-9]|[12][0-9]|30)_(body|video|task|brother)$/;

interface TaskRow {
  task_id: string;
}

/**
 * Ensures the user has the current 30-day plan. Returns true if it
 * had to regenerate, false if everything was already up-to-date.
 *
 * Safe to call on every page load — the precheck is one SELECT and
 * does nothing when the data is already correct.
 */
export async function ensureCurrentRoadmap(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('user_tasks')
    .select('task_id')
    .eq('user_id', userId);

  const rows = (existing ?? []) as TaskRow[];
  const allMatch = rows.length === EXPECTED_TASK_COUNT &&
    rows.every((r) => NEW_ID_PATTERN.test(r.task_id));

  if (allMatch) return false;

  // Stale (or partial / empty). Wipe and reinsert.
  await supabase.from('user_tasks').delete().eq('user_id', userId);

  const roadmap = generateRoadmap();
  const newRows = roadmap.flatMap((day) =>
    day.tasks.map((task) => ({
      user_id: userId,
      day_number: day.day,
      task_id: task.id,
      task_title: task.title,
      task_description: task.description,
      skool_lesson_url: task.skool_lesson_url ?? null,
    }))
  );

  if (newRows.length > 0) {
    await supabase
      .from('user_tasks')
      .upsert(newRows, { onConflict: 'user_id,task_id', ignoreDuplicates: true });
  }

  return true;
}
