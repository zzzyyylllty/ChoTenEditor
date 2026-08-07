// v1.0.79 冒烟: 编辑器内动态 select (cv-select 等) 自动升级为自研下拉 + 紧凑模式 + 渲染往返无残留
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('./main.js');
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'vis_fixture');
const f = (p) => path.join(FIXTURE, p);
const P = (p) => JSON.stringify(p);

fs.rmSync(FIXTURE, { recursive: true, force: true });
fs.mkdirSync(f('conversation'), { recursive: true });
fs.writeFileSync(f('conversation/demo.yml'), [
  '__option__:',
  '  theme: chat',
  '  title: 测试对话',
  '  flags:',
  '    - FORCE_LOOK',
  '',
  'npc:',
  '  id: test_npc',
  '',
].join('\n'));

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
      localStorage.removeItem('chemdahTypeOverrides');
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

    // ---------- A. 打开对话文件并进入可视化 ----------
    check(await waitFor(`document.querySelectorAll('.file-tree > li.tree-item').length === 1`), 'A0 项目树加载');
    await evalJS2(`findRow(${P(f('conversation'))}).click(); true;`).catch(() => {});
    check(await waitForJS(`!!findRow(${P(f('conversation/demo.yml'))})`), 'A0b 展开目录显示 demo.yml');
    await evalJS2(`findRow(${P(f('conversation/demo.yml'))}).click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('conversation/demo.yml'))}`), 'A1 文件已打开');
    await evalJS(`document.getElementById('visual-mode-btn').click(); true;`).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    const a2diag = await evalJS(`(function () {
      var ve = document.getElementById('visual-editor');
      var ceType = (typeof CraftEngineInterpreter !== 'undefined') ? CraftEngineInterpreter.detectFileType(codeMirrorEditor.getValue(), window.appState.currentFile) : 'n/a';
      var ov = (typeof ChemdahInterpreter !== 'undefined') ? ChemdahInterpreter.getTypeOverride(window.appState.currentFile) : 'n/a';
      return {
        ceType: ceType,
        override: ov,
        visual: ve.style.display,
        html: ve.innerHTML.slice(0, 300),
        selects: ve.querySelectorAll('select').length,
        cvSelects: ve.querySelectorAll('select.cv-select').length,
      };
    })()`);
    console.log('A2DIAG', JSON.stringify(a2diag));
    check(await waitForJS(`(function () {
      var ve = document.getElementById('visual-editor');
      return ve && ve.querySelectorAll('select').length >= 2;
    })()`), 'A2 可视化渲染出动态 select');

    // ---------- B. 动态 select 自动升级 ----------
    check(await waitForJS(`(function () {
      var ve = document.getElementById('visual-editor');
      return ve.querySelectorAll('.ce-select-trigger').length > 0;
    })()`), 'B1 动态 select 已升级为 ce-select');
    const b2 = await evalJS2(`(function () {
      var ve = document.getElementById('visual-editor');
      var sels = ve.querySelectorAll('select');
      var triggers = ve.querySelectorAll('.ce-select-trigger');
      var compact = ve.querySelectorAll('.ce-select-sm');
      var hidden = Array.prototype.filter.call(sels, function (s) { return getComputedStyle(s).opacity === '0'; }).length;
      var wraps = ve.querySelectorAll('.ce-select');
      return { selCount: sels.length, trigCount: triggers.length, compact: compact.length, hidden: hidden, wrapCount: wraps.length };
    })()`);
    check(b2.selCount === b2.trigCount, 'B2 select 与 trigger 一一对应 (' + b2.selCount + ')');
    check(b2.hidden === b2.selCount, 'B3 全部原生 select 隐藏');
    check(b2.compact >= b2.selCount - 1, 'B4 编辑器内 select 使用紧凑模式 (' + b2.compact + '/' + b2.selCount + ')');
    check(b2.wrapCount === b2.selCount, 'B5 wrap 数量无残留 (' + b2.wrapCount + ')');

    // ---------- C. 交互: 展开 theme 下拉 → 选择 → 值同步 ----------
    const c1 = await evalJS2(`(function () {
      var ve = document.getElementById('visual-editor');
      var wrap = ve.querySelector('.ce-select-sm[data-ce-for]') || ve.querySelector('.ce-select-sm');
      var sel = ve.querySelector('select.cv-select[data-field="options.theme"]');
      var w = sel ? sel.__ceWrap : null;
      return { hasWrap: !!w, theme: sel ? sel.value : null };
    })()`);
    check(c1.hasWrap && c1.theme === 'chat', 'C1 theme select 已包装且值为 chat');
    await evalJS2(`(function () {
      var ve = document.getElementById('visual-editor');
      var sel = ve.querySelector('select.cv-select[data-field="options.theme"]');
      sel.__ceWrap.querySelector('.ce-select-trigger').click();
      return true;
    })()`);
    check(await waitForJS(`(function () {
      var ve = document.getElementById('visual-editor');
      var sel = ve.querySelector('select.cv-select[data-field="options.theme"]');
      return sel.__ceWrap.querySelector('.ce-select-panel').classList.contains('open');
    })()`), 'C2 点击 trigger 展开面板');
    const c3 = await evalJS2(`(function () {
      var ve = document.getElementById('visual-editor');
      var sel = ve.querySelector('select.cv-select[data-field="options.theme"]');
      var wrap = sel.__ceWrap;
      return {
        opts: wrap.querySelectorAll('.ce-select-option').length,
        selected: wrap.querySelector('.ce-select-option.selected') ? wrap.querySelector('.ce-select-option.selected').textContent : null,
      };
    })()`);
    check(c3.opts >= 4, 'C3 面板渲染预设主题选项 (' + c3.opts + ')');
    check(c3.selected && c3.selected.indexOf('chat') !== -1, 'C4 当前选中项高亮 (' + c3.selected + ')');
    // 点击第三个选项 (chest)
    await evalJS2(`(function () {
      var ve = document.getElementById('visual-editor');
      var sel = ve.querySelector('select.cv-select[data-field="options.theme"]');
      var wrap = sel.__ceWrap;
      wrap.querySelectorAll('.ce-select-option')[2].click();
      return true;
    })()`);
    const c5 = await evalJS2(`(function () {
      var ve = document.getElementById('visual-editor');
      var sel = ve.querySelector('select.cv-select[data-field="options.theme"]');
      var wrap = sel.__ceWrap;
      return { value: sel.value, panelOpen: wrap.querySelector('.ce-select-panel').classList.contains('open'), label: wrap.querySelector('.ce-select-value').textContent };
    })()`);
    check(c5.value === 'chest', 'C5 点击选项 → 原生 select.value 更新 (' + c5.value + ')');
    check(!c5.panelOpen, 'C6 选择后面板关闭');
    check(c5.label.length > 0, 'C7 trigger 显示同步 (' + c5.label + ')');

    // ---------- D. 模式往返: 重新渲染无残留 ----------
    await evalJS(`document.getElementById('source-mode-btn').click(); true;`).catch(() => {});
    // 可视化有未同步更改时会弹确认框: 自动点"放弃"继续切换
    await (async function () {
      var t0 = Date.now();
      while (Date.now() - t0 < 5000) {
        try {
          var r = await win.webContents.executeJavaScript(`(function () {
            var b = document.getElementById('unsynced-discard') || document.getElementById('dirty-discard');
            if (b) { b.click(); return 'clicked'; }
            var ve = document.getElementById('visual-editor');
            if (!ve || !ve.classList.contains('active')) return 'hidden';
            return 'waiting';
          })()`);
          if (r === 'clicked' || r === 'hidden') break;
        } catch (e) {}
        await new Promise(x => setTimeout(x, 120));
      }
    })();
    check(await waitForJS(`(function () {
      var ve = document.getElementById('visual-editor');
      return ve && !ve.classList.contains('active');
    })()`), 'D1 切回源代码模式 (可视化隐藏)');
    const d2 = await evalJS2(`(function () {
      var ve = document.getElementById('visual-editor');
      return { wraps: ve.querySelectorAll('.ce-select').length, sels: ve.querySelectorAll('select').length };
    })()`);
    check(d2.wraps === d2.sels, 'D2 隐藏状态 wrap 与 select 数量一致 (' + d2.wraps + ' wraps)');
    await evalJS(`document.getElementById('visual-mode-btn').click(); true;`).catch(() => {});
    check(await waitForJS(`(function () {
      var ve = document.getElementById('visual-editor');
      return ve && ve.querySelectorAll('.ce-select-trigger').length > 0;
    })()`), 'D3 重新进入可视化 → 自动升级');
    const d4 = await evalJS2(`(function () {
      var ve = document.getElementById('visual-editor');
      return {
        wraps: ve.querySelectorAll('.ce-select').length,
        sels: ve.querySelectorAll('select').length,
        hidden: Array.prototype.filter.call(ve.querySelectorAll('select'), function (s) { return getComputedStyle(s).opacity === '0'; }).length,
      };
    })()`);
    check(d4.wraps === d4.sels && d4.hidden === d4.sels, 'D4 重新渲染后 select 全部升级且无残留 (' + d4.wraps + ' wraps / ' + d4.hidden + ' hidden)');

    // ---------- E. 保存后仍保持 ----------
    await new Promise(r => setTimeout(r, 200));
    const img = await win.webContents.capturePage().catch(() => null);
    if (img) fs.writeFileSync(path.join(__dirname, '_ce_tmp', 'vis-v179.png'), img.toPNG());

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
