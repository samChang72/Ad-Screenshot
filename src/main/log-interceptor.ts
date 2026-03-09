import { BrowserWindow } from 'electron';
import { IPC_CHANNELS, LogEntry, LogLevel } from '../shared/types';

const MAX_LOGS = 5000;
let logs: LogEntry[] = [];
let targetWindow: BrowserWindow | null = null;
let isInitialized = false;

function detectLevel(message: string, isStderr: boolean): LogLevel {
    if (isStderr) return 'error';
    const lower = message.toLowerCase();
    if (lower.includes('warn')) return 'warn';
    if (lower.includes('error') || lower.includes('fail')) return 'error';
    return 'info';
}

function addEntry(message: string, isStderr: boolean): void {
    const trimmed = message.trim();
    if (trimmed.length === 0) return;

    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: detectLevel(trimmed, isStderr),
        message: trimmed,
    };
    
    logs = [...logs, entry];
    if (logs.length > MAX_LOGS) {
        logs = logs.slice(logs.length - MAX_LOGS);
    }

    if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send(IPC_CHANNELS.LOG_ENTRY, entry);
    }
}

export function initLogInterceptor(win: BrowserWindow): void {
    if (isInitialized) return;
    isInitialized = true;

    targetWindow = win;

    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);

    process.stdout.write = function (chunk: any, ...args: any[]): boolean {
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        addEntry(text, false);
        return originalStdoutWrite(chunk, ...args);
    } as typeof process.stdout.write;

    process.stderr.write = function (chunk: any, ...args: any[]): boolean {
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        addEntry(text, true);
        return originalStderrWrite(chunk, ...args);
    } as typeof process.stderr.write;
}

export function getAllLogs(): LogEntry[] {
    return [...logs];
}

export function clearLogs(): void {
    logs = [];
    if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send(IPC_CHANNELS.LOG_CLEAR);
    }
}
