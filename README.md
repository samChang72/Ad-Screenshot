# Ad Screenshot

跨平台廣告版位截圖應用程式。設定網站與 CSS selector 後，自動擷取指定元素的截圖，支援排程定時執行。

## 功能

- 設定多個網站及其 CSS selectors，針對特定廣告版位截圖
- 支援完整長網頁截圖（full page scroll capture）
- 支援錄製操作過程為 MP4 影片
- 排程自動執行（自訂間隔，預設 60 分鐘）
- 匯入 / 匯出設定檔（JSON）
- 以 iPhone 14 Pro 行動裝置視窗模擬截圖（393×852 @3x）

## 環境需求

- Node.js
- npm

## 安裝

```bash
cd ad-screenshot-app
npm install
```

## 開發

```bash
npm run dev
```

同時啟動 TypeScript watch 編譯與 Electron 視窗。

## 建置

```bash
npm run build
```

## 打包發佈

```bash
npm run dist:mac    # macOS (DMG + ZIP)
npm run dist:win    # Windows (NSIS + ZIP)
```

輸出至 `release/` 目錄。

## 技術架構

- **Electron** — 桌面應用框架
- **Puppeteer** — 無頭瀏覽器截圖引擎
- **node-schedule** — 排程任務
- **TypeScript** — 型別安全開發
- **puppeteer-screen-recorder** — 操作過程錄影
