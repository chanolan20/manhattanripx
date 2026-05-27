'use strict';

const {
  app, BrowserWindow, Menu, Tray, shell, dialog,
  ipcMain, nativeTheme, nativeImage,
} = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');
const os = require('os');

// ── Auto-updater ────────────────────────────────────────────────────────────
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  console.warn('[updater] electron-updater not available');
}

// ── Constants ───────────────────────────────────────────────────────────────
const SERVER_PORT    = 5000;
const PRODUCT_NAME   = 'Manhattan RIP X';
const APP_VERSION    = app.getVersion();
const IS_MAC         = process.platform === 'darwin';
const IS_WIN         = process.platform === 'win32';
const IS_DEV         = process.env.NODE_ENV === 'development';

const ICON_PATH = IS_MAC
  ? path.join(__dirname, 'resources', 'icons', 'ManhattanRIPX.icns')
  : IS_WIN
    ? path.join(__dirname, 'resources', 'icons', 'icon.ico')
    : path.join(__dirname, 'resources', 'icons', 'icon.png');

// ── Windows app user model ID ────────────────────────────────────────────────
if (IS_WIN) app.setAppUserModelId('com.manhattanripx.app');

// ── SINGLE INSTANCE LOCK ─────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); process.exit(0); }

let mainWindow    = null;
let splashWindow  = null;
let backendProcess = null;
let tray          = null;
let spoolerPoll   = null;

// ── Backend launcher ─────────────────────────────────────────────────────────
function startBackend() {
  if (backendProcess) return;

  const serverBin = IS_DEV
    ? path.join(__dirname, '..', 'dist', 'index.cjs')
    : path.join(process.resourcesPath, 'server', 'index.cjs');

  console.log('[backend] Starting:', serverBin);

  backendProcess = spawn(process.execPath, [serverBin], {
    env: {
      ...process.env,
      NODE_ENV:       'production',
      PORT:           String(SERVER_PORT),
      DB_PATH:        path.join(app.getPath('userData'), 'manhattan-rip-x.db'),
      UPLOADS_DIR:    path.join(app.getPath('userData'), 'uploads'),
      PUBLIC_PATH:    path.join(process.resourcesPath, 'public'),
      RESOURCES_PATH: process.resourcesPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr.on('data', d => console.error('[backend:err]', d.toString().trim()));
  backendProcess.on('exit', code => {
    console.log('[backend] exited', code);
    backendProcess = null;
  });
}

// ── Wait for backend ─────────────────────────────────────────────────────────
// Polls /api/health up to 90 seconds. Resolves even on 404 (server is up, route may differ).
function waitForBackend(retries = 180, delay = 500) {
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get(`http://localhost:${SERVER_PORT}/api/health`, (res) => {
        console.log('[backend] health check status:', res.statusCode);
        resolve(); // any response = server is up
      });
      req.on('error', () => {
        if (--retries > 0) {
          setTimeout(attempt, delay);
        } else {
          console.warn('[backend] timed out — loading anyway');
          resolve(); // don't block forever
        }
      });
      req.setTimeout(400, () => {
        req.destroy();
        if (--retries > 0) setTimeout(attempt, delay);
        else resolve();
      });
    };
    attempt();
  });
}

