# Log Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "System Log" tab to the right-side settings panel, displaying all main process stdout/stderr output in real-time with level filtering, search, and auto-clear on task start.

**Architecture:** Monkey-patch `process.stdout.write` / `process.stderr.write` in main process to intercept all output. Push log entries via IPC to renderer. Renderer displays in a new tab on the right panel with filtering/search toolbar.

**Tech Stack:** Electron IPC, TypeScript, vanilla DOM manipulation

---

### Task 1: Add LogEntry type and IPC channel constants

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add LogEntry interface and new IPC channels**

Add after `BrowserStatus` type (line 98):

```typescript
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
}
```

Add to `IPC_CHANNELS` object (after `BROWSER_STATUS` line 95):

```typescript
    // Log 相關
    LOG_ENTRY: 'log:entry',
    LOG_GET_ALL: 'log:get-all',
    LOG_CLEAR: 'log:clear',
```

**Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: 新增 LogEntry 型別與 log IPC 通道常數"
```

---

### Task 2: Create log-interceptor.ts

**Files:**
- Create: `src/main/log-interceptor.ts`

**Step 1: Create the log interceptor module**

```typescript
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS, LogEntry, LogLevel } from '../shared/types';

const logs: LogEntry[] = [];
let targetWindow: BrowserWindow | null = null;

function detectLevel(message: string, isStderr: boolean): LogLevel {
    if (isStderr) return 'error';
    const lower = message.toLowerCase();
    if (lower.includes('warn')) return 'warn';
    if (lower.includes('error') || lower.includes('fail')) return 'error';
    return 'info';
}

function addEntry(message: string, isStderr: boolean): void {
    const trimmed = message.trim();
    if (trimmed.length === 0) return;

    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: detectLevel(trimmed, isStderr),
        message: trimmed,
    };
    logs.push(entry);

    if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send(IPC_CHANNELS.LOG_ENTRY, entry);
    }
}

export function initLogInterceptor(win: BrowserWindow): void {
    targetWindow = win;

    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);

    process.stdout.write = function (chunk: any, ...args: any[]): boolean {
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        addEntry(text, false);
        return originalStdoutWrite(chunk, ...args);
    } as typeof process.stdout.write;

    process.stderr.write = function (chunk: any, ...args: any[]): boolean {
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        addEntry(text, true);
        return originalStderrWrite(chunk, ...args);
    } as typeof process.stderr.write;
}

export function getAllLogs(): LogEntry[] {
    return [...logs];
}

export function clearLogs(): void {
    logs.length = 0;
    if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send(IPC_CHANNELS.LOG_CLEAR);
    }
}
```

**Step 2: Commit**

```bash
git add src/main/log-interceptor.ts
git commit -m "feat: 建立 stdout/stderr 攔截器模組"
```

---

### Task 3: Wire log interceptor into main process

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Add imports (line 6, after TaskRunner import)**

```typescript
import { initLogInterceptor, getAllLogs, clearLogs } from './log-interceptor';
```

**Step 2: Call initLogInterceptor after createWindow (inside `app.whenReady().then`)**

After `createWindow();` (line 192), add:

```typescript
    if (mainWindow) {
        initLogInterceptor(mainWindow);
    }
```

**Step 3: Add IPC handlers in `setupIpcHandlers()`**

After the `SELECT_DIRECTORY` handler block (after line 144), add:

```typescript
    // Log 相關
    ipcMain.handle(IPC_CHANNELS.LOG_GET_ALL, async () => {
        return getAllLogs();
    });
```

**Step 4: Add clearLogs() calls at task start**

In the `SCREENSHOT_TAKE` handler (line 96), add `clearLogs();` before calling `taskRunner.runSingle`:

```typescript
    ipcMain.handle(IPC_CHANNELS.SCREENSHOT_TAKE, async (_event, site: SiteConfig) => {
        if (isTestMode) {
            return createMockResults(site);
        }
        clearLogs();
        const config = configManager.loadConfig();
        return taskRunner.runSingle(site, config);
    });
