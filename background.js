// V3rmillion Loader - service worker.
// Collects reports from the content script: per-tab state (chrome.storage.session)
// and lifetime totals (chrome.storage.local). Also drives the toolbar badge.

const LIFETIME_KEY = 'lifetime';
const MAX_EVENTS = 40;
const FIX_KINDS = ['css', 'img', 'reload'];

const emptyCounts = () => ({ css: 0, img: 0, reload: 0, imgFailed: 0, cssFailed: 0, challenge: 0 });
const emptyLifetime = () => ({
  ...emptyCounts(),
  pages: 0,
  pagesRepaired: 0,
  since: Date.now(),
  lastFixAt: 0
});
const tabKey = (id) => `tab:${id}`;

// Serialize storage updates so concurrent reports don't clobber each other.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

async function getLifetime() {
  const { [LIFETIME_KEY]: l } = await chrome.storage.local.get(LIFETIME_KEY);
  return { ...emptyLifetime(), ...(l || {}) };
}

async function getTab(tabId) {
  const key = tabKey(tabId);
  const { [key]: t } = await chrome.storage.session.get(key);
  return t || null;
}

function fixesOf(counts) {
  return FIX_KINDS.reduce((n, k) => n + (counts[k] || 0), 0);
}

async function updateBadge(tabId, tab) {
  const n = tab ? fixesOf(tab.counts) : 0;
  const challenged = tab && tab.counts.challenge > 0 && n === 0;
  await chrome.action.setBadgeText({ tabId, text: challenged ? '!' : n ? String(n > 999 ? '999+' : n) : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: challenged ? '#d97706' : '#8f1010' });
}

async function handleReport(msg, tabId) {
  const lifetime = await getLifetime();
  let tab = await getTab(tabId);

  if (msg.kind === 'page') {
    // New page load in this tab: reset per-page state.
    tab = { url: msg.page, startedAt: Date.now(), counts: emptyCounts(), events: [], repaired: false };
    lifetime.pages++;
  } else {
    if (!tab) tab = { url: msg.page, startedAt: Date.now(), counts: emptyCounts(), events: [], repaired: false };
    if (msg.kind in tab.counts) {
      tab.counts[msg.kind]++;
      lifetime[msg.kind] = (lifetime[msg.kind] || 0) + 1;
    }
    tab.events.unshift({ kind: msg.kind, url: msg.url, t: Date.now() });
    tab.events.length = Math.min(tab.events.length, MAX_EVENTS);
    if (FIX_KINDS.includes(msg.kind)) {
      lifetime.lastFixAt = Date.now();
      if (!tab.repaired) {
        tab.repaired = true;
        lifetime.pagesRepaired++;
      }
    }
  }

  await chrome.storage.session.set({ [tabKey(tabId)]: tab });
  await chrome.storage.local.set({ [LIFETIME_KEY]: lifetime });
  await updateBadge(tabId, tab);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'report' && sender.tab?.id != null) {
    serial(() => handleReport(msg, sender.tab.id)).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === 'getStats') {
    serial(async () => ({
      tab: msg.tabId != null ? await getTab(msg.tabId) : null,
      lifetime: await getLifetime()
    })).then(sendResponse);
    return true;
  }
  if (msg?.type === 'resetLifetime') {
    serial(() => chrome.storage.local.set({ [LIFETIME_KEY]: emptyLifetime() })).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabKey(tabId));
});

chrome.runtime.onInstalled.addListener(async () => {
  const lifetime = await getLifetime();
  await chrome.storage.local.set({ [LIFETIME_KEY]: lifetime });
});
