# Log Panel Design

## Summary

Add a "System Log" tab to the right-side settings panel, displaying all main process stdout/stderr output in real-time with filtering and search capabilities.

## Approach

**Intercept stdout/stderr** (zero-invasion) — monkey-patch `process.stdout.write` and `process.stderr.write` in the main process to capture all output including Electron native messages.

## Architecture

### Log Interceptor (`src/main/log-interceptor.ts`)

- Monkey-patch `process.stdout.write` and `process.stderr.write` at app startup
- Parse each log line into `{ timestamp: string, level: 'info' | 'warn' | 'error', message: string }`
- Level heuristic: stderr → error; stdout containing `warn` → warn; otherwise → info
- Maintain in-memory `LogEntry[]` array
- Push entries to renderer via `webContents.send('log:entry', entry)`
- Expose `clearLogs()` — called when screenshot tasks start (manual or scheduled)
- Expose `getAllLogs()` — for renderer to fetch existing logs on init

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `log:entry` | main → renderer | Real-time single log push |
| `log:get-all` | renderer → main | Fetch existing logs on startup |
| `log:clear` | main → renderer | Notify renderer to clear display |

### UI Changes

**Tab bar** added to `.settings-panel` top:
- Two tabs: "Settings" (default) / "System Log"
- Toggle visibility of settings content vs log panel

**Log panel contents:**
- Toolbar: level filter buttons (All/Info/Warn/Error) + search input + clear button
- Scrollable log container with auto-scroll (pauses on manual scroll-up)
- Each log line: timestamp + level badge + message

**Styling:**
- Monospace font for log lines
- Level badge colors: info → `--text-secondary`, warn → new `--warning` orange variable, error → `--danger`
- Consistent with existing dark theme design system

### Clear Timing

- On `screenshot:take` or `screenshot:take-all` invocation — main process clears log array and notifies renderer
- On scheduled task trigger — same clear behavior
- Manual clear button in log panel toolbar

## Constraints

- Memory only — logs cleared on app restart
- No file persistence
- No cap on log count (cleared per task run)
