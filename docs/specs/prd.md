# Ad-Screenshot 產品需求文件 (PRD)

## 1. 產品目標
自動化捕捉特定網站上特定廣告版位的截圖，支援定時執行、模擬行動裝置環境、全頁滾動載入及影片錄製。

## 2. 核心功能規格
| 功能模組 | 規格說明 | 狀態 |
| :--- | :--- | :--- |
| **模擬環境** | 預設模擬 iPhone 14 Pro (393x852, 3x DPR) | 已實作 |
| **截圖機制** | 支援 CSS Selector 單一元素截圖、全頁截圖 (Full-Page) | 已實作 |
| **動態載入** | 自動滾動頁面 (Scroll) 觸發懶加載，並等待圖片載入完成 | 已實作 |
| **定時排程** | 支援分鐘間隔或 Cron 表達式自動執行 | 已實作 |
| **影片錄製** | 支援在全頁掃描過程中錄製 MP4 影片 | 已實作 |
| **配置管理** | 支援設定檔匯入/匯出 (JSON) | 已實作 |

## 3. 技術架構
- **Frontend**: Vanilla TypeScript + CSS Custom Properties (Dark Mode)
- **Backend**: Electron (Main Process), Puppeteer (Capture Engine)
- **Shared**: IPC Channels defined in `shared/types.ts`

## 4. 下一階段規劃 (Roadmap)
- [ ] **多裝置模擬**: 讓使用者自定義 Viewport 或預設常見機種。
- [ ] **截圖歷史記錄**: 在 UI 中查看歷史截圖與成功率統計。
- [ ] **錯誤通知**: 當截圖失敗時發送系統通知或 Webhook。
- [ ] **安全性優化**: 啟用 Context Isolation 並優化主程式與渲染程式的通訊安全。
- [ ] **自動選取器輔助**: 內建簡易開發者工具或選取器建議。
