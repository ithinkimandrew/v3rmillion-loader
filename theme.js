// Applies the saved theme before the popup paints (avoids a dark/light flash).
// The popup keeps a copy of the theme preference in localStorage, which is synchronous.
(() => {
  const mq = matchMedia('(prefers-color-scheme: light)');
  window.v3lApplyTheme = (pref) => {
    const p = pref === 'light' || pref === 'system' ? pref : 'dark';
    const resolved = p === 'system' ? (mq.matches ? 'light' : 'dark') : p;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePref = p;
  };
  let pref = 'dark';
  try { pref = localStorage.getItem('v3l-theme') || 'dark'; } catch { /* ignore */ }
  window.v3lApplyTheme(pref);
  mq.addEventListener('change', () => {
    if (document.documentElement.dataset.themePref === 'system') window.v3lApplyTheme('system');
  });
})();
