'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

// ── Auto-updater (electron-updater) ────────────────────────────────────────
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  console.warn('[updater] electron-updater not available — updates disabled');
}

// ── Constants ──────────────────────────────────────────────────────────────
const PORT = 5173; // Electron serves the built static bundle directly via protocol
const SERVER_PORT = 5000;
const PRODUCT_NAME = 'Manhattan RIP X';
const APP_VERSION = app.getVersion();
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const IS_DEV = process.env.NODE_ENV === 'development';

let mainWindow = null;
let backendProcess = null;

// ── Backend server launcher ────────────────────────────────────────────────
function startBackend() {
  // Path to packaged server inside app.asar.unpacked or dev node_modules
  const serverBin = IS_DEV
    ? path.join(__dirname, '..', 'dtf-rip', 'dist', 'index.cjs')
    : path.join(process.resourcesPath, 'server', 'index.cjs');

  console.log(`[backend] Starting at ${serverBin}`);

  backendProcess = spawn(process.execPath, [serverBin], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(SERVER_PORT),
      DB_PATH: path.join(app.getPath('userData'), 'manhattan-rip-x.db'),
      UPLOADS_DIR: path.join(app.getPath('userData'), 'uploads'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr.on('data', d => console.error('[backend:err]', d.toString().trim()));
  backendProcess.on('exit', code => console.log(`[backend] exited with code ${code}`));
}

// ── Wait for backend to be ready ──────────────────────────────────────────
function waitForBackend(retries = 30) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(`http://localhost:${SERVER_PORT}/api/queues`, (res) => {
        if (res.statusCode < 500) resolve();
        else setTimeout(attempt, 300);
      }).on('error', () => {
        if (--retries > 0) setTimeout(attempt, 300);
        else reject(new Error('Backend failed to start'));
      });
    };
    attempt();
  });
}

// ── Create main window ────────────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: PRODUCT_NAME,
    icon: path.join(__dirname, 'resources', 'icons', IS_MAC ? 'ManhattanRIPX.icns' : IS_WIN ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#0d1117',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    show: false,
  });

  // Force dark mode
  nativeTheme.themeSource = 'dark';

  // Load the app
  const appUrl = IS_DEV
    ? 'http://localhost:5000'
    : `http://localhost:${SERVER_PORT}`;

  try {
    await waitForBackend();
    mainWindow.loadURL(appUrl);
  } catch (err) {
    console.error('Backend not ready:', err.message);
    // Fallback: load bundled static files if backend fails
    const indexPath = IS_DEV
      ? path.join(__dirname, '..', 'dtf-rip', 'dist', 'public', 'index.html')
      : path.join(process.resourcesPath, 'public', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_DEV) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Application menu ──────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    ...(IS_MAC ? [{
      label: PRODUCT_NAME,
      submenu: [
        { label: `About ${PRODUCT_NAME}`, click: showAbout },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'Cmd+,', click: () => mainWindow?.webContents.executeJavaScript('window.location.hash="#/settings"') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Job…', accelerator: 'CmdOrCtrl+O', click: openJob },
        { label: 'Import Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: openFolder },
        { type: 'separator' },
        IS_MAC ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        ...(IS_DEV ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(IS_MAC ? [{ type: 'separator' }, { role: 'front' }] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Manhattan RIP X Help', click: () => shell.openExternal('https://manhattanripx.com/help') },
        { label: 'Check for Updates…', click: () => shell.openExternal('https://github.com/') },
        { type: 'separator' },
        { label: `About ${PRODUCT_NAME}`, click: showAbout },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC handlers ──────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('app:version', () => APP_VERSION);
  ipcMain.handle('app:platform', () => process.platform);
  ipcMain.handle('app:userDataPath', () => app.getPath('userData'));

  // Auto-update IPC
  ipcMain.handle('updater:checkForUpdates', async () => {
    if (!autoUpdater) return { available: false, reason: 'updater not available' };
    try {
      const result = await autoUpdater.checkForUpdates();
      return { available: !!result, version: result?.updateInfo?.version };
    } catch (err) {
      return { available: false, reason: err.message };
    }
  });

  ipcMain.handle('updater:downloadAndInstall', () => {
    if (autoUpdater) autoUpdater.downloadUpdate();
  });

  ipcMain.handle('dialog:openFile', async (_, opts) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported Files', extensions: ['png','jpg','jpeg','pdf','svg','psd','tiff','tif','ai','eps','bmp'] },
        { name: 'Images', extensions: ['png','jpg','jpeg','tiff','bmp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      ...opts,
    });
    return result;
  });

  ipcMain.handle('dialog:openFolder', async () => {
    return dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  });

  ipcMain.handle('shell:openExternal', async (_, url) => {
    await shell.openExternal(url);
  });
}

// ── Dialogs ────────────────────────────────────────────────────────────────
function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    icon: path.join(__dirname, 'resources', 'icons', 'icon.png'),
    title: `About ${PRODUCT_NAME}`,
    message: PRODUCT_NAME,
    detail: [
      `Version ${APP_VERSION}`,
      `DTF Edition — MRX Color Engine`,
      `Platform: ${process.platform} ${os.release()}`,
      `Node: ${process.versions.node}`,
      `Electron: ${process.versions.electron}`,
      '',
      '© 2026 Manhattan RIP X. All rights reserved.',
    ].join('\n'),
    buttons: ['OK'],
  });
}

function openJob() {
  ipcMain.emit('dialog:openFile');
}

function openFolder() {
  ipcMain.emit('dialog:openFolder');
}

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  startBackend();
  setupIPC();
  buildMenu();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // ── Configure auto-updater ───────────────────────────────────────────────
  if (autoUpdater && !IS_DEV) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // GitHub releases feed
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'manhattanripx',
      repo: 'manhattan-rip-x',
    });

    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Manhattan RIP X v${info.version} is available.`,
        detail: info.releaseNotes || 'A new version is ready to download.',
        buttons: ['Download Now', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `v${info.version} downloaded. Restart to apply.`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('[updater] Error:', err.message);
    });

    // Check for updates 5 seconds after startup
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  }
});

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
});

// Security: prevent additional window creation
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== `http://localhost:${SERVER_PORT}`) {
      event.preventDefault();
    }
  });
});
