// ============================================
// 远程模式 - WebSocket 服务器/客户端
// ============================================

const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const APP_VERSION = require('./package.json').version;

// ---- 事件回调 ----
let _onEvent = null; // 由 main.js 设置，向 renderer 发消息

function setEventHandler(fn) {
  _onEvent = fn;
}

function emit(event, data) {
  if (_onEvent) _onEvent(event, data);
}

// ---- 工具 ----
function genSecurityCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ============================================
// 服务器
// ============================================

let _server = null;
let _serverPassword = '';
let _serverClients = new Map(); // clientId → { ws, ip, securityCode, approved, permission, filePerms, remoteAddr, editingFiles }
let _pendingClients = new Map(); // clientId → { ws, ip, securityCode }
let _clientIdCounter = 0;

function getServerStatus() {
  if (!_server) return { running: false };
  const clients = [];
  for (const [id, c] of _serverClients) {
    clients.push({
      id,
      ip: c.remoteAddr,
      securityCode: c.securityCode,
      approved: c.approved,
      permission: c.permission || 'confirm',
      filePerms: c.filePerms || {},
    });
  }
  // 待确认的也加入列表
  for (const [id, c] of _pendingClients) {
    clients.push({
      id,
      ip: c.remoteAddr,
      securityCode: c.securityCode,
      approved: false,
      pending: true,
    });
  }
  return { running: true, clients, serverVersion: APP_VERSION, allowDifferentVersions: _allowDifferentVersions };
}

async function startServer(port, password, options = {}) {
  if (_server) {
    await stopServer();
  }

  _serverPassword = password;
  _allowDifferentVersions = options.allowDifferentVersions === true;
  _serverClients.clear();
  _pendingClients.clear();

  return new Promise((resolve, reject) => {
    try {
      _server = new WebSocket.Server({ port }, () => {
        console.log(`[REMOTE] 服务器已启动，端口: ${port}`);
        emit('server:started', { port });
        resolve({ success: true });
      });

      _server.on('error', (err) => {
        console.error('[REMOTE] 服务器错误:', err.message);
        emit('server:error', { message: err.message });
        _server = null;
        if (!_server) reject(err);
      });

      _server.on('connection', (ws, req) => {
        const clientId = 'client_' + (++_clientIdCounter);
        const remoteAddr = req.socket.remoteAddress || 'unknown';
        console.log(`[REMOTE] 新连接: ${clientId} from ${remoteAddr}`);

        let securityCode = '';

        const safeSend = (data) => {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(data));
            }
          } catch (e) {
            console.warn('[REMOTE] 发送消息失败:', e.message);
          }
        };

        ws.on('message', (raw) => {
          let msg;
          try {
            msg = JSON.parse(raw.toString());
          } catch (e) {
            safeSend({ type: 'error', message: '无效消息格式' });
            return;
          }

          // 已认证的客户端在 _serverClients 中，待确认的在 _pendingClients 中
          if (!_serverClients.has(clientId)) {
            // ---- 认证阶段 ----
            if (msg.type === 'auth:request') {
              if (msg.password !== _serverPassword) {
                safeSend({ type: 'auth:rejected', reason: '密码错误' });
                ws.close();
                return;
              }
              // 版本检查：默认拒绝不同版本客户端
              if (msg.version && msg.version !== APP_VERSION && !_allowDifferentVersions) {
                safeSend({ type: 'auth:rejected', reason: '客户端版本 (' + msg.version + ') 与服务器版本 (' + APP_VERSION + ') 不匹配，请在设置中开启"允许不同版本"' });
                ws.close();
                return;
              }
              // 生成安全码，进入待确认状态
              securityCode = genSecurityCode();
              _pendingClients.set(clientId, { ws, ip: remoteAddr, securityCode, remoteAddr });
              safeSend({ type: 'auth:challenge', securityCode });
              emit('client:joined', {
                clientId,
                ip: remoteAddr,
                securityCode,
                pending: true,
              });
              return;
            }

            safeSend({ type: 'error', message: '请先认证' });
            return;
          }

          // ---- 已认证 ----
          handleClientMessage(clientId, msg);
        });

        ws.on('close', () => {
          console.log(`[REMOTE] 连接断开: ${clientId}`);
          // 释放该客户端正在编辑的文件
          const leaving = _serverClients.get(clientId);
          if (leaving && leaving.editingFiles) {
            for (const fp of leaving.editingFiles) {
              broadcastToClients(clientId, { type: 'file:editing:ended', path: fp, clientId });
            }
          }
          _serverClients.delete(clientId);
          _pendingClients.delete(clientId);
          emit('client:left', { clientId });
        });

        ws.on('error', (err) => {
          console.warn(`[REMOTE] 客户端 ${clientId} 错误:`, err.message);
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function stopServer() {
  if (_server) {
    // 通知所有客户端
    for (const [, c] of _serverClients) {
      try {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'server:stopped' }));
          c.ws.close();
        }
      } catch (e) {}
    }
    for (const [, c] of _pendingClients) {
      try {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'server:stopped' }));
          c.ws.close();
        }
      } catch (e) {}
    }
    _server.close();
    _server = null;
    _serverClients.clear();
    _pendingClients.clear();
    emit('server:stopped', {});
  }
}

