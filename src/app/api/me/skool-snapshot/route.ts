// Per-user Skool snapshot for the dashboard.
//
// Mounted via <SkoolSnapshotCard /> on /dashboard. Fires once per page
// mount, returns this user's live Skool profile data (location, bio,
// Skool pts/lv, recent posts). Errors surface as structured JSON so
// the card can render a clean message instead of falling silent.
//
// Auth: signed-in user only. The user must have linked their
// skool_handle in /profile before this is meaningful — when unset
// we return { ok: true, hasHandle: false } so the card can prompt
// the user to link.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fetchUserSkoolSnapshot, SkoolApiError } from '@/lib/skool/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const COMMUNITY_SLUG = 'nmo';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('skool_handle')
    .eq('id', user.id)
    .maybeSingle();
  const handle = (profile as { skool_handle: string | null } | null)?.skool_handle ?? null;

  if (!handle) {
    return NextResponse.json({ ok: true, hasHandle: false });
  }

  // Service-role client to read app_settings (skool_auth_token).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: 'server_env_missing' },
      { status: 500 },
    );
  }
  const service = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRow } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'skool_auth_token')
    .maybeSingle();
  const authToken = (tokenRow as { value: string } | null)?.value ?? null;
  if (!authToken) {
    return NextResponse.json(
      { ok: false, error: 'no_auth_token', hint: 'Admin needs to set skool_auth_token.' },
      { status: 412 },
    );
  }

  try {
    const snapshot = await fetchUserSkoolSnapshot(authToken, COMMUNITY_SLUG, handle);
    return NextResponse.json({ ok: true, hasHandle: true, snapshot });
  } catch (e) {
    if (e instanceof SkoolApiError) {
      // 401 from Skool means our auth_token JWT expired.
      if (e.status === 401 || e.status === 403) {
        return NextResponse.json(
          { ok: false, error: 'skool_auth_expired', hint: 'Admin needs to rotate skool_auth_token.' },
          { status: 502 },
        );
      }
      // 200 with maintenance HTML body → geo-block / WAF.
      if (e.message.includes('buildId')) {
        return NextResponse.json(
          { ok: false, error: 'skool_geo_blocked' },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { ok: false, error: 'skool_unreachable', detail: e.bodyPreview.slice(0, 200) },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: 'unknown', detail: (e as Error).message },
      { status: 500 },
    );
  }
}
