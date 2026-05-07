'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, CheckCircle2, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TopNav } from '@/components/TopNav';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useT } from '@/lib/i18n/client';

export default function RedeemPage() {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    | { kind: 'success'; points: number; description?: string }
    | { kind: 'error'; message: string }
    | null
  >(null);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);

    const { data, error } = await supabase.rpc('redeem_event_code', {
      p_code: code.trim(),
    });

    setLoading(false);

    if (error) {
      setResult({ kind: 'error', message: error.message });
      return;
    }

    if (data?.success) {
      setResult({
        kind: 'success',
        points: data.points,
        description: data.description,
      });
      setCode('');
      router.refresh();
    } else {
      const errKey = data?.error as keyof typeof t.redeem.errors;
      const message = t.redeem.errors[errKey] || data?.error || '未知錯誤';
      setResult({ kind: 'error', message });
    }
  };

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-accent/10 border border-accent/30 mb-4 glow-blue">
            <Gift className="h-8 w-8 text-accent" />
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
            <span className="gradient-text">{t.redeem.title}</span>
          </h1>
          <p className="mt-3 text-ink-muted">{t.redeem.subtitle}</p>
        </div>

        <form onSubmit={handleRedeem} className="card-premium p-8 space-y-5">
          <Input
            label={t.redeem.codeLabel}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t.redeem.codePlaceholder}
            className="font-mono uppercase tracking-widest text-center text-lg"
            maxLength={20}
            required
          />

          <Button
            type="submit"
            className="w-full"
            size="lg"
            loading={loading}
            disabled={!code.trim()}
          >
            {loading ? t.redeem.redeeming : t.redeem.redeem}
          </Button>

          {result && (
            <div
              className={`p-4 rounded-lg border animate-fade-in ${
                result.kind === 'success'
                  ? 'border-success/30 bg-success/10'
                  : 'border-danger/30 bg-danger/10'
              }`}
            >
              <div className="flex items-start gap-3">
                {result.kind === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  {result.kind === 'success' ? (
                    <>
                      <p className="font-semibold text-success">
                        {t.redeem.success} {result.points} {t.redeem.pointsLabel}
                      </p>
                      {result.description && (
                        <p className="text-sm text-ink-muted mt-1">{result.description}</p>
                      )}
                    </>
                  ) : (
                    <p className="font-medium text-danger">{result.message}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
