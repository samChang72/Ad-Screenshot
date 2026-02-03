import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    retries: 0,
    workers: 1,
    reporter: [['html', { open: 'never' }], ['list']],
    use: {
        trace: 'on-first-retry',
    },
});
