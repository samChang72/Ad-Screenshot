// 共用型別定義
// IPC 通道名稱
export const IPC_CHANNELS = {
    // 設定相關
    CONFIG_LOAD: 'config:load',
    CONFIG_SAVE: 'config:save',
    CONFIG_EXPORT: 'config:export',
    CONFIG_IMPORT: 'config:import',
    // 截圖相關
    SCREENSHOT_TAKE: 'screenshot:take',
    SCREENSHOT_TAKE_ALL: 'screenshot:take-all',
    SCREENSHOT_RESULT: 'screenshot:result',
    SCREENSHOT_PROGRESS: 'screenshot:progress',
    // 排程相關
    SCHEDULE_START: 'schedule:start',
    SCHEDULE_STOP: 'schedule:stop',
    SCHEDULE_STATUS: 'schedule:status',
    // 檔案相關
    SELECT_DIRECTORY: 'dialog:select-directory',
};
// 預設設定
export const DEFAULT_CONFIG = {
    version: '1.0.0',
    outputDirectory: '',
    fileNamePattern: '{siteName}_{selectorName}_{timestamp}',
    sites: [],
    schedule: {
        enabled: false,
        type: 'interval',
        intervalMinutes: 60,
        cron: null,
    },
};
//# sourceMappingURL=types.js.map