# 安全性與代碼重構技術規格書 (Security & Refactor Spec)

## 1. 概述
本規格書定義了針對 Ad-Screenshot 安全性漏洞與代碼冗餘的解決方案。主要目標是實作 `contextBridge` 並重構截圖任務執行邏輯。

## 2. 安全性優化：Context Bridge 實作
### 2.1 目標
移除 `nodeIntegration`，啟用 `contextIsolation`。

### 2.2 變更說明
- **[NEW] `src/main/preload.ts`**:
    - 使用 `contextBridge.exposeInMainWorld` 暴露特定的 API。
    - 僅允許發送白名單內的 IPC 通道。
- **[MODIFY] `src/main/index.ts`**:
    - 更新 `webPreferences`:
    ```typescript
    webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
    }
    ```
- **[MODIFY] `src/renderer/app.ts`**:
    - 將 `require('electron').ipcRenderer` 替換為 `window.electronAPI`。

## 3. 代碼重構：共享任務執行器 (TaskRunner)
### 3.1 目標
消除 `index.ts` 中手動觸發與排程觸發的邏輯重複。

### 3.2 變更說明
- **[NEW] `src/main/task-runner.ts`**:
    - 建立 `TaskRunner` 類別，封裝 `screenshotEngine` 的呼叫、進度回報與錯誤處理。
- **[MODIFY] `src/main/index.ts`**:
    - 使用 `taskRunner.run(site)` 替代原有的手動邏輯。
    - 排程任務也統一調用 `taskRunner.run(site)`。

## 4. 驗證標準
- [ ] 應用程式啟動後，渲染程式無法直接在 Console 執行 `require('fs')`。
- [ ] 排程執行與手動執行皆能正確在 UI 顯示進度。
- [ ] `index.ts` 的行數預計減少 15-20%。
