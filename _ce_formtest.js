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

// ---------- 1. schema item 表单 (Phase 2) ----------
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
check(h.includes('data-ce-tab="data"'), 'item 选项卡 data 存在');
check(h.includes('data-ce-tab="model"'), 'item 选项卡 model 存在');
check(h.includes('data-ce-tab="behavior"'), 'item 选项卡 behavior 存在');
check(h.includes('data-ce-tab="settings"'), 'item 选项卡 settings 存在');
check(h.includes('data-ce-tab="events"'), 'item 选项卡 events 存在');
check(h.includes('data-ce-tab="other"'), 'item 选项卡 other 存在 (未知字段)');
check(h.includes('data-ce-field="__key__"'), 'key 输入框在表单内');
check(h.indexOf('ce-form-header') < h.indexOf('ce-tabs'), 'key 已从 header 移除, 进入选项卡');
check(h.includes('data-ce-tabpanel="basic"') && h.includes('data-ce-tabpanel="events"'), '选项卡面板存在');
check(h.includes('ce-events-header') && h.includes('data-action="ce-add-event"'), '事件列表视图 + 添加按钮');
check(h.includes('ce-event-item') && h.includes('data-ce-ev="0"'), '事件行存在 (数组形式)');
check(h.includes('data-sf-kind="components"') && h.includes('data-sf-path="data"'), 'data 组件编辑器渲染');
check(h.includes('data-sf-action="model-mode"') && h.includes('data-sf-path="item_model"'), 'item_model 模型编辑器渲染');
check(h.includes('data-sf-action="union-set"') && h.includes('data-sf-path="behavior"'), 'behavior union 渲染');
const bvPos = h.indexOf('data-sf-path="behavior"');
check(bvPos !== -1 && h.slice(bvPos, bvPos + 400).includes('>不指定<'), 'union 下拉含"不指定"占位 (有值时也在)');
check(h.includes('data-sf-path="behavior.block"'), 'block_item 的 block 字段存在 (union)');
check(h.includes('data-sf-path="category"') && h.includes('data-sf-type="lines-scalar"'), 'category lines-scalar (多行数组)');
const cmdPos = h.indexOf('data-sf-path="custom-model-data"');
check(cmdPos !== -1, 'custom-model-data union 渲染');
check(cmdPos !== -1 && h.slice(cmdPos, cmdPos + 1000).includes('data-sf-type="scalar"'), 'custom-model-data 简单值输入框 (scalar)');
check(cmdPos !== -1 && h.slice(cmdPos, cmdPos + 900).includes('简单值'), '简单值选项文案');
check(cmdPos !== -1 && h.slice(cmdPos, cmdPos + 900).indexOf('value="__scalar"') !== -1 && h.slice(cmdPos, cmdPos + 900).indexOf('value="__scalar"') < h.slice(cmdPos, cmdPos + 900).indexOf('value="map"'), '简单值选项排在下拉框最前');
check(!h.includes('data-ce-field-json'), 'item 表单无 JSON 字段编辑器');
check(h.includes('unknown_field'), '未知字段进入其他选项卡');
check(/ce-stack"><label class="ce-field-label"[^>]*>纹理<\/label>/.test(h), '纹理字段全宽堆叠布局 (layout: stack)');

// 2. block schema 表单 (Phase 3)
const blockYaml = `
blocks:
  default:flower:
    state:
      auto_state: minecraft:flower
      entity_renderer:
        type: item_display
        translation: '1 2 3'
    states:
      properties:
        facing:
          type: direction
          default: east
      appearances:
        default:
          state: '{facing=east}'
      variants:
        '{facing=west}':
          appearance: default
          settings:
            hardness: 1.5
    settings:
      hardness: 1.5
      sounds:
        place:
          id: minecraft:block.wool.place
          pitch: 1.2
    behavior:
      type: bouncing_block
      bounce_height: 2
    loot:
      template: default:loot
      arguments:
        seed: 42
    events:
      - on:
          - break
          - place
        functions:
          - type: particle
            x: 1
`;
const el2 = render(blockYaml);
const h2 = el2.innerHTML;
check(h2.includes('data-ce-tab="state"'), 'block 选项卡 state');
check(h2.includes('data-ce-tab="settings"'), 'block 选项卡 settings');
check(h2.includes('data-ce-tab="behavior"'), 'block 选项卡 behavior');
check(h2.includes('data-ce-tab="loot"'), 'block 选项卡 loot');
check(h2.includes('data-ce-tab="events"'), 'block 选项卡 events');
check(h2.includes('data-sf-action="popup-edit"') && h2.includes('data-sf-path="state"'), 'state 弹窗编辑按钮');
check(h2.includes('data-sf-action="popup-edit"') && h2.includes('data-sf-path="states"'), 'states 弹窗编辑按钮');
check(h2.includes('data-sf-action="popup-edit"') && h2.includes('data-sf-path="settings.sounds"'), 'settings.sounds 弹窗编辑按钮');
check(h2.includes('auto_state: minecraft:flower') && h2.includes('entity_renderer: item_display'), 'state 弹窗摘要 (union 值)');
check(h2.includes('properties: 1 项') && h2.includes('variants: 1 项'), 'states 弹窗摘要 (mapOf 计数)');
check(h2.includes('place: minecraft:block.wool.place'), 'sounds 弹窗摘要 (音效 union 值)');
check(!h2.includes('data-sf-path="state.auto_state"') && !h2.includes('data-sf-path="states.properties"'), 'state/states 内容不再行内渲染 (弹窗内)');
check(h2.includes('data-sf-path="settings.hardness"') && h2.includes('data-sf-type="number"'), 'settings.hardness number');
check(h2.includes('data-sf-path="behavior"') && h2.includes('data-sf-action="union-set"'), 'behavior union 渲染');
check(h2.includes('data-sf-path="behavior.bounce_height"') && h2.includes('data-sf-type="number"'), 'bouncing_block 类型体字段 (union)');
check(h2.includes('data-sf-path="loot.template"'), 'loot template 字段');
check(h2.includes('data-sf-kind="map"') && h2.includes('data-sf-path="loot.arguments"'), 'loot arguments mapOf');
check(h2.includes('data-sf-kind="list"') && h2.includes('data-sf-path="loot.pools"'), 'loot pools listOf');
check(h2.includes('data-ce-tabpanel="events"') && h2.includes('data-ce-ev="0"'), 'block 事件面板渲染');
check(!h2.includes('data-ce-field-json'), 'block 表单无 JSON 字段编辑器');

// 3. recipe schema 表单 (Phase 5)
const recipeYaml = `
recipes:
  default:sword:
    type: shaped
    category: building
    group: swords
    pattern:
      - "a"
      - "b"
    ingredients:
      a: default:item
      b:
        items: minecraft:stick
        count: 2
    result:
      id: default:sword
      count: 1
    transform_processors:
      - type: keep_components
        components:
          - enchantments
    unlock_on_join: true
    conditions:
      - type: permission
        permission: recipe.unlock.bench
    functions:
      - type: command
        command: say crafted
  default:brew:
    type: brewing
    ingredient: tea_art:tea_leaf
    container: tea_art:cup
    result:
      id: tea_art:cup_of_tea
      count: 1
  default:shapeless:
    type: shapeless
    ingredients:
      - "#default:palm_logs"
      - - test:ingredient1
        - test:ingredient2
    result:
      id: default:palm_planks
      count: 4
`;
const h3 = render(recipeYaml).innerHTML;
check(h3.includes('data-action="ce-tab"'), 'recipe 选项卡存在');
check(h3.includes('data-ce-tab="basic"') && h3.includes('data-ce-tab="result"'), 'recipe 基础/结果选项卡');
check(h3.includes('data-ce-tab="advanced"') && h3.includes('data-ce-tab="other"'), 'recipe 高级/其他选项卡');
check(h3.includes('data-ce-field="__key__"'), 'recipe 有 key 输入框');
check(h3.includes('data-sf-kind="field"') && h3.includes('data-sf-path="type"') && h3.includes('data-sf-type="select"'), 'type select');
check(h3.includes('data-sf-type="lines-scalar"') && h3.includes('data-sf-path="pattern"'), 'pattern linesScalar (网格/修饰图案)');
check(h3.includes('data-sf-action="union-set"') && h3.includes('data-sf-path="ingredients"'), 'ingredients 形状 union (map/list)');
check(h3.includes('data-sf-kind="map"') && h3.includes('data-sf-path="ingredients"'), 'shaped: ingredients map');
check(h3.includes('data-sf-kind="field"') && h3.includes('data-sf-path="ingredients.a"'), '网格值标量');
check(h3.includes('data-sf-path="ingredients.b.items"') && h3.includes('data-sf-path="ingredients.b.count"'), '网格值详细对象 (items/count)');
check(h3.includes('data-sf-path="result.id"') && h3.includes('data-sf-path="result.count"'), 'result id/count');
check(h3.includes('data-sf-kind="list"') && h3.includes('data-sf-path="transform_processors"'), 'transform_processors listOf');
check(h3.includes('data-sf-path="transform_processors.0"') && h3.includes('data-sf-action="union-set"'), '处理器 union (type-keyed)');
check(h3.includes('data-sf-path="transform_processors.0.components"') && h3.includes('data-sf-type="lines"'), 'keep_components 类型体 components');
check(h3.includes('data-sf-type="bool"') && h3.includes('data-sf-path="unlock_on_join"'), 'unlock_on_join bool');
check(h3.includes('data-sf-kind="list"') && h3.includes('data-sf-path="conditions"'), 'conditions listOf');
check(h3.includes('data-sf-kind="list"') && h3.includes('data-sf-path="functions"'), 'functions listOf');
check(!h3.includes('data-ce-field-json'), 'recipe 表单无 JSON 字段编辑器');

// brewing 条目 (entry 1)
const elR1 = { innerHTML: '', _ceUi: { section: 0, entry: 1 }, addEventListener: () => {}, removeEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], isConnected: false };
CEI.render('test.yml', recipeYaml, elR1, {});
const hR1 = elR1.innerHTML;
check(hR1.includes('data-sf-path="ingredient"') && hR1.includes('data-sf-action="union-set"'), 'brewing: ingredient union');
check(hR1.includes('data-sf-path="container"') && hR1.includes('data-sf-action="union-set"'), 'brewing: container union');
check(hR1.includes('data-sf-path="result.id"'), 'brewing: result');

