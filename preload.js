const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  processDocument: () => ipcRenderer.invoke('process-document'),
  processFolder: () => ipcRenderer.invoke('process-folder'),
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_event, value) => callback(value)),
});
