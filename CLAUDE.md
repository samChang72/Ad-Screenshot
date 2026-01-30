# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron desktop application for automating screenshot capture of ad placements on websites. Users configure sites and CSS selectors, then the app captures targeted element screenshots on demand or on a schedule. UI is in Traditional Chinese.

## Development Commands

```bash
# Development (hot-reload main process + Electron)
npm run dev

# Build both processes
npm run build

# Build individually
npm run build:main      # Main process (CommonJS)
npm run build:renderer  # Renderer process (ES2022)

# Run built app
npm run start

# Package for distribution
npm run dist:mac        # macOS DMG + ZIP
npm run dist:win        # Windows NSIS + ZIP
```

All commands run from `ad-screenshot-app/`. No test runner or linter is configured.

## Architecture

The app follows Electron's two-process model with a shared types layer:

```
ad-screenshot-app/src/
├── main/           # Node.js main process
├── renderer/       # Browser renderer process (vanilla TS, no framework)
└── shared/         # TypeScript interfaces shared between processes
```

**Main process** (`src/main/`):
- `index.ts` — App entry point, window creation, IPC handler registration
- `screenshot-engine.ts` — Puppeteer-based capture; emulates iPhone 14 Pro (393x852 @3x). Launches headless Chrome, navigates to URLs, screenshots elements matching CSS selectors
- `config-manager.ts` — Reads/writes JSON config to `{app.userData}/config.json`
- `scheduler.ts` — Uses `node-schedule` for interval or cron-based automatic capture

**Renderer process** (`src/renderer/`):
- `app.ts` — All UI logic via DOM API. Manages site/selector CRUD, triggers screenshots, shows progress
- `index.html` + `styles/main.css` — Dark-themed UI

**IPC channels** (defined in `src/shared/types.ts`):
- `config:load/save/export/import` — Configuration persistence
- `screenshot:take/take-all/result/progress` — Screenshot operations
- `schedule:start/stop/status` — Scheduler control
- `dialog:select-directory` — Native file dialog

## Build Configuration

Two separate TypeScript configs:
- `tsconfig.main.json` — Target ES2022, CommonJS modules, outputs to `dist/main/`
- `tsconfig.renderer.json` — Target ES2022, ES2022 modules, outputs to `dist/renderer/`, includes DOM libs

Electron-builder config is in `package.json` under `"build"` key. Output goes to `release/`.

## Key Technical Details

- Screenshots default to `{userData}/Pictures/AdScreenshots`, configurable per-site
- File naming: `{siteName}_{selectorName}_{YYYY-MM-DD_HH-mm-ss}.png`
- Default schedule interval: 60 minutes
- No frontend framework — all UI is imperative DOM manipulation with event listeners
