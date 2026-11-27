// V3rmillion Loader - repairs partially-loaded pages on unreliable (VPN/proxy) connections.
// It only re-requests the site's own resources from the same servers. It never solves or
// skips Cloudflare challenges: if one is shown, it gets out of the way so you can complete it.
//
// v1.2: a continuous scanner. It re-checks the page every few seconds, on scroll/resize,
// when the tab becomes visible, when the network comes back and whenever new content is
// added. It forces anything unloaded (broken, stalled or lazy images, background images,
// stylesheets) to load.
(() => {
  'use strict';
  if (window.__v3lLoaded) return;
  window.__v3lLoaded = true;

  const TAG = '[V3rmillion Loader]';
  const RETRY_DELAYS = [1500, 4000, 9000, 15000, 25000]; // fast phase
  const SLOW_DELAY = 30000;   // after the fast phase, keep retrying visible items this often
  const FAST_TRIES = RETRY_DELAYS.length;
  const MAX_TRIES = 20;       // hard cap per resource (spread over URL variants)
  const STALL_MS = 15000;     // a request still pending after this long is considered stuck
  const SCAN_EVERY = 2500;    // background scan interval
  const NEAR_VIEWPORTS = 2;   // "near" = within 2 screen heights below / 1 above
  const CSS_DELAYS = [0, 1500, 4000];
  const CSS_GRACE_MS = 5000;  // give a new <link> this long before treating it as failed
  const RELOAD_KEY = 'v3l-reloaded-at';
  const ASSET_HOST = /(^|\.)(v3rm\.net|v3rmillion\.net)$/i;
  const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-url'];

  const log = (...a) => console.info(TAG, ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const delayFor = (tries) => (tries < FAST_TRIES ? RETRY_DELAYS[tries] : SLOW_DELAY);
  // Bumps when the network reconnects or the tab becomes visible again: everything
  // unloaded is retried immediately, ignoring its backoff timer.
  let boostAt = 0;

  // ---------- Reporting (popup UI + lifetime stats) ----------
  function report(kind, url = '') {
    try {
      chrome.runtime.sendMessage({ type: 'report', kind, url: String(url).slice(0, 300), page: location.href })
        .catch(() => {});
    } catch { /* extension reloaded / context invalidated */ }
  }

  const isChallengePage = () =>
    /^just a moment/i.test(document.title) ||
    !!document.querySelector('script[src*="/cdn-cgi/challenge-platform/"], #challenge-form, #cf-challenge-running');

  // Append a cache-busting param without re-encoding the existing query
  // (XenForo uses bare "?1794758610" timestamps that URLSearchParams would mangle).
  const withParam = (url, n) => {
    const [base, hash = ''] = String(url).split('#');
    const clean = base.replace(/([?&])_v3l=\d+(&|$)/, (m, a, b) => (b ? a : '')).replace(/[?&]$/, '');
    return clean + (clean.includes('?') ? '&' : '?') + '_v3l=' + n + (hash ? '#' + hash : '');
  };

  function isOurUrl(url) {
    try {
      const u = new URL(url, location.href);
      // Ads are intentionally blocked by Brave Shields / ad blockers; don't fight that.
      return ASSET_HOST.test(u.hostname) && !u.pathname.startsWith('/assets/ad/');
    } catch { return false; }
  }

  function isNear(el) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false; // hidden (display:none, collapsed)
    const vh = window.innerHeight || 800;
    return r.bottom > -vh && r.top < vh * NEAR_VIEWPORTS;
  }

  // ---------- Banner ----------
  function banner(text, actionLabel, action) {
    if (!document.body) return;
    let el = document.getElementById('v3l-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'v3l-banner';
      document.body.appendChild(el);
    }
    el.textContent = '';
    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
    if (actionLabel) {
      const b = document.createElement('button');
      b.textContent = actionLabel;
      b.onclick = action;
      el.appendChild(b);
    }
    const x = document.createElement('button');
    x.textContent = '×';
    x.className = 'v3l-close';
    x.onclick = () => el.remove();
    el.appendChild(x);
  }

  // ---------- Images ----------
  // Per-image state: { tries, nextAt, loadStart, lastAttempt, orig, origSet, failed, fixed }
  const imgState = new WeakMap();

  function stateFor(img, now) {
    let st = imgState.get(img);
    if (!st) {
      st = { tries: 0, nextAt: now, loadStart: now, lastAttempt: 0, orig: null, origSet: null, candidates: null, probing: false, failed: false, fixed: false };
      imgState.set(img, st);
    }
    return st;
  }

  // Build the list of URLs that can stand in for a broken image:
  //   1. the exact original URL(s): src + srcset entries. These can be served from
  //      Cloudflare's edge cache even when the origin is refusing us.
  //   2. other sizes of the same XenForo avatar (s / m / l). Width/height attributes keep
  //      the on-screen size, so a different size still looks right.
  // Each round goes through them as-is first, then again with a cache-busting param.
  function candidatesFor(st) {
    if (st.candidates) return st.candidates;
    const list = [st.orig];
    if (st.origSet) {
      for (const part of st.origSet.split(',')) {
        const u = part.trim().split(/\s+/)[0];
        if (u) list.push(u);
      }
    }
    for (const u of [...list]) {
      const m = /\/avatars\/([sml])\//.exec(u);
      if (m) for (const size of ['m', 's', 'l']) list.push(u.replace(`/avatars/${m[1]}/`, `/avatars/${size}/`));
    }
    const clean = (u) => withParam(u, 0).replace(/[?&]_v3l=0$/, '');
    st.candidates = [...new Set(list.map((u) => new URL(clean(u), location.href).href))];
    return st.candidates;
  }

  // Probe a candidate in a detached Image so the visible <img> never flickers. On success,
  // swap it in (instant: it's already in the memory cache).
  function retryImage(img, st, now) {
    const cands = candidatesFor(st);
    const n = st.tries++;
    const round = Math.floor(n / cands.length);
    const base = cands[n % cands.length];
    const url = round % 2 === 1 ? withParam(base, st.tries) : base;

    st.lastAttempt = now;
    st.probing = true;
    const probe = new Image();
    const timer = setTimeout(() => finish(false), STALL_MS);
    function finish(ok) {
      if (!st.probing) return;
      st.probing = false;
      clearTimeout(timer);
      probe.onload = probe.onerror = null;
      if (ok && probe.naturalWidth > 0) {
        if (img.complete && img.naturalWidth > 0) return; // it recovered on its own meanwhile
        st.fixed = true;
        img.removeAttribute('srcset'); // the winner is the image now, whatever its size
        img.loading = 'eager';
        img.src = url;
        img.classList.remove('v3l-broken');
        report('img', st.orig);
        return;
      }
      const d = delayFor(st.tries);
      st.nextAt = Date.now() + d;
      setTimeout(scanSoon, d + 50);
    }
    probe.onload = () => finish(true);
    probe.onerror = () => finish(false);
    probe.src = url;
  }

  function considerImage(img, now) {
    const src = img.getAttribute('src');
    const near = isNear(img);

    // Lazy-load placeholders (data-src etc.) near the viewport: load them now.
    if (near && (!src || src.startsWith('data:'))) {
      for (const a of LAZY_ATTRS) {
        const v = img.getAttribute(a);
        if (v && isOurUrl(v)) { img.src = v; return; }
      }
      return;
    }
    if (!src || src.startsWith('data:') || !isOurUrl(img.currentSrc || src)) return;

    // Native lazy images close to the viewport: load them now instead of waiting.
    if (near && img.loading === 'lazy') img.loading = 'eager';

    const loaded = img.complete && img.naturalWidth > 0;
    if (loaded) return;

    const st = stateFor(img, now);
    if (!st.orig) { st.orig = src; st.origSet = img.getAttribute('srcset'); }
    if (st.failed || st.probing) return;
    const stalled = !img.complete && now - st.loadStart >= STALL_MS;
    const broken = img.complete; // complete && naturalWidth === 0
    if (!broken && !stalled) return;

    const boosted = boostAt > st.lastAttempt;
    if (now < st.nextAt && !boosted) return;

    if (st.tries >= MAX_TRIES) {
      st.failed = true;
      img.classList.add('v3l-broken');
      report('imgFailed', st.orig);
      return;
    }
    // After the fast phase, only keep hammering on things the user can actually see.
    if (st.tries >= FAST_TRIES) {
      img.classList.add('v3l-broken');
      if (!near && !boosted) return;
    }
    retryImage(img, st, now);
  }

  // Capture errors as early as possible (document_start).
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement) {
      const now = Date.now();
      const st = stateFor(t, now);
      if (!st.orig) { st.orig = t.getAttribute('src'); st.origSet = t.getAttribute('srcset'); }
      if (st.probing || st.fixed) return;
      st.nextAt = Math.min(st.nextAt, now + delayFor(st.tries));
      setTimeout(scanSoon, delayFor(st.tries) + 50);
    } else if (t instanceof HTMLLinkElement && /stylesheet/i.test(t.rel)) {
      repairStylesheet(t);
    }
  }, true);

  // ---------- Background images (inline style="background-image:url(...)") ----------
  const bgState = new WeakMap();

  function considerBackground(el, now) {
    let st = bgState.get(el);
    if (st && (st.done || st.busy || now < st.nextAt)) return;
    const m = /url\((['"]?)(.*?)\1\)/i.exec(el.style.backgroundImage || '');
    if (!m || !isOurUrl(m[2])) return;
    if (!st) { st = { orig: m[2], tries: 0, nextAt: 0, busy: false, done: false }; bgState.set(el, st); }
    if (st.tries >= MAX_TRIES || (st.tries >= FAST_TRIES && !isNear(el))) return;

    const url = st.tries ? withParam(st.orig, st.tries) : st.orig;
    st.busy = true;
    const probe = new Image();
    probe.onload = () => {
      st.busy = false;
      st.done = true;
      if (st.tries) {
        el.style.backgroundImage = `url("${url}")`;
        report('img', st.orig);
      }
    };
    probe.onerror = () => {
      st.busy = false;
      st.nextAt = Date.now() + delayFor(st.tries);
      st.tries++;
      if (st.tries >= MAX_TRIES) report('imgFailed', st.orig);
    };
    probe.src = url;
  }

  // ---------- Stylesheets ----------
  const linkSeen = new WeakMap();

  function sheetOk(link) {
    const s = link.sheet;
    if (!s) return false;
    try { return s.cssRules.length > 0; } catch { return false; }
  }

  async function repairStylesheet(link) {
    if (link.dataset.v3lRepair) return link.dataset.v3lRepair === 'done';
    link.dataset.v3lRepair = 'pending';
    const href = link.href;
    for (let i = 0; i < CSS_DELAYS.length; i++) {
      await sleep(CSS_DELAYS[i]);
      try {
        const res = await fetch(href, { cache: 'reload', credentials: 'include' });
        const type = res.headers.get('content-type') || '';
        if (res.headers.get('cf-mitigated') === 'challenge') {
          log('stylesheet is behind a Cloudflare challenge:', href);
          link.dataset.v3lRepair = 'challenge';
          report('challenge', href);
          return false;
        }
        if (res.ok && type.includes('text/css')) {
          const css = await res.text();
          const style = document.createElement('style');
          style.dataset.v3lFor = href;
          style.textContent = css;
          link.after(style);
          link.dataset.v3lRepair = 'done';
          log('repaired stylesheet:', href);
          report('css', href);
          return true;
        }
        log(`stylesheet attempt ${i + 1} failed (${res.status} ${type})`);
      } catch (err) {
        log(`stylesheet attempt ${i + 1} error:`, err.message);
      }
    }
    link.dataset.v3lRepair = 'failed';
    report('cssFailed', href);
    return false;
  }

  // Finds same-origin stylesheets that are empty or failed. `force` skips the grace period
  // (used right after window load, when everything should have arrived).
  function brokenStylesheets(now, force) {
    return [...document.querySelectorAll('link[rel~="stylesheet"][href]')].filter((l) => {
      try { if (new URL(l.href).origin !== location.origin) return false; } catch { return false; }
      if (l.dataset.v3lRepair || sheetOk(l)) return false;
      if (!linkSeen.has(l)) linkSeen.set(l, now);
      return force || now - linkSeen.get(l) >= CSS_GRACE_MS;
    });
  }

  async function checkStylesheets(force = false) {
    const links = brokenStylesheets(Date.now(), force);
    if (!links.length) return true;
    log('broken stylesheets:', links.map((l) => l.href));
    const results = await Promise.all(links.map(repairStylesheet));
    return results.every(Boolean);
  }

  // ---------- The scanner ----------
  let scanTimer = 0;
  let lastScan = 0;

  function scan() {
    scanTimer = 0;
    // Note: no document.hidden bail-out. Windows reports Brave as "hidden" whenever another
    // window covers it, which used to freeze retries. Browsers already throttle timers in
    // background tabs, so this costs nothing.
    if (!document.documentElement) return;
    lastScan = Date.now();
    const now = lastScan;
    for (const img of document.images) considerImage(img, now);
    for (const el of document.querySelectorAll('[style*="url("]')) considerBackground(el, now);
    checkStylesheets(false);
  }

  // Throttled trigger: runs at most every 250ms, used by scroll/resize/mutations.
  function scanSoon() {
    if (scanTimer) return;
    const wait = Math.max(0, 250 - (Date.now() - lastScan));
    scanTimer = setTimeout(scan, wait);
  }

  // ---------- Scripts (XenForo) ----------
  // XenForo's preamble swaps "has-no-js" for "has-js" on <html>. If it's still has-no-js
  // after load, the JS bundles didn't arrive: reload once (guarded against loops).
  function jsBroken() {
    return document.documentElement.classList.contains('has-no-js');
  }

  function reloadOnce(reason) {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    log('reloading page:', reason);
    report('reload', location.href);
    setTimeout(() => location.reload(), 150);
    return true;
  }

  // ---------- Main ----------
  report('page', location.href);

  async function onPageLoaded() {
    if (isChallengePage()) {
      log('Cloudflare challenge page detected - leaving it alone so you can complete it.');
      report('challenge', location.href);
      return;
    }
    // Let in-flight resources settle a moment.
    await sleep(800);

    const cssOk = await checkStylesheets(true);
    scan();

    if (jsBroken()) {
      if (!reloadOnce('site scripts failed to load')) {
        banner('V3rmillion scripts failed to load on this connection.', 'Reload', () => location.reload());
      }
      return;
    }
    if (!cssOk) {
      const challenged = document.querySelector('link[data-v3l-repair="challenge"]');
      banner(
        challenged
          ? 'Cloudflare wants to verify your browser before serving page styles. Reload to complete the check.'
          : 'Some page styles could not be loaded on this connection.',
        'Reload',
        () => location.reload()
      );
    }
  }

  function startScanner() {
    if (isChallengePage()) return;
    setInterval(scan, SCAN_EVERY);
    // Capture phase so scrolling inside overlays/inner containers counts too.
    window.addEventListener('scroll', scanSoon, { passive: true, capture: true });
    window.addEventListener('resize', scanSoon, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      boostAt = Date.now();
      scanSoon();
    });
    window.addEventListener('focus', () => { boostAt = Date.now(); scanSoon(); });
    window.addEventListener('online', () => {
      log('network back online - retrying everything unloaded');
      boostAt = Date.now();
      scanSoon();
    });
    // XenForo adds content dynamically (overlays, "load more", quick reply, lazy images).
    const mo = new MutationObserver(scanSoon);
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'style', 'href']
    });
  }

  if (document.readyState === 'complete') onPageLoaded();
  else window.addEventListener('load', onPageLoaded, { once: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startScanner, { once: true });
  else startScanner();
})();
