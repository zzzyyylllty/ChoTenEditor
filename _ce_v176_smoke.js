// v1.0.76 冒烟: 文件树按扩展名图标 (yml📄/png🖼/zip📦/js📜/json⚙/无扩展名📄/目录📁) + 导航按钮 SVG 化
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('./main.js');
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'icon_fixture');
const f = (p) => path.join(FIXTURE, p);
const P = (p) => JSON.stringify(p);

fs.rmSync(FIXTURE, { recursive: true, force: true });
fs.mkdirSync(f('dir1'), { recursive: true });
fs.writeFileSync(f('a.yml'), 'x: 1\n');
fs.writeFileSync(f('pic.png'), 'x');
fs.writeFileSync(f('arch.zip'), 'x');
fs.writeFileSync(f('script.js'), 'x');
fs.writeFileSync(f('notes.txt'), 'x');
fs.writeFileSync(f('settings.json'), 'x');
fs.writeFileSync(f('noext'), 'x');

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
    const H = 'function findRow(p){var r=document.querySelectorAll(".tree-row");for(var i=0;i<r.length;i++){if(r[i].dataset.path===p)return r[i];}return null;}';
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

    // ---------- A. 图标映射 ----------
    check(await waitFor(`document.querySelectorAll('.file-tree > li.tree-item').length === 8`), 'A1 根渲染 8 行');
    const a = await evalJS(`(function () {
      var rows = Array.prototype.slice.call(document.querySelectorAll('.file-tree > li.tree-item'));
      var out = {};
      rows.forEach(function (li) {
        var label = li.querySelector('.tree-label').textContent;
        var icon = li.querySelector('.tree-icon');
        out[label] = icon.querySelector('img.ce-emoji') ? icon.querySelector('img.ce-emoji').alt : (icon.textContent || '');
      });
      return out;
    })()`);
    check(a['dir1'] === '📁', 'A2 目录 → 📁 (got ' + a['dir1'] + ')');
    check(a['a.yml'] === '📄', 'A3 yml 保持原图标 → 📄 (got ' + a['a.yml'] + ')');
    check(a['pic.png'] === '🖼', 'A4 png → 🖼 (got ' + a['pic.png'] + ')');
    check(a['arch.zip'] === '📦', 'A5 zip → 📦 (got ' + a['arch.zip'] + ')');
    check(a['script.js'] === '📜', 'A6 js → 📜 (got ' + a['script.js'] + ')');
    check(a['notes.txt'] === '📄', 'A7 txt → 📄 (got ' + a['notes.txt'] + ')');
    check(a['settings.json'] === '⚙', 'A8 json → ⚙ (got ' + a['settings.json'] + ')');
    check(a['noext'] === '📄', 'A9 无扩展名 → 📄 (got ' + a['noext'] + ')');

    // ---------- B. 导航按钮 SVG 化 ----------
    const b = await evalJS(`(function () {
      var ids = ['nav-back', 'nav-forward', 'nav-prev', 'nav-next', 'fm-reload'];
      var out = {};
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        out[id] = { svg: !!el.querySelector('svg'), char: (el.textContent || '').trim() };
      });
      return out;
    })()`);
    let bOk = true;
    Object.keys(b).forEach(function (id) {
      if (!b[id].svg || b[id].char) bOk = false;
    });
    check(bOk, 'B1 5 个按钮均为 SVG 图标且无残留字符');
    check(b['nav-back'].svg, 'B2 nav-back 含 svg');
    const b3 = await evalJS(`(function () {
      var bb = document.getElementById('nav-back');
      var fw = document.getElementById('nav-forward');
      return { backDisabled: bb.disabled, fwdDisabled: fw.disabled };
    })()`);
    check(b3.backDisabled && b3.fwdDisabled, 'B3 ◀▶ 初始 disabled');
    const b4 = await evalJS(`(function () {
      var acts = document.getElementById('fm-actions');
      var acs = getComputedStyle(acts);
      var btn = document.getElementById('nav-back');
      var bcs = getComputedStyle(btn);
      var svg = btn.querySelector('svg');
      var scs = getComputedStyle(svg);
      return {
        bg: acs.backgroundColor !== 'rgba(0, 0, 0, 0)',
        border: acs.borderWidth !== '0px',
        radius: acs.borderRadius,
        btnW: bcs.width,
        btnR: bcs.borderRadius,
        svgW: scs.width,
      };
    })()`);
    check(b4.bg && b4.border, 'B4 按钮组容器有背景+边框 (bg=' + b4.bg + ' border=' + b4.border + ')');
    check(b4.radius === '6px', 'B5 容器圆角 6px (got ' + b4.radius + ')');
    check(b4.btnW === '26px', 'B6 按钮宽 26px (got ' + b4.btnW + ')');
    check(b4.svgW === '14px', 'B7 SVG 图标 14px (got ' + b4.svgW + ')');

    // ---------- C. 图标按钮仍可导航 ----------
    await evalJS2(`findRow(${P(f('a.yml'))}).click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('a.yml'))}`), 'C1 点击 yml 打开');
    await evalJS(`document.getElementById('nav-next').click(); true;`).catch(() => {});
    // 目录优先排序: dir1, a.yml, arch.zip, noext, notes.txt, pic.png, script.js; a.yml 后一个文件 = arch.zip
    check(await waitFor(`window.appState.currentFile === ${P(f('arch.zip'))}`), 'C2 ▼ → arch.zip (相邻文件循环)');
    await evalJS(`document.getElementById('nav-back').click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('a.yml'))}`), 'C3 ◀ 回 a.yml (历史)');

    // 截图供人工查看
    await new Promise(r => setTimeout(r, 300));
    fs.mkdirSync(path.join(__dirname, '_ce_tmp'), { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '_ce_tmp', 'icons-v176.png'), img.toPNG());
    fs.writeFileSync(path.join(__dirname, '_ce_tmp', 'icons-v176.jpg'), img.toJPEG(80));

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
