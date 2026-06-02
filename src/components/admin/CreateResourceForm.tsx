'use client';

// Admin form for adding a new resource card. Writes directly to the
// `resources` table — RLS allows this only for users in admin_users
// (admins.sql). On success, refreshes the server component list above.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function CreateResourceForm() {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [titleEn, setTitleEn] = useState('');
  const [titleZh, setTitleZh] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descZh, setDescZh] = useState('');
  const [thumb, setThumb] = useState('');
  const [link, setLink] = useState('');
  const [tag, setTag] = useState('');
  const [order, setOrder] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleEn.trim() && !titleZh.trim()) {
      setFeedback({ kind: 'err', text: 'Provide at least one title' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);

    const payload: Record<string, unknown> = {
      title_en: titleEn.trim() || null,
      title_zh: titleZh.trim() || null,
      description_en: descEn.trim() || null,
      description_zh: descZh.trim() || null,
      thumbnail_url: thumb.trim() || null,
      link_url: link.trim() || null,
      tag: tag.trim() ? tag.trim().toUpperCase() : null,
      display_order: order ? parseInt(order, 10) || 0 : 0,
    };

    const { error } = await supabase.from('resources').insert(payload);
    setSubmitting(false);
    if (error) {
      setFeedback({ kind: 'err', text: error.message });
      return;
    }
    setFeedback({ kind: 'ok', text: t.admin.resources.success });
    setTitleEn('');
    setTitleZh('');
    setDescEn('');
    setDescZh('');
    setThumb('');
    setLink('');
    setTag('');
    setOrder('');
    startTransition(() => router.refresh());
  };

  const inputCls =
    'w-full h-11 px-4 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 transition-colors';

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="r-title-en" className="sr-only">{t.admin.resources.titleEnLabel}</label>
          <input
            id="r-title-en"
            type="text"
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
            placeholder={t.admin.resources.titleEnLabel}
            className={inputCls}
            maxLength={200}
          />
        </div>
        <div>
          <label htmlFor="r-title-zh" className="sr-only">{t.admin.resources.titleZhLabel}</label>
          <input
            id="r-title-zh"
            type="text"
            value={titleZh}
            onChange={(e) => setTitleZh(e.target.value)}
            placeholder={t.admin.resources.titleZhLabel}
            className={inputCls}
            maxLength={200}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="r-desc-en" className="sr-only">{t.admin.resources.descriptionEnLabel}</label>
          <textarea
            id="r-desc-en"
            value={descEn}
            onChange={(e) => setDescEn(e.target.value)}
            placeholder={t.admin.resources.descriptionEnLabel}
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 transition-colors resize-none"
            maxLength={500}
          />
        </div>
        <div>
          <label htmlFor="r-desc-zh" className="sr-only">{t.admin.resources.descriptionZhLabel}</label>
          <textarea
            id="r-desc-zh"
            value={descZh}
            onChange={(e) => setDescZh(e.target.value)}
            placeholder={t.admin.resources.descriptionZhLabel}
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-bg-raised border border-line-strong text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 transition-colors resize-none"
            maxLength={500}
          />
        </div>
      </div>

      <div>
        <label htmlFor="r-thumb" className="sr-only">{t.admin.resources.thumbnailLabel}</label>
        <input
          id="r-thumb"
          type="url"
          value={thumb}
          onChange={(e) => setThumb(e.target.value)}
          placeholder={t.admin.resources.thumbnailLabel}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="r-link" className="sr-only">{t.admin.resources.linkLabel}</label>
        <input
          id="r-link"
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={t.admin.resources.linkLabel}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="r-tag" className="sr-only">{t.admin.resources.tagLabel}</label>
          <input
            id="r-tag"
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
            placeholder={t.admin.resources.tagLabel}
            className={cn(inputCls, 'font-mono uppercase tracking-wider')}
            maxLength={40}
          />
        </div>
        <div>
          <label htmlFor="r-order" className="sr-only">{t.admin.resources.orderLabel}</label>
          <input
            id="r-order"
            type="number"
            inputMode="numeric"
            step="1"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            placeholder={t.admin.resources.orderLabel}
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg font-medium text-sm transition-all',
            submitting
              ? 'bg-bg-raised text-ink-dim cursor-not-allowed'
              : 'bg-accent text-white hover:bg-accent-hover'
          )}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {submitting ? t.admin.resources.submitting : t.admin.resources.submit}
        </button>
        {feedback && (
          <span className={cn('text-xs font-mono', feedback.kind === 'ok' ? 'text-success' : 'text-danger')}>
            {feedback.text}
          </span>
        )}
      </div>
    </form>
  );
}
