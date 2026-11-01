# Reproduce verification

Run these commands from `E:\PRG\LMN` in PowerShell. Testing installs only local development dependencies. The unpacked extension itself requires no build, npm, or server.

```powershell
node --test checks/data.test.mjs checks/focus.test.mjs
npm ci --prefix checks --no-audit --no-fund
$env:PLAYWRIGHT_BROWSERS_PATH = 'E:\PRG\LMN\checks\browsers'
npx --prefix checks playwright install chromium
node checks/extension-smoke.mjs
node checks/focus-browser.mjs
```

The browser script uses the Chrome for Testing executable downloaded by the pinned Playwright dependency. It creates isolated profiles in `checks/profile-*`, loads only `lumen-free`, and writes screenshots and a JSON result to `reports/`. These profiles are disposable; they contain test bookmarks, not the user's browser data.

Data checks cover unsafe URLs, complete backup restoration fields, large collections without truncation, HTML folder hierarchy, multiline CSV, deduplication, malformed files, failed mutations, and the actual LumiList 2.1.3 portability export structure.

Browser checks cover actual MV3 extension loading, organization, search, history, persistence, trash, import and downloads, appearance, mobile layout, concurrent writes, drag and drop, duplicate cleanup, bulk moves, internal background messages, popup initialization, and uncaught errors.

Native permission prompts, toolbar invocation with `activeTab`, context-menu clicks, and the OS-level shortcut should additionally be exercised manually after installing. The automated incognito check accepts either successful window creation or a returned Chrome policy error; it does not assert that private browsing is enabled in every environment.

Version 1.1 adds six pure focus/migration checks and thirteen browser checks for timer persistence, pause/resume, completion across simultaneous tabs, daily notes, focus mode, privacy of page-sharing exports, native JSON/HTML/CSV download links, list layout, opacity, live system themes, mobile bounds, focus-panel visibility, and the popup's compact height. These run alongside the original ten data checks and sixteen browser regression checks. Focus browser results are written to `reports/focus-browser-checks.json`; new previews use the `lumen-v1.1-` filename prefix.

Rebuild and verify the distribution after changes with `powershell -NoProfile -File checks/package.ps1`. The ZIP includes only `lumen-free/` and `XC.md`, never test profiles, browser caches, or development dependencies.
