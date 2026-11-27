'use strict';

const $ = (id) => document.getElementById(id);
const V3RM = /^https:\/\/([a-z0-9-]+\.)?v3rmillion\.net\//i;

const LABELS = {
  css: ['CSS', false],
  img: ['Image', false],
  reload: ['Reload', false],
  imgFailed: ['Gave up', true],
  cssFailed: ['CSS fail', true],
  challenge: ['CF check', true]
};

const fmt = (n) => Number(n || 0).toLocaleString();

function ago(t) {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function shortUrl(u) {
  try {
    const x = new URL(u);
    const file = x.pathname.split('/').filter(Boolean).pop() || x.pathname;
    return `${x.hostname.replace(/^www\./, '')}/…/${file}`;
  } catch { return u; }
}

function setStatus(text, cls) {
  const el = $('status');
  el.textContent = text;
  el.className = 'pill' + (cls ? ' ' + cls : '');
}

function renderTab(tab, isV3rm) {
  $('not-v3rm').hidden = isV3rm;
  $('page-body').hidden = !isV3rm;
  if (!isV3rm) { setStatus('Idle'); return; }

  const c = tab?.counts || {};
  $('p-css').textContent = fmt(c.css);
  $('p-img').textContent = fmt(c.img);
  $('p-reload').textContent = fmt(c.reload);
  $('p-failed').textContent = fmt((c.imgFailed || 0) + (c.cssFailed || 0));

  const fixes = (c.css || 0) + (c.img || 0) + (c.reload || 0);
  if (c.challenge && !fixes) setStatus('Cloudflare check', 'warn');
  else if (fixes) setStatus(`${fixes} fix${fixes === 1 ? '' : 'es'} applied`, 'fixed');
  else setStatus('Loaded cleanly', 'ok');

  const list = $('events');
  list.textContent = '';
  const events = tab?.events || [];
  if (!events.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = 'Nothing needed fixing on this page.';
    list.appendChild(li);
    return;
  }
  for (const e of events) {
    const [label, bad] = LABELS[e.kind] || [e.kind, false];
    const li = document.createElement('li');
    li.title = e.url;
    const tag = document.createElement('span');
    tag.className = 'tag' + (bad ? ' bad' : '');
    tag.textContent = label;
    const url = document.createElement('span');
    url.className = 'url';
    url.textContent = shortUrl(e.url);
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = ago(e.t);
    li.append(tag, url, time);
    list.appendChild(li);
  }
}

function renderLifetime(l) {
  $('l-pages').textContent = fmt(l.pages);
  $('l-repaired').textContent = fmt(l.pagesRepaired);
  $('l-css').textContent = fmt(l.css);
  $('l-img').textContent = fmt(l.img);
  $('l-reload').textContent = fmt(l.reload);
  $('l-challenge').textContent = fmt(l.challenge);
  const rate = l.pages ? Math.round((l.pagesRepaired / l.pages) * 100) : 0;
  $('l-bar').style.width = rate + '%';
  $('l-rate').textContent = `${rate}% of pages needed a fix`;
  $('since').textContent = l.since ? `· since ${new Date(l.since).toLocaleDateString()}` : '';
  $('last-fix').textContent = l.lastFixAt ? `Last fix ${ago(l.lastFixAt)}` : 'No fixes yet';
}

async function refresh() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isV3rm = !!active?.url && V3RM.test(active.url);
  const stats = await chrome.runtime.sendMessage({ type: 'getStats', tabId: active?.id });
  renderTab(stats?.tab, isV3rm);
  renderLifetime(stats?.lifetime || {});
}

$('version').textContent = 'v' + chrome.runtime.getManifest().version;

$('reset').addEventListener('click', async () => {
  if (!confirm('Reset lifetime stats?')) return;
  await chrome.runtime.sendMessage({ type: 'resetLifetime' });
  refresh();
});

chrome.storage.onChanged.addListener(() => refresh());
refresh();
