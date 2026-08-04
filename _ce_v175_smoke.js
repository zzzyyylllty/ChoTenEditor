// v1.0.75 冒烟: 文件树导航 (◀▶ 历史 / ▲▼ 相邻文件 / ↻ 刷新) + sidebar 头部改造
//  1. h3「项目文件」已删除; 5 个按钮存在且带 tooltip; ◀▶ 初始 disabled
//  2. 历史: 打开 a.yml → 展开 dir1 → 打开 dir1/b.yml; ◀ 回 dir1, ◀ 回 a.yml; ▶ 前进回 dir1/b.yml
//  3. ▲▼ 当前目录相邻文件循环 (a.yml → c.yml → d.yml → a.yml; ▲ 反向)
//  4. 单文件目录内 ▲▼ 不切换
//  5. ↻ 刷新后新文件出现
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 注册全部 ipcMain handler
require('./main.js');

// 测试环境 GPU 不稳, 走软件合成
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'tree_fixture');
const f = (p) => path.join(FIXTURE, p);
const P = (p) => JSON.stringify(p);

// 重建 fixture (幂等): 根目录 3 个文件 + 1 个子目录
fs.rmSync(FIXTURE, { recursive: true, force: true });
fs.mkdirSync(f('dir1'), { recursive: true });
fs.writeFileSync(f('a.yml'), 'items:\n  default:a:\n    material: paper\n');
fs.writeFileSync(f('c.yml'), 'x: 1\n');
fs.writeFileSync(f('d.yml'), 'x: 1\n');
fs.writeFileSync(f('dir1/b.yml'), 'x: 1\n');

