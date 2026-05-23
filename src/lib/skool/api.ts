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
const API2_BASE = 'https://api2.skool.com';
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
    page?: number;
    totalPages?: number;
    total?: number;
    itemsPerPage?: number;
  };
}

/**
 * Fetch one page of community members (30 per page by default).
 * Pagination via `?page=N` — same convention as feed pages.
 * Returns the users plus `totalPages` so callers can iterate.
 */
export async function fetchMembersPage(
  authToken: string,
  communitySlug: string,
  page = 1,
): Promise<{ users: SkoolMember[]; totalPages: number }> {
  const buildId = await getBuildId(authToken);
  const url = new URL(`/_next/data/${buildId}/${communitySlug}/-/members.json`, BASE);
  if (page > 1) url.searchParams.set('page', String(page));
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
  return {
    users: j.pageProps.users ?? [],
    totalPages: j.pageProps.totalPages ?? 1,
  };
}

/**
 * Locate a single member by Skool user_id, paginating until found or
 * all pages exhausted. Used by login to confirm community membership.
 *
 * Returns the member row plus the page they were found on (useful for
 * logging / debugging — page 1 is the common case since Skool tends to
 * surface the calling user first).
 */
export async function findMemberById(
  authToken: string,
  communitySlug: string,
  userId: string,
  opts: { maxPages?: number } = {},
): Promise<{ member: SkoolMember; foundOnPage: number } | null> {
  const maxPages = opts.maxPages ?? 50; // hard cap so a runaway never loops forever
  let page = 1;
  let totalPages = 1;

  do {
    const { users, totalPages: tp } = await fetchMembersPage(authToken, communitySlug, page);
    totalPages = tp;
    const hit = users.find((u) => u.id === userId);
    if (hit) return { member: hit, foundOnPage: page };
    page += 1;
  } while (page <= Math.min(totalPages, maxPages));

  return null;
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

export interface UserSkoolSnapshot {
  handle: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;
  /** Skool's own per-user score, parsed from spData. */
  skoolPts: number | null;
  skoolLv: number | null;
  /** Unix-microseconds-ish timestamp Skool exposes; null when never seen. */
  lastOffline: number | null;
  recentPosts: Array<{
    id: string;
    title: string | null;
    upvotes: number;
    comments: number;
    createdAt: string;
  }>;
}

/**
 * Per-user snapshot for the dashboard. Combines:
 *   - members.json  → static profile (bio, location, spData)
 *   - feed page 1   → recent posts by this user (capped at 5)
 *
 * Designed for the dashboard mount call — sub-second total, no DB writes,
 * throws SkoolApiError on auth/geo issues for the route handler to surface.
 */
export async function fetchUserSkoolSnapshot(
  authToken: string,
  communitySlug: string,
  handle: string,
): Promise<UserSkoolSnapshot | null> {
  const normHandle = handle.trim().toLowerCase();
  if (!normHandle) return null;

  const [membersResult, feed] = await Promise.all([
    fetchMembersPage(authToken, communitySlug),
    fetchFeedPage(authToken, communitySlug, 1),
  ]);

  const member = membersResult.users.find((m) => (m.name ?? '').toLowerCase() === normHandle);
  if (!member) {
    // Not in current members page — caller can retry with pagination later.
    // For now we still return whatever we have from the feed.
  }

  const sp = parseSpData(member?.metadata?.spData);
  const recent = feed.posts
    .filter((p) => (p.user?.name ?? '').toLowerCase() === normHandle)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      title: p.metadata.title ?? null,
      upvotes: p.metadata.upvotes ?? 0,
      comments: p.metadata.comments ?? 0,
      createdAt: p.createdAt,
    }));

  return {
    handle: normHandle,
    firstName: member?.firstName ?? null,
    lastName: member?.lastName ?? null,
    bio: member?.metadata?.bio ?? null,
    location: (member?.metadata as { location?: string } | undefined)?.location ?? null,
    avatarUrl: member?.metadata?.pictureProfile ?? member?.metadata?.pictureBubble ?? null,
    skoolPts: sp?.pts ?? null,
    skoolLv: sp?.lv ?? null,
    lastOffline:
      (member?.metadata as { lastOffline?: number } | undefined)?.lastOffline ?? null,
    recentPosts: recent,
  };
}

// =============================================================
// api2.skool.com — Skool's actual backend, not the Next.js
// frontend at www.skool.com.
//
// Why this section exists separately: the www.skool.com data
// routes (above) require fetching a buildId from the homepage,
// which is geo-routed and often serves a maintenance redirect to
// server-side requests. api2.skool.com is the real REST API and
// is far more reliable from a server.
//
// Field naming differs: api2 uses snake_case (first_name,
// picture_profile) where the Next.js data layer uses camelCase
// (firstName, pictureProfile). Interfaces below match what api2
// actually returns.
// =============================================================

interface Api2User {
  id: string;
  name: string; // handle
  email?: string;
  first_name?: string;
  last_name?: string;
  metadata?: {
    bio?: string;
    location?: string;
    picture_profile?: string;
    picture_bubble?: string;
  };
}

interface Api2Group {
  id: string;
  name: string; // slug ("nmo")
  metadata?: {
    display_name?: string;
  };
}

