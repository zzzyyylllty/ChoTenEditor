/* Twemoji 替换: 将 UI 文本中的 emoji 字符替换为本地 twemoji SVG 图片。
 * 映射表来自 twemoji/emoji-map.js (window.CE_EMOJI_MAP)。
 * 跳过可编辑区域 (input/textarea/select/option/contenteditable, 含 CodeMirror),
 * 避免破坏编辑器内容与下拉选项。 */
(function () {
  'use strict';
  var MAP = (typeof window !== 'undefined' && window.CE_EMOJI_MAP) || {};
  var FOLDER = 'twemoji/svg/';
  var imgCache = Object.create(null);

  function isProtected(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION' || tag === 'OPTGROUP') return true;
    if (el.isContentEditable) return true;
    return !!el.closest('.CodeMirror, textarea, input, select, [contenteditable]');
  }

  function imgFor(ch) {
    var img = imgCache[ch];
    if (!img) {
      img = document.createElement('img');
      img.className = 'ce-emoji';
      img.alt = ch;
      img.src = FOLDER + MAP[ch];
      img.setAttribute('draggable', 'false');
      imgCache[ch] = img;
    }
    return img.cloneNode(true);
  }

  function replaceText(node) {
    var text = node.nodeValue;
    if (!text) return;
    var pieces = [];
    var last = 0;
    var i = 0;
    while (i < text.length) {
      var start = i;
      var cp = text.codePointAt(i);
      i += (cp > 0xFFFF) ? 2 : 1;
      var ch = text.slice(start, i);
      if (MAP[ch]) {
        if (last < start) pieces.push(text.slice(last, start));
        pieces.push(imgFor(ch));
        last = i;
      }
    }
    if (!pieces.length) return;
    if (last < text.length) pieces.push(text.slice(last));
    var parent = node.parentNode;
    if (!parent) return; // 扫描期间节点被其他脚本移除
    var frag = document.createDocumentFragment();
    for (var k = 0; k < pieces.length; k++) {
      frag.appendChild(typeof pieces[k] === 'string' ? document.createTextNode(pieces[k]) : pieces[k]);
    }
    node.parentNode.replaceChild(frag, node);
  }

  function scanRoot(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      if (!isProtected(root.parentElement)) replaceText(root);
      return;
    }
    if (root.nodeType !== 1) return;
    if (isProtected(root)) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return isProtected(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (var j = 0; j < nodes.length; j++) replaceText(nodes[j]);
  }

  var pending = [];
  var timer = null;
  function schedule(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 1 || n.nodeType === 3) pending.push(n);
    }
    if (timer) return;
    timer = setTimeout(function () {
      timer = null;
      var list = pending;
      pending = [];
      for (var j = 0; j < list.length; j++) scanRoot(list[j]);
    }, 30);
  }

  function init() {
    if (!document.body || !Object.keys(MAP).length) return;
    scanRoot(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') schedule([m.target]);
        else schedule(m.addedNodes);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