```

In the `SCREENSHOT_TAKE_ALL` handler (line 104), add `clearLogs();` before the non-test path:

```typescript
    ipcMain.handle(IPC_CHANNELS.SCREENSHOT_TAKE_ALL, async () => {
        const config = configManager.loadConfig();
        if (isTestMode) {
            return config.sites
                .filter(s => s.enabled)
                .flatMap(site => createMockResults(site));
        }
        clearLogs();
        return taskRunner.runAll(config);
    });
```

**Step 5: Add clearLogs() in scheduler callback**

In the scheduler callback (line 185-189), add `clearLogs();` before `taskRunner.runScheduled`:

```typescript
    scheduler = new Scheduler(async () => {
        if (isTestMode) return;
        clearLogs();
        const config = configManager.loadConfig();
        await taskRunner.runScheduled(config);
    });
```

**Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: 整合 log 攔截器至主程式與任務觸發清空"
```

---

### Task 4: Add log IPC channels to preload whitelist

**Files:**
- Modify: `src/main/preload.ts`

**Step 1: Add `log:get-all` to VALID_INVOKE_CHANNELS (line 14)**

```typescript
    'log:get-all',
```

**Step 2: Add `log:entry` and `log:clear` to VALID_ON_CHANNELS (line 22-23)**

```typescript
    'log:entry',
    'log:clear',
```

**Step 3: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat: 新增 log 通道至 preload 白名單"
```

---

### Task 5: Add tab bar and log panel HTML

**Files:**
- Modify: `src/renderer/index.html`

**Step 1: Replace settings-panel section (lines 71-122)**

Replace the `<section class="panel settings-panel">` block with:

```html
        <section class="panel settings-panel">
          <!-- Tab Bar -->
          <div class="panel-tabs">
            <button class="panel-tab active" data-tab="settings">設定</button>
            <button class="panel-tab" data-tab="logs">系統日誌</button>
          </div>

          <!-- Settings Tab Content -->
          <div class="tab-content" id="tab-settings">
            <section class="config-section collapsible">
              <div class="section-header collapsible-trigger" id="settings-trigger">
                <div class="header-left">
                  <h2>⚙️ 輸出設定</h2>
                  <span class="collapse-icon">▼</span>
                </div>
              </div>
              <div class="section-content" id="settings-content">
                <div class="form-group">
                  <label for="output-directory">輸出目錄</label>
                  <div class="input-with-button">
                    <input type="text" id="output-directory" placeholder="選擇截圖儲存路徑...">
                    <button id="btn-select-dir" class="btn btn-secondary">選擇</button>
                  </div>
                </div>
                <div class="form-group">
                  <label for="filename-pattern">檔案名稱格式</label>
                  <input type="text" id="filename-pattern" placeholder="{siteName}_{selectorName}_{timestamp}">
                  <small class="hint">可用變數: {siteName}, {selectorName}, {timestamp}</small>
                </div>
              </div>
            </section>

            <section class="status-section">
              <div class="section-header">
                <h2>📊 任務執行狀態</h2>
              </div>
              <div id="tasks-container" class="tasks-container">
                <div class="empty-tasks-hint">目前沒有進行中的任務</div>
              </div>
            </section>

            <div class="settings-section">
              <h3>⏰ 排程設定</h3>
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" id="schedule-enabled">
                  <span>啟用自動排程</span>
                </label>
              </div>
              <div class="form-group" id="schedule-options">
                <label>執行間隔（分鐘）</label>
                <input type="number" id="schedule-interval" min="1" max="1440" value="60">
              </div>
              <div class="schedule-status">
                <span id="next-run">下次執行: --</span>
              </div>
            </div>
          </div>

          <!-- Log Tab Content -->
          <div class="tab-content hidden" id="tab-logs">
            <div class="log-toolbar">
              <div class="log-filters">
                <button class="log-filter-btn active" data-level="all">全部</button>
                <button class="log-filter-btn" data-level="info">Info</button>
                <button class="log-filter-btn" data-level="warn">Warn</button>
                <button class="log-filter-btn" data-level="error">Error</button>
              </div>
              <div class="log-actions">
                <input type="text" id="log-search" class="log-search" placeholder="搜尋...">
                <button id="btn-clear-logs" class="btn btn-small btn-secondary">清除</button>
              </div>
            </div>
            <div id="log-container" class="log-container">
              <div class="empty-tasks-hint">尚無日誌紀錄</div>
            </div>
          </div>
        </section>
