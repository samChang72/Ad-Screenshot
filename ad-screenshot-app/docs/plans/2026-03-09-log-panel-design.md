# 系統日誌面板實作計畫

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目標：** 在右側設定面板新增「系統日誌」分頁，即時顯示主程序所有 stdout/stderr 輸出，支援等級篩選、搜尋功能，並在任務啟動時自動清除。

**架構：** 在主程序中 monkey-patch `process.stdout.write` / `process.stderr.write` 攔截所有輸出。透過 IPC 將日誌條目推送至 renderer。Renderer 在右側面板新增分頁，搭配篩選/搜尋工具列顯示日誌。

**技術棧：** Electron IPC、TypeScript、原生 DOM 操作

---

### 任務 1：新增 LogEntry 型別與 IPC 通道常數

**檔案：**
- 修改：`src/shared/types.ts`

**步驟 1：新增 LogEntry 介面與 IPC 通道**

在 `BrowserStatus` 型別之後新增（第 98 行）：

```typescript
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
}
```

在 `IPC_CHANNELS` 物件中新增（`BROWSER_STATUS` 第 95 行之後）：

```typescript
    // Log 相關
    LOG_ENTRY: 'log:entry',
    LOG_GET_ALL: 'log:get-all',
    LOG_CLEAR: 'log:clear',
```

**步驟 2：提交**

```bash
git add src/shared/types.ts
git commit -m "feat: 新增 LogEntry 型別與 log IPC 通道常數"
```

---

### 任務 2：建立 log-interceptor.ts

**檔案：**
- 新建：`src/main/log-interceptor.ts`

**步驟 1：建立日誌攔截器模組**

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

**步驟 2：提交**

```bash
git add src/main/log-interceptor.ts
git commit -m "feat: 建立 stdout/stderr 攔截器模組"
```

---

### 任務 3：將日誌攔截器整合至主程序

**檔案：**
- 修改：`src/main/index.ts`

**步驟 1：新增 import（第 6 行，TaskRunner import 之後）**

```typescript
import { initLogInterceptor, getAllLogs, clearLogs } from './log-interceptor';
```

**步驟 2：在 createWindow 之後呼叫 initLogInterceptor（在 `app.whenReady().then` 內）**

在 `createWindow();`（第 192 行）之後新增：

```typescript
    if (mainWindow) {
        initLogInterceptor(mainWindow);
    }
```

**步驟 3：在 `setupIpcHandlers()` 中新增 IPC 處理器**

在 `SELECT_DIRECTORY` 處理器區塊之後（第 144 行之後）新增：

```typescript
    // Log 相關
    ipcMain.handle(IPC_CHANNELS.LOG_GET_ALL, async () => {
        return getAllLogs();
    });
```

**步驟 4：在任務啟動時新增 clearLogs() 呼叫**

在 `SCREENSHOT_TAKE` 處理器（第 96 行），於呼叫 `taskRunner.runSingle` 之前新增 `clearLogs();`：

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

在 `SCREENSHOT_TAKE_ALL` 處理器（第 104 行），於非測試路徑之前新增 `clearLogs();`：

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

**步驟 5：在排程回呼中新增 clearLogs()**

在排程回呼（第 185-189 行），於 `taskRunner.runScheduled` 之前新增 `clearLogs();`：

```typescript
    scheduler = new Scheduler(async () => {
        if (isTestMode) return;
        clearLogs();
        const config = configManager.loadConfig();
        await taskRunner.runScheduled(config);
    });
```

**步驟 6：提交**

```bash
git add src/main/index.ts
git commit -m "feat: 整合 log 攔截器至主程式與任務觸發清空"
```

---

### 任務 4：將 log IPC 通道加入 preload 白名單

**檔案：**
- 修改：`src/main/preload.ts`

**步驟 1：將 `log:get-all` 加入 VALID_INVOKE_CHANNELS（第 14 行）**

```typescript
    'log:get-all',
```

**步驟 2：將 `log:entry` 和 `log:clear` 加入 VALID_ON_CHANNELS（第 22-23 行）**

```typescript
    'log:entry',
    'log:clear',
```

**步驟 3：提交**

```bash
git add src/main/preload.ts
git commit -m "feat: 新增 log 通道至 preload 白名單"
```

---

### 任務 5：新增分頁列與日誌面板 HTML

**檔案：**
- 修改：`src/renderer/index.html`

**步驟 1：替換 settings-panel 區段（第 71-122 行）**

將 `<section class="panel settings-panel">` 區塊替換為：

