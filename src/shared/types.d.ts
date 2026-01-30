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
    fullPageScreenshot: boolean;
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
export interface ScreenshotJob {
    siteId: string;
    url: string;
    siteName: string;
    selectors: SelectorConfig[];
    outputDirectory: string;
    fileNamePattern: string;
    fullPageScreenshot: boolean;
}
export declare const IPC_CHANNELS: {
    readonly CONFIG_LOAD: "config:load";
    readonly CONFIG_SAVE: "config:save";
    readonly CONFIG_EXPORT: "config:export";
    readonly CONFIG_IMPORT: "config:import";
    readonly SCREENSHOT_TAKE: "screenshot:take";
    readonly SCREENSHOT_TAKE_ALL: "screenshot:take-all";
    readonly SCREENSHOT_RESULT: "screenshot:result";
    readonly SCREENSHOT_PROGRESS: "screenshot:progress";
    readonly SCHEDULE_START: "schedule:start";
    readonly SCHEDULE_STOP: "schedule:stop";
    readonly SCHEDULE_STATUS: "schedule:status";
    readonly SELECT_DIRECTORY: "dialog:select-directory";
};
export declare const DEFAULT_CONFIG: AppConfig;
