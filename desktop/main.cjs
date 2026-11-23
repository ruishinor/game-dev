// Owner-only Attunement Windows shell. No Node privileges are exposed to the game renderer.
'use strict';

const { app, BrowserWindow, dialog, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.setName('Attunement');

let gameServer = null;
let window = null;
let stopping = false;
let logFile = null;

function log(event, detail = '') {
  const line = '[' + new Date().toISOString() + '] ' + event + (detail ? ' ' + detail : '') + '\n';
  process.stderr.write(line);
  if (logFile) {
    try { fs.appendFileSync(logFile, line); }
    catch (error) { process.stderr.write('[desktop] log write failed: ' + error.message + '\n'); }
  }
}

async function launch() {
  const userData = app.getPath('userData');
  fs.mkdirSync(path.join(userData, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(userData, 'saves'), { recursive: true });
  logFile = path.join(userData, 'logs', 'desktop.log');

  // The packaged build serves only previously generated runtime GLBs.
  // This disables archive extraction and all other source-model generation at startup.
  if (app.isPackaged) {
    process.env.ATTUNEMENT_DESKTOP_RUNTIME_DIR = path.join(process.resourcesPath, 'runtime-models');
  } else {
    delete process.env.ATTUNEMENT_DESKTOP_RUNTIME_DIR;
  }

  const { startServer } = await import('../server/index.js');
  gameServer = await startServer({
    // Stable loopback origin preserves localStorage tokens across restarts.
    port: 48763,
    host: '127.0.0.1',
    desktopLocal: true,
    dataFile: path.join(userData, 'saves', 'characters.json'),
  });

  const origin = 'http://127.0.0.1:' + gameServer.port;
  log('gpu-feature-status', JSON.stringify(app.getGPUFeatureStatus()));
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    const fromGame = contents === window?.webContents && contents.getURL().startsWith(origin + '/');
    callback(Boolean(fromGame && ['pointerLock', 'fullscreen', 'clipboard-sanitized-write'].includes(permission)));
  });

  window = new BrowserWindow({
    title: 'Attunement',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#10171b',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    try {
      const url = new URL(target);
      if (url.origin === origin && (url.pathname === '/' || url.pathname === '/index.html')) return;
    } catch { /* reject invalid URLs */ }
    event.preventDefault();
    log('blocked-navigation');
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      window.setFullScreen(!window.isFullScreen());
      event.preventDefault();
    }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    log('renderer-process-gone', details.reason + ' exit=' + details.exitCode);
    dialog.showErrorBox('Attunement rendering stopped',
      'The renderer exited (' + details.reason + '). Check the local desktop log before retrying.');
  });
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { window = null; });
  await window.loadURL(origin + '/');
  log('started', 'local-server=' + gameServer.port);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on('child-process-gone', (_event, details) => {
    log('child-process-gone', details.type + ' ' + details.reason);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (!gameServer || stopping) return;
    event.preventDefault();
    stopping = true;
    const srv = gameServer;
    Promise.resolve().then(() => srv.close()).catch((error) => {
      log('server-close-error', error.message);
    }).finally(() => {
      gameServer = null;
      app.quit();
    });
  });
  app.whenReady().then(launch).catch((error) => {
    log('startup-failed', error.stack || String(error));
    dialog.showErrorBox('Attunement could not start',
      'Startup failed. Check the desktop log under your Windows AppData folder.\n\n' + error.message);
    app.quit();
  });
}
