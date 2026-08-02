// v1.0.31 冒烟: MiniMessage 预览黑白切换 + 工具栏按钮左键详细添加/右键快速添加 + 字体等额外输入
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
        '  default:test:',
        '    material: paper',
        '    name: "Hello"'
      ].join('\\n');
      var parsed = CraftEngineInterpreter.render('smoke.yml', yaml, ve, {});
      var pencil = ve.querySelector('[data-sf-action="mini-edit"]');
      out.pencil = !!pencil;
      pencil.click();
      var ov = document.getElementById('mini-editor-overlay');
      out.editorOpen = !!ov;
      if (!ov) return out;
      var ta = ov.querySelector('#mini-input');
      ta.focus();
      ta.value = 'abc <b>def</b> ghi';
      ta.setSelectionRange(7, 10); // 选中 'def'

      // 1. 预览黑白切换
      var bgBtn = ov.querySelector('#mini-preview-bg');
      var preview = ov.querySelector('#mini-preview');
      out.bgBtn = !!bgBtn;
      out.bgDefault = preview.classList.contains('white-bg');
      bgBtn.click();
      out.bgAfter1 = preview.classList.contains('white-bg');
      out.bgStored = localStorage.getItem('miniPreviewBg') === 'white';
      bgBtn.click();
      out.bgAfter2 = !preview.classList.contains('white-bg');

      // 2. 左键粗体按钮 → 详细弹窗, 内容预填当前选区
      var boldBtn = ov.querySelectorAll('.mini-tag-btn')[0];
      boldBtn.click();
      var dt = document.getElementById('mini-detail-overlay');
      out.detailOpen = !!dt;
      if (dt) {
        out.contentPrefill = dt.querySelector('#mini-detail-content').value === 'def';
        out.title = dt.querySelector('#mini-detail-title').textContent;
        out.typePreselect = dt.querySelector('#mini-detail-type').value === 'bold';

        // 3. 切换到字体类型 → 额外输入(字体名+namespace)
        var typeSel = dt.querySelector('#mini-detail-type');
        typeSel.value = 'font';
        typeSel.dispatchEvent(new Event('change'));
        var fontInput = dt.querySelector('#mini-detail-font');
        var nsInput = dt.querySelector('#mini-detail-ns');
        out.fontInputs = !!fontInput && !!nsInput;
        fontInput.value = 'textname';
        nsInput.value = 'minecraft';
        dt.querySelector('#mini-detail-ok').click();
        out.insertedFont = ta.value.indexOf('<font:minecraft:textname>def</font>') !== -1;
        // 插入后选区 = 内容
        out.sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);

        // 4. 再开详细弹窗: namespace 留空 → <font:name>
        boldBtn.click();
        var dt2 = document.getElementById('mini-detail-overlay');
        var typeSel2 = dt2.querySelector('#mini-detail-type');
        typeSel2.value = 'font';
        typeSel2.dispatchEvent(new Event('change'));
        var f2 = dt2.querySelector('#mini-detail-font');
        var n2 = dt2.querySelector('#mini-detail-ns');
        f2.value = 'pixel';
        n2.value = '';
        dt2.querySelector('#mini-detail-ok').click();
        out.insertedFontNoNs = ta.value.indexOf('<font:pixel>') !== -1;

        // 5. 右键斜体按钮 → 直接快速添加 (不弹窗)
        var italicBtn = ov.querySelectorAll('.mini-tag-btn')[1];
        italicBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        out.quickItalic = ta.value.indexOf('<i>') !== -1;
        out.noDetailAfterRight = !document.getElementById('mini-detail-overlay');

        // 6. 详细: 渐变 + 颜色
        boldBtn.click();
        var dt3 = document.getElementById('mini-detail-overlay');
        var ts3 = dt3.querySelector('#mini-detail-type');
        ts3.value = 'gradient';
        ts3.dispatchEvent(new Event('change'));
        var ga = dt3.querySelector('#mini-detail-grad-a');
        var gb = dt3.querySelector('#mini-detail-grad-b');
        ga.value = '#ff0000';
        gb.value = '#00ff00';
        dt3.querySelector('#mini-detail-ok').click();
        out.gradient = ta.value.indexOf('<gradient:#ff0000:#00ff00>') !== -1;

        // 7. 右键颜色按钮 → 色板 (现有快速行为)
        var colorBtn = null;
        ov.querySelectorAll('.mini-tag-btn').forEach(function (b) {
          if (b.textContent === '🎨') colorBtn = b;
        });
        out.colorBtnFound = !!colorBtn;
        if (colorBtn) {
          colorBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
          var panel = colorBtn.parentNode.querySelector('.mini-color-panel');
          out.colorPanel = !!panel && panel.style.display !== 'none';
          out.noDetailForColor = !document.getElementById('mini-detail-overlay');
        }

        // 8. 关闭编辑器
        ov.querySelector('#mini-close').click();
        out.editorClosed = !document.getElementById('mini-editor-overlay');
      }
      return out;
    })()`);
    check(r.pencil && r.editorOpen, '✏️ 按钮打开 MiniMessage 编辑器');
    check(r.bgBtn && r.bgDefault === false, '预览右上角黑白切换按钮存在, 默认黑底');
    check(r.bgAfter1 && r.bgStored, '点击切换白底并写入 localStorage');
    check(r.bgAfter2, '再次点击切回黑底');
    check(r.detailOpen, '左键粗体按钮打开详细添加弹窗');
    check(r.contentPrefill && r.typePreselect, '文字内容预填当前选区, 类型预选粗体');
    check(r.fontInputs && r.insertedFont, '字体: 字体名+namespace → <font:minecraft:textname>def</font>');
    check(r.insertedFontNoNs, '字体: namespace 留空 → <font:pixel>');
    check(r.quickItalic && r.noDetailAfterRight, '右键斜体快速添加 (直接包裹, 不弹窗)');
    check(r.gradient, '渐变: 两个颜色 → <gradient:#ff0000:#00ff00>');
    check(r.colorPanel && r.noDetailForColor, '右键颜色按钮 → 色板 (快速)');
    check(r.editorClosed, '关闭编辑器');
    win.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
