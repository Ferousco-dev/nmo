'use client';

// Admin-only widget on /admin: store and rotate the third-party
// credentials the platform needs at runtime — Apify token + the
// Skool watcher account email/password. Values land in the
// `app_settings` table via a SECURITY DEFINER RPC.
//
// Display safety: the card NEVER renders a previously-stored value
// in cleartext. It calls admin_list_settings() which returns just
// the last 4 chars + length + when-set. The user types a new value
// to rotate; existing values stay opaque.

import { useCallback, useEffect, useState } from 'react';
import { Settings as SettingsIcon, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const KEYS = [
  {
    key: 'apify_token',
    label: 'Apify API token',
    placeholder: 'apify_api_…',
    help: 'From console.apify.com → Settings → Integrations. Used to run the members scraper actor.',
  },
  {
    key: 'skool_email',
    label: 'Skool watcher email',
    placeholder: 'watcher@example.com',
    help: 'Email of the Skool account the actor logs in as. Must be a member of NMO.',
    type: 'email' as const,
  },
  {
    key: 'skool_password',
    label: 'Skool watcher password',
    placeholder: '••••••••',
    help: 'Stored encrypted at rest in Supabase; never sent to the browser.',
  },
  {
    key: 'skool_auth_token',
    label: 'Skool auth_token (cookie JWT)',
    placeholder: 'eyJhbGc…',
    help: 'JWT from the watcher account\'s skool.com session (DevTools → Application → Cookies → auth_token). Lets the server call Skool\'s data routes directly — sub-second per page, no Apify quota. Expires ~yearly; rotate when 401s appear.',
  },
] as const;

interface SettingMeta {
  key: string;
  last4: string | null;
  length: number | null;
  updated_at: string | null;
  updated_by: string | null;
}

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function IntegrationSettingsCard() {
  const supabase = createClient();
  const [metas, setMetas] = useState<Record<string, SettingMeta>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    Record<string, { kind: 'ok' | 'err'; text: string } | null>
  >({});

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_settings');
    if (error) return;
    const next: Record<string, SettingMeta> = {};
    for (const row of (data ?? []) as SettingMeta[]) next[row.key] = row;
    setMetas(next);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async (key: string) => {
    const value = (drafts[key] ?? '').trim();
    if (!value) {
      setFeedback((f) => ({ ...f, [key]: { kind: 'err', text: 'Enter a value first' } }));
      return;
    }
    setSavingKey(key);
    setFeedback((f) => ({ ...f, [key]: null }));
    const { error } = await supabase.rpc('admin_set_setting', {
      p_key: key,
      p_value: value,
    });
    setSavingKey(null);
    if (error) {
      setFeedback((f) => ({ ...f, [key]: { kind: 'err', text: error.message } }));
      return;
    }
    setDrafts((d) => ({ ...d, [key]: '' }));
    setReveal((r) => ({ ...r, [key]: false }));
    setFeedback((f) => ({ ...f, [key]: { kind: 'ok', text: 'Saved' } }));
    await refresh();
    setTimeout(() => setFeedback((f) => ({ ...f, [key]: null })), 2500);
  };

  return (
    <div className="card-premium p-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent">
          <SettingsIcon className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="font-semibold text-ink">Integrations</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Credentials for the Apify-based member sync. Stored RLS-locked to admins.
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-4">
        {KEYS.map((field) => {
          const meta = metas[field.key];
          const isSet = meta && meta.length && meta.length > 0;
          const draft = drafts[field.key] ?? '';
          const fb = feedback[field.key];
          const showVal = !!reveal[field.key];

          return (
            <li key={field.key} className="border-t border-line/40 pt-4 first:border-0 first:pt-0">
              <div className="flex items-baseline justify-between mb-1.5 gap-3">
                <label
                  htmlFor={`set-${field.key}`}
                  className="text-sm font-medium text-ink"
                >
                  {field.label}
                </label>
                <span className="text-[11px] font-mono text-ink-dim shrink-0">
                  {isSet ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                      set · ends ····{meta!.last4} · {relTime(meta!.updated_at)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-warn">
                      <AlertCircle className="h-3 w-3" aria-hidden />
                      not set
                    </span>
                  )}
                </span>
              </div>
              <p className="text-xs text-ink-muted mb-2 leading-snug">{field.help}</p>
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    id={`set-${field.key}`}
                    type={showVal ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    value={draft}
                    placeholder={isSet ? 'Enter new value to rotate' : field.placeholder}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [field.key]: e.target.value }))
                    }
                    className={cn(
                      'w-full h-10 px-3 pr-10 rounded-lg text-sm font-mono',
                      'bg-bg-raised border border-line-strong text-ink',
                      'placeholder:text-ink-dim',
                      'focus-visible:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setReveal((r) => ({ ...r, [field.key]: !r[field.key] }))
                    }
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-bg-hover"
                    aria-label={showVal ? 'Hide' : 'Show'}
                    title={showVal ? 'Hide' : 'Show'}
                  >
                    {showVal ? (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Eye className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => save(field.key)}
                  disabled={savingKey === field.key || !draft.trim()}
                  className={cn(
                    'inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                    savingKey === field.key || !draft.trim()
                      ? 'bg-bg-raised text-ink-dim cursor-not-allowed'
                      : 'bg-accent text-white hover:bg-accent-hover',
                  )}
                >
                  {savingKey === field.key ? 'Saving…' : isSet ? 'Rotate' : 'Save'}
                </button>
              </div>
              {fb && (
                <p
                  className={cn(
                    'mt-1.5 text-[11px]',
                    fb.kind === 'ok' ? 'text-success' : 'text-danger',
                  )}
                >
                  {fb.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
