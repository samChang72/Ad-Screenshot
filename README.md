# Ad Screenshot

跨平台廣告版位截圖應用程式。設定網站與 CSS selector 後，自動擷取指定元素的截圖，支援排程定時執行。

## 功能

- 設定多個網站及其 CSS selectors，針對特定廣告版位截圖
- 支援完整長網頁截圖（full page scroll capture）
- 支援錄製操作過程為 MP4 影片
- 排程自動執行（自訂間隔，預設 60 分鐘）
- 匯入 / 匯出設定檔（JSON）
- 以 iPhone 14 Pro 行動裝置視窗模擬截圖（393×852 @3x）

## 應用程式截圖

![App Screenshot](docs/screenshot01.png)
![App Screenshot](docs/screenshot02.png)

## 使用說明

1. 啟動應用程式
2. 在輸入框中貼上目標網站網址
3. 設定 CSS Selector (例如 `.ad-banner`) 以定位廣告區塊
4. 點擊「加入清單」將設定加入排程列表
5. 點擊「立即執行」或等待排程自動觸發截圖
6. 截圖完成後將儲存於 `screenshots/` 目錄

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
