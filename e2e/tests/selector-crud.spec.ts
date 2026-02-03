import { test, expect } from '../fixtures/electron-app';
import { addSiteWithSelector } from '../fixtures/test-helpers';

test.describe('CSS Selector CRUD', () => {
    test('新增網站時同時新增 selector', async ({ page }) => {
        await addSiteWithSelector(
            page, '有選擇器的網站', 'https://example.com',
            '廣告橫幅', '.ad-banner'
        );

        const selectorCode = page.locator('.selector-item code');
        await expect(selectorCode).toHaveText('.ad-banner');

        const selectorName = page.locator('.selector-item .selector-name');
        await expect(selectorName).toHaveText('廣告橫幅');
    });

    test('新增多個 selectors', async ({ page }) => {
        await page.click('#btn-add-site');
        await page.waitForSelector('#site-modal:not(.hidden)');
        await page.fill('#site-name', '多選擇器');
        await page.fill('#site-url', 'https://multi.com');

        await page.click('#btn-add-selector');
        let items = page.locator('.selector-edit-item');
        await items.last().locator('[data-field="name"]').fill('頂部廣告');
        await items.last().locator('[data-field="cssSelector"]').fill('.top-ad');

        await page.click('#btn-add-selector');
        items = page.locator('.selector-edit-item');
        await items.last().locator('[data-field="name"]').fill('側邊廣告');
        await items.last().locator('[data-field="cssSelector"]').fill('.side-ad');

        await page.click('#btn-save-site');
        await page.locator('#site-modal').waitFor({ state: 'hidden' });

        const selectors = page.locator('.selector-item');
        expect(await selectors.count()).toBe(2);
    });

    test('編輯時刪除 selector', async ({ page }) => {
        await addSiteWithSelector(
            page, '刪除選擇器測試', 'https://del-sel.com',
            '待刪選擇器', '.delete-me'
        );

        await page.click('[data-action="edit-site"]');
        await page.waitForSelector('#site-modal:not(.hidden)');

        expect(await page.locator('.selector-edit-item').count()).toBe(1);
        await page.click('.selector-edit-item [data-action="delete-selector"]');
        expect(await page.locator('.selector-edit-item').count()).toBe(0);

        await page.click('#btn-save-site');
        await page.locator('#site-modal').waitFor({ state: 'hidden' });

        expect(await page.locator('.selector-item').count()).toBe(0);
    });

    test('空名稱或空 CSS 的 selector 不會被儲存', async ({ page }) => {
        await page.click('#btn-add-site');
        await page.waitForSelector('#site-modal:not(.hidden)');
        await page.fill('#site-name', '過濾測試');
        await page.fill('#site-url', 'https://filter.com');

        await page.click('#btn-add-selector');
        const item = page.locator('.selector-edit-item').last();
        await item.locator('[data-field="name"]').fill('不完整');
        // cssSelector 留空

        await page.click('#btn-save-site');
        await page.locator('#site-modal').waitFor({ state: 'hidden' });

        expect(await page.locator('.selector-item').count()).toBe(0);
    });
});
