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
    // 彩色文字底块取背景反色: 深背景→浅块(淡), 浅背景→深块(浓), 黑/白底上文字都明显
    tip.style.setProperty('--rt-block', calcBlock(tip));
    posTip(e);
  }

  // 计算与背景相反的颜色作文字底块 (透明度随背景亮度调整, 若背景不可解析则回退)
  function calcBlock(tip) {
    var bg = '';
    try { bg = getComputedStyle(tip).backgroundColor || ''; } catch (err) { bg = ''; }
    var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(bg);
    if (!m) return 'rgba(0,0,0,0.35)';
    var inv = [255 - (+m[1]), 255 - (+m[2]), 255 - (+m[3])];
    var lum = (0.299 * (+m[1]) + 0.587 * (+m[2]) + 0.114 * (+m[3])) / 255;
    // 背景亮(浅主题)→浓深色块衬亮字; 背景暗(深主题)→淡浅色块, 不干扰本就清晰的浅字
    var a = lum > 0.5 ? 0.85 : 0.28;
    return 'rgba(' + inv[0] + ',' + inv[1] + ',' + inv[2] + ',' + a + ')';
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

  // 轻量富文本转换: `code` 代码, **粗体**, \n 换行, §x Minecraft 颜色码, 白名单 HTML 标签直通
  var MD_COLORS = { '0': '#c9d1d9', '1': '#9ecbff', '2': '#56d364', '3': '#76e3ea', '4': '#ff9580', '5': '#bc8cff', '6': '#ffa657', '7': '#a8b1bd', '8': '#8b949e', '9': '#a5d6ff', 'a': '#7ee787', 'b': '#79c0ff', 'c': '#ff7b72', 'd': '#ff7bdd', 'e': '#e3b341', 'f': '#ffffff' };
  var MD_ALLOWED = { b: 1, br: 1, span: 1, code: 1, i: 1, strong: 1, em: 1, u: 1, s: 1, sub: 1, sup: 1, details: 1, summary: 1, div: 1, p: 1, ul: 1, li: 1, ol: 1, table: 1, tr: 1, td: 1, th: 1, hr: 1, pre: 1, blockquote: 1, a: 1 };
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function md(text) {
    if (text === null || text === undefined) return '';
    var s = String(text);
    var out = '';
    var i = 0;
    var n = s.length;
    while (i < n) {
      var c = s[i];
      if (c === '`' && s[i + 1] === '`' && s[i + 2] === '`') {
        var fe = s.indexOf('```', i + 3);
        if (fe !== -1) {
          var fin = s.slice(i + 3, fe);
          var lm = /^([a-zA-Z0-9_-]*)\n/.exec(fin);
          if (lm) fin = fin.slice(lm[0].length);
          out += '<pre class="rt-pre"><code>' + esc(fin) + '</code></pre>';
          i = fe + 3;
          continue;
        }
      }
      if (c === '`') {
        var e = s.indexOf('`', i + 1);
        if (e !== -1) { out += '<code>' + esc(s.slice(i + 1, e)) + '</code>'; i = e + 1; continue; }
      }
      if (c === '*' && s[i + 1] === '*') {
        var b = s.indexOf('**', i + 2);
        if (b !== -1) { out += '<b>' + md(s.slice(i + 2, b)) + '</b>'; i = b + 2; continue; }
      }
      if (c === '\n') { out += '<br>'; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '§' && i + 1 < n && MD_COLORS[s[i + 1]]) {
        out += '<span style="color:' + MD_COLORS[s[i + 1]] + '">';
        i += 2;
        // 颜色持续到下一个颜色码 / 重置码 / 结束
        var j = i;
        while (j < n) {
          if (s[j] === '§' && (s[j + 1] === 'r' || s[j + 1] === 'R' || MD_COLORS[s[j + 1]] || s[j + 1] === 'l' || s[j + 1] === 'L')) break;
          j++;
        }
        out += esc(s.slice(i, j)).replace(/\n/g, '<br>');
        out += '</span>';
        i = j;
        continue;
      }
      if (c === '§' && i + 1 < n && (s[i + 1] === 'r' || s[i + 1] === 'R')) { i += 2; continue; }
      if (c === '§' && i + 1 < n && (s[i + 1] === 'l' || s[i + 1] === 'L')) {
        var j2 = i + 2;
        while (j2 < n && !(s[j2] === '§')) j2++;
        out += '<b>' + esc(s.slice(i + 2, j2)).replace(/\n/g, '<br>') + '</b>';
        i = j2;
        continue;
      }
      if (c === '<') {
        // 白名单标签直通, 其余 (<ns> <arg:...> 等占位符) 转义显示
        var tm = /^<\/?([a-zA-Z][a-zA-Z0-9]*)\b/.exec(s.slice(i));
        if (tm && MD_ALLOWED[tm[1].toLowerCase()]) {
          var tagName = tm[1].toLowerCase();
          var isClose = s[i + 1] === '/';
          var ge = s.indexOf('>', i);
          if (ge === -1) { out += '&lt;'; i++; continue; }
          // 属性过滤: 仅 <a href> 允许且限定 http/https/mailto 协议, 其余标签/属性全部剥离 (防 XSS)
          if (!isClose && tagName === 'a') {
            var hrefMatch = /href\s*=\s*"([^"]*)"/i.exec(s.slice(i + 1, ge));
            var href = hrefMatch ? hrefMatch[1] : '';
            if (href && /^(https?:|mailto:)/i.test(href)) {
              out += '<a href="' + href.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer">';
            } else {
              out += '<a>';
            }
          } else {
            out += isClose ? '</' + tagName + '>' : '<' + tagName + '>';
          }
          i = ge + 1;
          continue;
        }
        out += '&lt;';
        i++;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  // ---- 全局委托: 任意带 data-tip 属性的元素自动获得自定义 tooltip (替换原生 title) ----
  function findTip(t) {
    if (!t || t.nodeType !== 1 || !t.closest) return null;
    return t.closest('[data-tip]');
  }
  function bindTip(el) {
    if (el.__rtTip) return true;
    var txt = el.getAttribute('data-tip');
    if (txt === null || txt === '') return false;
    el.__rtTip = 1;
    // 闭包内动态读取 data-tip: 元素复用且属性更新后 (如标签标题改名) 不显示陈旧内容
    RichTooltip.bind(el, function () {
      var cur = el.getAttribute('data-tip');
      return RichTooltip.md(cur === null || cur === '' ? txt : cur);
    });
    return true;
  }
  function autoBind() {
    if (document.__rtAutoBound) return;
    document.__rtAutoBound = 1;
    document.addEventListener('mouseover', function (e) {
      var el = findTip(e.target);
      if (!el) {
        // 悬停到无 data-tip 的元素: 收起可能残留的 tooltip (如提示元素被重建移除后)
        if (tipEl && tipEl.style.display && tipEl.style.display !== 'none') hide();
        return;
      }
      if (!bindTip(el)) return;
      var txt = el.getAttribute('data-tip');
      RichTooltip.show(e, RichTooltip.md(txt));
    });
    // 键盘可达性: focus 也显示
    document.addEventListener('focusin', function (e) {
      var el = findTip(e.target);
      if (!el || !bindTip(el)) return;
      var txt = el.getAttribute('data-tip');
      var r = el.getBoundingClientRect();
      RichTooltip.show({ clientX: r.left + Math.min(64, Math.max(8, r.width / 2)), clientY: r.bottom + 6 }, RichTooltip.md(txt));
    });
    document.addEventListener('focusout', function (e) {
      if (findTip(e.target)) RichTooltip.hide();
    });
  }
  autoBind();

  root.RichTooltip = { bind: bind, show: show, hide: hide, md: md };
})();
