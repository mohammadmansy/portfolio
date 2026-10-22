/* ============================================================
   Stack — Electron desktop shell

   Runs the exact same www/ bundle Capacitor ships to phones,
   served through a privileged app:// scheme. A custom scheme is
   required rather than file:// because Chromium blocks ES module
   imports over file://, which is precisely how the game is written.

   CommonJS on purpose: package.json declares "type": "module" for
   the build scripts, and a .cjs entry point keeps Electron's main
   process unambiguous on every version.
   ============================================================ */

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Menu, protocol, net, shell, session } = require('electron');
const { pathToFileURL } = require('url');

const SCHEME = 'app';
const ROOT = path.join(__dirname, '..', 'www');
const START_URL = process.env.ELECTRON_START_URL || `${SCHEME}://stack/index.html`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

/** Map an app:// URL to a file inside www/, refusing anything that escapes. */
function resolveAppUrl(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl).pathname);
  } catch {
    return null;
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  if (pathname.endsWith('/')) pathname += 'index.html';

  const resolved = path.normalize(path.join(ROOT, pathname));
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 860,
    minWidth: 360,
    minHeight: 520,
    show: false,
    backgroundColor: '#0B0E13',
    title: 'Stack',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // no in-app window.open targets, but stay safe if markup ever gains links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // block any navigation away from the game itself
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== START_URL && !url.startsWith(`${SCHEME}://stack/`)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    mainWindow.loadURL(START_URL);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle(SCHEME, (request) => {
      const file = resolveAppUrl(request.url);
      if (!file) return new Response('Not found', { status: 404 });
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return net.fetch(pathToFileURL(file).toString()).then(
        (response) => response,
        () => new Response('Not found', { status: 404 })
      );
    }).catch(() => {});

    // the game is fully offline; keep the session free of network leftovers
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

    // F11 toggles fullscreen — a PC player expects it
    app.on('web-contents-created', (_event, contents) => {
      contents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'F11') {
          const win = BrowserWindow.getFocusedWindow();
          if (win) win.setFullScreen(!win.isFullScreen());
          event.preventDefault();
        }
      });
    });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
