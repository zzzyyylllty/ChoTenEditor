// v1.0.69 冒烟: 左侧文件列表 VSCode 风格可折叠树
//  1. 懒加载 (首次展开才读目录, 无 .tree-children 子项)
//  2. 展开/折叠 (箭头 rotate 90°, children display 切换)
//  3. 嵌套缩进 (getBoundingClientRect().left 逐层递增)
//  4. 展开状态持久化 (localStorage ceTreeExpanded + 重载自动恢复)
//  5. 文件点击打开 (openFile 流程)
//  6. 空目录占位行 + 箭头隐藏
//  7. 删除文件 + 刷新 (refreshTree 保留展开状态)
//  8. 右键选中 → 显示删除按钮
//  9. 图标为 twemoji img (📁/📄)
// 注: 路径经 JSON.stringify 嵌入脚本, 定位节点用 dataset.path 对比
//     (CSS 属性选择器会把 \t 等反斜杠当作转义, 无法匹配 Windows 路径)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 注册全部 ipcMain handler
require('./main.js');

// 测试环境 GPU 不稳, 走软件合成
app.disableHardwareAcceleration();

const FIXTURE = path.join(__dirname, '_ce_tmp', 'tree_fixture');
const f = (p) => path.join(FIXTURE, p);
const P = (p) => JSON.stringify(p);

// 页面内通用定位 helper (注入到每个脚本开头)
const H = 'function findRow(p){var r=document.querySelectorAll(".tree-row");for(var i=0;i<r.length;i++){if(r[i].dataset.path===p)return r[i];}return null;}function findLi(p){var it=document.querySelectorAll("li.tree-item");for(var i=0;i<it.length;i++){if(it[i].dataset.path===p)return it[i];}return null;}';

// 重建 fixture (幂等)
fs.rmSync(FIXTURE, { recursive: true, force: true });
fs.mkdirSync(f('dir1/sub'), { recursive: true });
fs.mkdirSync(f('dir2'), { recursive: true });
fs.mkdirSync(f('empty_dir'), { recursive: true });
fs.writeFileSync(f('a.yml'), 'items:\n  default:a:\n    material: paper\n');
fs.writeFileSync(f('dir1/b.yml'), 'x: 1\n');
fs.writeFileSync(f('dir1/sub/c.yml'), 'y: 2\n');
fs.writeFileSync(f('dir2/d.yml'), 'z: 3\n');

