// JavaScript source for the Apify `apify/web-scraper` actor's
// `pageFunction`. Apify runs this inside its browser instance with
// our credentials in `customData`.
//
// Strategy: login → navigate to /<slug>/-/members → wait for member
// anchors → scroll-load → try TWO extraction strategies in parallel:
//   A. parse __NEXT_DATA__ JSON (fast/clean when present)
//   B. walk the DOM for `a[href^="/@"]` anchors (always works as long
//      as the page rendered)
// Whichever yields more rows wins. Either way we attach a `debug`
// object so when this fails the admin UI can see exactly what we saw.

export const SCRAPE_MEMBERS_PAGE_FUNCTION = /* js */ `
async function pageFunction(context) {
  const { page, customData, log } = context;
  const { skoolEmail, skoolPassword, communitySlug } = customData;
  const debug = { stages: [] };
  const memberPaths = ['/-/members', '/members'];

  // ---- 1. Login --------------------------------------------------
  // Use domcontentloaded instead of networkidle — Skool runs constant
  // background traffic (analytics, websockets) so networkidle rarely
  // fires within the budget. We then waitForSelector for the actual
  // element we care about, which is the real readiness signal.
  log.info('Login: opening login page');
  await page.goto('https://www.skool.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 20000 });
  } catch (e) {
    return { error: 'login_form_not_found', debug, current_url: page.url() };
  }
  await page.fill('input[name="email"], input[type="email"]', skoolEmail);
  await page.fill('input[name="password"], input[type="password"]', skoolPassword);
  // Click submit and wait until the URL changes off /login. Don't
  // wait on networkidle.
  await page.click('button[type="submit"]');
  try {
    await page.waitForFunction(
      () => !location.pathname.includes('/login'),
      { timeout: 30000 },
    );
  } catch (e) {
    // Still on /login → fall through to the error-detection block
  }

  if (page.url().includes('/login')) {
    const html = await page.content();
    const lower = html.toLowerCase();
    let hint = 'login_failed';
    if (lower.includes('captcha')) hint = 'login_captcha';
    else if (lower.includes("verify it's you") || lower.includes('verify your')) hint = 'login_verify_email';
    else if (lower.includes('incorrect') || lower.includes('invalid')) hint = 'login_bad_creds';
    return { error: hint, debug, current_url: page.url() };
  }
  debug.stages.push({ stage: 'logged_in', url: page.url() });
  log.info('Login: ok, at ' + page.url());

  // ---- 2. Navigate to members page ------------------------------
  let loaded = false;
  for (const p of memberPaths) {
    const u = 'https://www.skool.com/' + communitySlug + p;
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (page.url().includes('/login')) {
        return { error: 'session_lost_after_login', debug, current_url: page.url() };
      }
      if (page.url().includes(p)) { loaded = true; debug.stages.push({ stage: 'members_page', url: page.url(), via: p }); break; }
      log.info('Path ' + p + ' redirected to ' + page.url());
    } catch (e) {
      log.warning('Goto ' + u + ' failed: ' + e.message);
    }
  }
  if (!loaded) {
    return { error: 'members_page_unreachable', debug, tried: memberPaths, current_url: page.url() };
  }

  // ---- 3. Wait for the member list to actually render -----------
  // Skool fetches the roster client-side after first paint. If we
  // extract before the fetch completes we get zero results. Wait
  // until at least one profile anchor exists or 20s elapse.
  try {
    await page.waitForSelector('a[href^="/@"]', { timeout: 20000 });
    debug.stages.push({ stage: 'anchors_appeared' });
  } catch (e) {
    // Don't bail yet — DOM walker will report 0, then we fall back
    // to dumping a slice of HTML for debugging.
    debug.stages.push({ stage: 'wait_anchors_timeout', err: e.message });
  }

  // ---- 4. Scroll to lazy-load all members ----------------------
  // Cap iterations + early-stop on two consecutive no-growth ticks.
  let lastCount = -1;
  let stable = 0;
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.scrollBy(0, 4000));
    await page.waitForTimeout(500);
    const c = await page.evaluate(() => document.querySelectorAll('a[href^="/@"]').length);
    if (c === lastCount && c > 0) {
      stable += 1;
      if (stable >= 2) break;
    } else {
      stable = 0;
    }
    lastCount = c;
  }
  debug.stages.push({ stage: 'scrolled', anchor_count: lastCount });
  log.info('Scrolled, ' + lastCount + ' profile anchors visible');

  // ---- 4b. Settle lazy-loaded images BEFORE extraction --------
  // Skool uses <img loading="lazy"> via IntersectionObserver. The
  // images that scrolled past the viewport (top OR bottom) may have
  // unloaded or never loaded their real src. Without this pass, ~60%
  // of avatars come back null even though the data is there.
  await page.evaluate(() => {
    // Force every <img> to load eagerly NOW
    for (const img of document.querySelectorAll('img')) {
      img.loading = 'eager';
      // Trigger srcset/src reload by re-assigning. Some lazy
      // libraries hold the URL in dataset until in-viewport.
      const ds = img.getAttribute('data-src');
      if (ds && (!img.src || img.src.startsWith('data:'))) img.src = ds;
      const dss = img.getAttribute('data-srcset');
      if (dss && !img.srcset) img.srcset = dss;
    }
  });
  // Scroll-to-top then scroll-to-bottom to trip every observer
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  // Wait for currently-pending images to finish loading (cap 6s)
  const settled = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img')].filter(i => !i.complete);
    const total = document.querySelectorAll('img').length;
    await Promise.all(imgs.map(img =>
      new Promise(resolve => {
        const t = setTimeout(resolve, 6000);
        img.addEventListener('load', () => { clearTimeout(t); resolve(); }, { once: true });
        img.addEventListener('error', () => { clearTimeout(t); resolve(); }, { once: true });
      })
    ));
    return { total, was_pending: imgs.length };
  });
  debug.stages.push({ stage: 'images_settled', ...settled });
  log.info('Images settled: ' + settled.total + ' total, ' + settled.was_pending + ' had to load');

  // ---- 5a. Extraction strategy A: __NEXT_DATA__ ----------------
  let membersA = [];
  let extractionA;
  let sampleUserNodeKeys = null;
  let sampleUserNodeShape = null;
  try {
    const nd = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? el.textContent : null;
    });
    if (!nd) {
      extractionA = { ok: false, reason: 'no_next_data_script' };
    } else {
      const parsed = JSON.parse(nd);

      // Direct + nested-object avatar key search. Skool sometimes
      // stores the picture inside metadata.{pictureProfile,...} or
      // a nested image:{url:...}. Walk a few levels deep.
      function deepFindAvatar(o, depth) {
        if (!o || typeof o !== 'object' || depth > 4) return null;
        const directKeys = [
          'avatarUrl','avatar_url','profilePictureUrl','profile_picture_url',
          'profileImageUrl','profileImage','profilePicture',
          'pictureUrl','picture','photoUrl','photo',
          'imageUrl','image','thumbnailUrl','thumbnail','avatar',
          'pictureProfile','profilePic',
        ];
        for (const k of directKeys) {
          const v = o[k];
          if (typeof v === 'string' && /^https?:\\/\\//.test(v)) return v;
          // Nested {url:'...'} shape
          if (v && typeof v === 'object' && typeof v.url === 'string' && /^https?:\\/\\//.test(v.url)) {
            return v.url;
          }
        }
        // Recurse into a few likely containers
        for (const k of ['profile','metadata','user','member','data','attributes']) {
          if (o[k] && typeof o[k] === 'object') {
            const r = deepFindAvatar(o[k], depth + 1);
            if (r) return r;
          }
        }
        return null;
      }

      const byHandle = new Map();
      const stack = [parsed];
      while (stack.length) {
        const node = stack.pop();
        if (Array.isArray(node)) { for (const v of node) stack.push(v); continue; }
        if (!node || typeof node !== 'object') continue;
        const keys = Object.keys(node);
        const hasHandle = keys.some(k => ['name','username','handle','slug'].includes(k));
        const hasId     = keys.some(k => ['id','_id','userId'].includes(k));
        const isPost    = keys.some(k => ['content','body','text','title'].includes(k));
        if (hasHandle && hasId && !isPost) {
          let handle = null;
          for (const k of ['name','username','handle','slug']) {
            const v = node[k];
            if (typeof v === 'string' && v) { handle = v.replace(/^@+/, '').toLowerCase().trim(); break; }
          }
          if (handle && handle.length >= 2 && /^[a-z0-9._-]+$/.test(handle)) {
            // First-found sample for debugging — just keys + tiny
            // values, not the full object (could be huge).
            if (!sampleUserNodeKeys) {
              sampleUserNodeKeys = Object.keys(node);
              const sh = {};
              for (const [k, v] of Object.entries(node)) {
                if (v === null) sh[k] = 'null';
                else if (typeof v === 'string') sh[k] = v.length > 80 ? 'string(' + v.slice(0, 60) + '…)' : 'string("' + v + '")';
                else if (typeof v === 'number') sh[k] = 'number(' + v + ')';
                else if (typeof v === 'boolean') sh[k] = 'bool';
                else if (Array.isArray(v)) sh[k] = 'array(len=' + v.length + ')';
                else if (typeof v === 'object') sh[k] = 'object(' + Object.keys(v).slice(0, 5).join(',') + ')';
              }
              sampleUserNodeShape = sh;
            }

            let displayName = null;
            for (const k of ['displayName','fullName','title','name']) {
              const v = node[k];
              if (typeof v === 'string' && v) { displayName = v.trim(); break; }
            }
            const avatarUrl = deepFindAvatar(node, 0);
            let level = null;
            for (const k of ['level','memberLevel','userLevel','rank']) {
              const v = node[k];
              if (typeof v === 'number' && v > 0 && v < 100) { level = v; break; }
              if (typeof v === 'string' && /^\\d+$/.test(v)) {
                const n = parseInt(v, 10);
                if (n > 0 && n < 100) { level = n; break; }
              }
            }
            byHandle.set(handle, { handle, display_name: displayName, avatar_url: avatarUrl, level });
          }
        }
        for (const v of Object.values(node)) {
          if (v && typeof v === 'object') stack.push(v);
        }
      }
      membersA = Array.from(byHandle.values());
      const withAvatar = membersA.filter(m => m.avatar_url).length;
      extractionA = {
        ok: true,
        count: membersA.length,
        with_avatar: withAvatar,
        next_data_top_keys: Object.keys(parsed).slice(0, 20),
        sample_user_keys: sampleUserNodeKeys,
        sample_user_shape: sampleUserNodeShape,
      };
    }
  } catch (e) {
    extractionA = { ok: false, reason: 'next_data_error', detail: e.message };
  }
  debug.extractionA = extractionA;
  log.info('Extraction A (__NEXT_DATA__): ' + JSON.stringify(extractionA));

  // ---- 5b. Extraction strategy B: DOM anchor walk --------------
  // Walks every \`a[href^="/@"]\` on the page. Handles:
  //   - <img src> standard
  //   - <img data-src> / <img loading="lazy"> — Skool may use lazy
  //   - <img srcset> — Next/Image emits srcset; pick first http URL
  //   - <div style="background-image: url(...)"> — fallback
  //   - <picture><source srcset="..."> — fallback
  let membersB = await page.evaluate(() => {
    function pickImgUrl(img) {
      if (!img) return null;
      // Order matters: currentSrc reflects the actual loaded URL.
      const candidates = [
        img.currentSrc,
        img.src,
        img.getAttribute('data-src'),
        img.getAttribute('data-original'),
        img.getAttribute('data-lazy-src'),
      ];
      for (const c of candidates) {
        if (typeof c === 'string' && /^https?:\\/\\//.test(c)) return c;
      }
      // srcset: "url1 1x, url2 2x" — first URL wins
      const srcset = img.getAttribute('srcset');
      if (typeof srcset === 'string' && srcset.length) {
        const first = srcset.split(',')[0].trim().split(/\\s+/)[0];
        if (/^https?:\\/\\//.test(first)) return first;
      }
      return null;
    }
    function pickBgUrl(el) {
      if (!el) return null;
      const styled = el.matches('[style*="background"]') ? el : el.querySelector('[style*="background"]');
      if (!styled) return null;
      const style = styled.getAttribute('style') || '';
      const m = style.match(/url\\((['"]?)(https?:\\/\\/[^'")\\s]+)\\1\\)/);
      return m ? m[2] : null;
    }
    function findCard(el) {
      // Climb up to a card-like ancestor — match common Skool/Next class patterns.
      let cur = el;
      for (let i = 0; i < 8; i++) {
        if (!cur || !cur.parentElement) break;
        cur = cur.parentElement;
        if (cur.tagName === 'LI' || cur.tagName === 'ARTICLE') return cur;
        const cls = cur.className || '';
        if (typeof cls === 'string' && /[Mm]ember|[Uu]ser|[Pp]rofile|[Cc]ard|[Rr]ow/.test(cls)) {
          return cur;
        }
      }
      return el.parentElement || el;
    }

    const out = [];
    const seen = new Set();
    let stats_card_has_img = 0;
    let stats_card_no_img = 0;
    let stats_img_no_src = 0;
    const anchors = document.querySelectorAll('a[href^="/@"]');
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\\/@([^/?#]+)/);
      if (!m) continue;
      const handle = m[1].toLowerCase();
      if (handle.length < 2 || seen.has(handle) || !/^[a-z0-9._-]+$/.test(handle)) continue;
      seen.add(handle);

      // Display name
      let displayName = (a.textContent || '').trim();
      if (displayName.length > 80 || !displayName) {
        const card = findCard(a);
        const heading = card.querySelector('[class*="Name"], h1, h2, h3, h4, h5');
        if (heading) {
          const t = (heading.textContent || '').trim();
          if (t && t.length < 80) displayName = t;
        }
      }

      // Avatar: try anchor itself first (may wrap an <img>), then card
      const card = findCard(a);
      const cardImg = a.querySelector('img') || card.querySelector('img');
      let avatarUrl = pickImgUrl(cardImg);
      if (!avatarUrl) avatarUrl = pickBgUrl(card);

      // Diagnostics — distinguishes "Skool has no avatar for this
      // user" (no <img> in card) from "we found <img> but no src"
      if (!cardImg) stats_card_no_img += 1;
      else {
        stats_card_has_img += 1;
        if (!avatarUrl) stats_img_no_src += 1;
      }

      out.push({ handle, display_name: displayName || null, avatar_url: avatarUrl, level: null });
    }
    return { rows: out, stats: { card_has_img: stats_card_has_img, card_no_img: stats_card_no_img, img_no_src: stats_img_no_src } };
  });
  // membersB used to be a flat array; now it's { rows, stats }
  const domStats = membersB.stats || {};
  membersB = membersB.rows || [];
  debug.extractionB = {
    count: membersB.length,
    with_avatar: membersB.filter(m => m.avatar_url).length,
    stats: domStats,
  };
  log.info(
    'Extraction B (DOM): ' + membersB.length + ' anchors, ' +
    debug.extractionB.with_avatar + ' with avatar, ' +
    'card_has_img=' + (domStats.card_has_img || 0) + ' card_no_img=' + (domStats.card_no_img || 0) + ' img_no_src=' + (domStats.img_no_src || 0)
  );

  // ---- 6. Merge — prefer the row with MORE info per handle. ----
  // Different strategies fill different fields. Combine by handle,
  // taking whichever side has the value (display_name from either,
  // avatar from whichever found one, level from __NEXT_DATA__ since
  // the DOM almost never carries it).
  const merged = new Map();
  for (const m of membersA) merged.set(m.handle, m);
  for (const m of membersB) {
    const cur = merged.get(m.handle);
    if (!cur) merged.set(m.handle, m);
    else {
      // Field-level merge: keep whichever side has the value.
      const combined = {
        handle: m.handle,
        display_name: cur.display_name || m.display_name,
        avatar_url: cur.avatar_url || m.avatar_url,
        level: cur.level != null ? cur.level : m.level,
      };
      merged.set(m.handle, combined);
    }
  }
  let members = Array.from(merged.values());
  let source =
    membersA.length === 0 ? 'dom' :
    membersB.length === 0 ? 'next_data' : 'merged';

  if (members.length === 0) {
    // Capture a slice of HTML so the admin can paste it back to us
    // for diagnosis. Cap at 8KB to keep the dataset record small.
    const html = await page.content();
    return {
      error: 'no_members_found',
      debug,
      url: page.url(),
      title: await page.title(),
      html_excerpt: html.slice(0, 8000),
    };
  }

  log.info('Final: ' + members.length + ' members via ' + source);
  return { ok: true, count: members.length, source, members, debug };
}
`;
