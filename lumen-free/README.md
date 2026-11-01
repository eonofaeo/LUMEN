# Lumen — Free Bookmark Workspace

Lumen is a local-first Chrome bookmark workspace. Your pages, boards, bookmarks, and settings stay in the extension's IndexedDB database on this device. There is no account, server sync, telemetry, subscription, or software-enforced limit on pages, boards, or bookmarks. Available space is limited only by the device and browser storage. Use JSON backups or browser HTML and CSV exports to keep a copy of your library.

## Install in Chrome on Windows

1. Download or clone this project and keep its files together in one folder.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the `lumen-free` folder that contains `manifest.json`.
5. Open a new tab to use Lumen. Pin the Lumen extension if you want its save popup in the toolbar.

To install an updated build, return to `chrome://extensions` and press the extension's reload button.

## New in 1.1 — a little focus for your day

- A daily focus note, live local clock/date, and completed-session count.
- A focus/break timer with 25/50/90-minute focus presets, 5/15-minute breaks, and custom durations. Start, pause, resume, or reset at any time. The saved deadline survives reloads and is shared across open dashboard tabs.
- **Enter focus mode** hides the bookmark collection and browser tools. Choose **Exit focus mode** or press Escape to return.
- Board/list layout buttons, adjustable card opacity, optional website addresses, and a focus-panel visibility preference.
- Dark, light, and system themes. System theme follows operating-system changes while the dashboard is open; the popup also uses your saved appearance.
- Clearer text, calmer spacing, sticky page navigation, a compact popup, and layouts suited to smaller screens. Search temporarily hides the daily dashboard so results appear first.

The timer evaluates its deadline while a dashboard is open or when it is reopened. It does not play an alarm or show an operating-system notification while every dashboard is closed. The daily note uses your browser's local date; full JSON backups include it. Page-sharing exports contain that page's collection and omit your focus note and appearance settings.

For an existing installation, keep the `lumen-free` folder in the same location and click **Reload** on its existing card at `chrome://extensions`. Its local database is reused; no removal or reinstallation is needed. The project root also retains the previous ZIP as `lumen-free-v1.0.zip`.

## Save pages

- Click the extension icon to review the current tab, choose a page and board, add an optional note or comma-separated tags, and save it.
- Use the popup's **Save all open tabs** button to request Chrome's optional `tabs` permission and save HTTP/HTTPS tabs across open windows.
- Right-click a page or link and choose **Save page to Lumen** or **Save link to Lumen**.
- After a context-menu save, the extension icon briefly shows the save result.
- Use **Ctrl+Shift+Y** (Command+Shift+Y on macOS) to quick-save the active page. Chrome lets you change extension shortcuts at `chrome://extensions/shortcuts` if the suggested key is already in use.

The popup and browser-tab actions save regular HTTP and HTTPS pages. Browser-internal pages such as `chrome://extensions` cannot be saved. The workspace's manual bookmark editor accepts HTTP, HTTPS, FTP, mailto, and file URLs. To use private windows, enable **Allow in incognito** for Lumen on `chrome://extensions`; Chrome requires this setting to be enabled by the user.

## Permissions and local data

Lumen has no website host permissions. Chrome's `activeTab` permission is used for the page you explicitly save; context menu and shortcut saves operate on the tab where you invoked them. The extension uses IndexedDB and Chrome's unlimited-storage declaration for its local library. It requests the optional `tabs` permission only after you click **Save all open tabs**, and optional `bookmarks` access when you choose **Import from Chrome bookmarks**. The `favicon` permission displays browser-cached site icons. Lumen does not create hosted share links.

The Chrome bookmarks bar and Lumen are separate stores. Export a backup before uninstalling Chrome or removing Lumen, because removing an extension can delete its local data. Lumen does not upload or synchronize that data.

## Development files

`manifest.json` configures the Manifest V3 extension, new-tab override, popup, and module service worker. `background.js` implements quick save, context menus, and extension messages. `popup.html`, `popup.css`, and `popup.js` provide the save popup. The app's `store.js` owns the shared IndexedDB schema used by both the popup and new-tab workspace.

## Workspace tools

- Create as many pages, boards, and bookmarks as your device can hold. Edit notes and tags from each bookmark's menu.
- Drag tabs to reorder pages; drag boards and bookmarks onto another page tab to move them. Board and bookmark menus also offer editing and moving without dragging.
- Search across all pages or the current page. Search titles, URLs, notes, and `#tags`, or enable exact phrase matching.
- Select multiple bookmarks to move, open, or trash them. Review duplicate URLs with the overlapping-squares tool.
- Trash never expires automatically. Restore deleted links, boards, and pages; undo and redo apply during the current session.
- The eye tool blurs bookmark content for screen sharing. This is visual concealment, not encryption.
- Personalize the theme, accent, wallpaper, columns, spacing, and notes in Settings. Uploaded wallpaper is stored locally and included in JSON backups.
- Import HTML, CSV, TXT, and JSON files or paste links. LumiList 2.1.3 portability exports, compatible relational JSON exports, and Chrome bookmark exports are supported. LumiList portability imports retain page/board grouping, notes, order, and trashed links. Review imported content before replacing your workspace.
- Export a whole workspace from Settings. Page menus export that page as HTML or JSON; board menus export bookmark HTML that you can send as a file. Only full JSON backups retain settings, notes, tags, and trash together.
- JSON replacement downloads a backup of the current workspace first. Keep backups outside the extension folder.

## Verification and plan

The project root contains `XC.md` with the complete plan and task checklist. `checks/` contains reproducible data and browser checks; `reports/` contains verification results and screenshots. These development files are not needed to install the extension. The source is available under the included MIT license.
