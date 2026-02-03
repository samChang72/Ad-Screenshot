const { notarize } = require('@electron/notarize');
const path = require('path');
require('dotenv').config();

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // 支援環境變數略過公證
  if (process.env.SKIP_NOTARIZE === 'true') {
    console.log('⏩ 略過公證步驟 (SKIP_NOTARIZE=true)');
    return;
  }

  // 僅在 macOS 上執行公證
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // 檢查環境變數
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn('⚠️  略過公證: 遺失 APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD 或 APPLE_TEAM_ID 環境變數。');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`🚀 開始公證應用程式: ${appPath}`);

  try {
    await notarize({
      appPath,
      appleId,
      appleIdPassword,
      teamId,
    });
    console.log('✅ 公證成功！應用程式已被 Apple 授權。');

    // 新增：釘掛 (Staple) 公證結果
    console.log(`📦 開始釘掛 (Staple) 公證結果: ${appPath}`);
    const { execSync } = require('child_process');
    try {
      execSync(`xcrun stapler staple "${appPath}"`);
      console.log('✅ 釘掛 (Staple) 成功！');
    } catch (stapleError) {
      console.error('⚠️ 釘掛失敗，但公證已完成。這可能會影響離線驗證。', stapleError);
    }

  } catch (error) {
    console.error('❌ 公證失敗:', error);
    process.exit(1);
  }
};
