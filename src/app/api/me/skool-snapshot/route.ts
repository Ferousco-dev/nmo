// Per-user dashboard snapshot — served from our own DB, NOT from
// www.skool.com (which is gated by AWS WAF and unreachable from
// any server). The Apify cron + on-login refresh populate
// engagement_events; the engagement_grades view aggregates them.
//
// Shape stays compatible with <SkoolSnapshotCard /> so the
// existing UI renders unchanged.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('skool_handle, skool_avatar_url, display_name')
    .eq('id', user.id)
    .maybeSingle();

  const p = profile as {
    skool_handle: string | null;
    skool_avatar_url: string | null;
    display_name: string | null;
  } | null;

  if (!p?.skool_handle) {
    return NextResponse.json({ ok: true, hasHandle: false });
  }

  // Pull aggregates + the last 5 posts from our DB in parallel.
  // engagement_grades is the view; engagement_events is the raw log.
  const [gradesRes, eventsRes] = await Promise.all([
    supabase
      .from('engagement_grades')
      .select('posts_count, comments_count, replies_count, likes_count, engagement_score, last_active_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('engagement_events')
      .select('source_id, target_post_id, content_excerpt, occurred_at, raw')
      .eq('user_id', user.id)
      .eq('event_type', 'post')
      .order('occurred_at', { ascending: false })
      .limit(5),
  ]);

  const grades = (gradesRes.data ?? null) as {
    posts_count: number | null;
    comments_count: number | null;
    replies_count: number | null;
    likes_count: number | null;
    engagement_score: number | null;
    last_active_at: string | null;
  } | null;

  const events = (eventsRes.data ?? []) as Array<{
    source_id: string | null;
    target_post_id: string | null;
    content_excerpt: string | null;
    occurred_at: string;
    raw: Record<string, unknown> | null;
  }>;

  const recentPosts = events.map((e) => {
    const raw = e.raw ?? {};
    const upvotes = typeof raw.likes_received === 'number' ? raw.likes_received : 0;
    const comments = typeof raw.comments_received === 'number' ? raw.comments_received : 0;
    const titleRaw = typeof raw.title === 'string' && raw.title.length > 0
      ? raw.title
      : (e.content_excerpt ?? '').slice(0, 80);
    return {
      id: e.target_post_id ?? e.source_id ?? '',
      title: titleRaw || null,
      upvotes,
      comments,
      createdAt: e.occurred_at,
    };
  });

  const display = p.display_name ?? '';
  const [firstName, ...rest] = display.split(/\s+/);

  // lastOffline is in unix-microseconds in Skool's payload; we
  // approximate from last_active_at so the card renders "X ago".
  const lastOffline = grades?.last_active_at
    ? new Date(grades.last_active_at).getTime() * 1000
    : null;

  return NextResponse.json({
    ok: true,
    hasHandle: true,
    snapshot: {
      handle: p.skool_handle,
      firstName: firstName || null,
      lastName: rest.join(' ') || null,
      bio: null,
      location: null,
      avatarUrl: p.skool_avatar_url,
      // engagement_score is our app-side weighted total; surfaced
      // as skoolPts because the card already labels it as such.
      skoolPts: grades?.engagement_score ?? null,
      skoolLv: null, // Skool's native level isn't in our DB
      lastOffline,
      recentPosts,
    },
  });
}