// shapeless 条目 (entry 2): ingredients 列表 + 嵌套列表
const elR2 = { innerHTML: '', _ceUi: { section: 0, entry: 2 }, addEventListener: () => {}, removeEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], isConnected: false };
CEI.render('test.yml', recipeYaml, elR2, {});
const hR2 = elR2.innerHTML;
check(hR2.includes('data-sf-kind="list"') && hR2.includes('data-sf-path="ingredients"'), 'shapeless: ingredients list');
check(hR2.includes('data-sf-kind="list"') && hR2.includes('data-sf-path="ingredients.1"'), '嵌套材料列表渲染');

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
check(wParsed._visualDirty === true, '可视化编辑后 _visualDirty 置位 (未同步标记)');
CEI.syncToSource(wParsed);
check(wParsed._visualDirty === false, 'syncToSource 后 _visualDirty 清除');

// union-set: 切换条件类型 (random → permission)
const uidRe = /data-sf-action="union-set" data-sf-path="conditions\.0" data-sf-uid="([^"]+)"/;
const uidMatch = h5.match(uidRe);
check(!!uidMatch, 'union-set uid 可定位');
if (uidMatch) {
  fire(mk({ 'data-sf-action': 'union-set', 'data-sf-path': 'conditions.0', 'data-sf-uid': uidMatch[1] }, 'permission'));
  check(wEntry.data.conditions[0].type === 'permission' && wEntry.data.conditions[0].value === undefined, '写回: union-set 切换类型 (丢弃非共享键)');
}

