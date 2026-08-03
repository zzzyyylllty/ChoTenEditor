// 临时: 阶段2 特殊配置 ! 按钮渲染验证 (无 DOM)
const fs = require('fs');
const vm = require('vm');
const schemaSrc = fs.readFileSync('craftengine-schemas.js', 'utf8');
const src = fs.readFileSync('craftengine-interpreter.js', 'utf8');
const zh = fs.readFileSync('locales/zh_cn.yml', 'utf8');
const I18N = {
  lang: 'zh_cn',
  t: (k, p) => {
    const kk = k.replace(/^craftengine\./, '');
    const m = zh.match(new RegExp('^  ' + kk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': "(.*)"', 'm'));
    return m ? m[1].replace(/\{(\w+)\}/g, (_, n) => p ? (p[n] !== undefined ? p[n] : '') : '') : k;
  },
};
const sb = { jsyaml: require('js-yaml'), console, require, I18N, playSound: () => {} };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(schemaSrc, sb);
vm.runInContext(src, sb);
const CEI = sb.CraftEngineInterpreter;

let fails = 0;
function check(cond, msg) {
  if (cond) console.log('PASS', msg);
  else { console.log('FAIL', msg); fails++; }
}
function render(content, file) {
  const el = {
    innerHTML: '',
    _ceUi: { section: 0, entry: 0 },
    addEventListener: () => {}, removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    isConnected: false,
  };
  CEI.render(file || 'test.yml', content, el, {});
  return el;
}

// 1. 普通标量字段: ! 存在且灰色 (无 has-spec)
const y1 = `
items:
  demo:t:
    material: stone
`;
const h1 = render(y1).innerHTML;
const icons = h1.split('data-sf-action="spec-popup"').length - 1;
check(icons >= 5, '字段行都有 ! 按钮 (找到 ' + icons + ' 个)');
check(!h1.includes('ce-sf-spec-icon has-spec'), '无特殊配置时无 has-spec');
check(h1.includes('ce-sf-spec-icon'), '! 按钮基础类存在');

// 2. !!type wrap 值 → has-spec
const y2 = `
items:
  demo:t:
    material: !!long 1234
`;
const h2 = render(y2).innerHTML;
check(h2.includes('ce-sf-spec-icon has-spec'), '!!long 值 → 高亮');
check(h2.includes('title="特殊配置 · 值类型 long"'), 'tooltip 显示值类型');

// 3. mapOf 中 $$ 版本键 → has-spec
const y3 = `
items:
  demo:t:
    client-bound-material:
      $$1.20.1~1.21.1: bow
      $$fallback: sword
`;
const h3 = render(y3).innerHTML;
check(h3.includes('ce-sf-spec-icon has-spec'), '$$ 版本键 → 高亮');
check(h3.includes('title="特殊配置 · 版本条件 2 项"'), 'tooltip 显示版本条件数');

// 4. spec-popup 按钮带路径与字段类型 (client-bound-material 为 text 字段, 值含 $$ 键 → versions 模式)
check(/data-sf-path="client-bound-material" data-sf-ftype="text" data-sf-label="客户端材质" title="特殊配置 · 版本条件 2 项"/.test(h3), '! 按钮带路径/字段类型/高亮 tooltip');

// 4b. mapOf 徽标为 kind 符号而非 $ (避免 $$+$ 三美元)
const y3b = `
items:
  demo:t:
    arguments:
      $$1.21.2~1.21.4: 5
      $$fallback: 1
`;
const h3b = render(y3b).innerHTML;
check(h3b.includes('has-verkey'), 'mapOf 容器 has-verkey');
check(/"范围 · \$\$1\.21\.2~1\.21\.4"/.test(h3b), '范围徽标 tooltip 含双美元键');
check(/class="ce-sf-map-ver"[^>]*>~</.test(h3b), '范围徽标显示 ~');
check(/class="ce-sf-map-ver"[^>]*>↩</.test(h3b), '回退徽标显示 ↩');
check(h3b.includes('value="$$fallback"'), 'mapOf 键输入框保留双美元键');

// 4c. entry 键版本徽标: equipments 分组 (equipments: { $$>=1.21.2: {...} })
const y4c = `
equipments:
  $$>=1.21.2:
    default:topaz:
      type: component
      humanoid: minecraft:topaz
`;
const h4c = render(y4c).innerHTML;
check(h4c.includes('ce-entry-item') && h4c.includes('ce-sf-map-ver'), 'entry 列表版本键带徽标');
check(/"比较 · \$\$&gt;=1\.21\.2"/.test(h4c), '比较徽标 tooltip');
check(/class="ce-sf-map-ver"[^>]*>>=</.test(h4c), '比较徽标显示操作符');
check(h4c.includes('data-ce-field="__key__"'), 'entry key 输入框存在');

// 4d. entry 内字段层版本键 (参数覆盖/合并, wiki 例 2): 未建模字段带徽标
const y4d = `
items:
  demo:t:
    material: stone
    $$>=1.21.2:
      data:
        item_name: hi
`;
const h4d = render(y4d).innerHTML;
check(h4d.includes('$$&gt;=1.21.2'), '内嵌版本键字段保留');
check(/ce-sf-rest.*ce-sf-map-ver/s.test(h4d) || h4d.includes('ce-sf-map-ver'), '内嵌版本键字段带徽标');

// 5. config.yml whole 值字段也有 ! (config-version, 需含 CE 特有键触发 _isConfig)
const y4 = `config-version: 1
resource-pack:
  path: 'x'
light-system:
  enable: true
`;
const h4 = render(y4, 'config.yml').innerHTML;
check(h4.includes('data-sf-path="__whole__"') && h4.includes('data-sf-action="spec-popup"'), 'config 标量组也有 ! 按钮');
check(!h4.includes('ce-sf-spec-icon has-spec'), 'config 无特殊配置时不高亮');

console.log('---');
console.log(fails === 0 ? 'ALL SPEC RENDER TESTS PASSED' : fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
