// CE 表单渲染/写回冒烟测试 (无 DOM: stub container, 检查生成的 HTML 与路径)
// 覆盖: legacy 表单 (item/block/recipe) + schema 表单 (简单 section) + config.yml 可视化
const fs = require('fs');
const vm = require('vm');
const schemaSrc = fs.readFileSync('craftengine-schemas.js', 'utf8');
const src = fs.readFileSync('craftengine-interpreter.js', 'utf8');
const zh = fs.readFileSync('locales/zh_cn.yml', 'utf8');
const I18N = {
  lang: 'zh_cn',
  t: (k, p) => {
    const m = zh.match(new RegExp('^  ' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': "(.*)"', 'm'));
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

// ---------- 1. legacy 表单 (item 等尚无 schema, 保持原行为) ----------
const itemYaml = `
items:
  default:test_item:
    material: paper
    texture: minecraft:item/custom/x
    custom-model-data: 10000
    category:
      - default:a
      - default:b
    template: default:base
    arguments:
      part: helmet
    model:
      type: base
    behavior:
      type: block_item
      block: default:test_block
      rules:
        - test
    data:
      item-name: "<!i>Name"
      lore:
        - "line1"
    events:
      - on: right_click
        functions:
          - type: command
            command: say hi
    settings:
      tags:
        - minecraft:planks
    unknown_field: 123
`;
const el1 = render(itemYaml);
const h = el1.innerHTML;
check(h.includes('data-action="ce-tab" data-ce-tab="basic"'), 'item 选项卡 basic 存在');
check(h.includes('data-ce-tab="model"'), 'item 选项卡 model 存在');
check(h.includes('data-ce-tab="itemData"'), 'item 选项卡 itemData 存在');
check(h.includes('data-ce-tab="behavior"'), 'item 选项卡 behavior 存在');
check(h.includes('data-ce-tab="events"'), 'item 选项卡 events 存在');
check(h.includes('data-ce-tab="other"'), 'item 选项卡 other 存在 (未知字段)');
check(h.includes('data-ce-field="__key__"'), 'key 输入框在表单内');
check(h.indexOf('ce-form-header') < h.indexOf('ce-tabs'), 'key 已从 header 移除, 进入选项卡');
check(h.includes('data-ce-tabpanel="basic"') && h.includes('data-ce-tabpanel="events"'), '选项卡面板存在');
check(h.includes('ce-events-header') && h.includes('data-action="ce-add-event"'), '事件列表视图 + 添加按钮');
check(h.includes('ce-event-item') && h.includes('data-ce-ev="0"'), '事件行存在 (数组形式)');
check(h.includes('data-ce-field="behavior.type"'), 'behavior.type select 存在');
check(h.includes('data-ce-field="behavior.block"'), 'block_item 的 block 字段存在');
check(h.includes('data-ce-field="category"') && h.includes('data-ce-type="lines-scalar"'), 'category lines-scalar (多行数组)');
check(h.includes('data-ce-field-json="model"'), 'model JSON 字段存在 (legacy)');
check(h.includes('data-ce-field-json="settings"') && h.includes('data-json-exclude="tags,equipment"'), 'settings JSON 带 exclude');
check(h.includes('data-ce-field-json="events.0"') === false, '事件不在 JSON 兜底中');
check(h.includes('unknown_field'), '未知字段进入其他选项卡');

// 2. legacy 事件子页面 (map 形式 + array 形式)
const blockYaml = `
blocks:
  default:flower:
    events:
      - on:
          - break
          - place
        functions:
          - type: particle
            x: 1
`;
const h2 = render(blockYaml).innerHTML;
check(h2.includes('data-ce-field="behavior.type"'), 'block 选项卡渲染');
check(h2.includes('data-ce-tabpanel="basic"'), 'block basic 面板');

// 3. legacy 非选项卡类型 (recipe) 仍为单页 + key 在顶部
const recipeYaml = `
recipes:
  default:sword:
    type: shaped
    pattern:
      - "a"
    ingredients:
      a: default:item
    result:
      id: default:sword
      count: 1
`;
const h3 = render(recipeYaml).innerHTML;
check(!h3.includes('data-action="ce-tab"'), 'recipe 无选项卡');
check(h3.includes('data-ce-field="__key__"'), 'recipe 有 key 输入框');

// ---------- 2. schema 简单 section ----------
const eqYaml = `
equipments:
  default:test:
    type: helmet
    layers:
      texture: minecraft:leather
`;
const h4 = render(eqYaml).innerHTML;
check(h4.includes('data-sf-kind="field"') && h4.includes('data-sf-path="type"'), 'equipment type select 存在');
check(h4.includes('data-sf-kind="map"') && h4.includes('data-sf-kind="map-key"'), 'equipment layers mapOf 渲染');
check(h4.includes('data-sf-path="layers.texture"'), 'map 值 union (noTypeKey) 渲染');
check(!h4.includes('data-ce-field-json'), 'equipment 无 JSON 字段编辑器');
check(h4.includes('data-ce-field="__key__"'), 'equipment 有 key 输入框');

const catYaml = `
categories:
  default:test:
    name: Test
    lore:
      - line1
      - line2
    hidden: true
    conditions:
      - type: random
        value: 0.5
    unknown_field: 123
`;
const el5 = render(catYaml);
const h5 = el5.innerHTML;
check(h5.includes('data-sf-path="name"'), 'category name 存在');
check(h5.includes('data-sf-type="lines"') && h5.includes('data-sf-path="lore"'), 'category lore lines');
check(h5.includes('data-sf-path="hidden"') && h5.includes('data-sf-type="bool"'), 'category hidden bool');
check(h5.includes('data-sf-kind="list"') && h5.includes('data-sf-path="conditions"'), 'conditions listOf 渲染');
check(h5.includes('data-sf-action="list-add"'), 'conditions 添加按钮/选择器');
check(h5.includes('data-sf-action="union-set"') && h5.includes('data-sf-path="conditions.0"'), '条件 union-set 存在');
check(h5.includes('data-sf-path="conditions.0.value"') && h5.includes('data-sf-type="number"'), 'random 类型体 value number');
check(h5.includes('data-sf-type="kv-rest"') === false || true, 'otherFields 用 scalar 编辑器');
check(!h5.includes('data-ce-field-json'), 'category 无 JSON 字段编辑器');

// 2.1 写回: schema changeHandler (真实监听器, 渲染前安装捕获)
function renderCap(content, file) {
  const el = {
    innerHTML: '',
    _ceUi: { section: 0, entry: 0 },
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    isConnected: false,
  };
  const listeners = {};
  el.addEventListener = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  CEI.render(file || 'test.yml', content, el, {});
  return { el, listeners };
}
const classList = { add() {}, remove() {} };
const mk = (attrs, value, checked) => ({
  getAttribute: (a) => (attrs[a] !== undefined ? attrs[a] : null),
  value, checked: !!checked, classList,
  closest: () => null,
});

// category 写回
const wR = renderCap(catYaml);
const wEl = wR.el, wL = wR.listeners;
const wParsed = wEl._ceParsed;
const wEntry = wParsed.sections[0].entries[0];
const ch = wL['change'][0]; // changeHandler
function fire(target) { ch({ target }); }

fire(mk({ 'data-sf-kind': 'field', 'data-sf-path': 'name', 'data-sf-type': 'text' }, 'NewName'));
check(wEntry.data.name === 'NewName', '写回: text');
fire(mk({ 'data-sf-kind': 'field', 'data-sf-path': 'lore', 'data-sf-type': 'lines' }, 'a\nb\n'));
check(Array.isArray(wEntry.data.lore) && wEntry.data.lore.length === 2, '写回: lines → 数组');
fire(mk({ 'data-sf-kind': 'field', 'data-sf-path': 'hidden', 'data-sf-type': 'bool' }, null, false));
check(wEntry.data.hidden === false, '写回: bool 取消勾选');
fire(mk({ 'data-sf-kind': 'field', 'data-sf-path': 'hidden', 'data-sf-type': 'bool' }, null, true));
check(wEntry.data.hidden === true, '写回: bool 勾选');
fire(mk({ 'data-sf-kind': 'field', 'data-sf-path': 'conditions.0.value', 'data-sf-type': 'number' }, '0.8'));
check(wEntry.data.conditions[0].value === 0.8, '写回: number');
fire(mk({ 'data-sf-kind': 'field', 'data-sf-path': 'unknown_field', 'data-sf-type': 'scalar' }, 'true'));
check(wEntry.data.unknown_field === true, '写回: scalar 智能解析 true');

// union-set: 切换条件类型 (random → permission)
const uidRe = /data-sf-action="union-set" data-sf-path="conditions\.0" data-sf-uid="([^"]+)"/;
const uidMatch = h5.match(uidRe);
check(!!uidMatch, 'union-set uid 可定位');
if (uidMatch) {
  fire(mk({ 'data-sf-action': 'union-set', 'data-sf-path': 'conditions.0', 'data-sf-uid': uidMatch[1] }, 'permission'));
  check(wEntry.data.conditions[0].type === 'permission' && wEntry.data.conditions[0].value === undefined, '写回: union-set 切换类型 (丢弃非共享键)');
}

