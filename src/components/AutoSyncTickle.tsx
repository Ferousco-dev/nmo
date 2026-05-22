'use client';

// Fire-and-forget background sync on dashboard mount.
//
// The trigger-skool-direct route is rate-limited server-side (30 min
// cooldown via bot_runs lookup), so even with 100 concurrent dashboard
// loads only one actually fires a Skool API call — the rest see
// "skipped: recent" and return immediately.
//
// We deliberately do NOT await: the user's dashboard renders without
// waiting for the sync to complete. Vercel keeps the function running
// server-side until it finishes, regardless of whether the browser is
// still listening. Worst case: user navigates away, fetch aborts on
// the wire, but the server-side work runs to completion.

import { useEffect } from 'react';

export function AutoSyncTickle() {
  useEffect(() => {
    // Once per mount. React Strict Mode runs effects twice in dev —
    // the rate-limit makes that harmless (second call sees the first
    // run's bot_run row and bails).
    void fetch('/api/admin/bot/trigger-skool-direct', {
      method: 'POST',
      keepalive: true,
    }).catch(() => {
      // Silent: this is best-effort. The daily cron is the safety net.
    });
  }, []);

  return null;
}
