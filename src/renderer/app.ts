const { ipcRenderer } = require('electron');

// ===================================
// Types
// ===================================
interface SelectorConfig {
    id: string;
    name: string;
    cssSelector: string;
    enabled: boolean;
}

interface SiteConfig {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    fullPageScreenshot: boolean;
    recordVideo: boolean;
    selectors: SelectorConfig[];
}

interface ScheduleConfig {
    enabled: boolean;
    type: 'interval' | 'cron';
    intervalMinutes: number;
    cron: string | null;
}

interface AppConfig {
    version: string;
    outputDirectory: string;
    fileNamePattern: string;
    sites: SiteConfig[];
    schedule: ScheduleConfig;
}

interface ScreenshotResult {
    success: boolean;
    siteName: string;
    selectorName: string;
    filePath?: string;
    error?: string;
    timestamp: string;
}

// IPC 通道
const IPC_CHANNELS = {
    CONFIG_LOAD: 'config:load',
    CONFIG_SAVE: 'config:save',
    CONFIG_EXPORT: 'config:export',
    CONFIG_IMPORT: 'config:import',
    SCREENSHOT_TAKE: 'screenshot:take',
    SCREENSHOT_TAKE_ALL: 'screenshot:take-all',
    SCREENSHOT_RESULT: 'screenshot:result',
    SCREENSHOT_PROGRESS: 'screenshot:progress',
    SCHEDULE_START: 'schedule:start',
    SCHEDULE_STOP: 'schedule:stop',
    SCHEDULE_STATUS: 'schedule:status',
    SELECT_DIRECTORY: 'dialog:select-directory',
};