function confirmClient(clientId) {
  const pending = _pendingClients.get(clientId);
  if (!pending) return { success: false, reason: '未找到待确认的客户端' };

  _pendingClients.delete(clientId);
  const permission = 'confirm'; // 默认：更改需确认
  _serverClients.set(clientId, {
    ws: pending.ws,
    ip: pending.ip,
    securityCode: pending.securityCode,
    remoteAddr: pending.remoteAddr,
    approved: true,
    permission,
    filePerms: {},
    editingFiles: new Set(),
  });

  try {
    if (pending.ws.readyState === WebSocket.OPEN) {
      pending.ws.send(JSON.stringify({
        type: 'auth:approved',
        permissions: { level: permission, files: {} },
      }));
    }
  } catch (e) {}

  emit('client:approved', { clientId, permission });
  return { success: true };
}

function rejectClient(clientId) {
  const pending = _pendingClients.get(clientId);
  if (!pending) return { success: false, reason: '未找到待确认的客户端' };

  _pendingClients.delete(clientId);
  try {
    if (pending.ws.readyState === WebSocket.OPEN) {
      pending.ws.send(JSON.stringify({ type: 'auth:rejected', reason: '管理员拒绝了连接请求' }));
      pending.ws.close();
    }
  } catch (e) {}
  emit('client:rejected', { clientId });
  return { success: true };
}

function setClientPermission(clientId, permission) {
  const client = _serverClients.get(clientId);
  if (!client) return { success: false, reason: '未找到客户端' };
  client.permission = permission;
  try {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'permission:update',
        permissions: { level: permission, files: client.filePerms || {} },
      }));
    }
  } catch (e) {}
  emit('client:permission-changed', { clientId, permission });
  return { success: true };
}

function setClientFilePermission(clientId, filePath, filePermission) {
  const client = _serverClients.get(clientId);
  if (!client) return { success: false, reason: '未找到客户端' };
  if (!client.filePerms) client.filePerms = {};
  client.filePerms[filePath] = filePermission;
  try {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'permission:update',
        permissions: { level: client.permission, files: client.filePerms },
      }));
    }
  } catch (e) {}
  return { success: true };
}

function disconnectClient(clientId) {
  const client = _serverClients.get(clientId);
  if (client) {
    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: 'disconnected', reason: '管理员断开了连接' }));
        client.ws.close();
      }
    } catch (e) {}
    _serverClients.delete(clientId);
  }
  const pending = _pendingClients.get(clientId);
  if (pending) {
    try {
      if (pending.ws.readyState === WebSocket.OPEN) {
        pending.ws.send(JSON.stringify({ type: 'disconnected', reason: '管理员断开了连接' }));
        pending.ws.close();
      }
    } catch (e) {}
    _pendingClients.delete(clientId);
  }
  emit('client:left', { clientId });
}

