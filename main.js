const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const ceProject = require('./ce-project.js');
const appVersion = require('./package.json').version;

// 单实例检测: 多实例共享同一磁盘缓存会导致缓存读写错误, 检测到已有实例时询问是否继续
const gotLock = app.requestSingleInstanceLock();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    frame: false,
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startApp() {
  app.whenReady().then(() => {
    createWindow();
    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

if (!gotLock) {
  // 直接拦截: 多实例同时运行会因共享磁盘缓存/用户数据导致缓存错误与数据异常, 提示关闭现有实例后退出
  console.log('[MAIN] another instance detected, blocking startup');
  // dialog 只能在 app ready 后使用
  app.whenReady().then(() => {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'ChoTenEditor',
      message: '检测到另一个编辑器实例正在运行\nAnother editor instance is already running',
      detail: '请先关闭所有正在运行的编辑器实例，再重新启动编辑器。多个实例同时运行可能导致数据异常。\nPlease close all running editor instances before restarting. Running multiple instances may cause data corruption.',
      buttons: ['确定 / OK'],
      defaultId: 0,
      cancelId: 0,
    });
    app.quit();
  });
} else {
  startApp();
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.filePaths;
});
ipcMain.handle('dialog:openFile', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result.filePaths;
});
ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result.filePath;
});
ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    console.error('[MAIN] readFile error:', filePath, error.message);
    return { success: false, error: error.message };
  }
});
ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('fs:readdir', async (event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const files = entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: path.join(dirPath, entry.name),
    }));
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('fs:mkdir', async (event, dirPath) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('fs:stat', async (event, filePath) => {
  try {
    const stat = await fs.promises.stat(filePath);
    return { success: true, stat };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:deleteFile', async (event, filePath) => {
  try {
    await fs.promises.unlink(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('app:getPath', async () => {
  return __dirname;
});

ipcMain.handle('fs:copyFile', async (event, src, dest) => {
  try {
    await fs.promises.copyFile(src, dest);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ce:resolveProjectRoot', async (event, filePath) => {
  try {
    return await ceProject.resolveProjectRoot(filePath);
  } catch (error) {
    return { found: false, error: error.message };
  }
});

// Window controls
ipcMain.on('window:openDevTools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.webContents.openDevTools();
});
ipcMain.on('window:toggleDevTools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools();
  } else {
    win.webContents.openDevTools();
  }
});
ipcMain.on('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});
ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});
ipcMain.on('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});
ipcMain.handle('app:getVersion', () => appVersion);
ipcMain.on('app:getVersionSync', (event) => { event.returnValue = appVersion; });

ipcMain.handle('window:isMaximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

ipcMain.handle('shell:openExternal', async (event, url) => {
  await shell.openExternal(url);
});

// ============================================
// AI 制作
// ============================================

ipcMain.handle('ai:chat', async (event, { endpoint, model, apiKey, messages, maxTokens, temperature, systemPrompt }) => {
  try {
    var urlObj = new URL(endpoint);
    var isHttps = urlObj.protocol === 'https:';
    var postData = JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: maxTokens || 4096,
      temperature: temperature !== undefined ? temperature : 0.7,
      stream: true,
    });

    var options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    var sender = event.sender;

    return new Promise(function(resolve, reject) {
      var requester = isHttps ? https : http;
      var req = requester.request(options, function(res) {
        var fullContent = '';
        var isDone = false;

        if (res.statusCode !== 200) {
          var errBody = '';
          res.on('data', function(chunk) { errBody += chunk.toString(); });
          res.on('end', function() {
            var errObj = { key: 'ai.apiError', params: { status: res.statusCode, body: errBody }, fallback: 'API 错误 ' + res.statusCode + ': ' + errBody };
            sender.send('ai:error', errObj);
            resolve({ success: false, error: errObj });
          });
          return;
        }

        res.on('data', function(chunk) {
          var text = chunk.toString();
          var lines = text.split('\n');
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || !line.startsWith('data: ')) continue;
            var data = line.slice(6).trim();
            if (data === '[DONE]') { isDone = true; continue; }
            try {
              var parsed = JSON.parse(data);
              var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
              if (delta && delta.content) {
                fullContent += delta.content;
                sender.send('ai:chunk', delta.content);
              }
            } catch (e) { /* skip parse errors */ }
          }
        });

        res.on('end', function() {
          sender.send('ai:done', fullContent);
          resolve({ success: true, content: fullContent });
        });
      });

      req.on('error', function(err) {
        sender.send('ai:error', err.message);
        resolve({ success: false, error: { key: 'ai.requestFailed', params: { msg: err.message }, fallback: '请求失败: ' + err.message } });
      });

      req.write(postData);
      req.end();
    });
  } catch (err) {
    event.sender.send('ai:error', err.message);
    return { success: false, error: { key: 'ai.requestFailed', params: { msg: err.message }, fallback: err.message } };
  }
});

// ============================================
// 提示词管理
// ============================================

ipcMain.handle('ai:getUserDataPath', async () => {
  return app.getPath('userData');
});

ipcMain.handle('ai:loadPrompts', async () => {
  try {
    var builtInDir = path.join(__dirname, 'prompts');
    var userDataDir = path.join(app.getPath('userData'), 'prompts');
    var prompts = {};

    // 加载内置提示词
    try {
      var builtInFiles = await fs.promises.readdir(builtInDir);
      for (var i = 0; i < builtInFiles.length; i++) {
        var file = builtInFiles[i];
        if (!file.endsWith('.md')) continue;
        var name = file.slice(0, -3);
        var content = await fs.promises.readFile(path.join(builtInDir, file), 'utf-8');
        prompts[name] = { name: name, content: content, builtIn: true };
      }
    } catch (e) { /* 内置目录不存在则忽略 */ }

    // 加载用户自定义提示词（覆盖内置同名）
    try {
      await fs.promises.mkdir(userDataDir, { recursive: true });
      var userFiles = await fs.promises.readdir(userDataDir);
      for (var j = 0; j < userFiles.length; j++) {
        var uf = userFiles[j];
        if (!uf.endsWith('.md')) continue;
        var uname = uf.slice(0, -3);
        var ucontent = await fs.promises.readFile(path.join(userDataDir, uf), 'utf-8');
        // 用户提示词覆盖同名内置，保留原 builtIn 标志
        if (prompts[uname]) {
          prompts[uname].content = ucontent;
          prompts[uname].overridden = true;
        } else {
          prompts[uname] = { name: uname, content: ucontent, builtIn: false };
        }
      }
    } catch (e) { /* 用户目录异常忽略 */ }

    return { success: true, prompts: prompts };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('ai:saveUserPrompt', async (event, promptName, content) => {
  try {
    var userDataDir = path.join(app.getPath('userData'), 'prompts');
    await fs.promises.mkdir(userDataDir, { recursive: true });
    var filePath = path.join(userDataDir, promptName + '.md');
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('ai:deleteUserPrompt', async (event, promptName) => {
  try {
    var userDataDir = path.join(app.getPath('userData'), 'prompts');
    var filePath = path.join(userDataDir, promptName + '.md');
    await fs.promises.unlink(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ============================================
// 远程模式
// ============================================

const remote = require('./remote.js');

// 设置事件回调：将 remote 模块的事件转发到 renderer
remote.setEventHandler((event, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('remote:event', event, data);
  }
});

// 服务器
ipcMain.handle('remote:startServer', async (event, { port, password, allowDifferentVersions }) => {
  try {
    return await remote.startServer(port, password, { allowDifferentVersions });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('remote:stopServer', async () => {
  await remote.stopServer();
  return { success: true };
});

ipcMain.handle('remote:getServerStatus', () => {
  return remote.getServerStatus();
});

ipcMain.handle('remote:confirmClient', (event, { clientId }) => {
  return remote.confirmClient(clientId);
});

ipcMain.handle('remote:rejectClient', (event, { clientId }) => {
  return remote.rejectClient(clientId);
});

ipcMain.handle('remote:setClientPermission', (event, { clientId, permission }) => {
  return remote.setClientPermission(clientId, permission);
});

ipcMain.handle('remote:setClientFilePermission', (event, { clientId, filePath, permission }) => {
  return remote.setClientFilePermission(clientId, filePath, permission);
});

ipcMain.handle('remote:disconnectClient', (event, { clientId }) => {
  remote.disconnectClient(clientId);
  return { success: true };
});

ipcMain.handle('remote:disconnectAll', () => {
  remote.disconnectAll();
  return { success: true };
});

ipcMain.handle('remote:applyApprovedWrite', (event, { clientId, filePath, content }) => {
  remote.applyApprovedWrite(clientId, filePath, content);
  return { success: true };
});

ipcMain.handle('remote:notifyFileChangeRejected', (event, { clientId, filePath }) => {
  remote.notifyFileChangeRejected(clientId, filePath, '管理员拒绝了更改', 'remote.changeRejectedByAdmin');
  return { success: true };
});

ipcMain.handle('remote:applyApprovedDelete', (event, { clientId, filePath }) => {
  remote.applyApprovedDelete(clientId, filePath);
  return { success: true };
});

ipcMain.handle('remote:notifyFileDeleteRejected', (event, { clientId, filePath }) => {
  remote.notifyFileDeleteRejected(clientId, filePath, '管理员拒绝了删除请求', 'remote.deleteRejectedByAdmin');
  return { success: true };
});

// 客户端
ipcMain.handle('remote:connectToServer', async (event, { host, port, password, version }) => {
  try {
    return await remote.connectToServer(host, port, password, version);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('remote:disconnectFromServer', async () => {
  await remote.disconnectFromServer();
  return { success: true };
});

ipcMain.handle('remote:getClientStatus', () => {
  return remote.getClientStatus();
});

ipcMain.handle('remote:sendSecurityCode', (event, { securityCode }) => {
  remote.sendSecurityCode(securityCode);
  return { success: true };
});

ipcMain.handle('remote:requestFileRead', (event, { filePath }) => {
  remote.requestFileRead(filePath);
  return { success: true };
});

ipcMain.handle('remote:requestFileWrite', (event, { filePath, content }) => {
  remote.requestFileWrite(filePath, content);
  return { success: true };
});

ipcMain.handle('remote:requestFileList', (event, { dirPath }) => {
  remote.requestFileList(dirPath);
  return { success: true };
});

ipcMain.handle('remote:requestFileDelete', (event, { filePath }) => {
  remote.requestFileDelete(filePath);
  return { success: true };
});

ipcMain.handle('remote:notifyEditingStart', (event, { filePath }) => {
  remote.notifyEditingStart(filePath);
  return { success: true };
});

ipcMain.handle('remote:notifyEditingEnd', (event, { filePath }) => {
  remote.notifyEditingEnd(filePath);
  return { success: true };
});

ipcMain.handle('remote:requestEditingList', () => {
  remote.requestEditingList();
  return { success: true };
});
