import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AppConfig, DEFAULT_CONFIG } from '../shared/types';

export class ConfigManager {
    private configPath: string;
    private config: AppConfig;

    constructor() {
        const userDataPath = app.getPath('userData');
        this.configPath = path.join(userDataPath, 'config.json');
        this.config = this.loadConfig();
    }

    loadConfig(): AppConfig {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf-8');
                this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
            } else {
                this.config = { ...DEFAULT_CONFIG };
                // 設定預設輸出目錄
                this.config.outputDirectory = path.join(app.getPath('pictures'), 'AdScreenshots');
                this.saveConfig(this.config);
            }
        } catch (error) {
            console.error('Failed to load config:', error);
            this.config = { ...DEFAULT_CONFIG };
        }
        return this.config;
    }

    saveConfig(config: AppConfig): { success: boolean; message?: string } {
        try {
            this.config = config;
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Failed to save config:', message);
            return { success: false, message };
        }
    }

    exportConfig(filePath: string): { success: boolean; message?: string } {
        try {
            fs.writeFileSync(filePath, JSON.stringify(this.config, null, 2), 'utf-8');
            return { success: true, message: `設定已匯出至 ${filePath}` };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return { success: false, message };
        }
    }

    importConfig(filePath: string): { success: boolean; config?: AppConfig; message?: string } {
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            const importedConfig = JSON.parse(data) as AppConfig;

            // 驗證設定檔格式
            if (!importedConfig.version || !Array.isArray(importedConfig.sites)) {
                return { success: false, message: '無效的設定檔格式' };
            }

            this.config = { ...DEFAULT_CONFIG, ...importedConfig };
            this.saveConfig(this.config);

            return { success: true, config: this.config, message: '設定已匯入' };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return { success: false, message };
        }
    }

    getConfig(): AppConfig {
        return this.config;
    }
}
