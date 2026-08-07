// v1.0.77 冒烟: 设置页移除「关于」tab; Help→关于 显示富内容弹窗 (反馈渠道+作者卡片+版本)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('./main.js');
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'about_fixture');
const f = (p) => path.join(FIXTURE, p);
const P = (p) => JSON.stringify(p);

fs.rmSync(FIXTURE, { recursive: true, force: true });
fs.mkdirSync(FIXTURE, { recursive: true });
fs.writeFileSync(f('a.yml'), 'x: 1\n');

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

    // ---------- A. Help → 关于 富内容弹窗 ----------
    // 打开帮助菜单
    await evalJS(`(function () {
      var trig = document.querySelector('.menu-item-wrap[data-menu="help"] .menu-trigger');
      if (trig) trig.click();
      return true;
    })()`);
    await waitFor(`document.querySelector('.menu-item-wrap[data-menu="help"]').classList.contains('open')`);
    // 点击 关于
    await evalJS(`(function () {
      var wrap = document.querySelector('.menu-item-wrap[data-menu="help"]');
      var item = wrap.querySelector('.menu-entry[data-action="about"]');
      if (item) item.click();
      return true;
    })()`);
    check(await waitFor(`!!document.querySelector('.ui-overlay .about-modal')`), 'A1 关于弹窗出现 (.about-modal)');
    const a = await evalJS(`(function () {
      var modal = document.querySelector('.about-modal');
      var title = modal.querySelector('.ui-modal-title').textContent;
      var rows = modal.querySelectorAll('.about-feedback-row').length;
      var img = modal.querySelector('.about-author img');
      var ok = modal.querySelector('.ui-modal-actions .ui-btn-primary');
      return {
        title: title,
        rows: rows,
        hasImg: !!img,
        imgSrc: img ? img.getAttribute('src') : null,
        hasOk: !!ok,
        versionOk: /Choten Editor v\\d+\\.\\d+\\.\\d+/.test(title),
      };
    })()`);
    check(a.versionOk, 'A2 标题含版本号 (got ' + a.title + ')');
    check(a.rows === 3, 'A3 反馈渠道 3 行 (QQ群/Discord/QQ, got ' + a.rows + ')');
    check(a.hasImg && a.imgSrc === 'images/author.png', 'A4 作者卡片图片 (got ' + a.imgSrc + ')');
    check(a.hasOk, 'A5 确定按钮存在');
    // 点击第一个反馈按钮不应抛错 (openExternal 不在此环境测试, 仅验证绑定存在)
    const a6 = await evalJS(`(function () {
      var btn = document.querySelector('.about-feedback-row .ui-btn');
      return !!btn && !!btn.textContent;
    })()`);
    check(a6, 'A6 反馈按钮存在且带文案');
    // Esc 关闭 (真实按键从聚焦元素冒泡到 overlay; 测试派发到 overlay 本身)
    await win.webContents.executeJavaScript(`(function () {
      var ov = document.querySelector('.about-modal').closest('.ui-overlay');
      ov.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    })()`);
    check(await waitFor(`!document.querySelector('.ui-overlay .about-modal')`, 4000), 'A7 Esc 关闭弹窗');

    // ---------- B. 设置页无「关于」tab ----------
    await evalJS(`document.querySelector('.menu-item-wrap[data-menu="settings"] .menu-trigger').click(); true;`).catch(() => {});
    await waitFor(`document.querySelector('.menu-item-wrap[data-menu="settings"]').classList.contains('open')`);
    await evalJS(`(function () {
      var wrap = document.querySelector('.menu-item-wrap[data-menu="settings"]');
      var item = wrap.querySelector('.menu-entry[data-action="settings"]');
      if (item) item.click();
      return true;
    })()`);
    check(await waitFor(`!!document.getElementById('st-overlay') && getComputedStyle(document.getElementById('st-overlay')).display !== 'none'`), 'B1 设置弹窗打开');
    // 等 iframe 加载完成 (URL 必须是 settings.html, 排除无 src 时的 about:blank 竞态)
    check(await waitFor(`(function () {
      var fr = document.getElementById('st-frame');
      return !!fr && fr.contentDocument &&
        fr.contentDocument.readyState === 'complete' &&
        fr.contentDocument.URL.indexOf('settings.html') !== -1;
    })()`), 'B2 设置 iframe 加载完成');
    const b = await evalJS(`(function () {
      var fr = document.getElementById('st-frame');
      var doc = fr.contentDocument;
      var tabs = Array.prototype.slice.call(doc.querySelectorAll('.settings-nav-item')).map(function (b) { return b.dataset.tab; });
      var aboutPanel = doc.querySelector('.settings-panel[data-panel="about"]');
      return { tabs: tabs.join(','), hasAbout: !!aboutPanel };
    })()`);
    check(b.tabs.indexOf('about') === -1, 'B3 设置导航无 about tab (got ' + b.tabs + ')');
    check(b.tabs.indexOf('experimental') !== -1, 'B4 实验性 tab 仍在');
    check(!b.hasAbout, 'B5 无 about panel');
    // Esc 关闭设置
    await win.webContents.executeJavaScript(`(function () {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    })()`);
    check(await waitFor(`!document.getElementById('st-overlay') || getComputedStyle(document.getElementById('st-overlay')).display === 'none'`, 4000), 'B6 Esc 关闭设置弹窗');

    // 截图供人工查看
    await evalJS(`document.querySelector('.menu-item-wrap[data-menu="help"] .menu-trigger').click(); true;`).catch(() => {});
    await waitFor(`document.querySelector('.menu-item-wrap[data-menu="help"]').classList.contains('open')`);
    await evalJS(`document.querySelector('.menu-item-wrap[data-menu="help"] .menu-entry[data-action="about"]').click(); true;`).catch(() => {});
    await waitFor(`!!document.querySelector('.ui-overlay .about-modal')`);
    await new Promise(r => setTimeout(r, 300));
    fs.mkdirSync(path.join(__dirname, '_ce_tmp'), { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '_ce_tmp', 'about-v177.png'), img.toPNG());

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
