const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const appVersion = require('./package.json').version;

let mainWindow;
let settingsWindow;

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
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 900,
    height: 800,
    frame: false,
    parent: mainWindow,
    modal: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile('settings.html');

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

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

// Window controls
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
ipcMain.handle('remote:startServer', async (event, { port, password }) => {
  try {
    return await remote.startServer(port, password);
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
  remote.notifyFileChangeRejected(clientId, filePath, '管理员拒绝了更改');
  return { success: true };
});

// 客户端
ipcMain.handle('remote:connectToServer', async (event, { host, port, password }) => {
  try {
    return await remote.connectToServer(host, port, password);
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