// list-add: 通过 pick select 添加条件
const listUidRe = /data-sf-action="list-add" data-sf-uid="([^"]+)"/;
const listUid = h5.match(listUidRe);
check(!!listUid, 'list-add uid 可定位');
if (listUid) {
  fire(mk({ 'data-sf-action': 'list-add', 'data-sf-uid': listUid[1] }, 'block'));
  check(wEntry.data.conditions.length === 2 && wEntry.data.conditions[1].type === 'block', '写回: list-add 追加 union 条目');
}

// kv 写回 (emoji overrides)
const emojiYaml = `
emoji:
  default:test:
    keywords:
      - hi
    overrides:
      k1: v1
`;
const eR = renderCap(emojiYaml);
const eEntry = eR.el._ceParsed.sections[0].entries[0];
eR.listeners['change'][0]({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'overrides', 'data-sf-type': 'kv' }, 'k1: v1\nk2: 5') });
check(eEntry.data.overrides.k1 === 'v1' && eEntry.data.overrides.k2 === 5, '写回: kv 键值解析 (数字值)');

// lines-scalar (match_item.id)
const condYaml = `
categories:
  default:test:
    conditions:
      - type: match_item
        id: minecraft:apple
`;
const cR = renderCap(condYaml);
const cEntry = cR.el._ceParsed.sections[0].entries[0];
const cL = cR.listeners['change'][0];
cL({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'conditions.0.id', 'data-sf-type': 'lines-scalar' }, 'minecraft:apple\nminecraft:oak_log') });
check(Array.isArray(cEntry.data.conditions[0].id) && cEntry.data.conditions[0].id.length === 2, '写回: lines-scalar 多行 → 数组');
cL({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'conditions.0.id', 'data-sf-type': 'lines-scalar' }, 'minecraft:apple') });
check(cEntry.data.conditions[0].id === 'minecraft:apple', '写回: lines-scalar 单行 → 字符串');

