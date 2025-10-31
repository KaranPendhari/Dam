const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld("api", {
  processDocument: () => ipcRenderer.invoke("process-document"),
  processFolder: () => ipcRenderer.invoke("process-folder"),
  getSortedDocuments: () => ipcRenderer.invoke("get-sorted-documents"),
  onStatusUpdate: (callback) =>
    ipcRenderer.on("status-update", (_event, value) => callback(value)),
});