let fails = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!cond) fails++;
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: true, width: 1280, height: 860,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false,
        nodeIntegrationInSubFrames: true,
      },
    });
    await win.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 2000));

    // 注入状态并重载: 跳过欢迎弹窗 + 指向 fixture 项目
    await win.webContents.executeJavaScript(`(function () {
      var v = (window.electronAPI && window.electronAPI.appVersion) || '1.0.0';
      sessionStorage.setItem('welcomeShown', v);
      localStorage.setItem('welcomeDismissed', v);
      localStorage.setItem('editorConfig', JSON.stringify({ language: 'zh_cn', theme: 'dark', editor: { theme: 'dracula', fontSize: '14' } }));
      localStorage.setItem('appState', JSON.stringify({ currentProjectPath: ${P(FIXTURE)}, currentFile: null, openTabs: [], activeTab: null }));
      localStorage.removeItem('ceTreeExpanded');
      return true;
    })()`);
    await win.webContents.executeJavaScript(`location.reload(); true;`).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));

    async function waitFor(expr, timeout, step) {
      timeout = timeout || 10000;
      step = step || 150;
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        let v = false;
        try { v = await win.webContents.executeJavaScript(H + expr); } catch (e) { v = false; }
        if (v) return true;
        await new Promise(r => setTimeout(r, step));
      }
      return false;
    }
    async function evalJS(expr) {
      return win.webContents.executeJavaScript(H + expr);
    }

    // ---------- A. 根渲染 (懒加载) ----------
    check(await waitFor(`document.querySelectorAll('.file-tree > li.tree-item').length === 4`), 'A1 根渲染: 4 个顶层行');
    const a = await evalJS(`(function () {
      var items = Array.prototype.slice.call(document.querySelectorAll('.file-tree > li.tree-item'));
      return {
        names: items.map(function (li) { return li.querySelector('.tree-label').textContent; }).sort().join(','),
        expanded: document.querySelectorAll('li.tree-item.expanded').length,
        dirs: items.filter(function (li) { return li.classList.contains('directory'); }).length,
        childUlCount: document.querySelectorAll('.file-tree .tree-children > li').length,
        icons: Array.prototype.slice.call(document.querySelectorAll('.file-tree .tree-icon img.ce-emoji')).map(function (i) { return i.alt; }).sort().join(','),
        hasNav: !!document.querySelector('.sidebar-nav'),
        hasBreadcrumbs: !!document.getElementById('breadcrumbs'),
      };
    })()`);
    check(a.names === 'a.yml,dir1,dir2,empty_dir', 'A2 顶层名称: ' + a.names);
    check(a.dirs === 3, 'A3 目录行 3 个 (dir1/dir2/empty_dir)');
    check(a.expanded === 0, 'A4 初始无展开节点');
    check(a.childUlCount === 0, 'A5 懒加载: 初始无子行');
    check(a.icons === '📁,📁,📁,📄', 'A6 图标替换为 twemoji img (yml 保持 📄, 目录→📁; alt=' + a.icons + ')');
    check(a.hasNav === false && a.hasBreadcrumbs === false, 'A7 面包屑/导航 UI 已移除');

    // ---------- B. 展开 dir1 ----------
    check(await waitFor(`(function () {
      var row = findRow(${P(f('dir1'))});
      if (!row) return false;
      row.click();
      return true;
    })()`), 'B1 点击 dir1 行');
    check(await waitFor(`(function () {
      var li = findLi(${P(f('dir1'))});
      return !!li && li.classList.contains('expanded') &&
        !li.classList.contains('loading') &&
        li.querySelectorAll(':scope > .tree-children > li.tree-item').length === 2;
    })()`), 'B2 懒加载完成: dir1 展开 + 2 个子行 (b.yml, sub)');
    await new Promise(r => setTimeout(r, 350)); // 等箭头过渡结束
    const b = await evalJS(`(function () {
      var li = findLi(${P(f('dir1'))});
      var arrow = li.querySelector(':scope > .tree-row .tree-arrow');
      var ch = li.querySelector(':scope > .tree-children');
      return {
        transform: getComputedStyle(arrow).transform,
        chDisplay: getComputedStyle(ch).display,
      };
    })()`);
    check(b.transform !== 'none' && b.transform !== 'matrix(1, 0, 0, 1, 0, 0)', 'B3 箭头旋转 90° (transform=' + b.transform + ')');
    check(b.chDisplay === 'block', 'B4 children display=block');

    // ---------- C. 嵌套展开 + 缩进 ----------
    check(await waitFor(`(function () {
      var row = findRow(${P(f('dir1/sub'))});
      if (!row) return false;
      row.click();
      return true;
    })()`), 'C1 点击 sub 行');
    check(await waitFor(`(function () {
      var li = findLi(${P(f('dir1/sub'))});
      return !!li && li.classList.contains('expanded') && li.querySelectorAll(':scope > .tree-children > li.tree-item').length === 1;
    })()`), 'C2 sub 展开: c.yml 出现');
    const c = await evalJS(`(function () {
      var bRow = findRow(${P(f('dir1/b.yml'))});
      var cRow = findRow(${P(f('dir1/sub/c.yml'))});
      return { bLeft: bRow.getBoundingClientRect().left, cLeft: cRow.getBoundingClientRect().left };
    })()`);
    check(c.cLeft > c.bLeft + 10, 'C3 嵌套缩进: c.yml 左移 > b.yml 10px (diff=' + (c.cLeft - c.bLeft).toFixed(1) + ')');

    // ---------- D. 折叠 ----------
    await evalJS(`findRow(${P(f('dir1'))}).click(); true;`).catch(() => {});
    check(await waitFor(`(function () {
      var li = findLi(${P(f('dir1'))});
      return !!li && !li.classList.contains('expanded') &&
        getComputedStyle(li.querySelector(':scope > .tree-children')).display === 'none';
    })()`), 'D1 折叠: 无 .expanded 且 children display=none');

    // ---------- E. 持久化: ceTreeExpanded + 重载恢复 ----------
    await evalJS(`findRow(${P(f('dir1'))}).click(); true;`).catch(() => {});
    check(await waitFor(`(function () {
      var li = findLi(${P(f('dir1'))});
      return !!li && li.classList.contains('expanded') && !li.classList.contains('loading');
    })()`), 'E1 再次展开 dir1 (准备持久化)');
    const e1 = await evalJS(`(function () {
      var map = JSON.parse(localStorage.getItem('ceTreeExpanded') || '{}');
      var arr = map[${P(FIXTURE)}] || [];
      return { hasDir1: arr.indexOf(${P(f('dir1'))}) >= 0, hasSub: arr.indexOf(${P(f('dir1/sub'))}) >= 0, raw: localStorage.getItem('ceTreeExpanded') };
    })()`);
    check(e1.hasDir1 && e1.hasSub, 'E2 展开状态已持久化到 ceTreeExpanded');
    await win.webContents.executeJavaScript(`location.reload(); true;`).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));
    check(await waitFor(`(function () {
      var li = findLi(${P(f('dir1/sub/c.yml'))});
      return !!li && li.offsetParent !== null && document.querySelectorAll('li.tree-item.expanded').length === 2;
    })()`), 'E3 重载后自动恢复展开: dir1+sub 展开且 c.yml 可见');

    // ---------- F. 文件打开 ----------
    await evalJS(`findRow(${P(f('a.yml'))}).click(); true;`).catch(() => {});
    check(await waitFor(`window.appState.currentFile === ${P(f('a.yml'))}`), 'F1 点击 a.yml → currentFile 正确');
    const f1 = await evalJS(`window.appState.openTabs.indexOf(${P(f('a.yml'))}) >= 0`);
    check(f1, 'F2 openTabs 含 a.yml');

    // ---------- G. 空目录 ----------
    await evalJS(`findRow(${P(f('empty_dir'))}).click(); true;`).catch(() => {});
    check(await waitFor(`(function () {
      var li = findLi(${P(f('empty_dir'))});
      return !!li && li.querySelector(':scope > .tree-children .empty-row');
    })()`), 'G1 空目录展开: 占位行出现');
    const g = await evalJS(`(function () {
      var li = findLi(${P(f('empty_dir'))});
      var arrow = li.querySelector(':scope > .tree-row .tree-arrow');
      return { arrowHidden: getComputedStyle(arrow).visibility === 'hidden', label: li.querySelector('.empty-row .tree-label').textContent };
    })()`);
    check(g.arrowHidden, 'G2 空目录箭头隐藏 (visibility=hidden)');
    check(g.label === '空文件夹', 'G3 占位文案: ' + g.label);

    // ---------- H. 删除 + 刷新 ----------
    await evalJS(`findRow(${P(f('dir2'))}).click(); true;`).catch(() => {});
    check(await waitFor(`(function () {
      var li = findLi(${P(f('dir2'))});
      return !!li && li.classList.contains('expanded') && !!findLi(${P(f('dir2/d.yml'))});
    })()`), 'H1 展开 dir2: d.yml 可见');
    fs.unlinkSync(f('dir2/d.yml'));
    await evalJS(`document.getElementById('fm-reload').click(); true;`).catch(() => {});
    check(await waitFor(`(function () {
      var li = findLi(${P(f('dir2'))});
      var gone = !findLi(${P(f('dir2/d.yml'))});
      return !!li && li.classList.contains('expanded') && gone;
    })()`), 'H2 刷新后 dir2 仍展开且 d.yml 消失');

    // ---------- I. 右键选中 ----------
    await evalJS(`(function () {
      findRow(${P(f('a.yml'))}).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    const i1 = await evalJS(`(function () {
      return {
        selected: !!document.querySelector('.file-tree .tree-row.selected'),
        delVisible: document.getElementById('fm-delete').style.display !== 'none',
      };
    })()`);
    check(i1.selected, 'I1 右键选中行 (.tree-row.selected)');
    check(i1.delVisible, 'I2 删除按钮显示');

    // 截图供人工查看
    fs.mkdirSync(path.join(__dirname, '_ce_tmp'), { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '_ce_tmp', 'tree-v169.png'), img.toPNG());

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
