# extensionmanga

Chromium extension to detect manga chapters on supported sites and sync reading progress to AniList.

## Current state

- Works as an unpacked Chromium extension
- AniList auth uses the pin-token flow
- MangaDex is the first bundled adapter
- Custom adapters can be imported as JavaScript
- `dist/` is committed so you can install it without Node/npm

## Install from GitHub

1. Download or clone this repository
2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `dist/` folder

## AniList setup

1. Open the extension **Options** page
2. Click **Open AniList pin login**
3. Approve the AniList app
4. Copy the token shown by AniList
5. Paste it into the extension and save it

Client ID used by this extension: `39084`

## MangaDex test flow

1. Open the extension popup or options page
2. Enable the bundled **MangaDex** adapter
3. Grant site permission when asked
4. Open a MangaDex chapter page
5. The extension should detect the chapter and try to resolve the series on AniList
6. After enough reading progress, it will ask/sync depending on your settings

Current read rule for MangaDex:

- at least **15 seconds** on the chapter page
- at least **85% scroll**

## Custom adapters

You can import a custom adapter from the popup or options page.

Adapter format:

- one JavaScript file
- metadata header at the top
- adapter code using the extension runtime API

Example header:

```js
// ==MangaSyncAdapter==
// @id my-adapter
// @name My Adapter
// @version 0.1.0
// @site example
// @match https://example.com/read/*
// ==/MangaSyncAdapter==
```

## Build from source

Requirements:

- Node.js
- npm

Commands:

```bash
npm install
npm run build
```

The unpacked extension output is written to `dist/`.

## Repo structure

- `src/background` — background/service worker logic
- `src/content` — in-page UI bridge
- `src/core` — AniList, matching, sync logic
- `src/db` — IndexedDB persistence
- `src/adapters` — bundled/custom adapter runtime
- `src/options` — options page
- `src/popup` — popup UI

## Known limitations

- Detection/matching still needs hardening
- MangaDex support is still being debugged
- The extension is currently optimized for self-hosted testing, not store release
- AniList progress sync is currently integer-chapter oriented

## Public test repo

GitHub: https://github.com/Arata12/extensionmanga
