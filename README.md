<div align="center">

# 🟥 V3rmillion Loader

**Make [v3rmillion.net](https://v3rmillion.net) load completely, even on a flaky VPN or proxy.**

![Manifest V3](https://img.shields.io/badge/Manifest-V3-8f1010?style=flat-square)
![Version](https://img.shields.io/badge/version-1.1.0-8f1010?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-supported-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Brave](https://img.shields.io/badge/Brave-supported-FB542B?style=flat-square&logo=brave&logoColor=white)
![No tracking](https://img.shields.io/badge/tracking-none-2f9e44?style=flat-square)

</div>

---

## 🤔 The problem

On a VPN or proxy, V3rmillion often loads only partway. The HTML arrives, but some of the files it needs don't:

| Symptom | Cause |
| --- | --- |
| Unstyled page | The main `/css.php?…` stylesheet request fails (status `0`) |
| Missing avatars, logo, icons | `user-assets.v3rm.net` returns random `403`s and network errors |
| Buttons and menus don't work | XenForo's JS bundles never finish loading |

These failures are intermittent. Requesting the same file again usually works.

## ✨ What it does

- 🎨 **Stylesheet repair:** finds stylesheets that are empty or failed, fetches them again with backoff, and inserts them into the page.
- 🖼️ **Image recovery:** retries failed site images at 1.5s, 4s, 9s, 15s and 25s with a cache-busting parameter. Images that never load get a neutral placeholder.
- 🔁 **Script watchdog:** if XenForo's JavaScript didn't start, it reloads the page once. A guard prevents reload loops.
- 🧩 **Dynamic content:** also repairs images in overlays, "load more" and other content added after the page loads.
- 📊 **Popup dashboard:** shows what was fixed on the current page plus lifetime stats.
- 🛡️ **Respects Cloudflare and ad blockers:** never touches Cloudflare challenges and never re-requests ads that Brave Shields or uBlock blocked.

## 📊 Popup

Click the toolbar icon to see:

- **This page:** stylesheets fixed, images recovered, auto-reloads, anything it couldn't recover, and a recent activity log.
- **Lifetime:** pages visited, pages repaired, total fixes, Cloudflare checks seen, and the share of pages that needed a fix.
- **Badge:** the number of fixes on the current tab. `!` means a Cloudflare check is waiting for you.

## 🚀 Install

1. Download or clone this repo:
   ```bash
   git clone https://github.com/ithinkimandrew/v3rmillion-loader.git
   ```
2. Open `chrome://extensions` (or `brave://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `v3rmillion-loader` folder.
5. Pin the extension and browse V3rmillion as usual.

> [!TIP]
> To see each repair as it happens, open DevTools on v3rmillion.net and filter the console for `[V3rmillion Loader]`.

## 🗂️ Project structure

```
v3rmillion-loader/
├── manifest.json   # MV3 manifest
├── background.js   # Service worker: per-tab state, lifetime stats, badge
├── content.js      # Repairs stylesheets, images and scripts on v3rmillion.net
├── content.css     # Placeholder for unrecoverable images + in-page banner
├── popup.html      # Toolbar popup
├── popup.css
└── popup.js
```

## 🔒 Privacy

- Runs only on `v3rmillion.net` and `v3rm.net`.
- Stats are stored locally with `chrome.storage`. Nothing is sent anywhere.
- It only re-requests the site's own files from the site's own servers.

> [!NOTE]
> If Cloudflare shows a **"Just a moment…"** verification page, complete it normally. The extension won't solve or skip it. If your VPN's IP range is hard-blocked, switch servers or turn on split tunneling for this site.

## 📝 Changelog

### 1.1.0
- Added the popup dashboard with per-page mitigations and lifetime stats.
- Added a toolbar badge showing the fix count for the current tab.

### 1.0.0
- First release: stylesheet repair, image retry, script watchdog, Cloudflare-safe behavior.
