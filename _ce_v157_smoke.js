// v1.0.57 冒烟: equipments 版本键分组内装备显示为条目 (不把 $>=1.21.2 当装备)
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
      var yaml = [
        'equipments:',
        '  $$>=1.21.2:',
        '    default:topaz:',
        '      type: component',
        '      humanoid: minecraft:topaz',
        '  $$<1.21.2:',
        '    default:topaz:',
        '      type: component',
        '      humanoid: minecraft:topaz'
      ].join('\\n');
      var parsed = CraftEngineInterpreter.render('smoke.yml', yaml, ve, {});
      out.parsed = !!parsed;
      // 1. 条目列表: 两个 default:topaz, 且版本键不作为条目
      var items = ve.querySelectorAll('.ce-entry-item');
      out.itemCount = items.length;
      var itemTexts = [];
      for (var i = 0; i < items.length; i++) itemTexts.push(items[i].textContent.trim());
      out.itemTexts = itemTexts.join(' | ');
      out.noVerAsItem = itemTexts.indexOf('>=1.21.2') === -1 && itemTexts.indexOf('<1.21.2') === -1;
      // 2. 每条带 group badge
      out.badges = ve.querySelectorAll('.ce-entry-item .ce-sf-map-ver').length;
      // 3. 点条目 → 表单渲染装备字段
      items[0].click();
      out.keyInput = ve.querySelector('input[data-ce-field="__key__"]');
      out.keyValue = out.keyInput ? out.keyInput.value : null;
      var sf = ve.querySelectorAll('select[data-sf-path="type"], input[data-sf-path="humanoid"]');
      out.typeField = sf.length >= 2;
      out.typeSelValue = ve.querySelector('select[data-sf-path="type"]') ? ve.querySelector('select[data-sf-path="type"]').value : null;
      out.keyboxBadge = !!ve.querySelector('.ce-sf-map-keybox .ce-sf-map-ver');
      // 4. 修改字段 → syncToSource → YAML 结构保留分组
      var hu = ve.querySelector('input[data-sf-path="humanoid"]');
      if (hu) {
        hu.value = 'minecraft:obsidian';
        hu.dispatchEvent(new Event('change', { bubbles: true }));
      }
      var src = CraftEngineInterpreter.generateYAML(parsed);
      out.src = src;
      out.srcGroupOk = src.indexOf('$$>=1.21.2:') !== -1 && src.indexOf('    default:topaz:') !== -1 && src.indexOf('      humanoid: minecraft:obsidian') !== -1;
      // 5. 版本键不在条目列表 (重新渲染后)
      var items2 = ve.querySelectorAll('.ce-entry-item');
      var t2 = [];
      for (var j = 0; j < items2.length; j++) t2.push(items2[j].textContent.trim());
      out.afterEdit = t2.join(' | ');
      return out;
    })()`);
    check(r.parsed, 'render 成功');
    check(r.itemCount === 2 && r.itemTexts.split('|').every(t => t.indexOf('default:topaz') !== -1), '条目列表 = 2 个 default:topaz (实际: ' + r.itemTexts + ')');
    check(r.noVerAsItem, '版本键不作为条目显示');
    check(r.badges === 2, '每条带版本分组徽标 (badges=' + r.badges + ')');
    check(r.keyInput && r.keyValue === 'default:topaz', '点击条目 → 键输入框 = default:topaz');
    check(r.typeField, '表单渲染 type 字段');
    check(r.keyboxBadge, '键输入框前带分组徽标');
    check(r.srcGroupOk, '修改后 YAML 保留版本分组结构 (type: weapon 写入组内)');
    check(r.afterEdit.split('|').length === 2, '编辑后条目列表仍为 2 条装备');
    console.log('--- 编辑后 YAML ---');
    console.log(r.src);
    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