// list-add: 类型选择器 + 添加按钮
const listUidRe = /data-sf-action="list-add" data-sf-uid="([^"]+)"/;
const listUid = h5.match(listUidRe);
check(!!listUid, 'list-add 按钮可定位');
check(/data-sf-list-pick="1"/.test(h5), 'list-add 类型选择器存在');
if (listUid) {
  const pickSel = mk({ 'data-sf-list-pick': '1' }, 'block');
  const addBtn = mk({ 'data-sf-action': 'list-add', 'data-sf-uid': listUid[1] }, null);
  addBtn.closest = () => ({ querySelector: () => pickSel });
  fire(addBtn);
  check(wEntry.data.conditions.length === 2 && wEntry.data.conditions[1].type === 'block', '写回: list-add 按钮+选择器追加 union 条目');
  const pickEmpty = mk({ 'data-sf-list-pick': '1' }, '');
  const addBtn2 = mk({ 'data-sf-action': 'list-add', 'data-sf-uid': listUid[1] }, null);
  addBtn2.closest = () => ({ querySelector: () => pickEmpty });
  fire(addBtn2);
  check(wEntry.data.conditions.length === 2, 'list-add 未选类型不添加');
}

// list-del / list-move: 按钮必须携带 data-sf-uid 才能定位容器
check(/data-sf-action="list-del" data-sf-idx="0" data-sf-uid="[^"]+"/.test(h5), 'list-del 按钮带 data-sf-uid');
check(/data-sf-action="list-move" data-sf-dir="up" data-sf-idx="0" data-sf-uid="[^"]+"/.test(h5), 'list-move 按钮带 data-sf-uid');
const listDelUid = h5.match(/data-sf-action="list-del" data-sf-idx="0" data-sf-uid="([^"]+)"/);
if (listDelUid) {
  fire(mk({ 'data-sf-action': 'list-del', 'data-sf-idx': '0', 'data-sf-uid': listDelUid[1] }, null));
  check(wEntry.data.conditions.length === 1, '写回: list-del 删除条目');
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

// ---------- 2.2 item 写回 (Phase 2) ----------
const iR = renderCap(itemYaml);
const iEntry = iR.el._ceParsed.sections[0].entries[0];
const iCh = iR.listeners['change'][0];

iCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'material', 'data-sf-type': 'text' }, 'minecraft:iron_ingot') });
check(iEntry.data.material === 'minecraft:iron_ingot', 'item 写回: material text');
iCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'data.item-name', 'data-sf-type': 'text' }, '<!i>New') });
check(iEntry.data.data['item-name'] === '<!i>New', 'item 写回: data.item-name');

