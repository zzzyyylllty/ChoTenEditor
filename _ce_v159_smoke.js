// v1.0.59 冒烟: 字段提示错配修复 (equipment type 不再显示战利品源词条)
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

    const r = await win.webContents.executeJavaScript(`(function () {
      var out = {};
      var ve = document.getElementById('visual-editor');
      function renderSection(sectionKey, yaml) {
        var el = document.createElement('div');
        CraftEngineInterpreter.render('smoke.yml', yaml, el, {});
        return el;
      }
      // 1. equipment type 提示 = 装备类型 (不是战利品源)
      var e1 = renderSection('equipments', [
        'equipments:',
        '  default:topaz:',
        '    type: component'
      ].join('\\n'));
      function tipOf(el, path) {
        var ctrl = el.querySelector('[data-sf-path="' + path + '"]');
        if (!ctrl) return '';
        var box = ctrl.closest('.ce-stack, .ce-row');
        var ic = box ? box.querySelector('.ce-sf-hint-icon') : null;
        return ic ? ic.getAttribute('data-sf-hint') : '';
      }
      out.equipTypeTip = tipOf(e1, 'type');
      out.equipTypeOk = out.equipTypeTip.indexOf('装备类型') !== -1 && out.equipTypeTip.indexOf('战利品') === -1;
      // 2. loot_source type 提示仍为战利品源
      var e2 = renderSection('lootSources', [
        'loot_sources:',
        '  default:test:',
        '    type: block_break'
      ].join('\\n'));
      out.lootTypeTip = tipOf(e2, 'type');
      out.lootTypeOk = out.lootTypeTip.indexOf('战利品源类型') !== -1;
      // 3. recipe type 提示 = 配方类型
      var e3 = renderSection('recipes', [
        'recipes:',
        '  default:test:',
        '    type: shaped'
      ].join('\\n'));
      out.recipeTypeTip = tipOf(e3, 'type');
      out.recipeTypeOk = out.recipeTypeTip.indexOf('配方类型') !== -1 && out.recipeTypeTip.indexOf('战利品') === -1;
      return out;
    })()`);
    check(r.equipTypeOk, 'equipment.type 提示 = 装备类型 (实际: ' + r.equipTypeTip.slice(0, 40) + ')');
    check(r.lootTypeOk, 'lootSource.type 提示保留战利品源词条');
    check(r.recipeTypeOk, 'recipe.type 提示 = 配方类型 (实际: ' + r.recipeTypeTip.slice(0, 40) + ')');
    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
