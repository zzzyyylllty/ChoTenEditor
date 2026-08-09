// v1.0.89 冒烟: picker 显示所有命名空间条目 (resources 根下兄弟命名空间一并扫描合并)
// 场景: 打开 kangelitem 命名空间文件 → 扫描 kangelitem + kangelmain (同一 resources 根)
// → picker 面板/列表包含全部命名空间条目; 当前命名空间优先排序; 无 configuration 子目录的命名空间跳过;
// 切换其它工程后旧命名空间条目被清理
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('./main.js');
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'ns_fixture');
const PFIX = path.join(__dirname, '_ce_tmp', 'prune_fixture');
const f = (p) => path.join(FIXTURE, p);
const pf = (p) => path.join(PFIX, p);
fs.rmSync(FIXTURE, { recursive: true, force: true });
fs.rmSync(PFIX, { recursive: true, force: true });

// 命名空间 A: kangelitem
const CFG_A = f('resources/kangelitem/configuration');
fs.mkdirSync(CFG_A, { recursive: true });
fs.writeFileSync(f('resources/kangelitem/configuration/categories.yml'),
  'categories:\n  kangelitem:medicinal: {}\n  kangelitem:material: {}\n');
fs.writeFileSync(f('resources/kangelitem/configuration/sword.yml'),
  'items:\n  kangelitem:atom_spliter:\n    material: diamond_sword\n    category: kangelitem:medicinal\n');
// 命名空间 B: kangelmain
const CFG_B = f('resources/kangelmain/configuration');
fs.mkdirSync(CFG_B, { recursive: true });
fs.writeFileSync(f('resources/kangelmain/configuration/categories.yml'),
  'categories:\n  kangelmain:sword: {}\n  kangelmain:tool: {}\n');
fs.writeFileSync(f('resources/kangelmain/configuration/item.yml'),
  'items:\n  kangelmain:staff:\n    material: stick\n');
// 无 configuration 子目录的命名空间: 应被跳过
fs.mkdirSync(f('resources/nota_config'), { recursive: true });
fs.writeFileSync(f('resources/nota_config/categories.yml'),
  'categories:\n  nota:xx: {}\n');

// 另一工程 (其它 resources 根): 用于验证切换后清理
const CFG_P = pf('resources/test/configuration');
fs.mkdirSync(CFG_P, { recursive: true });
fs.writeFileSync(pf('resources/test/configuration/categories.yml'),
  'categories:\n  test:group: {}\n');
fs.writeFileSync(pf('resources/test/configuration/other.yml'),
  'items:\n  test:thing:\n    material: stick\n');

