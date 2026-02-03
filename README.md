# Ad Screenshot

跨平台廣告版位截圖應用程式。設定網站與 CSS selector 後，自動擷取指定元素的截圖，支援排程定時執行。

## 功能

- 設定多個網站及其 CSS selectors，針對特定廣告版位截圖
- 支援完整長網頁截圖（full page scroll capture）
- 支援錄製操作過程為 MP4 影片
- 排程自動執行（自訂間隔，預設 60 分鐘）
- 匯入 / 匯出設定檔（JSON）
- 以 iPhone 14 Pro 行動裝置視窗模擬截圖（393×852 @3x）
- 動態下載 Chromium（首次執行時自動下載，約 130MB）

## 應用程式截圖

![App Screenshot](docs/screenshot01.png)
![App Screenshot](docs/screenshot02.png)

## 使用說明

1. 啟動應用程式
2. 點擊「新增網站」，輸入目標網站網址
3. 設定 CSS Selector (例如 `.ad-banner`) 以定位廣告區塊
4. 點擊「儲存」將設定加入列表
5. 點擊「立即執行」或等待排程自動觸發截圖
6. 截圖完成後將儲存於設定的輸出目錄

## 環境需求

- Node.js 18+
- npm

## 安裝

```bash
npm install
```

## 開發指令

```bash
# 開發模式（TypeScript watch + Electron 熱重載）
npm run dev

# 個別編譯
npm run build:main      # 編譯 Main Process (CommonJS → dist/main/)
npm run build:renderer  # 編譯 Renderer Process (ES2022 → dist/renderer/)
npm run copy-assets     # 複製 HTML/CSS 至 dist/renderer/

# 完整建置
npm run build           # 執行上述三個步驟

# 啟動已編譯的應用（不含 watch）
npm run start
```

## 打包發佈

```bash
npm run dist:mac       # macOS (DMG + ZIP，含簽章與公證)
npm run dist:mac:fast  # macOS 快速建置（跳過公證，用於本機測試）
npm run dist:win       # Windows (NSIS + ZIP)
```

輸出至 `release/` 目錄。
67: 
68: ## 清理與移除
69: 
70: 當您需要重置 App 設定或進行乾淨安裝時，可以使用以下指令：
71: 
72: ```bash
73: # 僅清除設定與快取資料 (保留應用程式本體)
74: npm run clean:data
75: 
76: # 完整解除安裝 (移除應用程式與所有相關資料路徑)
77: npm run uninstall:mac
78: ```

## 技術架構

```
src/
├── main/               # Main Process (Node.js)
│   ├── index.ts        # 應用入口、IPC 處理
│   ├── preload.ts      # Context Bridge (安全 API 暴露)
│   ├── task-runner.ts  # 截圖任務執行器
│   ├── browser-manager.ts  # Chromium 動態下載管理
│   ├── screenshot-engine.ts  # Puppeteer 截圖引擎
│   ├── config-manager.ts  # 設定檔持久化
│   └── scheduler.ts    # 排程管理
├── renderer/           # Renderer Process (Browser)
│   ├── app.ts          # UI 邏輯
│   ├── index.html      # 介面
│   └── styles/         # CSS
└── shared/             # 共用型別
    └── types.ts
```

### 核心技術

- **Electron** — 桌面應用框架 (Context Isolation 安全模式)
- **Puppeteer Core + @puppeteer/browsers** — 動態下載 Chromium 截圖引擎
- **node-schedule** — 排程任務
- **TypeScript** — 型別安全開發
- **puppeteer-screen-recorder** — 操作過程錄影

### 安全性

應用程式使用 Electron 安全最佳實踐：
- `contextIsolation: true` — 渲染程式與 Node.js 完全隔離
- `nodeIntegration: false` — 禁止渲染程式直接存取 Node.js
- Context Bridge — 僅暴露白名單 IPC 頻道

## E2E 測試

使用 [Playwright](https://playwright.dev/) 進行端對端測試，透過 `@playwright/test` 的 Electron 支援直接操控真實應用程式視窗。

### 執行測試

```bash
# 執行全部 E2E 測試（自動 build 後執行）
npm run test:e2e

# 帶 UI 視窗執行（方便觀察操作過程）
npm run test:e2e:headed

# 偵錯模式（開啟 Playwright Inspector）
npm run test:e2e:debug
```

### 測試涵蓋範圍

| 測試檔案 | 涵蓋功能 |
|---------|---------|
| `app-launch.spec.ts` | 應用程式啟動、視窗載入、初始狀態驗證 |
| `site-crud.spec.ts` | 網站新增/編輯/刪除/啟用切換 |
| `selector-crud.spec.ts` | CSS Selector 新增/編輯/刪除 |
| `screenshot.spec.ts` | 截圖觸發與結果驗證 |
| `schedule.spec.ts` | 排程啟用/停用/間隔設定 |
| `config-io.spec.ts` | 設定檔匯入/匯出 |

### 測試架構

```
e2e/
├── playwright.config.ts    # Playwright 設定（30s timeout, 單執行緒）
├── fixtures/
│   ├── electron-app.ts     # Electron 應用程式 fixture（啟動/關閉/隔離）
│   └── test-helpers.ts     # 共用操作函式（addSite, waitForToast 等）
└── tests/
    └── *.spec.ts           # 測試案例
```

### 測試隔離機制

- **環境變數** `AD_SCREENSHOT_TEST_MODE=1`：在 main process 層面 mock 截圖引擎，無需啟動真實 Chromium
- **獨立 userData 目錄**：每次測試使用 `os.tmpdir()` 下的臨時目錄，測試結束後自動清理
- **單執行緒執行**：`workers: 1` 避免多視窗競爭

### 測試報告

測試執行後會產生 HTML 報告：

```bash
# 開啟最近一次的測試報告
npx playwright show-report
```

報告位於 `playwright-report/` 目錄，包含每個測試的執行狀態、截圖與錯誤訊息。
