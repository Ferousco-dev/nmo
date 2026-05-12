# NMO Roadmap — Phase 1

Next.js 14 + Supabase web app for the NMO Skool community.
Personalized 30-day onboarding roadmap, gamification, leaderboard, family tree, and event-code redemption.

UI is in **Traditional Chinese (繁體中文)**, theme is **Dark Premium (Zinc + Electric Blue)**.

---

## ✨ Phase 1 Features

- ✅ Email / password auth (Supabase)
- ✅ 4-step onboarding questionnaire (Skool URL → Tenure → Goal → Intensity)
- ✅ Auto-assigns 1 of 8 tracks based on answers
- ✅ Generates a personalized 30-day roadmap with 2 (Easy) or 4 (Pro) tasks per day
- ✅ Dashboard: progress %, streak, points, level, today's tasks
- ✅ Roadmap view: vertical 30-day timeline with checkboxes
- ✅ Leaderboard: all-time + quarterly (last 90 days)
- ✅ Family tree: tiered hierarchy (CEO → COO/CMO/CSMO → Regional → Subregional)
- ✅ Event code redemption: secret codes from live events award points
- ✅ Profile page with all answers

---

## 🚀 Setup (15 minutes)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

You said you already have a project, so:

1. Open your Supabase project → **SQL Editor** → **New query**
2. Copy the entire contents of `supabase/schema.sql`
3. Paste and click **Run** — this creates all tables, RLS policies, RPC functions, and seed data
4. Go to **Authentication → Providers → Email** — make sure email auth is enabled
5. (Optional, for faster testing) **Authentication → Providers → Email** → **disable "Confirm email"** so signups work immediately without email confirmation
6. Go to **Project Settings → API** and copy:
   - Project URL
   - `anon` public key

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SKOOL_COMMUNITY_URL=https://www.skool.com/nmo

# Server-only — required for the daily Skool member sync (Vercel Cron → Apify)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
APIFY_TOKEN=apify_api_xxx
SKOOL_COMMUNITY_SLUG=nmo
SKOOL_SESSION_COOKIE=__Secure-next-auth.session-token=...; other-cookie=...
TRIGGER_SECRET=any-long-random-string   # POST x-trigger-secret to run on demand
# CRON_SECRET is set automatically by Vercel when you enable Cron Jobs
```

### Daily Skool member sync

The cron lives in `vercel.json` and runs `/api/cron/sync-skool-members`
every day at **19:00 UTC (20:00 West Africa Time)**. It calls the Apify
`cheerio-scraper` actor against `https://www.skool.com/<slug>/-/members`,
extracts every user-shaped object out of `__NEXT_DATA__`, and upserts
into `nmo_members` (handle, display_name, avatar_url, level, profile_url).

Before the first run:

1. Apply `supabase/migrations_apify_sync.sql` in the Supabase SQL editor
   (adds the `profile_url` column).
2. In Vercel, set the env vars above. `SKOOL_SESSION_COOKIE` is the full
   `cookie:` header from a logged-in browser; without it the scrape only
   sees the public members view.
3. Enable Cron Jobs in the Vercel project. `CRON_SECRET` is auto-injected.
4. Manual trigger for testing:
   ```bash
   curl -X POST https://<your-app>.vercel.app/api/cron/sync-skool-members \
     -H "x-trigger-secret: $TRIGGER_SECRET"
   ```
   Audit trail lives in `public.bot_runs` (newest first).

### 4. Run dev server

```bash
npm run dev
```

Open http://localhost:3000 — you'll be redirected to login.

### 5. Test the flow

1. Sign up with any email/password
2. Complete the 4-step onboarding (URL: `https://www.skool.com/@test-user`)
3. Land on dashboard, check off some tasks
4. Try redeeming a seed code: `LIVE2026`, `LAUNCH`, or `WELCOME`
5. Visit `/leaderboard` to see your ranking
6. Visit `/family-tree` to see seeded leaders

---

## 🚢 Deploy to Vercel

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "Phase 1"
git remote add origin <your-repo-url>
git push -u origin main

