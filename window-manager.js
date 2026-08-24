/* WindowManager: 无遮罩可拖动可关闭窗口系统
 * 与全屏 overlay 不同: 窗口直接挂 body (position:fixed), 不铺背景/不锁滚动/无点击背景关闭;
 * 支持拖标题栏自由移动、标题栏 ✕ 关闭、点击窗口聚焦置顶。
 * 用法:
 *   var win = WindowManager.open({ title, content, width, height, x, y, className, onClose });
 *   win.close(); win.setTitle('...'); win.el; win.body;
 */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  if (root.WindowManager) return;

  var _windows = [];      // 打开的窗口控制对象
  var _zTop = 990000;     // z-index 起始 (标题栏 1000000 之下)
  var _zMax = 999000;     // 聚焦递增上限 (防无限增长)

  function allocZ() {
    _zTop = Math.min(_zTop + 1, _zMax);
    return _zTop;
  }
  function frontmostZ() {
    var m = 0;
    for (var i = 0; i < _windows.length; i++) {
      var z = parseInt(_windows[i].el.style.zIndex, 10) || 0;
      if (z > m) m = z;
    }
    return m;
  }
  function bringToFront(win) {
    if (win._closed) return;
    var z = Math.max(frontmostZ() + 1, allocZ());
    win.el.style.zIndex = z;
  }

  function open(opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'cw-window' + (opts.className ? ' ' + opts.className : '');
    var width = opts.width || 640;
    var height = opts.height || 480;
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    el.innerHTML =
      '<div class="cw-titlebar">' +
        '<span class="cw-title"></span>' +
        '<button type="button" class="cw-close" title="' + esc(opts.closeTitle || '✕') + '">✕</button>' +
      '</div>' +
      '<div class="cw-body"></div>';
    var titleEl = el.querySelector('.cw-title');
    var bodyEl = el.querySelector('.cw-body');
    var closeBtn = el.querySelector('.cw-close');
    titleEl.textContent = opts.title || '';

    // 内容: HTMLElement 或 HTML 字符串
    if (typeof opts.content === 'string') bodyEl.innerHTML = opts.content;
    else if (opts.content && opts.content.nodeType === 1) bodyEl.appendChild(opts.content);

    // 定位: 显式 x/y, 否则居中 (多窗口级联偏移)
    var x = opts.x;
    var y = opts.y;
    if (x == null || y == null) {
      var n = _windows.length;
      var off = (n % 5) * 28;
      if (x == null) x = Math.max(8, Math.round((window.innerWidth - width) / 2) + off);
      if (y == null) y = Math.max(8, Math.round((window.innerHeight - height) / 2) + off);
    }
    clampPos(el, x, y);

    var win = {
      el: el,
      body: bodyEl,
      opts: opts,
      _closed: false,
      setTitle: function (s) { titleEl.textContent = s; },
      close: function () { close(win); },
    };

    // 关闭按钮
    if (opts.closable === false) {
      closeBtn.style.display = 'none';
    } else {
      closeBtn.addEventListener('click', function () { close(win); });
    }

    // 拖动: 标题栏 mousedown → 全局 mousemove/mouseup; 排除 ✕ 按钮
    var titlebar = el.querySelector('.cw-titlebar');
    titlebar.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target === closeBtn) return;
      startDrag(win, e);
    });

    // 聚焦置顶
    el.addEventListener('mousedown', function () { bringToFront(win); });

    document.body.appendChild(el);
    el.style.zIndex = allocZ();
    _windows.push(win);
    return win;
  }

  function startDrag(win, e) {
    var el = win.el;
    var startX = e.clientX;
    var startY = e.clientY;
    var origLeft = el.offsetLeft;
    var origTop = el.offsetTop;
    el.classList.add('is-dragging');
    function onMove(ev) {
      clampPos(el, origLeft + (ev.clientX - startX), origTop + (ev.clientY - startY));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      el.classList.remove('is-dragging');
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  }

  // 约束窗口位置: 标题栏至少 28px 留在视口内, 左侧留 32px 可抓回
  function clampPos(el, x, y) {
    var w = el.offsetWidth, h = el.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    x = Math.min(Math.max(x, 32 - w), vw - 40);
    y = Math.min(Math.max(y, 0), vh - 28);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  function close(win) {
    if (win._closed) return;
    win._closed = true;
    win.el.remove();
    var i = _windows.indexOf(win);
    if (i >= 0) _windows.splice(i, 1);
    var fn = win.opts.onClose;
    if (fn) try { fn(); } catch (err) {}
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  root.WindowManager = {
    open: open,
    close: close,
    get windows() { return _windows.slice(); },
  };
})();
