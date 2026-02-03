import { test, expect } from '../fixtures/electron-app';
import { addSite, getSiteCount, waitForToast } from '../fixtures/test-helpers';

test.describe('網站 CRUD', () => {
    test('新增網站後出現在列表中', async ({ page }) => {
        await addSite(page, '測試網站', 'https://example.com');

        const siteCount = await getSiteCount(page);
        expect(siteCount).toBe(1);

        const siteName = page.locator('.site-item .site-name');
        await expect(siteName).toHaveText('測試網站');

        const siteUrl = page.locator('.site-item .site-url');
        await expect(siteUrl).toHaveText('https://example.com');
    });

    test('新增網站時名稱和網址為必填', async ({ page }) => {
        await page.click('#btn-add-site');
        await page.waitForSelector('#site-modal:not(.hidden)');
        await page.click('#btn-save-site');
        await waitForToast(page, '請填寫網站名稱和網址');
        await expect(page.locator('#site-modal')).not.toHaveClass(/hidden/);
    });

    test('取消按鈕關閉 modal', async ({ page }) => {
        await page.click('#btn-add-site');
        await page.waitForSelector('#site-modal:not(.hidden)');
        await page.click('#btn-cancel');
        await expect(page.locator('#site-modal')).toHaveClass(/hidden/);
    });

    test('編輯現有網站', async ({ page }) => {
        await addSite(page, '原始名稱', 'https://original.com');
        await page.click('[data-action="edit-site"]');
        await page.waitForSelector('#site-modal:not(.hidden)');

        await expect(page.locator('#site-name')).toHaveValue('原始名稱');
        await expect(page.locator('#site-url')).toHaveValue('https://original.com');

        await page.fill('#site-name', '修改後名稱');
        await page.click('#btn-save-site');
        await page.locator('#site-modal').waitFor({ state: 'hidden' });

        const siteName = page.locator('.site-item .site-name');
        await expect(siteName).toHaveText('修改後名稱');
    });

    test('刪除網站', async ({ page }) => {
        await addSite(page, '待刪除', 'https://delete-me.com');
        expect(await getSiteCount(page)).toBe(1);

        page.on('dialog', dialog => dialog.accept());
        await page.click('[data-action="delete-site"]');

        // 等待 empty-state 出現，表示列表已清空
        await expect(page.locator('#empty-state')).toBeVisible();
        // sites-list 被隱藏
        await expect(page.locator('#sites-list')).toBeHidden();
    });

    test('切換網站啟用狀態', async ({ page }) => {
        await addSite(page, '切換測試', 'https://toggle.com');
        const checkbox = page.locator('.site-item [data-action="toggle-site"]');
        await expect(checkbox).toBeChecked();
        await checkbox.uncheck();
        await expect(checkbox).not.toBeChecked();
    });
});