// ===================================
// State
// ===================================
let config: AppConfig = {
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

let editingSite: SiteConfig | null = null;
let editingSelectors: SelectorConfig[] = [];

// ===================================
// DOM Elements
// ===================================
const elements = {
    // Sites Panel
    sitesList: document.getElementById('sites-list') as HTMLUListElement,
    emptyState: document.getElementById('empty-state') as HTMLDivElement,

    // Toolbar
    btnAddSite: document.getElementById('btn-add-site') as HTMLButtonElement,
    btnImport: document.getElementById('btn-import') as HTMLButtonElement,
    btnExport: document.getElementById('btn-export') as HTMLButtonElement,
    btnRunAll: document.getElementById('btn-run-all') as HTMLButtonElement,

    // Settings
    outputDirectory: document.getElementById('output-directory') as HTMLInputElement,
    btnSelectDirectory: document.getElementById('btn-select-directory') as HTMLButtonElement,
    filePattern: document.getElementById('file-pattern') as HTMLInputElement,
    scheduleEnabled: document.getElementById('schedule-enabled') as HTMLInputElement,
    scheduleInterval: document.getElementById('schedule-interval') as HTMLInputElement,
    scheduleOptions: document.getElementById('schedule-options') as HTMLDivElement,
    nextRun: document.getElementById('next-run') as HTMLSpanElement,
    statusIndicator: document.getElementById('status-indicator') as HTMLSpanElement,

    // Progress Display
    tasksContainer: document.getElementById('tasks-container') as HTMLDivElement,
    settingsTrigger: document.getElementById('settings-trigger') as HTMLDivElement,
    settingsContent: document.getElementById('settings-content') as HTMLDivElement,
    btnSelectDir: document.getElementById('btn-select-dir') as HTMLButtonElement,
    filenamePattern: document.getElementById('filename-pattern') as HTMLInputElement,

    // Modal
    siteModal: document.getElementById('site-modal') as HTMLDivElement,
    modalTitle: document.getElementById('modal-title') as HTMLHeadingElement,
    siteName: document.getElementById('site-name') as HTMLInputElement,
    siteUrl: document.getElementById('site-url') as HTMLInputElement,
    selectorsList: document.getElementById('selectors-list') as HTMLUListElement,
    btnAddSelector: document.getElementById('btn-add-selector') as HTMLButtonElement,
    btnCloseModal: document.getElementById('btn-close-modal') as HTMLButtonElement,
    btnCancel: document.getElementById('btn-cancel') as HTMLButtonElement,
    btnSaveSite: document.getElementById('btn-save-site') as HTMLButtonElement,

    // Toast
    toastContainer: document.getElementById('toast-container') as HTMLDivElement,
};

// ===================================
// Utility Functions
// ===================================
function generateId(): string {
    return crypto.randomUUID();
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
    <span class="icon">${type === 'success' ? '✅' : '❌'}</span>
    <span>${message}</span>
  `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ===================================
// Render Functions
// ===================================
function renderSitesList(): void {
    if (config.sites.length === 0) {
        elements.sitesList.classList.add('hidden');
        elements.emptyState.classList.remove('hidden');
        return;
    }

    elements.sitesList.classList.remove('hidden');
    elements.emptyState.classList.add('hidden');

    elements.sitesList.innerHTML = config.sites.map(site => `
    <li class="site-item" data-id="${site.id}">
      <div class="site-header">
        <input type="checkbox" ${site.enabled ? 'checked' : ''} data-action="toggle-site">
        <span class="site-name">${escapeHtml(site.name)}</span>
        <span class="site-url">${escapeHtml(site.url)}</span>
        <div class="site-actions">
          <button class="btn-icon" data-action="run-site" title="立即截圖">▶️</button>
          <button class="btn-icon" data-action="edit-site" title="編輯">✏️</button>
          <button class="btn-icon" data-action="delete-site" title="刪除">🗑️</button>
        </div>
      </div>
      ${site.selectors.length > 0 ? `
        <div class="selectors-nested">
          ${site.selectors.map(sel => `
            <div class="selector-item" data-selector-id="${sel.id}">
              <input type="checkbox" ${sel.enabled ? 'checked' : ''} data-action="toggle-selector">
              <code>${escapeHtml(sel.cssSelector)}</code>
              <span class="selector-name">${escapeHtml(sel.name)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </li>
  `).join('');
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderSettings(): void {
    elements.outputDirectory.value = config.outputDirectory;
    elements.filenamePattern.value = config.fileNamePattern;
    elements.scheduleEnabled.checked = config.schedule.enabled;
    elements.scheduleInterval.value = String(config.schedule.intervalMinutes);
    elements.scheduleOptions.style.display = config.schedule.enabled ? 'block' : 'none';
}

function renderModalSelectors(): void {
    elements.selectorsList.innerHTML = editingSelectors.map((sel, index) => `
    <li class="selector-edit-item" data-index="${index}">
      <input type="text" placeholder="Selector 名稱" value="${escapeHtml(sel.name)}" data-field="name">
      <input type="text" placeholder="CSS Selector" value="${escapeHtml(sel.cssSelector)}" data-field="cssSelector">
      <button class="btn-icon" data-action="delete-selector" title="刪除">🗑️</button>
    </li>
  `).join('');
}

// ===================================
// Modal Functions
// ===================================
function openModal(site?: SiteConfig): void {
    const siteFullpage = document.getElementById('site-fullpage') as HTMLInputElement;
    const siteRecording = document.getElementById('site-recording') as HTMLInputElement;

    if (site) {
        editingSite = site;
        editingSelectors = JSON.parse(JSON.stringify(site.selectors));
        elements.modalTitle.textContent = '編輯網站';
        elements.siteName.value = site.name;
        elements.siteUrl.value = site.url;
        siteFullpage.checked = site.fullPageScreenshot || false;
        siteRecording.checked = site.recordVideo || false;
    } else {
        editingSite = null;
        editingSelectors = [];
        elements.modalTitle.textContent = '新增網站';
        elements.siteName.value = '';
        elements.siteUrl.value = '';
        siteFullpage.checked = false;
        siteRecording.checked = false;
    }

    renderModalSelectors();
    elements.siteModal.classList.remove('hidden');
}

function closeModal(): void {
    elements.siteModal.classList.add('hidden');
    editingSite = null;
    editingSelectors = [];
}

// ===================================
// Event Handlers
// ===================================
function setupEventListeners(): void {
    // Toolbar buttons
    elements.btnAddSite.addEventListener('click', () => openModal());

    elements.btnImport.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke(IPC_CHANNELS.CONFIG_IMPORT);
        if (result.success && result.config) {
            config = result.config;
            renderSitesList();
            renderSettings();
            showToast(result.message);
        } else if (result.message !== '已取消') {
            showToast(result.message, 'error');
        }
    });

    elements.btnExport.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke(IPC_CHANNELS.CONFIG_EXPORT);
        if (result.success) {
            showToast(result.message);
        } else if (result.message !== '已取消') {
            showToast(result.message, 'error');
        }
    });

    elements.btnRunAll.addEventListener('click', async () => {
        if (config.sites.length === 0) {
            showToast('請先新增網站', 'error');
            return;
        }

        elements.statusIndicator.textContent = '🔄 執行中...';
        elements.statusIndicator.className = 'status-indicator status-running';

        try {
            const results: ScreenshotResult[] = await ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOT_TAKE_ALL);
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            if (failCount === 0) {
                showToast(`成功截取 ${successCount} 張截圖`);
            } else {
                showToast(`成功 ${successCount} 張，失敗 ${failCount} 張`, 'error');
            }
        } catch (error) {
            showToast('截圖失敗', 'error');
        } finally {
            // 不再全域重置為待命中，由任務列表自行管理狀態
        }
    });

    // Settings collapsible
    elements.settingsTrigger.addEventListener('click', () => {
        const parent = elements.settingsTrigger.parentElement;
        if (parent) {
            parent.classList.toggle('collapsed');
        }
    });

    // Output directory selection
    elements.btnSelectDir.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY);
        if (result.success) {
            config.outputDirectory = result.path;
            elements.outputDirectory.value = result.path;
            await saveConfig();
        }
    });

    // Filename pattern
    elements.filenamePattern.addEventListener('change', async () => {
        config.fileNamePattern = elements.filenamePattern.value;
        await saveConfig();
    });

    // Schedule settings
    elements.scheduleEnabled.addEventListener('change', async () => {
        config.schedule.enabled = elements.scheduleEnabled.checked;
        elements.scheduleOptions.style.display = config.schedule.enabled ? 'block' : 'none';
        await saveConfig();

        if (config.schedule.enabled) {
            await ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_START);
            updateScheduleStatus();
        } else {
            await ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_STOP);
            elements.nextRun.textContent = '下次執行: --';
        }
    });

    elements.scheduleInterval.addEventListener('change', async () => {
        config.schedule.intervalMinutes = parseInt(elements.scheduleInterval.value) || 60;
        await saveConfig();

        if (config.schedule.enabled) {
            await ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_START);
            updateScheduleStatus();
        }
    });

    // Sites list events (delegation)
    elements.sitesList.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const action = target.dataset.action || target.closest('[data-action]')?.getAttribute('data-action');
        const siteItem = target.closest('.site-item') as HTMLLIElement;

        if (!siteItem || !action) return;

        const siteId = siteItem.dataset.id;
        const site = config.sites.find(s => s.id === siteId);

        if (!site) return;

        switch (action) {
            case 'toggle-site':
                site.enabled = (target as HTMLInputElement).checked;
                await saveConfig();
                break;
            case 'edit-site':
                openModal(site);
                break;
            case 'delete-site':
                if (confirm(`確定要刪除「${site.name}」嗎？`)) {
                    config.sites = config.sites.filter(s => s.id !== siteId);
                    await saveConfig();
                    renderSitesList();
                }
                break;
            case 'run-site':
                elements.statusIndicator.textContent = '🔄 執行中...';
                elements.statusIndicator.className = 'status-indicator status-running';

                try {
                    const results: ScreenshotResult[] = await ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOT_TAKE, site);
                    const successCount = results.filter(r => r.success).length;
                    showToast(`截取 ${successCount} 張截圖`);
                } catch (error) {
                    showToast('截圖失敗', 'error');
                } finally {
                    elements.statusIndicator.textContent = '⏸ 待命中';
                    elements.statusIndicator.className = 'status-indicator status-idle';
                }
                break;
            case 'toggle-selector':
                const selectorItem = target.closest('.selector-item') as HTMLDivElement;
                const selectorId = selectorItem?.dataset.selectorId;
                const selector = site.selectors.find(s => s.id === selectorId);
                if (selector) {
                    selector.enabled = (target as HTMLInputElement).checked;
                    await saveConfig();
                }
                break;
        }
    });

    // Modal events
    elements.btnCloseModal.addEventListener('click', closeModal);
    elements.btnCancel.addEventListener('click', closeModal);

    elements.siteModal.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);

    elements.btnAddSelector.addEventListener('click', () => {
        editingSelectors.push({
            id: generateId(),
            name: '',
            cssSelector: '',
            enabled: true,
        });
        renderModalSelectors();
    });

    elements.selectorsList.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.action === 'delete-selector') {
            const item = target.closest('.selector-edit-item') as HTMLLIElement;
            const index = parseInt(item.dataset.index || '0');
            editingSelectors.splice(index, 1);
            renderModalSelectors();
        }
    });

    elements.selectorsList.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const item = target.closest('.selector-edit-item') as HTMLLIElement;
        const index = parseInt(item.dataset.index || '0');
        const field = target.dataset.field as 'name' | 'cssSelector';

        if (editingSelectors[index] && field) {
            editingSelectors[index][field] = target.value;
        }
    });

    elements.btnSaveSite.addEventListener('click', async () => {
        const name = elements.siteName.value.trim();
        const url = elements.siteUrl.value.trim();

        if (!name || !url) {
            showToast('請填寫網站名稱和網址', 'error');
            return;
        }

        // 過濾空的 selectors
        const validSelectors = editingSelectors.filter(s => s.name && s.cssSelector);

        if (editingSite) {
            // 編輯現有網站
            const index = config.sites.findIndex(s => s.id === editingSite!.id);
            if (index !== -1) {
                config.sites[index] = {
                    ...editingSite,
                    name,
                    url,
                    fullPageScreenshot: (document.getElementById('site-fullpage') as HTMLInputElement).checked,
                    recordVideo: (document.getElementById('site-recording') as HTMLInputElement).checked,
                    selectors: validSelectors,
                };
            }
        } else {
            // 新增網站
            config.sites.push({
                id: generateId(),
                name,
                url,
                enabled: true,
                fullPageScreenshot: (document.getElementById('site-fullpage') as HTMLInputElement).checked,
                recordVideo: (document.getElementById('site-recording') as HTMLInputElement).checked,
                selectors: validSelectors,
            });
        }

        await saveConfig();
        renderSitesList();
        closeModal();
        showToast(editingSite ? '網站已更新' : '網站已新增');
    });

    // Screenshot results from scheduler
    ipcRenderer.on(IPC_CHANNELS.SCREENSHOT_RESULT, (_event: unknown, results: ScreenshotResult[]) => {
        const successCount = results.filter(r => r.success).length;
        showToast(`排程執行完成，截取 ${successCount} 張截圖`);
        updateScheduleStatus();
    });

    // Screenshot progress updates
    ipcRenderer.on(IPC_CHANNELS.SCREENSHOT_PROGRESS, (_event: unknown, tasks: any[]) => {
        renderTasksStatus(tasks);

        // 更新全域狀態指示器
        const isAnyRunning = tasks.some(t => t.status === 'running');
        if (isAnyRunning) {
            elements.statusIndicator.textContent = '🔄 任務執行中...';
            elements.statusIndicator.className = 'status-indicator status-running';
        } else {
            elements.statusIndicator.textContent = '⏸ 待命中';
            elements.statusIndicator.className = 'status-indicator status-idle';
        }
    });
}

function renderTasksStatus(tasks: any[]): void {
    if (tasks.length === 0) {
        elements.tasksContainer.innerHTML = '<div class="empty-tasks-hint">目前沒有進行中的任務</div>';
        return;
    }

    elements.tasksContainer.innerHTML = tasks.map(task => {
        const progressPercent = Math.round((task.completedSelectors / task.totalSelectors) * 100);
        return `
            <div class="task-item" id="task-${task.jobId}">
                <div class="task-info">
                    <span class="task-site">${escapeHtml(task.siteName)}</span>
                    <span class="task-status-tag status-${task.status}">${task.status === 'success' ? '完成' :
                task.status === 'failed' ? '失敗' :
                    task.status === 'pending' ? '等待中' : '執行中'
            }</span>
                </div>
                <div class="task-progress-container">
                    <div class="task-progress-bar" style="width: ${progressPercent}%"></div>
                </div>
                <div class="task-details">
                    <span>${escapeHtml(task.currentSelector)}</span>
                    <span>${task.completedSelectors} / ${task.totalSelectors}</span>
                </div>
                ${task.error ? `<div class="task-error" style="color: var(--danger); font-size: 11px; margin-top: 4px;">❌ ${escapeHtml(task.error)}</div>` : ''}
            </div>
        `;
    }).join('');
}

// ===================================
// Data Functions
// ===================================
async function loadConfig(): Promise<void> {
    try {
        config = await ipcRenderer.invoke(IPC_CHANNELS.CONFIG_LOAD);
        renderSitesList();
        renderSettings();

        if (config.schedule.enabled) {
            updateScheduleStatus();
        }
    } catch (error) {
        console.error('Failed to load config:', error);
        showToast('載入設定失敗', 'error');
    }
}

async function saveConfig(): Promise<void> {
    try {
        await ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, config);
    } catch (error) {
        console.error('Failed to save config:', error);
        showToast('儲存設定失敗', 'error');
    }
}

async function updateScheduleStatus(): Promise<void> {
    const status = await ipcRenderer.invoke(IPC_CHANNELS.SCHEDULE_STATUS);

    if (status.nextInvocation) {
        const date = new Date(status.nextInvocation);
        elements.nextRun.textContent = `下次執行: ${date.toLocaleString('zh-TW')}`;
    } else {
        elements.nextRun.textContent = '下次執行: --';
    }

    if (status.isRunning) {
        elements.statusIndicator.textContent = '⏰ 排程執行中';
        elements.statusIndicator.className = 'status-indicator status-running';
    }
}

// ===================================
// Initialize
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadConfig();
});
