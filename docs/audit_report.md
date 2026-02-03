# Ad-Screenshot 專案審計與健康檢查報告 (Audit Report)

## 1. 總結
本專案功能實作完整，具備核心競爭力（如懶加載處理與影片錄製）。但在安全性配置與冗餘代碼處理上仍有優化空間。

## 2. 安全性風險 (High Priority)
- **問題**：`src/main/index.ts` 中啟用了 `nodeIntegration: true` 且 `contextIsolation: false`。
- **影響**：這會讓渲染程式（Renderer Process）擁有直接存取 Node.js API 的權限。若載入外部恶意連結，可能導致遠端代碼執行 (RCE)。
- **建議**：建議改為 `contextIsolation: true` 並透過 `preload.js` 建立強型別的橋接器 (Context Bridge)。

## 3. 代碼健壯性與健康 (Medium Priority)
- **錯誤處理**：目前的截圖錯誤主要透過 Toast 顯示，且一次性顯示在 `tasks-container`。若背景排程執行失敗，使用者可能無法及時得知。
- **代碼重複**：`src/main/index.ts` 中的 `SCREENSHOT_TAKE_ALL` 邏輯與 `scheduler` 的回調函數幾乎一致。
- **建議**：將重複的截圖執行邏輯封裝至一個獨立的 `TaskRunner` 或主執行程式中，並考慮建立持久化的錯誤日誌。

## 4. 效能與資源管理 (Low Priority)
- **Puppeteer 啟動**：每次截圖任務都會重新 `browser.newPage()` 並進行環境配置。目前的 `getBrowser()` 已經有單例模式保障，表現良好。
- **Chromium 路徑**：在生產環境（Production）中，Puppeteer 尋找 Chromium 的邏輯較為脆弱，依賴預設下載。
- **建議**：在打包配置中明確指定 `asarUnpack` 並在啟動時驗證執行檔路徑。

## 5. 易用性優化建議
- **裝置模擬自定義**：目前硬編碼為 iPhone 14 Pro。
- **截圖預覽**：UI 尚未提供直接查看已截圖片的功能。
