import { test as base, _electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

type TestFixtures = {
    electronApp: ElectronApplication;
    page: Page;
};

export const test = base.extend<TestFixtures>({
    electronApp: async ({}, use) => {
        const testUserData = fs.mkdtempSync(
            path.join(os.tmpdir(), 'ad-screenshot-test-')
        );

        const electronApp = await _electron.launch({
            args: [path.join(__dirname, '../../dist/main/main/index.js')],
            env: {
                ...process.env,
                AD_SCREENSHOT_TEST_MODE: '1',
                ELECTRON_USER_DATA_DIR: testUserData,
                NODE_ENV: 'test',
            },
        });

        try {
            await use(electronApp);
        } finally {
            await electronApp.close().catch(() => {});
            fs.rmSync(testUserData, { recursive: true, force: true });
        }
    },

    page: async ({ electronApp }, use) => {
        const page = await electronApp.firstWindow();
        await page.waitForLoadState('domcontentloaded');
        // 等待 app 初始化完成（config 載入後 sites-list 或 empty-state 會顯示）
        await page.waitForSelector('#sites-list:not(.hidden), #empty-state:not(.hidden)', {
            timeout: 10_000,
        });
        await use(page);
    },
});

export { expect } from '@playwright/test';