function disconnectAll() {
  const ids = [..._serverClients.keys(), ..._pendingClients.keys()];
  for (const id of ids) {
    disconnectClient(id);
  }
}

// 处理来自已认证客户端的消息
function handleClientMessage(clientId, msg) {
  const client = _serverClients.get(clientId);
  if (!client) {
    emit('server:error', { message: `未知客户端 ${clientId} 发送消息` });
    return;
  }

  switch (msg.type) {
    case 'file:read': {
      readClientFile(clientId, client, msg);
      break;
    }
    case 'file:write': {
      writeClientFile(clientId, client, msg);
      break;
    }
    case 'file:list': {
      listClientFiles(clientId, client, msg);
      break;
    }
    case 'file:delete': {
      deleteClientFile(clientId, client, msg);
      break;
    }
    case 'file:editing:start': {
      // 客户端开始编辑某个文件
      if (!client.editingFiles) client.editingFiles = new Set();
      client.editingFiles.add(msg.path);
      // 通知所有其他客户端
      broadcastToClients(clientId, { type: 'file:editing:started', path: msg.path, clientId });
      break;
    }
    case 'file:editing:end': {
      // 客户端结束编辑某个文件
      if (client.editingFiles) client.editingFiles.delete(msg.path);
      broadcastToClients(clientId, { type: 'file:editing:ended', path: msg.path, clientId });
      break;
    }
    case 'file:editing:list': {
      // 返回当前正在编辑的文件列表
      const editingMap = {};
      for (const [cid, c] of _serverClients) {
        if (c.editingFiles) {
          for (const fp of c.editingFiles) {
            editingMap[fp] = cid;
          }
        }
      }
      safeSendTo(client, { type: 'file:editing:list:result', editing: editingMap });
      break;
    }
    case 'ping': {
      safeSendTo(client, { type: 'pong' });
      break;
    }
    default:
      safeSendTo(client, { type: 'error', message: `未知消息类型: ${msg.type}` });
  }
}

function broadcastToClients(senderClientId, data) {
  for (const [cid, c] of _serverClients) {
    if (cid !== senderClientId) {
      safeSendTo(c, data);
    }
  }
}

function safeSendTo(client, data) {
  try {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  } catch (e) {}
}

function readClientFile(clientId, client, msg) {
  const filePath = msg.path;
  // 权限检查
  const filePerm = checkFilePermission(client, filePath);
  if (filePerm === 'none') {
    safeSendTo(client, { type: 'file:read:result', path: filePath, success: false, error: '无权限读取此文件' });
    return;
  }
  fs.readFile(filePath, 'utf-8', (err, content) => {
    if (err) {
      safeSendTo(client, { type: 'file:read:result', path: filePath, success: false, error: err.message });
      return;
    }
    safeSendTo(client, { type: 'file:read:result', path: filePath, success: true, content });
  });
}

function writeClientFile(clientId, client, msg) {
  const filePath = msg.path;
  const filePerm = checkFilePermission(client, filePath);

  if (filePerm === 'none') {
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: false, error: '无权限编辑此文件' });
    return;
  }

  if (client.permission === 'guest') {
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: false, error: '访客模式，无编辑权限' });
    return;
  }

  if (client.permission === 'confirm' || filePerm === 'confirm') {
    // 需要管理员确认
    emit('file:change:request', {
      clientId,
      ip: client.remoteAddr,
      path: filePath,
      content: msg.content,
    });
    safeSendTo(client, { type: 'file:write:pending', path: filePath });
    return;
  }

  // 直接写入
  fs.writeFile(filePath, msg.content, 'utf-8', (err) => {
    if (err) {
      safeSendTo(client, { type: 'file:write:result', path: filePath, success: false, error: err.message });
      return;
    }
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: true });
    emit('file:change:applied', { clientId, path: filePath });
  });
}

