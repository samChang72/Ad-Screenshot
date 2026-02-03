import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { ConfigManager } from './config-manager';
import { ScreenshotEngine } from './screenshot-engine';
import { Scheduler } from './scheduler';
import { TaskRunner, TaskContext } from './task-runner';
import { IPC_CHANNELS, AppConfig, SiteConfig, ScreenshotProgress, ScreenshotResult } from '../shared/types';

const isTestMode = process.env.NODE_ENV === 'test' && process.env.AD_SCREENSHOT_TEST_MODE === '1';

// 測試模式下支援自訂 userData 路徑以隔離測試資料
if (process.env.ELECTRON_USER_DATA_DIR) {
    app.setPath('userData', process.env.ELECTRON_USER_DATA_DIR);
}

let mainWindow: BrowserWindow | null = null;
let configManager: ConfigManager;
let screenshotEngine: ScreenshotEngine;
let scheduler: Scheduler;
let taskRunner: TaskRunner;

// 儲存進行中的任務狀態
const activeTasks = new Map<string, ScreenshotProgress>();

function sendProgressUpdate() {
    if (mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.SCREENSHOT_PROGRESS, Array.from(activeTasks.values()));
    }
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1a2e',
    });

    // 載入渲染程式
    mainWindow.loadFile(path.join(__dirname, '../../renderer/renderer/index.html'));

    // 開發模式下開啟 DevTools
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function setupIpcHandlers(): void {
    // 設定相關
    ipcMain.handle(IPC_CHANNELS.CONFIG_LOAD, async () => {
        return configManager.loadConfig();
    });

    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, async (_event, config: AppConfig) => {
        return configManager.saveConfig(config);
    });

    ipcMain.handle(IPC_CHANNELS.CONFIG_EXPORT, async () => {
        const result = await dialog.showSaveDialog(mainWindow!, {
            title: '匯出設定檔',
            defaultPath: 'ad-screenshot-config.json',
            filters: [{ name: 'JSON', extensions: ['json'] }],
        });

        if (!result.canceled && result.filePath) {
            return configManager.exportConfig(result.filePath);
        }
        return { success: false, message: '已取消' };
    });

    ipcMain.handle(IPC_CHANNELS.CONFIG_IMPORT, async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            title: '匯入設定檔',
            filters: [{ name: 'JSON', extensions: ['json'] }],
            properties: ['openFile'],
        });

        if (!result.canceled && result.filePaths.length > 0) {
            return configManager.importConfig(result.filePaths[0]);
        }
        return { success: false, message: '已取消' };
    });

    // 截圖相關 - 使用 TaskRunner（測試模式下回傳模擬結果）
    ipcMain.handle(IPC_CHANNELS.SCREENSHOT_TAKE, async (_event, site: SiteConfig) => {
        if (isTestMode) {
            return createMockResults(site);
        }
        const config = configManager.loadConfig();
        return taskRunner.runSingle(site, config);
    });

    ipcMain.handle(IPC_CHANNELS.SCREENSHOT_TAKE_ALL, async () => {
        const config = configManager.loadConfig();
        if (isTestMode) {
            return config.sites
                .filter(s => s.enabled)
                .flatMap(site => createMockResults(site));
        }
        return taskRunner.runAll(config);
    });

    // 排程相關
    ipcMain.handle(IPC_CHANNELS.SCHEDULE_START, async () => {
        const config = configManager.loadConfig();
        scheduler.start(config);
        return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.SCHEDULE_STOP, async () => {
        scheduler.stop();
        return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.SCHEDULE_STATUS, async () => {
        return scheduler.getStatus();
    });

    // 選擇目錄
    ipcMain.handle(IPC_CHANNELS.SELECT_DIRECTORY, async () => {
        if (isTestMode) {
            return { success: true, path: '/tmp/test-output' };
        }
        const result = await dialog.showOpenDialog(mainWindow!, {
            title: '選擇輸出資料夾',
            properties: ['openDirectory', 'createDirectory'],
        });

        if (!result.canceled && result.filePaths.length > 0) {
            return { success: true, path: result.filePaths[0] };
        }
        return { success: false };
    });
}

function createMockResults(site: SiteConfig): ScreenshotResult[] {
    const enabledSelectors = site.selectors.filter(s => s.enabled);
    if (enabledSelectors.length === 0) {
        return [{
            success: true,
            siteName: site.name,
            selectorName: site.name,
            filePath: `/mock/path/${site.name}.png`,
            timestamp: new Date().toISOString(),
        }];
    }
    return enabledSelectors.map(sel => ({
        success: true,
        siteName: site.name,
        selectorName: sel.name,
        filePath: `/mock/path/${site.name}_${sel.name}.png`,
        timestamp: new Date().toISOString(),
    }));
}

app.whenReady().then(() => {
    // 初始化服務
    configManager = new ConfigManager();

    if (!isTestMode) {
        screenshotEngine = new ScreenshotEngine();

        // 建立 TaskRunner 上下文
        const taskContext: TaskContext = {
            get mainWindow() { return mainWindow; },
            screenshotEngine,
            activeTasks,
            sendProgressUpdate,
        };
        taskRunner = new TaskRunner(taskContext);
    }

    // 排程回調使用 TaskRunner
    scheduler = new Scheduler(async () => {
        if (isTestMode) return;
        const config = configManager.loadConfig();
        await taskRunner.runScheduled(config);
    });

    setupIpcHandlers();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    scheduler.stop();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
