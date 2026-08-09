// v1.0.86 冒烟: wiki 对比新增字段 (模型树 tints/condition/select/range_dispatch 附加字段,
// special banner color/attachment, 弹射物按目标音效, 去皮音效对象, emoji 图片引用格式, 默认值提示)
// VM 渲染断言 (同 _ce_formtest.js 风格, 无需 Electron)
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
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!cond) fails++;
}
function render(content) {
  const el = {
    innerHTML: '',
    _ceUi: { section: 0, entry: 0 },
    addEventListener: () => {}, removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    isConnected: false,
  };
  CEI.render('test.yml', content, el, {});
  return el;
}
function hasPath(html, p) { return html.includes('data-sf-path="' + p + '"'); }

// ---------- A. 模型树 tints: grass temperature/downfall + custom_model_data index ----------
const A_Y = [
  'items:',
  '  demo:t:',
  '    material: diamond_sword',
  '    model:',
  '      type: minecraft:model',
  '      path: minecraft:item/custom/sword',
  '      tints:',
  '        - type: minecraft:grass',
  '          temperature: 0.5',
  '          downfall: 0.5',
  '        - type: minecraft:custom_model_data',
  '          index: 1',
  '          default: 16777215',
].join('\n') + '\n';
const hA = render(A_Y).innerHTML;
check(hasPath(hA, 'model.tints.0.temperature') && hA.includes('model.tints.0.temperature" data-sf-type="number"'), 'A1 tints grass temperature 字段渲染 (number)');
check(hasPath(hA, 'model.tints.0.downfall'), 'A2 tints grass downfall 字段渲染');
check(hasPath(hA, 'model.tints.1.index') && hasPath(hA, 'model.tints.1.default'), 'A3 tints custom_model_data index/default 字段渲染');

// ---------- B. condition 附加字段 ----------
const B_Y = [
  'items:',
  '  demo:b:',
  '    material: bow',
  '    model:',
  '      type: minecraft:condition',
  '      property: minecraft:has_component',
  '      component: minecraft:enchantments',
  '      ignore_default: true',
  '      keybind: key.left',
  '      index: 0',
  '      on_true:',
  '        type: minecraft:model',
  '        path: minecraft:item/custom/bow_pull',
  '      on_false:',
  '        type: minecraft:model',
  '        path: minecraft:item/custom/bow',
].join('\n') + '\n';
const hB = render(B_Y).innerHTML;
check(hasPath(hB, 'model.component') && hB.includes('minecraft:enchantments'), 'B1 condition component 附加字段 (has_component)');
check(hasPath(hB, 'model.ignore_default') && hB.includes('data-sf-type="bool"'), 'B2 condition ignore_default 附加字段 (bool)');
check(hasPath(hB, 'model.predicate') && hasPath(hB, 'model.value'), 'B3 condition predicate/value 附加字段 (component)');
check(hasPath(hB, 'model.keybind') && hasPath(hB, 'model.index'), 'B4 condition keybind/index 附加字段');

// ---------- C. select 附加字段 (local_time) ----------
const C_Y = [
  'items:',
  '  demo:s:',
  '    material: crossbow',
  '    model:',
  '      type: minecraft:select',
  '      property: minecraft:local_time',
  '      pattern: "HH:mm:ss"',
  '      locale: en_US',
  '      time_zone: "GMT+8:00"',
  '      cases:',
  '        - when: a',
  '          model:',
  '            type: minecraft:model',
  '            path: minecraft:item/custom/x',
  '      fallback:',
  '        type: minecraft:empty',
].join('\n') + '\n';
const hC = render(C_Y).innerHTML;
check(hasPath(hC, 'model.pattern') && hasPath(hC, 'model.locale') && hasPath(hC, 'model.time_zone'), 'C1 select local_time 附加字段 (pattern/locale/time_zone)');
check(hasPath(hC, 'model.block_state_property'), 'C2 select block_state 附加字段');

// ---------- D. range_dispatch 附加字段 ----------
const D_Y = [
  'items:',
  '  demo:r:',
  '    material: shield',
  '    model:',
  '      type: minecraft:range_dispatch',
  '      property: minecraft:compass',
  '      target: spawn',
  '      wobble: false',
  '      normalize: true',
  '      source: daytime',
  '      remaining: false',
  '      index: 0',
  '      entries:',
  '        - threshold: 0',
  '          model:',
  '            type: minecraft:model',
  '            path: minecraft:item/custom/y',
].join('\n') + '\n';
const hD = render(D_Y).innerHTML;
check(hasPath(hD, 'model.target') && hD.includes('value="spawn"'), 'D1 range_dispatch compass target 附加字段 (select)');
check(hasPath(hD, 'model.wobble') && hasPath(hD, 'model.normalize'), 'D2 range_dispatch wobble/normalize 附加字段 (bool)');
check(hasPath(hD, 'model.source') && hD.includes('value="daytime"'), 'D3 range_dispatch time source 附加字段 (select)');
check(hasPath(hD, 'model.remaining') && hasPath(hD, 'model.index'), 'D4 range_dispatch use_duration remaining / custom_model_data index');