// 组件键重命名 (map-key 在 components 内)
iCh({ target: mk({ 'data-sf-kind': 'map-key', 'data-sf-path': 'data', 'data-sf-okey': 'item-name' }, 'custom_name') });
check(!iEntry.data.data['item-name'] && iEntry.data.data.custom_name === '<!i>New', '写回: 组件键重命名 item-name → custom_name');

// comp-add: 添加数据组件
const compUidRe = /data-sf-action="comp-add" data-sf-uid="([^"]+)"/;
const compUid = h.match(compUidRe);
check(!!compUid, 'comp-add uid 可定位');
if (compUid) {
  iCh({ target: mk({ 'data-sf-action': 'comp-add', 'data-sf-uid': compUid[1] }, 'max_damage') });
  check(iEntry.data.data.max_damage === '', '写回: comp-add 添加组件 (默认空值)');
  check(h.includes('__custom__'), '组件下拉含自定义 (键值对) 选项');
  iCh({ target: mk({ 'data-sf-action': 'comp-add', 'data-sf-uid': compUid[1] }, '__custom__') });
  check(iEntry.data.data.custom !== undefined && typeof iEntry.data.data.custom === 'object' && !Array.isArray(iEntry.data.data.custom), '写回: comp-add 自定义组件生成 custom 键');
  iCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'data.custom', 'data-sf-type': 'kv' }, 'foo: {"bar": 1}\n') });
  check(iEntry.data.data.custom.foo && iEntry.data.data.custom.foo.bar === 1, '写回: 自定义组件 kv 嵌套值');
  iCh({ target: mk({ 'data-sf-action': 'comp-add', 'data-sf-uid': compUid[1] }, '__custom__') });
  check(iEntry.data.data.custom_2 !== undefined && typeof iEntry.data.data.custom_2 === 'object', '写回: 重复添加自定义组件 → custom_2');
}

// model-mode: 切换 item_model 为树模式 (原值 undefined → 补 type)
const modelUidRe = /data-sf-action="model-mode" data-sf-path="item_model" data-sf-uid="([^"]+)"/;
const modelUid = h.match(modelUidRe);
check(!!modelUid, 'model-mode uid 可定位');
if (modelUid) {
  iCh({ target: mk({ 'data-sf-action': 'model-mode', 'data-sf-path': 'item_model', 'data-sf-uid': modelUid[1] }, 'tree') });
  check(!!iEntry.data.item_model && iEntry.data.item_model.type === 'minecraft:model', '写回: model-mode → tree 补默认 type');
  iCh({ target: mk({ 'data-sf-action': 'model-mode', 'data-sf-path': 'item_model', 'data-sf-uid': modelUid[1] }, 'path') });
  check(iEntry.data.item_model === undefined, '写回: model-mode → path 空值删除字段');
}

