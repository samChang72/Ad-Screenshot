const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const version = pkg.version;
const releaseDir = path.join(__dirname, '../release');
const docsDir = path.join(__dirname, '../docs');
const downloadsDir = path.join(docsDir, 'downloads');

// 確保目錄存在
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

console.log(`🚀 開始準備發佈檔案 (版本: ${version})...`);

// 尋找檔案
function findFile(dir, pattern) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    const found = files.find(f => f.includes(pattern));
    return found ? { name: found, path: path.join(dir, found) } : null;
}

// 複製並重命名
function copyAndRename(sourceFile, targetName) {
    if (!sourceFile) return false;
    const targetPath = path.join(downloadsDir, targetName);
    console.log(`📦 正在準備: ${sourceFile.name} -> ${targetName}`);
    fs.copyFileSync(sourceFile.path, targetPath);
    return true;
}

// 處理 macOS (支援 arm64 命名的自動轉換)
const dmgFile = findFile(releaseDir, '.dmg');
if (dmgFile) {
    // 讓產出的檔名符合您目前在 Release 上的命名規範
    const targetName = `Ad.Screenshot-${version}-arm64.dmg`;
    copyAndRename(dmgFile, targetName);
} else {
    console.warn('⚠️  警告: 在 release/ 目錄中找不到 .dmg 檔案。');
}

// 處理 Windows
const exeFile = findFile(releaseDir, '.exe');
if (exeFile) {
    const targetName = `Ad.Screenshot-${version}.exe`;
    copyAndRename(exeFile, targetName);
} else {
    console.warn('⚠️  警告: 在 release/ 目錄中找不到 .exe 檔案。');
}

console.log('\n✅ 準備完成！');
console.log('請將 docs/downloads/ 內的檔案上傳至 GitHub Release。');