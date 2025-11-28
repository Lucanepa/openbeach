// Preload script runs in the renderer process before the web page loads
// This is a secure way to expose Node.js APIs to the renderer

const { contextBridge } = require('electron')

// Expose protected methods that allow the renderer process to use
// limited Node.js functionality
contextBridge.exposeInMainWorld('electronAPI', {
  // Add any Electron-specific APIs here if needed
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
})