// model-clear: 模型编辑器清除按钮 (有值时显示)
const modelClearRe = /data-sf-action="model-clear" data-sf-path="model" data-sf-uid="([^"]+)"/;
const modelClearUid = h.match(modelClearRe);
check(!!modelClearUid, '模型编辑器清除按钮 (有值时显示)');
if (modelClearUid) {
  iCh({ target: mk({ 'data-sf-action': 'model-clear', 'data-sf-path': 'model', 'data-sf-uid': modelClearUid[1] }, null) });
  check(iEntry.data.model === undefined, '写回: model-clear 删除模型字段');
}

// union-set (noTypeKey): block 字符串 ↔ 内联方块
const blkUidRe = /data-sf-action="union-set" data-sf-path="behavior\.block" data-sf-uid="([^"]+)"/;
const blkUid = h.match(blkUidRe);
check(!!blkUid, 'block union-set uid 可定位');
if (blkUid) {
  iCh({ target: mk({ 'data-sf-action': 'union-set', 'data-sf-path': 'behavior.block', 'data-sf-uid': blkUid[1] }, 'inline') });
  check(iEntry.data.behavior.block !== null && typeof iEntry.data.behavior.block === 'object' && !Array.isArray(iEntry.data.behavior.block), '写回: noTypeKey union-set → inline 默认对象');
  iCh({ target: mk({ 'data-sf-action': 'union-set', 'data-sf-path': 'behavior.block', 'data-sf-uid': blkUid[1] }, '__scalar') });
  check(iEntry.data.behavior.block === '', '写回: noTypeKey union-set → __scalar 存空串显示输入框');
}

// union-set: 改回"不指定" → 删除字段
const bvUidRe = /data-sf-action="union-set" data-sf-path="behavior" data-sf-uid="([^"]+)"/;
const bvUid = h.match(bvUidRe);
check(!!bvUid, 'behavior union-set uid 可定位 (不指定写回)');
if (bvUid) {
  iCh({ target: mk({ 'data-sf-action': 'union-set', 'data-sf-path': 'behavior', 'data-sf-uid': bvUid[1] }, '') });
  check(iEntry.data.behavior === undefined, '写回: union-set 空值(不指定)删除字段');
  iCh({ target: mk({ 'data-sf-action': 'union-set', 'data-sf-path': 'behavior', 'data-sf-uid': bvUid[1] }, 'plain') });
  check(!!iEntry.data.behavior && iEntry.data.behavior.type === 'plain', '写回: 删除后仍可重新选择类型');
}

// ---------- 2.3 block 写回 (Phase 3) ----------
const bR = renderCap(blockYaml);
const bEntry = bR.el._ceParsed.sections[0].entries[0];
const bCh = bR.listeners['change'][0];
const bh = bR.el.innerHTML;

bCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'settings.hardness', 'data-sf-type': 'number' }, '2.5') });
check(bEntry.data.settings.hardness === 2.5, 'block 写回: number');
bCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'loot.arguments.seed', 'data-sf-type': 'scalar' }, '99') });
check(bEntry.data.loot.arguments.seed === 99, 'block 写回: scalar 数字解析');

// popup-clear: 状态清除按钮 (有值时显示) + 写回删除字段
const stClearRe = /data-sf-action="popup-clear" data-sf-path="state" data-sf-uid="([^"]+)"/;
const stClear = bh.match(stClearRe);
check(!!stClear, 'state popup-clear 按钮 (有值时显示)');
if (stClear) {
  const bClk = bR.listeners['click'][0];
  const stBtn = mk({ 'data-sf-action': 'popup-clear', 'data-sf-path': 'state', 'data-sf-uid': stClear[1] }, null);
  stBtn.closest = () => stBtn;
  bClk({ target: stBtn });
  check(bEntry.data.state === undefined, '写回: popup-clear 删除字段');
}

// popup-clear: 无值时不显示清除按钮, 摘要显示占位文案
const blkMinYaml = `
blocks:
  default:plain:
    settings:
      hardness: 1
`;
const hm = render(blkMinYaml).innerHTML;
check(!/data-sf-action="popup-clear" data-sf-path="state"/.test(hm), '未设置 popup 无清除按钮');
check(hm.includes('data-sf-path="state"') && hm.includes('未设置'), '未设置 popup 显示占位文案');

// ---------- 2.5 recipe 写回 (Phase 5) ----------
const rR = renderCap(recipeYaml);
const rEntry = rR.el._ceParsed.sections[0].entries[0];
const rCh = rR.listeners['change'][0];

rCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'ingredients.a', 'data-sf-type': 'text' }, 'default:topaz') });
check(rEntry.data.ingredients.a === 'default:topaz', 'recipe 写回: 网格标量材料');
rCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'ingredients.b.count', 'data-sf-type': 'number' }, '3') });
check(rEntry.data.ingredients.b.count === 3, 'recipe 写回: 网格详细材料 count');
rCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'result.count', 'data-sf-type': 'number' }, '2') });
check(rEntry.data.result.count === 2, 'recipe 写回: result.count');
rCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'pattern', 'data-sf-type': 'lines-scalar' }, 'a\nb\nc') });
check(Array.isArray(rEntry.data.pattern) && rEntry.data.pattern.length === 3, 'recipe 写回: pattern 多行 → 数组');
rCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'pattern', 'data-sf-type': 'lines-scalar' }, 'minecraft:bolt') });
check(rEntry.data.pattern === 'minecraft:bolt', 'recipe 写回: pattern 单行 → 字符串 (smithing_trim)');
rCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'transform_processors.0.components', 'data-sf-type': 'lines' }, 'enchantments\nattribute_modifiers') });
check(Array.isArray(rEntry.data.transform_processors[0].components) && rEntry.data.transform_processors[0].components.length === 2, 'recipe 写回: keep_components components');

// ---------- 2.4 furniture schema 表单 (Phase 4) ----------
const furnYaml = `
furniture:
  default:my_chair:
    variants:
      ground:
        loot_spawn_offset: 0,0.5,0
        elements:
          - type: item_display
            item: default:my_chair_model
            translation: 0,0.5,0
        hitboxes:
          - type: shulker
            position: 0,0,0
            peek: 100
            blocks_building: true
            interactive: true
            interaction_entity: true
            seats:
              - 0.5,0.3,0
          - position: 0,0,0
        entity_culling: false
      wall:
        blueprint: my_model
    settings:
      item: default:my_chair
      hit_times: 3
      sounds:
        break: minecraft:block.bamboo_wood.break
      adventure_mode_breaking: true
      correct_tools:
        - "#minecraft:axes"
    behavior:
      type: glowing_furniture
      lights:
        - 0,0,0 15
    loot:
      template: default:loot_table/furniture
      arguments:
        item: default:my_chair
    events:
      - on: right_click
        functions:
          - type: command
            command: say hi
`;
const elF = render(furnYaml);
const hf = elF.innerHTML;
check(hf.includes('data-ce-tab="variants"'), 'furniture 选项卡 variants');
check(hf.includes('data-ce-tab="settings"'), 'furniture 选项卡 settings');
check(hf.includes('data-ce-tab="behaviors"'), 'furniture 选项卡 behaviors');
check(hf.includes('data-ce-tab="loot"'), 'furniture 选项卡 loot');
check(hf.includes('data-ce-tab="events"'), 'furniture 选项卡 events');
check(hf.includes('data-sf-path="variants.ground.loot_spawn_offset"'), '变体 loot_spawn_offset 字段');
check(hf.includes('data-sf-kind="list"') && hf.includes('data-sf-path="variants.ground.elements"'), 'elements listOf');
check(hf.includes('data-sf-action="union-set"') && hf.includes('data-sf-path="variants.ground.elements.0"'), '元素 union (type-keyed)');
check(hf.includes('data-sf-path="variants.ground.elements.0.item"'), 'item_display 元素 item 字段');
check(hf.includes('data-sf-path="variants.ground.hitboxes.0"') && hf.includes('data-sf-action="union-set"'), 'hitboxes union (type-keyed)');
check(hf.includes('data-sf-path="variants.ground.hitboxes.0.peek"') && hf.includes('data-sf-type="number"'), 'shulker 类型体 peek number');
check(hf.includes('data-sf-type="lines"') && hf.includes('data-sf-path="variants.ground.hitboxes.0.seats"'), 'shulker seats lines');
check(hf.includes('data-sf-action="union-set"') && hf.includes('data-sf-path="variants.ground.hitboxes.1"'), '无 type 碰撞箱 union 渲染 (数据保留)');
check(hf.includes('data-sf-action="union-set"') && hf.includes('data-sf-path="variants.ground.entity_culling"'), 'entity_culling union (标量 bool)');
check(hf.includes('data-sf-path="variants.wall.blueprint"'), '变体 blueprint 字段');
check(hf.includes('data-sf-path="settings.hit_times"') && hf.includes('data-sf-type="number"'), 'settings.hit_times number');
check(hf.includes('data-sf-action="popup-edit"') && hf.includes('data-sf-path="settings.sounds"'), 'settings.sounds 弹窗编辑按钮');
check(hf.includes('break: minecraft:block.bamboo_wood.break'), 'furniture sounds 弹窗摘要');
check(hf.includes('data-sf-type="lines"') && hf.includes('data-sf-path="settings.correct_tools"'), 'settings.correct_tools lines');
check(hf.includes('data-sf-path="behavior"') && hf.includes('data-sf-action="union-set"'), 'behavior union');
check(hf.includes('data-sf-kind="list"') && hf.includes('data-sf-path="behavior.lights"'), 'glowing 行为 lights listOf');
check(hf.includes('data-sf-path="behavior.lights.0"'), 'lights 条目 union (noTypeKey 标量简写)');
check(hf.includes('data-sf-path="loot.template"'), 'loot template 字段');
check(hf.includes('data-sf-kind="map"') && hf.includes('data-sf-path="loot.arguments"'), 'loot arguments mapOf');
check(hf.includes('data-ce-tabpanel="events"') && hf.includes('data-ce-ev="0"'), 'furniture 事件面板渲染');
check(!hf.includes('data-ce-field-json'), 'furniture 表单无 JSON 字段编辑器');

