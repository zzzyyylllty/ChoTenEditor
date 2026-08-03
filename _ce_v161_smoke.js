// v1.0.61 冒烟: CraftEngine 序列化/渲染修复 (spec 弹窗写回 / !!tag 保持 / conditional#id)
const { app, BrowserWindow } = require('electron');
const path = require('path');

let fails = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!cond) fails++;
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false, width: 1280, height: 860,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    await win.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 1500));

    // 1. conditional#id 变体: 不当作组件行, 条件区显示已有条件(无"添加条件"), 编辑写回变体键
    const r = await win.webContents.executeJavaScript(`(function () {
      var out = {};
      var el = document.createElement('div');
      CraftEngineInterpreter.render('items.yml', [
        'items:',
        '  default:sword:',
        '    client_bound_data:',
        '      conditional#unlocked:',
        '        conditions:',
        '          - "1"',
        '      item_name: "Test Sword"'
      ].join('\\n'), el, {});
      var comps = el.querySelector('.ce-sf-components');
      out.compNames = Array.from(el.querySelectorAll('.ce-sf-comp-name')).map(x => x.textContent);
      out.condRowEditPath = el.querySelector('.ce-sf-cond-row [data-sf-action="popup-edit"]') ?
        el.querySelector('.ce-sf-cond-row [data-sf-action="popup-edit"]').getAttribute('data-sf-path') : '';
      out.condRowSummary = el.querySelector('.ce-sf-cond-row .ce-sf-popup-summary') ?
        el.querySelector('.ce-sf-cond-row .ce-sf-popup-summary').textContent : '';
      out.noCondAdd = !el.querySelector('.ce-sf-cond-add');
      // 打开条件弹窗, 修改 conditions 后写回 → 应保留 conditional#unlocked 键
      var editBtn = el.querySelector('.ce-sf-cond-row [data-sf-action="popup-edit"]');
      if (editBtn) {
        editBtn.click();
        var modal = document.getElementById('ce-popup-modal');
        out.popupOpened = !!modal;
        if (modal) {
          modal.querySelector('[data-ce-popup="ok"]').click();
        }
      }
      var parsed = el._ceParsed;
      out.condKeys = Object.keys(parsed.sections[0].entries[0].data.client_bound_data).filter(k => k.indexOf('conditional') === 0);
      return out;
    })()`);
    check(r.compNames.length === 1 && r.compNames[0].indexOf('item_name') !== -1, 'conditional#id 不渲染为组件行, 仅 1 个组件 (实际: ' + JSON.stringify(r.compNames) + ')');
    check(r.noCondAdd, 'conditional#id 存在时不显示"添加条件"按钮');
    check(!!r.condRowEditPath, '条件区有编辑按钮');
    check(r.condRowEditPath.indexOf('conditional#unlocked') !== -1, '条件编辑 path 指向变体键 (实际: ' + r.condRowEditPath + ')');
    check(r.popupOpened, '条件弹窗可打开');
    check(r.condKeys.length === 1 && r.condKeys[0] === 'conditional#unlocked', '弹窗写回不产生重复 conditional 键 (实际: ' + JSON.stringify(r.condKeys) + ')');

    // 2. !!tag 值: 输入框显示解包值, 修改后写回保留 !!long
    const r2 = await win.webContents.executeJavaScript(`(function () {
      var out = {};
      var el = document.createElement('div');
      CraftEngineInterpreter.render('items.yml', [
        'items:',
        '  default:sword:',
        '    texture: !!long 5'
      ].join('\\n'), el, {});
      var typeInp = el.querySelector('input[data-sf-path="texture"]');
      out.tagDisplay = typeInp ? typeInp.value : '(not found)';
      if (typeInp) {
        typeInp.value = '7';
        typeInp.dispatchEvent(new Event('change', { bubbles: true }));
      }
      out.gen = CraftEngineInterpreter.generateYAML(el._ceParsed);
      return out;
    })()`);
    check(r2.tagDisplay === '5', '!!long 5 解包显示为 5 (实际: ' + r2.tagDisplay + ')');
    check(r2.gen.indexOf('texture: !!long 7') !== -1, '修改后写回保留 !!long 7 (实际: ' + r2.gen.replace(/\n/g, ' | ') + ')');

    // 3. spec 弹窗写回 config 场景: config-version 加 !!type, 同步 _fileLevelRaw
    const r3 = await win.webContents.executeJavaScript(`(function () {
      var out = {};
      var el = document.createElement('div');
      CraftEngineInterpreter.render('config.yml', [
        'config-version: 12',
        'resource-pack: "demo"',
        'light-system: false'
      ].join('\\n'), el, {});
      var btn = el.querySelector('[data-sf-action="spec-popup"]');
      out.hasBtn = !!btn;
      if (btn) btn.click();
      var modal = document.getElementById('ce-spec-modal');
      out.hasModal = !!modal;
      if (modal) {
        var sel = modal.querySelector('.ce-spec-type-sel');
        out.hasTypeSel = !!sel;
        if (sel) {
          sel.value = 'long';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          modal.querySelector('[data-ce-spec="ok"]').click();
        }
      }
      var parsed = el._ceParsed;
      out.rawVal = parsed._fileLevelRaw['config-version'];
      out.gen = CraftEngineInterpreter.generateYAML(parsed);
      return out;
    })()`);
    check(r3.hasBtn, 'config 标量字段有 spec 弹窗按钮');
    check(r3.hasModal, 'spec 弹窗打开');
    check(r3.hasTypeSel, '弹窗有类型选择');
    check(r3.rawVal && r3.rawVal.__ceTag === 'long', 'config-version 写回 wrap 对象 (实际: ' + JSON.stringify(r3.rawVal) + ')');
    check(r3.gen.indexOf('config-version: !!long 12') !== -1, 'generateYAML 输出 !!long 12 (实际: ' + r3.gen.replace(/\n/g, ' | ') + ')');

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
