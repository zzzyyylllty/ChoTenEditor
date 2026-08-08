// v1.0.85 冒烟: 对话/任务卡片展开状态在重渲染 (添加选项等) 后保留
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('./main.js');
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'tree_fixture');
const f = (p) => path.join(FIXTURE, p);
fs.rmSync(FIXTURE, { recursive: true, force: true });
fs.mkdirSync(f('resources/test/configuration/conversation'), { recursive: true });
fs.mkdirSync(f('resources/test/configuration/quest'), { recursive: true });

const CONV = [
  '__option__:',
  '  theme: chat',
  'dialogue_a:',
  '  npc: 你好A',
  '  player:',
  '    - reply: 选项1',
  '      then: close',
  '    - reply: 选项2',
  '      then: say hello',
  'dialogue_b:',
  '  npc: 你好B',
  '  player:',
  '    - reply: 选项B',
  'dialogue_c:',
  '  npc: 你好C',
].join('\n') + '\n';
fs.writeFileSync(f('resources/test/configuration/conversation/test.yml'), CONV);

const QUEST = [
  'quest_one:',
  '  meta:',
  '    name: 任务一',
  '    type: L1',
  '  agent:',
  '    accept: |',
  '      say 接受',
  'quest_two:',
  '  meta:',
  '    name: 任务二',
].join('\n') + '\n';
fs.writeFileSync(f('resources/test/configuration/quest/test.yml'), QUEST);

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

    // ---------- A. 对话: 展开卡片 → 添加选项 → 展开状态保留 ----------
    const convPath = f('resources/test/configuration/conversation/test.yml').replace(/\\/g, '/');
    const a = await evalJS(`(function () {
      var container = document.createElement('div');
      document.body.appendChild(container);
      var parsed = window.ChemdahInterpreter.render('${convPath}', ${JSON.stringify(CONV)}, container);
      window.__cv182 = { container: container, parsed: parsed };
      var cards = container.querySelectorAll('.cv-dialogue-card');
      return {
        n: cards.length,
        collapsed: Array.prototype.map.call(cards, c => c.classList.contains('collapsed')).join(','),
      };
    })()`);
    check(a.n === 3, 'A1 渲染 3 个对话卡片 (got ' + a.n + ')');
    check(a.collapsed === 'true,true,true', 'A2 初始全部折叠 (got ' + a.collapsed + ')');

    // 展开 A, 添加选项
    const a2 = await evalJS(`(function () {
      var c = window.__cv182.container;
      c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_a"] .cv-header-toggle-area').click();
      c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_a"] [data-action="add-option"]').click();
      var cards = c.querySelectorAll('.cv-dialogue-card');
      return {
        collapsed: Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(','),
        optCount: c.querySelectorAll('.cv-dialogue-card[data-dialogue="dialogue_a"] .cv-player-option').length,
      };
    })()`);
    check(a2.collapsed === 'false,true,true', 'A3 展开A后添加选项, A 保持展开 (got ' + a2.collapsed + ')');
    check(a2.optCount === 3, 'A4 新选项已添加 (got ' + a2.optCount + ')');

    // 再展开 B, 再添加选项 → A 和 B 都保持
    const a3 = await evalJS(`(function () {
      var c = window.__cv182.container;
      c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_b"] .cv-header-toggle-area').click();
      c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_b"] [data-action="add-option"]').click();
      var cards = c.querySelectorAll('.cv-dialogue-card');
      return Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(',');
    })()`);
    check(a3 === 'false,false,true', 'A5 A/B 都保持展开, C 仍折叠 (got ' + a3 + ')');

    // 折叠 A → 再添加选项 → A 保持折叠
    const a4 = await evalJS(`(function () {
      var c = window.__cv182.container;
      c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_a"] .cv-header-toggle-area').click();
      c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_a"] [data-action="add-option"]').click();
      var cards = c.querySelectorAll('.cv-dialogue-card');
      return Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(',');
    })()`);
    check(a4 === 'true,false,true', 'A6 折叠A后添加选项, A 保持折叠 (got ' + a4 + ')');

    // 侧栏导航打开 C → 重渲染后 C 保持展开
    const a5 = await evalJS(`(function () {
      var c = window.__cv182.container;
      c.querySelector('.cv-sidebar-item[data-sidebar-dialogue="dialogue_c"]').click();
      c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_c"] [data-action="add-option"]').click();
      var cards = c.querySelectorAll('.cv-dialogue-card');
      return Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(',');
    })()`);
    check(a5 === 'true,false,false', 'A7 侧栏导航打开的 C 在添加选项后保持展开 (got ' + a5 + ')');

    // 展开 A → 重命名 A → 状态转移到新名并保持展开
    const a6 = await evalJS(`(function () {
      var c = window.__cv182.container;
      c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_a"] .cv-header-toggle-area').click();
      var inp = c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_a"] input[data-field="dialogue.name"]');
      inp.value = 'dialogue_a_new';
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_a_new"] [data-action="add-option"]').click();
      var cards = c.querySelectorAll('.cv-dialogue-card');
      var collapsed = Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(',');
      return { collapsed: collapsed, names: Array.prototype.map.call(cards, x => x.dataset.dialogue).join(',') };
    })()`);
    check(a6.collapsed === 'false,false,false', 'A8 重命名后展开状态转移 (got ' + a6.collapsed + ')');
    check(a6.names.indexOf('dialogue_a_new') !== -1, 'A9 重命名生效 (got ' + a6.names + ')');

    // 删除对话 → 剩余卡片状态正常
    const a7 = await evalJS(`(function () {
      var c = window.__cv182.container;
      c.querySelector('.cv-dialogue-card[data-dialogue="dialogue_a_new"] [data-action="delete-dialogue"]').click();
      var cards = c.querySelectorAll('.cv-dialogue-card');
      return Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(',');
    })()`);
    check(a7 === 'false,false', 'A10 删除展开的卡片后, 其余状态正常 (got ' + a7 + ')');

    // ---------- B. 任务: 展开 → 添加 hook → 状态保留 ----------
    const questPath = f('resources/test/configuration/quest/test.yml').replace(/\\/g, '/');
    const b = await evalJS(`(function () {
      var container = document.createElement('div');
      document.body.appendChild(container);
      var parsed = window.ChemdahInterpreter.render('${questPath}', ${JSON.stringify(QUEST)}, container);
      window.__qv182 = { container: container, parsed: parsed };
      var cards = container.querySelectorAll('.qv-card');
      return Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(',');
    })()`);
    check(b === 'true,true', 'B1 任务卡片初始折叠 (got ' + b + ')');

    const b2 = await evalJS(`(function () {
      var c = window.__qv182.container;
      c.querySelector('.qv-card[data-q-index="0"] .qv-toggle-area').click();
      c.querySelector('.qv-card[data-q-index="0"] [data-action="q-add-agent-hook"]').click();
      var cards = c.querySelectorAll('.qv-card');
      return Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(',');
    })()`);
    check(b2 === 'false,true', 'B2 任务一展开后添加 hook, 保持展开 (got ' + b2 + ')');

    const b3 = await evalJS(`(function () {
      var c = window.__qv182.container;
      c.querySelector('.cv-sidebar-item[data-q-index="1"]').click();
      c.querySelector('.qv-card[data-q-index="1"] [data-action="q-add-agent-hook"]').click();
      var cards = c.querySelectorAll('.qv-card');
      return Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(',');
    })()`);
    check(b3 === 'false,false', 'B3 侧栏导航打开的任务二在添加 hook 后保持展开 (got ' + b3 + ')');

    // 折叠任务一 → 添加 hook → 保持折叠
    const b4 = await evalJS(`(function () {
      var c = window.__qv182.container;
      c.querySelector('.qv-card[data-q-index="0"] .qv-toggle-area').click();
      c.querySelector('.qv-card[data-q-index="0"] [data-action="q-add-agent-hook"]').click();
      var cards = c.querySelectorAll('.qv-card');
      return Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(',');
    })()`);
    check(b4 === 'true,false', 'B4 折叠任务一后添加 hook, 保持折叠 (got ' + b4 + ')');

    // ---------- C. 切换文件后状态不串 (新容器状态独立) ----------
    const c1 = await evalJS(`(function () {
      var c2 = document.createElement('div');
      document.body.appendChild(c2);
      window.ChemdahInterpreter.render('${convPath}', ${JSON.stringify(CONV)}, c2);
      var cards = c2.querySelectorAll('.cv-dialogue-card');
      return Array.prototype.map.call(cards, x => x.classList.contains('collapsed')).join(',');
    })()`);
    check(c1 === 'true,true,true', 'C1 新容器初始全部折叠 (got ' + c1 + ')');

    console.log('fails=' + fails);
    win.destroy();
  } catch (e) {
    console.log('ERR', e && e.stack || e);
    console.log('fails=' + (fails + 1));
  }
  app.exit(0);
});
