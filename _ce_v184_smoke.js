// v1.0.87 冒烟: CE 元素预载扫描 + picker 快速填入
// 场景: 打开 configuration/items 下的文件 → 预载扫描 items/blocks/furniture/categories/templates
// → 输入框右侧出现 ▾ 按钮 → 弹出面板选择/搜索/多行追加/去重 → 设置关闭后按钮消失
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('./main.js');
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'tree_fixture');
const f = (p) => path.join(FIXTURE, p);
fs.rmSync(FIXTURE, { recursive: true, force: true });
const CFG = f('resources/test/configuration');
['items', 'blocks', 'furniture', 'categories', 'templates'].forEach((s) =>
  fs.mkdirSync(path.join(CFG, s), { recursive: true }));

fs.writeFileSync(f('resources/test/configuration/items/weapons.yml'), [
  'items:',
  '  demo:sword:',
  '    material: diamond_sword',
  '    category: weapons',
  '    template: demo:base_tpl',
  '  demo:axe:',
  '    material: iron_axe',
  '  $$1.21.4:',
  '    demo:ver_sword:',
  '      material: netherite_sword',
].join('\n') + '\n');
fs.writeFileSync(f('resources/test/configuration/blocks/plants.yml'),
  'blocks:\n  default:orchid:\n    behavior:\n      type: grass_block\n');
fs.writeFileSync(f('resources/test/configuration/furniture/sofa.yml'),
  'furniture:\n  demo:sofa:\n    model: default:models/sofa\n');
fs.writeFileSync(f('resources/test/configuration/categories/main.yml'),
  'categories:\n  weapons: {}\n  tools: {}\n  armor: {}\n');
fs.writeFileSync(f('resources/test/configuration/categories/extra.yml'),
  'categories:\n  weapons: {}\n  potions: {}\n');
fs.writeFileSync(f('resources/test/configuration/templates/base.yml'),
  'templates:\n  demo:base_tpl:\n    material: stick\n  demo:ench_tpl:\n    material: stick\n');

