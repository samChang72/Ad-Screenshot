# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron desktop application for automating screenshot capture of ad placements on websites. Users configure sites and CSS selectors, then the app captures targeted element screenshots on demand or on a schedule. UI is in Traditional Chinese.

## Development Commands

All commands run from `ad-screenshot-app/`.

```bash
cd ad-screenshot-app
npm install

# Development (TypeScript watch + Electron hot-reload)
npm run dev

# Build both processes + copy HTML/CSS assets
npm run build

# Build individually
npm run build:main      # Main process (CommonJS → dist/main/)
npm run build:renderer  # Renderer process (ES2022 → dist/renderer/)
npm run copy-assets     # Copy index.html + styles/ to dist/renderer/

# Run built app
npm run start

# Package for distribution (output → release/)
npm run dist:mac        # macOS DMG + ZIP
npm run dist:win        # Windows NSIS + ZIP
```

No test runner or linter is configured.

## Architecture

Electron two-process model with shared types:

```
src/
├── main/           # Node.js main process
├── renderer/       # Browser renderer process (vanilla TS, no framework)
└── shared/         # TypeScript interfaces shared between processes
```

**Main process** (`src/main/`):
- `index.ts` — App entry, BrowserWindow creation, IPC handler registration. Tracks active tasks to prevent duplicate runs.
- `screenshot-engine.ts` — Puppeteer-based capture engine. Emulates iPhone 14 Pro (393×852 @3x). 45s page load timeout, 3s post-load wait, lazy-load detection via scroll + image load monitoring. Supports full-page scroll capture and MP4 video recording.
- `config-manager.ts` — JSON config persistence at `{app.userData}/config.json`
- `scheduler.ts` — `node-schedule` wrapper for interval (minutes) or cron expressions

**Renderer process** (`src/renderer/`):
- `app.ts` — All UI logic via imperative DOM manipulation. Site/selector CRUD, screenshot triggering, progress display, settings management.
- `index.html` + `styles/main.css` — Dark-themed UI with CSS custom properties design system

**IPC channels** (defined in `src/shared/types.ts`):
- `config:load/save/export/import` — Configuration CRUD
- `screenshot:take/take-all/result/progress` — Screenshot operations with real-time progress callbacks
- `schedule:start/stop/status` — Scheduler control
- `dialog:select-directory` — Native file dialog

## Build Configuration

Two TypeScript configs target different module systems:
- `tsconfig.main.json` — ES2022 + CommonJS (Node.js compatible)
- `tsconfig.renderer.json` — ES2022 + ES modules with DOM libs

Electron-builder config lives in `package.json` under `"build"` key. App ID: `com.adscreenshot.app`.

## Key Technical Details

- Default output directory: `{app.getPath('pictures')}/AdScreenshots`
- File naming pattern: `{siteName}_{selectorName}_{YYYY-MM-DD_HH-mm-ss}.png`
- Default schedule interval: 60 minutes
- Screenshot engine scrolls pages to trigger lazy-loaded content before capture
- Video recording uses `puppeteer-screen-recorder` and outputs MP4
