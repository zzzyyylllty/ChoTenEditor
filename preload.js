const { contextBridge, ipcRenderer } = require('electron');
const { version } = require('./package.json');

// 最简单的preload脚本 - 只暴露一个测试API
try {
  console.log('[PRELOAD] Preload script starting...');

  // 先测试基本的暴露
  contextBridge.exposeInMainWorld('testAPI', {
    test: () => 'Test API working'
  });

  console.log('[PRELOAD] testAPI exposed successfully');

  // 然后暴露完整的electronAPI
  const api = {
    // 对话框
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),

    // 文件系统操作
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    readdir: (dirPath) => ipcRenderer.invoke('fs:readdir', dirPath),
    mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
    stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),

    // 应用路径
    getAppPath: () => ipcRenderer.invoke('app:getPath'),

    // 文件操作
    copyFile: (src, dest) => ipcRenderer.invoke('fs:copyFile', src, dest),
  };

  // Window controls
  api.minimize = () => ipcRenderer.send('window:minimize');
  api.maximize = () => ipcRenderer.send('window:maximize');
  api.close = () => ipcRenderer.send('window:close');
  api.isMaximized = () => ipcRenderer.invoke('window:isMaximized');
  api.appVersion = version;
  api.openExternal = (url) => ipcRenderer.invoke('shell:openExternal', url);

  contextBridge.exposeInMainWorld('electronAPI', api);

  console.log('[PRELOAD] electronAPI exposed with methods:', Object.keys(api));
  console.log('[PRELOAD] Preload script completed');
} catch (error) {
  console.error('[PRELOAD] ERROR in preload script:', error);
  console.error('[PRELOAD] Error stack:', error.stack);
}