import { test, expect } from '../fixtures/electron-app';
import { addSiteWithSelector, waitForToast } from '../fixtures/test-helpers';

test.describe('截圖操作（mock）', () => {
    test('單一網站截圖觸發並顯示結果', async ({ page }) => {
        await addSiteWithSelector(
            page, '截圖測試', 'https://screenshot.com',
            '廣告', '.ad'
        );

        await page.click('[data-action="run-site"]');
        await waitForToast(page, '成功截取');
    });

    test('執行全部按鈕觸發所有網站', async ({ page }) => {
        await addSiteWithSelector(page, '站台1', 'https://site1.com', 'Ad1', '.ad1');
        await addSiteWithSelector(page, '站台2', 'https://site2.com', 'Ad2', '.ad2');

        await page.click('#btn-run-all');
        await waitForToast(page, '成功截取');
    });

    test('無網站時執行全部顯示錯誤', async ({ page }) => {
        await page.click('#btn-run-all');
        await waitForToast(page, '請先新增網站');
    });
});
