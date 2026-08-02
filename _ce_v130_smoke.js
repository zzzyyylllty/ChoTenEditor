// v1.0.30 冒烟: 自定义复选框(颜色/标记/主题联动) + 客户端数据组件/条件弹窗编辑写回
const { app, BrowserWindow } = require('electron');
const path = require('path');

let fails = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!cond) fails++;
}

app.whenReady().then(async () => {
  try {
    // ---------- A. settings.html: 复选框外观 + 颜色/标记/主题联动 ----------
    const win = new BrowserWindow({
      show: false, width: 1280, height: 860,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    await win.loadFile(path.join(__dirname, 'settings.html'));
    await new Promise(r => setTimeout(r, 1500));

    const a = await win.webContents.executeJavaScript(`(function () {
      var out = {};
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      document.body.appendChild(cb);
      var cs = getComputedStyle(cb);
      out.appearance = cs.webkitAppearance || cs.appearance;
      out.size = cs.width;
      out.offBorderDark = cs.borderColor;
      cb.style.transition = 'none';
      cb.checked = true;
      out.onBgDark = getComputedStyle(cb).backgroundColor;
      cb.checked = false;
      cb.remove();
      // 主题切换: light 重声明
      document.body.setAttribute('data-theme', 'light');
      var cb2 = document.createElement('input');
      cb2.type = 'checkbox';
      document.body.appendChild(cb2);
      out.offBorderLight = getComputedStyle(cb2).borderColor;
      cb2.style.transition = 'none';
      cb2.checked = true;
      out.onBgLight = getComputedStyle(cb2).backgroundColor;
      cb2.checked = false;
      // 深色下 checked 调暗 filter
      document.body.setAttribute('data-theme', 'dark');
      var cb3 = document.createElement('input');
      cb3.type = 'checkbox';
      cb3.checked = true;
      document.body.appendChild(cb3);
      out.darkCheckedFilter = getComputedStyle(cb3).filter;
      cb3.remove();
      // 颜色输入即时生效
      var inp = document.getElementById('color-checkbox-off');
      inp.value = '#123456';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      out.varOff = document.documentElement.style.getPropertyValue('--color-checkbox-off').trim();
      var cb4 = document.createElement('input');
      cb4.type = 'checkbox';
      document.body.appendChild(cb4);
      out.borderCustom = getComputedStyle(cb4).borderColor;
      cb4.remove();
      inp.value = '#ff1744';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      // 标记开关: 选中√默认显示 (缺省视为 true)
      document.body.classList.remove('cb-mark-on', 'cb-mark-off');
      applyCheckboxMarks({});
      out.markDefault = document.body.classList.contains('cb-mark-on');
      applyCheckboxMarks({ checkboxMarkOn: false, checkboxMarkOff: true });
      out.markOff = document.body.classList.contains('cb-mark-off');
      applyCheckboxMarks({ checkboxMarkOn: false, checkboxMarkOff: false });
      out.markNone = !document.body.classList.contains('cb-mark-on') && !document.body.classList.contains('cb-mark-off');
      // 标记伪元素内容
      document.body.classList.add('cb-mark-on');
      var cb5 = document.createElement('input');
      cb5.type = 'checkbox';
      cb5.checked = true;
      document.body.appendChild(cb5);
      out.markContent = getComputedStyle(cb5, '::after').content;
      document.body.classList.remove('cb-mark-on');
      cb5.remove();
      // 保存: checkboxMark 写入 localStorage
      document.getElementById('checkbox-mark-on').checked = true;
      document.getElementById('checkbox-mark-off').checked = false;
      document.getElementById('save-settings').click();
      var cfg = JSON.parse(localStorage.getItem('editorConfig'));
      out.savedMarkOn = cfg.checkboxMarkOn === true;
      out.savedMarkOff = cfg.checkboxMarkOff === false;
      out.savedColors = cfg.colors && cfg.colors.checkboxOff === '#ff1744' && cfg.colors.checkboxOn === '#00c853';
      return out;
    })()`);
    check(a.appearance === 'none', '复选框 appearance: none (自定义)');
    check(parseFloat(a.size) >= 20, '复选框尺寸 ~22px (实际 ' + a.size + ')');
    check(a.offBorderDark === 'rgb(255, 23, 68)', '深色未选中边框 = 主题红 #ff1744');
    check(a.onBgDark === 'rgb(0, 200, 83)', '深色选中填充 = 主题绿 #00c853');
    check(a.offBorderLight === 'rgb(211, 47, 47)', '浅色未选中边框 = 浅色主题红 #d32f2f');
    check(a.onBgLight === 'rgb(16, 124, 16)', '浅色选中填充 = #107c10');
    check(a.darkCheckedFilter.includes('brightness(0.9)'), '深色选中轻微调暗 brightness(0.9)');
    check(a.varOff === '#123456' && a.borderCustom === 'rgb(18, 52, 86)', '颜色输入即时生效 → --color-checkbox-off + 边框');
    check(a.markDefault && a.markOff && a.markNone, '选中√默认显示, 开关可关闭 cb-mark-on/cb-mark-off');
    check(a.markContent === '"✓"', '选中标记伪元素内容 ✓');
    check(a.savedMarkOn && a.savedMarkOff && a.savedColors, '保存: checkboxMark + 复选框颜色写入 localStorage');

    // ---------- B. index.html: CraftEngine 客户端数据组件/条件弹窗编辑写回 ----------
    const win2 = new BrowserWindow({
      show: false, width: 1280, height: 860,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    await win2.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 1200));

    const b = await win2.webContents.executeJavaScript(`(function () {
      var out = {};
      var ve = document.getElementById('visual-editor');
      var yaml = [
        'items:',
        '  default:test:',
        '    material: paper',
        '    client_bound_data:',
        '      item_name: "Hello"',
        '      conditional:',
        '        conditions:',
        '          - type: random',
        '            value: 0.5'
      ].join('\\n');
      var parsed = CraftEngineInterpreter.render('smoke.yml', yaml, ve, {});
      var entry = parsed.sections[0].entries[0];
      var h = ve.innerHTML;
      out.compRow = h.indexOf('data-sf-path="client_bound_data.item_name"') !== -1 && h.indexOf('data-sf-action="popup-edit"') !== -1;
      out.condEdit = h.indexOf('data-sf-path="client_bound_data.conditional"') !== -1;
      out.summary = h.indexOf('conditions: 1 项') !== -1;
      out.noInline = h.indexOf('client_bound_data.conditional.conditions.0') === -1;
      // 点击条件弹窗编辑 → modal 出现, 含 conditions 列表
      var condBtn = ve.querySelector('[data-sf-action="popup-edit"][data-sf-path="client_bound_data.conditional"]');
      condBtn.click();
      var modal = document.getElementById('ce-popup-modal');
      out.modalOpen = !!modal;
      if (modal) {
        var mh = modal.innerHTML;
        out.condList = mh.indexOf('__popup__.conditions') !== -1;
        out.condType = mh.indexOf('__popup__.conditions.0') !== -1;
        // 修改 random value 0.5 → 0.75
        var valInput = modal.querySelector('[data-sf-path="__popup__.conditions.0.value"]');
        if (valInput) {
          valInput.value = '0.75';
          valInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        out.valEdit = !!valInput;
        modal.querySelector('[data-ce-popup="ok"]').click();
        out.writeBack = entry.data.client_bound_data.conditional.conditions[0].value === 0.75;
      }
      // cond-add: 无 conditional 的 item → 点击生成对象
      var ve2 = document.getElementById('visual-editor');
      var yaml2 = [
        'items:',
        '  default:test:',
        '    material: paper',
        '    client_bound_data:',
        '      item_name: "Hi"'
      ].join('\\n');
      var parsed2 = CraftEngineInterpreter.render('smoke2.yml', yaml2, ve2, {});
      var entry2 = parsed2.sections[0].entries[0];
      var addBtn = ve2.querySelector('[data-sf-action="cond-add"]');
      out.condAddBtn = !!addBtn;
      if (addBtn) {
        addBtn.click();
        out.condAddWrite = entry2.data.client_bound_data && entry2.data.client_bound_data.conditional && typeof entry2.data.client_bound_data.conditional === 'object';
        out.condAddSummary = ve2.innerHTML.indexOf('data-sf-path="client_bound_data.conditional"') !== -1;
      }
      // 组件行编辑: item_name → modal 打开含 __popup__ 文本输入 (值为 Hi)
      var compBtn = ve2.querySelector('[data-sf-action="popup-edit"][data-sf-path="client_bound_data.item_name"]');
      compBtn.click();
      var modal2 = document.getElementById('ce-popup-modal');
      var compInput = modal2 ? modal2.querySelector('[data-sf-kind="field"][data-sf-path="__popup__"]') : null;
      out.compModal = !!modal2 && !!compInput && compInput.value === 'Hi';
      if (modal2) modal2.querySelector('[data-ce-popup="cancel"]').click();
      // 下拉排除 conditional
      var sel = ve2.querySelector('[data-sf-action="comp-add"]');
      var opts = Array.from(sel.options).map(function (o) { return o.value; });
      out.dropdownNoCond = opts.indexOf('conditional') === -1;
      out.dropdownHasCustom = opts.indexOf('__custom__') !== -1;
      return out;
    })()`);
    check(b.compRow, '客户端数据: 组件行 = 名称 + popup-edit 编辑按钮');
    check(b.condEdit, '条件区: popup-edit 编辑按钮');
    check(b.summary, '条件摘要: conditions: 1 项');
    check(b.noInline, '条件内容不再行内渲染');
    check(b.modalOpen && b.condList && b.condType, '条件弹窗打开: 含 conditions 列表与条目');
    check(b.valEdit && b.writeBack, '弹窗内修改 value 0.5→0.75 确定后写回');
    check(b.condAddBtn, '无 conditional 时显示 cond-add 按钮');
    check(b.condAddWrite && b.condAddSummary, 'cond-add 点击生成 conditional 对象并重渲染');
    check(b.compModal, '组件行 popup-edit 打开独立弹窗 (含 item_name 字段)');
    check(b.dropdownNoCond && b.dropdownHasCustom, 'comp-add 下拉排除 conditional, 保留 __custom__');

    win.destroy();
    win2.destroy();
  } catch (e) {
    console.log('FAIL 异常', e && e.stack || e);
    fails++;
  }
  console.log('fails=' + fails);
  app.exit(fails ? 1 : 0);
});
