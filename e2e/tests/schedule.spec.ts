import { test, expect } from '../fixtures/electron-app';

test.describe('排程設定', () => {
    test('啟用排程後顯示排程選項', async ({ page }) => {
        const scheduleOptions = page.locator('#schedule-options');
        await expect(scheduleOptions).toBeHidden();

        await page.check('#schedule-enabled');
        await expect(scheduleOptions).toBeVisible();
    });

    test('停用排程後隱藏選項', async ({ page }) => {
        await page.check('#schedule-enabled');
        await expect(page.locator('#schedule-options')).toBeVisible();

        await page.uncheck('#schedule-enabled');
        await expect(page.locator('#schedule-options')).toBeHidden();
    });

    test('修改排程間隔', async ({ page }) => {
        await page.check('#schedule-enabled');
        await page.fill('#schedule-interval', '30');
        await page.locator('#schedule-interval').press('Tab');

        // 驗證值已更新
        await expect(page.locator('#schedule-interval')).toHaveValue('30');
    });
});
