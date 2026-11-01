# Lumen implementation and evidence

Date: 17 October 2026, Asia/Dhaka.

## Version 1.1 update

The user selected **Focus dashboard + appearance**. Added a local daily intention, focus/break timer and custom durations, per-day session count, clock/date/greeting, and distraction-free focus mode. Timer state uses a persisted deadline, so reloads do not restart it. Atomic completion prevents two open dashboards from counting the same session twice. Daily notes and focus state are included in complete backups and restored explicitly; append imports preserve the current focus state. Page-scoped JSON sharing now excludes focus notes and appearance preferences.

Appearance updates include board/list layouts, configurable card opacity, optional website addresses, focus-panel visibility, live system-theme changes, clearer text and spacing, sticky page navigation, refined controls, and a theme-aware popup sized to fit within 600 pixels. Search hides the daily panel while showing results.

Verification for 1.1: 16 pure Node data/focus checks, 16 existing browser regression checks, and 13 new focus/appearance browser checks passed. Source modules passed syntax checks. Desktop dark/light, mobile, focus mode, list layout, and popup screenshots were captured; dark/light/mobile/focus/popup views were visually inspected. Results are in `data-checks.txt`, `browser-checks.json`, and `focus-browser-checks.json`. Previews use the `lumen-v1.1-` prefix. An intermittent settings-download interaction found during regression was changed to native download anchors; JSON, HTML, and CSV downloads were then exercised successfully through those links.

The existing database name and object-store version are unchanged; missing focus/appearance fields receive defaults. The earlier release ZIP is retained as `lumen-free-v1.0.zip`. The new distribution remains `lumen-free.zip`, version 1.1.0.

Timer notifications are in-page only. An expired deadline is reconciled when a dashboard is open or reopened; there is no promised alarm with all dashboards closed. Native Chrome permission/toolbar/context-menu/shortcut checks described below remain manual.

## Delivered behavior

An original Manifest V3 extension in `lumen-free/`, built without a bundler or required network service. It provides pages, masonry boards, bookmarks with notes and tags, editing and moving, drag and drop, keyboard menu alternatives, global/current-page search, exact phrase search, bulk actions, duplicate review, trash restore, session undo/redo, local JSON backups, HTML/CSV exports, import from pasted links and files, optional native Chrome bookmark import, quick save, a popup, a context menu, themes, wallpapers, compact layout, privacy blur, and incognito opening.

There are no plan checks, accounts, subscriptions, telemetry, or collection-count limits. IndexedDB and `unlimitedStorage` provide local persistence subject to the browser and device. Cloud sync and hosted share URLs are not implemented; users can move and share exported files.

## Reference inspection

- Original folder: `pcekakljniocipfpmjmpmgaleigcbhlh/`; inspected as a shipped artifact, not executed or changed.
- Manifest version observed: LumiList 2.1.3.
- Store listing: https://chromewebstore.google.com/detail/lumilist-smart-bookmark-m/pcekakljniocipfpmjmpmgaleigcbhlh
- REA parent evidence: `ev_29497011edc54face2826ea53f8d3bcebade333f1ffdf6c005b0565dd8547c14`.
- REA summary evidence: `ev_198e4302e9b37ad50aedd11fb87c6476a9fbf62d9757bfe04e3ddfd935e585d9`.
- Artifact SHA-256: `beed94bb1cb17826b52c5e031c9bb2c3f55a10621e237b932b00456547972c1b`.
- Selected REA source analysis covered manifest, background, pages, UI modes, and wallpaper. Four JavaScript files parsed without failures; 85 other inventoried files were outside that selected analysis. The graph remained partial. Static observations do not establish the original application's runtime behavior.
- Later direct, bounded source inspection of `newtab.js` found `buildBookmarkPortabilityExportPayload`, which emits `exportType: "lumilist-bookmark-portability"` and rows with page/board names, order fields, description, and active/trashed status. Lumen supports that format and retains trashed entries separately. This direct source review is separate from the selected REA graph.
- Original screenshots informed the workflow and broad layout. Implementation, branding, CSS, gradient wallpaper presets, and icons were newly created.

## Verification

- Ten Node data checks passed. The collection-size check persisted 210 pages, 510 boards, 10,010 bookmarks, a 3,000-character note, and 50 tags without truncation.
- Sixteen Playwright checks passed in a real Chrome for Testing process with the unpacked extension and actual service worker loaded. Results: `browser-checks.json`.
- Dark, light, mobile, and popup screenshots were captured and visually inspected. A mobile tool-rail alignment issue was corrected and then included in a bounds assertion.
- All JavaScript modules passed syntax checks; manifest targets and icons were checked for existence.
- Automated test profiles were isolated from the user's Chrome profiles.

## Manual checks remaining after installation

Chrome's actual optional-permission prompt interaction, saving through a real toolbar popup with `activeTab`, context-menu interaction, and the operating-system shortcut are not fully automated here. Code paths and initialization were reviewed; internal background saving was exercised in the browser. Incognito opening is tested as successful window creation or a handled policy error, because the browser controls availability. Lumen cannot override Chrome permissions, browser policy, physical disk space, or extension removal deleting local data.
