import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { ConfigManager } from './config-manager';
import { ScreenshotEngine } from './screenshot-engine';
import { Scheduler } from './scheduler';
import { IPC_CHANNELS, AppConfig, SiteConfig } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let configManager: ConfigManager;
let screenshotEngine: ScreenshotEngine;
let scheduler: Scheduler;

// 儲存進行中的任務狀態
const activeTasks = new Map<string, any>();

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
            nodeIntegration: true,
            contextIsolation: false,
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

    // 截圖相關
    ipcMain.handle(IPC_CHANNELS.SCREENSHOT_TAKE, async (_event, site: SiteConfig) => {
        // 防止重複執行
        if (activeTasks.has(site.id)) {
            console.log(`Task for ${site.name} is already running, skipping.`);
            return [{
                success: false,
                siteName: site.name,
                selectorName: '系統',
                error: '任務已在執行中，請稍候',
                timestamp: new Date().toISOString(),
            }];
        }

        const config = configManager.loadConfig();

        // 設定初始狀態
        activeTasks.set(site.id, {
            jobId: site.id,
            siteName: site.name,
            url: site.url,
            status: 'pending',
            currentSelector: '初始化中...',
            totalSelectors: 1,
            completedSelectors: 0
        });
        sendProgressUpdate();

        try {
            const results = await screenshotEngine.takeScreenshots(site.id, {
                siteId: site.id,
                url: site.url,
                siteName: site.name,
                selectors: site.selectors.filter(s => s.enabled),
                outputDirectory: config.outputDirectory,
                fileNamePattern: config.fileNamePattern,
                fullPageScreenshot: site.fullPageScreenshot || false,
                recordVideo: site.recordVideo || false,
            }, (progress: any) => {
                activeTasks.set(progress.jobId, progress);
                sendProgressUpdate();
            });
            return results;
        } catch (error) {
            console.error(`Task ${site.name} failed:`, error);
            return [{
                success: false,
                siteName: site.name,
                selectorName: '系統',
                error: error instanceof Error ? error.message : '未知錯誤',
                timestamp: new Date().toISOString(),
            }];
        } finally {
            // 任務完成後移除
            activeTasks.delete(site.id);
            sendProgressUpdate();
        }
    });

    ipcMain.handle(IPC_CHANNELS.SCREENSHOT_TAKE_ALL, async () => {
        const config = configManager.loadConfig();
        const results = [];

        for (const site of config.sites.filter(s => s.enabled)) {
            // 防止重複執行
            if (activeTasks.has(site.id)) {
                console.log(`Batch task: ${site.name} is already running, skipping.`);
                continue;
            }

            // 設定初始狀態
            activeTasks.set(site.id, {
                jobId: site.id,
                siteName: site.name,
                url: site.url,
                status: 'pending',
                currentSelector: '等待隊列中...',
                totalSelectors: 1,
                completedSelectors: 0
            });
            sendProgressUpdate();

            try {
                const siteResults = await screenshotEngine.takeScreenshots(site.id, {
                    siteId: site.id,
                    url: site.url,
                    siteName: site.name,
                    selectors: site.selectors.filter(s => s.enabled),
                    outputDirectory: config.outputDirectory,
                    fileNamePattern: config.fileNamePattern,
                    fullPageScreenshot: site.fullPageScreenshot || false,
                    recordVideo: site.recordVideo || false,
                }, (progress: any) => {
                    activeTasks.set(progress.jobId, progress);
                    sendProgressUpdate();
                });
                results.push(...siteResults);
            } catch (error) {
                console.error(`Batch task ${site.name} failed:`, error);
            } finally {
                activeTasks.delete(site.id);
                sendProgressUpdate();
            }
        }

        return results;
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

app.whenReady().then(() => {
    // 初始化服務
    configManager = new ConfigManager();
    screenshotEngine = new ScreenshotEngine();
    scheduler = new Scheduler(async () => {
        // 排程執行時的回調
        const config = configManager.loadConfig();
        for (const site of config.sites.filter(s => s.enabled)) {
            // 防止重複執行
            if (activeTasks.has(site.id)) {
                console.log(`Scheduled task: ${site.name} is already running, skipping.`);
                continue;
            }

            // 設定初始狀態
            activeTasks.set(site.id, {
                jobId: site.id,
                siteName: site.name,
                url: site.url,
                status: 'pending',
                currentSelector: '排程執行中...',
                totalSelectors: 1,
                completedSelectors: 0
            });
            sendProgressUpdate();

            try {
                const siteResults = await screenshotEngine.takeScreenshots(site.id, {
                    siteId: site.id,
                    url: site.url,
                    siteName: site.name,
                    selectors: site.selectors.filter(s => s.enabled),
                    outputDirectory: config.outputDirectory,
                    fileNamePattern: config.fileNamePattern,
                    fullPageScreenshot: site.fullPageScreenshot || false,
                    recordVideo: site.recordVideo || false,
                }, (progress: any) => {
                    activeTasks.set(progress.jobId, progress);
                    sendProgressUpdate();
                });

                // 發送結果到渲染程式
                if (mainWindow) {
                    mainWindow.webContents.send(IPC_CHANNELS.SCREENSHOT_RESULT, siteResults);
                }
            } catch (error) {
                console.error(`Scheduled task ${site.name} failed:`, error);
            } finally {
                activeTasks.delete(site.id);
                sendProgressUpdate();
            }
        }
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
