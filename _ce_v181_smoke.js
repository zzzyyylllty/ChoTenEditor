// v1.0.84 冒烟: items/blocks/recipes 等条目 section 的 $$ 版本键分组
// 官方文件模式: $$<约束>#<id> 包裹真实条目 (default:flame_elytra), 之前版本键被误识别为物品
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('./main.js');
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'tree_fixture');
const f = (p) => path.join(FIXTURE, p);

fs.rmSync(FIXTURE, { recursive: true, force: true });
fs.mkdirSync(f('resources/test/configuration/items'), { recursive: true });

const FLAME = [
  'items:',
  '  $$>=1.21.2#flame_elytra:',
  '    default:flame_elytra:',
  '      material: elytra',
  '      settings:',
  '        equippable:',
  '          slot: chest',
  '          asset-id: flame',
  '          wings: flame_elytra',
  '      data:',
  '        item-name: <!i><#FF8C00><l10n:item.flame_elytra>',
  '      textures:',
  '        - minecraft:item/custom/flame_elytra',
  '        - minecraft:item/custom/flame_elytra_broken',
].join('\n') + '\n';
fs.writeFileSync(f('resources/test/configuration/items/flame_elytra.yml'), FLAME);

const TRIDENT = [
  'items:',
  '  $$>=1.21.4#topaz_trident:',
  '    default:topaz_trident:',
  '      material: trident',
  '      data:',
  '        item-name: new',
  '  $$1.20.1~1.21.3#topaz_trident:',
  '    default:topaz_trident:',
  '      material: trident',
  '      data:',
  '        item-name: old',
  '      $$>=1.21.2:',
  '        client-bound-data:',
  '          components:',
  '            minecraft:consumable:',
  '              consume_seconds: 128000',
].join('\n') + '\n';
fs.writeFileSync(f('resources/test/configuration/items/topaz_trident.yml'), TRIDENT);

const CAP = [
  'items:',
  '  default:cap:',
  '    material: leather_helmet',
  '    $$<=1.21.1:',
  '      client-bound-material: leather_horse_armor',
  '    data:',
  '      item-name: cap',
].join('\n') + '\n';
fs.writeFileSync(f('resources/test/configuration/items/cap.yml'), CAP);