# 2. Go to vercel.com → New Project → Import your repo
# 3. Add the same env vars from .env.local in Vercel project settings
# 4. Deploy
```

---

## 📁 Project Structure

```
nmo-roadmap/
├── supabase/
│   └── schema.sql              ← Run this in Supabase SQL Editor
├── src/
│   ├── app/
│   │   ├── layout.tsx          ← Root layout (zh-Hant)
│   │   ├── page.tsx            ← Smart redirect
│   │   ├── login/              ← Sign in
│   │   ├── signup/             ← Sign up
│   │   ├── onboarding/         ← 4-step questionnaire
│   │   ├── dashboard/          ← Main hub
│   │   ├── roadmap/            ← Full 30-day timeline
│   │   ├── leaderboard/        ← Rankings
│   │   ├── family-tree/        ← Leadership directory
│   │   ├── redeem/             ← Event code redemption
│   │   └── profile/            ← User profile
│   ├── components/
│   │   ├── TopNav.tsx
│   │   ├── ui/                 ← Button, Input, Card
│   │   ├── onboarding/         ← OnboardingClient (multi-step)
│   │   └── roadmap/            ← TaskItem, DayCard
│   ├── lib/
│   │   ├── supabase/           ← Browser, server, middleware clients
│   │   ├── roadmap/generator.ts ← Track assignment + 30-day generator
│   │   └── utils.ts
│   ├── messages/zh-Hant.ts     ← All UI strings in Traditional Chinese
│   ├── types/index.ts
│   └── middleware.ts           ← Auth gating
├── .env.example
├── package.json
├── tailwind.config.ts          ← Dark Premium theme
├── tsconfig.json
└── next.config.js
```

---

## 🎯 What the Client Should Edit Later (Phase 1.5)

These are placeholders deliberately written so the client can drop in real content without code changes:

1. **30-day task content** (`src/lib/roadmap/generator.ts`)
   - The `dailyTaskBank` array has 8 generic task templates
   - Replace with the client's real curriculum
   - The 8 tracks (`foundation_easy`, `growth_pro`, etc.) currently use the same task pool with different intensities — split per-track if needed

2. **Family tree members** (Supabase → `family_tree` table)
   - 7 placeholder leaders are seeded
   - Edit names, photos (`photo_url`), bios, and contact emails directly in Supabase Table Editor

3. **Event codes** (Supabase → `event_codes` table)
   - 3 sample codes seeded: `LIVE2026`, `LAUNCH`, `WELCOME`
   - Add real codes via Supabase Table Editor — set `code`, `description`, `points_value`, optional `max_uses` and `expires_at`

4. **Skool lesson links** (`src/lib/roadmap/generator.ts`)
   - Currently each task links to `https://www.skool.com/nmo/classroom?day=N`
   - Update to specific lesson URLs once the client provides them

---

## 🔒 Security Notes

- All tables use Row Level Security (RLS) — users can only modify their own data
- Profiles are publicly readable to authenticated users (needed for leaderboard)
- Code redemption uses an atomic Postgres function (prevents double-spending)
- No service role key is used in the client — only the safe `anon` key

---

## ⚠️ Known Limitations (by design, for 24-hour scope)

- **Streak counter is not auto-incremented yet.** The `streak_count` column exists; a daily cron or login-trigger to increment it is a Phase 2 task. Currently it stays at the value last set.
- **No Skool API integration.** The Skool URL is stored as a string only — Skool has no public OAuth. This was confirmed with the client.
- **No badge system.** The 10-badge gamification from the spec was deferred to Phase 2.
- **No password reset flow.** Users can use Supabase's built-in "magic link" via the login form if needed; full forgot-password UI is Phase 2.
- **No mobile push notifications.** Phase 2.

---

## 🤝 Phase 2 Suggestions

- Streak auto-increment via `pg_cron` or a server action on login
- 10-badge automatic awards (e.g., "First Week", "Halfway There", "30-Day Champion")
- Daily reminder emails via Supabase Edge Functions + Resend
- Admin panel for client (Jack) to manually award points and edit family tree from UI
- Per-track unique task content (currently shared task bank)
- Password reset flow

Built with 🔥 for NMO.
