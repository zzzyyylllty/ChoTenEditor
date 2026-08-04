// v1.0.68 冒烟: Twemoji 图标替换
//  1. index.html 主界面 emoji 替换为 img.ce-emoji (图片可加载)
//  2. 缺失字符 (箭头/几何/✓✕等, twemoji 无对应 SVG) 保持原文本
//  3. select/option、contenteditable 等受保护区不被替换
//  4. MutationObserver 对动态插入的 emoji 生效
//  5. settings.html 同样替换
//  6. 截图保存到 _ce_tmp/ 供人工查看
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 注册全部 ipcMain handler (设置页启动依赖 ai:loadPrompts 等)
require('./main.js');

// 测试环境 GPU 不稳 (UnknownVizError / ERR_FAILED), 走软件合成保证截图与加载稳定
app.disableHardwareAcceleration();

let fails = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!cond) fails++;
}

app.whenReady().then(async () => {
  try {
    // ---------- A. index.html ----------
    const win = new BrowserWindow({
      show: true, width: 1280, height: 860,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false,
        nodeIntegrationInSubFrames: true,
      },
    });
    await win.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 2500));

    const r = await win.webContents.executeJavaScript(`(async function () {
      var out = {};
      await new Promise(function (r) { setTimeout(r, 800); }); // 等图片加载
      var imgs = Array.prototype.slice.call(document.querySelectorAll('img.ce-emoji'));
      out.imgCount = imgs.length;
      out.broken = imgs.filter(function (i) { return i.complete && i.naturalWidth === 0; }).length;
      var btn = document.getElementById('open-project-btn');
      out.btnHasImg = !!(btn && btn.querySelector('img.ce-emoji'));
      out.btnRawEmoji = btn && btn.textContent.indexOf('📁') !== -1;
      // 缺失字符保持文本: 标题栏最大化按钮 □ (U+25A1 twemoji 无)
      var mx = document.getElementById('tb-maximize');
      out.maxText = mx && mx.textContent;
      // select 保护: 类型选择下拉内无 img
      var sel = document.getElementById('interpreter-type-select');
      out.selHasImg = !!(sel && sel.querySelector('img'));
      // contenteditable 保护
      var ce = document.createElement('div');
      ce.setAttribute('contenteditable', 'true');
      ce.textContent = '编辑内容 📦 不应替换';
      document.body.appendChild(ce);
      out.ceKept = ce.querySelectorAll('img.ce-emoji').length === 0;
      // MutationObserver 动态插入
      var dyn = document.createElement('div');
      dyn.id = 'ce-dyn-test';
      dyn.textContent = '动态 ⚙️ 插入 📦';
      document.body.appendChild(dyn);
      await new Promise(function (r) { setTimeout(r, 200); });
      out.dynReplaced = dyn.querySelectorAll('img.ce-emoji').length === 2;
      return out;
    })()`);

    check(r.imgCount > 10, '主界面 .ce-emoji 数量 ' + r.imgCount + ' (期望 > 10)');
    check(r.broken === 0, 'ce-emoji 图片全部可加载 (broken=' + r.broken + ')');
    check(r.btnHasImg && !r.btnRawEmoji, '打开项目按钮: 已替换为 img 且无残留 emoji 字符 (hasImg=' + r.btnHasImg + ', rawEmoji=' + r.btnRawEmoji + ')');
    check(r.maxText.indexOf('□') !== -1, '缺失字符 □ 保持文本 (实际: ' + JSON.stringify(r.maxText) + ')');
    check(r.selHasImg === false, 'select 下拉未被替换 (selHasImg=' + r.selHasImg + ')');
    check(r.ceKept === true, 'contenteditable 编辑器内容未替换');
    check(r.dynReplaced === true, 'MutationObserver 动态插入生效 (dynReplaced=' + r.dynReplaced + ')');

    const imgMain = await win.webContents.capturePage();
    fs.mkdirSync(path.join(__dirname, '_ce_tmp'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '_ce_tmp', 'emoji-main.png'), imgMain.toPNG());

    // ---------- B. settings.html ----------
    const winS = new BrowserWindow({
      show: true, width: 900, height: 700,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false,
      },
    });
    winS.webContents.on('did-fail-load', (e, code, desc, url) => console.log('[winS] did-fail-load', code, desc, url));
    winS.webContents.on('render-process-gone', (e, d) => console.log('[winS] render-process-gone', JSON.stringify(d)));
    await winS.loadFile(path.join(__dirname, 'settings.html'));
    await new Promise(r => setTimeout(r, 2000));

    const rs = await winS.webContents.executeJavaScript(`(function () {
      var out = {};
      var imgs = document.querySelectorAll('img.ce-emoji');
      out.imgCount = imgs.length;
      var broken = 0;
      imgs.forEach(function (i) { if (i.complete && i.naturalWidth === 0) broken++; });
      out.broken = broken;
      var tb = document.querySelector('.title-bar-icon');
      out.tbReplaced = !!(tb && tb.querySelector('img.ce-emoji'));
      return out;
    })()`);
    check(rs.imgCount > 3, 'settings.html .ce-emoji 数量 ' + rs.imgCount + ' (期望 > 3)');
    check(rs.broken === 0, 'settings 图片全部可加载 (broken=' + rs.broken + ')');
    check(rs.tbReplaced === true, '设置标题栏 ⚙️ 已替换 (tbReplaced=' + rs.tbReplaced + ')');

    const imgSettings = await winS.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '_ce_tmp', 'emoji-settings.png'), imgSettings.toPNG());

    win.destroy();
    winS.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