let fails = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!cond) fails++;
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false, width: 1280, height: 860,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false,
        nodeIntegrationInSubFrames: true,
      },
    });
    await win.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 2000));
    async function evalJS(expr) { return win.webContents.executeJavaScript(expr); }
    async function waitFor(expr, timeout, step) {
      timeout = timeout || 8000; step = step || 150;
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        let v = false;
        try { v = await win.webContents.executeJavaScript(expr); } catch (e) { v = false; }
        if (v) return true;
        await new Promise(r => setTimeout(r, step));
      }
      return false;
    }

    // ---------- A. flame_elytra: 版本键展开为条目 ----------
    const flamePath = f('resources/test/configuration/items/flame_elytra.yml').replace(/\\/g, '/');
    const a = await evalJS(`(function () {
      var container = document.createElement('div');
      document.body.appendChild(container);
      var content = ${JSON.stringify(FLAME)};
      var parsed = window.CraftEngineInterpreter.render('${flamePath}', content, container);
      window.__ce181 = { container: container, parsed: parsed };
      var sec = parsed.sections[0];
      var en = sec.entries[0];
      var entryItem = container.querySelector('.ce-entry-item');
      var badge = entryItem ? entryItem.querySelector('.ce-sf-map-ver') : null;
      var keyInput = container.querySelector('input[data-ce-field="__key__"]');
      return {
        section: sec.key,
        n: sec.entries.length,
        key: en ? en.key : null,
        group: en ? (en._group || null) : null,
        fields: en && en.data ? Object.keys(en.data).join(',') : null,
        entryText: entryItem ? entryItem.textContent : null,
        badgeTip: badge ? badge.getAttribute('data-tip') : null,
        badgeText: badge ? badge.textContent : null,
        keyBox: container.querySelectorAll('.ce-sf-map-keybox').length,
        keyVal: keyInput ? keyInput.value : null,
        material: (function () { var i = container.querySelector('input[data-sf-path="material"]'); return i ? i.value : null; })(),
        textures: (function () { var t = container.querySelector('textarea[data-sf-path="textures"]'); return t ? t.value : null; })(),
      };
    })()`);
    check(a.section === 'items', 'A1 section = items');
    check(a.n === 1, 'A2 展开后 1 个条目 (got ' + a.n + ')');
    check(a.key === 'default:flame_elytra', 'A3 条目键 = default:flame_elytra (got ' + a.key + ')');
    check(a.group === '$$>=1.21.2#flame_elytra', 'A4 分组 = $$>=1.21.2#flame_elytra (got ' + a.group + ')');
    check(a.fields === 'material,settings,data,textures', 'A5 条目字段 = material,settings,data,textures (got ' + a.fields + ')');
    check(a.entryText && a.entryText.indexOf('default:flame_elytra') !== -1, 'A6 条目列表显示 default:flame_elytra (got ' + a.entryText + ')');
    check(a.badgeTip && a.badgeTip.indexOf('$$>=1.21.2#flame_elytra') !== -1, 'A7 条目带版本徽标 (got ' + a.badgeTip + ')');
    check(a.keyBox === 1 && a.keyVal === 'default:flame_elytra', 'A8 键输入框带徽标且值为条目键 (got ' + a.keyVal + ')');
    check(a.material === 'elytra', 'A9 material 表单渲染 = elytra (got ' + a.material + ')');
    check(a.textures && a.textures.indexOf('flame_elytra_broken') !== -1, 'A10 textures 渲染 (got ' + a.textures + ')');

    // ---------- B. 修改 + 序列化保持版本键包裹 ----------
    const b = await evalJS(`(function () {
      var c = window.__ce181.container;
      var p = window.__ce181.parsed;
      var m = c.querySelector('input[data-sf-path="material"]');
      m.value = 'elytra_wing';
      m.dispatchEvent(new Event('change', { bubbles: true }));
      var yaml = window.CraftEngineInterpreter.generateYAML(p);
      var re = window.CraftEngineInterpreter.parse(yaml);
      return {
        yaml: yaml,
        reN: re.sections[0].entries.length,
        reKey: re.sections[0].entries[0].key,
        reGroup: re.sections[0].entries[0]._group || null,
      };
    })()`);
    check(b.yaml.indexOf('  $$>=1.21.2#flame_elytra:') !== -1, 'B1 序列化保留版本键包裹');
    check(b.yaml.indexOf('    default:flame_elytra:') !== -1, 'B2 条目缩进在版本键内');
    check(b.yaml.indexOf('material: elytra_wing') !== -1, 'B3 修改写回 material: elytra_wing');
    check(b.reN === 1 && b.reKey === 'default:flame_elytra' && b.reGroup === '$$>=1.21.2#flame_elytra', 'B4 往返解析一致');

    // ---------- C. 组内重命名条目 ----------
    const c1 = await evalJS(`(function () {
      var c = window.__ce181.container;
      var ki = c.querySelector('input[data-ce-field="__key__"]');
      ki.value = 'kangel:flame_elytra';
      ki.dispatchEvent(new Event('change', { bubbles: true }));
      var p = window.__ce181.parsed;
      var yaml = window.CraftEngineInterpreter.generateYAML(p);
      return {
        key: p.sections[0].entries[0].key,
        group: p.sections[0].entries[0]._group || null,
        yaml: yaml,
      };
    })()`);
    check(c1.key === 'kangel:flame_elytra', 'C1 条目重命名生效 (got ' + c1.key + ')');
    check(c1.group === '$$>=1.21.2#flame_elytra', 'C2 重命名后仍属原版本组');
    check(c1.yaml.indexOf('    kangel:flame_elytra:') !== -1 && c1.yaml.indexOf('  $$>=1.21.2#flame_elytra:') !== -1, 'C3 序列化新键仍在版本键内');

    // ---------- D. 组内删除 → 组空后版本键消失 ----------
    const d = await evalJS(`(function () {
      var c = window.__ce181.container;
      var del = c.querySelector('[data-action="ce-delete-entry"]');
      del.click();
      return !!del;
    })()`);
    check(d, 'D1 删除按钮可点击');
    check(await waitFor(`document.getElementById('ce-del-modal') ? true : false`), 'D2 删除确认弹窗');
    const d2 = await evalJS(`(function () {
      document.getElementById('ce-del-confirm').click();
      var p = window.__ce181.parsed;
      var yaml = window.CraftEngineInterpreter.generateYAML(p);
      return { n: p.sections[0].entries.length, yaml: yaml };
    })()`);
    check(d2.n === 0, 'D3 组内删除后条目数为 0 (got ' + d2.n + ')');
    check(d2.yaml.indexOf('$$') === -1, 'D4 空组不输出版本键 (got ' + JSON.stringify(d2.yaml) + ')');

    // ---------- E. 同一物品多版本变体 ----------
    const triPath = f('resources/test/configuration/items/topaz_trident.yml').replace(/\\/g, '/');
    const e = await evalJS(`(function () {
      var container = document.createElement('div');
      document.body.appendChild(container);
      var parsed = window.CraftEngineInterpreter.render('${triPath}', ${JSON.stringify(TRIDENT)}, container);
      window.__ce181t = { container: container, parsed: parsed };
      var sec = parsed.sections[0];
      var tips = [];
      var items = container.querySelectorAll('.ce-entry-item');
      for (var i = 0; i < items.length; i++) {
        var b = items[i].querySelector('.ce-sf-map-ver');
        tips.push(b ? b.getAttribute('data-tip') : '(none)');
      }
      return {
        n: sec.entries.length,
        keys: sec.entries.map(function (en) { return en.key; }).join(','),
        groups: sec.entries.map(function (en) { return en._group || ''; }).join(' | '),
        tips: tips.join(' | '),
        oldItemName: (function () {
          // 第二个条目 (旧版本) 的 item-name
          var c = container;
          var idx = 1;
          return null;
        })(),
      };
    })()`);
    check(e.n === 2, 'E1 两个版本变体 = 2 条目 (got ' + e.n + ')');
    check(e.keys === 'default:topaz_trident,default:topaz_trident', 'E2 两条目同名 default:topaz_trident (got ' + e.keys + ')');
    check(e.groups.indexOf('$$>=1.21.4#topaz_trident') !== -1 && e.groups.indexOf('$$1.20.1~1.21.3#topaz_trident') !== -1, 'E3 分组正确 (got ' + e.groups + ')');
    check(e.tips.indexOf('>=1.21.4') !== -1 && e.tips.indexOf('1.20.1~1.21.3') !== -1, 'E4 条目列表徽标区分版本 (got ' + e.tips + ')');

    // ---------- F. 条目内嵌版本键不受影响 (cap.yml 模式) ----------
    const capPath = f('resources/test/configuration/items/cap.yml').replace(/\\/g, '/');
    const cap = await evalJS(`(function () {
      var container = document.createElement('div');
      document.body.appendChild(container);
      var parsed = window.CraftEngineInterpreter.render('${capPath}', ${JSON.stringify(CAP)}, container);
      var en = parsed.sections[0].entries[0];
      var yaml = window.CraftEngineInterpreter.generateYAML(parsed);
      return {
        n: parsed.sections[0].entries.length,
        key: en.key,
        group: en._group || null,
        hasVerField: !!(en.data && en.data['$$<=1.21.1']),
        yaml: yaml,
      };
    })()`);
    check(cap.n === 1 && cap.key === 'default:cap', 'F1 cap 保持单条目 (got ' + cap.n + ' / ' + cap.key + ')');
    check(!cap.group, 'F2 cap 无分组 (got ' + cap.group + ')');
    check(cap.hasVerField, 'F3 条目内版本键保留在数据中');
    check(cap.yaml.indexOf('$$<=1.21.1:') !== -1 && cap.yaml.indexOf('  default:cap:') !== -1, 'F4 序列化内嵌版本键原样保留');

    console.log('fails=' + fails);
    win.destroy();
  } catch (e) {
    console.log('ERR', e && e.stack || e);
    console.log('fails=' + (fails + 1));
  }
  app.exit(0);
});