```html
        <section class="panel settings-panel">
          <!-- 分頁列 -->
          <div class="panel-tabs">
            <button class="panel-tab active" data-tab="settings">設定</button>
            <button class="panel-tab" data-tab="logs">系統日誌</button>
          </div>

          <!-- 設定分頁內容 -->
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

          <!-- 日誌分頁內容 -->
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

**步驟 2：提交**

```bash
git add src/renderer/index.html
git commit -m "feat: 新增 tab bar 與系統日誌面板 HTML 結構"
```

---

### 任務 6：新增分頁列與日誌面板 CSS

**檔案：**
- 修改：`src/renderer/styles/main.css`

**步驟 1：在 Scrollbar 區段之前新增樣式（第 1019 行之前）**

```css
/* ===================================
   面板分頁
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
   日誌面板
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

**步驟 2：提交**

```bash
git add src/renderer/styles/main.css
git commit -m "feat: 新增 tab bar 與系統日誌面板樣式"
```

---

### 任務 7：在 renderer 新增日誌面板邏輯

**檔案：**
- 修改：`src/renderer/app.ts`

**步驟 1：在 IPC_CHANNELS 物件中新增 log 通道（第 71 行之後）**

```typescript
    LOG_ENTRY: 'log:entry',
    LOG_GET_ALL: 'log:get-all',
    LOG_CLEAR: 'log:clear',
```

**步驟 2：新增 LogEntry 介面與日誌狀態（第 94 行 ipcCleanups 之後）**

```typescript
interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    message: string;
}

// 日誌狀態
let logEntries: LogEntry[] = [];
let logFilterLevel: string = 'all';
let logSearchText: string = '';
let logAutoScroll: boolean = true;
```

**步驟 3：在 `elements` 物件中新增日誌 DOM 元素（toastContainer 之後，第 139 行）**

```typescript
    // 日誌面板
    logContainer: document.getElementById('log-container') as HTMLDivElement,
    logSearch: document.getElementById('log-search') as HTMLInputElement,
    btnClearLogs: document.getElementById('btn-clear-logs') as HTMLButtonElement,
```

**步驟 4：新增日誌渲染函式（在 `renderTasksStatus` 函式之後、Data Functions 區段之前，約第 649 行）**

```typescript
// ===================================
// 日誌函式
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

    // 移除空白提示（如果存在）
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

**步驟 5：在 `setupEventListeners()` 中新增分頁切換與日誌事件監聽器（在 setupEventListeners 的結尾 `}` 之前）**

```typescript
    // 分頁切換
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

    // 日誌篩選按鈕
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            logFilterLevel = (btn as HTMLElement).dataset.level || 'all';
            renderAllLogs();
        });
    });

    // 日誌搜尋
    elements.logSearch.addEventListener('input', () => {
        logSearchText = elements.logSearch.value;
        renderAllLogs();
    });

    // 清除日誌按鈕
    elements.btnClearLogs.addEventListener('click', () => {
        logEntries = [];
        renderAllLogs();
    });

    // 自動捲動偵測
    elements.logContainer.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = elements.logContainer;
        logAutoScroll = scrollHeight - scrollTop - clientHeight < 30;
    });
```

**步驟 6：在 `setupBrowserStatusListeners()` 之後新增日誌 IPC 監聽器**

在 `setupBrowserStatusListeners` 函式之後，新增以下函式：

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

**步驟 7：在 DOMContentLoaded 處理器中呼叫 setupLogListeners 並取得既有日誌（第 696-700 行）**

更新初始化區塊：

```typescript
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    setupBrowserStatusListeners();
    setupLogListeners();
    loadConfig();

    // 取得既有日誌
    const existingLogs = await api.invoke(IPC_CHANNELS.LOG_GET_ALL) as LogEntry[];
    logEntries = existingLogs;
    renderAllLogs();
});
```

**步驟 8：提交**

```bash
git add src/renderer/app.ts
git commit -m "feat: 實作系統日誌面板 UI 邏輯與 IPC 監聽"
```

---

### 任務 8：建置與驗證

**步驟 1：建置專案**

```bash
cd /Users/sam/project/Ad-Screenshot && npm run build
```

預期結果：無 TypeScript 錯誤。

**步驟 2：以開發模式執行並驗證**

```bash
npm run dev
```

驗證項目：
- 右側面板顯示兩個分頁：「設定」與「系統日誌」
- 點擊「系統日誌」顯示日誌面板，含篩選按鈕與搜尋
- 日誌即時顯示（如 Chrome 下載、UA 訊息等）
- 點擊「立即執行」清除先前日誌並顯示新日誌
- 篩選按鈕與搜尋功能正常運作
- 自動捲動正常，手動向上捲動時暫停自動捲動

**步驟 3：最終提交**

```bash
git add -A
git commit -m "feat: 完成系統日誌面板功能"
```
