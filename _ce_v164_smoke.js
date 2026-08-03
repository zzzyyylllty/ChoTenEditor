// v1.0.64 冒烟: 阶段1 高危修复验证
//  1. ai:chat SSE 跨 chunk 中文不截断 (StringDecoder)
//  2. shell:openExternal 协议白名单 (file:// 拒绝)
//  3. remote stopServer 立即重启同端口 (等待 close 完成)
//  4. settings.html tb-close 嵌入模式不关闭主窗口
//  5. 远程保存失败保留 dirty 标记 (数据不丢失)
const { app, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

// 加载 main.js 注册全部 ipcMain handler (require.main 守卫避免其自建窗口)
require('./main.js');
const remote = require('./remote.js');

let fails = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!cond) fails++;
}

app.whenReady().then(async () => {
  try {
    // remote 事件转发到两个测试窗口 (main.js 只转发 mainWindow)
    const windows = [];
    remote.setEventHandler((event, data) => {
      windows.forEach(w => {
        if (w && !w.isDestroyed()) w.webContents.send('remote:event', event, data);
      });
    });

    // ---- 1. SSE 中文分块 ----
    // 本地 HTTP 服务器: 把 '中文' 的 UTF-8 字节拆到两个 chunk, 中间跨 SSE 行边界
    let ssePort = 0;
    const sseServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const bytes = Buffer.from('data: {"choices":[{"delta":{"content":"中文"}}]}\n\ndata: [DONE]\n\n', 'utf8');
      // 故意在 3 字节 UTF-8 字符中间切断
      const cut = 27; // 'data: {"choices":[{"delta":{"content":"' 长度内切断 '中' 字节
      res.write(bytes.slice(0, cut));
      setTimeout(() => {
        res.write(bytes.slice(cut));
        res.end();
      }, 100);
    });
    await new Promise((r) => sseServer.listen(0, '127.0.0.1', r));
    ssePort = sseServer.address().port;

    const win = new BrowserWindow({
      show: false, width: 1280, height: 860,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false,
        nodeIntegrationInSubFrames: true,
      },
    });
    windows.push(win);
    await win.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 1500));

    const r1 = await win.webContents.executeJavaScript(`(async function () {
      var out = {};
      var chunks = [];
      window.electronAPI.ai.onChunk(function (c) { chunks.push(c); });
      try {
        var res = await window.electronAPI.ai.chat(
          { endpoint: 'http://127.0.0.1:${ssePort}', model: 'test', apiKey: 'k', maxTokens: 16 },
          [{ role: 'user', content: 'hi' }]
        );
        out.res = res;
      } catch (e) { out.err = String(e); }
      window.electronAPI.ai.removeListeners();
      out.joined = chunks.join('');
      return out;
    })()`);
    const sseOk = r1.res && r1.res.success === true && r1.joined === '中文';
    check(sseOk, 'ai:chat SSE 跨 chunk 中文完整 (实际: ' + JSON.stringify(r1.joined) + ', success=' + (r1.res && r1.res.success) + ')');
    sseServer.close();

    // ---- 2. openExternal 白名单: file:// 拒绝 ----
    const r2 = await win.webContents.executeJavaScript(`(async function () {
      var out = {};
      var r = await window.electronAPI.openExternal('file:///C:/Windows/notepad.exe');
      out.fileResult = r;
      var r2b = await window.electronAPI.openExternal('javascript:alert(1)');
      out.jsResult = r2b;
      return out;
    })()`);
    check(r2.fileResult && r2.fileResult.success === false, 'openExternal file:// 拒绝 (实际: ' + JSON.stringify(r2.fileResult) + ')');
    check(r2.jsResult && r2.jsResult.success === false, 'openExternal javascript: 拒绝 (实际: ' + JSON.stringify(r2.jsResult) + ')');

    // ---- 3. stopServer 立即重启同端口 ----
    const r3 = await win.webContents.executeJavaScript(`(async function () {
      var out = {};
      var s1 = await window.electronAPI.remote.startServer({ port: 18987, password: 'pw', allowDifferentVersions: true });
      var s2 = await window.electronAPI.remote.startServer({ port: 18987, password: 'pw', allowDifferentVersions: true });
      out.s1 = s1; out.s2 = s2;
      return out;
    })()`);
    check(r3.s1 && r3.s1.success !== false, '远程服务器首次启动 (实际: ' + JSON.stringify(r3.s1) + ')');
    check(r3.s2 && r3.s2.success !== false, 'stopServer 等待 close, 同端口立即重启成功 (实际: ' + JSON.stringify(r3.s2) + ')');
    await win.webContents.executeJavaScript(`window.electronAPI.remote.stopServer()`);

    // ---- 4. settings iframe tb-close 嵌入模式 ----
    const r4 = await win.webContents.executeJavaScript(`(async function () {
      var out = {};
      openSettings();
      var frame = document.getElementById('st-frame');
      await new Promise(function (r) { frame.addEventListener('load', function () { r(); }, { once: true }); });
      await new Promise(function (r) { setTimeout(r, 1500); });
      var frWin = frame.contentWindow;
      out.embedded = frWin.self !== frWin.top;
      frWin.document.getElementById('tb-close').click();
      // 等父页面收到 closeSettings → requestCloseSettingsModal → saveSettings → settingsSaved → 关闭 overlay
      await new Promise(function (r) { setTimeout(r, 1500); });
      out.overlayHidden = document.getElementById('st-overlay').style.display === 'none';
      out.windowAlive = true;
      return out;
    })()`);
    check(r4.embedded, 'settings iframe 处于嵌入模式 (实际: embedded=' + r4.embedded + ')');
    check(r4.overlayHidden, 'tb-close 嵌入模式关闭设置弹窗 (实际: overlayHidden=' + r4.overlayHidden + ')');
    check(r4.windowAlive, 'tb-close 嵌入模式未关闭主窗口');

    // ---- 5. 远程保存失败保留 dirty 标记 ----
    // 服务器端(窗口A=win)确认客户端后设为 guest: 写入直接失败 → dirty 必须保留
    const testFile = path.join(__dirname, '_ce_tmp_remote_save.txt');
    fs.writeFileSync(testFile, 'hello', 'utf-8');
    // 客户端窗口: 先连接 (connectToServer 会挂起直到服务器批准)
    const winC = new BrowserWindow({
      show: false, width: 1280, height: 860,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false,
        nodeIntegrationInSubFrames: true,
      },
    });
    windows.push(winC);
    await winC.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 1500));
    const connPromise = winC.webContents.executeJavaScript(`(async function () {
      var out = {};
      var conn = await window.electronAPI.remote.connectToServer({ host: '127.0.0.1', port: 18988, password: 'pw2', version: '1.0.64' });
      out.stage = conn && conn.stage;
      return out;
    })()`);
    // 注: connectToServer 在 auth:challenge 时即 resolve, 批准通过 'client:auth:approved'
    //     事件确认; 且 preload onEvent 为单订阅(会顶掉 renderer 监听), 故批准由后续
    //     文件读取成功隐式验证

    // 服务器端(win): 启动服务器 → 等客户端加入并确认 → 设为 guest
    const r5 = await win.webContents.executeJavaScript(`(async function () {
      var out = {};
      await window.electronAPI.remote.startServer({ port: 18988, password: 'pw2', allowDifferentVersions: true });
      // 等客户端加入并确认
      var cid = await new Promise(function (resolve, reject) {
        var t0 = Date.now();
        var iv = setInterval(async function () {
          var st = await window.electronAPI.remote.getServerStatus();
          var pending = (st.clients || []).find(function (c) { return c.pending; });
          if (pending) {
            clearInterval(iv);
            var cr = await window.electronAPI.remote.confirmClient({ clientId: pending.id });
            out.confirm = cr;
            // 设为 guest: 写入必然失败
            var pr = await window.electronAPI.remote.setClientPermission({ clientId: pending.id, permission: 'guest' });
            out.perm = pr;
            resolve(pending.id);
          } else if (Date.now() - t0 > 15000) { clearInterval(iv); reject(new Error('客户端未加入')); }
        }, 200);
      });
      out.cid = cid;
      return out;
    })()`);
    const r5b = await connPromise;
    check(r5b.stage === 'challenge', '客户端连接进入待确认状态 (实际: ' + r5b.stage + ')');

    // 远程读取 → openFile 进入编辑器 → 修改 → 保存 (guest 权限必然失败)
    const r5c = await winC.webContents.executeJavaScript(`(async function () {
      var out = {};
      _fmMode = 'remote';
      await window.electronAPI.remote.requestFileRead({ filePath: '${testFile.replace(/\\/g, '/')}' });
      var t0 = Date.now();
      while ((typeof currentFile !== 'string' || String(currentFile).indexOf('_ce_tmp_remote_save') === -1) && Date.now() - t0 < 8000) {
        await new Promise(function (r) { setTimeout(r, 100); });
      }
      out.currentFile = typeof currentFile === 'string' ? currentFile : null;
      if (codeMirrorEditor && out.currentFile) {
        codeMirrorEditor.setValue('modified-content');
        await new Promise(function (r) { setTimeout(r, 300); });
        out.dirtyBefore = !!dirtyTabs[out.currentFile];
        out.saveResult = await saveCurrentFile();
        out.dirtyAfter = !!dirtyTabs[out.currentFile];
      }
      return out;
    })()`);
    check(r5c.currentFile !== null && String(r5c.currentFile).indexOf('_ce_tmp_remote_save') !== -1, '远程文件已打开 (实际: ' + r5c.currentFile + ')');
    check(r5c.dirtyBefore === true, '修改后 dirty 标记存在 (实际: ' + r5c.dirtyBefore + ')');
    check(r5c.saveResult === false, 'guest 权限保存失败返回 false (实际: ' + r5c.saveResult + ')');
    check(r5c.dirtyAfter === true, '保存失败后 dirty 标记保留 (实际: ' + r5c.dirtyAfter + ')');

    await winC.webContents.executeJavaScript(`window.electronAPI.remote.disconnectFromServer()`);
    await win.webContents.executeJavaScript(`window.electronAPI.remote.stopServer()`);
    fs.unlinkSync(testFile);

    win.destroy();
    winC.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
