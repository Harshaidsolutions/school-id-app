const { ACTIVATE_URL: LICENSE_ACTIVATE_URL, CHECK_URL: LICENSE_CHECK_URL } = require("./license.cjs");
const { app, BrowserWindow, ipcMain, dialog, safeStorage, net, shell, Menu } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createLicenseManager } = require("./license.cjs");
const publicKeyPem = require("./publicKey.cjs");

const isDev = !app.isPackaged && process.env.MSIDC_DEV === "1";
const APP_NAME = "Harsha ID Solutions – ID Card Generator";
// Keep the licence and settings where earlier versions stored them (the app was renamed).
app.setPath("userData", path.join(app.getPath("appData"), "My School ID Card Generator"));
let win = null;
let splash = null;
let license = null;

// One running copy only.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

const SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
    background:linear-gradient(135deg,#6a2c9e 0%,#8e3bd1 45%,#f26a1b 120%);color:#fff;text-align:center;padding:24px}
  .bar{display:flex;gap:4px;margin-bottom:2px}
  .bar i{width:26px;height:5px;border-radius:3px;display:block}
  .title{font-size:19px;font-weight:800;letter-spacing:.2px}
  .sub{font-size:12.5px;opacity:.92;font-weight:500}
  .dots{display:flex;gap:7px;margin-top:6px}
  .dots span{width:9px;height:9px;border-radius:50%;background:#fff;opacity:.5;animation:b 1s infinite}
  .dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}
  @keyframes b{0%,100%{opacity:.4;transform:translateY(0)}50%{opacity:1;transform:translateY(-4px)}}
</style></head><body><div class="wrap">
  <div class="bar"><i style="background:#e8243c"></i><i style="background:#1ea0e1"></i><i style="background:#f0b500"></i><i style="background:#2bb24c"></i><i style="background:#f26a1b"></i></div>
  <div class="title">Harsha ID Solutions</div>
  <div class="sub">ID Card Generator</div>
  <div class="dots"><span></span><span></span><span></span></div>
</div></body></html>`;

function createSplash() {
  splash = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: "#6a2c9e",
    icon: path.join(__dirname, "..", "installer", "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false },
  });
  splash.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(SPLASH_HTML));
  splash.on("closed", () => { splash = null; });
}

function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.close();
  splash = null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: APP_NAME,
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
  win.once("ready-to-show", () => { closeSplash(); win.maximize(); win.show(); });

  // Fully offline: block every network request from the window except local files.
  win.webContents.session.webRequest.onBeforeRequest((details, cb) => {
    // The one exception: the one-time licence activation (made by the app itself, not the page).
    const activation = (details.url.startsWith(LICENSE_ACTIVATE_URL) || details.url.startsWith(LICENSE_CHECK_URL)) && details.method === "POST";
    const ok = activation || /^(file|data|blob|devtools|chrome-extension):/.test(details.url) || (isDev && details.url.startsWith("http://localhost:5174"));
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

  // Output folder: the user picks it once; the app may then write the generated cards inside it (and only there).
  const foldersFile = path.join(app.getPath("userData"), "folders.json");
  const allowed = new Set((() => { try { return JSON.parse(fs.readFileSync(foldersFile, "utf8")); } catch { return []; } })());
  ipcMain.handle("folder:pick", guard(async (_e, startDir) => {
    // Open the folder picker where the photos were chosen from, so the user makes the output folder right there.
    let defaultPath = app.getPath("documents");
    try { if (typeof startDir === "string" && startDir && fs.statSync(startDir).isDirectory()) defaultPath = path.resolve(startDir); } catch { /* fall back to Documents */ }
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"], defaultPath });
    if (canceled || !filePaths[0]) return null;
    const root = path.resolve(filePaths[0]);
    allowed.add(root);
    try { fs.writeFileSync(foldersFile, JSON.stringify([...allowed].slice(-20))); } catch { /* ignore */ }
    return root;
  }));
  ipcMain.handle("folder:write", guard(async (_e, { root, rel, data }) => {
    const base = path.resolve(String(root || ""));
    if (!allowed.has(base)) throw new Error("Choose the output folder again (Output step).");
    const target = path.resolve(base, String(rel || ""));
    if (target !== base && !target.startsWith(base + path.sep)) throw new Error("Invalid file name.");
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, Buffer.from(data));
    return target;
  }));
  ipcMain.handle("app:info", () => ({ version: app.getVersion() }));

  createSplash();
  createWindow();

  // Licence: check online now and every hour; a disabled / expired licence locks the open app at once.
  const recheck = async () => {
    try {
      const r = await license.checkOnline();
      const s = license.status();
      if ((r.changed || !s.licensed) && win && !win.isDestroyed()) win.webContents.send("license:changed", s);
    } catch { /* offline or server busy: try again later */ }
  };
  setTimeout(() => void recheck(), 5000);
  setInterval(() => void recheck(), 60 * 60 * 1000);
});

app.on("window-all-closed", () => app.quit());