```

**Step 2: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat: 新增 tab bar 與系統日誌面板 HTML 結構"
```

---

### Task 6: Add CSS for tab bar and log panel

**Files:**
- Modify: `src/renderer/styles/main.css`

**Step 1: Add styles before the Scrollbar section (before line 1019)**

```css
/* ===================================
   Panel Tabs
   =================================== */
.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.panel-tab {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.panel-tab:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.panel-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* ===================================
   Log Panel
   =================================== */
.log-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.log-filters {
  display: flex;
  gap: 2px;
}

.log-filter-btn {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.log-filter-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.log-filter-btn.active {
  background: var(--primary-light);
  color: var(--primary);
  border-color: var(--primary);
}

.log-actions {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
}

.log-search {
  width: 120px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.log-search:focus {
  outline: none;
  border-color: var(--primary);
}

.log-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xs);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  line-height: 1.6;
  min-height: 0;
}

.log-entry {
  display: flex;
  gap: var(--spacing-sm);
  padding: 1px var(--spacing-xs);
  border-radius: 2px;
  user-select: text;
  cursor: text;
}

.log-entry:hover {
  background: var(--bg-tertiary);
}

.log-time {
  color: var(--text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

.log-level {
  flex-shrink: 0;
  padding: 0 4px;
  border-radius: 2px;
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  min-width: 36px;
  text-align: center;
}

.log-level-info {
  color: var(--text-secondary);
  background: var(--bg-elevated);
}

.log-level-warn {
  color: var(--warning);
  background: rgba(245, 158, 11, 0.15);
}

.log-level-error {
  color: var(--danger);
  background: rgba(239, 68, 68, 0.15);
}

.log-message {
  color: var(--text-primary);
  word-break: break-all;
  white-space: pre-wrap;
}

.log-entry.level-error .log-message {
  color: var(--danger);
}

.log-entry.level-warn .log-message {
  color: var(--warning);
}
```

**Step 2: Commit**

```bash
git add src/renderer/styles/main.css
git commit -m "feat: 新增 tab bar 與系統日誌面板樣式"
```

---

### Task 7: Add log panel logic to renderer

**Files:**
- Modify: `src/renderer/app.ts`

**Step 1: Add log IPC channels to the IPC_CHANNELS object (after line 71)**

```typescript
    LOG_ENTRY: 'log:entry',
    LOG_GET_ALL: 'log:get-all',
    LOG_CLEAR: 'log:clear',
```

**Step 2: Add LogEntry interface and log state (after line 94, the ipcCleanups line)**

```typescript
interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    message: string;
}

// Log state
let logEntries: LogEntry[] = [];
let logFilterLevel: string = 'all';
let logSearchText: string = '';
let logAutoScroll: boolean = true;
```

**Step 3: Add log DOM elements to the `elements` object (after toastContainer, line 139)**

```typescript
    // Log Panel
    logContainer: document.getElementById('log-container') as HTMLDivElement,
    logSearch: document.getElementById('log-search') as HTMLInputElement,
    btnClearLogs: document.getElementById('btn-clear-logs') as HTMLButtonElement,
```

**Step 4: Add log rendering functions (after `renderTasksStatus` function, before Data Functions section ~line 649)**

