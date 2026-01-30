import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import { ScreenshotJob, ScreenshotResult, SelectorConfig } from '../shared/types';

export class ScreenshotEngine {
    private browser: Browser | null = null;

    private async getBrowser(): Promise<Browser> {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
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
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to take screenshots for ${job.url}:`, errorMessage);

            // 為所有 selectors 回報錯誤
            for (const selector of job.selectors) {
                results.push({
                    success: false,
                    siteName: job.siteName,
                    selectorName: selector.name,
                    error: errorMessage,
                    timestamp: new Date().toISOString(),
                });
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