function listClientFiles(clientId, client, msg) {
  const dirPath = msg.path;
  if (!dirPath) {
    safeSendTo(client, { type: 'file:list:result', path: '', success: false, error: '未指定路径' });
    return;
  }

  // Windows 下根目录 "/" 转换为列出盘符
  if (dirPath === '/' && process.platform === 'win32') {
    const drives = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const drivePath = letter + ':\\';
      try {
        if (fs.existsSync(drivePath)) {
          drives.push({ name: letter + ':', isDirectory: true, path: drivePath });
        }
      } catch (e) {}
    }
    safeSendTo(client, { type: 'file:list:result', path: '/', success: true, files: drives });
    return;
  }

  fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
    if (err) {
      safeSendTo(client, { type: 'file:list:result', path: dirPath, success: false, error: err.message });
      return;
    }
    const files = entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      path: path.join(dirPath, e.name),
    }));
    safeSendTo(client, { type: 'file:list:result', path: dirPath, success: true, files });
  });
}

function deleteClientFile(clientId, client, msg) {
  const filePath = msg.path;
  const filePerm = checkFilePermission(client, filePath);

  if (filePerm === 'none') {
    safeSendTo(client, { type: 'file:delete:result', path: filePath, success: false, error: '无权限删除此文件' });
    return;
  }

  if (client.permission === 'guest') {
    safeSendTo(client, { type: 'file:delete:result', path: filePath, success: false, error: '访客模式，无删除权限' });
    return;
  }

  if (client.permission === 'confirm' || filePerm === 'confirm') {
    // 需要管理员确认
    emit('file:delete:request', {
      clientId,
      ip: client.remoteAddr,
      path: filePath,
    });
    safeSendTo(client, { type: 'file:delete:pending', path: filePath });
    return;
  }

  // 直接删除
  fs.unlink(filePath, (err) => {
    if (err) {
      safeSendTo(client, { type: 'file:delete:result', path: filePath, success: false, error: err.message });
      return;
    }
    safeSendTo(client, { type: 'file:delete:result', path: filePath, success: true });
    emit('file:delete:applied', { clientId, path: filePath });
  });
}

function checkFilePermission(client, filePath) {
  if (!client.filePerms) return null;
  // 按完整路径匹配
  if (client.filePerms[filePath]) return client.filePerms[filePath];
  // 按目录匹配
  for (const [pattern, perm] of Object.entries(client.filePerms)) {
    if (filePath.startsWith(pattern.replace(/\\/g, '/'))) return perm;
  }
  return null; // 继承客户端级别权限
}

// 管理员批准文件更改
function approveFileChange(clientId, path) {
  // 从待处理队列中查找
  // 由于我们没有存储待处理的更改，这里简化处理：
  //  renderer 端在点"批准"时已经包含了内容和路径
  // 这个方法不会被直接调用，而是由 renderer 发来已批准的内容直接写入
}

// 管理员直接写入文件（批准更改）
function applyApprovedWrite(clientId, filePath, content) {
  fs.writeFile(filePath, content, 'utf-8', (err) => {
    if (err) {
      emit('server:error', { message: `批准写入失败: ${err.message}` });
      return;
    }
    // 通知对应客户端
    const client = _serverClients.get(clientId);
    if (client) {
      safeSendTo(client, { type: 'file:write:result', path: filePath, success: true });
    }
    emit('file:change:applied', { clientId, path: filePath });
  });
}

// 管理员批准删除文件
function applyApprovedDelete(clientId, filePath) {
  fs.unlink(filePath, (err) => {
    if (err) {
      emit('server:error', { message: `批准删除失败: ${err.message}` });
      return;
    }
    const client = _serverClients.get(clientId);
    if (client) {
      safeSendTo(client, { type: 'file:delete:result', path: filePath, success: true });
    }
    emit('file:delete:applied', { clientId, path: filePath });
  });
}

