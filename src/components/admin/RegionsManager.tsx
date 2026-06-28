'use client';

// Admin UI for managing geographic regions (Taipei, Hong Kong, …).
// Lets Jack create / rename / delete regions and see member counts.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, Pencil, MapPin, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RegionRow {
  id: string;
  name: string;
  display_order: number;
  member_count: number;
  leader_count: number;
}

export function RegionsManager({ initialRegions }: { initialRegions: RegionRow[] }) {
  const router = useRouter();
  const [regions, setRegions] = useState<RegionRow[]>(initialRegions);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const create = async () => {
    if (!newName.trim()) {
      setError('Region name is required');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.error || 'Create failed');
        return;
      }
      const row = data.region;
      setRegions((prev) => [
        ...prev,
        { id: row.id, name: row.name, display_order: row.display_order, member_count: 0, leader_count: 0 },
      ]);
      setNewName('');
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (r: RegionRow) => {
    setEditingId(r.id);
    setEditingName(r.name);
    setError(null);
  };

  const saveEdit = async (r: RegionRow) => {
    if (!editingName.trim()) {
      setError('Region name is required');
      return;
    }
    setBusyId(r.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/regions/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.error || 'Rename failed');
        return;
      }
      setRegions((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, name: data.region.name } : x))
      );
      setEditingId(null);
    } catch {
      setError('Network error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: RegionRow) => {
    const warn =
      r.member_count + r.leader_count > 0
        ? `${r.name} has ${r.member_count} members and ${r.leader_count} leaders assigned.\nDelete anyway? They'll just lose their region tag.`
        : `Delete region "${r.name}"?`;
    if (!confirm(warn)) return;
    setBusyId(r.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/regions/${r.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.error || 'Delete failed');
        return;
      }
      setRegions((prev) => prev.filter((x) => x.id !== r.id));
      refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Add new */}
      <div className="card-premium p-4 sm:p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted mb-3">
          New region
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Taoyuan, Singapore, Online…"
            className="flex-1 min-w-[200px] px-3 h-10 rounded-lg bg-bg-raised/60 border border-line text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-medium',
              'bg-accent text-bg hover:bg-accent/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add region
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400 font-medium">{error}</p>}
      </div>

      {/* List */}
      <div className="card-premium p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted">
            Regions ({regions.length})
          </h2>
        </div>
        {regions.length === 0 ? (
          <p className="text-sm text-ink-muted italic py-4">No regions yet — add one above.</p>
        ) : (
          <ul className="space-y-2">
            {regions.map((r) =>
              editingId === r.id ? (
                <li
                  key={r.id}
                  className="p-3 rounded-lg border border-accent/40 bg-accent/5 flex items-center gap-2 flex-wrap"
                >
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 min-w-[200px] px-3 h-9 rounded-md bg-bg-raised/60 border border-line text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(r)}
                  />
                  <button
                    type="button"
                    onClick={() => saveEdit(r)}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-xs font-medium bg-accent text-bg hover:bg-accent/90 disabled:opacity-50"
                  >
                    {busyId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-xs font-medium border border-line text-ink-muted hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </li>
              ) : (
                <li
                  key={r.id}
                  className="p-3 rounded-lg border border-line bg-bg-raised/30 flex items-center gap-3"
                >
                  <MapPin className="h-4 w-4 text-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink truncate">{r.name}</p>
                    <p className="text-[11px] text-ink-muted">
                      {r.member_count} member{r.member_count === 1 ? '' : 's'} ·{' '}
                      {r.leader_count} leader{r.leader_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="p-1.5 rounded-md text-ink-muted hover:text-accent hover:bg-accent/10"
                      aria-label="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      disabled={busyId === r.id}
                      className="p-1.5 rounded-md text-ink-muted hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      aria-label="Delete"
                    >
                      {busyId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </div>

      <p className="text-xs text-ink-muted">
        Assign members to a region from their member detail page
        (<span className="font-mono">/admin/members/[id]</span>). Leaders are assigned via the
        family-tree manager.
      </p>
    </div>
  );
}
