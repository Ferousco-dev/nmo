// Direct Skool API client — calls the same Next.js data routes the
// Skool frontend uses, server-side, with the admin's auth_token cookie.
//
// Why this exists: Apify scraping takes minutes per batch + costs quota.
// These endpoints are sub-second and free. Trade-off is the auth_token
// expires (~yearly) and needs rotating via /admin/integrations.
//
// All functions are pure — no DB writes. The trigger route does the
// engagement_events upsert.

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASE = 'https://www.skool.com';
const BUILD_ID_TTL_MS = 30 * 60_000;

let buildIdCache: { id: string; fetchedAt: number } | null = null;

export class SkoolApiError extends Error {
  status: number;
  bodyPreview: string;
  constructor(message: string, status: number, bodyPreview: string) {
    super(message);
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

/** Fetch (and cache) the current Next.js buildId. Rotates on every Skool deploy. */
export async function getBuildId(authToken: string): Promise<string> {
  if (buildIdCache && Date.now() - buildIdCache.fetchedAt < BUILD_ID_TTL_MS) {
    return buildIdCache.id;
  }
  const res = await fetch(BASE, {
    headers: { 'User-Agent': USER_AGENT, Cookie: `auth_token=${authToken}` },
  });
  if (!res.ok) {
    throw new SkoolApiError(`buildId fetch failed`, res.status, (await res.text()).slice(0, 200));
  }
  const html = await res.text();
  const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  if (!m) {
    throw new SkoolApiError('Could not parse buildId — maintenance page or geo-block?', 200, html.slice(0, 200));
  }
  buildIdCache = { id: m[1], fetchedAt: Date.now() };
  return m[1];
}

interface SkoolPostUser {
  id: string;
  name: string; // handle
  firstName: string;
  lastName: string;
  metadata?: {
    pictureProfile?: string;
    pictureBubble?: string;
    spData?: string; // JSON string: {"pts":N,"lv":N,...}
  };
}

interface SkoolContributor {
  id: string;
  name: string; // handle
  first_name: string;
  last_name: string;
}

export interface SkoolPost {
  id: string;
  name: string;
  createdAt: string;
  user: SkoolPostUser;
  metadata: {
    title?: string;
    upvotes?: number;
    comments?: number;
    /** JSON-encoded string of SkoolContributor[] — top 5 commenters on this post */
    contributors?: string;
  };
}

interface FeedResponse {
  pageProps: {
    page: number;
    total: number;
    postTrees: Array<{ post: SkoolPost }>;
  };
}

/** Fetch one page of the community feed. Returns posts + total count (for pagination). */
export async function fetchFeedPage(
  authToken: string,
  communitySlug: string,
  page: number,
): Promise<{ posts: SkoolPost[]; total: number }> {
  const buildId = await getBuildId(authToken);
  const url = new URL(`/_next/data/${buildId}/${communitySlug}.json`, BASE);
  if (page > 1) url.searchParams.set('page', String(page));
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: `auth_token=${authToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new SkoolApiError(`feed page ${page} failed`, res.status, (await res.text()).slice(0, 200));
  }
  const j = (await res.json()) as FeedResponse;
  return {
    posts: (j.pageProps.postTrees ?? []).map((t) => t.post),
    total: j.pageProps.total ?? 0,
  };
}

/** Parse the JSON-encoded contributors blob into a typed array. Returns [] on error. */
export function parseContributors(raw: string | undefined): SkoolContributor[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SkoolContributor[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface SkoolMember {
  id: string;
  name: string; // handle
  firstName?: string;
  lastName?: string;
  metadata?: {
    bio?: string;
    pictureBubble?: string;
    pictureProfile?: string;
    /** JSON string of Skool's per-user stats — pts / lv / pcl / pnl / role */
    spData?: string;
  };
}

interface MembersResponse {
  pageProps: {
    users: SkoolMember[];
  };
}

/** Fetch the community members page (currently single-page — Skool paginates differently). */
export async function fetchMembersPage(
  authToken: string,
  communitySlug: string,
): Promise<SkoolMember[]> {
  const buildId = await getBuildId(authToken);
  const url = new URL(`/_next/data/${buildId}/${communitySlug}/-/members.json`, BASE);
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: `auth_token=${authToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new SkoolApiError(`members fetch failed`, res.status, (await res.text()).slice(0, 200));
  }
  const j = (await res.json()) as MembersResponse;
  return j.pageProps.users ?? [];
}

/** Pulled out so unit tests / debug routes can parse without re-implementing. */
export function parseSpData(raw: string | undefined): { pts: number; lv: number } | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { pts?: number; lv?: number };
    if (typeof j.pts !== 'number' || typeof j.lv !== 'number') return null;
    return { pts: j.pts, lv: j.lv };
  } catch {
    return null;
  }
}