// 管理员拒绝删除文件
function notifyFileDeleteRejected(clientId, filePath, reason) {
  const client = _serverClients.get(clientId);
  if (client) {
    safeSendTo(client, { type: 'file:delete:result', path: filePath, success: false, error: reason || '管理员拒绝了删除请求' });
  }
}

// ============================================
// 客户端
// ============================================

let _client = null;
let _clientInfo = null;

function getClientStatus() {
  if (!_client || _client.readyState === WebSocket.CLOSED || _client.readyState === WebSocket.CLOSING) {
    return { connected: false };
  }
  return {
    connected: true,
    state: _client.readyState === WebSocket.OPEN ? 'open' :
           _client.readyState === WebSocket.CONNECTING ? 'connecting' : 'closing',
    serverInfo: _clientInfo,
  };
}

async function connectToServer(host, port, password, version) {
  if (_client) {
    await disconnectFromServer();
  }

  const url = `ws://${host}:${port}`;
  _clientInfo = { host, port };

  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(url);
      let authTimeout = setTimeout(() => {
        if (_client && (_client.readyState === WebSocket.OPEN || _client.readyState === WebSocket.CONNECTING)) {
          emit('client:error', { message: '认证超时' });
          ws.close();
          _client = null;
        }
      }, 10000);

      ws.on('open', () => {
        console.log(`[REMOTE] 已连接到服务器 ${url}`);
        // 发送认证请求（含版本信息）
        const authMsg = { type: 'auth:request', password };
        if (version) authMsg.version = version;
        ws.send(JSON.stringify(authMsg));
        emit('client:connecting', { host, port });
      });

      // 统一消息处理（不在外部重复注册）
      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch (e) {
          emit('client:error', { message: '无效消息格式' });
          return;
        }

        // 认证阶段消息
        if (msg.type === 'auth:challenge') {
          clearTimeout(authTimeout);
          emit('client:auth:challenge', { securityCode: msg.securityCode });
          resolve({ stage: 'challenge', securityCode: msg.securityCode });
          return;
        }
        if (msg.type === 'auth:rejected') {
          clearTimeout(authTimeout);
          emit('client:error', { message: msg.reason || '认证被拒绝' });
          ws.close();
          _client = null;
          reject(new Error(msg.reason || '认证被拒绝'));
          return;
        }
        if (msg.type === 'auth:approved') {
          clearTimeout(authTimeout);
          emit('client:auth:approved', { permissions: msg.permissions });
          resolve({ stage: 'approved', permissions: msg.permissions });
          return;
        }

        // 认证后的常规消息
        handleServerMessage(ws, msg);
      });

      ws.on('close', () => {
        console.log('[REMOTE] 与服务器的连接已断开');
        clearTimeout(authTimeout);
        _client = null;
        emit('client:disconnected', {});
        reject(new Error('连接已断开'));
      });

      ws.on('error', (err) => {
        console.error('[REMOTE] 客户端连接错误:', err.message);
        clearTimeout(authTimeout);
        emit('client:error', { message: err.message });
        _client = null;
        reject(new Error(err.message));
      });

      _client = ws;
    } catch (err) {
      reject(err);
    }
  });
}

async function disconnectFromServer() {
  if (_client) {
    try {
      if (_client.readyState === WebSocket.OPEN) {
        _client.send(JSON.stringify({ type: 'disconnect' }));
        _client.close();
      }
    } catch (e) {}
    _client = null;
    _clientInfo = null;
    emit('client:disconnected', {});
  }
}

// 客户端：发送安全码确认（用户在客户端看到安全码后，告知服务器已确认）
function sendSecurityCode(securityCode) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'auth:security-code', securityCode }));
    emit('client:security-code:sent', {});
  }
}

// 客户端：发送文件读取请求
function requestFileRead(filePath) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:read', path: filePath }));
  }
}

