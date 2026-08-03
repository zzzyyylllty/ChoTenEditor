// v1.0.63 冒烟: Kether 编辑器全面 i18n / 背景文件名引号转义 / auto 主题跟随系统
const { app, BrowserWindow, nativeTheme } = require('electron');
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
      // backgroundThrottling:false 保证隐藏窗口也派发 prefers-color-scheme change 事件
      webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
    });
    await win.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 2000));

    // ---- 1. Kether 编辑器 i18n (zh_cn 默认) ----
    const r1 = await win.webContents.executeJavaScript(`(async function () {
      var out = {};
      var state = { confirmed: null };
      await window.KetherEditor.open('send "hello"', function (code) { state.confirmed = code; }, function () {});
      var o = document.getElementById('ke-editor-overlay');
      out.opened = !!o;
      if (!o) return out;
      out.title = o.querySelector('h2').textContent;
      out.back = o.querySelector('#ke-back').textContent;
      out.blocks = o.querySelector('#ke-mode-visual').textContent;
      out.code = o.querySelector('#ke-mode-code').textContent;
      out.confirm = o.querySelector('#ke-confirm').textContent;
      out.searchPh = o.querySelector('#ke-search').placeholder;
      out.actionCount = o.querySelector('.ke-header > span').textContent;
      out.visualRendered = !!o.querySelector('.ke-workspace');
      // 切代码模式 → textarea 含初始代码
      o.querySelector('#ke-mode-code').click();
      var ta = document.getElementById('ke-code-ta');
      out.codeModeTa = !!ta;
      out.codeTaVal = ta ? ta.value : '';
      // 切回积木模式
      o.querySelector('#ke-mode-visual').click();
      out.backToVisual = !!o.querySelector('.ke-workspace');
      // 确认 → onConfirm 回调 + 关闭
      o.querySelector('#ke-confirm').click();
      out.confirmCalled = state.confirmed !== null;
      out.confirmCode = state.confirmed;
      out.closedAfterConfirm = !document.getElementById('ke-editor-overlay');
      return out;
    })()`);
    check(r1.opened, 'Kether 编辑器可打开');
    check(r1.title === 'Kether 积木编辑器', '标题 i18n (实际: ' + r1.title + ')');
    check(r1.back === '← 返回', '返回按钮 i18n (实际: ' + r1.back + ')');
    check(r1.blocks === '🧊 积木', '积木按钮 i18n (实际: ' + r1.blocks + ')');
    check(r1.code === '📝 代码', '代码按钮 i18n (实际: ' + r1.code + ')');
    check(r1.confirm === '✓ 确定', '确定按钮 i18n (实际: ' + r1.confirm + ')');
    check(r1.searchPh === '搜索动作...', '搜索框 placeholder i18n (实际: ' + r1.searchPh + ')');
    check(/动作/.test(r1.actionCount) && parseInt(r1.actionCount) > 0, '动作定义加载完成 (实际: ' + r1.actionCount + ')');
    check(r1.visualRendered && r1.backToVisual, '积木模式渲染/切换正常');
    check(r1.codeModeTa && r1.codeTaVal.indexOf('send') !== -1, '代码模式初始代码 (实际: ' + r1.codeTaVal + ')');
    check(r1.confirmCalled && r1.confirmCode.indexOf('send') !== -1, '确认回调返回代码 (实际: ' + r1.confirmCode + ')');
    check(r1.closedAfterConfirm, '确认后编辑器关闭');

    // ---- 2. 语言切换 en_us 后重新打开 ----
    const r2 = await win.webContents.executeJavaScript(`(async function () {
      var out = {};
      await I18N.setLang('en_us');
      await window.KetherEditor.open('', function () {}, function () {});
      var o = document.getElementById('ke-editor-overlay');
      out.title = o ? o.querySelector('h2').textContent : '';
      out.back = o ? o.querySelector('#ke-back').textContent : '';
      out.blocks = o ? o.querySelector('#ke-mode-visual').textContent : '';
      out.searchPh = o ? o.querySelector('#ke-search').placeholder : '';
      out.actionCount = o ? o.querySelector('.ke-header > span').textContent : '';
      return out;
    })()`);
    check(r2.title === 'Kether Block Editor', 'en 标题 i18n (实际: ' + r2.title + ')');
    check(r2.back === '← Back', 'en 返回按钮 i18n (实际: ' + r2.back + ')');
    check(r2.blocks === '🧊 Blocks', 'en 积木按钮 i18n (实际: ' + r2.blocks + ')');
    check(r2.searchPh === 'Search actions...', 'en 搜索框 i18n (实际: ' + r2.searchPh + ')');
    check(r2.actionCount.indexOf('actions') !== -1, 'en 动作数量 i18n (实际: ' + r2.actionCount + ')');

    // ---- 3. 背景文件名引号转义 %22 (inline 脚本 + renderer.applyStoredConfig 两处) ----
    await win.webContents.executeJavaScript(`(function () {
      localStorage.setItem('editorConfig', JSON.stringify({ theme: 'dark', background: { filename: 'my"bg".png', opacity: 0.3 } }));
      return true;
    })()`);
    win.webContents.reload();
    await new Promise(r => setTimeout(r, 2500));
    const r3a = await win.webContents.executeJavaScript(`(function () {
      var bg = document.body.style.background;
      return { bg: bg, hasPct: bg.indexOf('%22') !== -1, hasRawQuote: bg.indexOf('my"bg"') !== -1, theme: document.body.getAttribute('data-theme') };
    })()`);
    check(r3a.theme === 'dark', 'dark 主题应用 (实际: ' + r3a.theme + ')');
    check(r3a.hasPct && !r3a.hasRawQuote, 'index.html 内联背景引号转义 %22 (实际: ' + r3a.bg + ')');
    const r3b = await win.webContents.executeJavaScript(`(function () {
      applyStoredConfig();
      var bg = document.body.style.background;
      return { bg: bg, hasPct: bg.indexOf('%22') !== -1, hasRawQuote: bg.indexOf('my"bg"') !== -1 };
    })()`);
    check(r3b.hasPct && !r3b.hasRawQuote, 'renderer.applyStoredConfig 背景引号转义 %22 (实际: ' + r3b.bg + ')');

    // ---- 4. auto 主题跟随系统 (nativeTheme 驱动 prefers-color-scheme) ----
    // 本环境 webContents.reload() 后 media query change 事件不再派发 (Electron 怪癖),
    // 因此用全新窗口 (仅首次加载) 验证实时监听
    nativeTheme.themeSource = 'dark';
    const win2 = new BrowserWindow({
      show: false, width: 1280, height: 860,
      webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
    });
    await win2.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 2000));
    const r4b = await win2.webContents.executeJavaScript(`(function () {
      localStorage.setItem('editorConfig', JSON.stringify({ theme: 'auto', background: {} }));
      applyStoredConfig();
      return { theme: document.body.getAttribute('data-theme'), mq: window.matchMedia('(prefers-color-scheme: light)').matches };
    })()`);
    check(r4b.theme === 'dark' && !r4b.mq, 'auto 基线: 系统深色 → 深色 (实际: ' + r4b.theme + ', mq=' + r4b.mq + ')');
    nativeTheme.themeSource = 'light';
    // 隐藏窗口下 change 事件延迟约 2s 派发, 等待需要足够长
    await new Promise(r => setTimeout(r, 2500));
    const r4l = await win2.webContents.executeJavaScript(`(function () {
      return { theme: document.body.getAttribute('data-theme'), mq: window.matchMedia('(prefers-color-scheme: light)').matches, cfgTheme: JSON.parse(localStorage.getItem('editorConfig')).theme };
    })()`);
    check(r4l.theme === 'light', 'auto 主题: 系统浅色 → 浅色 (实际: ' + r4l.theme + ', mq=' + r4l.mq + ')');
    check(r4l.cfgTheme === 'auto', '切换期间配置未被设置页 iframe 覆盖 (实际: ' + r4l.cfgTheme + ')');
    nativeTheme.themeSource = 'dark';
    await new Promise(r => setTimeout(r, 2500));
    const r4d = await win2.webContents.executeJavaScript(`(function () {
      return { theme: document.body.getAttribute('data-theme'), mq: window.matchMedia('(prefers-color-scheme: light)').matches };
    })()`);
    check(r4d.theme === 'dark', 'auto 主题: 系统深色 → 深色 (实际: ' + r4d.theme + ', mq=' + r4d.mq + ')');
    win2.destroy();

    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
