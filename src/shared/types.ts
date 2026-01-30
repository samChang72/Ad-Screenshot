// 共用型別定義

export interface SelectorConfig {
    id: string;
    name: string;
    cssSelector: string;
    enabled: boolean;
}

export interface SiteConfig {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    fullPageScreenshot: boolean;  // 是否截取完整長網頁
    recordVideo: boolean;
    selectors: SelectorConfig[];
}

export interface ScheduleConfig {
    enabled: boolean;
    type: 'interval' | 'cron';
    intervalMinutes: number;
    cron: string | null;
}

export interface AppConfig {
    version: string;
    outputDirectory: string;
    fileNamePattern: string;
    sites: SiteConfig[];
    schedule: ScheduleConfig;
}

export interface ScreenshotResult {
    success: boolean;
    siteName: string;
    selectorName: string;
    filePath?: string;
    error?: string;
    timestamp: string;
}

export interface ScreenshotProgress {
    jobId: string;
    siteName: string;
    url: string;
    currentSelector: string;
    totalSelectors: number;
    completedSelectors: number;
    status: 'pending' | 'running' | 'success' | 'failed';
    error?: string;
}

export interface MultiTaskProgress {
    tasks: ScreenshotProgress[];
    overallProgress: number;
}

export interface ScreenshotJob {
    siteId: string;
    url: string;
    siteName: string;
    selectors: SelectorConfig[];
    outputDirectory: string;
    fileNamePattern: string;
    fullPageScreenshot: boolean;
    recordVideo: boolean;
}

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
} as const;

// 預設設定
export const DEFAULT_CONFIG: AppConfig = {
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