// 客户端：发送文件写入请求
function requestFileWrite(filePath, content) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:write', path: filePath, content }));
  }
}

// 客户端：发送文件列表请求
function requestFileList(dirPath) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:list', path: dirPath }));
  }
}

// 客户端：发送文件删除请求
function requestFileDelete(filePath) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:delete', path: filePath }));
  }
}

// 客户端：通知服务器开始编辑文件
function notifyEditingStart(filePath) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:editing:start', path: filePath }));
  }
}

// 客户端：通知服务器结束编辑文件
function notifyEditingEnd(filePath) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:editing:end', path: filePath }));
  }
}

// 客户端：请求正在编辑的文件列表
function requestEditingList() {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:editing:list' }));
  }
}

// 处理来自服务器的消息
function handleServerMessage(ws, msg) {
  switch (msg.type) {
    case 'auth:approved':
      emit('client:auth:approved', { permissions: msg.permissions });
      break;
    case 'auth:rejected':
      emit('client:error', { message: msg.reason || '认证被拒绝' });
      ws.close();
      _client = null;
      break;
    case 'auth:challenge':
      emit('client:auth:challenge', { securityCode: msg.securityCode });
      break;
    case 'permission:update':
      emit('client:permission:updated', { permissions: msg.permissions });
      break;
    case 'file:read:result':
      emit('client:file:read', { path: msg.path, success: msg.success, content: msg.content, error: msg.error });
      break;
    case 'file:write:result':
      emit('client:file:write:result', { path: msg.path, success: msg.success, error: msg.error });
      break;
    case 'file:write:pending':
      emit('client:file:write:pending', { path: msg.path });
      break;
    case 'file:list:result':
      emit('client:file:list', { path: msg.path, success: msg.success, files: msg.files, error: msg.error });
      break;
    case 'file:delete:result':
      emit('client:file:delete:result', { path: msg.path, success: msg.success, error: msg.error });
      break;
    case 'file:delete:pending':
      emit('client:file:delete:pending', { path: msg.path });
      break;
    case 'file:editing:started':
      emit('client:file:editing:started', { path: msg.path, clientId: msg.clientId });
      break;
    case 'file:editing:ended':
      emit('client:file:editing:ended', { path: msg.path, clientId: msg.clientId });
      break;
    case 'file:editing:list:result':
      emit('client:file:editing:list:result', { editing: msg.editing });
      break;
    case 'server:stopped':
      emit('client:server:stopped', {});
      break;
    case 'disconnected':
      emit('client:disconnected', { reason: msg.reason });
      break;
    case 'pong':
      emit('client:pong', {});
      break;
    case 'error':
      emit('client:error', { message: msg.message });
      break;
    default:
      console.warn('[REMOTE] 未知服务器消息:', msg.type);
  }
}

// 发送文件变更结果到客户端（管理员批准后）
function notifyFileChangeApproved(clientId, filePath) {
  const client = _serverClients.get(clientId);
  if (client) {
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: true });
  }
}

// 发送文件变更被拒绝
function notifyFileChangeRejected(clientId, filePath, reason) {
  const client = _serverClients.get(clientId);
  if (client) {
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: false, error: reason || '更改被管理员拒绝' });
  }
}

module.exports = {
  setEventHandler,
  // 服务器
  startServer,
  stopServer,
  getServerStatus,
  confirmClient,
  rejectClient,
  setClientPermission,
  setClientFilePermission,
  disconnectClient,
  disconnectAll,
  applyApprovedWrite,
  notifyFileChangeApproved,
  notifyFileChangeRejected,
  applyApprovedDelete,
  notifyFileDeleteRejected,
  // 客户端
  connectToServer,
  disconnectFromServer,
  getClientStatus,
  sendSecurityCode,
  requestFileRead,
  requestFileWrite,
  requestFileList,
  requestFileDelete,
  notifyEditingStart,
  notifyEditingEnd,
  requestEditingList,
};
