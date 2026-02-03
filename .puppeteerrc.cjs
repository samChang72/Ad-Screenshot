const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
    // 將瀏覽器下載到專案目錄下的 puppeteer_cache，以便打包進 Electron
    downloadPath: join(__dirname, 'puppeteer_cache', 'puppeteer'),
};
