import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import { ScreenshotJob, ScreenshotResult, SelectorConfig } from '../shared/types';

export class ScreenshotEngine {
    private browser: Browser | null = null;

    private async getBrowser(): Promise<Browser> {
        if (!this.browser) {
            // 智慧偵測 Chromium 執行路徑
            let executablePath: string | undefined = undefined;
            
            // 如果是打包後的環境 (production)，嘗試尋找打包進去的 Chromium
            if (process.env.NODE_ENV !== 'development') {
                // 這裡的路徑取決於 electron-builder 如何打包 puppeteer
                // 通常 puppeteer 會下載 chromium 到 cache，我們需要確保它被正確打包
                // 或者嘗試使用系統安裝的 Chrome (作為備案)
                try {
                    // 嘗試自動偵測，如果不行的話，錯誤會被 catch 住
                    const puppeteerConfig = require('puppeteer/package.json');
                    // 這裡先保留預設，讓 puppeteer 自己找，但在 launch args 增加設定
                } catch (e) {
                    console.warn('Could not resolve puppeteer config', e);
                }
            }

            try {
                this.browser = await puppeteer.launch({
                    headless: true,
                    // 重要：打包後必須指定 executablePath，否則會去 node_modules 找
                    // 如果 puppeteer 的 browser 沒有被正確 unpack，這裡會失敗
                    // 我們先用預設的嘗試，如果失敗，錯誤訊息現在會顯示出來
                    args: ['--no-sandbox', '--disable-setuid-sandbox'],
                });
            } catch (launchError: any) {
                // 如果啟動失敗，拋出詳細錯誤
                throw new Error(`Puppeteer Launch Failed: ${launchError.message}\nStack: ${launchError.stack}`);
            }
        }
        return this.browser;
    }

    async takeScreenshots(
        jobId: string,
        job: ScreenshotJob,
        onProgress?: (progress: any) => void
    ): Promise<ScreenshotResult[]> {
        const results: ScreenshotResult[] = [];
        let page: Page | null = null;

        try {
            // 捕捉 getBrowser 可能拋出的啟動錯誤
            const browser = await this.getBrowser();
            page = await browser.newPage();

            // 設定 iPhone 14 Pro 環境
            await page.setViewport({
                width: 393,
                height: 852,
                deviceScaleFactor: 3,
                isMobile: true,
                hasTouch: true,
            });

            // 設定 User Agent 為 iPhone
            await page.setUserAgent(
                'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
            );

            // 載入頁面 (優化：使用 domcontentloaded 以提早啟動，避免被遲到的小腳本阻塞)
            try {
                await page.goto(job.url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 45000 // 縮短一點導航超時，把時間留給滾動載入
                });
            } catch (error) {
                console.warn(`Navigation timeout or error for ${job.url}, attempting to proceed anyway...`);
            }

            // 等待頁面主體渲染（給予基本渲染時間）
            await this.delay(3000);

            // 確保輸出目錄存在
            if (!fs.existsSync(job.outputDirectory)) {
                fs.mkdirSync(job.outputDirectory, { recursive: true });
            }

            // 全頁截圖（如果啟用）
            if (job.fullPageScreenshot) {
                if (onProgress) {
                    onProgress({
                        jobId,
                        siteName: job.siteName,
                        url: job.url,
                        currentSelector: '完整頁面',
                        totalSelectors: job.selectors.length + 1,
                        completedSelectors: 0,
                        status: 'running'
                    });
                }
                const fullPageResult = await this.captureFullPage(page, job);
                results.push(fullPageResult);
            }

            // 對每個 selector 截圖
            let completedCount = job.fullPageScreenshot ? 1 : 0;
            const totalCount = job.selectors.length + (job.fullPageScreenshot ? 1 : 0);

            for (const selector of job.selectors) {
                // 發送進度更新
                if (onProgress) {
                    onProgress({
                        jobId,
                        siteName: job.siteName,
                        url: job.url,
                        currentSelector: selector.name,
                        totalSelectors: totalCount,
                        completedSelectors: completedCount,
                        status: 'running'
                    });
                }
                const result = await this.captureElement(page, job, selector);
                results.push(result);
                completedCount++;
            }

            // 完成最後進度更新
            if (onProgress) {
                onProgress({
                    jobId,
                    siteName: job.siteName,
                    url: job.url,
                    currentSelector: '已完成',
                    totalSelectors: totalCount,
                    completedSelectors: totalCount,
                    status: 'success'
                });
            }

        } catch (error) {
            const err = error as Error;
            const errorMessage = `${err.message}\nStack: ${err.stack || ''}`;
            console.error(`Failed to take screenshots for ${job.url}:`, errorMessage);

            // 如果是在啟動瀏覽器時就失敗，直接回傳一個系統錯誤
            if (results.length === 0 && job.selectors.length === 0) {
                 // 這裡應該不會發生，因為 job.selectors 通常有東西，但為了防禦性程式設計
                 results.push({
                    success: false,
                    siteName: job.siteName,
                    selectorName: '系統錯誤',
                    error: errorMessage,
                    timestamp: new Date().toISOString(),
                });
            }

            // 為所有 selectors 回報錯誤 (如果尚未執行)
            // 注意：這裡邏輯有點簡化，理想上應該只回報尚未執行的
            if (results.length < (job.selectors.length + (job.fullPageScreenshot ? 1 : 0))) {
                 for (const selector of job.selectors) {
                    // 避免重複加入已完成的
                    if (!results.find(r => r.selectorName === selector.name)) {
                        results.push({
                            success: false,
                            siteName: job.siteName,
                            selectorName: selector.name,
                            error: errorMessage,
                            timestamp: new Date().toISOString(),
                        });
                    }
                }
            }
        } finally {
            if (page) {
                await page.close();
            }
        }

