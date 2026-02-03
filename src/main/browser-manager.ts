import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { Browser, BrowserPlatform, install, resolveBuildId, detectBrowserPlatform, getInstalledBrowsers } from '@puppeteer/browsers';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/types';

// 定義我們需要的 Chrome 版本 (對應 Puppeteer v23 的推薦版本)
// Puppeteer v23.0.0 uses Chrome 127.0.6533.88
// 定義我們需要的 Chrome 版本 (對應當前 puppeteer_cache 中的版本)
const CHROME_VERSION = '131.0.6778.204';

export class BrowserManager {
    private static instance: BrowserManager;
    private browserPath: string | null = null;
    private downloadPromise: Promise<string> | null = null;

    private constructor() { }

    public static getInstance(): BrowserManager {
        if (!BrowserManager.instance) {
            BrowserManager.instance = new BrowserManager();
        }
        return BrowserManager.instance;
    }

    /**
     * 取得瀏覽器安裝路徑 (User Data Directory)
     */
    private getInstallDir(): string {
        return path.join(app.getPath('userData'), 'chrome-bin');
    }

    /**
     * 取得當前平台
     */
    private getPlatform(): BrowserPlatform {
        const platform = detectBrowserPlatform();
        if (!platform) {
            throw new Error('Unsupported platform');
        }
        return platform;
    }

    /**
     * 確保瀏覽器已安裝
     * @param mainWindow 用於發送進度更新的主視窗
     * @returns 可執行檔路徑
     */
    public async ensureBrowser(mainWindow?: BrowserWindow): Promise<string> {
        if (this.browserPath && fs.existsSync(this.browserPath)) {
            return this.browserPath;
        }

        const installDir = this.getInstallDir();
        const platform = this.getPlatform();
        const buildId = await resolveBuildId(Browser.CHROME, platform, CHROME_VERSION);

        console.log(`Checking for Chrome ${buildId} in ${installDir}`);

        // 檢查是否已安裝
        const installed = await getInstalledBrowsers({
            cacheDir: installDir
        });

        const found = installed.find(b => b.browser === Browser.CHROME && b.buildId === buildId);

        if (found) {
            console.log(`Chrome found at ${found.executablePath}`);
            this.browserPath = found.executablePath;
            return found.executablePath;
        }

        // 需要下載
        // 如果已經有下載任務，回傳同一個 Promise，避免多次下載
        if (this.downloadPromise) {
            return this.downloadPromise;
        }

        this.downloadPromise = this.downloadBrowser(mainWindow, installDir, buildId);
        return this.downloadPromise;
    }

    private async downloadBrowser(
        mainWindow: BrowserWindow | undefined,
        installDir: string,
        buildId: string
    ): Promise<string> {
        this.notifyStatus(mainWindow, 'downloading');

        try {
            console.log(`Downloading Chrome ${buildId}...`);

            const installedBrowser = await install({
                browser: Browser.CHROME,
                buildId: buildId,
                cacheDir: installDir,
                unpack: true,
                downloadProgressCallback: (downloadedBytes, totalBytes) => {
                    if (mainWindow) {
                        const percent = Math.round((downloadedBytes / totalBytes) * 100);
                        mainWindow.webContents.send(IPC_CHANNELS.BROWSER_DOWNLOAD_PROGRESS, {
                            percent,
                            downloadedBytes,
                            totalBytes
                        });
                    }
                }
            });

            this.browserPath = installedBrowser.executablePath;
            this.downloadPromise = null;
            this.notifyStatus(mainWindow, 'ready');

            console.log(`Chrome installed successfully at ${this.browserPath}`);
            return this.browserPath;

        } catch (error) {
            this.downloadPromise = null;
            this.notifyStatus(mainWindow, 'error');
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Failed to download Chrome:', error);
            throw new Error(
                `無法下載 Chromium 瀏覽器: ${msg}\n` +
                `請確認網路連線正常，或手動執行: npx @puppeteer/browsers install chrome@${CHROME_VERSION}`
            );
        }
    }

    private notifyStatus(mainWindow: BrowserWindow | undefined, status: string) {
        if (mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.BROWSER_STATUS, status);
        }
    }

    public async getExecutablePath(): Promise<string | undefined> {
        if (this.browserPath) return this.browserPath;

        try {
            // 優先檢查打包進去的瀏覽器 (app.asar.unpacked)
            if (process.env.NODE_ENV !== 'development') {
                const appPath = process.resourcesPath; // Contents/Resources

                // 根據平台建構可能的路徑
                // 結構: .../app.asar.unpacked/puppeteer_cache/puppeteer/chrome/mac_arm-131.0.6778.204/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
                // 由於路徑太複雜，我們使用搜尋方式
                const bundledCachePath = path.join(appPath, 'app.asar.unpacked', 'puppeteer_cache', 'puppeteer');

                if (fs.existsSync(bundledCachePath)) {
                    // 簡單的遞迴搜尋函數
                    const findChrome = (dir: string): string | undefined => {
                        const files = fs.readdirSync(dir);
                        for (const file of files) {
                            const fullPath = path.join(dir, file);
                            // Windows: 搜尋 chrome.exe
                            if (process.platform === 'win32' && file === 'chrome.exe') {
                                return fullPath;
                            }
                            // macOS: 搜尋 .app bundle 內的執行檔
                            if (file === 'Google Chrome for Testing' || file === 'Chromium' || file === 'Google Chrome') {
                                if (fullPath.includes('MacOS')) {
                                    return fullPath;
                                }
                            }

                            if (fs.statSync(fullPath).isDirectory()) {
                                const found = findChrome(fullPath);
                                if (found) return found;
                            }
                        }
                        return undefined;
                    };

                    const bundledBrowser = findChrome(bundledCachePath);
                    if (bundledBrowser) {
                        console.log(`Found bundled browser at ${bundledBrowser}`);
                        this.browserPath = bundledBrowser;
                        return bundledBrowser;
                    }
                }
            }

            // 如果找不到打包的，才找 User Data
            const installDir = this.getInstallDir();
            const platform = this.getPlatform();
            const buildId = await resolveBuildId(Browser.CHROME, platform, CHROME_VERSION);

            const installed = await getInstalledBrowsers({
                cacheDir: installDir
            });

            const found = installed.find(b => b.browser === Browser.CHROME && b.buildId === buildId);
            if (found) {
                this.browserPath = found.executablePath;
                return found.executablePath;
            }
        } catch (e) {
            console.error('Error resolving executable path:', e);
        }
        return undefined;
    }
}