let fails = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!cond) fails++;
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: true, width: 1280, height: 860,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false,
        nodeIntegrationInSubFrames: true,
      },
    });
    await win.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 2000));

    // 注入状态并重载: 跳过欢迎弹窗 + 指向 fixture 项目
    await win.webContents.executeJavaScript(`(function () {
      var v = (window.electronAPI && window.electronAPI.appVersion) || '1.0.0';
      sessionStorage.setItem('welcomeShown', v);
      localStorage.setItem('welcomeDismissed', v);
      localStorage.setItem('editorConfig', JSON.stringify({ language: 'zh_cn', theme: 'dark', editor: { theme: 'dracula', fontSize: '14' } }));
      localStorage.setItem('appState', JSON.stringify({ currentProjectPath: ${P(FIXTURE)}, currentFile: null, openTabs: [], activeTab: null }));
      localStorage.removeItem('ceRecentProjects');
      localStorage.removeItem('ceRecentFiles');
      localStorage.removeItem('ceTreeExpanded');
      return true;
    })()`);
    await win.webContents.executeJavaScript(`location.reload(); true;`).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));

    async function waitFor(expr, timeout, step) {
      timeout = timeout || 10000;
      step = step || 150;
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        let v = false;
        try { v = await win.webContents.executeJavaScript(expr); } catch (e) { v = false; }
        if (v) return true;
        await new Promise(r => setTimeout(r, step));
      }
      return false;
    }
    async function evalJS(expr) {
      return win.webContents.executeJavaScript(expr);
    }
    const H = 'function findRow(p){var r=document.querySelectorAll(".tree-row");for(var i=0;i<r.length;i++){if(r[i].dataset.path===p)return r[i];}return null;}function findLi(p){var it=document.querySelectorAll("li.tree-item");for(var i=0;i<it.length;i++){if(it[i].dataset.path===p)return it[i];}return null;}';
    async function waitForJS(expr, timeout, step) {
      timeout = timeout || 10000;
      step = step || 150;
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        let v = false;
        try { v = await win.webContents.executeJavaScript(H + expr); } catch (e) { v = false; }
        if (v) return true;
        await new Promise(r => setTimeout(r, step));
      }
      return false;
    }
    async function evalJS2(expr) {
      return win.webContents.executeJavaScript(H + expr);
    }

    // ---------- A. UI 改造 ----------
    check(await waitFor(`document.querySelectorAll('.file-tree > li.tree-item').length >= 3`), 'A1 树已渲染');
    const a = await evalJS(`(function () {
      var ids = ['nav-back', 'nav-forward', 'nav-prev', 'nav-next', 'fm-reload'];
      var out = {
        h3: !!document.querySelector('.sidebar-header h3'),
        btns: {},
      };
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        out.btns[id] = { exists: !!el, tip: el ? el.getAttribute('data-tip') : null, disabled: el ? el.disabled : null };
      });
      return out;
    })()`);
    check(!a.h3, 'A2 h3「项目文件」已删除');
    let a3ok = true;
    Object.keys(a.btns).forEach(function (id) {
      var b = a.btns[id];
      if (!b.exists || !b.tip || b.disabled === null) a3ok = false;
    });
    check(a3ok, 'A3 5 个按钮存在且带 tooltip');
    check(a.btns['nav-back'].disabled === true && a.btns['nav-forward'].disabled === true, 'A4 ◀▶ 初始 disabled');

    // ---------- B. 历史导航 ----------
    // B1 打开 a.yml
    await evalJS2(`findRow(${P(f('a.yml'))}).click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('a.yml'))}`), 'B1 打开 a.yml');
    // B2 展开 dir1
    await evalJS2(`findRow(${P(f('dir1'))}).click(); true;`).catch(() => {});
    check(await waitForJS(`findLi(${P(f('dir1'))}).classList.contains('expanded')`), 'B2 展开 dir1');
    // B3 打开 dir1/b.yml
    await evalJS2(`findRow(${P(f('dir1/b.yml'))}).click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('dir1/b.yml'))}`), 'B3 打开 dir1/b.yml');
    // B4 ◀ 回到 dir1 (历史目录条目)
    await evalJS(`document.getElementById('nav-back').click(); true;`).catch(() => {});
    check(await waitForJS(`(function () {
      var li = findLi(${P(f('dir1'))});
      return li && li.classList.contains('expanded');
    })()`), 'B4 ◀ 回到 dir1 (展开)');
    check(await waitFor(`window.appState.currentFile === ${P(f('dir1/b.yml'))}`), 'B5 ◀ 后当前文件不变 (仍在 b.yml)');
    // B6 ◀ 回到 a.yml
    await evalJS(`document.getElementById('nav-back').click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('a.yml'))}`), 'B6 ◀ 回到 a.yml');
    // B7 ▶ 前进: 先到 dir1
    await evalJS(`document.getElementById('nav-forward').click(); true;`).catch(() => {});
    check(await waitForJS(`(function () {
      var li = findLi(${P(f('dir1'))});
      return li && li.classList.contains('expanded') && window.appState.currentFile === ${P(f('a.yml'))};
    })()`), 'B7 ▶ 前进到 dir1');
    // B8 ▶ 前进: b.yml
    await evalJS(`document.getElementById('nav-forward').click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('dir1/b.yml'))}`), 'B8 ▶ 前进到 dir1/b.yml');
    const b9 = await evalJS(`(function () {
      var back = document.getElementById('nav-back');
      var fwd = document.getElementById('nav-forward');
      return { backEnabled: !back.disabled, fwdDisabled: fwd.disabled };
    })()`);
    check(b9.backEnabled && b9.fwdDisabled, 'B9 ◀ 可点, ▶ 在末尾禁用');

    // ---------- C. 上下文件循环 ----------
    // C1 单文件目录: ▲ 不切换
    const c1 = await evalJS2(`window.appState.currentFile`);
    await evalJS(`document.getElementById('nav-prev').click(); true;`).catch(() => {});
    await new Promise(r => setTimeout(r, 400));
    check(await evalJS2(`window.appState.currentFile === ${P(f('dir1/b.yml'))}`), 'C1 单文件目录 ▲ 不切换');
    // C2 打开根 a.yml → ▼ 循环
    await evalJS2(`findRow(${P(f('a.yml'))}).click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('a.yml'))}`), 'C2 打开根 a.yml');
    await evalJS(`document.getElementById('nav-next').click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('c.yml'))}`), 'C3 ▼ → c.yml');
    await evalJS(`document.getElementById('nav-next').click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('d.yml'))}`), 'C4 ▼ → d.yml');
    await evalJS(`document.getElementById('nav-next').click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('a.yml'))}`), 'C5 ▼ 末尾循环回 a.yml');
    await evalJS(`document.getElementById('nav-prev').click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('d.yml'))}`), 'C6 ▲ 首部循环到 d.yml');

    // ---------- D. 刷新 ----------
    fs.writeFileSync(f('e.yml'), 'x: 1\n');
    await evalJS(`document.getElementById('fm-reload').click(); true;`).catch(() => {});
    check(await waitForJS(`(function () {
      var rows = document.querySelectorAll('.file-tree > li.tree-item .tree-label');
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].textContent === 'e.yml') return true;
      }
      return false;
    })()`), 'D1 ↻ 刷新后新文件 e.yml 出现');

    // 截图供人工查看
    await new Promise(r => setTimeout(r, 300));
    fs.mkdirSync(path.join(__dirname, '_ce_tmp'), { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '_ce_tmp', 'nav-v175.png'), img.toPNG());

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
