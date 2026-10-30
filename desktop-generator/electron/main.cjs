const { app, BrowserWindow, ipcMain, dialog, safeStorage, net, shell, Menu } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createLicenseManager } = require("./license.cjs");
const publicKeyPem = require("./publicKey.cjs");

const isDev = !app.isPackaged && process.env.MSIDC_DEV === "1";
let win = null;
let license = null;

// One running copy only.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "My School ID Card – ID Card Generator",
    backgroundColor: "#f6f5ff",
    icon: path.join(__dirname, "..", "installer", "icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
      spellcheck: false,
    },
  });
  win.once("ready-to-show", () => { win.maximize(); win.show(); });

  // Fully offline: block every network request from the window except local files.
  win.webContents.session.webRequest.onBeforeRequest((details, cb) => {
    const ok = /^(file|data|blob|devtools|chrome-extension):/.test(details.url) || (isDev && details.url.startsWith("http://localhost:5174"));
    cb({ cancel: !ok });
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:") && !(isDev && url.startsWith("http://localhost:5174"))) e.preventDefault(); });

  if (isDev) win.loadURL("http://localhost:5174");
  else win.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  license = createLicenseManager({ app, safeStorage, netFetch: (u, o) => net.fetch(u, o), publicKeyPem });

  ipcMain.handle("license:status", () => license.status());
  ipcMain.handle("license:activate", (_e, key) => license.activate(key));
  ipcMain.handle("license:reset", () => license.deactivateLocal());

  // Every other feature is refused unless the licence is valid on this computer.
  const guard = (fn) => async (...args) => {
    if (!license.status().licensed) throw new Error("Not licensed on this computer.");
    return fn(...args);
  };

  ipcMain.handle("file:save", guard(async (_e, { defaultName, data, filters }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath("documents"), defaultName),
      filters: filters ?? [{ name: "All files", extensions: ["*"] }],
    });
    if (canceled || !filePath) return { saved: false };
    await fs.promises.writeFile(filePath, Buffer.from(data));
    return { saved: true, filePath };
  }));
  ipcMain.handle("file:open", guard(async (_e, { filters }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ["openFile"], filters });
    if (canceled || !filePaths[0]) return null;
    const buf = await fs.promises.readFile(filePaths[0]);
    return { name: path.basename(filePaths[0]), data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  }));
  ipcMain.handle("file:reveal", guard(async (_e, filePath) => { shell.showItemInFolder(filePath); }));
  ipcMain.handle("app:info", () => ({ version: app.getVersion() }));

  createWindow();
});

app.on("window-all-closed", () => app.quit());
