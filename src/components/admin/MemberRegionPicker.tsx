'use client';

// Inline region selector for a single member. Persists via PUT
// /api/admin/members/[id]/region; optimistic UI with rollback on error.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MapPin } from 'lucide-react';

interface RegionOption {
  id: string;
  name: string;
}

interface Props {
  userId: string;
  initialRegionId: string | null;
  regions: RegionOption[];
}

export function MemberRegionPicker({ userId, initialRegionId, regions }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<string>(initialRegionId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onChange = async (next: string) => {
    const prev = value;
    setValue(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/members/${userId}/region`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_id: next || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.error || 'Save failed');
        setValue(prev);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    } catch {
      setError('Network error');
      setValue(prev);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <MapPin className="h-4 w-4 text-accent shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
        className="px-3 h-9 rounded-md bg-bg-raised/60 border border-line text-sm focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none disabled:opacity-50"
      >
        <option value="">— No region —</option>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {saving && <Loader2 className="h-3.5 w-3.5 text-ink-muted animate-spin" />}
      {saved && <span className="text-xs text-emerald-400 font-medium">saved ✓</span>}
      {error && <span className="text-xs text-red-400 font-medium">{error}</span>}
    </div>
  );
}
