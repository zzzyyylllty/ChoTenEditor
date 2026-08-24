// v1.0.92 冒烟: 窗口系统 (WindowManager) + MiniMessage 编辑器窗口化
// 验证: 窗口创建/无遮罩/拖动/关闭/聚焦层级; MiniMessage 打开为窗口/保存回填/详细弹窗
const { app, BrowserWindow } = require('electron');
const path = require('path');
require('./main.js');
app.disableHardwareAcceleration();

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
    const evalJS = (expr) => win.webContents.executeJavaScript(expr);

    let fails = 0;
    function check(cond, msg) {
      console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
      if (!cond) fails++;
    }

    // ---------- A. 窗口系统: 创建窗口, 无遮罩 ----------
    // 注意: 不返回 DOM 元素 (不可 IPC 克隆)
    const a = await evalJS(`(function () {
      WindowManager.open({ title: '测试窗口', content: '<div id="test-content">Hello</div>', width: 400, height: 300 });
      var els = document.querySelectorAll('.cw-window');
      var hasOverlay = !!document.querySelector('.mini-overlay');
      var hasBackdrop = !!document.querySelector('.mini-modal');
      var w = WindowManager.windows[0];
      var title = w.el.querySelector('.cw-title').textContent;
      var bodyText = w.body.querySelector('#test-content').textContent;
      return { ok: els.length === 1, title: title, bodyText: bodyText, hasOverlay: hasOverlay, hasBackdrop: hasBackdrop };
    })()`);
    check(a.ok, 'A1 窗口已创建 (got ' + (a.ok ? '1' : '0') + ' .cw-window)');
    check(a.title === '测试窗口', 'A2 标题正确 (got ' + a.title + ')');
    check(a.bodyText === 'Hello', 'A3 内容正确 (got ' + a.bodyText + ')');
    check(!a.hasOverlay && !a.hasBackdrop, 'A4 无遮罩 (无 .mini-overlay / .mini-modal)');

    // ---------- B. 拖动: mousedown + mousemove → left/top 变化 ----------
    const b = await evalJS(`(function () {
      var w = WindowManager.windows[0];
      var tbar = w.el.querySelector('.cw-titlebar');
      var origLeft = w.el.offsetLeft, origTop = w.el.offsetTop;
      tbar.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 50, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 100 }));
      document.dispatchEvent(new MouseEvent('mouseup'));
      return new Promise(function (resolve) {
        setTimeout(function () {
          var L = w.el.offsetLeft, T = w.el.offsetTop;
          resolve({ ok: L !== origLeft || T !== origTop, origLeft: origLeft, origTop: origTop, newLeft: L, newTop: T });
        }, 50);
      });
    })()`);
    check(b.ok, 'B1 拖动后位置变化 (was ' + b.origLeft + ',' + b.origTop + ' now ' + b.newLeft + ',' + b.newTop + ')');

    // ---------- C. 关闭: 点 ✕ → DOM 移除 + onClose 回调 ----------
    const c = await evalJS(`(function () {
      // 先关掉之前测试留下的窗口
      var all = WindowManager.windows;
      for (var i = 0; i < all.length; i++) all[i].close();
      var closed = false;
      WindowManager.open({ title: '测试关闭', content: 'x', width: 200, height: 100, onClose: function () { closed = true; } });
      var w = WindowManager.windows[0];
      w.el.querySelector('.cw-close').click();
      var exists = document.body.contains(w.el);
      return { ok: !exists && closed, closed: closed, exists: exists };
    })()`);
    check(c.ok, 'C1 关闭: DOM 移除 + onClose 触发 (got exists=' + !!c.exists + ' closed=' + !!c.closed + ')');

    // ---------- D. MiniMessage: 打开为窗口 → 保存回填 ----------
    const d = await evalJS(`(function () {
      var savedValue = null;
      MiniMessageEditor.open('<red>Hello</red>', function (out) { savedValue = out; });
      var winEl = document.querySelector('.cw-window.cw-mini');
      if (!winEl) return { ok: false, why: 'no cw-mini' };
      var inp = document.getElementById('mini-input');
      if (!inp) return { ok: false, why: 'no mini-input' };
      var isWindow = !!winEl && !document.querySelector('.mini-overlay');
      // 修改值并保存
      inp.value = '<green>World</green>';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      var saveBtn = document.getElementById('mini-save');
      saveBtn.click();
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ ok: savedValue === '<green>World</green>', savedValue: savedValue, isWindow: isWindow, winGone: !document.body.contains(winEl) });
        }, 100);
      });
    })()`);
    check(d.ok, 'D1 MiniMessage 窗口: 保存回填 (got ' + JSON.stringify(d.savedValue) + ')');
    check(d.isWindow, 'D2 非 overlay 窗口 (no .mini-overlay)');
    check(d.winGone, 'D3 保存后窗口关闭');

    // ---------- E. 详细添加: 窗口内弹层 ----------
    const e = await evalJS(`(function () {
      MiniMessageEditor.open('test', function () {});
      var winEl = document.querySelector('.cw-window.cw-mini');
      if (!winEl) return { ok: false, why: 'no window' };
      // 模拟点击标签按钮打开详细添加
      var tagBtn = winEl.querySelector('.mini-tag-btn');
      if (!tagBtn) return { ok: false, why: 'no tag btn' };
      tagBtn.click();
      var layer = winEl.querySelector('.mini-detail-layer');
      var isInWindow = !!layer && winEl.contains(layer);
      var isFullscreen = !!document.querySelector('.mini-overlay.is-top');
      // 关闭详细弹窗
      var closeBtn = layer ? layer.querySelector('#mini-detail-close') : null;
      if (closeBtn) closeBtn.click();
      // 关闭主窗口
      var closeWin = winEl.querySelector('.cw-close');
      if (closeWin) closeWin.click();
      return { ok: isInWindow, isInWindow: isInWindow, isFullscreen: isFullscreen };
    })()`);
    check(e.ok, 'E1 详细添加在窗口内弹层 (非全屏 is-top)');

    // ---------- F. 聚焦层级: 后打开窗口 z-index 更高 ----------
    const f = await evalJS(`(function () {
      var w1 = WindowManager.open({ title: 'W1', content: '1', width: 200, height: 100 });
      var w2 = WindowManager.open({ title: 'W2', content: '2', width: 200, height: 100 });
      var z1 = parseInt(w1.el.style.zIndex, 10);
      var z2 = parseInt(w2.el.style.zIndex, 10);
      w1.close(); w2.close();
      return { ok: z2 > z1, z1: z1, z2: z2 };
    })()`);
    check(f.ok, 'F1 后打开窗口 z-index 更高 (got ' + f.z1 + ' vs ' + f.z2 + ')');

    console.log('fails=' + fails);
    win.destroy();
  } catch (e) {
    console.log('ERR', e && e.stack || e);
    console.log('fails=1');
  }
  app.exit(0);
});