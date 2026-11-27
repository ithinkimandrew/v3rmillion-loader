'use strict';

const $ = (id) => document.getElementById(id);
const V3RM = /^https:\/\/([a-z0-9-]+\.)?v3rmillion\.net\//i;
const RING = 2 * Math.PI * 34; // circumference of the lifetime ring

// kind -> [title, icon, isProblem]
const EVENTS = {
  css: ['Stylesheet repaired', 'i-brush', false],
  img: ['Image recovered', 'i-image', false],
  reload: ['Page auto-reloaded', 'i-refresh', false],
  imgFailed: ['Image unrecoverable', 'i-x', true],
  cssFailed: ['Stylesheet failed', 'i-x', true],
  challenge: ['Cloudflare check', 'i-shield', true]
};

let activeTab = null;

const fmt = (n) => Number(n || 0).toLocaleString();
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`;

function ago(t) {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function shortUrl(u) {
  try {
    const x = new URL(u);
    const parts = x.pathname.split('/').filter(Boolean);
    const file = parts.pop() || '/';
    return parts.length ? `${x.hostname}/…/${file}` : `${x.hostname}/${file}`;
  } catch { return u; }
}

function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

function setHero(state, iconId, title, sub) {
  $('hero').dataset.state = state;
  $('hero-svg').firstElementChild.setAttribute('href', '#' + iconId);
  $('hero-title').textContent = title;
  $('hero-sub').textContent = sub;
}

function renderTab(tab, isV3rm) {
  $('page').hidden = !isV3rm;
  $('reload').hidden = !isV3rm;
  $('open-site').hidden = isV3rm;

  if (!isV3rm) {
    setHero('idle', 'i-moon', 'Not on V3rmillion', 'Open the forum and fixes will show up here.');
    return;
  }

  const c = tab?.counts || {};
  const fixes = (c.css || 0) + (c.img || 0) + (c.reload || 0);
  const failed = (c.imgFailed || 0) + (c.cssFailed || 0);

  if (c.challenge && !fixes) {
    setHero('warn', 'i-shield', 'Cloudflare check', 'Complete the verification on the page to continue.');
  } else if (fixes) {
    setHero('fixed', 'i-wrench', `${plural(fixes, 'fix')} applied`, 'This page had loading problems, and they were repaired.');
  } else {
    setHero('ok', 'i-check', 'Loaded cleanly', 'Everything on this page arrived. Still watching while you scroll.');
  }

  for (const [id, n] of [['p-css', c.css], ['p-img', c.img], ['p-reload', c.reload]]) {
    $(id).textContent = fmt(n);
    $(id).parentElement.classList.toggle('active', n > 0);
  }

  $('p-failed-wrap').hidden = !failed;
  $('p-failed-text').textContent = `${plural(failed, 'item')} couldn't be recovered (likely blocked upstream).`;

  const events = tab?.events || [];
  $('ev-count').textContent = events.length;
  const list = $('events');
  list.textContent = '';
  if (!events.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing has needed fixing yet.';
    list.appendChild(li);
    return;
  }
  for (const e of events) {
    const [title, iconId, bad] = EVENTS[e.kind] || [e.kind, 'i-wrench', false];
    const li = document.createElement('li');
    li.title = e.url;

    const ic = document.createElement('span');
    ic.className = 'ev-icon' + (bad ? ' bad' : '');
    ic.appendChild(icon(iconId));

    const main = document.createElement('div');
    main.className = 'ev-main';
    const t = document.createElement('span');
    t.className = 'ev-title';
    t.textContent = title;
    const u = document.createElement('span');
    u.className = 'ev-url';
    u.textContent = shortUrl(e.url);
    main.append(t, u);

    const time = document.createElement('span');
    time.className = 'ev-time';
    time.textContent = ago(e.t);

    li.append(ic, main, time);
    list.appendChild(li);
  }
  requestAnimationFrame(updateFade);
}

// Fade the bottom edge of the activity list only when there's more below.
function updateFade() {
  const list = $('events');
  const scrollable = list.scrollHeight > list.clientHeight + 1;
  list.classList.toggle('scrollable', scrollable);
  list.classList.toggle('at-end', scrollable && list.scrollTop + list.clientHeight >= list.scrollHeight - 2);
}
$('events').addEventListener('scroll', updateFade, { passive: true });
$('activity').addEventListener('toggle', () => requestAnimationFrame(updateFade));

function renderLifetime(l) {
  $('l-pages').textContent = fmt(l.pages);
  $('l-repaired').textContent = fmt(l.pagesRepaired);
  $('l-css').textContent = fmt(l.css);
  $('l-img').textContent = fmt(l.img);
  $('l-reload').textContent = fmt(l.reload);
  $('l-challenge').textContent = fmt(l.challenge);

  const rate = l.pages ? Math.min(100, Math.round((l.pagesRepaired / l.pages) * 100)) : 0;
  $('l-rate').textContent = rate + '%';
  $('ring-value').style.strokeDashoffset = String(RING * (1 - rate / 100));

  $('since').textContent = l.since
    ? 'since ' + new Date(l.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  $('last-fix').textContent = l.lastFixAt ? `Last fix ${ago(l.lastFixAt)}` : 'No fixes yet';
}

async function refresh() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isV3rm = !!activeTab?.url && V3RM.test(activeTab.url);
  const stats = await chrome.runtime.sendMessage({ type: 'getStats', tabId: activeTab?.id });
  renderTab(stats?.tab, isV3rm);
  if (isV3rm) autoOpenActivity(stats?.tab);
  renderLifetime(stats?.lifetime || {});
}

// ---------- Actions ----------
$('version').textContent = 'v' + chrome.runtime.getManifest().version;

$('reload').addEventListener('click', () => {
  if (activeTab?.id != null) chrome.tabs.reload(activeTab.id);
  window.close();
});

// Two-step reset: first click arms it, second click within 3s confirms.
let resetArmed = 0;
$('reset').addEventListener('click', async () => {
  const btn = $('reset');
  if (!resetArmed) {
    btn.classList.add('confirm');
    btn.textContent = 'Click again to reset';
    resetArmed = setTimeout(() => {
      resetArmed = 0;
      btn.classList.remove('confirm');
      btn.textContent = 'Reset stats';
    }, 3000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = 0;
  btn.classList.remove('confirm');
  btn.textContent = 'Stats reset';
  await chrome.runtime.sendMessage({ type: 'resetLifetime' });
  setTimeout(() => { btn.textContent = 'Reset stats'; }, 1500);
  refresh();
});

// Open the activity list automatically when there's something to see.
let autoOpened = false;
function autoOpenActivity(tab) {
  if (!autoOpened && (tab?.events || []).length) {
    $('activity').open = true;
    autoOpened = true;
  }
}

chrome.storage.onChanged.addListener(() => refresh());
setInterval(refresh, 5000); // keeps the "x ago" labels fresh
refresh();
