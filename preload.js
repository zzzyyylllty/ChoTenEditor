const { contextBridge, ipcRenderer } = require('electron');

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
    deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
  };

  // Window controls
  api.minimize = () => ipcRenderer.send('window:minimize');
  api.maximize = () => ipcRenderer.send('window:maximize');
  api.close = () => ipcRenderer.send('window:close');
  api.openDevTools = () => ipcRenderer.send('window:openDevTools');
  api.isMaximized = () => ipcRenderer.invoke('window:isMaximized');
  api.appVersion = ipcRenderer.sendSync('app:getVersionSync');
  api.openExternal = (url) => ipcRenderer.invoke('shell:openExternal', url);

  // 远程模式
  api.remote = {
    // 服务器
    startServer: (opts) => ipcRenderer.invoke('remote:startServer', opts),
    stopServer: () => ipcRenderer.invoke('remote:stopServer'),
    getServerStatus: () => ipcRenderer.invoke('remote:getServerStatus'),
    confirmClient: (opts) => ipcRenderer.invoke('remote:confirmClient', opts),
    rejectClient: (opts) => ipcRenderer.invoke('remote:rejectClient', opts),
    setClientPermission: (opts) => ipcRenderer.invoke('remote:setClientPermission', opts),
    setClientFilePermission: (opts) => ipcRenderer.invoke('remote:setClientFilePermission', opts),
    disconnectClient: (opts) => ipcRenderer.invoke('remote:disconnectClient', opts),
    disconnectAll: () => ipcRenderer.invoke('remote:disconnectAll'),
    applyApprovedWrite: (opts) => ipcRenderer.invoke('remote:applyApprovedWrite', opts),
    notifyFileChangeRejected: (opts) => ipcRenderer.invoke('remote:notifyFileChangeRejected', opts),
    applyApprovedDelete: (opts) => ipcRenderer.invoke('remote:applyApprovedDelete', opts),
    notifyFileDeleteRejected: (opts) => ipcRenderer.invoke('remote:notifyFileDeleteRejected', opts),
    // 客户端
    connectToServer: (opts) => ipcRenderer.invoke('remote:connectToServer', opts),
    disconnectFromServer: () => ipcRenderer.invoke('remote:disconnectFromServer'),
    getClientStatus: () => ipcRenderer.invoke('remote:getClientStatus'),
    sendSecurityCode: (opts) => ipcRenderer.invoke('remote:sendSecurityCode', opts),
    requestFileRead: (opts) => ipcRenderer.invoke('remote:requestFileRead', opts),
    requestFileWrite: (opts) => ipcRenderer.invoke('remote:requestFileWrite', opts),
    requestFileList: (opts) => ipcRenderer.invoke('remote:requestFileList', opts),
    requestFileDelete: (opts) => ipcRenderer.invoke('remote:requestFileDelete', opts),
    notifyEditingStart: (opts) => ipcRenderer.invoke('remote:notifyEditingStart', opts),
    notifyEditingEnd: (opts) => ipcRenderer.invoke('remote:notifyEditingEnd', opts),
    requestEditingList: () => ipcRenderer.invoke('remote:requestEditingList'),
    // 事件监听
    onEvent: (callback) => {
      ipcRenderer.on('remote:event', (event, type, data) => callback(type, data));
    },
    removeEventListeners: () => {
      ipcRenderer.removeAllListeners('remote:event');
    },
  };

  // AI 制作
  api.ai = {
    getUserDataPath: function() { return ipcRenderer.invoke('ai:getUserDataPath'); },
    loadPrompts: function() { return ipcRenderer.invoke('ai:loadPrompts'); },
    saveUserPrompt: function(name, content) { return ipcRenderer.invoke('ai:saveUserPrompt', name, content); },
    deleteUserPrompt: function(name) { return ipcRenderer.invoke('ai:deleteUserPrompt', name); },
    chat: function(config, messages) {
      return ipcRenderer.invoke('ai:chat', {
        endpoint: config.endpoint,
        model: config.model,
        apiKey: config.apiKey,
        messages: messages,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        systemPrompt: config.systemPrompt,
      });
    },
    onChunk: function(callback) {
      ipcRenderer.on('ai:chunk', function(event, chunk) { callback(chunk); });
    },
    onDone: function(callback) {
      ipcRenderer.on('ai:done', function(event, content) { callback(content); });
    },
    onError: function(callback) {
      ipcRenderer.on('ai:error', function(event, errMsg) { callback(errMsg); });
    },
    removeListeners: function() {
      ipcRenderer.removeAllListeners('ai:chunk');
      ipcRenderer.removeAllListeners('ai:done');
      ipcRenderer.removeAllListeners('ai:error');
    },
  };

  contextBridge.exposeInMainWorld('electronAPI', api);

  console.log('[PRELOAD] electronAPI exposed with methods:', Object.keys(api));
  console.log('[PRELOAD] Preload script completed');
} catch (error) {
  console.error('[PRELOAD] ERROR in preload script:', error);
  console.error('[PRELOAD] Error stack:', error.stack);
}