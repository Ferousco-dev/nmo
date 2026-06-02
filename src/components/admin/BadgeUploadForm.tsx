'use client';

// Two-step form for creating a custom (admin-uploaded) badge:
//   1. POST /api/admin/badges/upload-signature → get one-time Cloudinary
//      signature for a fresh public_id
//   2. POST file directly to Cloudinary (bytes never touch our server)
//   3. RPC admin_create_badge with the resulting secure_url
//
// Errors at any step are surfaced as a banner; the form stays editable
// so the admin can retry without re-picking the file.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Upload, Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

const MAX_BYTES = 1_048_576; // 1 MB
const ACCEPT = 'image/png,image/jpeg,image/jpg,image/svg+xml,image/webp';

type Submission =
  | { kind: 'idle' }
  | { kind: 'uploading'; step: 'sign' | 'cloudinary' | 'create' }
  | { kind: 'ok' }
  | { kind: 'err'; message: string };

export function BadgeUploadForm() {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameZh, setNameZh] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descZh, setDescZh] = useState('');
  const [color, setColor] = useState('#a855f7');
  const [oneOfOne, setOneOfOne] = useState(false);
  const [state, setState] = useState<Submission>({ kind: 'idle' });

  const pickFile = (f: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setState({ kind: 'err', message: t.admin.badges.errorTooLarge });
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setState({ kind: 'idle' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setState({ kind: 'err', message: t.admin.badges.errorNoFile });
      return;
    }
    const slugKey = key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    if (!slugKey || !nameEn.trim() || !nameZh.trim()) {
      setState({ kind: 'err', message: t.admin.badges.errorRequired });
      return;
    }

    // 1. Signature
    setState({ kind: 'uploading', step: 'sign' });
    let signed: {
      cloudName: string; apiKey: string; timestamp: number;
      folder: string; publicId: string; signature: string;
    };
    try {
      const r = await fetch('/api/admin/badges/upload-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hint: slugKey }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setState({ kind: 'err', message: j?.error || 'signature_failed' });
        return;
      }
      signed = j;
    } catch (err) {
      setState({ kind: 'err', message: (err as Error).message });
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
      const upJson = await up.json();
      if (!up.ok || !upJson.secure_url) {
        setState({ kind: 'err', message: upJson?.error?.message || 'cloudinary_upload_failed' });
        return;
      }
      secureUrl = upJson.secure_url as string;
    } catch (err) {
      setState({ kind: 'err', message: (err as Error).message });
      return;
    }

    // 3. Create the badge row via RPC
    setState({ kind: 'uploading', step: 'create' });
    const { data, error } = await supabase.rpc('admin_create_badge', {
      p_key: slugKey,
      p_name_en: nameEn.trim(),
      p_name_zh: nameZh.trim(),
      p_description_en: descEn.trim() || null,
      p_description_zh: descZh.trim() || null,
      p_icon: null,
      p_image_url: secureUrl,
      p_color: color,
      p_category: 'special',
      p_is_one_of_one: oneOfOne,
    });
    if (error || !(data as { success?: boolean } | null)?.success) {
      const err = error?.message || (data as { error?: string } | null)?.error || 'create_failed';
      setState({ kind: 'err', message: err });
      return;
    }

    setState({ kind: 'ok' });
    router.push('/admin/badges');
    router.refresh();
  };

  const submitting = state.kind === 'uploading';

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* File picker + preview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="badge-file" className="text-sm font-medium text-ink">
            {t.admin.badges.imageLabel}
          </label>
          <span className="text-xs text-ink-dim font-mono">
            {t.admin.badges.imageHint}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'h-20 w-20 sm:h-24 sm:w-24 rounded-2xl border-2 border-dashed flex items-center justify-center transition-colors shrink-0',
              previewUrl ? 'border-line bg-bg-raised' : 'border-line hover:border-accent/50 hover:bg-bg-hover',
            )}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="preview"
                className="h-16 w-16 sm:h-20 sm:w-20 object-contain rounded-xl"
              />
            ) : (
              <ImagePlus className="h-8 w-8 text-ink-dim" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <input
              ref={fileInputRef}
              id="badge-file"
              type="file"
              accept={ACCEPT}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <div className="text-sm text-ink truncate font-medium">
              {file ? file.name : t.admin.badges.noFile}
            </div>
            {file && (
              <button
                type="button"
                onClick={() => pickFile(null)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-ink-dim hover:text-danger"
              >
                <X className="h-3 w-3" /> {t.admin.badges.remove}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Identifiers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldText
          id="badge-key" label={t.admin.badges.keyLabel}
          value={key} onChange={setKey} placeholder="special_top_dog"
          hint={t.admin.badges.keyHint}
        />
        <FieldText
          id="badge-color" label={t.admin.badges.colorLabel}
          value={color} onChange={setColor} placeholder="#a855f7"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldText id="badge-name-en" label="Name (EN)" value={nameEn} onChange={setNameEn} placeholder="Top Dog" />
        <FieldText id="badge-name-zh" label="名稱 (中)" value={nameZh} onChange={setNameZh} placeholder="頂尖大將" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldText id="badge-desc-en" label="Description (EN)" value={descEn} onChange={setDescEn} />
        <FieldText id="badge-desc-zh" label="描述 (中)" value={descZh} onChange={setDescZh} />
      </div>

      {/* 1-of-1 toggle */}
      <label className="flex items-start gap-3 p-3 rounded-lg border border-line bg-bg-raised cursor-pointer hover:border-line-strong">
        <input
          type="checkbox"
          checked={oneOfOne}
          onChange={(e) => setOneOfOne(e.target.checked)}
          className="h-4 w-4 mt-0.5 accent-accent"
        />
        <span className="flex-1 text-sm">
          <span className="font-medium text-ink">{t.admin.badges.oneOfOneLabel}</span>
          <span className="block text-xs text-ink-muted mt-0.5">
            {t.admin.badges.oneOfOneHint}
          </span>
        </span>
      </label>

      {/* Submit + status */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={submitting || !file || !key.trim() || !nameEn.trim() || !nameZh.trim()}
          className={cn(
            'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg font-medium text-sm transition-all',
            submitting || !file || !key.trim() || !nameEn.trim() || !nameZh.trim()
              ? 'bg-bg-raised text-ink-dim cursor-not-allowed'
              : 'bg-accent text-white hover:bg-accent-hover',
          )}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {submitting
            ? state.step === 'sign' ? t.admin.badges.signing
              : state.step === 'cloudinary' ? t.admin.badges.uploading
              : t.admin.badges.creating
            : t.admin.badges.submit}
        </button>
        {state.kind === 'err' && (
          <span className="text-xs font-mono text-danger truncate">{state.message}</span>
        )}
      </div>
    </form>
  );
}

function FieldText({
  id, label, value, onChange, placeholder, hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 px-4 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
      />
      {hint && <p className="text-[11px] text-ink-dim mt-1">{hint}</p>}
    </div>
  );
}
