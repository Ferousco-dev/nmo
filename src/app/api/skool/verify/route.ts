import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COMMUNITY_SLUG = 'nmo';
const HANDLE_REGEX = /^[a-zA-Z0-9_-]{2,40}$/;

type EmailMatch = 'strong' | 'medium' | 'weak';

type VerifyResult =
  | { success: true; handle: string; displayName: string | null; avatarUrl: string | null; membershipStatus: 'pending' | 'verified' }
  | { success: false; error: string };

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function emailHandleMatch(email: string, handle: string, displayName: string | null): EmailMatch {
  const local = normalize(email.split('@')[0] || '');
  const h = normalize(handle);
  if (!local || !h) return 'weak';

  if (local === h) return 'strong';
  if (local.includes(h) || h.includes(local)) return 'medium';

  if (displayName) {
    const dn = normalize(displayName);
    if (dn && (dn.includes(local) || local.includes(dn))) return 'medium';
  }

  // Token-level overlap: split email local-part on common separators (dots, underscores, dashes)
  // and check if any token appears in handle/displayName.
  const tokens = (email.split('@')[0] || '').split(/[._-]+/).map(normalize).filter((t) => t.length >= 3);
  for (const tok of tokens) {
    if (h.includes(tok) || tok.includes(h)) return 'medium';
    if (displayName && normalize(displayName).includes(tok)) return 'medium';
  }

  return 'weak';
}

function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase();
}

function extractMeta(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  return html.match(re)?.[1] ?? null;
}

function extractTitle(html: string): string | null {
  return html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
}

async function fetchSkoolProfile(handle: string): Promise<VerifyResult> {
  const url = `https://www.skool.com/@${handle}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch {
    return { success: false, error: 'fetch_failed' };
  }

  if (res.status === 404) return { success: false, error: 'profile_not_found' };
  if (!res.ok) return { success: false, error: `http_${res.status}` };

  const html = await res.text();

  // Skool profile pages embed user data via meta tags + an inline JSON blob in __NEXT_DATA__.
  // We grab whatever's reliably there.
  const ogTitle = extractMeta(html, 'og:title');
  const ogImage = extractMeta(html, 'og:image');
  const ogDescription = extractMeta(html, 'og:description');
  const pageTitle = extractTitle(html);

  // Display name candidates (prefer og:title, fall back to <title>)
  let displayName: string | null = ogTitle || pageTitle || null;
  if (displayName) {
    displayName = displayName.replace(/\s*[|·-]\s*Skool.*$/i, '').trim() || null;
  }

  // Sanity check: the page should mention the handle
  const handleLower = handle.toLowerCase();
  const pageMentionsHandle = html.toLowerCase().includes(`@${handleLower}`) || html.toLowerCase().includes(`/@${handleLower}`);
  if (!pageMentionsHandle && !ogTitle) {
    return { success: false, error: 'profile_not_found' };
  }

  // Best-effort: check whether the profile page references the NMO community.
  // Skool profile pages list communities the user is in. If we see /nmo/, mark verified.
  // If not, mark pending — admin or bot will confirm later.
  const communityHit =
    html.includes(`/${COMMUNITY_SLUG}/`) ||
    html.includes(`"${COMMUNITY_SLUG}"`) ||
    (ogDescription ?? '').toLowerCase().includes(COMMUNITY_SLUG);

  return {
    success: true,
    handle: handleLower,
    displayName,
    avatarUrl: ogImage,
    membershipStatus: communityHit ? 'verified' : 'pending',
  };
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'not_authenticated' }, { status: 401 });
  }

  let body: { handle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
  }

  const raw = (body.handle ?? '').toString();
  const handle = normalizeHandle(raw);

  if (!HANDLE_REGEX.test(handle)) {
    return NextResponse.json({ success: false, error: 'invalid_handle' }, { status: 400 });
  }

  const result = await fetchSkoolProfile(handle);
  if (!result.success) {
    return NextResponse.json(result, { status: 422 });
  }

  const emailMatch: EmailMatch = user.email
    ? emailHandleMatch(user.email, result.handle, result.displayName)
    : 'weak';

  const { data: rpcData, error: rpcError } = await supabase.rpc('claim_skool_handle', {
    p_handle: result.handle,
    p_display_name: result.displayName,
    p_avatar_url: result.avatarUrl,
    p_membership_status: result.membershipStatus,
    p_email_match: emailMatch,
  });

  if (rpcError) {
    return NextResponse.json({ success: false, error: rpcError.message }, { status: 500 });
  }

  if (rpcData && typeof rpcData === 'object' && 'success' in rpcData && !rpcData.success) {
    return NextResponse.json(rpcData, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    handle: result.handle,
    displayName: result.displayName,
    avatarUrl: result.avatarUrl,
    profileUrl: `https://www.skool.com/@${result.handle}`,
    membershipStatus: result.membershipStatus,
    emailMatch,
  });
}
