// V3rmillion Loader - repairs partially-loaded pages on unreliable (VPN/proxy) connections.
// It only re-requests the site's own resources from the same servers. It never solves or
// skips Cloudflare challenges: if one is shown, it gets out of the way so you can complete it.
(() => {
  'use strict';
  if (window.__v3lLoaded) return;
  window.__v3lLoaded = true;

  const TAG = '[V3rmillion Loader]';
  const IMG_DELAYS = [1500, 4000, 9000, 15000, 25000]; // retry schedule for images
  const CSS_DELAYS = [0, 1500, 4000];                  // retry schedule for stylesheets
  const RELOAD_KEY = 'v3l-reloaded-at';
  const ASSET_HOST = /(^|\.)(v3rm\.net|v3rmillion\.net)$/i;
  const log = (...a) => console.info(TAG, ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const imgTries = new WeakMap();

  function isOurImage(img) {
    try {
      const u = new URL(img.currentSrc || img.src, location.href);
      // Ads are intentionally blocked by Brave Shields / ad blockers; don't fight that.
      return ASSET_HOST.test(u.hostname) && !u.pathname.startsWith('/assets/ad/');
    } catch { return false; }
  }

  function retryImage(img) {
    if (!img.getAttribute('src') || !isOurImage(img)) return;
    const n = imgTries.get(img) || 0;
    if (n >= IMG_DELAYS.length) {
      if (!img.classList.contains('v3l-broken')) {
        img.classList.add('v3l-broken');
        report('imgFailed', img.dataset.v3lOrig || img.src);
      }
      return;
    }
    imgTries.set(img, n + 1);
    if (!img.dataset.v3lOrig) img.dataset.v3lOrig = img.getAttribute('src');
    if (img.srcset && !img.dataset.v3lOrigSet) img.dataset.v3lOrigSet = img.srcset;
    setTimeout(() => {
      if (img.dataset.v3lOrigSet) {
        img.srcset = img.dataset.v3lOrigSet
          .split(',')
          .map((part) => {
            const [u, d] = part.trim().split(/\s+/);
            return withParam(u, n + 1) + (d ? ' ' + d : '');
          })
          .join(', ');
      }
      img.src = withParam(img.dataset.v3lOrig, n + 1);
    }, IMG_DELAYS[n]);
  }

  // Capture image load errors as early as possible (document_start).
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement) retryImage(t);
  }, true);
  document.addEventListener('load', (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && imgTries.has(t) && !t.dataset.v3lFixed) {
      t.dataset.v3lFixed = '1';
      t.classList.remove('v3l-broken');
      report('img', t.dataset.v3lOrig || t.src);
    }
  }, true);

  function sweepImages() {
    for (const img of document.images) {
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src') && !imgTries.has(img)) {
        retryImage(img);
      }
    }
  }

  // ---------- Stylesheets ----------
  function sheetOk(link) {
    const s = link.sheet;
    if (!s) return false;
    try { return s.cssRules.length > 0; } catch { return false; }
  }

  async function repairStylesheet(link) {
    if (link.dataset.v3lRepair) return true;
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

  async function checkStylesheets() {
    const links = [...document.querySelectorAll('link[rel~="stylesheet"][href]')]
      .filter((l) => { try { return new URL(l.href).origin === location.origin; } catch { return false; } })
      .filter((l) => !sheetOk(l));
    if (!links.length) return true;
    log('broken stylesheets:', links.map((l) => l.href));
    const results = await Promise.all(links.map(repairStylesheet));
    return results.every(Boolean);
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

  async function run() {
    if (isChallengePage()) {
      log('Cloudflare challenge page detected - leaving it alone so you can complete it.');
      report('challenge', location.href);
      return;
    }
    // Let in-flight resources settle a moment.
    await sleep(800);

    const cssOk = await checkStylesheets();
    sweepImages();

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

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });

  // XenForo loads content dynamically (overlays, "load more", lazy images).
  const mo = new MutationObserver(() => {
    clearTimeout(mo.t);
    mo.t = setTimeout(sweepImages, 1000);
  });
  const startObserver = () => mo.observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver, { once: true });
})();
