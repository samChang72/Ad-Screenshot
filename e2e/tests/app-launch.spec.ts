import { test, expect } from '../fixtures/electron-app';

test.describe('應用程式啟動', () => {
    test('視窗正確載入並顯示標題', async ({ page }) => {
        const title = await page.title();
        expect(title).toBe('Ad Screenshot');
    });

    test('初始狀態顯示空網站列表提示', async ({ page }) => {
        const emptyState = page.locator('#empty-state');
        await expect(emptyState).toBeVisible();
    });

    test('工具列按鈕全部可見', async ({ page }) => {
        await expect(page.locator('#btn-add-site')).toBeVisible();
        await expect(page.locator('#btn-import')).toBeVisible();
        await expect(page.locator('#btn-export')).toBeVisible();
        await expect(page.locator('#btn-run-all')).toBeVisible();
    });

    test('預設排程為停用', async ({ page }) => {
        const checkbox = page.locator('#schedule-enabled');
        await expect(checkbox).not.toBeChecked();
    });
});