async function api2Fetch(path: string, authToken: string): Promise<unknown> {
  const res = await fetch(`${API2_BASE}${path}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: `auth_token=${authToken}`,
      Origin: BASE,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new SkoolApiError(
      `api2 ${path} failed`,
      res.status,
      (await res.text()).slice(0, 200),
    );
  }
  return res.json();
}

/** Fetch a Skool user's profile by their 32-char hex user_id. */
export async function fetchUserById(
  authToken: string,
  userId: string,
): Promise<Api2User> {
  return (await api2Fetch(`/users/${userId}`, authToken)) as Api2User;
}

/**
 * Confirm a user belongs to a specific community by checking
 * their groups list for a matching slug. Single API call,
 * no pagination.
 */
export async function userIsInCommunity(
  authToken: string,
  userId: string,
  communitySlug: string,
): Promise<boolean> {
  const data = (await api2Fetch(`/users/${userId}/groups`, authToken)) as {
    groups?: Api2Group[];
  };
  return (data.groups ?? []).some((g) => g.name === communitySlug);
}

// =============================================================
// User activity snapshot — pulls aggregate stats from the
// Skool profile page JSON in ONE call:
//
//   GET https://www.skool.com/_next/data/<buildId>/%40<handle>.json?g=<slug>&group=%40<handle>
//
// Returned by Skool inside pageProps (totals live under either
// `pageProps.renderData.user.*` or `pageProps.currentUser.*` —
// we accept either since Skool has shipped both shapes).
//
// Skool computes all the aggregates server-side: totalPosts,
// totalContributions, plus the `spData` JSON string containing
// {pts, lv, pcl, pnl, role}. That's a complete activity
// snapshot per user without ever paginating the community feed.
//
// Reaches www.skool.com (not api2), so it inherits the buildId
// flow and may hit the maintenance redirect from data-center
// IPs. Caller should treat SkoolApiError as recoverable.
// =============================================================

interface SkoolSpData {
  pts: number;
  lv: number;
  pcl: number;
  pnl: number;
  role: number;
}

export interface UserActivitySnapshot {
  totalPosts: number | null;
  totalContributions: number | null;
  totalFollowers: number | null;
  totalFollowing: number | null;
  totalGroups: number | null;
  pts: number | null;
  lv: number | null;
  pcl: number | null;
  pnl: number | null;
  role: number | null;
  dailyActivities: unknown | null; // raw object — heatmap consumer parses
}

function parseSpDataFull(raw: unknown): SkoolSpData | null {
  if (typeof raw !== 'string') return null;
  try {
    const j = JSON.parse(raw) as Partial<SkoolSpData>;
    if (
      typeof j.pts !== 'number' ||
      typeof j.lv !== 'number' ||
      typeof j.pcl !== 'number' ||
      typeof j.pnl !== 'number' ||
      typeof j.role !== 'number'
    ) {
      return null;
    }
    return j as SkoolSpData;
  } catch {
    return null;
  }
}

/**
 * Fetch a single user's full activity snapshot from their Skool
 * profile page. Requires `authToken` belonging to a user who can
 * see the target profile (typically the user themself).
 */
export async function fetchUserActivityProfile(
  authToken: string,
  communitySlug: string,
  handle: string,
): Promise<UserActivitySnapshot> {
  const buildId = await getBuildId(authToken);
  const encodedHandle = `%40${encodeURIComponent(handle)}`;
  const url = new URL(
    `/_next/data/${buildId}/${encodedHandle}.json`,
    BASE,
  );
  url.searchParams.set('g', communitySlug);
  url.searchParams.set('group', `@${handle}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: `auth_token=${authToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new SkoolApiError(
      `profile JSON fetch failed`,
      res.status,
      (await res.text()).slice(0, 200),
    );
  }

  // pageProps shape varies — totals + spData can live on
  // currentUser OR renderData.user. Try both, prefer renderData.
  type Maybe = Record<string, unknown> | undefined;
  const root = (await res.json()) as { pageProps?: Record<string, unknown> };
  const pp = (root.pageProps ?? {}) as Record<string, unknown>;
  const rd = (pp.renderData as { user?: Record<string, unknown> } | undefined)?.user;
  const cu = pp.currentUser as Maybe;
  const u: Record<string, unknown> = { ...(cu ?? {}), ...(rd ?? {}) };

  const numOrNull = (v: unknown) => (typeof v === 'number' ? v : null);
  const sp = parseSpDataFull(
    (u.metadata as { spData?: unknown } | undefined)?.spData,
  );

  return {
    totalPosts: numOrNull(u.totalPosts) ?? numOrNull(pp.total),
    totalContributions: numOrNull(u.totalContributions),
    totalFollowers: numOrNull(u.totalFollowers),
    totalFollowing: numOrNull(u.totalFollowing),
    totalGroups: numOrNull(u.totalGroups),
    pts: sp?.pts ?? null,
    lv: sp?.lv ?? null,
    pcl: sp?.pcl ?? null,
    pnl: sp?.pnl ?? null,
    role: sp?.role ?? null,
    dailyActivities: (u.dailyActivities ?? pp.dailyActivities) ?? null,
  };
}
