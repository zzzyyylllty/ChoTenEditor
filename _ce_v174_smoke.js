// v1.0.74 冒烟: 实验性功能开关 (设置 → 实验性)
//  1. 默认未启用: 菜单点击 远程模式/AI 制作 → 弹警告 (UI.alert), 面板不打开
//  2. 设置页新增「实验性」tab: 红色高亮警告 + 两个开关, 勾选保存 → editorConfig.experimental 写入
//  3. 启用后: 菜单点击 → 面板正常打开
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

    // 注入状态并重载: 跳过欢迎弹窗 + 指向 fixture 项目 (无 experimental 配置 → 默认未启用)
    await win.webContents.executeJavaScript(`(function () {
      var v = (window.electronAPI && window.electronAPI.appVersion) || '1.0.0';
      sessionStorage.setItem('welcomeShown', v);
      localStorage.setItem('welcomeDismissed', v);
      localStorage.setItem('editorConfig', JSON.stringify({ language: 'zh_cn', theme: 'dark', editor: { theme: 'dracula', fontSize: '14' } }));
      localStorage.setItem('appState', JSON.stringify({ currentProjectPath: ${P(FIXTURE)}, currentFile: null, openTabs: [], activeTab: null }));
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

    // ---------- A. 未启用: 菜单点击弹警告, 面板不打开 ----------
    await evalJS(`document.querySelector('[data-menu="settings"] > .menu-trigger').click(); true;`).catch(() => {});
    check(await waitFor(`document.querySelector('[data-menu="settings"]').classList.contains('open')`), 'A1a 设置菜单展开');
    await evalJS(`document.querySelector('.menu-entry[data-action="remote"]').click(); true;`).catch(() => {});
    check(await waitFor(`(function () {
      var o = document.querySelector('.ui-overlay.show');
      return o && o.querySelector('.ui-modal-body').textContent.indexOf('实验性') !== -1;
    })()`), 'A1b 点击远程模式 → 警告弹窗(含「实验性」)');
    const a1c = await evalJS(`document.getElementById('rm-overlay') ? getComputedStyle(document.getElementById('rm-overlay')).display : 'missing'`);
    check(a1c === 'none', 'A1c 远程面板未打开 (display=' + a1c + ')');
    await evalJS(`document.querySelector('.ui-overlay.show .ui-btn-primary').click(); true;`).catch(() => {});
    check(await waitFor(`!document.querySelector('.ui-overlay.show')`), 'A1d 确定关闭警告');

    await evalJS(`document.querySelector('[data-menu="settings"] > .menu-trigger').click(); true;`).catch(() => {});
    await evalJS(`document.querySelector('.menu-entry[data-action="ai"]').click(); true;`).catch(() => {});
    check(await waitFor(`(function () {
      var o = document.querySelector('.ui-overlay.show');
      return o && o.querySelector('.ui-modal-body').textContent.indexOf('AI Studio') !== -1;
    })()`), 'A2a 点击 AI 制作 → 警告弹窗(含 AI Studio)');
    const a2b = await evalJS(`document.getElementById('ai-panel-overlay') ? document.getElementById('ai-panel-overlay').style.display : 'missing'`);
    check(a2b === 'missing' || a2b === 'none', 'A2b AI 面板未打开 (' + a2b + ')');
    await evalJS(`document.querySelector('.ui-overlay.show .ui-btn-primary').click(); true;`).catch(() => {});
    await waitFor(`!document.querySelector('.ui-overlay.show')`);

    // ---------- B. 设置页实验性栏 ----------
    await evalJS(`document.querySelector('[data-menu="settings"] > .menu-trigger').click(); true;`).catch(() => {});
    await evalJS(`document.querySelector('.menu-entry[data-action="settings"]').click(); true;`).catch(() => {});
    check(await waitFor(`document.getElementById('st-overlay').style.display !== 'none'`), 'B1 设置弹窗打开');
    check(await waitFor(`(function () {
      var f = document.getElementById('st-frame');
      return f && f.contentDocument && f.contentDocument.readyState === 'complete' &&
        f.contentDocument.URL.indexOf('settings.html') !== -1;
    })()`), 'B2 iframe 加载完成');
    await evalJS(`(function () {
      var f = document.getElementById('st-frame');
      var btn = f.contentDocument.querySelector('.settings-nav-item[data-tab="experimental"]');
      if (btn) btn.click();
      return !!btn;
    })()`).catch(() => {});
    check(await waitFor(`(function () {
      var f = document.getElementById('st-frame');
      var d = f.contentDocument;
      return d.querySelector('.settings-panel[data-panel="experimental"]').classList.contains('active');
    })()`), 'B3 实验性 tab 可切换');
    const b4 = await evalJS(`(function () {
      var f = document.getElementById('st-frame');
      var d = f.contentDocument;
      var warn = d.querySelector('.experimental-warning');
      return {
        hasWarn: !!warn,
        warnText: warn ? warn.textContent : '',
        hasRemote: !!d.getElementById('experimental-remote'),
        hasAi: !!d.getElementById('experimental-ai-studio'),
      };
    })()`);
    check(b4.hasWarn && b4.warnText.indexOf('仅供开发人员使用') !== -1, 'B4 实验性面板含高亮警告 (hasWarn=' + b4.hasWarn + ', text=' + JSON.stringify(b4.warnText.slice(0, 20)) + '…)');
    check(b4.hasRemote && b4.hasAi, 'B5 两个开关存在 (remote=' + b4.hasRemote + ', ai=' + b4.hasAi + ')');
    // 勾选并保存
    await evalJS(`(function () {
      var f = document.getElementById('st-frame');
      var d = f.contentDocument;
      d.getElementById('experimental-remote').checked = true;
      d.getElementById('experimental-ai-studio').checked = true;
      d.getElementById('save-settings').click();
      return true;
    })()`).catch(() => {});
    check(await waitFor(`(function () {
      try {
        var cfg = JSON.parse(localStorage.getItem('editorConfig') || '{}');
        var exp = cfg.experimental || {};
        return exp.remote === true && exp.aiStudio === true;
      } catch (e) { return false; }
    })()`), 'B6 保存后 editorConfig.experimental 已写入');
    const b7 = await evalJS(`document.getElementById('st-overlay').style.display`);
    check(b7 !== 'none', 'B7 保存后弹窗保持打开 (等待用户继续操作)');
    await evalJS(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true;`).catch(() => {});
    check(await waitFor(`document.getElementById('st-overlay').style.display === 'none'`), 'B8 Esc 关闭设置弹窗');

    // ---------- C. 启用后面板正常打开 ----------
    await evalJS(`document.querySelector('[data-menu="settings"] > .menu-trigger').click(); true;`).catch(() => {});
    await evalJS(`document.querySelector('.menu-entry[data-action="remote"]').click(); true;`).catch(() => {});
    check(await waitFor(`getComputedStyle(document.getElementById('rm-overlay')).display !== 'none'`), 'C1 启用后点击远程模式 → 面板打开');
    await evalJS(`document.getElementById('rm-overlay').style.display = 'none'; true;`).catch(() => {});
    await evalJS(`document.querySelector('[data-menu="settings"] > .menu-trigger').click(); true;`).catch(() => {});
    await evalJS(`document.querySelector('.menu-entry[data-action="ai"]').click(); true;`).catch(() => {});
    check(await waitFor(`(function () {
      var o = document.getElementById('ai-panel-overlay');
      return o && o.style.display === 'flex';
    })()`), 'C2 启用后点击 AI 制作 → 面板打开');
    await evalJS(`AIPanel.close(); true;`).catch(() => {});

    // 截图供人工查看
    await evalJS(`document.querySelector('[data-menu="settings"] > .menu-trigger').click(); true;`).catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    fs.mkdirSync(path.join(__dirname, '_ce_tmp'), { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '_ce_tmp', 'exp-v174.png'), img.toPNG());

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
