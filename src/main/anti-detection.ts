import { Page } from 'puppeteer-core';

// Mobile User-Agent 清單（常見 iOS/Android 裝置）
const MOBILE_USER_AGENTS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0.5993.69 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
];

/**
 * 隨機選取一個 Mobile User-Agent
 */
export function getRandomUserAgent(): string {
    const index = Math.floor(Math.random() * MOBILE_USER_AGENTS.length);
    return MOBILE_USER_AGENTS[index];
}

/**
 * 判斷 UA 是否為 iOS Safari（不送 Sec-CH-UA 系列 headers）
 */
function isIOSSafari(ua: string): boolean {
    return ua.includes('Safari/604.1') && !ua.includes('CriOS');
}

/**
 * 取得與 UA 對應的 HTTP headers
 */
export function getHeadersForUA(ua: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
    };

    // iOS Safari 不送 Sec-CH-UA 系列 headers
    if (!isIOSSafari(ua)) {
        headers['Sec-CH-UA'] = '"Chromium";v="120", "Google Chrome";v="120", "Not=A?Brand";v="99"';
        headers['Sec-CH-UA-Mobile'] = '?1';
        headers['Sec-CH-UA-Platform'] = ua.includes('Android') ? '"Android"' : '"iOS"';
    }

    return headers;
}

/**
 * 注入反偵測腳本到頁面（在頁面載入前執行）
 */
export async function injectAntiDetectionScripts(page: Page): Promise<void> {
    await page.evaluateOnNewDocument(() => {
        // 覆蓋 navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });

        // 偽造 navigator.plugins（模擬真實瀏覽器有插件）
        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                const plugins = [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                    { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
                ];
                const pluginArray = Object.create(PluginArray.prototype);
                for (let i = 0; i < plugins.length; i++) {
                    const plugin = Object.create(Plugin.prototype);
                    Object.defineProperties(plugin, {
                        name: { value: plugins[i].name, enumerable: true },
                        filename: { value: plugins[i].filename, enumerable: true },
                        description: { value: plugins[i].description, enumerable: true },
                        length: { value: 0, enumerable: true },
                    });
                    Object.defineProperty(pluginArray, i, { value: plugin, enumerable: true });
                }
                Object.defineProperty(pluginArray, 'length', { value: plugins.length });
                return pluginArray;
            },
        });

        // 偽造 navigator.languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['zh-TW', 'zh', 'en-US', 'en'],
        });

        // 偽造 window.chrome 物件
        if (!(window as any).chrome) {
            (window as any).chrome = {
                runtime: {
                    onMessage: { addListener: () => {}, removeListener: () => {} },
                    sendMessage: () => {},
                    connect: () => {},
                },
                loadTimes: () => ({}),
                csi: () => ({}),
            };
        }

        // 偽造 WebGL vendor/renderer（依裝置類型動態調整）
        const getParameterProto = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
            const isAppleDevice = navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad');
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 0x9245) return isAppleDevice ? 'Apple Inc.' : 'Google Inc. (Qualcomm)';
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 0x9246) return isAppleDevice ? 'Apple GPU' : 'ANGLE (Qualcomm, Adreno (TM) 750, OpenGL ES 3.2)';
            return getParameterProto.call(this, parameter);
        };

        // 覆蓋 Permissions.query 避免洩漏異常
        const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
        (window.navigator.permissions as any).query = (parameters: any) => {
            if (parameters.name === 'notifications') {
                return Promise.resolve({ state: Notification.permission } as PermissionStatus);
            }
            return originalQuery(parameters);
        };
    });
}

/**
 * 設定頁面的反偵測配置（UA、headers、腳本注入）
 */
export async function setupAntiDetection(page: Page): Promise<string> {
    const ua = getRandomUserAgent();

    // 注入反偵測腳本（必須在 setUserAgent 之前，因為 evaluateOnNewDocument 在頁面載入前執行）
    await injectAntiDetectionScripts(page);

    // 設定 UA
    await page.setUserAgent(ua);

    // 設定對應的 HTTP headers
    const headers = getHeadersForUA(ua);
    await page.setExtraHTTPHeaders(headers);

    return ua;
}

/**
 * 嘗試解決 Cloudflare JS Challenge（透過等待 challenge 完成）
 * 如果頁面不是 Cloudflare challenge，直接跳過
 */
export async function handleCloudflareChallenge(page: Page): Promise<boolean> {
    try {
        // 檢查是否有 Cloudflare challenge 特徵
        const isCloudflare = await page.evaluate(() => {
            const title = document.title.toLowerCase();
            const body = document.body?.innerHTML || '';
            return (
                title.includes('just a moment') ||
                title.includes('attention required') ||
                body.includes('cf-browser-verification') ||
                body.includes('challenge-platform') ||
                body.includes('cf_chl_opt')
            );
        });

        if (!isCloudflare) return false;

        // 等待 Cloudflare challenge 自動完成（stealth 插件讓瀏覽器看起來像真的）
        // 最多等待 15 秒
        for (let i = 0; i < 15; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const stillChallenge = await page.evaluate(() => {
                const title = document.title.toLowerCase();
                return title.includes('just a moment') || title.includes('attention required');
            });

            if (!stillChallenge) {
                return true;
            }
        }

        return false;
    } catch {
        // 如果檢測過程出錯，靜默跳過
        return false;
    }
}

/**
 * 產生隨機延遲時間（毫秒）
 */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 模擬滑鼠隨機移動（2-3 次）
 */
export async function simulateMouseMovement(page: Page): Promise<void> {
    const moveCount = 2 + Math.floor(Math.random() * 2); // 2-3 次
    for (let i = 0; i < moveCount; i++) {
        const x = Math.floor(Math.random() * 393);
        const y = Math.floor(Math.random() * 852);
        await page.mouse.move(x, y);
        await randomDelay(100, 300);
    }
}

/**
 * 隨機化滾動的輔助函數（用於注入到 page.evaluate 內）
 * 回傳用於替換固定滾動參數的隨機化版本
 */
export function getRandomizedScrollParams(): { scrollStepFactor: number; scrollDelayMs: number } {
    // 滾動步長 ±30% 隨機變化
    const scrollStepFactor = 0.7 + Math.random() * 0.6; // 0.7 ~ 1.3
    // 滾動延遲 800-1200ms
    const scrollDelayMs = 800 + Math.floor(Math.random() * 400);
    return { scrollStepFactor, scrollDelayMs };
}
