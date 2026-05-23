'use client';

// Fire-and-forget per-user engagement refresh on dashboard mount.
//
// Calls /api/me/refresh-engagement, which queues an Apify run scoped
// to the current user's skool_handle. Rate-limited server-side (10 min
// cooldown via bot_runs lookup), so re-mounts within the window get
// a "cooldown" response and bail — no extra Apify cost.
//
// We deliberately do NOT await: the dashboard renders immediately
// and the Apify run finishes ~1-2 minutes later, populating
// engagement_events. The next page load shows the fresh numbers.
//
// The daily cron is the safety net for users who never log in.

import { useEffect } from 'react';

export function AutoSyncTickle() {
  useEffect(() => {
    // React Strict Mode fires effects twice in dev — the cooldown on
    // the route makes the second call a no-op.
    void fetch('/api/me/refresh-engagement', {
      method: 'POST',
      keepalive: true,
    }).catch(() => {
      // Silent: best-effort. Daily cron is the safety net.
    });
  }, []);

  return null;
}
