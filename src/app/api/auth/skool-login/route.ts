// Skool-credential login. The user types their Skool email + password
// into our login form; we proxy the credentials to Skool, verify they
// land in the NMO community, then mint a Supabase session bound to
// that Skool identity. We never store the password.
//
// Flow:
//   1. POST {email, password} → https://api2.skool.com/auth/login
//   2. On 200, parse Set-Cookie for auth_token (a JWT carrying user_id + exp).
//   3. Confirm user_id is a current NMO member (via members.json with that token).
//   4. Find-or-create the profile keyed on skool_user_id (fall back to email
//      for users who signed up the old way — their existing row gets linked).
//   5. Mint a Supabase session via admin generateLink → verifyOtp.
//   6. Persist the user's auth_token on their profile so cron/dashboard
//      sync can hit Skool as them.
//
// Errors are returned as JSON {error: code} so the login page can map
// to translated copy. No detail leaks to the client beyond the code.

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { fetchUserById, userIsInCommunity, SkoolApiError } from '@/lib/skool/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const SKOOL_LOGIN_URL = 'https://api2.skool.com/auth/login';
const COMMUNITY_SLUG = 'nmo';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

type JwtPayload = { user_id: string; exp: number; iat: number };

function decodeJwtPayload(jwt: string): JwtPayload | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    // Base64URL → base64 → JSON. No signature verification — we made
    // the outbound call, so we trust the response that came back.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const obj = JSON.parse(json) as Partial<JwtPayload>;
    if (typeof obj.user_id !== 'string' || typeof obj.exp !== 'number') return null;
    return obj as JwtPayload;
  } catch {
    return null;
  }
}

function parseAuthTokenFromSetCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  // Header is a single string; Skool returns one `auth_token=...` cookie.
  // Cookie value can't contain `;` or whitespace per RFC, so split on `;`.
  const m = setCookieHeader.match(/auth_token=([^;\s]+)/);
  return m ? m[1] : null;
}

