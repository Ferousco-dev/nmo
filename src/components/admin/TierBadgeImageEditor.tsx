'use client';

// Per-tier-badge image editor. Lives inline next to each tier row on
// /admin/badges. Lets a super-admin swap the AI/Lucide icon for a
// custom uploaded image (or remove a previously-uploaded one).
//
// Reuses the same Cloudinary signature flow as BadgeUploadForm:
//   1. POST /api/admin/badges/upload-signature → get signed params
//   2. Upload file direct to Cloudinary (bytes never touch our server)
//   3. RPC admin_update_badge_image with the resulting secure_url
//
// Gated on the server: the RPC raises 'not_super_admin' for anyone
// else, so even if a regular admin sees the UI nothing breaks.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const MAX_BYTES = 1_048_576; // 1 MB
const ACCEPT = 'image/png,image/jpeg,image/jpg,image/svg+xml,image/webp';

type State =
  | { kind: 'idle' }
  | { kind: 'uploading'; step: 'sign' | 'cloudinary' | 'update' }
  | { kind: 'err'; message: string };

interface Props {
  badgeId: string;
  badgeKey: string;
  currentImageUrl: string | null;
}

export function TierBadgeImageEditor({ badgeId, badgeKey, currentImageUrl }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });

  const submitting = state.kind === 'uploading';
  const error = state.kind === 'err' ? state.message : null;

  const onPickFile = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setState({ kind: 'err', message: 'File too large (max 1 MB).' });
      return;
    }
    void upload(file);
  };

  const upload = async (file: File) => {
    // 1. Signature
    setState({ kind: 'uploading', step: 'sign' });
    let signed: {
      cloudName: string;
      apiKey: string;
      timestamp: number;
      folder: string;
      publicId: string;
      signature: string;
    };
    try {
      const r = await fetch('/api/admin/badges/upload-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hint: `tier-${badgeKey}` }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setState({ kind: 'err', message: j?.error || 'signature_failed' });
        return;
      }
      signed = j;
    } catch (e) {
      setState({ kind: 'err', message: (e as Error).message });
      return;
    }

    // 2. Direct upload to Cloudinary
    setState({ kind: 'uploading', step: 'cloudinary' });
    let secureUrl: string;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('api_key', signed.apiKey);
      fd.append('timestamp', String(signed.timestamp));
      fd.append('folder', signed.folder);
      fd.append('public_id', signed.publicId);
      fd.append('signature', signed.signature);
      const up = await fetch(
        `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
        { method: 'POST', body: fd },
      );
      const j = await up.json();
      if (!up.ok || !j.secure_url) {
        setState({ kind: 'err', message: j?.error?.message || 'cloudinary_failed' });
        return;
      }
      secureUrl = j.secure_url as string;
    } catch (e) {
      setState({ kind: 'err', message: (e as Error).message });
      return;
    }

    // 3. Update the badge row via RPC
    setState({ kind: 'uploading', step: 'update' });
    const { data, error: rpcErr } = await supabase.rpc('admin_update_badge_image', {
      p_badge_id: badgeId,
      p_image_url: secureUrl,
    });
    if (rpcErr || !(data as { success?: boolean } | null)?.success) {
      setState({
        kind: 'err',
        message: rpcErr?.message || 'update_failed',
      });
      return;
    }

    setState({ kind: 'idle' });
    router.refresh();
  };

  const onRemove = async () => {
    setState({ kind: 'uploading', step: 'update' });
    const { data, error: rpcErr } = await supabase.rpc('admin_update_badge_image', {
      p_badge_id: badgeId,
      p_image_url: null,
    });
    if (rpcErr || !(data as { success?: boolean } | null)?.success) {
      setState({ kind: 'err', message: rpcErr?.message || 'remove_failed' });
      return;
    }
    setState({ kind: 'idle' });
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1 shrink-0 max-w-[140px] sm:max-w-none">
      <div className="flex items-center gap-1 sm:gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          disabled={submitting}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-line bg-bg-raised text-xs font-medium text-ink hover:bg-bg-hover disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : currentImageUrl ? (
            <Upload className="h-3.5 w-3.5" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          {submitting
            ? state.kind === 'uploading' && state.step === 'sign'
              ? 'Signing…'
              : state.kind === 'uploading' && state.step === 'cloudinary'
                ? 'Uploading…'
                : 'Saving…'
            : currentImageUrl
              ? 'Replace'
              : 'Upload'}
        </button>
        {currentImageUrl && !submitting && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-line bg-bg-raised text-xs text-danger hover:bg-danger/10"
            title="Remove custom image"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {error && (
        <div className="text-[10px] font-mono text-danger max-w-[160px] truncate" title={error}>
          {error}
        </div>
      )}
    </div>
  );
}
