// v1.0.25 验证: popup 弹窗编辑器 (sounds/state/states 弹窗化)
// 场景: 渲染 block 文件 → 断言摘要 → 弹窗内修改 → 确定写回+摘要更新+源码同步; 取消不改数据
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

ipcMain.on('app:getVersionSync', (event) => { event.returnValue = require('./package.json').version; });
ipcMain.handle('fs:readFile', async () => ({ success: false }));
ipcMain.handle('fs:readdir', async () => ({ success: true, files: [] }));
ipcMain.handle('app:getPath', async () => __dirname);
ipcMain.handle('ce:resolveProjectRoot', async () => ({ found: false }));
ipcMain.handle('fs:writeFile', async () => ({ success: true }));
ipcMain.handle('fs:exists', async () => true);

const FILE = 'E:/MC/tra/Ets/plugins/CraftEngine/resources/kangelblock/blocks/test_block.yml';
const yaml = `blocks:
  default:test_block:
    state:
      auto_state: minecraft:flower
    states:
      properties:
        facing:
          type: direction
          default: east
    settings:
      sounds:
        place: minecraft:block.wool.place
    behavior:
      type: bouncing_block
      bounce_height: 2
`;

function js(win, code) {
  return win.webContents.executeJavaScript(code).catch(function (e) { return 'EXEC-ERR: ' + String(e); });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1400, height: 900,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.webContents.on('console-message', (e, level, message) => {
    if (/Error|error|ERR|unhandled/.test(message)) console.log('  [page]', message.slice(0, 200));
  });
  await win.loadFile(path.join(__dirname, 'index.html'));
  await sleep(2500);

  await js(win, `
    (function () {
      currentFile = ${JSON.stringify(FILE)};
      _fileContents[currentFile] = ${JSON.stringify(yaml)};
      _loadingFile = true;
      codeMirrorEditor.setValue(${JSON.stringify(yaml)});
      _loadingFile = false;
      delete dirtyTabs[currentFile];
      window.__keAutoSync = true;
      document.getElementById('visual-mode-btn').click();
      return 'ok';
    })()
  `);
  await sleep(1200);

  const summary = `
    (function () {
      function pop(p) {
        var btn = document.querySelector('[data-sf-action="popup-edit"][data-sf-path="' + p + '"]');
        if (!btn) return null;
        var root = btn.closest('.ce-sf-popup');
        return root ? root.querySelector('.ce-sf-popup-summary').textContent : null;
      }
      return JSON.stringify({
        state: pop('state'),
        states: pop('states'),
        sounds: pop('settings.sounds'),
        clearBtns: document.querySelectorAll('[data-sf-action="popup-clear"]').length,
        stateContentInline: !!document.querySelector('[data-sf-path="state.auto_state"]'),
      });
    })()
  `;
  const a0 = await js(win, summary);
  console.log('A0 摘要:', a0);
  const a0j = JSON.parse(a0);
  const ok0 = a0j.state.indexOf('auto_state: minecraft:flower') !== -1 &&
    a0j.states.indexOf('properties: 1 项') !== -1 &&
    a0j.sounds.indexOf('place: minecraft:block.wool.place') !== -1 &&
    a0j.clearBtns === 3 && a0j.stateContentInline === false;

  // A1: 打开 sounds 弹窗, 不改直接确定 → 数据不变
  await js(win, `(function(){ document.querySelector('[data-sf-action="popup-edit"][data-sf-path="settings.sounds"]').click(); return 'ok'; })()`);
  await sleep(400);
  const a1 = await js(win, `
    (function () {
      var m = document.getElementById('ce-popup-modal');
      return JSON.stringify({
        modal: !!m,
        union: !!document.querySelector('[data-sf-path="__popup__.place"][data-sf-action="union-set"]'),
        input: !!document.querySelector('[data-sf-path="__popup__.place"][data-sf-kind="field"]'),
      });
    })()
  `);
  console.log('A1 弹窗打开:', a1);
  const a1j = JSON.parse(a1);
  const ok1 = a1j.modal && a1j.union && a1j.input;

  await js(win, `(function(){ document.querySelector('[data-ce-popup="ok"]').click(); return 'ok'; })()`);
  await sleep(400);
  const a1b = await js(win, `
    (function () {
      var p = document.getElementById('visual-editor')._ceParsed;
      return JSON.stringify({
        modalGone: !document.getElementById('ce-popup-modal'),
        sounds: p.sections[0].entries[0].data.settings.sounds,
      });
    })()
  `);
  console.log('A1b 直接确定:', a1b);
  const a1bj = JSON.parse(a1b);
  const ok1b = a1bj.modalGone && a1bj.sounds && a1bj.sounds.place === 'minecraft:block.wool.place';

  // A2: 弹窗内 place 切 map 形式, 设置 id → 确定 → 写回 + 摘要更新 + 源码同步
  await js(win, `(function(){ document.querySelector('[data-sf-action="popup-edit"][data-sf-path="settings.sounds"]').click(); return 'ok'; })()`);
  await sleep(400);
  await js(win, `
    (function () {
      var sel = document.querySelector('[data-sf-path="__popup__.place"][data-sf-action="union-set"]');
      sel.value = 'map';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()
  `);
  await sleep(300);
  await js(win, `
    (function () {
      var input = document.querySelector('[data-sf-path="__popup__.place.id"][data-sf-kind="field"]');
      input.value = 'minecraft:block.stone.place';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()
  `);
  await sleep(300);
  const a2pre = await js(win, `JSON.stringify({ modal: !!document.getElementById('ce-popup-modal'), dirty: !!(document.getElementById('ce-popup-modal') === null) })`);
  const srcBefore = await js(win, `JSON.stringify({ src: codeMirrorEditor.getValue() })`);
  console.log('A2 pre (弹窗内修改, 源码不应变):', srcBefore.slice(0, 120));
  const ok2pre = srcBefore.indexOf('minecraft:block.stone.place') === -1;

  await js(win, `(function(){ document.querySelector('[data-ce-popup="ok"]').click(); return 'ok'; })()`);
  await sleep(400);
  const a2 = await js(win, `
    (function () {
      var p = document.getElementById('visual-editor')._ceParsed;
      var btn = document.querySelector('[data-sf-action="popup-edit"][data-sf-path="settings.sounds"]');
      var root = btn.closest('.ce-sf-popup');
      var src = codeMirrorEditor.getValue();
      return JSON.stringify({
        modalGone: !document.getElementById('ce-popup-modal'),
        place: p.sections[0].entries[0].data.settings.sounds.place,
        summary: root.querySelector('.ce-sf-popup-summary').textContent,
        srcOk: src.indexOf('id: minecraft:block.stone.place') !== -1,
      });
    })()
  `);
  console.log('A2 确定写回:', a2);
  const a2j = JSON.parse(a2);
  const ok2 = a2j.modalGone && a2j.place && a2j.place.id === 'minecraft:block.stone.place' &&
    a2j.summary.indexOf('place: minecraft:block.stone.place') !== -1 && a2j.srcOk;

  // A3: state 弹窗内修改后取消 → 数据不变
  await js(win, `(function(){ document.querySelector('[data-sf-action="popup-edit"][data-sf-path="state"]').click(); return 'ok'; })()`);
  await sleep(400);
  await js(win, `
    (function () {
      var sel = document.querySelector('[data-sf-path="__popup__.auto_state"][data-sf-action="union-set"]');
      sel.value = 'expanded';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()
  `);
  await sleep(300);
  await js(win, `(function(){ document.querySelector('[data-ce-popup="cancel"]').click(); return 'ok'; })()`);
  await sleep(400);
  const a3 = await js(win, `
    (function () {
      var p = document.getElementById('visual-editor')._ceParsed;
      var btn = document.querySelector('[data-sf-action="popup-edit"][data-sf-path="state"]');
      var root = btn.closest('.ce-sf-popup');
      return JSON.stringify({
        modalGone: !document.getElementById('ce-popup-modal'),
        autoState: p.sections[0].entries[0].data.state.auto_state,
        summary: root.querySelector('.ce-sf-popup-summary').textContent,
      });
    })()
  `);
  console.log('A3 取消:', a3);
  const a3j = JSON.parse(a3);
  const ok3 = a3j.modalGone && a3j.autoState === 'minecraft:flower' && a3j.summary.indexOf('minecraft:flower') !== -1;

  // A4: popup-clear 清除 sounds → 字段删除 + 源码同步
  await js(win, `(function(){
    var btn = document.querySelector('[data-sf-action="popup-clear"][data-sf-path="settings.sounds"]');
    btn.click();
    return 'ok';
  })()`);
  await sleep(400);
  const a4 = await js(win, `
    (function () {
      var p = document.getElementById('visual-editor')._ceParsed;
      var src = codeMirrorEditor.getValue();
      return JSON.stringify({
        sounds: p.sections[0].entries[0].data.settings.sounds,
        srcNoSounds: src.indexOf('wool.place') === -1 && src.indexOf('stone.place') === -1,
      });
    })()
  `);
  console.log('A4 清除:', a4);
  const a4j = JSON.parse(a4);
  const ok4 = a4j.sounds === undefined && a4j.srcNoSounds;

  console.log('== 结果:', ok0 && ok1 && ok1b && ok2pre && ok2 && ok3 && ok4 ? 'ALL PASS' : 'FAIL',
    '(A0=' + ok0 + ' A1=' + ok1 + ' A1b=' + ok1b + ' A2pre=' + ok2pre + ' A2=' + ok2 + ' A3=' + ok3 + ' A4=' + ok4 + ')');
  app.quit();
});
