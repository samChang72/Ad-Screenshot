import { Page } from '@playwright/test';

export async function addSite(
    page: Page,
    name: string,
    url: string
): Promise<void> {
    await page.click('#btn-add-site');
    await page.waitForSelector('#site-modal:not(.hidden)');
    await page.fill('#site-name', name);
    await page.fill('#site-url', url);
    await page.click('#btn-save-site');
    await page.locator('#site-modal').waitFor({ state: 'hidden' });
}

export async function addSiteWithSelector(
    page: Page,
    siteName: string,
    siteUrl: string,
    selectorName: string,
    cssSelector: string
): Promise<void> {
    await page.click('#btn-add-site');
    await page.waitForSelector('#site-modal:not(.hidden)');
    await page.fill('#site-name', siteName);
    await page.fill('#site-url', siteUrl);
    await page.click('#btn-add-selector');
    const selectorItem = page.locator('.selector-edit-item').last();
    await selectorItem.locator('[data-field="name"]').fill(selectorName);
    await selectorItem.locator('[data-field="cssSelector"]').fill(cssSelector);
    await page.click('#btn-save-site');
    await page.locator('#site-modal').waitFor({ state: 'hidden' });
}

export async function waitForToast(
    page: Page,
    textContains: string
): Promise<void> {
    await page.waitForSelector(
        `#toast-container .toast:has-text("${textContains}")`,
        { timeout: 5_000 }
    );
}

export async function getSiteCount(page: Page): Promise<number> {
    return page.locator('.site-item').count();
}
