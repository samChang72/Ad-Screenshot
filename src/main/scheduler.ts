import * as schedule from 'node-schedule';
import { AppConfig } from '../shared/types';

export interface ScheduleStatus {
    isRunning: boolean;
    nextInvocation: string | null;
    lastRun: string | null;
}

export class Scheduler {
    private job: schedule.Job | null = null;
    private isRunning: boolean = false;
    private lastRun: Date | null = null;
    private onExecute: () => Promise<void>;

    constructor(onExecute: () => Promise<void>) {
        this.onExecute = onExecute;
    }

    start(config: AppConfig): void {
        // 先停止現有排程
        this.stop();

        if (!config.schedule.enabled) {
            return;
        }

        const scheduleConfig = config.schedule;

        if (scheduleConfig.type === 'interval' && scheduleConfig.intervalMinutes) {
            // 使用間隔執行
            const rule = new schedule.RecurrenceRule();
            rule.minute = new schedule.Range(0, 59, scheduleConfig.intervalMinutes);

            this.job = schedule.scheduleJob(rule, async () => {
                await this.execute();
            });
        } else if (scheduleConfig.type === 'cron' && scheduleConfig.cron) {
            // 使用 Cron 表達式
            this.job = schedule.scheduleJob(scheduleConfig.cron, async () => {
                await this.execute();
            });
        }

        if (this.job) {
            this.isRunning = true;
            console.log('Scheduler started, next invocation:', this.job.nextInvocation());
        }
    }

    private async execute(): Promise<void> {
        try {
            console.log('Executing scheduled screenshot task...');
            this.lastRun = new Date();
            await this.onExecute();
            console.log('Scheduled task completed');
        } catch (error) {
            console.error('Scheduled task failed:', error);
        }
    }

    stop(): void {
        if (this.job) {
            this.job.cancel();
            this.job = null;
        }
        this.isRunning = false;
        console.log('Scheduler stopped');
    }

    getStatus(): ScheduleStatus {
        return {
            isRunning: this.isRunning,
            nextInvocation: this.job?.nextInvocation()?.toISOString() || null,
            lastRun: this.lastRun?.toISOString() || null,
        };
    }
}
