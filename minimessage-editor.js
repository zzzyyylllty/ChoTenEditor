/* MiniMessageEditor: MiniMessage 富文本编辑器（独立页面 overlay）
 * 依赖: minimessage-js (全局 adventure)、RichTooltip (tooltip.js)、I18N (i18n.js)
 */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  if (root.MiniMessageEditor) return;

  var NAMED_COLORS = [
    { hex: '#000000', name: 'black', zh: '黑色' },
    { hex: '#0000aa', name: 'dark_blue', zh: '深蓝' },
    { hex: '#00aa00', name: 'dark_green', zh: '深绿' },
    { hex: '#00aaaa', name: 'dark_aqua', zh: '深青' },
    { hex: '#aa0000', name: 'dark_red', zh: '深红' },
    { hex: '#aa00aa', name: 'dark_purple', zh: '深紫' },
    { hex: '#ffaa00', name: 'gold', zh: '金色' },
    { hex: '#aaaaaa', name: 'gray', zh: '灰色' },
    { hex: '#555555', name: 'dark_gray', zh: '深灰' },
    { hex: '#5555ff', name: 'blue', zh: '蓝色' },
    { hex: '#55ff55', name: 'green', zh: '绿色' },
    { hex: '#55ffff', name: 'aqua', zh: '青色' },
    { hex: '#ff5555', name: 'red', zh: '红色' },
    { hex: '#ff55ff', name: 'light_purple', zh: '粉紫' },
    { hex: '#ffff55', name: 'yellow', zh: '黄色' },
    { hex: '#ffffff', name: 'white', zh: '白色' },
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
    { id: 'bold', label: '粗体', btn: '<b>B</b>', tag: wrap('<b>', '</b>') },
    { id: 'italic', label: '斜体', btn: '<i>I</i>', tag: wrap('<i>', '</i>') },
    { id: 'underline', label: '下划线', btn: '<u>U</u>', tag: wrap('<u>', '</u>') },
    { id: 'strikethrough', label: '删除线', btn: '<s>S̶</s>', tag: wrap('<st>', '</st>') },
    { id: 'obfuscated', label: '随机混淆', btn: '<b>◼◼</b>', tag: wrap('<obf>', '</obf>') },
    { id: 'reset', label: '重置格式', btn: '<b>R</b>', tag: wrap('<reset>', '') },
    { id: 'newline', label: '换行', btn: '⏎', tag: wrap('<newline>', '') },
    { id: 'rainbow', label: '彩虹', btn: '🌈', tag: wrap('<rainbow>', '</rainbow>') },
    { id: 'gradient', label: '渐变', btn: '🌈2', tag: param('<gradient:#a:#b>', '#a:#b', '', '</gradient>') },
    { id: 'color', label: '颜色', btn: '🎨', colorPicker: true },
    { id: 'open_url', label: '点击打开链接', btn: '🔗', tag: param("<click:open_url:'", 'url', "'>", '</click>'), restricted: true },
    { id: 'run_command', label: '点击执行命令', btn: '⌘', tag: param("<click:run_command:'", '/command', "'>", '</click>'), restricted: true },
    { id: 'suggest_command', label: '点击填入命令', btn: '💬', tag: param("<click:suggest_command:'", '/command', "'>", '</click>'), restricted: true },
    { id: 'hover_text', label: '悬停显示文本', btn: '👁', tag: param("<hover:show_text:'", 'text', "'>", '</hover>'), restricted: true },
  ];

  var overlay = null, inputEl = null, previewEl = null, colorPanel = null, cb = null;

  function closeOverlay(result) {
    if (!overlay) return;
    var o = overlay;
    overlay = null; inputEl = null; previewEl = null; colorPanel = null;
    var fn = cb; cb = null;
    o.remove();
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
      sw.title = c.name + ' (' + c.zh + ')';
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
    var old = document.getElementById('mini-editor-overlay');
    if (old) old.remove();
    cb = callback;

    overlay = document.createElement('div');
    overlay.id = 'mini-editor-overlay';
    overlay.className = 'mini-overlay';
    overlay.innerHTML =
      '<div class="mini-modal">' +
        '<div class="mini-header">' +
          '<span class="mini-title">✏️ ' + esc(t('minimessage.title', 'MiniMessage 编辑器')) + '</span>' +
          '<button class="mini-close" id="mini-close" title="' + esc(t('common.close', '关闭')) + '">✕</button>' +
        '</div>' +
        '<div class="mini-preview-box">' +
          '<div class="mini-preview-label">' + esc(t('minimessage.preview', '预览')) + '</div>' +
          '<div class="mini-preview" id="mini-preview"></div>' +
        '</div>' +
        '<div class="mini-toolbar" id="mini-toolbar"></div>' +
        '<textarea class="mini-input" id="mini-input" spellcheck="false"></textarea>' +
        '<div class="mini-footer">' +
          '<button class="mini-btn" id="mini-cancel">' + esc(t('common.cancel', '取消')) + '</button>' +
          '<button class="mini-btn mini-btn-primary" id="mini-save">' + esc(t('common.save', '保存')) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    inputEl = overlay.querySelector('#mini-input');
    previewEl = overlay.querySelector('#mini-preview');
    var toolbar = overlay.querySelector('#mini-toolbar');

    inputEl.value = (value == null) ? '' : String(value);
    inputEl.addEventListener('input', updatePreview);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeOverlay(null); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); closeOverlay(inputEl.value); }
    });

    overlay.querySelector('#mini-close').addEventListener('click', function () { closeOverlay(null); });
    overlay.querySelector('#mini-cancel').addEventListener('click', function () { closeOverlay(null); });
    overlay.querySelector('#mini-save').addEventListener('click', function () { closeOverlay(inputEl.value); });
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeOverlay(null); });

    // 标签按钮
    for (var i = 0; i < TAGS.length; i++) {
      var def = TAGS[i];
      var btn = document.createElement('button');
      btn.className = 'mini-tag-btn' + (def.restricted ? ' is-restricted' : '');
      btn.innerHTML = def.btn;
      if (def.colorPicker) {
        btn.addEventListener('click', toggleColorPanel);
        colorPanel = buildColorPanel(btn);
      } else {
        (function (tag) {
          btn.addEventListener('click', function () { applyTag(tag); });
        })(def.tag);
      }
      if (def.restricted && root.RichTooltip) {
        root.RichTooltip.bind(btn, function () {
          return '<b class="rt-strong">' + esc(def.label) + '</b><br><code>' + esc(def.tag.before + def.tag.placeholder + def.tag.after + def.tag.suffix) + '</code><br><span class="rt-restricted">⚠ ' + esc(t('minimessage.restrictedTip', '受限的标签，可能不能用在全部地方')) + '</span>';
        }, { accent: 'var(--color-warning)' });
      } else if (root.RichTooltip) {
        root.RichTooltip.bind(btn, function () {
          return '<b class="rt-strong">' + esc(def.label) + '</b><br><code>' + esc(def.tag.before + def.tag.placeholder + def.tag.after + def.tag.suffix) + '</code>';
        }, { accent: 'var(--color-primary)' });
      }
      toolbar.appendChild(btn);
    }

    updatePreview();
    inputEl.focus();
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  }

  root.MiniMessageEditor = { open: openEditor };
})();