// ---------- E. special banner: color (16 色必填) + attachment ----------
const E_Y = [
  'items:',
  '  demo:bn:',
  '    material: banner',
  '    model:',
  '      type: minecraft:special',
  '      base: minecraft:item/custom/banner_base',
  '      model:',
  '        type: minecraft:banner',
  '        color: red',
  '        attachment: ground',
].join('\n') + '\n';
const hE = render(E_Y).innerHTML;
check(hasPath(hE, 'model.model.color') && hE.includes('value="red" selected') && hE.includes('value="white"'), 'E1 banner color select 渲染 16 色且选中 red');
check(hasPath(hE, 'model.model.attachment') && hE.includes('value="wall"'), 'E2 banner attachment select 渲染 (ground/wall)');

// ---------- F. 弹射物音效: hit_block {default, overrides} 按目标切换 ----------
const F_Y = [
  'items:',
  '  demo:tri:',
  '    material: trident',
  '    settings:',
  '      projectile:',
  '        sounds:',
  '          throw: minecraft:item.trident.throw',
  '          hit_block:',
  '            default: minecraft:item.trident.hit',
  '            overrides:',
  '              minecraft:stone: minecraft:item.trident.hit_stone',
].join('\n') + '\n';
const hF = render(F_Y).innerHTML;
check(hF.includes('data-sf-path="settings.projectile.sounds.hit_block" data-sf-ftype="union"'), 'F1 hit_block 音效为 union');
check(hF.includes('value="targeted" selected'), 'F2 {default, overrides} 值推断为按目标切换类型');
check(hasPath(hF, 'settings.projectile.sounds.hit_block.default') && hasPath(hF, 'settings.projectile.sounds.hit_block.overrides'), 'F3 targeted 类型渲染 default/overrides 字段');
check(hF.includes('minecraft:item.trident.hit_stone'), 'F4 overrides 值渲染保留');
check(hasPath(hF, 'settings.projectile.sounds.throw'), 'F5 throw 音效字段存在');

// 写回往返: 修改 overrides 后序列化保留
const pF = CEI.parse(F_Y);
const yamlF = CEI.generateYAML(pF);
check(yamlF.indexOf('hit_block:') !== -1 && yamlF.indexOf('minecraft:item.trident.hit_stone') !== -1, 'F6 序列化保留 {default, overrides} 结构');

// ---------- G. 去皮音效: sound {id,pitch,volume} ----------
const G_Y = [
  'blocks:',
  '  default:palm_log:',
  '    behavior:',
  '      type: strippable_block',
  '      stripped: default:stripped_palm_log',
  '      sound:',
  '        id: minecraft:item.axe.strip',
  '        pitch: 0.9~1',
  '        volume: 1',
].join('\n') + '\n';
const hG = render(G_Y).innerHTML;
check(hasPath(hG, 'behavior.sound') && hG.includes('data-sf-ftype="union"'), 'G1 strippable sound 为 union');
check(hG.includes('value="map" selected'), 'G2 {id,pitch,volume} 值推断为详细类型');
check(hasPath(hG, 'behavior.sound.id') && hasPath(hG, 'behavior.sound.pitch') && hasPath(hG, 'behavior.sound.volume'), 'G3 sound 对象渲染 id/pitch/volume');

// ---------- H. emoji 图片引用格式 ----------
const H_Y = [
  'emoji:',
  '  default:smiley:',
  '    image: default:emojis:0:0',
  '    keywords:',
  '      - \':smiley:\'',
].join('\n') + '\n';
const hH = render(H_Y).innerHTML;
check(hH.includes('namespace:id:row:column'), 'H1 emoji image hint 显示 namespace:id:row:column 格式');

// ---------- I. 默认值提示 ----------
const I_Y = [
  'items:',
  '  demo:fu:',
  '    behavior:',
  '      type: furniture_item',
  '      furniture: default:bench',
  '      blacklist: false',
  '  demo:wl:',
  '    behavior:',
  '      type: liquid_collision_furniture_item',
  '      furniture: default:water_lily',
  '      source_only: true',
].join('\n') + '\n';
const hI = render(I_Y).innerHTML;
check(hI.includes('黑名单模式 (默认)'), 'I1 furniture_item blacklist 默认值提示');
check(hI.includes('默认 true'), 'I2 liquid_collision_furniture_item source_only 默认值提示');

console.log('fails=' + fails);
process.exit(fails ? 1 : 0);
