/* RichTooltip: 富文本 tooltip（HTML 内容 + 强调色），供 MiniMessage 编辑器等复用 */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  if (root.RichTooltip) return;

  var tipEl = null;
  function getTip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'rt-tooltip';
      tipEl.style.display = 'none';
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }

  function posTip(e) {
    var tip = getTip();
    var x = e.clientX + 14;
    var y = e.clientY + 14;
    var r = tip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 10) x = e.clientX - r.width - 10;
    if (y + r.height > window.innerHeight - 10) y = e.clientY - r.height - 10;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function show(e, html, opts) {
    var tip = getTip();
    opts = opts || {};
    tip.innerHTML = html;
    tip.style.setProperty('--rt-accent', opts.accent || '');
    tip.style.display = 'block';
    posTip(e);
  }

  function hide() {
    if (tipEl) tipEl.style.display = 'none';
  }

  // bind(el, content, opts)：content 可为字符串或返回字符串的函数；opts.accent 为强调色
  function bind(el, content, opts) {
    opts = opts || {};
    el.removeAttribute('title');
    el.addEventListener('mouseenter', function (e) {
      show(e, typeof content === 'function' ? content() : content, opts);
    });
    el.addEventListener('mousemove', function (e) {
      if (tipEl && tipEl.style.display !== 'none' && tipEl.style.display !== '') posTip(e);
    });
    el.addEventListener('mouseleave', hide);
  }

  root.RichTooltip = { bind: bind, show: show, hide: hide };
})();
