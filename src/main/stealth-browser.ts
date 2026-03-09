import puppeteerCore from 'puppeteer-core';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'puppeteer-core';
import { BrowserManager } from './browser-manager';

// 使用 addExtra 包裝 puppeteer-core 並載入 stealth 插件
const puppeteerExtra = addExtra(puppeteerCore as any);
puppeteerExtra.use(StealthPlugin());

// 反偵測用的額外 Chrome launch args
const STEALTH_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-size=393,852',
    '--lang=zh-TW',
];

/**
 * 建立已套用 stealth 的瀏覽器實例
 */
export async function launchStealthBrowser(): Promise<Browser> {
    let executablePath: string | undefined;

    try {
        executablePath = await BrowserManager.getInstance().getExecutablePath();

        if (!executablePath) {
            executablePath = await BrowserManager.getInstance().ensureBrowser();
        }

        if (!executablePath) {
            throw new Error('無法找到或下載 Chromium 瀏覽器');
        }
    } catch (error: any) {
        const shortMsg = error.message?.split('\n')[0] || 'Unknown error';
        throw new Error(`瀏覽器啟動失敗: ${shortMsg}`);
    }

    // puppeteer-extra 包裝 puppeteer-core，型別不完全一致但執行時相容
    const browser = await puppeteerExtra.launch({
        headless: 'shell' as any,
        executablePath,
        args: STEALTH_ARGS,
    });

    if (!browser) {
        throw new Error('瀏覽器啟動失敗：launch 回傳 null');
    }

    return browser as unknown as Browser;
}
