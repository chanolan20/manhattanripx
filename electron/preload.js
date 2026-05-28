'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Inject the server port so ALL fetch calls in the renderer work whether
// the page loaded via file:// or http://localhost:5000
// Components using (window as any).__PORT_5000__ || "" will get the right base URL.
window.__PORT_5000__ = 'http://localhost:5000';

// ── Expose safe API to the renderer process ────────────────────────────────
// All channels are white-listed here — the renderer has zero direct Node access.
contextBridge.exposeInMainWorld('electronAPI', {

  // ── App info ────────────────────────────────────────────────────────────
  isElectron: true,
  platform: process.platform,
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',

  /** @returns {Promise<string>} semver version string */
  getVersion: () => ipcRenderer.invoke('get-version'),

  /** @returns {Promise<string>} e.g. 'win32' | 'darwin' | 'linux' */
  getPlatform: () => ipcRenderer.invoke('app:platform'),

  /** @returns {Promise<string>} absolute path to userData directory */
  getUserDataPath: () => ipcRenderer.invoke('app:userDataPath'),

  /** @returns {Promise<number>} backend server port (5000) */
  getServerPort: () => ipcRenderer.invoke('app:serverPort'),

  // ── File dialogs ────────────────────────────────────────────────────────

  /**
   * Open a native file-picker filtered to print-ready formats.
   * @returns {Promise<string[]>} array of selected file paths (empty if cancelled)
   */
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

  /**
   * Open a native file-picker with custom options (legacy / extended usage).
   * @param {Electron.OpenDialogOptions} [opts]
   * @returns {Promise<Electron.OpenDialogReturnValue>}
   */
  openFileDialogEx: (opts) => ipcRenderer.invoke('dialog:openFile', opts),

  /**
   * Open a native folder-picker.
   * @returns {Promise<Electron.OpenDialogReturnValue>}
   */
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),

  // ── File upload ─────────────────────────────────────────────────────────

  /**
   * Upload a local file to the backend server.
   * @param {string} filePath  absolute local path
   * @param {number} [queueId=1]
   * @returns {Promise<object>} server JSON response
   */
  uploadFile: (filePath, queueId) => ipcRenderer.invoke('app:uploadFile', filePath, queueId),

  // ── Ink levels ──────────────────────────────────────────────────────────

  /**
   * Fetch ink levels from the backend API. On Windows also attempts
   * a registry query for Epson Status Monitor data (best-effort).
   * @returns {Promise<{ api: object|null, registry: object|null }>}
   */
  getInkLevels: () => ipcRenderer.invoke('get-ink-levels'),

  // ── Print ───────────────────────────────────────────────────────────────

  /**
   * Print a PDF file. macOS: shell.openPath. Windows: print /D: command.
   * @param {string} pdfPath  absolute local path to the PDF
   * @returns {Promise<object>} result object
   */
  printPdf: (pdfPath) => ipcRenderer.invoke('print-pdf', pdfPath),

  // ── Queue control ───────────────────────────────────────────────────────

  /**
   * Start a print queue.
   * @param {number} [queueId=1]
   * @returns {Promise<object>} backend response
   */
  startQueue: (queueId) => ipcRenderer.invoke('start-queue', queueId),

  /**
   * Stop a print queue.
   * @param {number} [queueId=1]
   * @returns {Promise<object>} backend response
   */
  stopQueue: (queueId) => ipcRenderer.invoke('stop-queue', queueId),

  // ── Menu actions ────────────────────────────────────────────────────────

  /**
   * Register a callback for native menu item clicks.
   * Works with both 'menu-action' (new) and 'menu:action' (legacy) channels.
   * @param {(action: string) => void} callback
   * @returns {() => void} cleanup function to remove the listener
   */
  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('menu-action', handler);
    ipcRenderer.on('menu:action', handler);   // backwards compat
    return () => {
      ipcRenderer.removeListener('menu-action', handler);
      ipcRenderer.removeListener('menu:action', handler);
    };
  },

  /**
   * Register a callback for file-open events (macOS open-file / Windows argv).
   * @param {(filePath: string) => void} callback
   * @returns {() => void} cleanup function
   */
  onOpenFilePath: (callback) => {
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on('open-file-path', handler);
    return () => ipcRenderer.removeListener('open-file-path', handler);
  },

  // ── Window management ───────────────────────────────────────────────────

  /** Minimise the main window. */
  minimize: () => ipcRenderer.send('window-minimize'),

  /** Toggle maximise/restore on the main window. */
  maximize: () => ipcRenderer.send('window-maximize'),

  /** Close (or hide to tray on Windows) the main window. */
  close: () => ipcRenderer.send('window-close'),

  // ── Shell ───────────────────────────────────────────────────────────────

  /**
   * Open a URL in the system default browser.
   * @param {string} url
   */
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ── Auto-updater ────────────────────────────────────────────────────────

  /**
   * Manually trigger an update check.
   * @returns {Promise<{ available: boolean, version?: string, reason?: string }>}
   */
  checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),

  /**
   * Download and install a pending update.
   * @returns {Promise<void>}
   */
  downloadAndInstall: () => ipcRenderer.invoke('updater:downloadAndInstall'),

  // ── Printer detection + driver installation ─────────────────────────

  /**
   * Detect all system printers (live WMIC on Windows, lpstat on macOS).
   * @returns {Promise<Array<{name,uri,status,isDefault}>>}
   */
  detectPrinters: () => ipcRenderer.invoke('printers:detect'),

  /**
   * Install Epson ET-8550 DTF driver via pnputil (Windows) or CUPS (macOS).
   * @param {string} [infPath] optional .inf path; auto-detects if omitted
   * @returns {Promise<{success,message,requiresReboot}>}
   */
  installPrinterDriver: (infPath) => ipcRenderer.invoke('drivers:install', infPath),
});
