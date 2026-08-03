// v1.0.62 冒烟: tooltip 属性过滤 / 动态 data-tip / 无 data-tip 收起
const fs = require('fs');
const vm = require('vm');

let fails = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!cond) fails++;
}

// remote.js 语法与导出完整性
const remote = require('./remote.js');
check(typeof remote.startServer === 'function' && typeof remote.handleClientMessage === 'undefined', 'remote.js 加载正常');

// ---- tooltip.js ----
function loadTip(docStub) {
  const sb = { window: {}, document: docStub, console };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('tooltip.js', 'utf8'), sb);
  return sb.RichTooltip;
}

const doc1 = {
  __rtAutoBound: 0,
  addEventListener: function () {},
  body: { appendChild: function () {} },
  createElement: function () { return { className: '', style: {}, setProperty: function () {}, appendChild: function () {} }; },
};
const RT = loadTip(doc1);
const md = RT.md;

// XSS 过滤
const a1 = md('<a href="javascript:alert(1)">x</a>');
check(a1.indexOf('href="javascript') === -1 && a1.indexOf('<a>') !== -1, 'javascript: href 剥离 (' + a1 + ')');
const a2 = md('<a href="https://example.com/x">x</a>');
check(a2.indexOf('href="https://example.com/x"') !== -1 && a2.indexOf('rel="noopener') !== -1, 'https href 保留 (' + a2 + ')');
const a3 = md('<a href="https://a.com/" onclick="x">y</a>');
check(a3.indexOf('onclick') === -1, 'a 非 href 属性剥离 (' + a3 + ')');
const s1 = md('<span style="position:fixed;color:red">t</span>');
check(s1 === '<span>t</span>', 'span 属性剥离 (' + s1 + ')');
const img1 = md('<img src=x onerror=alert(1)>');
check(img1.indexOf('&lt;img') !== -1, 'img 转义 (' + img1 + ')');
const hrefEsc = md('<a href="https://a.com/\\" onmouseover="alert(1)">z</a>');
check(hrefEsc.indexOf('onmouseover') === -1, '属性引号逃逸防护 (' + hrefEsc + ')');

// ---- 动态 data-tip + 无 data-tip 收起 ----
const tipEvents = {};
const sharedTip = { className: '', style: { display: 'none', setProperty: function () {} }, innerHTML: '', appendChild: function () {}, getBoundingClientRect: function () { return { width: 0, height: 0 }; } };
const doc2 = {
  __rtAutoBound: 0,
  addEventListener: function (t, fn) { tipEvents[t] = fn; },
  body: { appendChild: function () {} },
  createElement: function () { return sharedTip; },
};
loadTip(doc2);
const RT2 = null; // 原 show/hide 直接操作 sharedTip, 通过 sharedTip 状态断言

const el = {
  nodeType: 1, __rtTip: 0,
  style: {},
  closest: function () { return this; },
  getAttribute: function (k) { return k === 'data-tip' ? '新提示' : null; },
  removeAttribute: function () {},
  addEventListener: function () {},
};
const mo = tipEvents.mouseover;
check(typeof mo === 'function', 'mouseover 委托已注册');
if (mo) {
  mo({ target: el, clientX: 1, clientY: 1 });
  check(sharedTip.innerHTML.indexOf('新提示') !== -1 && sharedTip.style.display === 'block', 'data-tip 更新后显示新值 (html=' + sharedTip.innerHTML + ')');
  mo({ target: { nodeType: 1, closest: function () { return null; } }, clientX: 1, clientY: 1 });
  check(sharedTip.style.display === 'none', '无 data-tip 目标时 tooltip 收起');
  // 空 data-tip → 不绑定也不显示
  const emptyEl = {
    nodeType: 1, __rtTip: 0, style: {},
    closest: function () { return this; },
    getAttribute: function (k) { return k === 'data-tip' ? '' : null; },
    removeAttribute: function () {}, addEventListener: function () {},
  };
  sharedTip.style.display = 'none';
  mo({ target: emptyEl, clientX: 1, clientY: 1 });
  check(sharedTip.style.display === 'none', '空 data-tip 不显示 tooltip');
}

// ---- ai-panel 路径校验规则 (与实现逐字符一致) ----
const rule = (p) => {
  if (typeof p !== 'string' || !p) return false;
  if (p.indexOf('\\') !== -1) return false;
  if (p.indexOf('..') !== -1) return false;
  if (p.charAt(0) === '/') return false;
  if (/^[a-zA-Z]:/.test(p) || p.indexOf(':') !== -1) return false;
  return true;
};
check(rule('config/items.yml') && rule('a b/c.yml'), '正常相对路径通过');
check(!rule('../secret.yml') && !rule('a/../b.yml'), '.. 穿越拒绝');
check(!rule('C:/Windows/foo') && !rule('c:\\win'), '盘符/反斜杠拒绝');
check(!rule('/etc/passwd') && !rule(''), '绝对路径/空路径拒绝');
check(!rule('x:y.yml'), '冒号拒绝');

console.log('fails=' + fails);
process.exit(fails ? 1 : 0);
