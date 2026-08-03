// v1.0.58 冒烟: 原生 title 全部替换为自定义 data-tip tooltip (RichTooltip 委托)
const { app, BrowserWindow } = require('electron');
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
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    await win.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 1500));

    const r = await win.webContents.executeJavaScript(`(function () {
      var out = {};
      var ve = document.getElementById('visual-editor');
      var yaml = [
        'items:',
        '  demo:t:',
        '    material: !!long 1234'
      ].join('\\n');
      var parsed = CraftEngineInterpreter.render('smoke.yml', yaml, ve, {});
      // 1. 静态 HTML 按钮: data-tip 替换 title
      var tbClose = document.getElementById('tb-close');
      out.tbDataTip = tbClose.getAttribute('data-tip') === '关闭';
      out.tbNoTitle = !tbClose.hasAttribute('title');
      // 2. 动态渲染: spec-icon 带 data-tip, 无 title
      var spec = ve.querySelector('.ce-sf-spec-icon');
      out.specDataTip = spec && spec.getAttribute('data-tip').indexOf('特殊配置') !== -1;
      out.specNoTitle = spec && !spec.hasAttribute('title');
      // 3. hover → 自定义 tooltip 显示
      spec.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 120, clientY: 120 }));
      var tip = document.querySelector('.rt-tooltip');
      out.tipShown = tip && tip.style.display === 'block';
      out.tipContent = tip ? tip.textContent : '';
      // 4. 移出 → 隐藏
      spec.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      out.tipHidden = !tip || tip.style.display === 'none';
      // 5. tooltip 内容为自定义样式层 (非原生)
      out.tipClass = tip ? tip.className : '';
      return out;
    })()`);
    check(r.tbDataTip && r.tbNoTitle, '静态按钮 tb-close: data-tip 替换 title');
    check(r.specDataTip && r.specNoTitle, '动态 spec-icon: data-tip 替换 title');
    check(r.tipShown, 'hover → .rt-tooltip 显示');
    check(r.tipContent.indexOf('特殊配置') !== -1, 'tooltip 内容正确 (含「特殊配置」)');
    check(r.tipHidden, '移出 → tooltip 隐藏');
    check(r.tipClass === 'rt-tooltip', '使用自定义 tooltip 层');

    // 6. settings iframe 内按钮也已替换
    const rs = await win.webContents.executeJavaScript(`(function () {
      var f = document.getElementById('st-frame');
      if (!f || !f.contentDocument) return { ready: false };
      var d = f.contentDocument;
      var btn = d.getElementById('tb-minimize');
      return { ready: true, dataTip: btn ? btn.getAttribute('data-tip') : null, noTitle: btn ? !btn.hasAttribute('title') : false };
    })()`);
    check(rs.ready && rs.dataTip === '最小化' && rs.noTitle, 'settings iframe 按钮 data-tip 替换 title');
    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
