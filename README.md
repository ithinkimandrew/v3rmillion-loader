<a id="top"></a>

<div align="center">

<img src="assets/banner.svg" alt="V3rmillion Loader: repairs half-loaded v3rmillion.net pages" width="100%">

<br>

![Manifest V3](https://img.shields.io/badge/Manifest-V3-8f1010?style=flat-square)
![Version](https://img.shields.io/badge/version-1.4.0-8f1010?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-supported-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Brave](https://img.shields.io/badge/Brave-supported-FB542B?style=flat-square&logo=brave&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-supported-0078D7?style=flat-square&logo=microsoftedge&logoColor=white)
![No tracking](https://img.shields.io/badge/tracking-none-2f9e44?style=flat-square)
![Light and dark](https://img.shields.io/badge/theme-light%20%2F%20dark-18181b?style=flat-square)

**Make [v3rmillion.net](https://v3rmillion.net) load completely, even on a flaky VPN or proxy.**

[The problem](#the-problem) · [Features](#features) · [Installation](#installation) · [The popup](#the-popup) · [Settings](#settings) · [How it works](#how-it-works) · [Project structure](#project-structure) · [Troubleshooting](#troubleshooting) · [Privacy](#privacy) · [Changelog](#changelog)

</div>

<img src="assets/divider.svg" alt="" width="100%">

<a id="the-problem"></a>
<img src="assets/headers/problem.svg" alt="The problem" width="100%">

On a VPN or proxy, V3rmillion often loads only partway. The HTML arrives, but some of the files it needs don't:

<img src="assets/before-after.svg" alt="Animated comparison of a half-loaded page and the same page after V3rmillion Loader repairs it" width="100%">

| Symptom | Cause |
| --- | --- |
| Unstyled page | The main `/css.php?…` stylesheet request fails (status `0`) |
| Missing avatars, logo, icons | `user-assets.v3rm.net` returns random `403`s and network errors |
| Buttons and menus don't work | XenForo's JavaScript bundles never finish loading |

These failures are intermittent. Requesting the same file again usually works, and V3rmillion Loader does that for you.

<img src="assets/divider.svg" alt="" width="100%">

<a id="features"></a>
<img src="assets/headers/features.svg" alt="Features" width="100%">

<img src="assets/features-grid.svg" alt="Overview of V3rmillion Loader features: stylesheet repair, image recovery, continuous scanner, script watchdog, popup dashboard, and Cloudflare and ad-blocker safety" width="100%">

| | Feature | What it does |
| :---: | --- | --- |
| **CSS** | Stylesheet repair | Finds stylesheets that are empty or failed, fetches them again with backoff, and inserts them into the page. |
| **IMG** | Image recovery | Retries failed images off-screen and swaps them in once they load, so nothing flickers. Retries rotate through the original URL, srcset entries and other avatar sizes, then cache-busted copies. |
| **SCAN** | Continuous scanner | Re-checks the page every 2.5s, while you scroll, when you switch back to the tab, when the network reconnects and whenever new content appears. Lazy images near the screen are loaded early. |
| **JS** | Script watchdog | If XenForo's JavaScript didn't start, the page is reloaded once. A guard prevents reload loops. |
| **UI** | Popup dashboard | A status card, per-page fix counts, an activity timeline and lifetime stats. |
| **CFG** | Settings and themes | Light, dark or automatic theme, a switch for each repair feature, and a one-click button to restore the recommended defaults. |
| **SAFE** | Respects Cloudflare and ad blockers | Never touches Cloudflare challenges and never re-requests ads that Brave Shields or uBlock blocked. |

<img src="assets/divider.svg" alt="" width="100%">

<a id="installation"></a>
<img src="assets/headers/installation.svg" alt="Installation" width="100%">

V3rmillion Loader isn't on the Chrome Web Store, so you install it as an **unpacked extension**. It takes about a minute.

<img src="assets/install-steps.svg" alt="Five-step installation flow: download, open extensions page, enable Developer mode, load unpacked, pin and browse" width="100%">

### 1. Download the extension

**Option A: Download a ZIP (no Git needed)**

1. On this repo's GitHub page, click the green **Code** button, then **Download ZIP**.
2. Extract the ZIP somewhere permanent, such as `Documents\v3rmillion-loader`.

> [!IMPORTANT]
> Don't delete or move the folder after installing. The browser loads the extension straight from it.

**Option B: Clone with Git**

```bash
git clone https://github.com/ithinkimandrew/v3rmillion-loader.git
```

### 2. Load it into your browser

| Browser | Extensions page |
| --- | --- |
| Chrome | `chrome://extensions` |
| Brave | `brave://extensions` |
| Edge | `edge://extensions` |
| Opera / Vivaldi | `opera://extensions` / `vivaldi://extensions` |

1. Open the extensions page for your browser (copy the address from the table into the address bar).
2. Turn on **Developer mode** (a toggle in the top-right corner; in Edge it's in the left sidebar).
3. Click **Load unpacked**.
4. Select the folder that contains `manifest.json`. If you downloaded the ZIP, that's the inner `v3rmillion-loader-main` folder.
5. **V3rmillion Loader** now appears in your list of extensions.

### 3. Pin it (recommended)

Click the puzzle-piece icon in the toolbar, then the pin next to **V3rmillion Loader**. The icon's badge then shows how many fixes were applied to the current page.

### 4. Use it

Browse [v3rmillion.net](https://v3rmillion.net) as usual. There's nothing to configure. Click the toolbar icon whenever you want to see what was repaired.

<details>
<summary><b>Updating</b></summary>

<br>

- **ZIP:** download the new ZIP, replace the contents of your folder, then click the reload icon on the extension's card on the extensions page.
- **Git:** run `git pull` in the folder, then click the reload icon on the extension's card.

Your lifetime stats and settings are kept when you update.

</details>

<details>
<summary><b>Uninstalling</b></summary>

<br>

Click **Remove** on the extension's card on the extensions page, then delete the folder.

</details>

<img src="assets/divider.svg" alt="" width="100%">

<a id="the-popup"></a>
<img src="assets/headers/popup.svg" alt="The popup" width="100%">

<div align="center">
<table>
  <tr>
    <td align="center"><img src="assets/popup-dark.svg" alt="Popup Overview tab in dark mode" width="320"><br><sub><b>Dark</b></sub></td>
    <td align="center"><img src="assets/popup-light.svg" alt="Popup Overview tab in light mode" width="320"><br><sub><b>Light</b></sub></td>
  </tr>
</table>
</div>

The popup has two tabs, **Overview** and **Settings**. Overview shows:

- **Status card:** shows at a glance whether the page *loaded cleanly*, had *fixes applied* or is waiting on a *Cloudflare check*.
- **This page:** tiles for styles, images and reloads, a warning for anything that couldn't be recovered, and an expandable activity timeline.
- **Lifetime:** a ring chart showing what share of pages needed a repair, plus totals for pages, images, styles, reloads and Cloudflare checks.
- **Compact layout:** fits Chrome's 600px popup limit. If the activity list grows long, only the list scrolls (no scrollbars, just a soft fade at the bottom).
- **Quick actions:** a sun/moon button to switch between light and dark mode, a button to reload the current page, and a two-step *Reset stats* (click twice).
- **Badge:** the number of fixes on the current tab. `!` means a Cloudflare check is waiting for you.

<img src="assets/divider.svg" alt="" width="100%">

<a id="settings"></a>
<img src="assets/headers/settings.svg" alt="Settings" width="100%">

Open the popup and choose the **Settings** tab. Changes save instantly and are synced with your browser profile.

<div align="center">
<img src="assets/popup-settings.svg" alt="Popup Settings tab showing appearance, repair, and interface controls" width="320">
</div>

| Setting | What it does | Default |
| --- | --- | :---: |
| Theme | **Auto** follows your system, or pick **Dark** or **Light** | Dark |
| Image recovery | Retries broken avatars, icons and attachments | On |
| Stylesheet repair | Fetches page styles again if they fail | On |
| Auto-reload | Reloads once if the site's scripts don't start | On |
| Preload nearby images | Loads lazy images before you scroll to them | On |
| Toolbar badge | Shows the fix count on the extension icon | On |
| In-page alerts | Shows a banner when something can't be fixed | On |

**Restore recommended defaults** at the bottom of the tab puts everything back to the values above. The button is greyed out while you're already using the defaults.

<img src="assets/divider.svg" alt="" width="100%">

<a id="how-it-works"></a>
<img src="assets/headers/how-it-works.svg" alt="How it works" width="100%">

<img src="assets/architecture.svg" alt="End-to-end recovery pipeline: page load, Cloudflare challenge gate, parallel stylesheet repair, script watchdog, continuous scanner, off-screen image prober with backoff, atomic DOM swap, and popup telemetry" width="100%">

<details>
<summary><b>Image recovery, step by step</b></summary>

<br>

```mermaid
sequenceDiagram
    participant P as Page
    participant L as V3rmillion Loader
    participant C as user-assets.v3rm.net
    P->>C: GET avatar.jpg
    C-->>P: 403 (random)
    L->>L: Scanner spots the broken image
    loop Fast phase: 1.5s, 4s, 9s, 15s, 25s
        L->>C: Probe off-screen (original, srcset, s/m/l, cache-busted)
        C-->>L: 403 or image
    end
    L->>P: Swap in the copy that loaded
    Note over L,P: Still failing? Visible images retry every 30s, up to 20 tries
```

</details>

<details>
<summary><b>Life of a broken image</b></summary>

<br>

```mermaid
stateDiagram-v2
    [*] --> Loading
    Loading --> Loaded: arrives
    Loading --> Broken: 403 or network error
    Loading --> Stalled: no progress
    Broken --> Probing
    Stalled --> Probing
    Probing --> Loaded: a variant loads
    Probing --> Waiting: every variant failed
    Waiting --> Probing: backoff, scroll, tab focus, reconnect
    Waiting --> Unrecoverable: 20 tries used
    Loaded --> [*]
    Unrecoverable --> [*]
```

</details>

<img src="assets/divider.svg" alt="" width="100%">

<a id="project-structure"></a>
<img src="assets/headers/structure.svg" alt="Project structure" width="100%">

<img src="assets/project-tree.svg" alt="Manifest V3 codebase map showing manifest.json, background.js, content scripts, popup UI, and message-passing flow" width="100%">

<details>
<summary><b>Directory tree</b></summary>

<br>

```
v3rmillion-loader/
├── manifest.json       # MV3 manifest
├── background.js       # Service worker: per-tab state, lifetime stats, badge
├── content.js          # Repairs stylesheets, images and scripts on v3rmillion.net
├── content.css         # Placeholder for unrecoverable images and the in-page banner
├── popup.html          # Toolbar popup
├── popup.css
├── popup.js            # Overview + Settings tabs
├── theme.js            # Applies the light/dark theme before the popup paints
└── assets/             # README & forum graphics (not loaded by the extension)
    ├── headers/        # Animated section header banners
    └── thread/         # Animated V3rmillion forum release graphics
```

</details>

<img src="assets/divider.svg" alt="" width="100%">

<a id="troubleshooting"></a>
<img src="assets/headers/troubleshooting.svg" alt="Troubleshooting" width="100%">

Click a problem to see the fix.

<details>
<summary>"Manifest file is missing or unreadable"</summary>

<br>You picked the wrong folder. Select the one that directly contains `manifest.json`.
</details>

<details>
<summary>The extension vanished after a restart</summary>

<br>The folder was moved or deleted. Put it back and load it again.
</details>

<details>
<summary>No badge or stats</summary>

<br>Pin the extension, then reload the v3rmillion.net tab. Also check that **Toolbar badge** is on in the Settings tab.
</details>

<details>
<summary>Some images stay grey</summary>

<br>Those files are being refused upstream every time. The popup lists them as *unrecoverable*.
</details>

<details>
<summary>A "Just a moment…" page keeps showing</summary>

<br>That's Cloudflare verification. Complete it yourself, or switch VPN server or turn on split tunneling for this site.
</details>

<details>
<summary>Nothing gets repaired any more</summary>

<br>Open the Settings tab. If the Overview says *Repairs paused*, all repair switches are off; click **Restore recommended defaults**.
</details>

To see every repair as it happens, open DevTools on v3rmillion.net and filter the console for `[V3rmillion Loader]`.

<img src="assets/divider.svg" alt="" width="100%">

<a id="privacy"></a>
<img src="assets/headers/privacy.svg" alt="Privacy" width="100%">

<img src="assets/privacy-shield.svg" alt="Privacy and host boundary overview: restricted to v3rmillion.net and v3rm.net, local chrome.storage, zero outbound telemetry, and non-interference with Cloudflare and ad blockers" width="100%">

- Runs only on `v3rmillion.net` and `v3rm.net`.
- Stats are stored locally with `chrome.storage`. Nothing is sent anywhere.
- Settings are saved with `chrome.storage.sync`, so they follow your browser profile if sync is on.
- It only re-requests the site's own files from the site's own servers.

> [!NOTE]
> V3rmillion Loader doesn't solve or skip Cloudflare challenges. If your VPN's IP range is hard-blocked, switch servers or turn on split tunneling for this site.

<img src="assets/divider.svg" alt="" width="100%">

<a id="changelog"></a>
<img src="assets/headers/changelog.svg" alt="Changelog" width="100%">

<details open>
<summary><b>1.4.0</b> (latest)</summary>

- Added a **Settings** tab: light, dark or automatic theme; switches for image recovery, stylesheet repair, auto-reload, preloading, toolbar badge and in-page alerts; and a *Restore recommended defaults* button.
- Added a light mode, plus a sun/moon quick toggle in the popup header.
- The badge setting applies to all open tabs immediately.
- Fixed the popup layout: the status card was squashed and the lifetime card was clipped behind the footer.
- New README with animated graphics, collapsible sections and diagrams.

</details>

<details>
<summary><b>1.3.1</b></summary>

- Fixed the popup growing a page scrollbar when the activity card is opened. The header and footer stay put, the activity list scrolls on its own with a fade instead of a scrollbar, and the layout is slightly more compact.

</details>

<details>
<summary><b>1.3.0</b></summary>

- Redesigned the popup: status card at the top, per-page tiles, an expandable activity timeline with icons, a lifetime ring chart, a reload button and a two-step stats reset.
- Rewrote the README with an installation guide and a troubleshooting section.

</details>

<details>
<summary><b>1.2.1</b></summary>

- Stubborn images are probed off-screen and swapped in only once they load (no flicker).
- Retries rotate through the exact original URL (can be served from Cloudflare's cache), srcset entries and other avatar sizes (s/m/l), then cache-busted copies.
- Retries no longer freeze when the Brave window is covered by another window. Switching back to the tab retries right away.

</details>

<details>
<summary><b>1.2.0</b></summary>

- Added a continuous scanner: periodic, scroll, visibility, reconnect and DOM-mutation triggered.
- Images that stall are re-requested, and lazy images near the viewport load right away.
- Visible images keep retrying every 30s after the fast phase.
- Inline background images and stylesheets added later are repaired too.

</details>

<details>
<summary><b>1.1.0</b></summary>

- Added the popup dashboard with per-page mitigations and lifetime stats.
- Added a toolbar badge showing the fix count for the current tab.

</details>

<details>
<summary><b>1.0.0</b></summary>

- First release: stylesheet repair, image retry, script watchdog, Cloudflare-safe behavior.

</details>

<img src="assets/divider.svg" alt="" width="100%">

<img src="assets/footer.svg" alt="V3rmillion Loader: Built for the V3rmillion community" width="100%">

<div align="center">
<sub><a href="#top">Back to top</a></sub>
</div>
