import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// 定義白名單頻道 (直接使用字串避免類型問題)
const VALID_INVOKE_CHANNELS = [
    'config:load',
    'config:save',
    'config:export',
    'config:import',
    'screenshot:take',
    'screenshot:take-all',
    'schedule:start',
    'schedule:stop',
    'schedule:status',
    'dialog:select-directory',
] as const;

const VALID_ON_CHANNELS = [
    'screenshot:result',
    'screenshot:progress',
    'schedule:status',
    'browser:status',
    'browser:download-progress',
] as const;

type ValidInvokeChannel = typeof VALID_INVOKE_CHANNELS[number];
type ValidOnChannel = typeof VALID_ON_CHANNELS[number];

// 暴露安全的 API 給渲染程式
contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel: ValidInvokeChannel, ...args: unknown[]) => {
        if (VALID_INVOKE_CHANNELS.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args);
        }
        throw new Error(`Invalid channel: ${channel}`);
    },
    on: (channel: ValidOnChannel, callback: (...args: unknown[]) => void) => {
        if (VALID_ON_CHANNELS.includes(channel)) {
            const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
            ipcRenderer.on(channel, subscription);
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        }
        throw new Error(`Invalid channel: ${channel}`);
    },
    removeAllListeners: (channel: ValidOnChannel) => {
        if (VALID_ON_CHANNELS.includes(channel)) {
            ipcRenderer.removeAllListeners(channel);
        }
    },
});

// 宣告 Window 介面擴展 (供 TypeScript 使用)
declare global {
    interface Window {
        electronAPI: {
            invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
            on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
            removeAllListeners: (channel: string) => void;
        };
    }
}