// ── Splash screen ────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0d1117',
    icon: ICON_PATH,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  // Inline HTML splash — no external file needed
  const splashHtml = `data:text/html;charset=utf-8,<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background:#0d1117;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    height:100vh; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    color:#fff; user-select:none;
  }
  .logo { font-size:28px; font-weight:700; letter-spacing:-0.5px; margin-bottom:6px; }
  .logo span { color:#10b981; }
  .sub { font-size:12px; color:#6b7280; margin-bottom:40px; }
  .bar-wrap { width:260px; height:3px; background:#1f2937; border-radius:2px; overflow:hidden; }
  .bar { height:100%; width:0%; background:linear-gradient(90deg,#059669,#10b981);
         border-radius:2px; animation:fill 6s ease-out forwards; }
  @keyframes fill { to { width:90%; } }
  .status { font-size:11px; color:#4b5563; margin-top:14px; }
</style>
</head>
<body>
  <div class="logo">Manhattan <span>RIP X</span></div>
  <div class="sub">Professional DTF RIP Software</div>
  <div class="bar-wrap"><div class="bar"></div></div>
  <div class="status">Starting print server…</div>
</body>
</html>`;

  splashWindow.loadURL(splashHtml);
  splashWindow.show();
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ── Create main window ───────────────────────────────────────────────────────
async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: PRODUCT_NAME,
    icon: ICON_PATH,
    backgroundColor: '#0d1117',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 14 },
    // KEY FIX: start visible with a dark bg so there is NEVER a black screen
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  nativeTheme.themeSource = 'dark';

  const appUrl = `http://localhost:${SERVER_PORT}`;

  // ── Step 1: Show the window instantly via file:// (zero black screen) ──────
  // The React bundle is inside the asar. We load it directly so the UI appears
  // immediately while the Node backend is still starting up.
  const publicPath = IS_DEV
    ? path.join(__dirname, '..', 'dist', 'public', 'index.html')
    : path.join(process.resourcesPath, 'public', 'index.html');

  const fileUrl = `file://${publicPath.replace(/\\/g, '/')}`;

  mainWindow.webContents.once('dom-ready', () => {
    closeSplash();
    mainWindow.show();
    if (!IS_MAC) mainWindow.maximize();
  });

  // Force show after 8s no matter what
  const forceShowTimer = setTimeout(() => {
    closeSplash();
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 8000);

  mainWindow.webContents.once('did-finish-load', () => clearTimeout(forceShowTimer));

  // Handle load failures — show a friendly retry page
  mainWindow.webContents.on('did-fail-load', (_event, errCode, errDesc, validatedURL) => {
    console.error('[window] load failed:', errCode, errDesc, validatedURL);
    // Only handle http:// failures (file:// should always work)
    if (validatedURL && validatedURL.startsWith('http')) {
      clearTimeout(forceShowTimer);
      closeSplash();
      mainWindow?.show();
      mainWindow?.loadURL(fileUrl); // fall back to file:// UI
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.on('close', (event) => {
    if (IS_WIN && tray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes(`localhost:${SERVER_PORT}`)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // ── Step 2: Load file:// first — UI appears instantly ────────────────────
  mainWindow.loadURL(fileUrl);

  // ── Step 3: Once backend is ready, switch to http:// for full API access ─
  waitForBackend().then(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[window] backend ready — switching to http://');
      mainWindow.loadURL(appUrl);
    }
  });
}

// ── System tray ──────────────────────────────────────────────────────────────
function createTray() {
  let icon;
  try {
    icon = nativeImage.createFromPath(
      IS_WIN
        ? path.join(__dirname, 'resources', 'icons', 'icon.ico')
        : path.join(__dirname, 'resources', 'icons', 'icon.png')
    );
    if (!icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 });
  } catch (_) { icon = nativeImage.createEmpty(); }

  tray = new Tray(icon);
  tray.setToolTip('Manhattan RIP X — Ready');

  const menu = () => Menu.buildFromTemplate([
    {
      label: 'Open Manhattan RIP X',
      click: () => {
        if (mainWindow) { mainWindow.isMinimized() && mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
        else createWindow();
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu());
  tray.on('click', () => {
    if (mainWindow) { mainWindow.isMinimized() && mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
    else createWindow();
  });

  spoolerPoll = setInterval(async () => {
    try {
      const s = await fetchJSON(`http://localhost:${SERVER_PORT}/api/spooler/status`);
      tray.setToolTip(s?.printing ? 'Manhattan RIP X — Printing' : 'Manhattan RIP X — Ready');
    } catch (_) {}
  }, 10_000);
}

// ── Application menu ─────────────────────────────────────────────────────────
function buildMenu() {
  const send = (action) => () => {
    mainWindow?.webContents.send('menu-action', action);
    mainWindow?.webContents.send('menu:action', action);
  };

  const template = [
    ...(IS_MAC ? [{
      label: PRODUCT_NAME,
      submenu: [
        { label: `About ${PRODUCT_NAME}`, click: showAbout },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'Cmd+,', click: send('settings') },
        { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Job…',        accelerator: 'CmdOrCtrl+O',       click: send('open-job') },
        { label: 'Import Folder…',   accelerator: 'CmdOrCtrl+Shift+O', click: send('open-folder') },
        { label: 'Import PDF…',      accelerator: 'CmdOrCtrl+Shift+P', click: send('import-pdf') },
        { type: 'separator' },
        IS_MAC ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'Queue',
      submenu: [
        { label: 'Start Queue',       accelerator: 'F5',  click: send('queue-start') },
        { label: 'Stop Queue',        accelerator: 'F6',  click: send('queue-stop') },
        { type: 'separator' },
        { label: 'Manage Queues…',                        click: send('manage-queues') },
        { label: 'Gang Sheet Builder',                    click: send('view:gang-sheet') },
      ],
    },
    {
      label: 'Jobs',
      submenu: [
        { label: 'Hold Job',                              click: send('job-hold') },
        { label: 'Release Job',                           click: send('job-release') },
        { label: 'Rip Only',                              click: send('job-rip') },
        { label: 'Print Job',         accelerator: 'F8', click: send('job-print') },
        { type: 'separator' },
        { label: 'Easy Color Adjustments…',               click: send('job-color-adj') },
        { type: 'separator' },
        { label: 'Remove Job',        accelerator: IS_MAC ? 'Backspace' : 'Delete', click: send('job-delete') },
        { label: 'Remove All Done',                       click: send('job-remove-done') },
      ],
    },
    {
      label: 'Devices',
      submenu: [
        { label: 'Manage Devices…',      click: send('view:devices') },
        { label: 'Manage Print Modes…',  click: send('print-modes') },
        { type: 'separator' },
        { label: 'Printer Status',       click: send('view:devices') },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Hot Folder / Automation',  click: send('view:hot-folder') },
        { label: 'Separation Studio',        click: send('view:separation-studio') },
        { label: 'AI Auto-Profiler',         click: send('view:auto-profiler') },
        { type: 'separator' },
        { label: 'Color Management…',        click: send('color-mgmt') },
        { label: 'Spot Color Library',       click: send('view:spot-color-library') },
        { type: 'separator' },
        { label: 'Image Tools',              click: send('view:image-tools') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Print Queue',         click: send('view:queue') },
        { label: 'Gang Sheet Builder',  click: send('view:gang-sheet') },
        { label: 'Color Management',    click: send('color-mgmt') },
        { label: 'Print Mode Manager',  click: send('print-modes') },
        { type: 'separator' },
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
        { label: 'Getting Started',      click: () => shell.openExternal('https://manhattanviral.com/rip-x') },
        { label: 'Support',              click: () => shell.openExternal('mailto:support@manhattanviral.com') },
        { type: 'separator' },
        { label: `About ${PRODUCT_NAME}`, click: showAbout },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('app:version',       () => APP_VERSION);
  ipcMain.handle('get-version',       () => APP_VERSION);
  ipcMain.handle('app:platform',      () => process.platform);
  ipcMain.handle('app:userDataPath',  () => app.getPath('userData'));
  ipcMain.handle('app:serverPort',    () => SERVER_PORT);

  ipcMain.handle('dialog:openFile', async (_, opts = {}) => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Print Files',  extensions: ['png','jpg','jpeg','tiff','tif','pdf','psd','ai','eps','bmp'] },
        { name: 'All Files',    extensions: ['*'] },
      ],
      ...opts,
    });
  });

  ipcMain.handle('open-file-dialog', async () => {
    if (!mainWindow) return [];
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Print Files', extensions: ['png','jpg','jpeg','tiff','tif','pdf','psd','ai','eps'] },
        { name: 'All Files',   extensions: ['*'] },
      ],
    });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle('dialog:openFolder', async () => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  });

  ipcMain.handle('app:uploadFile', async (_, filePath, queueId = 1) => {
    const fs = require('fs');
    const FormData = require('form-data');
    const axios = require('axios').default;
    if (!fs.existsSync(filePath)) return { error: 'File not found: ' + filePath };
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));
      form.append('queueId', String(queueId));
      const response = await axios.post(
        `http://localhost:${SERVER_PORT}/api/upload`,
        form,
        { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity }
      );
      return response.data;
    } catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('shell:openExternal', async (_, url) => shell.openExternal(url));

  ipcMain.handle('get-ink-levels', async () => {
    try { return { api: await fetchJSON(`http://localhost:${SERVER_PORT}/api/ink-levels`), registry: null }; }
    catch (_) { return { api: null, registry: null }; }
  });

  ipcMain.handle('start-queue', async (_e, queueId) => {
    try {
      const data = await postJSON(`http://localhost:${SERVER_PORT}/api/queues/${queueId || 1}/start`, {});
      mainWindow?.webContents.send('menu-action', 'queue-start');
      return data;
    } catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('stop-queue', async (_e, queueId) => {
    try {
      const data = await postJSON(`http://localhost:${SERVER_PORT}/api/queues/${queueId || 1}/stop`, {});
      mainWindow?.webContents.send('menu-action', 'queue-stop');
      return data;
    } catch (err) { return { error: err.message }; }
  });

  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('window-close', () => {
    IS_WIN && tray ? mainWindow?.hide() : mainWindow?.close();
  });

  ipcMain.handle('updater:checkForUpdates', async () => {
    if (!autoUpdater) return { available: false };
    try {
      const r = await autoUpdater.checkForUpdates();
      return { available: !!r, version: r?.updateInfo?.version };
    } catch (err) { return { available: false, reason: err.message }; }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const { hostname, port, pathname } = new URL(url);
    const req = http.request({ hostname, port, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ statusCode: res.statusCode }); } });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

function showAbout() {
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: `About ${PRODUCT_NAME}`,
    message: PRODUCT_NAME,
    detail: [
      `Version ${APP_VERSION}`,
      `Enterprise — Personal Build`,
      `DTF Edition — MRX Color Engine`,
      `Platform: ${process.platform} ${os.release()}`,
      `Electron: ${process.versions.electron}`,
      '',
      '© 2026 Manhattan RIP X. All rights reserved.',
    ].join('\n'),
    buttons: ['OK'],
  });
}

function handleFileArg(argv) {
  if (!mainWindow) return;
  const file = argv.find(a =>
    ['.dtf','.mrxjob','.png','.jpg','.pdf'].some(ext => a.endsWith(ext))
  );
  if (file) {
    mainWindow.webContents.send('menu-action', 'open-file-arg');
    mainWindow.webContents.send('open-file-path', file);
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  app.on('second-instance', (_e, argv) => {
    if (mainWindow) {
      mainWindow.isMinimized() && mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      handleFileArg(argv);
    }
  });

  setupIPC();
  buildMenu();

  // Show splash immediately
  createSplash();

  // Start backend
  startBackend();

  // Open window immediately — it loads file:// first, switches to http:// when backend is ready
  await createWindow();

  // Tray (after window is created so we have the window reference)
  createTray();

  if (IS_WIN) handleFileArg(process.argv);

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else mainWindow.focus();
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    mainWindow?.webContents.send('open-file-path', filePath);
  });

  // Auto-updater setup
  if (autoUpdater && !IS_DEV) {
    try {
      autoUpdater.autoDownload = false;
      autoUpdater.setFeedURL({ provider: 'github', owner: 'chanolan20', repo: 'manhattanripx' });
      autoUpdater.on('update-available', info => {
        dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'Update Available',
          message: `v${info.version} is available.`,
          buttons: ['Download', 'Later'],
        }).then(({ response }) => { if (response === 0) autoUpdater.downloadUpdate(); });
      });
      autoUpdater.on('update-downloaded', info => {
        dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'Ready to Update',
          message: `v${info.version} ready. Restart to apply.`,
          buttons: ['Restart', 'Later'],
        }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(); });
      });
      autoUpdater.on('error', e => console.error('[updater]', e.message));
      setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 8000);
    } catch (e) { console.warn('[updater]', e.message); }
  }
});

app.on('window-all-closed', () => {
  if (IS_MAC) app.quit();
  // Windows: app stays alive in tray — quit via tray menu
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (spoolerPoll) { clearInterval(spoolerPoll); spoolerPoll = null; }
  if (tray)        { tray.destroy(); tray = null; }
  if (backendProcess) { backendProcess.kill('SIGTERM'); backendProcess = null; }
});
