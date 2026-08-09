// v1.0.88 冒烟: 单文件布局扫描 (配置根下散落 section 文件) + 自定义配置目录名无子目录探测
// 场景: 用户项目 categories.yml / sword.yml 直接位于 configuration 根下 (无 categories/ 等子目录)
// → 根文件按 section 分组收集, 与子目录条目合并, picker 可检索到分类
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('./main.js');
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'flat_fixture');
const f = (p) => path.join(FIXTURE, p);
fs.rmSync(FIXTURE, { recursive: true, force: true });

// 布局一: 路径含 configuration 段, section 文件散落在根下 (用户实际布局)
const CFG = f('resources/test/configuration');
fs.mkdirSync(path.join(CFG, 'armor'), { recursive: true });
fs.writeFileSync(f('resources/test/configuration/categories.yml'),
  'categories:\n  kangelitem:medicinal: {}\n  kangelitem:material: {}\n  kangelitem:gem: {}\n');
fs.writeFileSync(f('resources/test/configuration/sword.yml'),
  'items:\n  kangelitem:atom_spliter:\n    material: diamond_sword\n    category: kangelitem:medicinal\n');
fs.writeFileSync(f('resources/test/configuration/templates.yml'),
  'templates:\n  kangelitem:base_tpl:\n    material: stick\n');
fs.writeFileSync(f('resources/test/configuration/blocks.yml'),
  'blocks:\n  kangelitem:orchid:\n    behavior:\n      type: grass_block\n');
fs.writeFileSync(f('resources/test/configuration/armor/chest.yml'),
  'items:\n  kangelitem:chest_plate:\n    material: diamond_chestplate\n');

// 布局二: 自定义配置目录名, 根下仅散落单文件 (无 section 子目录) → 探测需按文件名识别
const CFG2 = f('工程内容');
fs.mkdirSync(CFG2, { recursive: true });
fs.writeFileSync(f('工程内容/categories.yml'),
  'categories:\n  demo:weapon: {}\n  demo:tool: {}\n');
fs.writeFileSync(f('工程内容/weapon.yml'),
  'items:\n  demo:sword:\n    material: iron_sword\n');

const ITEM_YAML = [
  'items:',
  '  kangelitem:atom_spliter:',
  '    material: diamond_sword',
  '    category: kangelitem:medicinal',
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

    await evalJS(`document.body.classList.add('ce-element-picker');`);

    const itemPath = f('resources/test/configuration/sword.yml').replace(/\\/g, '/');
    const cfgDir = CFG.replace(/\\/g, '/');
    const cfgDir2 = CFG2.replace(/\\/g, '/');

    // ---------- 0. 渲染表单 (触发扫描) ----------
    await evalJS(`(function () {
      var container = document.createElement('div');
      document.body.appendChild(container);
      var parsed = window.CraftEngineInterpreter.render('${itemPath}', ${JSON.stringify(ITEM_YAML)}, container);
      window.__p188 = { container: container, parsed: parsed };
    })()`);

    // ---------- A. 布局一: 根散落单文件 + 子目录 合并 ----------
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
      check(scan.categories.slice().sort().join(',') === 'kangelitem:gem,kangelitem:material,kangelitem:medicinal',
        'A2 根下 categories.yml 收集 (got ' + scan.categories.join(',') + ')');
      check(has('items', 'kangelitem:atom_spliter'), 'A3 根下 sword.yml 按 items: 键收集');
      check(has('items', 'kangelitem:chest_plate'), 'A4 子目录 armor/ 条目与根散落条目合并');
      check(has('templates', 'kangelitem:base_tpl'), 'A5 根下 templates.yml 收集');
      check(has('blocks', 'kangelitem:orchid'), 'A6 根下 blocks.yml 收集');
    }

    // ---------- B. picker 面板可检索到分类 (用户反馈场景) ----------
    const b = await evalJS(`(function () {
      var c = window.__p188.container;
      var btn = c.querySelector('.ce-sf-pick-btn[data-sf-picker="categories"]');
      if (!btn) return { ok: false, why: 'no picker btn' };
      btn.click();
      var panel = document.querySelector('.ce-picker-panel');
      if (!panel) return { ok: false, why: 'no panel' };
      var items = Array.prototype.map.call(panel.querySelectorAll('.ce-picker-item'), x => x.getAttribute('data-ce-picker-value'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { ok: true, items: items };
    })()`);
    check(b.ok && b.items.length === 3 && b.items.indexOf('kangelitem:medicinal') !== -1,
      'B1 面板列出根下分类 (got ' + (b.ok ? b.items.join(',') : b.why) + ')');

    // ---------- C. 点选填入 category (多行字段, 追加去重; 清空后点选应为单值) ----------
    const c = await evalJS(`(function () {
      var c = window.__p188.container;
      var inp = c.querySelector('.ce-input[data-sf-path="category"]');
      inp.value = '';
      c.querySelector('.ce-sf-pick-btn[data-sf-picker="categories"]').click();
      var panel = document.querySelector('.ce-picker-panel');
      panel.querySelector('[data-ce-picker-value="kangelitem:material"]').click();
      return { val: inp.value, data: window.__p188.parsed.sections[0].entries[0].data.category };
    })()`);
    check(c.val === 'kangelitem:material' && c.data === 'kangelitem:material',
      'C1 分类填入 category (got ' + JSON.stringify(c.val) + '/' + JSON.stringify(c.data) + ')');

    // ---------- D. datalist 合并根文件条目 ----------
    const d = await evalJS(`(function () {
      var dl = document.querySelector('#ce-dl-items');
      var opts = dl ? Array.prototype.map.call(dl.querySelectorAll('option'), o => o.value) : [];
      return { opts: opts };
    })()`);
    check(d.opts.indexOf('kangelitem:atom_spliter') !== -1 && d.opts.indexOf('kangelitem:chest_plate') !== -1,
      'D1 datalist 含根文件+子目录 items (got ' + d.opts.join(',') + ')');

    // ---------- E. 布局二: 自定义目录名 + 无 section 子目录, 探测识别根单文件 ----------
    const itemPath2 = f('工程内容/weapon.yml').replace(/\\/g, '/');
    await evalJS(`window.CraftEngineInterpreter.render('${itemPath2}', 'items:\\n  demo:sword:\\n    material: iron_sword\\n', window.__p188.container);`);
    const scan2 = await evalJS(`new Promise(function (resolve) {
      var cfgDir = ${JSON.stringify(cfgDir2)};
      var tries = 0;
      (function poll() {
        var d = window._ceElem.get(cfgDir);
        if (d) return resolve(d);
        if (++tries > 40) return resolve(null);
        setTimeout(poll, 100);
      })();
    })`);
    check(!!scan2, 'E1 自定义目录名扫描完成');
    if (scan2) {
      check(scan2.categories.slice().sort().join(',') === 'demo:tool,demo:weapon',
        'E2 无子目录布局按根 categories.yml 收集 (got ' + scan2.categories.join(',') + ')');
      check(scan2.items.indexOf('demo:sword') !== -1, 'E3 根 weapon.yml 收集 demo:sword');
    }

    console.log('fails=' + fails);
    win.destroy();
  } catch (e) {
    console.log('ERR', e && e.stack || e);
    console.log('fails=' + (fails + 1));
  }
  app.exit(0);
});