const ITEM_YAML = 'items:\n  kangelitem:atom_spliter:\n    material: diamond_sword\n    category: kangelitem:medicinal\n';

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

    const itemPath = f('resources/kangelitem/configuration/sword.yml').replace(/\\/g, '/');
    const cfgA = CFG_A.replace(/\\/g, '/');
    const cfgB = CFG_B.replace(/\\/g, '/');
    const cfgP = CFG_P.replace(/\\/g, '/');

    // ---------- 0. 渲染表单 (触发扫描: 当前 + 兄弟命名空间) ----------
    await evalJS(`(function () {
      var container = document.createElement('div');
      document.body.appendChild(container);
      window.CraftEngineInterpreter.render('${itemPath}', ${JSON.stringify(ITEM_YAML)}, container);
      window.__p189 = { container: container };
    })()`);

    // ---------- A. 当前命名空间扫描完成 ----------
    const scanA = await evalJS(`new Promise(function (resolve) {
      var cfgDir = ${JSON.stringify(cfgA)};
      var tries = 0;
      (function poll() {
        var d = window._ceElem.get(cfgDir);
        if (d) return resolve(d);
        if (++tries > 40) return resolve(null);
        setTimeout(poll, 100);
      })();
    })`);
    check(!!scanA, 'A1 当前命名空间扫描完成');

    // ---------- B. 面板包含所有命名空间条目 ----------
    const b = await evalJS(`new Promise(function (resolve) {
      var c = window.__p189.container;
      c.querySelector('.ce-sf-pick-btn[data-sf-picker="categories"]').click();
      var tries = 0;
      (function poll() {
        var panel = document.querySelector('.ce-picker-panel');
        if (!panel) return resolve({ ok: false, why: 'no panel' });
        var items = Array.prototype.map.call(panel.querySelectorAll('.ce-picker-item'), x => x.getAttribute('data-ce-picker-value'));
        if (items.indexOf('kangelitem:medicinal') !== -1 && items.indexOf('kangelmain:sword') !== -1) {
          return resolve({ ok: true, items: items });
        }
        if (++tries > 50) return resolve({ ok: false, why: 'timeout', items: items });
        setTimeout(poll, 100);
      })();
    })`);
    check(b.ok && b.items.indexOf('kangelmain:sword') !== -1 && b.items.indexOf('kangelmain:tool') !== -1,
      'B1 面板含兄弟命名空间条目 (got ' + (b.ok ? b.items.join(',') : b.why) + ')');
    check(b.ok && b.items.indexOf('nota:xx') === -1, 'B2 无 configuration 子目录的命名空间跳过');
    check(b.ok && b.items[0].indexOf('kangelitem:') === 0, 'B3 当前命名空间条目优先 (got ' + (b.ok ? b.items[0] : b.why) + ')');
    const nsIdx = b.ok ? b.items.map(x => x.split(':')[0]) : [];
    const lastIdx = nsIdx.lastIndexOf('kangelitem');
    const nonCur = nsIdx.slice(lastIdx + 1);
    check(nonCur.join(',') === nonCur.slice().sort().join(','), 'B4 当前命名空间之后按字母序 (got ' + nonCur.join(',') + ')');
    await evalJS(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);

    // ---------- C. datalist items 合并两命名空间 ----------
    const d = await evalJS(`new Promise(function (resolve) {
      var tries = 0;
      (function poll() {
        var dl = document.querySelector('#ce-dl-items');
        var opts = dl ? Array.prototype.map.call(dl.querySelectorAll('option'), o => o.value) : [];
        if (opts.indexOf('kangelitem:atom_spliter') !== -1 && opts.indexOf('kangelmain:staff') !== -1) {
          return resolve({ ok: true, opts: opts });
        }
        if (++tries > 50) return resolve({ ok: false, opts: opts });
        setTimeout(poll, 100);
      })();
    })`);
    check(d.ok, 'C1 datalist 合并两命名空间 items (got ' + d.opts.filter(x => x.indexOf(':') !== -1 && x.indexOf('minecraft:') === -1).join(',') + ')');

    // ---------- D. 切换其它工程 → 旧命名空间条目清理 ----------
    const itemPath2 = pf('resources/test/configuration/other.yml').replace(/\\/g, '/');
    await evalJS(`window.CraftEngineInterpreter.render('${itemPath2}', 'items:\\n  test:thing:\\n    material: stick\\n', window.__p189.container);`);
    const scanP = await evalJS(`new Promise(function (resolve) {
      var cfgDir = ${JSON.stringify(cfgP)};
      var tries = 0;
      (function poll() {
        var d = window._ceElem.get(cfgDir);
        if (d) return resolve(d);
        if (++tries > 40) return resolve(null);
        setTimeout(poll, 100);
      })();
    })`);
    check(!!scanP, 'D1 新工程扫描完成');
    const d2 = await evalJS(`new Promise(function (resolve) {
      var c = window.__p189.container;
      c.querySelector('.ce-sf-pick-btn[data-sf-picker="categories"]').click();
      var tries = 0;
      (function poll() {
        var panel = document.querySelector('.ce-picker-panel');
        if (!panel) return resolve({ ok: false, why: 'no panel' });
        var items = Array.prototype.map.call(panel.querySelectorAll('.ce-picker-item'), x => x.getAttribute('data-ce-picker-value'));
        if (items.indexOf('test:group') !== -1 && items.indexOf('kangelitem:medicinal') === -1) {
          return resolve({ ok: true, items: items });
        }
        if (++tries > 50) return resolve({ ok: false, items: items });
        setTimeout(poll, 100);
      })();
    })`);
    check(d2.ok, 'D2 旧命名空间条目已清理, 只剩新工程 (got ' + (d2.ok ? d2.items.join(',') : JSON.stringify(d2.items)) + ')');

    console.log('fails=' + fails);
    win.destroy();
  } catch (e) {
    console.log('ERR', e && e.stack || e);
    console.log('fails=' + (fails + 1));
  }
  app.exit(0);
});
