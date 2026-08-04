// v1.0.78 冒烟: 自研下拉组件 ce-select (设置页全部 select + 主页面类型选择) + 字体补全输入框 (系统字体检测)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('./main.js');
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'combo_fixture');
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

    // ---------- A. 主页面: 类型选择 select 升级 ----------
    check(await waitFor(`!!document.getElementById('interpreter-type-select')`), 'A0 原生 select 仍在 (兼容保留)');
    const a = await evalJS(`(function () {
      var sel = document.getElementById('interpreter-type-select');
      var trigger = sel.closest('body').querySelector('.ce-select-trigger');
      return {
        nativeHidden: getComputedStyle(sel).opacity === '0',
        triggerCount: document.querySelectorAll('.ce-select-trigger').length,
        value: sel.value,
        selected: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '',
      };
    })()`);
    check(a.nativeHidden, 'A1 原生 select 隐藏 (opacity 0)');
    check(a.triggerCount === 1, 'A2 主页面生成 1 个 ce-select trigger');

    // ---------- B. 设置页: 全部 select 升级 + 交互 ----------
    await evalJS(`document.querySelector('[data-menu="settings"] > .menu-trigger').click(); true;`).catch(() => {});
    await waitFor(`document.querySelector('[data-menu="settings"]').classList.contains('open')`);
    await evalJS(`document.querySelector('[data-menu="settings"] .menu-entry[data-action="settings"]').click(); true;`).catch(() => {});
    check(await waitFor(`document.getElementById('st-overlay').style.display === 'flex'`), 'B1 设置弹窗打开');
    check(await waitFor(`(function () {
      var fr = document.getElementById('st-frame');
      return fr && fr.contentDocument && fr.contentDocument.readyState === 'complete';
    })()`), 'B2 设置 iframe 加载完成');

    const b = await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var selects = doc.querySelectorAll('select');
      var triggers = doc.querySelectorAll('.ce-select-trigger');
      var hidden = Array.prototype.filter.call(selects, function (s) { return getComputedStyle(s).opacity === '0'; });
      return { selectCount: selects.length, triggerCount: triggers.length, hiddenCount: hidden.length };
    })()`);
    check(b.selectCount === b.triggerCount, 'B3 设置页每个 select 对应一个 trigger (' + b.selectCount + ')');
    check(b.hiddenCount === b.selectCount, 'B4 全部原生 select 隐藏');

    // B5 打开 theme 下拉 → 点击 dark → 原生 select.value 变化
    // B5: 等待 wrap 就绪后点击 (iframe 打开时会重载一次, 需容忍竞态)
    await (async function () {
      var t0 = Date.now();
      while (Date.now() - t0 < 8000) {
        try {
          var r = await win.webContents.executeJavaScript(`(function () {
            var doc = document.getElementById('st-frame').contentDocument;
            if (!doc) return 'noDoc';
            var themeSel = doc.getElementById('theme');
            if (!themeSel) return 'noThemeSel';
            var wrap = doc.querySelector('.ce-select[data-ce-for="theme"]');
            if (!wrap) return 'noWrap';
            var trigger = wrap.querySelector('.ce-select-trigger');
            if (!trigger) return 'noTrigger';
            trigger.click();
            return 'ok';
          })()`);
          if (r === 'ok') return;
          await new Promise(x => setTimeout(x, 150));
        } catch (e) { await new Promise(x => setTimeout(x, 150)); }
      }
    })();
    check(await waitFor(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var wrap = doc.querySelector('.ce-select[data-ce-for="theme"]');
      return wrap.querySelector('.ce-select-panel').classList.contains('open');
    })()`), 'B5 点击 trigger 展开面板');
    const b6 = await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var sel = doc.getElementById('theme');
      var wrap = doc.querySelector('.ce-select[data-ce-for="theme"]');
      return {
        options: wrap.querySelectorAll('.ce-select-option').length,
        selectedText: wrap.querySelector('.ce-select-option.selected') ? wrap.querySelector('.ce-select-option.selected').textContent : null,
        nativeValue: sel.value,
      };
    })()`);
    check(b6.options >= 2, 'B6 面板渲染选项 (' + b6.options + ' 个)');
    check(b6.selectedText !== null && b6.selectedText.length > 0, 'B7 当前选中项高亮');
    // 点击第二个选项
    await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var wrap = doc.querySelector('.ce-select[data-ce-for="theme"]');
      var opts = wrap.querySelectorAll('.ce-select-option');
      opts[1].click();
      return true;
    })()`);
    const b8 = await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var sel = doc.getElementById('theme');
      var wrap = doc.querySelector('.ce-select[data-ce-for="theme"]');
      return { value: sel.value, label: wrap.querySelector('.ce-select-value').textContent };
    })()`);
    check(b8.value !== 'dark' && b8.value.length > 0, 'B8 点击选项 → 原生 select.value 更新 (' + b8.value + ')');
    check(b8.label.length > 0, 'B9 trigger 显示同步 (' + b8.label + ')');

    // ---------- C. 字体补全输入框 ----------
    // C1 字体输入框存在
    const c1 = await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var ui = doc.getElementById('ui-font');
      var ed = doc.getElementById('editor-font-family');
      return {
        uiIsInput: ui.tagName === 'INPUT',
        edIsInput: ed.tagName === 'INPUT',
        uiCombo: ui.closest('.ce-combo') ? true : false,
      };
    })()`);
    check(c1.uiIsInput && c1.edIsInput, 'C1 字体设置为 input');
    check(c1.uiCombo, 'C2 ui-font 包在 .ce-combo 内');
    // C2 输入触发补全 (等待字体加载)
    await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var ui = doc.getElementById('ui-font');
      ui.value = '微软';
      ui.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    check(await waitFor(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var ui = doc.getElementById('ui-font');
      var panel = ui.closest('.ce-combo').querySelector('.ce-combo-panel');
      return panel.classList.contains('open') && panel.querySelectorAll('.ce-combo-option').length > 0;
    })()`, 15000), 'C3 输入"微软" → 补全面板出现匹配项');
    const c4 = await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var ui = doc.getElementById('ui-font');
      var panel = ui.closest('.ce-combo').querySelector('.ce-combo-panel');
      var first = panel.querySelector('.ce-combo-option');
      return { firstText: first ? first.textContent : null, hasPreview: first ? first.style.fontFamily.length > 0 : false, count: panel.querySelectorAll('.ce-combo-option').length };
    })()`);
    check(c4.firstText && c4.firstText.indexOf('微软') !== -1, 'C4 匹配项含微软雅黑 (got ' + c4.firstText + ')');
    check(c4.hasPreview, 'C5 选项带字体预览样式');
    // C3b 点击补全项 → input.value 设置
    await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var ui = doc.getElementById('ui-font');
      var panel = ui.closest('.ce-combo').querySelector('.ce-combo-panel');
      var first = panel.querySelector('.ce-combo-option');
      first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    const c6 = await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var ui = doc.getElementById('ui-font');
      return { value: ui.value, panelOpen: ui.closest('.ce-combo').querySelector('.ce-combo-panel').classList.contains('open') };
    })()`);
    check(c6.value.length > 0 && !c6.panelOpen, 'C6 点击补全项 → 值填入且面板关闭 (' + c6.value + ')');

    // ---------- D. 保存规范化 ----------
    await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var ui = doc.getElementById('ui-font');
      ui.value = 'Microsoft YaHei';
      ui.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await new Promise(r => setTimeout(r, 300));
    const d0 = await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      return doc.body.style.fontFamily;
    })()`);
    check(d0 === '"Microsoft YaHei"', 'D0 输入 change → 实时预览 (' + d0 + ')');
    await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var btn = doc.querySelector('.settings-save-btn') || doc.querySelector('#save-settings-btn');
      if (!btn) {
        var all = doc.querySelectorAll('button');
        for (var i = 0; i < all.length; i++) { if (/保存/.test(all[i].textContent)) { btn = all[i]; break; } }
      }
      if (btn) btn.click();
      return true;
    })()`);
    await new Promise(r => setTimeout(r, 800));
    const d1 = await evalJS(`(function () {
      var cfg = JSON.parse(localStorage.getItem('editorConfig') || '{}');
      return cfg.uiFont;
    })()`);
    check(d1 === "'Microsoft YaHei'", 'D1 保存时自动加引号 (got ' + d1 + ')');
    const d2 = await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      return doc.body.style.fontFamily;
    })()`);
    check(d2 === '"Microsoft YaHei"', 'D2 实时预览 body font-family (got ' + d2 + ')');

    // ---------- E. 搜索过滤 + 空态 ----------
    await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var wrap = doc.querySelector('.ce-select[data-ce-for="editor-theme"]');
      wrap.querySelector('.ce-select-trigger').click();
      return true;
    })()`);
    await waitFor(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      return doc.querySelector('.ce-select[data-ce-for="editor-theme"]').querySelector('.ce-select-panel').classList.contains('open');
    })()`);
    const e1 = await evalJS(`(function () {
      var doc = document.getElementById('st-frame').contentDocument;
      var sel = doc.getElementById('editor-theme');
      var wrap = doc.querySelector('.ce-select[data-ce-for="editor-theme"]');
      var search = wrap.querySelector('.ce-select-search');
      var hasSearch = !!search;
      if (search) {
        search.value = 'zzz-nonexistent';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { hasSearch: hasSearch, empty: wrap.querySelector('.ce-select-empty') ? wrap.querySelector('.ce-select-empty').textContent : null };
    })()`);
    check(e1.hasSearch, 'E1 多选项 select 显示搜索框');
    check(e1.empty === '无匹配项', 'E2 无匹配时显示空态 (' + e1.empty + ')');

    // Esc 关闭设置
    await evalJS(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true;`).catch(() => {});
    check(await waitFor(`document.getElementById('st-overlay').style.display === 'none'`, 4000), 'F1 Esc 关闭设置');

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
