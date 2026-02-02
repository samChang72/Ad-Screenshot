const fs = require('fs');
const path = require('path');

const releaseDir = path.join(__dirname, '../release');
const docsDir = path.join(__dirname, '../docs');
const downloadsDir = path.join(docsDir, 'downloads');

// 確保目錄存在
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

console.log('🚀 開始準備發佈檔案...');

// 尋找最新的檔案
function findLatestFile(dir, extension) {
    if (!fs.existsSync(dir)) return null;
    
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith(extension))
        .map(f => ({
            name: f,
            path: path.join(dir, f),
            mtime: fs.statSync(path.join(dir, f)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime); // 最新的在前

    return files.length > 0 ? files[0] : null;
}

// 複製並重命名
function copyAndRename(sourceFile, targetName) {
    if (!sourceFile) return false;
    
    const targetPath = path.join(downloadsDir, targetName);
    console.log(`📦 正在複製: ${sourceFile.name} -> ${targetName}`);
    fs.copyFileSync(sourceFile.path, targetPath);
    return true;
}

// 處理 macOS (.dmg)
const dmgFile = findLatestFile(releaseDir, '.dmg');
if (dmgFile) {
    copyAndRename(dmgFile, 'AdScreenshot-mac.dmg');
} else {
    console.warn('⚠️  警告: 在 release/ 目錄中找不到 .dmg 檔案。請先執行 npm run dist:mac');
}

// 處理 Windows (.exe)
const exeFile = findLatestFile(releaseDir, '.exe');
if (exeFile) {
    copyAndRename(exeFile, 'AdScreenshot-win.exe');
} else {
    console.warn('⚠️  警告: 在 release/ 目錄中找不到 .exe 檔案。請先執行 npm run dist:win');
}

console.log('\n✅ 準備完成！');
console.log('📄 網頁位置: docs/index.html');
console.log('📥 下載連結已指向 GitHub Releases (samChang72/Ad-Screenshot)');
console.log('\n👉 下一步：');
console.log('1. 執行 npm run dist:mac 與 npm run dist:win');
console.log('2. 執行 npm run prepare-site 以重新命名檔案');
console.log('3. 將 docs/downloads/ 內的檔案上傳至 GitHub Release');
console.log('4. 確保 Release Tag 為「最新 (Latest)」，網頁連結即會生效');
