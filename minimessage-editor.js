/* MiniMessageEditor: MiniMessage 富文本编辑器（独立页面 overlay）
 * 依赖: minimessage-js (全局 adventure)、RichTooltip (tooltip.js)、I18N (i18n.js)
 */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  if (root.MiniMessageEditor) return;

  var NAMED_COLORS = [
    { hex: '#000000', name: 'black' },
    { hex: '#0000aa', name: 'dark_blue' },
    { hex: '#00aa00', name: 'dark_green' },
    { hex: '#00aaaa', name: 'dark_aqua' },
    { hex: '#aa0000', name: 'dark_red' },
    { hex: '#aa00aa', name: 'dark_purple' },
    { hex: '#ffaa00', name: 'gold' },
    { hex: '#aaaaaa', name: 'gray' },
    { hex: '#555555', name: 'dark_gray' },
    { hex: '#5555ff', name: 'blue' },
    { hex: '#55ff55', name: 'green' },
    { hex: '#55ffff', name: 'aqua' },
    { hex: '#ff5555', name: 'red' },
    { hex: '#ff55ff', name: 'light_purple' },
    { hex: '#ffff55', name: 'yellow' },
    { hex: '#ffffff', name: 'white' },
  ];

  function t(key, fb) {
    try {
      if (root.I18N) {
        var v = root.I18N.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fb;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var mmInstance = null;
  function getMM() {
    if (mmInstance) return mmInstance;
    try {
      var adventure = root.adventure;
      if (!adventure || !adventure.MiniMessage) return null;
      mmInstance = adventure.MiniMessage.builder().strict(false).build();
    } catch (e) {
      return null;
    }
    return mmInstance;
  }

  // 标签定义: { id, icon, label, tag: { before, placeholder, after, suffix }, restricted, accent }
  function wrap(open, close) { return { before: open, placeholder: '', after: '', suffix: close }; }
  function param(open, placeholder, mid, close) { return { before: open, placeholder: placeholder, after: mid, suffix: close }; }

  var TAGS = [
    { id: 'bold', labelKey: 'minimessage.tag_bold', labelFb: '粗体', btn: '<b>B</b>', tag: wrap('<b>', '</b>') },
    { id: 'italic', labelKey: 'minimessage.tag_italic', labelFb: '斜体', btn: '<i>I</i>', tag: wrap('<i>', '</i>') },
    { id: 'underline', labelKey: 'minimessage.tag_underline', labelFb: '下划线', btn: '<u>U</u>', tag: wrap('<u>', '</u>') },
    { id: 'strikethrough', labelKey: 'minimessage.tag_strikethrough', labelFb: '删除线', btn: '<s>S̶</s>', tag: wrap('<st>', '</st>') },
    { id: 'obfuscated', labelKey: 'minimessage.tag_obfuscated', labelFb: '随机混淆', btn: '<b>◼◼</b>', tag: wrap('<obf>', '</obf>') },
    { id: 'reset', labelKey: 'minimessage.tag_reset', labelFb: '重置格式', btn: '<b>R</b>', tag: wrap('<reset>', '') },
    { id: 'newline', labelKey: 'minimessage.tag_newline', labelFb: '换行', btn: '⏎', tag: wrap('<newline>', '') },
    { id: 'rainbow', labelKey: 'minimessage.tag_rainbow', labelFb: '彩虹', btn: '🌈', tag: wrap('<rainbow>', '</rainbow>') },
    { id: 'gradient', labelKey: 'minimessage.tag_gradient', labelFb: '渐变', btn: '🌈2', tag: param('<gradient:#a:#b>', '#a:#b', '', '</gradient>') },
    { id: 'color', labelKey: 'minimessage.tag_color', labelFb: '颜色', btn: '🎨', colorPicker: true },
    { id: 'font', labelKey: 'minimessage.tag_font', labelFb: '字体', btn: '🅵', tag: param('<font:', 'minecraft:textname', '>', '</font>') },
    { id: 'open_url', labelKey: 'minimessage.tag_open_url', labelFb: '点击打开链接', btn: '🔗', tag: param("<click:open_url:'", 'url', "'>", '</click>'), restricted: true },
    { id: 'run_command', labelKey: 'minimessage.tag_run_command', labelFb: '点击执行命令', btn: '⌘', tag: param("<click:run_command:'", '/command', "'>", '</click>'), restricted: true },
    { id: 'suggest_command', labelKey: 'minimessage.tag_suggest_command', labelFb: '点击填入命令', btn: '💬', tag: param("<click:suggest_command:'", '/command', "'>", '</click>'), restricted: true },
    { id: 'hover_text', labelKey: 'minimessage.tag_hover_text', labelFb: '悬停显示文本', btn: '👁', tag: param("<hover:show_text:'", 'text', "'>", '</hover>'), restricted: true },
  ];
  // 标签名按需翻译 (I18N 字典异步加载, 加载时捕获会拿到回退文本导致中英混杂)
  function tagLabel(def) {
    return t(def.labelKey, def.labelFb);
  }
  // 插入型标签 (非包裹): 重置/换行 用「在光标处插入」描述
  var INSERT_TAGS = { reset: 1, newline: 1 };
  function tagDesc(def) {
    return INSERT_TAGS[def.id] ? t('minimessage.tooltipInsert', '在光标处插入') : t('minimessage.tooltipWrap', '给选定的文字添加');
  }
  function tagTooltipHtml(def) {
    var html = '<b class="rt-strong">' + esc(tagLabel(def)) + '</b> — ' + esc(tagDesc(def)) + '<br>' +
      '<code>' + esc((def.tag ? def.tag.before + def.tag.placeholder + def.tag.after + def.tag.suffix : '')) + '</code><br>' +
      '<span class="rt-dim">' + esc(t('minimessage.editBtnTip', '左键: 详细添加 · 右键: 快速添加')) + '</span>';
    if (def.restricted) html += '<br><span class="rt-restricted">⚠ ' + esc(t('minimessage.restrictedTip', '受限的标签，可能不能用在全部地方')) + '</span>';
    return html;
  }

  var win = null, inputEl = null, previewEl = null, colorPanel = null, cb = null;

  // 预览底色: 黑白切换 (localStorage 记忆)
  var previewBg = 'black';
  function loadPreviewBg() {
    try { previewBg = localStorage.getItem('miniPreviewBg') === 'white' ? 'white' : 'black'; } catch (e) {}
  }
  function togglePreviewBg() {
    previewBg = (previewBg === 'black') ? 'white' : 'black';
    try { localStorage.setItem('miniPreviewBg', previewBg); } catch (e) {}
    applyPreviewBg();
  }
  function applyPreviewBg() {
    if (previewEl) previewEl.classList.toggle('white-bg', previewBg === 'white');
  }

  function closeOverlay(result) {
    if (!win) return;
    // DOM 移除由 WindowManager.close 负责; 这里只清理内部状态并触发回调
    var closedWin = win;
    win = null; inputEl = null; previewEl = null; colorPanel = null;
    var fn = cb; cb = null;
    // 如果窗口还存在则关闭它 (openDetail 等场景由调用方自行关闭)
    if (!closedWin._closed) closedWin.close();
    if (fn) fn(result);
  }

  function updatePreview() {
    if (!inputEl || !previewEl) return;
    previewEl.innerHTML = '';
    var mm = getMM();
    var val = inputEl.value;
    if (!mm) {
      previewEl.textContent = val;
      return;
    }
    if (!val.trim()) {
      previewEl.innerHTML = '<span class="mini-preview-empty">' + esc(t('minimessage.previewEmpty', '（空预览）')) + '</span>';
      return;
    }
    try {
      var comp = mm.deserialize(val);
      mm.toHTML(comp, previewEl);
    } catch (e) {
      previewEl.innerHTML = '<span class="mini-preview-error">' + esc(t('minimessage.parseError', '解析错误')) + ': ' + esc(String(e.message || e)) + '</span>';
    }
  }

  function applyTag(tag) {
    var ta = inputEl;
    if (!ta) return;
    ta.focus();
    var selStart = ta.selectionStart || 0;
    var selEnd = ta.selectionEnd || 0;
    var before = ta.value.substring(0, selStart);
    var selection = ta.value.substring(selStart, selEnd);
    var after = ta.value.substring(selEnd);
    var prefix = tag.before + tag.after;
    var suffix = tag.suffix;
    var newSelStart = selStart, newSelEnd = selEnd;

    if (before.endsWith(prefix) && after.startsWith(suffix)) {
      // 选区两侧紧邻标签 → 移除标签（保持选区）
      insertText(selection, prefix.length, suffix.length);
      newSelStart -= prefix.length;
      newSelEnd -= prefix.length;
    } else if (selection.startsWith(prefix) && selection.endsWith(suffix)) {
      // 选区正好包含完整标签 → 移除标签
      insertText(selection.substring(prefix.length, selection.length - suffix.length));
      newSelEnd -= prefix.length + suffix.length;
    } else {
      // 否则插入/包裹
      insertText(tag.before + tag.placeholder + tag.after + selection + suffix);
      if (tag.placeholder) {
        newSelStart += tag.before.length;
        newSelEnd = newSelStart + tag.placeholder.length;
      } else {
        newSelStart += prefix.length;
        newSelEnd += prefix.length;
      }
    }
    ta.setSelectionRange(newSelStart, newSelEnd);
    updatePreview();
  }

  function insertText(text, widenSelStart, widenSelEnd) {
    var ta = inputEl;
    ta.focus();
    function fallback() {
      var s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
      var val = ta.value;
      ta.value = val.substring(0, s) + text + val.substring(e);
      ta.setSelectionRange(s + text.length, s + text.length);
    }
    try {
      if (widenSelStart && widenSelEnd) {
        ta.setSelectionRange((ta.selectionStart || 0) - widenSelStart, (ta.selectionEnd || 0) + widenSelEnd);
      }
      if (!document.execCommand('insertText', false, text)) fallback();
    } catch (err) {
      fallback();
    }
  }

  function applyColor(hex) {
    var named = null;
    for (var i = 0; i < NAMED_COLORS.length; i++) {
      if (NAMED_COLORS[i].hex === hex.toLowerCase()) { named = NAMED_COLORS[i]; break; }
    }
    if (named) applyTag(wrap('<' + named.name + '>', '</' + named.name + '>'));
    else applyTag(wrap('<color:' + hex.toLowerCase() + '>', '</color>'));
    hideColorPanel();
  }

  function hideColorPanel() {
    if (colorPanel) colorPanel.style.display = 'none';
  }

  function toggleColorPanel() {
    if (colorPanel) colorPanel.style.display = (colorPanel.style.display === 'none') ? '' : 'none';
  }

  function buildColorPanel(btn) {
    var panel = document.createElement('div');
    panel.className = 'mini-color-panel';
    panel.style.display = 'none';
    var grid = document.createElement('div');
    grid.className = 'mini-color-grid';
    for (var i = 0; i < NAMED_COLORS.length; i++) {
      var c = NAMED_COLORS[i];
      var sw = document.createElement('div');
      sw.className = 'mini-color-swatch';
      sw.style.background = c.hex;
      var colorZh = t('minimessage.color_' + c.name, c.name);
      sw.setAttribute('data-tip', c.name + (colorZh !== c.name ? ' (' + colorZh + ')' : ''));
      sw.addEventListener('click', function (hex) { return function () { applyColor(hex); }; }(c.hex));
      grid.appendChild(sw);
    }
    panel.appendChild(grid);
    var customRow = document.createElement('div');
    customRow.className = 'mini-color-custom';
    var hexInput = document.createElement('input');
    hexInput.className = 'mini-color-hex';
    hexInput.placeholder = '#rrggbb';
    hexInput.maxLength = 7;
    var applyBtn = document.createElement('button');
    applyBtn.className = 'mini-btn mini-btn-sm';
    applyBtn.textContent = t('minimessage.useColor', '使用颜色');
    applyBtn.addEventListener('click', function () {
      var v = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) applyColor(v);
      else hexInput.classList.add('is-danger');
    });
    hexInput.addEventListener('input', function () { hexInput.classList.remove('is-danger'); });
    hexInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') applyBtn.click();
    });
    customRow.appendChild(hexInput);
    customRow.appendChild(applyBtn);
    panel.appendChild(customRow);

    btn.parentNode.appendChild(panel);
    // 定位在按钮下方
    var r = btn.getBoundingClientRect();
    var pr = btn.parentNode.getBoundingClientRect();
    panel.style.left = Math.max(0, r.left - pr.left) + 'px';
    panel.style.top = (r.bottom - pr.top + 4) + 'px';
    return panel;
  }

  function openEditor(value, callback) {
    var oldWin = document.querySelector('.cw-win-mini');
    if (oldWin) { var w = oldWin.win; if (w) w.close(); }
    cb = callback;

    // 构建窗口内容 (不包括外层窗口; 窗口系统提供标题栏/拖动/关闭)
    var content = document.createElement('div');
    content.className = 'mini-content';
    content.innerHTML =
      '<div class="mini-preview-box">' +
        '<div class="mini-preview-label">' + esc(t('minimessage.preview', '预览')) + '</div>' +
        '<button type="button" class="mini-preview-bg" id="mini-preview-bg" data-tip="' + esc(t('minimessage.previewBg', '切换黑白底色')) + '">◐</button>' +
        '<div class="mini-preview" id="mini-preview"></div>' +
      '</div>' +
      '<div class="mini-toolbar" id="mini-toolbar"></div>' +
      '<textarea class="mini-input" id="mini-input" spellcheck="false"></textarea>' +
      '<div class="mini-footer">' +
        '<button class="mini-btn" id="mini-cancel">' + esc(t('common.cancel', '取消')) + '</button>' +
        '<button class="mini-btn mini-btn-primary" id="mini-save">' + esc(t('common.save', '保存')) + '</button>' +
      '</div>';

    win = WindowManager.open({
      title: '✏️ ' + t('minimessage.title', 'MiniMessage 编辑器'),
      content: content,
      width: 780, height: 580,
      className: 'cw-mini',
      onClose: function () { closeOverlay(null); },
    });
    // 把 win 引用挂到 el 上, 以便 closeOverlay 内部调用 win.close()
    win.el.win = win;

    inputEl = content.querySelector('#mini-input');
    previewEl = content.querySelector('#mini-preview');
    var toolbar = content.querySelector('#mini-toolbar');
    loadPreviewBg();
    applyPreviewBg();
    content.querySelector('#mini-preview-bg').addEventListener('click', togglePreviewBg);

    inputEl.value = (value == null) ? '' : String(value);
    inputEl.addEventListener('input', updatePreview);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeOverlay(null); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); closeOverlay(inputEl.value); }
    });

    content.querySelector('#mini-cancel').addEventListener('click', function () { closeOverlay(null); });
    content.querySelector('#mini-save').addEventListener('click', function () { closeOverlay(inputEl.value); });

    // 标签按钮: 左键=详细添加弹窗, 右键=快速添加 (和之前一样直接应用标签)
    for (var i = 0; i < TAGS.length; i++) {
      var def = TAGS[i];
      var btn = document.createElement('button');
      btn.className = 'mini-tag-btn' + (def.restricted ? ' is-restricted' : '');
      btn.innerHTML = def.btn;
      btn.addEventListener('click', function (d) { return function () { openDetail(d); }; }(def));
      btn.addEventListener('contextmenu', function (d) { return function (e) {
        e.preventDefault();
        if (d.colorPicker) toggleColorPanel();
        else applyTag(d.tag);
      }; }(def));
      // 先入树再构建色板: buildColorPanel 用 btn.parentNode 定位
      toolbar.appendChild(btn);
      if (def.colorPicker) {
        colorPanel = buildColorPanel(btn);
      }
      if (root.RichTooltip) {
        root.RichTooltip.bind(btn, function (d) { return function () { return tagTooltipHtml(d); }; }(def),
          { accent: def.restricted ? 'var(--color-warning)' : 'var(--color-primary)' });
      }
    }

    updatePreview();
    inputEl.focus();
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  }

  // ---- 详细添加弹窗: 左键点击格式按钮打开; 选择文字内容 + 类型 + 额外输入(如字体) ----
  function detailTypeById(id) {
    for (var i = 0; i < TAGS.length; i++) if (TAGS[i].id === id) return TAGS[i];
    return null;
  }
  function detailExtraHtml(id) {
    function ph(key, fb) { return ' placeholder="' + esc(t('minimessage.' + key, fb)) + '"'; }
    function inp(id2, phKey, fb, type) {
      return '<input id="mini-detail-' + id2 + '" class="mini-detail-input"' + (type ? ' type="' + type + '"' : '') + ' spellcheck="false"' + ph(phKey, fb) + '>';
    }
    switch (id) {
      case 'font':
        return '<label>' + esc(t('minimessage.detailFont', '字体')) + '</label>' + inp('font', 'phFont', 'unifont') +
          '<label>' + esc(t('minimessage.detailNamespace', 'namespace（可空）')) + '</label>' + inp('ns', 'phNamespace', 'minecraft');
      case 'color':
        return '<label>' + esc(t('minimessage.detailColor', '颜色（如 #ff0000 或 red）')) + '</label>' + inp('color', 'phColor', '#ff0000');
      case 'gradient':
        return '<label>' + esc(t('minimessage.detailGradientA', '渐变色 1')) + '</label>' + inp('grad-a', 'phGradientA', '#ff0000') +
          '<label>' + esc(t('minimessage.detailGradientB', '渐变色 2')) + '</label>' + inp('grad-b', 'phGradientB', '#ffff00');
      case 'open_url':
        return '<label>' + esc(t('minimessage.detailUrl', '链接')) + '</label>' + inp('url', 'phUrl', 'https://...', 'url');
      case 'run_command':
      case 'suggest_command':
        return '<label>' + esc(t('minimessage.detailCommand', '命令')) + '</label>' + inp('cmd', 'phCommand', '/command');
      case 'hover_text':
        return '<label>' + esc(t('minimessage.detailHoverText', '悬停文本')) + '</label>' + inp('hover', 'phHoverText', 'text');
      default:
        return '';
    }
  }
  function detailFields(id) {
    var f = { ns: '', font: '', color: '', gradA: '', gradB: '', url: '', cmd: '', hover: '' };
    var g = function (sel) {
      var el = document.getElementById(sel);
      return el ? el.value : '';
    };
    if (id === 'font') { f.font = g('mini-detail-font'); f.ns = g('mini-detail-ns'); }
    if (id === 'color') f.color = g('mini-detail-color');
    if (id === 'gradient') { f.gradA = g('mini-detail-grad-a'); f.gradB = g('mini-detail-grad-b'); }
    if (id === 'open_url') f.url = g('mini-detail-url');
    if (id === 'run_command' || id === 'suggest_command') f.cmd = g('mini-detail-cmd');
    if (id === 'hover_text') f.hover = g('mini-detail-hover');
    return f;
  }
  // MiniMessage 单引号标签内转义: \ → \\, ' → \' (用户输入含引号会截断标签)
  function mmEsc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
  function buildDetailTag(id, f) {
    if (id === 'font') {
      var inner = f.ns.trim() ? f.ns.trim() + ':' + f.font.trim() : f.font.trim();
      return { before: '<font:' + inner + '>', suffix: '</font>' };
    }
    if (id === 'color') {
      var v = f.color.trim().toLowerCase();
      return { before: '<color:' + (v || 'white') + '>', suffix: '</color>' };
    }
    if (id === 'gradient') {
      return { before: '<gradient:' + (f.gradA.trim() || '#ff0000') + ':' + (f.gradB.trim() || '#ffff00') + '>', suffix: '</gradient>' };
    }
    if (id === 'open_url') return { before: "<click:open_url:'" + mmEsc(f.url.trim()) + "'>", suffix: '</click>' };
    if (id === 'run_command') return { before: "<click:run_command:'" + mmEsc(f.cmd.trim()) + "'>", suffix: '</click>' };
    if (id === 'suggest_command') return { before: "<click:suggest_command:'" + mmEsc(f.cmd.trim()) + "'>", suffix: '</click>' };
    if (id === 'hover_text') return { before: "<hover:show_text:'" + mmEsc(f.hover.trim()) + "'>", suffix: '</hover>' };
    var d = detailTypeById(id);
    if (!d || !d.tag) return { before: '', suffix: '' };
    return { before: d.tag.before + d.tag.after, suffix: d.tag.suffix };
  }
  function openDetail(def) {
    if (!win || !inputEl) return;
    var old = document.getElementById('mini-detail-layer');
    if (old) old.remove();
    var selStart = inputEl.selectionStart || 0;
    var selEnd = inputEl.selectionEnd || 0;
    var curSel = inputEl.value.substring(selStart, selEnd);

    var layer = document.createElement('div');
    layer.id = 'mini-detail-layer';
    layer.className = 'mini-detail-layer';
    layer.innerHTML =
      '<div class="mini-modal">' +
        '<div class="mini-header">' +
          '<span class="mini-title" id="mini-detail-title">✏️ ' + esc(t('minimessage.detailTitle', '详细添加')) + '</span>' +
          '<button type="button" class="mini-close" id="mini-detail-close" data-tip="' + esc(t('common.close', '关闭')) + '">✕</button>' +
        '</div>' +
        '<div class="mini-detail-body">' +
          '<div class="mini-detail-row">' +
            '<label class="mini-detail-label" for="mini-detail-content">' + esc(t('minimessage.detailContent', '文字内容')) + '</label>' +
            '<textarea class="mini-detail-input" id="mini-detail-content" spellcheck="false" rows="3"></textarea>' +
          '</div>' +
          '<div class="mini-detail-row">' +
            '<label class="mini-detail-label" for="mini-detail-type">' + esc(t('minimessage.detailType', '类型')) + '</label>' +
            '<select class="mini-detail-input mini-detail-select" id="mini-detail-type"></select>' +
          '</div>' +
          '<div class="mini-detail-row" id="mini-detail-extra"></div>' +
          '<div class="mini-detail-tag" id="mini-detail-tag"></div>' +
        '</div>' +
        '<div class="mini-footer">' +
          '<button class="mini-btn" id="mini-detail-cancel">' + esc(t('common.cancel', '取消')) + '</button>' +
          '<button class="mini-btn mini-btn-primary" id="mini-detail-ok">' + esc(t('minimessage.detailAdd', '添加')) + '</button>' +
        '</div>' +
      '</div>';
    win.body.appendChild(layer);

    var titleEl = layer.querySelector('#mini-detail-title');
    var contentTa = layer.querySelector('#mini-detail-content');
    var typeSel = layer.querySelector('#mini-detail-type');
    var extraBox = layer.querySelector('#mini-detail-extra');
    var tagHint = layer.querySelector('#mini-detail-tag');
    contentTa.value = curSel;

    for (var i = 0; i < TAGS.length; i++) {
      var o = document.createElement('option');
      o.value = TAGS[i].id;
      o.textContent = tagLabel(TAGS[i]);
      typeSel.appendChild(o);
    }
    typeSel.value = def.id;

    function refresh() {
      var d = detailTypeById(typeSel.value);
      if (!d) return;
      titleEl.textContent = '✏️ ' + t('minimessage.detailTitle', '详细添加') + ' — ' + tagLabel(d);
      extraBox.innerHTML = detailExtraHtml(d.id);
      var tag = buildDetailTag(d.id, detailFields(d.id));
      tagHint.textContent = tag.before + contentTa.value + tag.suffix;
    }
    function closeDetail() { layer.remove(); }

    typeSel.addEventListener('change', refresh);
    contentTa.addEventListener('input', refresh);
    layer.querySelector('#mini-detail-close').addEventListener('click', closeDetail);
    layer.querySelector('#mini-detail-cancel').addEventListener('click', closeDetail);
    layer.querySelector('#mini-detail-ok').addEventListener('click', function () {
      var d = detailTypeById(typeSel.value);
      if (!d) return;
      var content = contentTa.value;
      var tag = buildDetailTag(d.id, detailFields(d.id));
      closeDetail();
      insertDetail(content, tag);
    });
    layer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeDetail(); }
    });
    layer.addEventListener('mousedown', function (e) { if (e.target === layer) closeDetail(); });

    refresh();
    contentTa.focus();
    contentTa.setSelectionRange(contentTa.value.length, contentTa.value.length);
  }
  // 用生成的标签包裹内容, 替换 textarea 当前选区
  function insertDetail(content, tag) {
    var ta = inputEl;
    if (!ta) return;
    ta.focus();
    var s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
    ta.value = ta.value.substring(0, s) + tag.before + content + tag.suffix + ta.value.substring(e);
    ta.setSelectionRange(s + tag.before.length, s + tag.before.length + content.length);
    updatePreview();
  }

  root.MiniMessageEditor = { open: openEditor };
})();
