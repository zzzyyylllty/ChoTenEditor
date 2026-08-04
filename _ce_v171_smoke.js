// v1.0.71 冒烟: 菜单栏 (文件/编辑/调试/设置/帮助) + 最近打开历史
//  1. 菜单栏渲染: 5 个菜单项; header 仅剩 source/visual; 旧按钮消失
//  2. 文件菜单展开/外部点击关闭
//  3. 最近打开: openProjectPath/openFile 记录到 localStorage; 子菜单渲染条目
//  4. 历史点击直接打开
//  5. 设置菜单 → iframe 弹窗
//  6. 编辑菜单 execCommand
//  7. 调试菜单占位 disabled
//  8. Esc 关闭菜单; 最近打开子菜单点击展开
//  9. 快捷键提示填充 (保存 Ctrl+S)
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

const H = 'function findRow(p){var r=document.querySelectorAll(".tree-row");for(var i=0;i<r.length;i++){if(r[i].dataset.path===p)return r[i];}return null;}';

// 重建 fixture (幂等)
fs.rmSync(FIXTURE, { recursive: true, force: true });
fs.mkdirSync(f('dir1'), { recursive: true });
fs.writeFileSync(f('a.yml'), 'items:\n  default:a:\n    material: paper\n');
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
        try { v = await win.webContents.executeJavaScript(H + expr); } catch (e) { v = false; }
        if (v) return true;
        await new Promise(r => setTimeout(r, step));
      }
      return false;
    }
    async function evalJS(expr) {
      return win.webContents.executeJavaScript(H + expr);
    }

    // ---------- A. 菜单栏渲染 ----------
    check(await waitFor(`document.querySelectorAll('.menu-trigger').length === 5`), 'A1 菜单栏 5 个菜单项');
    const a = await evalJS(`(function () {
      var triggers = Array.prototype.slice.call(document.querySelectorAll('.menu-trigger')).map(function (t) { return t.textContent; });
      return {
        triggers: triggers.join(','),
        srcBtn: !!document.getElementById('source-mode-btn'),
        visBtn: !!document.getElementById('visual-mode-btn'),
        oldSettings: !!document.getElementById('settings-btn'),
        oldOpen: !!document.getElementById('open-project-btn'),
        oldAi: !!document.getElementById('ai-btn'),
        modeRow: document.getElementById('visual-mode-btn') ? document.getElementById('visual-mode-btn').closest('.header-controls').children.length : -1,
      };
    })()`);
    check(a.triggers === '文件,编辑,调试,设置,帮助', 'A2 菜单项名称: ' + a.triggers);
    check(a.srcBtn && a.visBtn, 'A3 header 保留 source/visual 按钮');
    check(!a.oldSettings && !a.oldOpen && !a.oldAi, 'A4 旧按钮 (设置/打开项目/AI) 已移除');
    check(a.modeRow === 2, 'A5 header 只剩模式按钮 (' + a.modeRow + ')');

    // ---------- B. 文件菜单展开 / 外部点击关闭 ----------
    await evalJS(`document.querySelector('[data-menu="file"] > .menu-trigger').click(); true;`).catch(() => {});
    const b = await evalJS(`(function () {
      var wrap = document.querySelector('[data-menu="file"]');
      return {
        open: wrap.classList.contains('open'),
        actions: Array.prototype.slice.call(wrap.querySelectorAll('.menu-entry[data-action]')).map(function (e) { return e.dataset.action; }).join(','),
        keySave: (function () { var s = wrap.querySelector('.menu-entry[data-action="save"] .menu-key'); return s ? s.textContent : ''; })(),
        recentPanel: !!document.getElementById('menu-recent-panel'),
      };
    })()`);
    check(b.open, 'B1 点击「文件」→ 菜单展开');
    check(b.actions === 'new-file,open-file,open-project,recent,save,close-tab,close-all-tabs', 'B2 文件菜单条目: ' + b.actions);
    check(b.keySave === 'Ctrl+S', 'B3 保存快捷键提示: ' + b.keySave);
    check(b.recentPanel, 'B4 最近打开子菜单面板存在');
    await evalJS(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); true;`).catch(() => {});
    check(await waitFor(`!document.querySelector('[data-menu="file"]').classList.contains('open')`), 'B5 外部点击关闭菜单');

    // ---------- B6. hover 菜单间切换 (File → Edit) ----------
    await evalJS(`document.querySelector('[data-menu="file"] > .menu-trigger').click(); true;`).catch(() => {});
    await waitFor(`document.querySelector('[data-menu="file"]').classList.contains('open')`);
    const b6pos = await evalJS(`(function () {
      var el = document.querySelector('[data-menu="edit"] > .menu-trigger');
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(b6pos.x), y: Math.round(b6pos.y) });
    check(await waitFor(`(function () {
      var f = document.querySelector('[data-menu="file"]');
      var e = document.querySelector('[data-menu="edit"]');
      return e.classList.contains('open') && !f.classList.contains('open') && document.querySelectorAll('.menu-item-wrap.open').length === 1;
    })()`), 'B6 hover File→Edit 切换, 仅 Edit 展开');
    await evalJS(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true;`).catch(() => {});

    // ---------- C. 最近打开记录 ----------
    await evalJS(`openProjectPath(${P(FIXTURE)}); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentProjectPath === ${P(FIXTURE)}`), 'C1 openProjectPath 打开项目');
    check(await waitFor(`(function () {
      var list = JSON.parse(localStorage.getItem('ceRecentProjects') || '[]');
      return list.length === 1 && list[0].path === ${P(FIXTURE)};
    })()`), 'C2 最近项目已记录');
    // 打开文件 a.yml → 最近文件记录
    await evalJS(`findRow(${P(f('a.yml'))}).click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('a.yml'))}`), 'C3 打开文件 a.yml');
    check(await waitFor(`(function () {
      var list = JSON.parse(localStorage.getItem('ceRecentFiles') || '[]');
      return list.length === 1 && list[0].path === ${P(f('a.yml'))};
    })()`), 'C4 最近文件已记录');
    // 展开文件菜单 → 子菜单渲染条目
    await evalJS(`document.querySelector('[data-menu="file"] > .menu-trigger').click(); true;`).catch(() => {});
    check(await waitFor(`document.querySelectorAll('#menu-recent-panel .recent-item').length === 2`), 'C5 最近打开子菜单渲染 2 条目');
    const c3 = await evalJS(`(function () {
      var items = Array.prototype.slice.call(document.querySelectorAll('#menu-recent-panel .recent-item'));
      return {
        labels: items.map(function (i) { return i.textContent + ':' + i.dataset.recentType; }).join(','),
        groupTitles: Array.prototype.slice.call(document.querySelectorAll('#menu-recent-panel .menu-group-title')).map(function (g) { return g.textContent; }).join(','),
      };
    })()`);
    check(c3.labels === 'tree_fixture:project,a.yml:file', 'C6 子菜单条目类型: ' + c3.labels);
    check(c3.groupTitles === '最近项目,最近文件', 'C7 分组标题: ' + c3.groupTitles);

    // ---------- C8. hover 最近打开 → 子菜单面板显示 ----------
    const c8pos = await evalJS(`(function () {
      var el = document.querySelector('.menu-submenu > .menu-entry[data-action="recent"]');
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(c8pos.x), y: Math.round(c8pos.y) });
    check(await waitFor(`getComputedStyle(document.getElementById('menu-recent-panel')).display === 'block'`), 'C8 hover 最近打开 → 子菜单面板显示');

    // ---------- D. 历史点击打开 ----------
    await evalJS(`(function () {
      var p = document.querySelector('#menu-recent-panel .recent-item[data-recent-type="project"]');
      p.click();
      return true;
    })()`);
    check(await waitFor(`window.appState.currentProjectPath === ${P(FIXTURE)} && !document.querySelector('[data-menu="file"]').classList.contains('open')`), 'D1 点击最近项目 → 打开项目且菜单关闭');

    // ---------- E. 设置菜单 → iframe 弹窗 ----------
    await evalJS(`document.querySelector('[data-menu="settings"] > .menu-trigger').click(); true;`).catch(() => {});
    const e1 = await evalJS(`(function () {
      var wrap = document.querySelector('[data-menu="settings"]');
      var actions = Array.prototype.slice.call(wrap.querySelectorAll('.menu-entry[data-action]')).map(function (e) { return e.dataset.action; }).join(',');
      return { open: wrap.classList.contains('open'), actions: actions };
    })()`);
    check(e1.open && e1.actions === 'settings,remote,ai', 'E1 设置菜单: ' + e1.actions);
    await evalJS(`document.querySelector('.menu-entry[data-action="settings"]').click(); true;`).catch(() => {});
    check(await waitFor(`(function () {
      var o = document.getElementById('st-overlay');
      return o && o.style.display !== 'none' && document.getElementById('st-frame').src.indexOf('settings.html') !== -1;
    })()`), 'E2 点击设置 → 弹窗显示且 src 含 settings.html');
    await evalJS(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true;`).catch(() => {});
    check(await waitFor(`document.getElementById('st-overlay').style.display === 'none'`), 'E3 Esc 关闭设置弹窗');

    // ---------- F. 编辑菜单 ----------
    await evalJS(`document.querySelector('[data-menu="edit"] > .menu-trigger').click(); true;`).catch(() => {});
    const f1 = await evalJS(`(function () {
      var wrap = document.querySelector('[data-menu="edit"]');
      var actions = Array.prototype.slice.call(wrap.querySelectorAll('.menu-entry[data-action]')).map(function (e) { return e.dataset.action; }).join(',');
      return { open: wrap.classList.contains('open'), actions: actions };
    })()`);
    check(f1.open && f1.actions === 'undo,redo,cut,copy,paste,select-all', 'F1 编辑菜单: ' + f1.actions);
    const f2 = await evalJS(`(function () {
      try {
        window.codeMirrorEditor.focus();
        window.codeMirrorEditor.execCommand('selectAll');
        return true;
      } catch (e) { return String(e); }
    })()`);
    check(f2 === true, 'F2 execCommand(selectAll) 不抛错');
    await evalJS(`document.querySelector('[data-menu="edit"] > .menu-trigger').click(); true;`).catch(() => {});

    // ---------- G. 调试菜单占位 ----------
    await evalJS(`document.querySelector('[data-menu="debug"] > .menu-trigger').click(); true;`).catch(() => {});
    const g = await evalJS(`(function () {
      var entry = document.querySelector('[data-menu="debug"] .menu-entry');
      return { open: document.querySelector('[data-menu="debug"]').classList.contains('open'), disabled: !!entry.disabled };
    })()`);
    check(g.open && g.disabled, 'G1 调试菜单展开且占位项 disabled');

    // ---------- H. Esc 关闭菜单 ----------
    await evalJS(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true;`).catch(() => {});
    check(await waitFor(`document.querySelectorAll('.menu-item-wrap.open').length === 0`), 'H1 Esc 关闭全部菜单');

    // ---------- I. 帮助菜单 ----------
    await evalJS(`document.querySelector('[data-menu="help"] > .menu-trigger').click(); true;`).catch(() => {});
    const i1 = await evalJS(`(function () {
      var wrap = document.querySelector('[data-menu="help"]');
      return { open: wrap.classList.contains('open'), about: !!wrap.querySelector('.menu-entry[data-action="about"]') };
    })()`);
    check(i1.open && i1.about, 'I1 帮助菜单含关于条目');

    // 截图供人工查看
    await evalJS(`document.querySelector('[data-menu="file"] > .menu-trigger').click(); true;`).catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    fs.mkdirSync(path.join(__dirname, '_ce_tmp'), { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '_ce_tmp', 'menu-v171.png'), img.toPNG());

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