        return results;
    }

    private async captureElement(
        page: Page,
        job: ScreenshotJob,
        selector: SelectorConfig
    ): Promise<ScreenshotResult> {
        const timestamp = this.formatTimestamp(new Date());

        try {
            // 嘗試找到元素
            const element = await page.$(selector.cssSelector);

            if (!element) {
                return {
                    success: false,
                    siteName: job.siteName,
                    selectorName: selector.name,
                    error: `找不到元素: ${selector.cssSelector}`,
                    timestamp,
                };
            }

            // 產生檔案名稱
            const fileName = this.generateFileName(job.fileNamePattern, {
                siteName: this.sanitizeFileName(job.siteName),
                selectorName: this.sanitizeFileName(selector.name),
                timestamp,
            });

            const filePath = path.join(job.outputDirectory, `${fileName}.png`);

            // 截圖
            await element.screenshot({ path: filePath });

            return {
                success: true,
                siteName: job.siteName,
                selectorName: selector.name,
                filePath,
                timestamp,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                siteName: job.siteName,
                selectorName: selector.name,
                error: errorMessage,
                timestamp,
            };
        }
    }

    // 取得解壓縮後的 ffmpeg 路徑
    private getFfmpegPath(): string {
        // 在開發模式下，ffmpeg-static 位於 node_modules 中
        // 在打包後，如果我們有設定 asarUnpack，它會在 app.asar.unpacked 資料夾中
        const ffmpegPath = require('ffmpeg-static');
        
        if (process.env.NODE_ENV === 'development') {
            return ffmpegPath;
        }

        // 修正路徑：將 app.asar 替換為 app.asar.unpacked
        return ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    }

    private async captureFullPage(
        page: Page,
        job: ScreenshotJob
    ): Promise<ScreenshotResult> {
        const timestamp = this.formatTimestamp(new Date());
        let recorder: PuppeteerScreenRecorder | null = null;
        const fileName = this.generateFileName(job.fileNamePattern, {
            siteName: this.sanitizeFileName(job.siteName),
            selectorName: 'fullpage',
            timestamp,
        });
        const videoPath = path.join(job.outputDirectory, `${fileName}.mp4`);

        try {
            // 如果啟用錄影，啟動錄影
            if (job.recordVideo) {
                recorder = new PuppeteerScreenRecorder(page, {
                    followNewTab: true,
                    fps: 25,
                    ffmpeg_Path: this.getFfmpegPath(), // 顯式指定 ffmpeg 路徑
                    videoFrame: {
                        width: 393,
                        height: 852,
                    },
                    aspectRatio: '9:19',
                });
                await recorder.start(videoPath);
            }

            // 滾動整個頁面觸發懶加載
            await this.scrollFullPage(page);

            // 等待圖片載入
            await this.waitForImages(page);

            // 額外等待確保內容完全載入
            await this.delay(1500);

            const filePath = path.join(job.outputDirectory, `${fileName}.png`);

            // 全頁截圖
            await page.screenshot({
                path: filePath,
                fullPage: true
            });

            // 停止錄影
            if (recorder) {
                await recorder.stop();
            }

            return {
                success: true,
                siteName: job.siteName,
                selectorName: '完整頁面',
                filePath: job.recordVideo ? `${filePath} (影片: ${videoPath})` : filePath,
                timestamp,
            };

        } catch (error) {
            if (recorder) {
                await recorder.stop().catch(() => { });
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                siteName: job.siteName,
                selectorName: '完整頁面',
                error: errorMessage,
                timestamp,
            };
        }
    }

    // 滾動整個頁面觸發懶加載
    private async scrollFullPage(page: Page): Promise<void> {
        await page.evaluate(async () => {
            const scrollStep = window.innerHeight / 2;
            const scrollDelay = 1000;

            // 取得頁面總高度
            const getScrollHeight = () => Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight
            );

            let currentPosition = 0;
            let previousHeight = 0;
            let scrollHeight = getScrollHeight();

            // 滾動到底部
            while (currentPosition < scrollHeight) {
                window.scrollTo(0, currentPosition);
                await new Promise(resolve => setTimeout(resolve, scrollDelay));
                currentPosition += scrollStep;

                // 檢查是否有新內容載入（無限滾動）
                const newHeight = getScrollHeight();
                if (newHeight > scrollHeight) {
                    scrollHeight = newHeight;
                }

                // 防止無限循環
                if (previousHeight === scrollHeight && currentPosition > scrollHeight) {
                    break;
                }
                previousHeight = scrollHeight;
            }

            // 滾動到最底部確保
            window.scrollTo(0, scrollHeight);
            await new Promise(resolve => setTimeout(resolve, 500));

            // 滾回頂部
            window.scrollTo(0, 0);
            await new Promise(resolve => setTimeout(resolve, 300));
        });
    }

    // 等待所有圖片載入
    private async waitForImages(page: Page): Promise<void> {
        await page.evaluate(async () => {
            const images = Array.from(document.querySelectorAll('img'));

            await Promise.all(
                images.map(img => {
                    if (img.complete) return Promise.resolve();

                    return new Promise<void>((resolve) => {
                        img.addEventListener('load', () => resolve());
                        img.addEventListener('error', () => resolve());
                        // 超時 3 秒
                        setTimeout(() => resolve(), 3000);
                    });
                })
            );
        });
    }

    private generateFileName(
        pattern: string,
        values: { siteName: string; selectorName: string; timestamp: string }
    ): string {
        return pattern
            .replace('{siteName}', values.siteName)
            .replace('{selectorName}', values.selectorName)
            .replace('{timestamp}', values.timestamp);
    }

    private sanitizeFileName(name: string): string {
        return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '-');
    }

    private formatTimestamp(date: Date): string {
        return date.toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_')
            .slice(0, 19);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
