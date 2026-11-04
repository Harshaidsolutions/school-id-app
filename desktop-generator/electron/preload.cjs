const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  licenseStatus: () => ipcRenderer.invoke("license:status"),
  activate: (key) => ipcRenderer.invoke("license:activate", key),
  resetLicense: () => ipcRenderer.invoke("license:reset"),
  saveFile: (defaultName, data, filters) => ipcRenderer.invoke("file:save", { defaultName, data, filters }),
  openFile: (filters) => ipcRenderer.invoke("file:open", { filters }),
  reveal: (filePath) => ipcRenderer.invoke("file:reveal", filePath),
  pickFolder: () => ipcRenderer.invoke("folder:pick"),
  writeInFolder: (root, rel, data) => ipcRenderer.invoke("folder:write", { root, rel, data }),
  info: () => ipcRenderer.invoke("app:info"),
});