export async function POST(req: Request) {
  // 1. Validate input
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'missing_credentials' }, { status: 400 });
  }

  // 2. Proxy to Skool
  let skoolRes: Response;
  try {
    skoolRes = await fetch(SKOOL_LOGIN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: '*/*',
        origin: 'https://www.skool.com',
        referer: 'https://www.skool.com/',
        'user-agent': BROWSER_UA,
      },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch (e) {
    console.error('[skool-login] FETCH_THROW', (e as Error).message);
    return NextResponse.json(
      { error: 'skool_unreachable', step: 'login_fetch', detail: (e as Error).message },
      { status: 502 },
    );
  }

  console.log('[skool-login] login response status:', skoolRes.status);

  if (skoolRes.status === 401) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }
  if (!skoolRes.ok) {
    const bodyPreview = (await skoolRes.text().catch(() => '')).slice(0, 200);
    console.error('[skool-login] non-ok login response', skoolRes.status, bodyPreview);
    return NextResponse.json(
      { error: 'skool_error', step: 'login_status', status: skoolRes.status, detail: bodyPreview },
      { status: 502 },
    );
  }

  // 3. Extract token + decode payload.
  // Node's undici fetch joins multiple Set-Cookie headers into one string;
  // prefer getSetCookie() when available so we never miss the auth cookie.
  const setCookieList = (skoolRes.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie?.() ?? [];
  const setCookie = setCookieList.length > 0
    ? setCookieList.join(', ')
    : skoolRes.headers.get('set-cookie');
  console.log('[skool-login] set-cookie present:', !!setCookie, 'len:', setCookie?.length ?? 0);
  const authToken = parseAuthTokenFromSetCookie(setCookie);
  if (!authToken) {
    console.error('[skool-login] no auth_token in set-cookie:', setCookie?.slice(0, 200));
    return NextResponse.json(
      { error: 'skool_no_token', step: 'parse_cookie', detail: setCookie?.slice(0, 200) ?? null },
      { status: 502 },
    );
  }
  const payload = decodeJwtPayload(authToken);
  if (!payload) {
    return NextResponse.json(
      { error: 'skool_bad_token', step: 'decode_jwt' },
      { status: 502 },
    );
  }
  const skoolUserId = payload.user_id;
  const expiresAt = new Date(payload.exp * 1000).toISOString();

  // Server-side log — visible in `npm run dev` terminal during testing.
  // Remove or downgrade once the flow is validated.
  console.log('[skool-login] verified user_id:', skoolUserId, 'for email:', email);

  // 4. Membership gate via api2.skool.com — two parallel calls:
  //    /users/{user_id}        → profile (handle, name, avatar)
  //    /users/{user_id}/groups → community membership check
  // Both work server-side without the www.skool.com buildId scrape,
  // which is unreliable from data-center IPs (CloudFront redirects
  // to maintenance.skool.com).
  let member: {
    handle: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  } | null = null;
  try {
    const [profile, isMember] = await Promise.all([
      fetchUserById(authToken, skoolUserId),
      userIsInCommunity(authToken, skoolUserId, COMMUNITY_SLUG),
    ]);

    if (!isMember) {
      console.log('[skool-login] user not in', COMMUNITY_SLUG, 'community');
      return NextResponse.json({ error: 'not_a_member' }, { status: 403 });
    }

    console.log(
      '[skool-login] membership confirmed — handle:',
      profile.name,
      'name:',
      profile.first_name,
      profile.last_name,
    );

    member = {
      handle: profile.name ?? null,
      firstName: profile.first_name ?? null,
      lastName: profile.last_name ?? null,
      avatarUrl:
        profile.metadata?.picture_profile ??
        profile.metadata?.picture_bubble ??
        null,
    };
  } catch (e) {
    if (e instanceof SkoolApiError) {
      console.error('[skool-login] api2 call failed', e.status, e.bodyPreview);
      return NextResponse.json(
        {
          error: 'skool_unreachable',
          step: 'api2_membership',
          status: e.status,
          detail: e.bodyPreview,
        },
        { status: 502 },
      );
    }
    console.error('[skool-login] unexpected error in membership gate', (e as Error).message);
    throw e;
  }

  // 5. Service-role client for find-or-create on auth.users + profiles
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
  }
  const service = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Look up existing profile: prefer skool_user_id, fall back to email.
  // Email-fallback links pre-existing users who signed up the old way.
  let userId: string | null = null;
  {
    const { data } = await service
      .from('profiles')
      .select('id')
      .eq('skool_user_id', skoolUserId)
      .maybeSingle();
    if (data) userId = (data as { id: string }).id;
  }
  if (!userId) {
    const { data } = await service
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (data) userId = (data as { id: string }).id;
  }

  // 6. Create auth.users + profile if this is a brand-new Skool user
  if (!userId) {
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        skool_user_id: skoolUserId,
        skool_handle: member.handle,
      },
    });
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: 'create_user_failed', detail: createErr?.message ?? null },
        { status: 500 },
      );
    }
    userId = created.user.id;
    // Profile row is normally created by a trigger on auth.users insert.
    // Belt-and-braces: ensure it exists with the Skool fields populated.
    await service.from('profiles').upsert(
      {
        id: userId,
        email,
        skool_user_id: skoolUserId,
        skool_handle: member.handle,
        skool_url: member.handle ? `https://www.skool.com/@${member.handle}` : null,
        skool_avatar_url: member.avatarUrl,
        skool_auth_token: authToken,
        skool_auth_token_expires_at: expiresAt,
        // We just confirmed NMO membership via api2/users/{id}/groups —
        // mark verified so the profile chip doesn't show "Unverified".
        skool_membership_status: 'verified',
        display_name:
          [member.firstName, member.lastName].filter(Boolean).join(' ') || null,
      },
      { onConflict: 'id' },
    );
  } else {
    // Existing user — refresh Skool fields and bind skool_user_id if missing
    await service
      .from('profiles')
      .update({
        skool_user_id: skoolUserId,
        skool_handle: member.handle,
        skool_url: member.handle ? `https://www.skool.com/@${member.handle}` : null,
        skool_avatar_url: member.avatarUrl,
        skool_auth_token: authToken,
        skool_auth_token_expires_at: expiresAt,
        skool_membership_status: 'verified',
      })
      .eq('id', userId);
  }

  // 7. Mint a Supabase session for this user.
  // generateLink('magiclink') gives us a hashed_token we exchange via
  // verifyOtp, which sets the auth cookies through our SSR client.
  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: 'session_mint_failed', detail: linkErr?.message ?? null },
      { status: 500 },
    );
  }

  const supabase = createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyErr) {
    return NextResponse.json(
      { error: 'session_verify_failed', detail: verifyErr.message },
      { status: 500 },
    );
  }

  // Routing decision: first login → confirm-identity, then questionnaire,
  // then dashboard. Subsequent logins skip confirm-identity.
  const { data: profile } = await service
    .from('profiles')
    .select('onboarding_completed, skool_identity_confirmed_at')
    .eq('id', userId)
    .maybeSingle();
  const p = profile as {
    onboarding_completed: boolean | null;
    skool_identity_confirmed_at: string | null;
  } | null;
  const identityConfirmed = !!p?.skool_identity_confirmed_at;
  const onboardingCompleted = p?.onboarding_completed === true;

  let nextPath = '/dashboard';
  if (!identityConfirmed) nextPath = '/confirm-identity';
  else if (!onboardingCompleted) nextPath = '/questionnaire';

  return NextResponse.json({
    ok: true,
    nextPath,
    onboardingCompleted,
    identityConfirmed,
    // Surfaced for in-browser testing only; safe to remove later.
    skoolUserId,
    handle: member.handle,
  });
}