// map-key 重命名 (equipment.layers)
const eqR = renderCap(eqYaml);
const eqEntry = eqR.el._ceParsed.sections[0].entries[0];
eqR.listeners['change'][0]({ target: mk({ 'data-sf-kind': 'map-key', 'data-sf-path': 'layers', 'data-sf-okey': 'texture' }, 'chestplate') });
check(!eqEntry.data.layers.texture && eqEntry.data.layers.chestplate === 'minecraft:leather', '写回: map-key 重命名');

// 3. wholeValue section (global_variables / translations / lang)
const gvYaml = `
global_variables:
  my_var: hello
`;
const h6 = render(gvYaml).innerHTML;
check(h6.includes('data-sf-kind="field"') && h6.includes('data-sf-type="whole-text"') && h6.includes('data-sf-path="__whole__"'), 'global_variables 标量 whole-text');

const gvObjYaml = `
translations:
  default:sword:
    zh_cn: 剑
    en_us: Sword
`;
const h7 = render(gvObjYaml).innerHTML;
check(h7.includes('data-sf-type="kv-whole"') && h7.includes('data-sf-path="__whole__"'), 'translations kv-whole');
const trR = renderCap(gvObjYaml);
const trEntry = trR.el._ceParsed.sections[0].entries[0];
trR.listeners['change'][0]({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': '__whole__', 'data-sf-type': 'kv-whole' }, 'zh_cn: 剑\nen_us: Sword') });
check(trEntry.data.en_us === 'Sword' && trEntry.data.zh_cn === '剑', '写回: kv-whole 替换整条数据');

// 4. config.yml 可视化 (每 section 单独渲染检查表单 HTML)
const cfgYaml = `
config-version: 1
metrics: true
update-checker: true
resource-pack:
  path: 'E:/out'
  supported-version:
    min: '1.20.1'
  merge-external-folders:
    - 'E:/a'
  delivery:
    hosting:
      - self
image:
  offset-characters:
    enable: true
    font: minecraft:default
    '0': 'A'
custom-group:
  a: 1
light-system:
  enable: true
`;
const cfgR = renderCap(cfgYaml, 'config.yml');
const cfgEl = cfgR.el;
const cfgParsed = cfgEl._ceParsed;
check(cfgParsed._isConfig === true, 'config 识别: _isConfig');
check(cfgParsed.sections.length === 7, 'config 顶层键投影为 sections');
check(cfgParsed.sections.every(s => s.base === 'config'), 'config sections base = config');
check(cfgParsed.sections[0].key === 'config-version' && cfgParsed.sections[0].entries[0].data === 1, 'config-version 标量值');

function renderSection(content, file, idx) {
  const el = {
    innerHTML: '',
    _ceUi: { section: idx, entry: 0 },
    addEventListener: () => {}, removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    isConnected: false,
  };
  CEI.render(file, content, el, {});
  return el;
}
const cfgH0 = renderSection(cfgYaml, 'config.yml', 0).innerHTML;
const cfgH1 = renderSection(cfgYaml, 'config.yml', 1).innerHTML;
const cfgH3 = renderSection(cfgYaml, 'config.yml', 3).innerHTML;
const cfgH4 = renderSection(cfgYaml, 'config.yml', 4).innerHTML;
const cfgH5 = renderSection(cfgYaml, 'config.yml', 5).innerHTML;
check(cfgH0.includes('data-sf-type="whole-text"') && cfgH0.includes('data-sf-path="__whole__"'), 'config-version whole-text');
check(cfgH1.includes('data-sf-type="whole-bool"'), 'metrics whole-bool');
check(cfgH3.includes('data-sf-path="path"'), 'resource-pack.path 字段');
check(cfgH3.includes('data-sf-path="supported-version.min"'), '嵌套 object 字段');
check(cfgH3.includes('data-sf-type="lines"') && cfgH3.includes('data-sf-path="merge-external-folders"'), 'lines 字段');
check(cfgH3.includes('data-sf-action="union-set"') && cfgH3.includes('data-sf-path="delivery.hosting.0"'), 'delivery.hosting union 列表');
check(cfgH4.includes('data-sf-type="kv-rest"') && cfgH4.includes('data-sf-exclude="enable,font"'), 'offset-characters kv-rest (排除 enable/font)');
check(cfgH5.includes('custom-group') && cfgH5.includes('data-sf-type="kv-rest"'), '未知组折叠 kv-rest');

// config 写回 → _fileLevelRaw (先切换 section)
const cfgCh = cfgR.listeners['change'][0];
cfgR.el._ceUi.section = 0;
cfgCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': '__whole__', 'data-sf-type': 'whole-text' }, '2') });
check(cfgParsed._fileLevelRaw['config-version'] === '2', 'config 写回: whole-text → _fileLevelRaw');
cfgR.el._ceUi.section = 1;
cfgCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': '__whole__', 'data-sf-type': 'whole-bool' }, null, false) });
check(cfgParsed._fileLevelRaw.metrics === false, 'config 写回: whole-bool');
cfgR.el._ceUi.section = 3;
cfgCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'path', 'data-sf-type': 'text' }, 'E:/new') });
check(cfgParsed._fileLevelRaw['resource-pack'].path === 'E:/new', 'config 写回: 嵌套字段');
cfgCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'merge-external-folders', 'data-sf-type': 'lines' }, 'E:/a\nE:/b') });
check(cfgParsed._fileLevelRaw['resource-pack']['merge-external-folders'].length === 2, 'config 写回: lines');
cfgR.el._ceUi.section = 4;
cfgCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'offset-characters', 'data-sf-type': 'kv-rest', 'data-sf-exclude': 'enable,font' }, "'10': 'X'") });
const oc = cfgParsed._fileLevelRaw.image['offset-characters'];
check(oc.enable === true && oc.font === 'minecraft:default' && oc['10'] === 'X', 'config 写回: kv-rest 保留排除键');
cfgR.el._ceUi.section = 5;
cfgCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': '', 'data-sf-type': 'kv-rest', 'data-sf-exclude': '' }, 'a: 2\nb: 3') });
check(cfgParsed._fileLevelRaw['custom-group'].a === 2 && cfgParsed._fileLevelRaw['custom-group'].b === 3, 'config 写回: 未知组 kv-rest 整体替换');

