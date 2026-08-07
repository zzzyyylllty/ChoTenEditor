// v1.0.80 冒烟: 方块设置键名兼容 (连字符/下划线) + is-randomly-ticking + auto-state 写回
// 官方中文文档与旧版文件用连字符键 (push-reaction), 英文新版 wiki 用下划线键 (push_reaction):
// 断言连字符键 fixture 渲染无「其他字段」折叠、各字段值正确、修改写回后仍保持连字符键名
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('./main.js');
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'block_fixture');
const f = (p) => path.join(FIXTURE, p);

fs.rmSync(FIXTURE, { recursive: true, force: true });
fs.mkdirSync(f('resources/test/configuration/blocks'), { recursive: true });
fs.mkdirSync(f('resources/test/configuration/items'), { recursive: true });
fs.writeFileSync(f('resources/test/configuration/blocks/test.yml'), [
  'blocks:',
  '  simple:test_block:',
  '    state:',
  '      auto-state: solid',
  '    settings:',
  '      hardness: 0.5',
  '      resistance: 2.0',
  '      push-reaction: NORMAL',
  '      map-color: 36',
  '      burnable: false',
  '      fire-spread-chance: 0',
  '      burn-chance: 0',
  '      item: default:test_item',
  '      replaceable: false',
  '      is-redstone-conductor: false',
  '      is-suffocating: true',
  '      is-view-blocking: true',
  '      is-randomly-ticking: false',
  '      require-correct-tools: true',
  '      respect-tool-component: false',
  '      correct-tools:',
  '        - minecraft:wooden_pickaxe',
  '      incorrect-tool-dig-speed: 0.3',
  '      instrument: BASEDRUM',
  '      support-shape: minecraft:stone',
].join('\n') + '\n');
// 内联方块 (block_item.block 内直接定义, 用户格式)
fs.writeFileSync(f('resources/test/configuration/items/test.yml'), [
  'items:',
  '  kangelblocks:xxx:',
  '    behavior:',
  '      type: block_item',
  '      block:',
  '        settings:',
  '          hardness: 10',
  '          push-reaction: NORMAL',
  '          burnable: false',
  '          is-randomly-ticking: false',
  '          correct-tools:',
  '            - minecraft:wooden_pickaxe',
  '        state:',
  '          auto-state: solid',
].join('\n') + '\n');

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
    win.webContents.on('console-message', (e, level, msg) => console.log('[renderer]', msg));
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

    // ---------- A. 直接渲染连字符键 fixture ----------
    const contentStr = fs.readFileSync(f('resources/test/configuration/blocks/test.yml'), 'utf8');
    const injPath = f('resources/test/configuration/blocks/test.yml').replace(/\\/g, '/');
    const ft = await evalJS(`(function () {
      return window.CraftEngineInterpreter.detectFileType('blocks: {}\\n', '${injPath}');
    })()`);
    check(ft === 'craftengine', 'A1 detectFileType → craftengine (got ' + ft + ')');

    const r = await evalJS(`(function () {
      var container = document.createElement('div');
      document.body.appendChild(container);
      var content = ${JSON.stringify(contentStr)};
      var parsed = window.CraftEngineInterpreter.render('${injPath}', content, container);
      window.__ce180 = { container: container, parsed: parsed };
      function val(sel) { var el = container.querySelector(sel); return el ? el.value : null; }
      function chk(sel) { var el = container.querySelector(sel); return el ? el.checked : null; }
      return {
        collapses: container.querySelectorAll('.ce-sf-collapse').length,
        pushReaction: val('select[data-sf-path="settings.push-reaction"]'),
        burnable: chk('input[data-sf-path="settings.burnable"]'),
        randomTick: chk('input[data-sf-path="settings.is-randomly-ticking"]'),
        suffocating: chk('input[data-sf-path="settings.is-suffocating"]'),
        viewBlocking: chk('input[data-sf-path="settings.is-view-blocking"]'),
        redstoneConductor: chk('input[data-sf-path="settings.is-redstone-conductor"]'),
        requireCorrectTools: chk('input[data-sf-path="settings.require-correct-tools"]'),
        respectToolComponent: chk('input[data-sf-path="settings.respect-tool-component"]'),
        correctTools: val('textarea[data-sf-path="settings.correct-tools"]'),
        supportShape: val('input[data-sf-path="settings.support-shape"]'),
        instrument: val('select[data-sf-path="settings.instrument"]'),
        hardness: val('input[data-sf-path="settings.hardness"]'),
        mapColor: val('input[data-sf-path="settings.map-color"]'),
        item: val('input[data-sf-path="settings.item"]'),
      };
    })()`);
    check(r.collapses === 0, 'A2 无「其他字段」折叠 (got ' + r.collapses + ' 个)');
    check(r.pushReaction === 'NORMAL', 'A3 push-reaction = NORMAL (got ' + r.pushReaction + ')');
    check(r.burnable === false, 'A4 burnable = false (got ' + r.burnable + ')');
    check(r.randomTick === false, 'A5 is-randomly-ticking 字段渲染 = false (got ' + r.randomTick + ')');
    check(r.suffocating === true && r.viewBlocking === true, 'A6 suffocating/view-blocking = true');
    check(r.redstoneConductor === false && r.requireCorrectTools === true && r.respectToolComponent === false, 'A7 redstone-conductor/require-correct-tools/respect-tool-component 正确');
    check(r.correctTools !== null && r.correctTools.indexOf('minecraft:wooden_pickaxe') !== -1, 'A8 correct-tools 含 wooden_pickaxe (got ' + r.correctTools + ')');
    check(r.supportShape === 'minecraft:stone', 'A9 support-shape = minecraft:stone (got ' + r.supportShape + ')');
    check(r.instrument === 'BASEDRUM', 'A10 instrument = BASEDRUM (got ' + r.instrument + ')');
    check(r.hardness === '0.5' && r.mapColor === '36' && r.item === 'default:test_item', 'A11 hardness/map-color/item 值正确');

    // ---------- B. 修改 + 写回保持连字符键名 ----------
    const w = await evalJS(`(function () {
      var c = window.__ce180.container;
      var p = window.__ce180.parsed;
      var burnable = c.querySelector('input[data-sf-path="settings.burnable"]');
      burnable.checked = true;
      burnable.dispatchEvent(new Event('change', { bubbles: true }));
      var yaml = window.CraftEngineInterpreter.generateYAML(p);
      return {
        entry: p.sections[0].entries[0],
        yaml: yaml,
      };
    })()`);
    check(w.entry.data.settings.burnable === true, 'B1 change 事件写回 entry.data.settings.burnable = true');
    check(w.yaml.indexOf('burnable: true') !== -1, 'B2 序列化保持 burnable: true (连字符)');
    check(w.yaml.indexOf('push-reaction: NORMAL') !== -1, 'B3 序列化保持 push-reaction (连字符)');
    check(w.yaml.indexOf('push_reaction') === -1 && w.yaml.indexOf('is_randomly_ticking') === -1, 'B4 无下划线键泄漏');

    // ---------- C. auto-state popup: 渲染 + 修改写回 ----------
    const c1 = await evalJS(`(function () {
      var c = window.__ce180.container;
      var btn = c.querySelector('[data-sf-action="popup-edit"][data-sf-path="state"]');
      if (btn) btn.click();
      return !!btn;
    })()`);
    check(c1, 'C1 state popup 按钮存在并可点击');
    check(await waitFor(`document.getElementById('ce-popup-modal') ? true : false`), 'C2 popup 弹窗打开');
    const c2 = await evalJS(`(function () {
      var m = document.getElementById('ce-popup-modal');
      var sel = m.querySelector('select[data-sf-path="__popup__.auto-state"]');
      // union 有两个 select: union-set (类型选择, 标量时 = __scalar) 和值选择 (data-sf-kind="field")
      var unionSel = sel;
      var fieldSel = m.querySelector('select[data-sf-path="__popup__.auto-state"][data-sf-kind="field"]');
      return {
        hasSel: !!fieldSel,
        unionValue: unionSel ? unionSel.value : null,
        value: fieldSel ? fieldSel.value : null,
        option1: fieldSel && fieldSel.options[1] ? fieldSel.options[1].value : null,
      };
    })()`);
    check(c2.hasSel, 'C3 auto-state 字段出现在 popup 中');
    check(c2.unionValue === '__scalar', 'C3b union 识别为标量 (got ' + c2.unionValue + ')');
    check(c2.value === 'solid', 'C4 auto-state = solid (got ' + c2.value + ')');
    const c5 = await evalJS(`(function () {
      var m = document.getElementById('ce-popup-modal');
      var sel = m.querySelector('select[data-sf-path="__popup__.auto-state"][data-sf-kind="field"]');
      var v = sel.options[1].value;
      sel.value = v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      m.querySelector('[data-ce-popup="ok"]').click();
      return v;
    })()`);
    const c6 = await evalJS(`(function () {
      var p = window.__ce180.parsed;
      var entry = p.sections[0].entries[0];
      var st = entry.data.state || {};
      var yaml = window.CraftEngineInterpreter.generateYAML(p);
      return {
        autoState: st['auto-state'],
        snake: st.auto_state,
        yaml: yaml,
      };
    })()`);
    check(c6.autoState === c5, 'C5 popup 确定 → auto-state 写回 (' + c5 + ' → got ' + c6.autoState + ')');
    check(!c6.snake, 'C6 无 auto_state 下划线键');
    check(c6.yaml.indexOf('auto-state: ' + c5) !== -1, 'C7 序列化保持 auto-state: ' + c5);

    // ---------- D. 内联方块 (item → behavior: block_item → block: 内联定义) ----------
    const itemContent = fs.readFileSync(f('resources/test/configuration/items/test.yml'), 'utf8');
    const itemPath = f('resources/test/configuration/items/test.yml').replace(/\\/g, '/');
    const it = await evalJS(`(function () {
      return window.CraftEngineInterpreter.detectFileType('items: {}\\n', '${itemPath}');
    })()`);
    check(it === 'craftengine', 'D1 items 文件 detectFileType → craftengine (got ' + it + ')');
    const d = await evalJS(`(function () {
      var container = document.createElement('div');
      document.body.appendChild(container);
      var content = ${JSON.stringify(itemContent)};
      var parsed = window.CraftEngineInterpreter.render('${itemPath}', content, container);
      window.__ce180i = { container: container, parsed: parsed };
      var tabs = container.querySelector('[data-sf-kind="tabs"][data-sf-path="behavior.block"]');
      function val(sel) { var el = tabs.querySelector(sel); return el ? el.value : null; }
      function chk(sel) { var el = tabs.querySelector(sel); return el ? el.checked : null; }
      var btns = tabs ? Array.prototype.slice.call(tabs.querySelectorAll('.ce-sf-subtab-btn')).map(function (b) { return b.textContent; }) : [];
      return {
        hasTabs: !!tabs,
        btns: btns,
        collapses: tabs ? tabs.querySelectorAll('.ce-sf-collapse').length : -1,
        hardness: val('input[data-sf-path="behavior.block.settings.hardness"]'),
        pushReaction: val('select[data-sf-path="behavior.block.settings.push-reaction"]'),
        randomTick: chk('input[data-sf-path="behavior.block.settings.is-randomly-ticking"]'),
        correctTools: val('textarea[data-sf-path="behavior.block.settings.correct-tools"]'),
        stateBtn: tabs ? tabs.querySelector('[data-sf-subtab="state"]') : null,
        settingsBtn: tabs ? tabs.querySelector('[data-sf-subtab="settings"]') : null,
      };
    })()`);
    check(d.hasTabs, 'D2 内联方块渲染为选项卡 (behavior.block)');
    check(d.btns.length >= 4 && d.btns.indexOf('设置') !== -1 && d.btns.indexOf('行为') !== -1, 'D3 选项卡含 状态/设置/行为/掉落/自定义 (got ' + d.btns.join(',') + ')');
    check(d.collapses === 0, 'D4 内联方块内无「其他字段」折叠 (got ' + d.collapses + ')');
    check(d.hardness === '10', 'D5 settings.hardness = 10 (got ' + d.hardness + ')');
    check(d.pushReaction === 'NORMAL', 'D6 settings.push-reaction = NORMAL (got ' + d.pushReaction + ')');
    check(d.randomTick === false, 'D7 settings.is-randomly-ticking 渲染 (got ' + d.randomTick + ')');
    check(d.correctTools !== null && d.correctTools.indexOf('minecraft:wooden_pickaxe') !== -1, 'D8 correct-tools 含 wooden_pickaxe (got ' + d.correctTools + ')');
    // E. 选项卡切换 + state popup + 写回
    const e1 = await evalJS(`(function () {
      var tabs = window.__ce180i.container.querySelector('[data-sf-kind="tabs"][data-sf-path="behavior.block"]');
      tabs.querySelector('[data-sf-subtab="settings"]').click();
      return tabs.querySelector('[data-sf-subtabpanel="settings"]').classList.contains('active');
    })()`);
    check(e1, 'E1 点击「设置」→ 面板切换 active');
    const e2 = await evalJS(`(function () {
      var c = window.__ce180i.container;
      var btn = c.querySelector('[data-sf-action="popup-edit"][data-sf-path="behavior.block.state"]');
      if (btn) btn.click();
      return !!btn;
    })()`);
    check(e2, 'E2 state popup 按钮存在 (behavior.block.state)');
    check(await waitFor(`document.getElementById('ce-popup-modal') ? true : false`), 'E3 popup 弹窗打开');
    const e4 = await evalJS(`(function () {
      var m = document.getElementById('ce-popup-modal');
      var sel = m.querySelector('select[data-sf-path="__popup__.auto-state"][data-sf-kind="field"]');
      return sel ? sel.value : null;
    })()`);
    check(e4 === 'solid', 'E4 内联块 auto-state = solid (got ' + e4 + ')');
    await evalJS(`(function () {
      var m = document.getElementById('ce-popup-modal');
      m.querySelector('[data-ce-popup="cancel"]').click();
      return true;
    })()`);
    const e5 = await evalJS(`(function () {
      var c = window.__ce180i.container;
      var p = window.__ce180i.parsed;
      var burnable = c.querySelector('input[data-sf-path="behavior.block.settings.burnable"]');
      burnable.checked = true;
      burnable.dispatchEvent(new Event('change', { bubbles: true }));
      var yaml = window.CraftEngineInterpreter.generateYAML(p);
      return {
        burnable: yaml.indexOf('burnable: true') !== -1,
        reaction: yaml.indexOf('push-reaction: NORMAL') !== -1,
        snakeLeak: yaml.indexOf('push_reaction') !== -1,
        randomLeak: yaml.indexOf('is_randomly_ticking') !== -1,
      };
    })()`);
    check(e5.burnable, 'E5 写回保持 burnable: true (连字符)');
    check(e5.reaction && !e5.snakeLeak, 'E6 写回保持 push-reaction, 无下划线泄漏');
    check(!e5.randomLeak, 'E7 无 is_randomly_ticking 下划线泄漏');

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
