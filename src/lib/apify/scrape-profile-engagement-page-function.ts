// Apify Playwright Scraper pageFunction for the per-user engagement scrape.
//
// Receives a list of Skool handles in customData.handles. Logs in once
// with the watcher account, then visits each /@handle profile page in
// sequence and emits engagement_events rows:
//
//   - 'post'    — a top-level post the user authored in a community
//   - 'comment' — a comment they wrote on someone else's post
//   - 'reply'   — a reply to another comment (depth >= 1 in the thread)
//   - 'like'    — only when Skool exposes a likes-given feed for the
//                 profile (best effort; many profiles don't)
//
// Each emitted event has a stable `source_id` so the DB upsert is
// idempotent — re-running the scrape on the same profile doesn't
// double-count.
//
// Return shape:
//   { ok: true,
//     count: <total events emitted>,
//     per_handle: { <handle>: <count>, ... },
//     events: [...]
//   }

export const SCRAPE_PROFILE_ENGAGEMENT_PAGE_FUNCTION = /* js */ `
async function pageFunction(context) {
  const { page, customData, log } = context;
  const { skoolEmail, skoolPassword, handles, communitySlug } = customData;

  if (!Array.isArray(handles) || handles.length === 0) {
    return { error: 'no_handles' };
  }

  // ---- 1. Login -------------------------------------------------
  log.info('Engagement: logging in for ' + handles.length + ' profile(s)');
  // Skool's WAF JS challenge can take 60-120s before the login page is
  // interactive. Use a long timeout and 'domcontentloaded' (don't wait
  // for every network resource). The framework's pageLoadTimeoutSecs
  // doesn't apply to this in-pageFunction navigation.
  await page.goto('https://www.skool.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 180000,
  });
  try {
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 60000 });
  } catch (e) {
    return { error: 'login_form_not_found', current_url: page.url() };
  }
  await page.fill('input[name="email"], input[type="email"]', skoolEmail);
  await page.fill('input[name="password"], input[type="password"]', skoolPassword);
  await page.click('button[type="submit"]');
  try {
    await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 30000 });
  } catch (e) {
    // fall through
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

  // ---- 2. Helpers ----------------------------------------------
  const events = [];
  const perHandle = {};
  // Avatars harvested in-flight from each profile's og:image tag.
  // Reusing this scrape for avatars kills the need for a separate
  // avatar-backfill run — same compute, two outputs.
  const avatars = {};
  // Diagnostic dump per handle so we can see what the page actually
  // looks like in production. Only the first 5 anchors per pattern
  // to keep payload size sane.
  const diagnostics = {};

  function pushEvent(handle, ev) {
    if (!ev || !ev.source_id || !ev.event_type) return;
    events.push({
      skool_handle: handle,
      event_type: ev.event_type,
      source_id: ev.source_id,
      target_post_id: ev.target_post_id || null,
      target_post_url: ev.target_post_url || null,
      content_excerpt: ev.content_excerpt || null,
      occurred_at: ev.occurred_at || null,
      // Per-post audience metrics. 0 if not parseable.
      likes_received: Math.max(0, parseInt(ev.likes_received, 10) || 0),
      comments_received: Math.max(0, parseInt(ev.comments_received, 10) || 0),
    });
    perHandle[handle] = (perHandle[handle] || 0) + 1;
  }

  // ---- 3. Iterate profiles -------------------------------------
  for (const rawHandle of handles) {
    const handle = String(rawHandle || '').trim().toLowerCase();
    if (!handle || !/^[a-z0-9._-]+$/.test(handle)) {
      log.warning('Skipping invalid handle: ' + rawHandle);
      continue;
    }

    // CRITICAL: Skool now hides Contributions until you pick a community
    // via the "Select a group" dropdown. Profile pages WITHOUT ?g=<slug>
    // render an empty contributions section, which is why the scraper
    // returned 0 events for any account. The communitySlug comes from
    // customData; for NMO it's 'nmo'.
    const profileUrl =
      'https://www.skool.com/@' + handle + '?g=' + encodeURIComponent(communitySlug);
    try {
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      log.warning(handle + ': goto failed — ' + e.message);
      continue;
    }
    if (page.url().includes('/login')) {
      return { error: 'session_lost', current_url: page.url() };
    }

    // Free avatar pickup — the og:image meta tag is server-rendered,
    // so we don't pay any extra time for this. Same scrape now also
    // refreshes nmo_members.avatar_url.
    try {
      const avatarUrl = await page.evaluate(() => {
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
      if (avatarUrl) avatars[handle] = avatarUrl;
    } catch (e) { /* swallow */ }

    // Let Skool hydrate. Profile activity loads via XHR after mount,
    // not server-rendered, so we wait for contribution-card-shaped
    // content. The previous wait used /post/ /comment/ paths which
    // Skool doesn't use anymore — they use /<slug>?p=<id> or just
    // anchors into /<slug>.
    try {
      await page.waitForSelector(
        'a[href*="?p="], a[href^="/' + communitySlug + '"], [class*="contribution" i], [class*="ribution"]',
        { timeout: 30000 }
      );
    } catch (e) {
      // proceed anyway — DOM walk below will surface what's there
    }
    // Give the contributions area a bit more breathing room.
    try { await page.waitForTimeout(1500); } catch (e) { /* ignore */ }

    // Paginate through "Next" until disabled. Skool replaced the
    // infinite-scroll feed with classic pagination on contributions —
    // page 1 only has 30 events, even for users with hundreds. Cap at
    // 10 pages (~300 events) so we never burn CU on a runaway loop.
    const MAX_PAGES = 10;
    let lastPageHash = '';
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      // Surface lazy-loaded contributions on the current page.
      try {
        let last = 0;
        for (let i = 0; i < 3; i++) {
          const cur = await page.evaluate(() => document.body.scrollHeight);
          if (cur === last) break;
          last = cur;
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(600);
        }
      } catch (e) { /* ignore */ }

    // Diagnostic v2: dump the actual card HTML so we can see how
    // Skool distinguishes post/comment/reply cards and where the
    // likes/comments counts live in the DOM. Only the first 3 cards
    // per handle to keep payload small.
    if (pageNum === 1 && !diagnostics[handle]) {
      try {
        const diag = await page.evaluate((slug) => {
          const slugPrefix = '/' + slug + '/';

          // Find anchor cards (links into a post/comment) and walk up
          // to the contribution wrapper.
          const anchorCards = [];
          const seenWrappers = new Set();
          const links = Array.from(document.querySelectorAll('a[href]'));
          for (const a of links) {
            const href = a.getAttribute('href') || '';
            if (!href.startsWith(slugPrefix)) continue;
            if (href.indexOf(slugPrefix + 'about') === 0) continue;
            if (href.indexOf(slugPrefix + '-/') === 0) continue;
            if (href.indexOf(slugPrefix + 'classroom') === 0) continue;
            const card = a.closest(
              '[class*="contribution"], [class*="ribution"], [class*="card"], [class*="post"], article, li, [role="listitem"]'
            ) || a.parentElement;
            if (!card) continue;
            if (seenWrappers.has(card)) continue;
            seenWrappers.add(card);
            // Capture details. Truncate HTML aggressively — we just
            // need the structure, not the full content.
            const verbHints = [];
            const txt = (card.innerText || '').toLowerCase();
            ['posted', 'commented', 'replied', 'reply', 'replying', 'in reply'].forEach(function(v) {
              if (txt.indexOf(v) !== -1) verbHints.push(v);
            });
            anchorCards.push({
              href: href,
              card_class: (card.className || '').toString().slice(0, 200),
              card_tag: card.tagName,
              verb_hints: verbHints,
              first_text_lines: (card.innerText || '').split('\\n').filter(function(s) { return s.trim(); }).slice(0, 6),
              outer_html_snip: (card.outerHTML || '').replace(/\\s+/g, ' ').slice(0, 1500),
            });
            if (anchorCards.length >= 3) break;
          }

          // Also dump the entire body's first 2000 chars of innerText
          // so I can see how Skool labels the user/verb/timestamp
          // sequence.
          const bodyText = (document.body.innerText || '').slice(0, 2000);

          return {
            url: location.href,
            title: document.title,
            body_text_head: bodyText,
            anchor_cards: anchorCards,
            contributions_count_text:
              (document.body.innerText.match(/(\\d+)\\s+contribution/i) || [])[0] || null,
          };
        }, communitySlug);
        diagnostics[handle] = diag;
        log.info(handle + ': diag — ' + diag.anchor_cards.length + ' cards captured');
      } catch (e) {
        log.warning(handle + ': diagnostic dump failed — ' + e.message);
      }
    }

    // Strategy A: walk __NEXT_DATA__ for post/comment-shaped nodes
    // authored by this user. Stable ids inside __NEXT_DATA__ make the
    // best source_ids; fall back to URL hash otherwise.
    let extracted = [];
    try {
      const raw = await page.evaluate(() => {
        const el = document.getElementById('__NEXT_DATA__');
        return el ? el.textContent : null;
      });
      if (raw) {
        const parsed = JSON.parse(raw);
        extracted = walkNextDataForActivity(parsed, handle);
      }
    } catch (e) {
      log.warning(handle + ': __NEXT_DATA__ walk failed — ' + e.message);
    }
    for (const ev of extracted) pushEvent(handle, ev);

    // Strategy B: DOM anchor walk. Catches activity that __NEXT_DATA__
    // didn't include (e.g. rendered lazily by client-side fetch).
    // For each anchor we also try to read the like / comment counts
    // from the surrounding card so the dashboard can show
    // "likes received" and "comments on my posts".
    const domEvents = await page.evaluate(({ communitySlug }) => {
      // Pull the first integer out of an element's text. Handles "12",
      // "12 likes", "Likes: 12", "1.2k" (returns 1200).
      function parseCount(text) {
        if (!text) return 0;
        const t = String(text).trim().toLowerCase();
        const km = t.match(/([0-9]+(?:\\.[0-9]+)?)\\s*([km])/);
        if (km) {
          const base = parseFloat(km[1]);
          const mult = km[2] === 'k' ? 1000 : 1000000;
          return Math.round(base * mult);
        }
        const m = t.match(/([0-9]+)/);
        return m ? parseInt(m[1], 10) : 0;
      }

      // Look inside a card for a label/icon that maps to a count.
      // Returns null if nothing plausible is present.
      function findCountByHints(card, hints) {
        if (!card) return null;
        // 1. aria-label / title attributes are usually accurate.
        const candidates = card.querySelectorAll('[aria-label], [title]');
        for (const el of candidates) {
          const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
          if (hints.some((h) => aria.includes(h))) {
            // Try the element's own text first, then a sibling count.
            const own = parseCount(el.textContent);
            if (own > 0) return own;
            const sib = el.nextElementSibling;
            if (sib) {
              const sc = parseCount(sib.textContent);
              if (sc > 0) return sc;
            }
          }
        }
        // 2. Fallback: scan small text nodes for "N likes" / "N comments".
        const text = card.textContent || '';
        for (const hint of hints) {
          const re = new RegExp('([0-9]+(?:\\\\.[0-9]+)?[km]?)\\\\s*' + hint + 's?', 'i');
          const m = text.match(re);
          if (m) return parseCount(m[1]);
        }
        return null;
      }

      // Tiny stable hash (FNV-1a 32-bit) for generating unique source_ids
      // for comments/replies where the parent slug is shared.
      function fnv1a(s) {
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return h.toString(16);
      }

      // Walk Skool's contribution wrappers — each one is a single
      // post or comment by the profile user. Class includes
      // "PostItemContent" reliably.
      const wrappers = Array.from(
        document.querySelectorAll('[class*="PostItemContent"]')
      );
      const out = [];
      const seenIds = new Set();

      const slugPrefix = '/' + communitySlug + '/';

      for (const wrapper of wrappers) {
        const text = (wrapper.innerText || '').trim();
        if (!text) continue;

        // Find the FIRST anchor inside this wrapper that points to the
        // community content — gives us the parent post slug.
        const anchor = wrapper.querySelector('a[href^="' + slugPrefix + '"]');
        const href = anchor ? anchor.getAttribute('href') : '';

        const slugMatch = href.match(new RegExp('^/' + communitySlug + '/([^/?#]+)'));
        const baseSlug = (slugMatch && slugMatch[1]) || null;
        if (!baseSlug) continue;

        // Classify by text pattern:
        //   POST card: tail is likes-count, comments-count, "New comment"
        //   COMMENT card: contains "N likes ... time" inline (the user's
        //     own comment metadata). Bullet variants vary so use a
        //     looser separator class.
        const commentMatch = text.match(/(\\d+)\\s+likes?\\s+\\S\\s*\\d+\\s*[smhdw]/i);
        const isComment = !!commentMatch;
        let eventType = isComment ? 'comment' : 'post';

        // Counts
        let likesReceived = 0;
        let commentsReceived = 0;
        if (isComment) {
          likesReceived = parseInt(commentMatch[1], 10) || 0;
        } else {
          // Look for likes, comments, "New comment" trio at end of card text.
          const tail = text.match(/\\n(\\d+)\\n(\\d+)\\n*\\s*New comment/);
          if (tail) {
            likesReceived = parseInt(tail[1], 10) || 0;
            commentsReceived = parseInt(tail[2], 10) || 0;
          } else {
            // Fallback to old findCountByHints in the wrapper
            likesReceived = findCountByHints(wrapper, ['like', 'thank', 'heart']) || 0;
            commentsReceived = findCountByHints(wrapper, ['comment', 'reply']) || 0;
          }
        }

        // source_id strategy: posts use the slug; comments hash the
        // wrapper text's last line (the comment body) so multiple
        // comments on the same parent post get distinct stable ids.
        let sourceId;
        if (isComment) {
          // Take the LAST text line (the comment body) so we don't
          // include the parent post text in the hash.
          const lines = text.split('\\n').map(function(l) { return l.trim(); }).filter(Boolean);
          const last = lines[lines.length - 1] || '';
          sourceId = 'comment:' + baseSlug + ':' + fnv1a(last.slice(0, 200));
        } else {
          sourceId = 'post:' + baseSlug;
        }
        if (seenIds.has(sourceId)) continue;
        seenIds.add(sourceId);

        // Excerpt: title for posts, comment text for comments
        let excerpt = null;
        if (isComment) {
          const lines = text.split('\\n').map(function(l) { return l.trim(); }).filter(Boolean);
          excerpt = (lines[lines.length - 1] || '').slice(0, 280);
        } else {
          // For posts the title appears after the category emoji line.
          const lines = text.split('\\n').map(function(l) { return l.trim(); }).filter(Boolean);
          // Skip lines that are just numbers (avatar level badge), then
          // skip name + meta. Title is the first multi-word, non-emoji,
          // non-time line we find after the category emoji.
          let foundCategory = false;
          for (const line of lines) {
            if (line.indexOf('💬') === 0 || line.indexOf('🏃') === 0 ||
                line.indexOf('👋') === 0 || line.indexOf('💪') === 0 ||
                line.indexOf('👑') === 0 || line.indexOf('📖') === 0) {
              foundCategory = true;
              continue;
            }
            // Accept even 1-char titles (single CJK characters are common
            // — skoolclaudeuse's "嗨" is one character). Just reject
            // pure-numeric lines (which are likes/comments counters) and
            // the "New comment X ago" footer.
            if (foundCategory && line.length >= 1 &&
                !/^[0-9]+$/.test(line) &&
                line.indexOf('New comment') !== 0) {
              excerpt = line.slice(0, 280);
              break;
            }
          }
        }

        out.push({
          event_type: eventType,
          source_id: sourceId,
          target_post_url: href.startsWith('http') ? href : ('https://www.skool.com' + href),
          target_post_id: baseSlug,
          content_excerpt: excerpt,
          likes_received: likesReceived,
          comments_received: commentsReceived,
        });
      }

      return out;
    }, { communitySlug });

    for (const ev of domEvents) pushEvent(handle, ev);

      // Click "Next" if available + enabled. Skool's pagination control
      // is at the bottom of the contributions list; the button shows
      // as disabled/grey when there's no further page.
      const clicked = await page.evaluate(() => {
        // Find any element whose visible text is exactly "Next"
        // (case-insensitive, allow trailing arrow glyphs).
        const all = Array.from(document.querySelectorAll('button, a, span'));
        for (const el of all) {
          const txt = (el.textContent || '').trim().toLowerCase();
          if (txt !== 'next' && txt !== 'next >' && txt !== 'next›') continue;
          // Walk up to the nearest clickable ancestor + check disabled
          let target = el;
          for (let depth = 0; depth < 4; depth++) {
            const cls = (target.className || '').toString().toLowerCase();
            const aria = target.getAttribute && target.getAttribute('aria-disabled');
            const disabled = target.hasAttribute && (
              target.hasAttribute('disabled') ||
              aria === 'true' ||
              cls.indexOf('disabled') >= 0
            );
            if (disabled) return false;
            if (target.tagName === 'BUTTON' || target.tagName === 'A') {
              target.click();
              return true;
            }
            target = target.parentElement;
            if (!target) break;
          }
        }
        return false;
      });
      if (!clicked) {
        log.info(handle + ': no more pages after ' + pageNum);
        break;
      }

      // Wait for new contributions to render. Pagination usually
      // re-renders the list within ~1s; an extra 500ms is buffer.
      await page.waitForTimeout(1500);

      // Bail if the page hash didn't change — defensive against an
      // un-disabled Next that doesn't actually advance.
      const newHash = await page.evaluate(() =>
        (document.querySelector('main') || document.body).innerHTML.length.toString()
      );
      if (newHash === lastPageHash) {
        log.info(handle + ': Next clicked but content unchanged at page ' + pageNum);
        break;
      }
      lastPageHash = newHash;
    } // end pagination loop

    log.info(handle + ': emitted ' + (perHandle[handle] || 0) + ' event(s)');
  }

  return {
    ok: true,
    count: events.length,
    per_handle: perHandle,
    events,
    avatars, // { handle: avatarUrl }
    diagnostics, // { handle: { url, title, total_anchors, patterns, sample_hrefs, ... } }
  };

  // ---- inline helpers (defined as JS expressions because pageFunction
  // is a single function passed into Apify) -----------------------
  function walkNextDataForActivity(root, handle) {
    const out = [];
    const seen = new Set();
    const stack = [root];

    function pushIfActivity(node) {
      if (!node || typeof node !== 'object') return;
      // Activity-shaped nodes typically have: id, body or title, and
      // some author marker (user.handle / user.name / userId / authorId).
      const keys = Object.keys(node);
      const idVal = node.id || node._id;
      const body = node.body || node.content || node.text;
      const title = node.title;
      const url = node.url || node.canonicalUrl || node.permalink;
      const hasContent = (typeof body === 'string' && body.length > 0) ||
                         (typeof title === 'string' && title.length > 0);
      if (!idVal || !hasContent) return;

      // Author match — be liberal in how we accept it.
      const author = node.user || node.author || node.member || {};
      const authorHandle = ((
        (typeof author === 'object' && (author.handle || author.username || author.slug || author.name)) ||
        node.authorHandle || node.userHandle || ''
      ) + '').replace(/^@+/, '').toLowerCase();
      if (!authorHandle || authorHandle !== handle) return;

      const type = node.type || (node.parentId || node.commentId ? 'comment' : 'post');
      const eventType =
        type === 'reply' || node.parentId ? 'reply' :
        type === 'comment' ? 'comment' :
        'post';

      const sourceId = eventType + ':' + idVal;
      if (seen.has(sourceId)) return;
      seen.add(sourceId);

      // Skool stores audience metrics under a handful of names — check
      // the common ones plus a few nested shapes.
      const likeKeys = ['likesCount', 'likeCount', 'reactionsCount', 'numLikes', 'totalLikes'];
      const commentKeys = ['commentsCount', 'commentCount', 'numComments', 'totalComments', 'replyCount'];
      let likesReceived = 0;
      let commentsReceived = 0;
      for (const k of likeKeys) {
        const v = node[k];
        if (typeof v === 'number' && v >= 0) { likesReceived = v; break; }
        if (typeof v === 'string' && /^\\d+$/.test(v)) { likesReceived = parseInt(v, 10); break; }
      }
      for (const k of commentKeys) {
        const v = node[k];
        if (typeof v === 'number' && v >= 0) { commentsReceived = v; break; }
        if (typeof v === 'string' && /^\\d+$/.test(v)) { commentsReceived = parseInt(v, 10); break; }
      }
      // Nested 'stats' or 'metrics' objects
      for (const sk of ['stats', 'metrics', 'engagement', 'counts']) {
        const sub = node[sk];
        if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
          if (!likesReceived) {
            for (const k of likeKeys) {
              const v = sub[k];
              if (typeof v === 'number' && v >= 0) { likesReceived = v; break; }
            }
          }
          if (!commentsReceived) {
            for (const k of commentKeys) {
              const v = sub[k];
              if (typeof v === 'number' && v >= 0) { commentsReceived = v; break; }
            }
          }
        }
      }

      out.push({
        event_type: eventType,
        source_id: sourceId,
        target_post_id: String(idVal),
        target_post_url: typeof url === 'string' && url.startsWith('http')
          ? url
          : (typeof url === 'string' ? 'https://www.skool.com' + url : null),
        content_excerpt: (typeof title === 'string' && title) ||
                         (typeof body === 'string' && body.slice(0, 280)) || null,
        occurred_at: node.createdAt || node.created_at || node.publishedAt || null,
        likes_received: eventType === 'post' ? likesReceived : 0,
        comments_received: eventType === 'post' ? commentsReceived : 0,
      });
    }

    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      if (Array.isArray(n)) { for (const v of n) stack.push(v); continue; }
      if (typeof n !== 'object') continue;
      pushIfActivity(n);
      for (const v of Object.values(n)) {
        if (v && typeof v === 'object') stack.push(v);
      }
    }
    return out;
  }
}
`;
