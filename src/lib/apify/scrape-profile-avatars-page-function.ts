// Apify Playwright Scraper pageFunction for the avatar-backfill job.
//
// Receives a list of Skool handles in customData.handles. Logs in
// once with the watcher account, then visits each profile page in
// sequence and extracts the avatar URL using three strategies, in
// preference order:
//
//   1. <meta property="og:image" content="..."> — Skool emits this
//      for social-share previews. It's the actual profile photo.
//      Most reliable.
//   2. Largest <img> on the page that's hosted on a Skool/Cloudfront
//      CDN — fallback when og:image is missing or generic.
//   3. __NEXT_DATA__ user node deep-search — last resort; matches
//      the same key list the members-page scraper uses.
//
// Returns: { ok: true, results: [{handle, avatar_url, error?}, ...] }

export const SCRAPE_PROFILE_AVATARS_PAGE_FUNCTION = /* js */ `
async function pageFunction(context) {
  const { page, customData, log } = context;
  const { skoolEmail, skoolPassword, handles } = customData;

  if (!Array.isArray(handles) || handles.length === 0) {
    return { error: 'no_handles' };
  }

  // ---- 1. Login once -------------------------------------------
  log.info('Backfill: logging in (will fetch ' + handles.length + ' profiles)');
  await page.goto('https://www.skool.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 20000 });
  } catch (e) {
    return { error: 'login_form_not_found', current_url: page.url() };
  }
  await page.fill('input[name="email"], input[type="email"]', skoolEmail);
  await page.fill('input[name="password"], input[type="password"]', skoolPassword);
  await page.click('button[type="submit"]');
  try {
    await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 30000 });
  } catch (e) {
    // fall through, error block below
  }
  if (page.url().includes('/login')) {
    const html = await page.content();
    const lower = html.toLowerCase();
    let hint = 'login_failed';
    if (lower.includes('captcha')) hint = 'login_captcha';
    else if (lower.includes("verify it's you")) hint = 'login_verify_email';
    else if (lower.includes('incorrect') || lower.includes('invalid')) hint = 'login_bad_creds';
    return { error: hint, current_url: page.url() };
  }
  log.info('Login: ok at ' + page.url());

  // ---- 2. Iterate profiles -------------------------------------
  const results = [];
  let counter = 0;

  for (const rawHandle of handles) {
    counter += 1;
    const handle = String(rawHandle || '').trim().toLowerCase();
    if (!handle || !/^[a-z0-9._-]+$/.test(handle)) {
      results.push({ handle: rawHandle, error: 'invalid_handle' });
      continue;
    }
    const url = 'https://www.skool.com/@' + handle;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

      if (page.url().includes('/login')) {
        results.push({ handle, error: 'session_lost' });
        continue;
      }

      // Strategy 1: og:image meta tag (Skool emits for social share)
      let avatarUrl = await page.evaluate(() => {
        const sel = [
          'meta[property="og:image"]',
          'meta[property="og:image:secure_url"]',
          'meta[name="twitter:image"]',
        ];
        for (const s of sel) {
          const el = document.querySelector(s);
          const c = el && el.getAttribute('content');
          if (typeof c === 'string' && /^https?:\\/\\//.test(c)) return c;
        }
        return null;
      });

      // Strategy 2: __NEXT_DATA__ deep search
      if (!avatarUrl) {
        avatarUrl = await page.evaluate(() => {
          const el = document.getElementById('__NEXT_DATA__');
          if (!el) return null;
          let parsed;
          try { parsed = JSON.parse(el.textContent || '{}'); } catch (e) { return null; }
          const directKeys = [
            'avatarUrl','avatar_url','profilePictureUrl','profile_picture_url',
            'profileImageUrl','profileImage','profilePicture',
            'pictureUrl','picture','photoUrl','photo',
            'imageUrl','image','thumbnailUrl','thumbnail','avatar','pictureProfile',
          ];
          function walk(o, depth) {
            if (!o || typeof o !== 'object' || depth > 5) return null;
            for (const k of directKeys) {
              const v = o[k];
              if (typeof v === 'string' && /^https?:\\/\\//.test(v)) return v;
              if (v && typeof v === 'object' && typeof v.url === 'string' && /^https?:\\/\\//.test(v.url)) return v.url;
            }
            for (const v of Object.values(o)) {
              if (v && typeof v === 'object') {
                const r = walk(v, depth + 1);
                if (r) return r;
              }
            }
            return null;
          }
          return walk(parsed, 0);
        });
      }

      // Strategy 3: largest visible <img> hosted on Skool/Cloudfront
      if (!avatarUrl) {
        avatarUrl = await page.evaluate(() => {
          const candidates = [...document.querySelectorAll('img')]
            .map(img => ({
              src: img.currentSrc || img.src,
              area: (img.naturalWidth || 0) * (img.naturalHeight || 0),
            }))
            .filter(x => x.src && /^https?:\\/\\//.test(x.src) &&
              /skool\\.com|cloudfront\\.net|amazonaws\\.com/.test(x.src) &&
              x.area > 2500)
            .sort((a, b) => b.area - a.area);
          return candidates.length ? candidates[0].src : null;
        });
      }

      results.push({ handle, avatar_url: avatarUrl });

      if (counter % 25 === 0) {
        log.info('Progress: ' + counter + ' / ' + handles.length);
      }

      // Small pause so we don't hammer Skool — keeps the residential
      // session looking human, reduces captcha risk.
      await page.waitForTimeout(350);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      results.push({ handle, error: 'goto_failed', detail: msg.slice(0, 200) });
    }
  }

  const found = results.filter(r => r.avatar_url).length;
  log.info('Backfill complete: ' + found + ' / ' + results.length + ' found avatars');

  return { ok: true, count: results.length, found, results };
}
`;
