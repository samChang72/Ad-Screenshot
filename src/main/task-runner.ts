import { BrowserWindow } from 'electron';
import { ScreenshotEngine } from './screenshot-engine';
import { BrowserManager } from './browser-manager';
import { AppConfig, SiteConfig, ScreenshotResult, IPC_CHANNELS, ScreenshotProgress } from '../shared/types';

export interface TaskContext {
    mainWindow: BrowserWindow | null;
    screenshotEngine: ScreenshotEngine;
    activeTasks: Map<string, ScreenshotProgress>;
    sendProgressUpdate: () => void;
}

export class TaskRunner {
    private context: TaskContext;

    constructor(context: TaskContext) {
        this.context = context;
    }

    /**
     * 執行單一網站的截圖任務
     */
    async runSingle(site: SiteConfig, config: AppConfig): Promise<ScreenshotResult[]> {
        const { mainWindow, screenshotEngine, activeTasks, sendProgressUpdate } = this.context;

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

        // 確保瀏覽器已準備好
        try {
            await BrowserManager.getInstance().ensureBrowser(mainWindow || undefined);
        } catch (error) {
            console.error('Browser check failed:', error);
            return [{
                success: false,
                siteName: site.name,
                selectorName: '系統',
                error: `瀏覽器準備失敗: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date().toISOString(),
            }];
        }

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
            }, (progress: ScreenshotProgress) => {
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
            activeTasks.delete(site.id);
            sendProgressUpdate();
        }
    }

    /**
     * 執行所有啟用網站的截圖任務
     */
    async runAll(config: AppConfig): Promise<ScreenshotResult[]> {
        const { mainWindow, activeTasks } = this.context;
        const results: ScreenshotResult[] = [];

        // 確保瀏覽器已準備好
        try {
            await BrowserManager.getInstance().ensureBrowser(mainWindow || undefined);
        } catch (error) {
            console.error('Browser check failed for batch:', error);
            return [{
                success: false,
                siteName: '系統',
                selectorName: '瀏覽器',
                error: `瀏覽器準備失敗: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date().toISOString(),
            }];
        }

        for (const site of config.sites.filter(s => s.enabled)) {
            // 防止重複執行
            if (activeTasks.has(site.id)) {
                console.log(`Batch task: ${site.name} is already running, skipping.`);
                continue;
            }

            const siteResults = await this.runSingle(site, config);
            results.push(...siteResults);
        }

        return results;
    }

    /**
     * 排程執行 (會發送結果到渲染程式)
     */
    async runScheduled(config: AppConfig): Promise<void> {
        const { mainWindow, activeTasks } = this.context;

        // 確保瀏覽器已準備好
        try {
            await BrowserManager.getInstance().ensureBrowser(mainWindow || undefined);
        } catch (error) {
            console.error('Browser check failed for scheduled task:', error);
            return;
        }

        for (const site of config.sites.filter(s => s.enabled)) {
            if (activeTasks.has(site.id)) {
                console.log(`Scheduled task: ${site.name} is already running, skipping.`);
                continue;
            }

            const siteResults = await this.runSingle(site, config);

            // 發送結果到渲染程式
            if (mainWindow) {
                mainWindow.webContents.send(IPC_CHANNELS.SCREENSHOT_RESULT, siteResults);
            }
        }
    }
}