```typescript
// ===================================
// Log Functions
// ===================================
function formatLogTime(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shouldShowLogEntry(entry: LogEntry): boolean {
    if (logFilterLevel !== 'all' && entry.level !== logFilterLevel) return false;
    if (logSearchText && !entry.message.toLowerCase().includes(logSearchText.toLowerCase())) return false;
    return true;
}

function createLogEntryHtml(entry: LogEntry): string {
    return `<div class="log-entry level-${entry.level}">
        <span class="log-time">${formatLogTime(entry.timestamp)}</span>
        <span class="log-level log-level-${entry.level}">${entry.level}</span>
        <span class="log-message">${escapeHtml(entry.message)}</span>
    </div>`;
}

function renderAllLogs(): void {
    const filtered = logEntries.filter(shouldShowLogEntry);
    if (filtered.length === 0) {
        elements.logContainer.innerHTML = '<div class="empty-tasks-hint">尚無日誌紀錄</div>';
        return;
    }
    elements.logContainer.innerHTML = filtered.map(createLogEntryHtml).join('');
    if (logAutoScroll) {
        elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
    }
}

function appendLogEntry(entry: LogEntry): void {
    logEntries = [...logEntries, entry];
    if (!shouldShowLogEntry(entry)) return;

    // Remove empty hint if present
    const hint = elements.logContainer.querySelector('.empty-tasks-hint');
    if (hint) hint.remove();

    const div = document.createElement('div');
    div.innerHTML = createLogEntryHtml(entry);
    const node = div.firstElementChild;
    if (node) {
        elements.logContainer.appendChild(node);
        if (logAutoScroll) {
            elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
        }
    }
}
```

**Step 5: Add tab switching and log event listeners in `setupEventListeners()` (before the closing `}` of setupEventListeners)**

```typescript
    // Tab switching
    const panelTabs = document.querySelectorAll('.panel-tab');
    panelTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = (tab as HTMLElement).dataset.tab;
            panelTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-settings')!.classList.toggle('hidden', tabName !== 'settings');
            document.getElementById('tab-logs')!.classList.toggle('hidden', tabName !== 'logs');
        });
    });

    // Log filter buttons
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            logFilterLevel = (btn as HTMLElement).dataset.level || 'all';
            renderAllLogs();
        });
    });

    // Log search
    elements.logSearch.addEventListener('input', () => {
        logSearchText = elements.logSearch.value;
        renderAllLogs();
    });

    // Clear logs button
    elements.btnClearLogs.addEventListener('click', () => {
        logEntries = [];
        renderAllLogs();
    });

    // Auto-scroll detection
    elements.logContainer.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = elements.logContainer;
        logAutoScroll = scrollHeight - scrollTop - clientHeight < 30;
    });
```

**Step 6: Add log IPC listeners in `setupBrowserStatusListeners()` or after it**

After `setupBrowserStatusListeners` function, add a new function:

```typescript
function setupLogListeners(): void {
    ipcCleanups.push(
        api.on(IPC_CHANNELS.LOG_ENTRY, (...args: unknown[]) => {
            const entry = args[0] as LogEntry;
            appendLogEntry(entry);
        })
    );

    ipcCleanups.push(
        api.on(IPC_CHANNELS.LOG_CLEAR, () => {
            logEntries = [];
            renderAllLogs();
        })
    );
}
```

**Step 7: Call setupLogListeners and fetch existing logs in the DOMContentLoaded handler (line 696-700)**

Update the init block:

```typescript
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    setupBrowserStatusListeners();
    setupLogListeners();
    loadConfig();

    // Fetch existing logs
    const existingLogs = await api.invoke(IPC_CHANNELS.LOG_GET_ALL) as LogEntry[];
    logEntries = existingLogs;
    renderAllLogs();
});
```

**Step 8: Commit**

```bash
git add src/renderer/app.ts
git commit -m "feat: 實作系統日誌面板 UI 邏輯與 IPC 監聽"
```

---

### Task 8: Build and verify

**Step 1: Build the project**

```bash
cd /Users/sam/project/Ad-Screenshot && npm run build
```

Expected: no TypeScript errors.

**Step 2: Run dev mode and verify**

```bash
npm run dev
```

Verify:
- Right panel shows two tabs: "設定" and "系統日誌"
- Clicking "系統日誌" shows log panel with filter buttons and search
- Logs appear in real-time (e.g. Chrome download, UA messages)
- Clicking "立即執行" clears previous logs and shows new ones
- Filter buttons and search work
- Auto-scroll works, pauses on manual scroll-up

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: 完成系統日誌面板功能"
```