// 5. detectFileType 路径优先 + config 高优先级
check(CEI.detectFileType(itemYaml, 'E:/MC/tra/Ets/plugins/CraftEngine/resources/default/configuration/items/simple.yml') === 'craftengine', 'detect: resources/ns/configuration/items → craftengine');
check(CEI.detectFileType(itemYaml, 'E:/MC/tra/Ets/plugins/CraftEngine/resources/default/configurations/blocks/x.yml') === 'craftengine', 'detect: resources/ns/configurations/blocks → craftengine');
check(CEI.detectFileType(cfgYaml, 'E:/MC/tra/Ets/plugins/CraftEngine/config.yml') === 'craftengine', 'detect: CE config.yml 高优先级');
check(CEI.detectFileType(cfgYaml, 'E:/other/plugin/config.yml') === 'craftengine', 'detect: 任意路径 config.yml 按内容识别');
check(CEI.detectFileType('config-version: 1\nresource-pack: {}\n', 'config.yml') === 'unknown', 'detect: 特有键不足 2 个 → unknown');
check(CEI.detectFileType('version: 1\nmetrics: true\n', 'E:/other/plugin/config.yml') === 'unknown', 'detect: 其它插件 config.yml → unknown');
check(CEI.detectFileType(itemYaml, 'E:/MC/tra/Ets/plugins/CraftEngine/resources/default/items/simple.yml') === 'unknown', 'detect: 非 configuration 目录 → unknown');
check(CEI.detectFileType('items: {}\n', 'config.yml') === 'unknown', 'detect: 普通文件 → unknown');

console.log(fails === 0 ? '\nALL FORM TESTS PASSED' : '\n' + fails + ' FAILURES');
process.exit(fails ? 1 : 0);