const ITEM_YAML = [
  'items:',
  '  demo:sword:',
  '    material: diamond_sword',
  '    category: weapons',
  '    template: demo:base_tpl',
].join('\n') + '\n';

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

    // 默认开启: 应用设置镜像的 body class (renderer 启动即应加上, 这里兜底)
    await evalJS(`document.body.classList.add('ce-element-picker');`);

    const itemPath = f('resources/test/configuration/items/weapons.yml').replace(/\\/g, '/');
    const cfgDir = CFG.replace(/\\/g, '/');

    // ---------- 0. 渲染表单 (触发预载扫描) ----------
    await evalJS(`(function () {
      var container = document.createElement('div');
      document.body.appendChild(container);
      var parsed = window.CraftEngineInterpreter.render('${itemPath}', ${JSON.stringify(ITEM_YAML)}, container);
      window.__p184 = { container: container, parsed: parsed };
    })()`);

    // ---------- A. 预载扫描结果 ----------
    const scan = await evalJS(`new Promise(function (resolve) {
      var cfgDir = ${JSON.stringify(cfgDir)};
      var tries = 0;
      (function poll() {
        var d = window._ceElem.get(cfgDir);
        if (d) return resolve(d);
        if (++tries > 40) return resolve(null);
        setTimeout(poll, 100);
      })();
    })`);
    check(!!scan, 'A1 扫描完成 (got ' + (scan ? 'ok' : 'null') + ')');
    if (scan) {
      const has = (sec, v) => scan[sec] && scan[sec].indexOf(v) !== -1;
      check(has('items', 'demo:sword') && has('items', 'demo:axe'), 'A2 items 收集 (demo:sword/demo:axe)');
      check(has('items', 'demo:ver_sword'), 'A3 版本键组 ($$1.21.4) 展开收集 demo:ver_sword');
      check(has('blocks', 'default:orchid'), 'A4 blocks 收集');
      check(has('furniture', 'demo:sofa'), 'A5 furniture 收集');
      check(scan.categories.slice().sort().join(',') === 'armor,potions,tools,weapons', 'A6 categories 跨文件去重合并 (got ' + scan.categories.join(',') + ')');
      check(has('templates', 'demo:base_tpl') && has('templates', 'demo:ench_tpl'), 'A7 templates 收集');
    }

    // ---------- B. 表单中的 picker 按钮 + datalist 合并 ----------
    const b = await evalJS(`(function () {
      var container = window.__p184.container;
      return {
        catBtn: !!container.querySelector('.ce-sf-pick-btn[data-sf-picker="categories"]'),
        tplBtn: !!container.querySelector('.ce-sf-pick-btn[data-sf-picker="templates"]'),
        itemBtn: !!container.querySelector('.ce-sf-pick-btn[data-sf-picker="items"]'),
        dl: !!document.querySelector('#ce-dl-items option[value="demo:sword"]'),
      };
    })()`);
    check(b.catBtn, 'B1 category 输入框有 picker 按钮 (categories)');
    check(b.tplBtn, 'B2 template 输入框有 picker 按钮 (templates)');
    check(b.itemBtn, 'B3 material 输入框有 picker 按钮 (items, datalist 自动)');
    check(b.dl, 'B4 预载条目合并进原生 datalist (ce-dl-items 含 demo:sword)');

    // ---------- C. 打开面板 → 多行追加 / 去重 / Esc 关闭 ----------
    const c = await evalJS(`(function () {
      var c = window.__p184.container;
      c.querySelector('.ce-sf-pick-btn[data-sf-picker="categories"]').click();
      var panel = document.querySelector('.ce-picker-panel');
      if (!panel) return { ok: false, why: 'no panel' };
      var items = Array.prototype.map.call(panel.querySelectorAll('.ce-picker-item'), x => x.getAttribute('data-ce-picker-value'));
      return { ok: true, items: items, open: !!panel };
    })()`);
    check(c.ok && c.items.slice().sort().join(',') === 'armor,potions,tools,weapons', 'C1 面板列出全部 categories (got ' + (c.ok ? c.items.join(',') : c.why) + ')');

    const c2 = await evalJS(`(function () {
      var c = window.__p184.container;
      var panel = document.querySelector('.ce-picker-panel');
      panel.querySelector('[data-ce-picker-value="weapons"]').click();
      panel.querySelector('[data-ce-picker-value="tools"]').click();
      panel.querySelector('[data-ce-picker-value="weapons"]').click(); // 去重: 不应新增
      var ta = c.querySelector('.ce-input[data-sf-path="category"]');
      var stillOpen = !!document.querySelector('.ce-picker-panel');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      var closed = !document.querySelector('.ce-picker-panel');
      return {
        lines: ta.value, stillOpen: stillOpen, closed: closed,
        data: window.__p184.parsed.sections[0].entries[0].data.category,
      };
    })()`);
    check(c2.lines === 'weapons\ntools', 'C2 多行追加 + 去重 (got ' + JSON.stringify(c2.lines) + ')');
    check(c2.stillOpen, 'C3 多行输入点选后面板保持打开');
    check(c2.closed, 'C4 Esc 关闭面板');
    check(Array.isArray(c2.data) && c2.data.join(',') === 'weapons,tools', 'C5 数据写回为数组 (got ' + JSON.stringify(c2.data) + ')');

    // ---------- D. 单行输入: 点选即填入并关闭 ----------
    const d = await evalJS(`(function () {
      var c = window.__p184.container;
      c.querySelector('.ce-sf-pick-btn[data-sf-picker="items"]').click();
      var panel = document.querySelector('.ce-picker-panel');
      panel.querySelector('[data-ce-picker-value="demo:sword"]').click();
      var inp = c.querySelector('.ce-input[data-sf-path="material"]');
      return {
        closed: !document.querySelector('.ce-picker-panel'),
        val: inp.value,
        data: window.__p184.parsed.sections[0].entries[0].data.material,
      };
    })()`);
    check(d.closed, 'D1 单行输入点选后面板关闭');
    check(d.val === 'demo:sword' && d.data === 'demo:sword', 'D2 值填入 material (got ' + d.val + '/' + d.data + ')');

    // ---------- E. 搜索过滤 ----------
    const e = await evalJS(`(function () {
      var c = window.__p184.container;
      c.querySelector('.ce-sf-pick-btn[data-sf-picker="categories"]').click();
      var panel = document.querySelector('.ce-picker-panel');
      var sb = panel.querySelector('.ce-picker-search');
      sb.value = 'pot';
      sb.dispatchEvent(new Event('input', { bubbles: true }));
      var items = Array.prototype.map.call(panel.querySelectorAll('.ce-picker-item'), x => x.getAttribute('data-ce-picker-value'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return items;
    })()`);
    check(e.length === 1 && e[0] === 'potions', 'E1 搜索过滤 (got ' + e.join(',') + ')');

    // ---------- F. 外部点击关闭 ----------
    const f1 = await evalJS(`(function () {
      var c = window.__p184.container;
      c.querySelector('.ce-sf-pick-btn[data-sf-picker="categories"]').click();
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      return !document.querySelector('.ce-picker-panel');
    })()`);
    check(f1, 'F1 点击外部关闭面板');

    // ---------- G. 设置关闭 → 按钮消失 ----------
    const g = await evalJS(`(function () {
      document.body.classList.remove('ce-element-picker');
      window.__p184.parsed = window.CraftEngineInterpreter.render('${itemPath}', ${JSON.stringify(ITEM_YAML)}, window.__p184.container);
      var btns = window.__p184.container.querySelectorAll('.ce-sf-pick-btn');
      document.body.classList.add('ce-element-picker');
      return btns.length;
    })()`);
    check(g === 0, 'G1 设置关闭后不渲染 picker 按钮 (got ' + g + ')');

    console.log('fails=' + fails);
    win.destroy();
  } catch (e) {
    console.log('ERR', e && e.stack || e);
    console.log('fails=' + (fails + 1));
  }
  app.exit(0);
});
