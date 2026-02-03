import { test, expect } from '../fixtures/electron-app';
import { addSite, waitForToast } from '../fixtures/test-helpers';

test.describe('設定匯出匯入', () => {
    test('匯出設定', async ({ page, electronApp }) => {
        await addSite(page, '匯出測試', 'https://export.com');

        await electronApp.evaluate(async ({ dialog }) => {
            dialog.showSaveDialog = async () => ({
                canceled: false,
                filePath: '/tmp/ad-screenshot-test-export.json',
            });
        });

        await page.click('#btn-export');
        await waitForToast(page, '匯出');
    });

    test('匯入設定', async ({ page, electronApp }) => {
        // 先匯出一份設定檔作為匯入來源
        await addSite(page, '匯入來源', 'https://import-source.com');

        await electronApp.evaluate(async ({ dialog }) => {
            dialog.showSaveDialog = async () => ({
                canceled: false,
                filePath: '/tmp/ad-screenshot-test-import.json',
            });
        });
        await page.click('#btn-export');
        await waitForToast(page, '匯出');

        // 模擬匯入
        await electronApp.evaluate(async ({ dialog }) => {
            dialog.showOpenDialog = async () => ({
                canceled: false,
                filePaths: ['/tmp/ad-screenshot-test-import.json'],
            });
        });

        await page.click('#btn-import');
        await waitForToast(page, '設定已匯入');
    });
});