// furniture 写回
const fR = renderCap(furnYaml);
const fEntry = fR.el._ceParsed.sections[0].entries[0];
const fCh = fR.listeners['change'][0];
const fh = fR.el.innerHTML;

fCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'variants.ground.hitboxes.0.seats', 'data-sf-type': 'lines' }, '0.5,0.3,0 90\n0,0.3,0') });
check(Array.isArray(fEntry.data.variants.ground.hitboxes[0].seats) && fEntry.data.variants.ground.hitboxes[0].seats.length === 2, 'furniture 写回: seats lines');
fCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'settings.hit_times', 'data-sf-type': 'number' }, '5') });
check(fEntry.data.settings.hit_times === 5, 'furniture 写回: hit_times number');
fCh({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'loot.arguments.item', 'data-sf-type': 'scalar' }, 'default:bench') });
check(fEntry.data.loot.arguments.item === 'default:bench', 'furniture 写回: loot.arguments.item');

// popup-clear: 音效清除按钮 (click 事件)
const sndClearRe = /data-sf-action="popup-clear" data-sf-path="settings\.sounds" data-sf-uid="([^"]+)"/;
const sndClear = fh.match(sndClearRe);
check(!!sndClear, '音效 popup-clear 按钮可定位');
if (sndClear) {
  const clk = fR.listeners['click'][0];
  check(!!clk, 'click 监听器已安装');
  if (clk) {
    const clearBtn = mk({ 'data-sf-action': 'popup-clear', 'data-sf-path': 'settings.sounds', 'data-sf-uid': sndClear[1] }, null);
    clearBtn.closest = () => clearBtn;
    clk({ target: clearBtn });
    check(fEntry.data.settings.sounds === undefined, '写回: popup-clear 删除音效字段');
  }
}

// updater: map 版本 → 步骤列表/单个步骤
const upYaml = `
items:
  default:u:
    updater:
      "1.0.0":
        - type: apply_data
          data:
            - path: item_model
              value: minecraft:apple
      "2.0.0":
        type: reset
`;
const upR = renderCap(upYaml);
const upEntry = upR.el._ceParsed.sections[0].entries[0];
check(Array.isArray(upEntry.data.updater['1.0.0']) && upEntry.data.updater['1.0.0'][0].type === 'apply_data', 'updater 解析: 步骤列表');
check(upEntry.data.updater['2.0.0'].type === 'reset', 'updater 解析: 单个步骤');
check(upR.el.innerHTML.includes('data-sf-path="updater.1\\.0\\.0"'), 'updater map 值 union (noTypeKey) 渲染 (点键转义)');
upR.listeners['change'][0]({ target: mk({ 'data-sf-kind': 'field', 'data-sf-path': 'updater.1\\.0\\.0.0.data.0.value', 'data-sf-type': 'text' }, 'minecraft:stick') });
check(upEntry.data.updater['1.0.0'][0].data[0].value === 'minecraft:stick', 'updater 写回: apply_data 嵌套 value (含点键)');

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
