'use client';

// Admin per-member roadmap editor. Lets Jack (or any admin) view a
// single member's 30-day plan, inline-edit every task, add new ones,
// and delete. All writes go through /api/admin/members/[id]/tasks
// (POST + GET) and /api/admin/members/[id]/tasks/[taskId] (PATCH +
// DELETE), all gated by SECURITY DEFINER RPCs with is_admin().

import { useState, useTransition } from 'react';
import { Loader2, Plus, Save, Trash2, Pencil, X, CheckCircle2, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskRow {
  id: string;
  user_id: string;
  day_number: number;
  task_id: string;
  task_title: string;
  task_description: string | null;
  skool_lesson_url: string | null;
  is_completed: boolean;
}

interface Props {
  userId: string;
  memberName: string;
  initialTasks: TaskRow[];
}

interface DraftRow {
  task_title: string;
  task_description: string;
  skool_lesson_url: string;
  day_number: number;
}

function emptyDraft(day: number): DraftRow {
  return { task_title: '', task_description: '', skool_lesson_url: '', day_number: day };
}

export function MemberRoadmapEditor({ userId, memberName, initialTasks }: Props) {
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftRow | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [addingForDay, setAddingForDay] = useState<number | null>(null);
  const [newDraft, setNewDraft] = useState<DraftRow>(emptyDraft(1));
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [_isPending, startTransition] = useTransition();

  const flashSaved = (id: string) => {
    setSavedFlash(id);
    setTimeout(() => setSavedFlash((s) => (s === id ? null : s)), 1400);
  };

  // Tasks grouped by day, days 1–30 always present even when empty
  const byDay = new Map<number, TaskRow[]>();
  for (let d = 1; d <= 30; d++) byDay.set(d, []);
  for (const t of tasks) byDay.get(t.day_number)?.push(t);

  const startEdit = (t: TaskRow) => {
    setEditingId(t.id);
    setEditingDraft({
      task_title: t.task_title,
      task_description: t.task_description ?? '',
      skool_lesson_url: t.skool_lesson_url ?? '',
      day_number: t.day_number,
    });
    setErrorMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingDraft(null);
  };

  const saveEdit = async (t: TaskRow) => {
    if (!editingDraft) return;
    if (!editingDraft.task_title.trim()) {
      setErrorMsg('Task title is required');
      return;
    }
    setBusyTaskId(t.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/members/${userId}/tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_number: editingDraft.day_number,
          task_title: editingDraft.task_title.trim(),
          task_description: editingDraft.task_description.trim() || null,
          skool_lesson_url: editingDraft.skool_lesson_url.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data?.error ?? 'Update failed');
        return;
      }
      // Optimistic local update with the row the RPC returned
      const updated = data.task as TaskRow;
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...updated } : x)));
      flashSaved(t.id);
      cancelEdit();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusyTaskId(null);
    }
  };

  const remove = async (t: TaskRow) => {
    if (!confirm(`Delete this task from Day ${t.day_number}?\n\n"${t.task_title}"`)) return;
    setBusyTaskId(t.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/members/${userId}/tasks/${t.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data?.error ?? 'Delete failed');
        return;
      }
      setTasks((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusyTaskId(null);
    }
  };

  const startAdd = (day: number) => {
    setAddingForDay(day);
    setNewDraft(emptyDraft(day));
    setErrorMsg(null);
  };

  const cancelAdd = () => {
    setAddingForDay(null);
    setNewDraft(emptyDraft(1));
  };

  const submitAdd = async () => {
    if (!newDraft.task_title.trim()) {
      setErrorMsg('Task title is required');
      return;
    }
    setCreating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/members/${userId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_number: newDraft.day_number,
          task_title: newDraft.task_title.trim(),
          task_description: newDraft.task_description.trim() || null,
          skool_lesson_url: newDraft.skool_lesson_url.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data?.error ?? 'Create failed');
        return;
      }
      setTasks((prev) => [...prev, data.task as TaskRow]);
      cancelAdd();
      startTransition(() => {});
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Network error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card-premium p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs font-mono uppercase tracking-wider text-ink-muted">
            Editing roadmap for
          </p>
          <p className="font-display text-lg font-bold truncate">{memberName}</p>
        </div>
        <p className="text-xs text-ink-muted shrink-0">
          {tasks.length} task{tasks.length === 1 ? '' : 's'} total · spread across 30 days
        </p>
      </div>

      {errorMsg && (
        <div className="card-premium p-3 border-red-500/40 bg-red-500/5 text-sm text-red-400 font-medium">
          {errorMsg}
        </div>
      )}

      {Array.from(byDay.entries()).map(([day, dayTasks]) => (
        <div key={day} className="card-premium p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-accent/10 border border-accent/30 text-accent font-display text-base font-bold flex items-center justify-center">
                {day}
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted">
                Day {day}
              </p>
              <span className="text-xs text-ink-dim">
                {dayTasks.length} task{dayTasks.length === 1 ? '' : 's'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => startAdd(day)}
              className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11px] font-medium border border-accent/30 text-accent hover:bg-accent/10 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add task
            </button>
          </div>

          {dayTasks.length === 0 && addingForDay !== day && (
            <p className="text-xs text-ink-dim italic">No tasks for this day.</p>
          )}

          <ul className="space-y-2">
            {dayTasks.map((t) =>
              editingId === t.id && editingDraft ? (
                <li
                  key={t.id}
                  className="p-3 rounded-lg border border-accent/40 bg-accent/5 space-y-2"
                >
                  <input
                    type="text"
                    value={editingDraft.task_title}
                    onChange={(e) =>
                      setEditingDraft({ ...editingDraft, task_title: e.target.value })
                    }
                    placeholder="Task title"
                    className="w-full px-3 h-9 rounded-md bg-bg-raised/60 border border-line text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none"
                  />
                  <textarea
                    value={editingDraft.task_description}
                    onChange={(e) =>
                      setEditingDraft({ ...editingDraft, task_description: e.target.value })
                    }
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full px-3 py-2 rounded-md bg-bg-raised/60 border border-line text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none resize-none"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="url"
                      value={editingDraft.skool_lesson_url}
                      onChange={(e) =>
                        setEditingDraft({ ...editingDraft, skool_lesson_url: e.target.value })
                      }
                      placeholder="Skool lesson URL (optional)"
                      className="flex-1 min-w-[200px] px-3 h-9 rounded-md bg-bg-raised/60 border border-line text-xs font-mono focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none"
                    />
                    <select
                      value={editingDraft.day_number}
                      onChange={(e) =>
                        setEditingDraft({ ...editingDraft, day_number: parseInt(e.target.value, 10) })
                      }
                      className="px-3 h-9 rounded-md bg-bg-raised/60 border border-line text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none"
                    >
                      {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          Day {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => saveEdit(t)}
                      disabled={busyTaskId === t.id}
                      className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium bg-accent text-bg hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                      {busyTaskId === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={busyTaskId === t.id}
                      className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium border border-line text-ink-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={t.id}
                  className={cn(
                    'group p-3 rounded-lg border bg-bg-raised/30 transition-colors',
                    savedFlash === t.id
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-line hover:border-accent/40'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate flex items-center gap-2">
                        {t.task_title}
                        {t.is_completed && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            done
                          </span>
                        )}
                        {savedFlash === t.id && (
                          <span className="text-[10px] text-emerald-400 font-medium">saved ✓</span>
                        )}
                      </p>
                      {t.task_description && (
                        <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">
                          {t.task_description}
                        </p>
                      )}
                      {t.skool_lesson_url && (
                        <a
                          href={t.skool_lesson_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-accent font-mono mt-1 hover:underline truncate max-w-full"
                        >
                          <Link2 className="h-3 w-3 shrink-0" />
                          {t.skool_lesson_url}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        className="p-1.5 rounded-md text-ink-muted hover:text-accent hover:bg-accent/10 transition-colors"
                        aria-label="Edit task"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(t)}
                        disabled={busyTaskId === t.id}
                        className="p-1.5 rounded-md text-ink-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        aria-label="Delete task"
                      >
                        {busyTaskId === t.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              )
            )}

            {addingForDay === day && (
              <li className="p-3 rounded-lg border border-accent/40 bg-accent/5 space-y-2">
                <input
                  type="text"
                  value={newDraft.task_title}
                  onChange={(e) => setNewDraft({ ...newDraft, task_title: e.target.value })}
                  placeholder="New task title"
                  className="w-full px-3 h-9 rounded-md bg-bg-raised/60 border border-line text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none"
                  autoFocus
                />
                <textarea
                  value={newDraft.task_description}
                  onChange={(e) => setNewDraft({ ...newDraft, task_description: e.target.value })}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-md bg-bg-raised/60 border border-line text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none resize-none"
                />
                <input
                  type="url"
                  value={newDraft.skool_lesson_url}
                  onChange={(e) => setNewDraft({ ...newDraft, skool_lesson_url: e.target.value })}
                  placeholder="Skool lesson URL (optional)"
                  className="w-full px-3 h-9 rounded-md bg-bg-raised/60 border border-line text-xs font-mono focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none"
                />
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={submitAdd}
                    disabled={creating}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium bg-accent text-bg hover:bg-accent/90 transition-colors disabled:opacity-50"
                  >
                    {creating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Add to Day {day}
                  </button>
                  <button
                    type="button"
                    onClick={cancelAdd}
                    disabled={creating}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium border border-line text-ink-muted hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </div>
              </li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}
