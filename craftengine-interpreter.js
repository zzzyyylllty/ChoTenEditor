/* ChoTenEditor CraftEngine (CE) 配置可视化编辑器
 * 依赖: js-yaml (jsyaml 全局), I18N, playSound, window.codeMirrorEditor, window.updateStatus
 * CE 配置特征: 顶层集合键 (items:/blocks:/furniture:/recipes:/...) + namespace:path 条目, 无顶层 type 字段
 * 分段键 items#0: / items#extra_item: 同文件多段合并; :: 扁平嵌套; $$ 版本条件键
 * 已知限制 (与 chemdah 一致): 同步为全文件重建, 注释与引号风格丢失; !!long 等 Java tag 值规范化为普通数字
 */
(function () {
  'use strict';
  var ROOT = typeof window !== 'undefined' ? window : globalThis;
  var YAML = (typeof jsyaml !== 'undefined') ? jsyaml : require('js-yaml');

  function _t(key, params) {
    return (typeof I18N !== 'undefined' && I18N.t) ? I18N.t(key, params) : key;
  }
  function _sound(name) {
    try { if (typeof playSound === 'function') playSound(name); } catch (e) {}
  }
  function _escHtml(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ============ 常量 ============
  var SECTION_KEYS = [
    'items', 'blocks', 'furniture', 'recipes', 'equipments', 'images', 'emoji',
    'categories', 'global_variables', 'jukebox_songs', 'loot_sources', 'paintings',
    'sounds', 'translations', 'placed_features', 'templates', 'lang',
  ];
  // 条目类型: 决定表单分支; 未列出的 section 走通用 JSON 编辑
  var TYPE_SECTIONS = {
    items: 'item', blocks: 'block', furniture: 'furniture', recipes: 'recipe',
    equipments: 'equipment', images: 'image', categories: 'category', sounds: 'sound',
    emoji: 'emoji', jukebox_songs: 'jukeboxSong', paintings: 'painting',
    global_variables: 'globalVariable', translations: 'translation', lang: 'lang',
    loot_sources: 'lootSource', placed_features: 'placedFeature', templates: 'template',
  };
  // 条目键不带 namespace:path 的 section（新建/重命名用单 ID 输入）
  var KEY_ONLY_SECTIONS = { global_variables: 1, translations: 1, lang: 1 };
  var KEY_ONLY_RE = /^[a-zA-Z0-9_.-]+$/;
  var SECTION_BASE_RE = /^([A-Za-z0-9_]+)(#.*)?$/;
  var EQUIPMENT_TYPES = ['component', 'trim'];
  var EQUIPMENT_LAYERS = ['humanoid', 'humanoid_leggings', 'wings', 'wolf_body', 'horse_body', 'llama_body', 'pig_saddle', 'strider_saddle', 'camel_saddle', 'horse_saddle', 'donkey_saddle', 'mule_saddle', 'skeleton_horse_saddle', 'zombie_horse_saddle', 'happy_ghast_body', 'camel_husk_saddle', 'nautilus_body'];
  var LOOT_SOURCE_TYPES = ['block_break', 'entity_death', 'fishing', 'piglin_barter', 'container', 'archaeology', 'entity_drop', 'harvest', 'shear_block', 'vault', 'advancement'];
  var LOOT_OVERWRITE = ['none', 'items', 'experience', 'all'];
  // 使用选项卡分页表单的条目类型 (基础/模型/物品数据/行为/事件)
  var TABBED_TYPES = { item: 1, block: 1, furniture: 1 };
  var ITEM_BEHAVIOR_TYPES = [
    'item', 'block_item', 'ceiling_block_item', 'wall_block_item', 'ground_block_item',
    'double_high_block_item', 'multi_high_block_item', 'liquid_collision_block_item',
    'furniture_item', 'liquid_collision_furniture_item', 'compostable_item', 'range_mining_item',
  ];
  var BLOCK_BEHAVIOR_TYPES = [
    'crop_block', 'door_block', 'fence_block', 'stairs_block', 'slab_block', 'falling_block',
    'strippable_block', 'budding_block', 'button_block', 'trapdoor_block', 'pressure_plate_block',
    'seat_block', 'sofa_block', 'grass_block', 'spreading_block', 'sapling_block', 'stem_block',
    'bush_block', 'lamp_block', 'toggleable_lamp_block', 'decay_block', 'leaves_block',
    'snowy_block', 'concrete_powder_block', 'drop_experience_block', 'display_item_block',
    'simple_storage_block', 'liquid_flowable_block', 'near_liquid_block', 'on_liquid_block',
    'hangable_block', 'hanging_block', 'multi_high_block', 'double_high_block',
    'directional_attached_block', 'face_attached_horizontal_directional_block',
    'attached_stem_block', 'change_over_time_block', 'chime_block', 'drawer_block',
    'fence_gate_block', 'item_frame_block', 'simple_particle_block', 'stackable_block',
    'sturdy_base_block', 'surface_spreading_block', 'tint_source_block', 'vertical_crop_block',
    'wall_torch_particle_block', 'bouncing_block', 'drop_exp_block',
  ];
  var FURNITURE_BEHAVIOR_TYPES = ['simple_storage_furniture', 'glowing_furniture', 'display_item_furniture'];
  // 每个 behavior 的建模字段: [path, type] 或 [path, 'select', [options]]
  // type: text / number / bool / lines / select / json; 数据源: wiki i18n/zh-Hans behaviors 文档
  var BEHAVIOR_FIELDS = {
    // ---- block behaviors ----
    attached_stem_block: [['fruit', 'text'], ['stem', 'text']],
    bouncing_block: [['bounce_height', 'number'], ['fall_damage_multiplier', 'number'], ['sync_player_position', 'bool']],
    budding_block: [['growth_chance', 'number'], ['blocks', 'lines']],
    bush_block: [['blacklist', 'bool'], ['stackable', 'bool'], ['max_height', 'number'], ['delay', 'number'], ['bottom_blocks', 'lines'], ['bottom_block_tags', 'lines']],
    button_block: [['ticks_to_stay_pressed', 'number'], ['can_be_activated_by_arrows', 'bool'], ['sounds', 'json']],
    change_over_time_block: [['change_speed', 'number'], ['next_block', 'text'], ['excluded_properties', 'lines']],
    chime_block: [['sounds', 'json']],
    concrete_powder_block: [['solid_block', 'text']],
    crop_block: [['grow_speed', 'number'], ['light_requirement', 'number'], ['max_light_requirement', 'number'], ['spawn_light_requirement', 'number'], ['max_spawn_light_requirement', 'number'], ['is_bone_meal_target', 'bool'], ['bone_meal_age_bonus', 'json']],
    decay_block: [['decay_into', 'text'], ['delay', 'text'], ['chance', 'number'], ['required_light', 'number']],
    directional_attached_block: [['blacklist', 'bool'], ['attached_blocks', 'lines'], ['attached_block_tags', 'lines']],
    display_item_block: [['position', 'text'], ['has_signal', 'bool'], ['data_key', 'text'], ['tint_source', 'bool'], ['sounds', 'json']],
    door_block: [['can_open_with_hand', 'bool'], ['can_open_by_wind_charge', 'bool'], ['sounds', 'json']],
    drawer_block: [['max_stacks', 'number'], ['has_signal', 'bool'], ['allow_input', 'bool'], ['allow_output', 'bool'], ['item_position', 'text'], ['text_position', 'text'], ['item_scale', 'text'], ['text_scale', 'text'], ['data_key', 'text'], ['compatible_mode', 'bool'], ['sounds', 'json']],
    drop_exp_block: [['amount', 'text'], ['conditions', 'json']],
    drop_experience_block: [['amount', 'text'], ['conditions', 'json']],
    face_attached_horizontal_directional_block: [['blacklist', 'bool'], ['attached_blocks', 'lines'], ['attached_block_tags', 'lines']],
    falling_block: [['hurt_amount', 'number'], ['max_hurt', 'number'], ['sounds', 'json']],
    fence_block: [['connectable_block_tag', 'text'], ['can_leash', 'bool']],
    fence_gate_block: [['can_open_with_hand', 'bool'], ['can_open_by_wind_charge', 'bool'], ['sounds', 'json']],
    grass_block: [['feature', 'text']],
    hanging_block: [['blacklist', 'bool'], ['stackable', 'bool'], ['max_height', 'number'], ['delay', 'number'], ['above_blocks', 'lines'], ['above_block_tags', 'lines']],
    item_frame_block: [['position', 'text'], ['glow', 'bool'], ['invisible', 'bool'], ['render_map_item', 'bool'], ['data_key', 'text'], ['sounds', 'json']],
    liquid_flowable_block: [['drop_item', 'bool']],
    multi_high_block: [['property', 'text']],
    near_liquid_block: [['liquid_type', 'lines'], ['stackable', 'bool'], ['positions', 'lines']],
    on_liquid_block: [['liquid_type', 'lines'], ['stackable', 'bool']],
    pressure_plate_block: [['sensitivity', 'select', ['all', 'mob']], ['pressed_time', 'number'], ['sounds', 'json']],
    sapling_block: [['feature', 'text'], ['light_requirement', 'number'], ['max_light_requirement', 'number'], ['grow_speed', 'number'], ['bone_meal_success_chance', 'number']],
    seat_block: [['seats', 'lines']],
    simple_particle_block: [['tick_interval', 'number'], ['particles', 'json']],
    simple_storage_block: [['title', 'text'], ['rows', 'number'], ['has_signal', 'bool'], ['allow_input', 'bool'], ['allow_output', 'bool'], ['data_key', 'text'], ['sounds', 'json']],
    spreading_block: [['target_block', 'text']],
    stackable_block: [['property', 'text'], ['items', 'lines']],
    stem_block: [['fruit', 'text'], ['attached_stem', 'text'], ['light_requirement', 'number'], ['max_light_requirement', 'number'], ['fruit_bottom_blocks', 'lines'], ['fruit_bottom_block_tags', 'lines']],
    strippable_block: [['stripped', 'text'], ['excluded_properties', 'lines'], ['tools', 'lines'], ['sound', 'text']],
    sturdy_base_block: [['direction', 'text'], ['support_types', 'lines'], ['stackable', 'bool'], ['max_height', 'number'], ['delay', 'number']],
    surface_spreading_block: [['light_requirement', 'number'], ['max_light_requirement', 'number'], ['base_block', 'text']],
    tint_source_block: [['drop_item', 'bool'], ['data_key', 'text']],
    toggleable_lamp_block: [['can_open_with_hand', 'bool']],
    trapdoor_block: [['can_open_with_hand', 'bool'], ['can_open_by_wind_charge', 'bool'], ['sounds', 'json']],
    vertical_crop_block: [['max_height', 'number'], ['grow_speed', 'number'], ['direction', 'select', ['up', 'down']]],
    wall_torch_particle_block: [['tick_interval', 'number'], ['particles', 'json']],
    // ---- item behaviors ----
    block_item: [['block', 'text']],
    ceiling_block_item: [['block', 'text']],
    compostable_item: [['chance', 'number']],
    double_high_block_item: [['block', 'text']],
    furniture_item: [['furniture', 'text'], ['rules', 'json'], ['ignore_placer', 'bool'], ['ignore_entities', 'bool']],
    ground_block_item: [['block', 'text']],
    liquid_collision_block_item: [['offset_y', 'number'], ['block', 'text']],
    liquid_collision_furniture_item: [['furniture', 'text'], ['rules', 'json'], ['ignore_placer', 'bool'], ['ignore_entities', 'bool'], ['source_only', 'bool'], ['liquid_type', 'lines']],
    multi_high_block_item: [['block', 'text']],
    range_mining_item: [['conditions', 'json'], ['range', 'lines']],
    wall_block_item: [['block', 'text']],
    // ---- furniture behaviors ----
    display_item_furniture: [['data_key', 'text'], ['sounds', 'json'], ['variants', 'json']],
    glowing_furniture: [['lights', 'json'], ['variants', 'json']],
    simple_storage_furniture: [['title', 'text'], ['rows', 'number'], ['data_key', 'text'], ['sounds', 'json']],
  };
  var RECIPE_TYPES = [
    'shaped', 'shapeless', 'shaped_transform', 'shapeless_transform', 'smelting', 'blasting',
    'smoking', 'campfire_cooking', 'stonecutting', 'smithing_transform', 'smithing_trim', 'brewing',
  ];
  var VETO_NAME_RE = /^pack\.ya?ml$/;
  var NS_RE = /^[a-z0-9_]+$/;
  var PATH_RE = /^[a-zA-Z0-9_./-]+$/;
  // CE config.yml 特有顶层键 (用于区分其它插件 config.yml; 经服务器实测至少需 2 个)
  var CE_CONFIG_KEYS_RE = /^[ \t]*(resource-pack|light-system|chunk-system|client-optimization|forced-locale)\s*:/gm;
  function _looksLikeCeConfig(fname, content) {
    if (!/^config\.ya?ml$/.test(fname)) return false;
    if (!/^[ \t]*config-version\s*:/m.test(content || '')) return false;
    var m = String(content || '').match(CE_CONFIG_KEYS_RE);
    return m !== null && m.length >= 2;
  }

  // ============ 检测 ============
  // 策略: 路径优先。CE 工程文件仅在 resources/<命名空间>/configuration(s)/ 目录内识别;
  // config.yml (插件配置) 高优先级单独识别。
  function detectFileType(content, filePath) {
    if (typeof content !== 'string' || !content.trim()) return 'unknown';
    var fpath = filePath ? String(filePath).replace(/\\/g, '/') : '';
    var fname = fpath.split('/').pop() || '';
    if (VETO_NAME_RE.test(fname)) return 'unknown';
    // CE 工程文件: 仅 resources/<namespace>/configuration(s)/ 目录内
    if (fpath) {
      var parts = fpath.split('/');
      for (var i = 0; i + 2 < parts.length; i++) {
        if (parts[i] === 'resources' && (parts[i + 2] === 'configuration' || parts[i + 2] === 'configurations')) {
          return 'craftengine';
        }
      }
    }
    // [高优先级] CE 插件 config.yml
    if (_looksLikeCeConfig(fname, content)) return 'craftengine';
    return 'unknown';
  }

  // ============ 工程根回溯（渲染层经 IPC） ============
  var _projectCache = Object.create(null); // dir -> Promise
  function resolveProjectRoot(filePath) {
    if (!filePath || !ROOT.electronAPI || !ROOT.electronAPI.ce) {
      return Promise.resolve({ found: false });
    }
    var dir = filePath.replace(/\\/g, '/').replace(/\/[^/]*$/, '');
    if (_projectCache[dir]) return _projectCache[dir];
    var p = ROOT.electronAPI.ce.resolveProjectRoot(filePath).catch(function () { return { found: false }; });
    _projectCache[dir] = p;
    return p;
  }

  // ============ 解析 ============
  function parse(content) {
    var doc = null;
    var strippedTags = 0;
    try {
      doc = YAML.load(content);
    } catch (e) {
      if (/unknown tag/.test(String(e.message || e))) {
        var fixed = content.replace(/!![A-Za-z][A-Za-z0-9]* /g, function () { strippedTags++; return ''; });
        try { doc = YAML.load(fixed); } catch (e2) { return { error: e2.message || String(e2) }; }
      } else {
        return { error: e.message || String(e) };
      }
    }

    var parsed = {
      sections: [],
      _fileLevelRaw: {},
      _topOrder: [],
      _strippedTags: strippedTags,
      _comments: { head: [], tail: [], top: {}, topInline: {}, sub: {}, subInline: {}, afterKey: {}, afterSection: {} },
    };
    if (doc === null || doc === undefined) {
      _collectComments(content, parsed);
      return parsed;
    }
    if (typeof doc !== 'object' || Array.isArray(doc)) {
      return { error: 'top-level must be a mapping' };
    }

    var order = Object.keys(doc);
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      var m = key.match(SECTION_BASE_RE);
      if (m && SECTION_KEYS.indexOf(m[1]) !== -1 && doc[key] && typeof doc[key] === 'object' && !Array.isArray(doc[key])) {
        var section = {
          key: key,
          base: m[1],
          segment: m[2] || '',
          entries: [],
          entryOrder: Object.keys(doc[key]),
          _comments: { beforeEntry: {}, inlineEntry: {} },
        };
        var entries = Object.keys(doc[key]);
        for (var e = 0; e < entries.length; e++) {
          var edata = doc[key][entries[e]];
          section.entries.push({
            key: entries[e],
            data: edata,
            _rawOrder: (edata && typeof edata === 'object' && !Array.isArray(edata)) ? Object.keys(edata) : [],
            _comments: { before: {}, inline: {}, afterKey: {} },
          });
        }
        parsed.sections.push(section);
        parsed._topOrder.push({ kind: 'section', key: key });
      } else {
        parsed._fileLevelRaw[key] = doc[key];
        parsed._topOrder.push({ kind: 'raw', key: key });
      }
    }
    _collectComments(content, parsed);
    return parsed;
  }

  // ---- 注释采集 ----
  // 按行扫描原文件, 把注释按"键路径"记录到解析模型, 供序列化时回写
  function _splitInline(line) {
    var inS = false, inD = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '\\' && (inS || inD)) { i++; continue; }
      if (c === "'" && !inD) inS = !inS;
      else if (c === '"' && !inS) inD = !inD;
      else if (c === '#' && !inS && !inD && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) {
        return { value: line.slice(0, i).replace(/\s+$/, ''), comment: line.slice(i) };
      }
    }
    return { value: line, comment: null };
  }

  function _collectComments(content, parsed) {
    var C = parsed._comments;
    var secByKey = Object.create(null);
    for (var s = 0; s < parsed.sections.length; s++) secByKey[parsed.sections[s].key] = parsed.sections[s];

    var lines = content.split(/\r?\n/);
    var stack = [{ indent: -1, kind: 'root', path: '', sec: null, entry: null, entryKey: null }];
    var pending = [];
    var inBlock = false, blockBase = -1;
    var prevTopKey = null;

    function pushTo(b, key, text) {
      var arr = b[key] || (b[key] = []);
      arr.push(text);
    }
    function bucket(scope, inline) {
      if (scope.kind === 'section' || scope.kind === 'filetop') return inline ? C.topInline : C.top;
      if (scope.kind === 'entry') {
        var ec = scope.sec._comments;
        return inline ? ec.inlineEntry : ec.beforeEntry;
      }
      if (scope.kind === 'map') {
        return scope.entry
          ? (inline ? scope.entry._comments.inline : scope.entry._comments.before)
          : (inline ? C.subInline : C.sub);
      }
      return null;
    }
    function afterBucket(scope) {
      return scope.entry ? scope.entry._comments.afterKey : C.afterKey;
    }
    function targetOf(scope, inline) {
      var b = (scope.kind === 'seq' || scope.kind === 'itemmap') ? afterBucket(scope) : bucket(scope, inline);
      if (!b) return null;
      return { b: b, key: scope.kind === 'entry' ? scope.entryKey : scope.path };
    }
    function flushText(scope, inline, text) {
      var t = targetOf(scope, inline);
      if (t) pushTo(t.b, t.key, text);
    }
    function flushPending(scope) {
      var t = targetOf(scope, false);
      if (!t) return;
      for (var i = 0; i < pending.length; i++) pushTo(t.b, t.key, pending[i].text);
      pending = [];
    }
    function newScope(indent, kind, path, sec, entry, entryKey) {
      return { indent: indent, kind: kind, path: path, sec: sec, entry: entry, entryKey: entryKey || null };
    }

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var indent = 0;
      while (indent < line.length && line[indent] === ' ') indent++;

      if (inBlock) {
        if (!line.trim() || indent > blockBase) continue;
        inBlock = false;
      }
      if (/^\s*#/.test(line)) { pending.push({ text: line.replace(/^\s+/, ''), indent: indent }); continue; }
      if (!line.trim()) continue;

      var sp = _splitInline(line);
      var content = sp.value;
      var dash = content.substr(indent, 2) === '- ' || content.substr(indent) === '-';

      if (dash) {
        while (stack.length > 1 && stack[stack.length - 1].indent > indent) stack.pop();
        var top = stack[stack.length - 1];
        if (top.kind === 'seq' && top.indent === indent) {
          flushPending(top);
        } else {
          var seqScope = newScope(indent, 'seq', top.path, top.sec, top.entry, null);
          flushPending(seqScope);
          stack.push(seqScope);
          top = seqScope;
        }
        if (sp.comment) flushText(top, false, sp.comment);
        var rest = content.substr(indent).replace(/^- ?/, '');
        if (/^[|>][-+]?\d*\s*$/.test(rest)) { inBlock = true; blockBase = indent; }
        else {
          var km = rest.match(/^(\S.*?):(\s|$)/);
          if (km) stack.push(newScope(indent + 2, 'itemmap', top.path, top.sec, top.entry, null));
        }
        continue;
      }

      var keyM = content.substr(indent).match(/^(\S.*?):(\s|$)/);
      if (keyM) {
        var key = keyM[1];
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
        var top = stack[stack.length - 1];
        if (top.kind === 'seq' || top.kind === 'itemmap') {
          flushPending(top);
          if (sp.comment) flushText(top, false, sp.comment);
          stack.push(newScope(indent, 'itemmap', top.path, top.sec, top.entry, null));
          continue;
        }
        var parent = top;
        var scope;
        if (parent.kind === 'root') {
          var isSec = !!secByKey[key];
          for (var pi = 0; pi < pending.length; pi++) {
            if (pending[pi].indent === 0) pushTo(C.top, key, pending[pi].text);
            else if (prevTopKey) pushTo(C.afterSection, prevTopKey, pending[pi].text);
            else C.head.push(pending[pi].text);
          }
          pending = [];
          scope = newScope(indent, isSec ? 'section' : 'filetop', key, isSec ? secByKey[key] : null, null, null);
          prevTopKey = key;
        } else if (parent.kind === 'section') {
          var en = null;
          for (var eni = 0; eni < parent.sec.entries.length; eni++) {
            if (parent.sec.entries[eni].key === key) { en = parent.sec.entries[eni]; break; }
          }
          scope = newScope(indent, 'entry', '', parent.sec, en, key);
        } else {
          var p = parent.path;
          scope = newScope(indent, 'map', p ? p + '.' + key : key, parent.sec, parent.entry, null);
        }
        flushPending(scope);
        if (sp.comment) flushText(scope, true, sp.comment);
        stack.push(scope);
        if (/:\s*[|>][-+]?\d*\s*$/.test(content.substr(indent))) { inBlock = true; blockBase = indent; }
        continue;
      }
      // 其它续行: 保持作用域, 不采集
    }
    for (var ti = 0; ti < pending.length; ti++) {
      if (pending[ti].indent === 0) C.tail.push(pending[ti].text);
      else if (prevTopKey) pushTo(C.afterSection, prevTopKey, pending[ti].text);
      else C.tail.push(pending[ti].text);
    }
  }

  // ============ 序列化 ============
  var _SPECIAL_START_RE = /^[-?!#`"&*|>%@<\s,\[\]{}]/;
  var _NUMBER_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
  var _BOOL_RE = /^(true|false|yes|no|on|off|null|none|~)$/i;

  function _quoteKey(key) {
    if (/:\s/.test(key) || /\s#/.test(key) || /[:#\s]$/.test(key) || _SPECIAL_START_RE.test(key) || key === '' || key !== String(key)) {
      return "'" + String(key).replace(/'/g, "''") + "'";
    }
    return String(key);
  }

  function _genFlow(val) {
    if (Array.isArray(val)) return '[' + val.map(_genFlow).join(', ') + ']';
    if (val && typeof val === 'object' && !(val instanceof Date)) {
      return '{' + Object.keys(val).map(function (k) { return _quoteKey(k) + ': ' + _genFlow(val[k]); }).join(', ') + '}';
    }
    return _genScalar(val);
  }

  function _genScalar(val) {
    if (typeof val === 'number') return isFinite(val) ? String(val) : 'null';
    if (typeof val === 'boolean') return String(val);
    var s = String(val);
    if (s === '') return "''";
    var needsQuote =
      _SPECIAL_START_RE.test(s) || /:\s/.test(s) || /\s#/.test(s) || /[\s:#]$/.test(s) ||
      _NUMBER_RE.test(s) || _BOOL_RE.test(s);
    if (!needsQuote) return s;
    if (s.indexOf("'") !== -1) {
      return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }
    return "'" + s + "'";
  }

  function _fmtDate(d) {
    var y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, da = d.getUTCDate();
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
  }

  // 生成 map 块的行（含缩进）; cm 为注释表 { before, inline, afterKey }, prefix 为当前路径前缀
  function _genMapLines(map, indent, cm, prefix) {
    var pad = '  '.repeat(indent);
    var lines = [];
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var path = prefix ? prefix + '.' + k : k;
      if (cm && cm.before && cm.before[path]) {
        var bcs = cm.before[path];
        for (var bci = 0; bci < bcs.length; bci++) lines.push(pad + bcs[bci]);
      }
      var inline = (cm && cm.inline && cm.inline[path]) || null;
      var after = (cm && cm.afterKey && cm.afterKey[path]) || null;
      var v = map[k];
      var kq = _quoteKey(k);
      var header;
      if (v === null || v === undefined) header = pad + kq + ': ~';
      else if (typeof v === 'string' && v.indexOf('\n') !== -1) header = pad + kq + ': |-';
      else if (typeof v === 'object') {
        if (v instanceof Date) header = pad + kq + ': ' + _genScalar(_fmtDate(v));
        else if (Array.isArray(v)) header = (v.length === 0) ? pad + kq + ': []' : pad + kq + ':';
        else header = (Object.keys(v).length === 0) ? pad + kq + ': {}' : pad + kq + ':';
      } else header = pad + kq + ': ' + _genScalar(v);
      if (inline) header += ' ' + inline;
      lines.push(header);
      // 值体
      if (typeof v === 'string' && v.indexOf('\n') !== -1) {
        var vs = v.split('\n');
        for (var li = 0; li < vs.length; li++) lines.push(pad + '  ' + vs[li]);
      } else if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
        if (Array.isArray(v)) {
          if (v.length > 0) {
            if (after) for (var aci = 0; aci < after.length; aci++) lines.push(pad + '  ' + after[aci]);
            for (var ai = 0; ai < v.length; ai++) {
              var item = v[ai];
              if (item !== null && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)) {
                if (Object.keys(item).length === 0) { lines.push(pad + '  - {}'); continue; }
                var rendered = _genMapLines(item, indent + 2);
                lines.push(rendered[0].replace(pad + '    ', pad + '  - '));
                for (var ri = 1; ri < rendered.length; ri++) lines.push(rendered[ri]);
              } else if (typeof item === 'string' && item.indexOf('\n') !== -1) {
                lines.push(pad + '  - |-');
                var is = item.split('\n');
                for (var ii = 0; ii < is.length; ii++) lines.push(pad + '    ' + is[ii]);
              } else if (Array.isArray(item)) {
                lines.push(pad + '  - ' + _genFlow(item));
              } else {
                lines.push(pad + '  - ' + _genScalar(item));
              }
            }
          }
        } else if (Object.keys(v).length > 0) {
          var sub = _genMapLines(v, indent + 1, cm, path);
          for (var si = 0; si < sub.length; si++) lines.push(sub[si]);
        }
      }
    }
    return lines;
  }

  // 序列化单个顶层键值对（file-level raw 键）; cm 为文件级注释表, prefix 为路径前缀
  function _genTopBlock(key, val, cm, prefix) {
    var kq = _quoteKey(key);
    var path = prefix ? prefix + '.' + key : key;
    var inline = (cm && cm.topInline && cm.topInline[key]) || null;
    if (val === null || val === undefined) {
      var l0 = kq + ': ~';
      return inline ? l0 + ' ' + inline : l0;
    }
    if (typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date) && Object.keys(val).length === 0) {
      var l1 = kq + ': {}';
      return inline ? l1 + ' ' + inline : l1;
    }
    if (typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      var lines = [kq + ':'];
      if (cm && cm.afterKey && cm.afterKey[path]) {
        var a = cm.afterKey[path];
        for (var ai = 0; ai < a.length; ai++) lines.push('  ' + a[ai]);
      }
      var sub = _genMapLines(val, 1, { before: cm.sub, inline: cm.subInline, afterKey: cm.afterKey }, key);
      for (var si = 0; si < sub.length; si++) lines.push(sub[si]);
      if (inline) lines[0] += ' ' + inline;
      return lines.join('\n');
    }
    var l2 = kq + ': ' + _genScalar(val);
    return inline ? l2 + ' ' + inline : l2;
  }

  function _entryKeyOrder(entry) {
    var keys = [];
    for (var i = 0; i < (entry._rawOrder || []).length; i++) keys.push(entry._rawOrder[i]);
    if (entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)) {
      var all = Object.keys(entry.data);
      for (var j = 0; j < all.length; j++) {
        if (keys.indexOf(all[j]) === -1) keys.push(all[j]);
      }
    }
    return keys;
  }

  function generateYAML(parsed) {
    var C = parsed._comments || { head: [], tail: [], top: {}, topInline: {}, afterSection: {} };
    var blocks = [];
    if (!parsed._topOrder || parsed._topOrder.length === 0) {
      var emptyLines = (C.head || []).concat(C.tail || []);
      return emptyLines.length ? emptyLines.join('\n') + '\n{}' : '{}';
    }
    for (var hi = 0; hi < (C.head || []).length; hi++) blocks.push(C.head[hi]);
    for (var i = 0; i < parsed._topOrder.length; i++) {
      var t = parsed._topOrder[i];
      var topC = (C.top || {})[t.key] || null;
      if (topC) for (var tci = 0; tci < topC.length; tci++) blocks.push(topC[tci]);
      var inlineTop = (C.topInline || {})[t.key] || null;
      if (t.kind === 'raw') {
        blocks.push(_genTopBlock(t.key, parsed._fileLevelRaw[t.key], C, t.key));
      } else {
        var section = null;
        for (var s = 0; s < parsed.sections.length; s++) {
          if (parsed.sections[s].key === t.key) { section = parsed.sections[s]; break; }
        }
        if (section) {
          var kq = _quoteKey(section.key);
          if (section.entries.length === 0) {
            var es = kq + ': {}';
            if (inlineTop) es += ' ' + inlineTop;
            blocks.push(es);
          } else {
            var lines = [kq + ':'];
            if (inlineTop) lines[0] += ' ' + inlineTop;
            var secC = section._comments || { beforeEntry: {}, inlineEntry: {} };
            for (var e = 0; e < section.entries.length; e++) {
              var entry = section.entries[e];
              var ec = entry._comments || { before: {}, inline: {}, afterKey: {} };
              var bf = secC.beforeEntry[entry.key] || null;
              if (bf) for (var bi = 0; bi < bf.length; bi++) lines.push('  ' + bf[bi]);
              var eq = _quoteKey(entry.key);
              var inlineEntry = secC.inlineEntry[entry.key] || null;
              var ed = entry.data;
              var el;
              if (ed === null || ed === undefined) { el = '  ' + eq + ': ~'; }
              else if (typeof ed === 'object' && !Array.isArray(ed) && !(ed instanceof Date)) {
                el = (Object.keys(ed).length === 0) ? '  ' + eq + ': {}' : '  ' + eq + ':';
                if (inlineEntry) el += ' ' + inlineEntry;
                lines.push(el);
                el = null;
                if (Object.keys(ed).length > 0) {
                  var em = _genMapLines(ed, 2, ec, '');
                  for (var mi = 0; mi < em.length; mi++) lines.push(em[mi]);
                }
              } else if (Array.isArray(ed)) {
                el = (ed.length === 0) ? '  ' + eq + ': []' : '  ' + eq + ':';
                if (inlineEntry) el += ' ' + inlineEntry;
                lines.push(el);
                el = null;
                if (ed.length > 0) {
                  var aE = ec.afterKey[''] || null;
                  if (aE) for (var ae = 0; ae < aE.length; ae++) lines.push('    ' + aE[ae]);
                  for (var li2 = 0; li2 < ed.length; li2++) {
                    var it2 = ed[li2];
                    if (it2 !== null && typeof it2 === 'object' && !Array.isArray(it2) && !(it2 instanceof Date)) {
                      if (Object.keys(it2).length === 0) { lines.push('    - {}'); continue; }
                      var r2 = _genMapLines(it2, 3);
                      lines.push(r2[0].replace('      ', '    - '));
                      for (var rj = 1; rj < r2.length; rj++) lines.push(r2[rj]);
                    } else if (typeof it2 === 'string' && it2.indexOf('\n') !== -1) {
                      lines.push('    - |-');
                      var i3 = it2.split('\n');
                      for (var i4 = 0; i4 < i3.length; i4++) lines.push('      ' + i3[i4]);
                    } else if (Array.isArray(it2)) {
                      lines.push('    - ' + _genFlow(it2));
                    } else {
                      lines.push('    - ' + _genScalar(it2));
                    }
                  }
                }
              } else { el = '  ' + eq + ': ' + _genScalar(ed); }
              if (el !== null) {
                if (inlineEntry) el += ' ' + inlineEntry;
                lines.push(el);
              }
            }
            blocks.push(lines.join('\n'));
          }
        } /* if (section) */
      } /* else (section block) */
      var afterS = (C.afterSection || {})[t.key] || null;
      if (afterS) for (var asi = 0; asi < afterS.length; asi++) blocks.push(afterS[asi]);
    }
    for (var tli = 0; tli < (C.tail || []).length; tli++) blocks.push(C.tail[tli]);
    return blocks.join('\n');
  }

  function syncToSource(parsed) {
    if (parsed && parsed._isPopup) return; // 弹窗内临时数据, 不写回源码
    var yaml = generateYAML(parsed);
    if (ROOT.codeMirrorEditor) {
      ROOT.codeMirrorEditor.setValue(yaml);
      if (typeof ROOT.updateStatus === 'function') ROOT.updateStatus(_t('craftengine.syncedToSource'));
    }
    if (parsed) parsed._visualDirty = false;
  }

  // ============ Schema 表单引擎 (craftengine-schemas.js) ============
  var _sfSchemas = (typeof CESchemas !== 'undefined' && CESchemas) ? CESchemas : null;
  var _sfRegPairs = null;
  var _sfDatalistMap = null;
  var _sfUidSeq = 0;
  var _sfUidMap = {};
  var _sfL = function (zh, en) { return { zh: zh, en: en }; };
  var _sfNumRe = /^-?\d+(\.\d+)?$/;
  var _sfLastParsed = null; // 最近一次 render 的 parsed, 用于标记"尚未同步到源码"的更改

  function _sfMarkDirty(parsed) {
    if (parsed && !parsed._visualDirty) parsed._visualDirty = true;
  }

  function _sfInit() {
    if (_sfSchemas === null && typeof CESchemas !== 'undefined') _sfSchemas = CESchemas;
    if (_sfRegPairs) return;
    _sfRegPairs = [];
    if (_sfSchemas && _sfSchemas.types) {
      var ks = Object.keys(_sfSchemas.types);
      for (var i = 0; i < ks.length; i++) _sfRegPairs.push({ key: ks[i], obj: _sfSchemas.types[ks[i]] });
    }
    _sfDatalistMap = {};
    if (_sfSchemas && _sfSchemas.constants) {
      var cs = _sfSchemas.constants;
      Object.keys(cs).forEach(function (k) {
        if (Array.isArray(cs[k])) _sfDatalistMap[k] = cs[k];
      });
      var vi = cs.vanillaItems || [];
      _sfDatalistMap.items = vi;
      _sfDatalistMap.blocks = vi;
    }
  }
  function _labelOf(field) {
    if (field === null || field === undefined) return '';
    var lb = field.label;
    if (typeof lb === 'string') return lb;
    if (lb && typeof lb === 'object') {
      var lang = (typeof I18N !== 'undefined' && I18N.lang) ? I18N.lang : 'zh_cn';
      return lang === 'en_us' ? (lb.en || lb.zh || '') : (lb.zh || lb.en || '');
    }
    return field.key || '';
  }
  function _sfTypesOf(def) {
    return (typeof def.types === 'function') ? def.types() : (def.types || {});
  }
  function _sfRegName(obj) {
    for (var i = 0; i < _sfRegPairs.length; i++) {
      if (_sfRegPairs[i].obj === obj) return _sfRegPairs[i].key;
    }
    return null;
  }
  // 序列化 def → JSON 属性: 循环类型引用 (registry) 替换为 {__sfRef: key}
  function _sfNorm(def) {
    _sfInit();
    if (def === null || typeof def !== 'object') return def;
    if (Array.isArray(def)) return def.map(_sfNorm);
    var reg = _sfRegName(def);
    if (reg) return { __sfRef: reg };
    var out = {};
    Object.keys(def).forEach(function (k) {
      var v = def[k];
      if (typeof v === 'function') v = v();
      out[k] = _sfNorm(v);
    });
    return out;
  }
  function _sfUidAlloc(path, kind, def, opts) {
    _sfUidSeq++;
    var uid = 'ce-sf-' + _sfUidSeq;
    _sfUidMap[uid] = { path: path, kind: kind, def: def, inList: !!(opts && opts.inList) };
    return uid;
  }
  function _sfUidOf(el) {
    if (!el || !el.closest) return null;
    var w = el.closest('[data-sf-uid]');
    return w ? w.getAttribute('data-sf-uid') : null;
  }
  function _sfEntry(parsed, ui) {
    if (!parsed || !ui || !parsed.sections[ui.section]) return null;
    return parsed.sections[ui.section].entries[ui.entry] || null;
  }
  function _sfSection(parsed, ui) {
    if (!parsed || !ui) return null;
    return parsed.sections[ui.section] || null;
  }
  function _sfDefaultOf(def) {
    if (!def) return {};
    var t = def.type;
    if (t === 'listOf') return [];
    if (t === 'mapOf') return {};
    if (t === 'union' || t === 'object') return {};
    if (t === 'lines' || t === 'linesScalar') return [];
    if (t === 'kv' || t === 'kvRest') return {};
    if (t === 'bool') return false;
    return '';
  }
  // kv 行解析: JSON 对象/数组 / 带引号字符串 / true/false / 数字 / 字符串 (键始终为字符串)
  function _parseKvLine(v) {
    var s = String(v).trim();
    if (/^[\[{"']/.test(s)) {
      try {
        var j = JSON.parse(s);
        if (j !== null && typeof j === 'object') return j;
        if (typeof j === 'string') return j; // "xxx" → 字符串 (含转义处理)
      } catch (e) {}
      if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1);
    }
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (_sfNumRe.test(s)) return parseFloat(s);
    return v;
  }
  function _parseKvText(text) {
    var obj = {};
    var bad = null;
    var lines = String(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].replace(/\r$/, '');
      if (!ln.trim()) continue;
      var idx = ln.indexOf(':');
      if (idx <= 0) { bad = lines[i]; break; }
      var k = ln.slice(0, idx).trim();
      if (k.length >= 2 && ((k[0] === '"' && k[k.length - 1] === '"') || (k[0] === "'" && k[k.length - 1] === "'"))) {
        k = k.slice(1, -1);
      }
      var v = ln.slice(idx + 1).trim();
      obj[k] = v === '' ? '' : _parseKvLine(v);
    }
    return { obj: obj, bad: bad };
  }
  function _sfScalarText(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return '';
    return String(v);
  }
  function _sfObjText(obj) {
    return Object.keys(obj).map(function (k) {
      var v = obj[k];
      return k + ': ' + ((v && typeof v === 'object') ? JSON.stringify(v) : String(v));
    }).join('\n');
  }

  // ---- 布局: 两栏 (行) / 堆叠 ----
  var _SF_STACK_TYPES = { textarea: 1, miniText: 1, lines: 1, linesScalar: 1, kv: 1, kvRest: 1, listOf: 1, mapOf: 1, union: 1, object: 1, wholeText: 1, kvWhole: 1, components: 1, model: 1, popup: 1, tabs: 1 };
  function _sfIsStack(t) { return _SF_STACK_TYPES[t] === 1; }

  // ---- 控件 (无标签) ----
  function _sfInput(def, path, value, type) {
    return '<input class="ce-input" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="' + (type || 'text') + '"' +
      (def.placeholder ? ' placeholder="' + _escHtml(_labelOf(def.placeholder)) + '"' : '') +
      (def.datalist ? ' list="ce-dl-' + _escHtml(def.datalist) + '"' : '') +
      ' value="' + _escHtml(_sfScalarText(value)).replace(/"/g, '&quot;') + '" spellcheck="false">';
  }
  function _sfCheckbox(def, path, value) {
    return '<input type="checkbox" class="ce-input" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="bool"' + (value ? ' checked' : '') + '>';
  }
  function _sfSelect(def, path, value) {
    var opts = def.options || [];
    var num = false;
    for (var i = 0; i < opts.length; i++) {
      if (typeof opts[i] === 'number') { num = true; break; }
    }
    var html = '<select class="ce-input" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="select"' + (num ? ' data-sf-num="1"' : '') + '>' +
      '<option value="">-- ' + _escHtml(_t('craftengine.fieldEmpty')) + ' --</option>';
    for (var j = 0; j < opts.length; j++) {
      var o = opts[j];
      var ov = (o !== null && typeof o === 'object') ? o.v : o;
      var ol = (o !== null && typeof o === 'object') ? (o.l !== undefined ? o.l : String(o.v)) : String(o);
      html += '<option value="' + _escHtml(String(ov)) + '"' + (String(value) === String(ov) ? ' selected' : '') + '>' + _escHtml(String(ol)) + '</option>';
    }
    return html + '</select>';
  }
  function _sfTextarea(def, path, value, rows) {
    return '<textarea class="ce-input" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="text"' +
      (def.placeholder ? ' placeholder="' + _escHtml(_labelOf(def.placeholder)) + '"' : '') +
      ' rows="' + (rows || def.rows || 4) + '" spellcheck="false">' + _escHtml(_sfScalarText(value)) + '</textarea>';
  }
  function _sfLines(def, path, value, scalar) {
    var arr;
    if (Array.isArray(value)) arr = value;
    else if (value === undefined || value === null) arr = [];
    else arr = [String(value)];
    var text = arr.map(function (l) { return String(l); }).join('\n');
    return '<textarea class="ce-input ce-lines-field" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="' + (scalar ? 'lines-scalar' : 'lines') + '"' +
      (def.placeholder ? ' placeholder="' + _escHtml(_labelOf(def.placeholder)) + '"' : '') +
      ' rows="' + (scalar ? (arr.length > 1 ? Math.min(arr.length + 1, 8) : 2) : Math.max(2, Math.min(arr.length + 1, 8))) + '" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _sfKvTextarea(def, path, value, exclude) {
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var lines = [];
    Object.keys(obj).forEach(function (k) {
      if (exclude && exclude.indexOf(k) !== -1) return;
      var v = obj[k];
      lines.push(k + ': ' + ((v && typeof v === 'object') ? JSON.stringify(v) : String(v)));
    });
    return '<textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="' + (def.type === 'kvRest' ? 'kv-rest' : 'kv') + '"' +
      (exclude ? ' data-sf-exclude="' + _escHtml(exclude.join(',')) + '"' : '') +
      (def.placeholder ? ' placeholder="' + _escHtml(_labelOf(def.placeholder)) + '"' : '') +
      ' rows="' + Math.max(3, Math.min(lines.length + 1, 10)) + '" spellcheck="false">' + _escHtml(lines.join('\n')) + '</textarea>';
  }
  function _sfScalarInput(def, path, value) {
    return '<input class="ce-input" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="scalar"' +
      (def.placeholder ? ' placeholder="' + _escHtml(_labelOf(def.placeholder)) + '"' : '') +
      ' value="' + _escHtml(_sfScalarText(value)).replace(/"/g, '&quot;') + '" spellcheck="false">';
  }
  function _sfWholeText(def, value, rows) {
    return '<textarea class="ce-input" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="whole-text"' +
      ' rows="' + (rows || 3) + '" spellcheck="false">' + _escHtml(_sfScalarText(value)) + '</textarea>';
  }
  function _sfKvWhole(def, value) {
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return '<textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="kv-whole"' +
      ' rows="' + Math.max(3, Math.min(Object.keys(obj).length + 1, 12)) + '" spellcheck="false">' + _escHtml(_sfObjText(obj)) + '</textarea>';
  }
  function _sfControl(def, path, value) {
    var t = def.type || 'text';
    if (t === 'number') return _sfInput(def, path, value, 'number');
    if (t === 'bool') return _sfCheckbox(def, path, value);
    if (t === 'select') return _sfSelect(def, path, value);
    if (t === 'textarea' || t === 'miniText') return _sfTextarea(def, path, value, t === 'miniText' ? 2 : 0);
    if (t === 'lines') return _sfLines(def, path, value, false);
    if (t === 'linesScalar') return _sfLines(def, path, value, true);
    if (t === 'kv' || t === 'kvRest') return _sfKvTextarea(def, path, value);
    if (t === 'scalar') return _sfScalarInput(def, path, value);
    var html = _sfInput(def, path, value, 'text');
    return def.mini ? _sfMiniWrap(html) : html;
  }
  // MiniMessage 快捷按钮: 输入框右侧留出小段距离放置铅笔按钮
  function _sfMiniWrap(html) {
    return '<div class="ce-sf-mini-wrap">' + html +
      '<button type="button" class="ce-sf-mini-btn" data-sf-action="mini-edit" title="' + _escHtml(_t('minimessage.editBtn', 'MiniMessage 编辑器')) + '">✏️</button>' +
      '</div>';
  }
  function _sfDatalistHtml() {
    _sfInit();
    if (!_sfDatalistMap) return '';
    var html = '';
    Object.keys(_sfDatalistMap).forEach(function (name) {
      html += '<datalist id="ce-dl-' + _escHtml(name) + '">';
      var arr = _sfDatalistMap[name] || [];
      for (var i = 0; i < arr.length; i++) html += '<option value="' + _escHtml(String(arr[i])) + '">';
      html += '</datalist>';
    });
    return html;
  }
  function _sfWrap(def, html, path) {
    var label = _labelOf(def);
    var icon = _sfHintIcon(def, path);
    var hint = def.hint ? '<div class="ce-sf-hint">' + _escHtml(_labelOf(def.hint)) + '</div>' : '';
    if (_sfIsStack(def.type) || def.layout === 'stack') {
      return '<div class="ce-stack"><label class="ce-field-label">' + _escHtml(label) + icon + '</label>' + hint + html + '</div>';
    }
    return '<div class="ce-row"><label class="ce-field-label">' + _escHtml(label) + icon + '</label>' +
      '<div class="ce-row-ctrl">' + html + hint + '</div></div>';
  }
  function _sfFieldHtml(def, path, value, opts) {
    var t = def.type || 'text';
    var inner = _sfIsStack(t) ? _sfItemHtml(def, path, value, opts) : _sfControl(def, path, value);
    return _sfWrap(def, inner, path);
  }

  // ---- 字段提示 (ℹ 图标 + RichTooltip) ----
  // CEHints (craftengine-hints.js): 文档原文提示数据库, key = 字段完整路径
  var _sfCeHints = (typeof CEHints !== 'undefined') ? CEHints : null;
  function _sfHintKey(path) {
    return String(path || '').replace(/^__popup__\.?/, '');
  }
  function _sfTipOf(h) {
    if (h === null || h === undefined) return '';
    if (typeof h === 'string') return h;
    var lang = (typeof I18N !== 'undefined' && I18N.lang) ? I18N.lang : 'zh_cn';
    return lang === 'en_us' ? (h.en || h.zh || '') : (h.zh || h.en || '');
  }
  function _sfTipText(def, path) {
    var k = _sfHintKey(path);
    var h = null;
    if (_sfCeHints && k) h = _sfCeHints[k];
    if (!h && _sfCeHints && def && def.key) h = _sfCeHints[def.key];
    if (!h && def) h = def.hint;
    return _sfTipOf(h);
  }
  function _sfHintIcon(def, path) {
    var tip = _sfTipText(def, path);
    if (!tip) return '';
    return '<span class="ce-sf-hint-icon" data-sf-hint="' + _escHtml(tip) + '">ℹ</span>';
  }
  function _sfBindHintIcons() {
    if (typeof RichTooltip === 'undefined') return;
    // 立即执行时 tooltip.js 可能尚未加载 (index.html 顺序: interpreter < tooltip), render 时兜底
    if (document.__ceHintIconsBound) return;
    document.__ceHintIconsBound = 1;
    document.addEventListener('mouseover', function (e) {
      var t = e.target;
      if (!t || t.nodeType !== 1) return;
      var icon = (t.classList && t.classList.contains('ce-sf-hint-icon')) ? t : (t.closest ? t.closest('.ce-sf-hint-icon') : null);
      if (!icon || icon.__ceTip) return;
      icon.__ceTip = 1;
      var txt = icon.getAttribute('data-sf-hint');
      if (!txt) return;
      RichTooltip.bind(icon, function () { return '<span class="rt-strong">' + txt + '</span>'; });
      RichTooltip.show(e, '<span class="rt-strong">' + txt + '</span>');
    });
  }
  _sfBindHintIcons();

  // ---- 容器 (list/map/union/object) ----
  function _sfItemHtml(def, path, value, opts) {
    if (!def) return '';
    var t = def.type || 'text';
    if (t === 'union') return _sfUnionHtml(def, path, value, opts);
    if (t === 'listOf') return _sfListHtml(def, path, value, opts);
    if (t === 'mapOf') return _sfMapHtml(def, path, value, opts);
    if (t === 'object') return _sfObjectHtml(def, path, value, opts);
    if (t === 'components') return _sfComponentsHtml(def, path, value, opts);
    if (t === 'model') return _sfModelHtml(def, path, value, opts);
    if (t === 'popup') return _sfPopupHtml(def, path, value, opts);
    if (t === 'tabs') return _sfTabsWidgetHtml(def, path, value, opts);
    return _sfControl(def, path, value);
  }
  function _sfListHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'list', def, opts);
    var arr = Array.isArray(value) ? value : [];
    var itemDef = def.itemType;
    var isUnionItem = itemDef && itemDef.type === 'union';
    var html = '<div class="ce-sf-list" data-sf-kind="list" data-sf-path="' + _escHtml(path) + '" data-sf-def="' +
      _escHtml(JSON.stringify(_sfNorm(def))) + '" data-sf-uid="' + uid + '">';
    for (var i = 0; i < arr.length; i++) {
      html += '<div class="ce-sf-list-item" data-sf-idx="' + i + '">' +
        '<div class="ce-sf-list-ops">' +
        '<button class="cv-btn cv-btn-sm" data-sf-action="list-move" data-sf-dir="up" data-sf-idx="' + i + '" data-sf-uid="' + uid + '" title="↑">↑</button>' +
        '<button class="cv-btn cv-btn-sm" data-sf-action="list-move" data-sf-dir="down" data-sf-idx="' + i + '" data-sf-uid="' + uid + '" title="↓">↓</button>' +
        '<button class="cv-btn cv-btn-sm cv-btn-danger" data-sf-action="list-del" data-sf-idx="' + i + '" data-sf-uid="' + uid + '" title="✕">✕</button>' +
        '</div>' +
        '<div class="ce-sf-list-body">' + _sfItemHtml(itemDef, path + '.' + i, arr[i], { inList: true }) + '</div>' +
        '</div>';
    }
    if (!arr.length) html += '<div class="ce-sf-empty">' + _escHtml(_t('craftengine.listEmpty')) + '</div>';
    html += '<div class="ce-sf-list-add">';
    if (isUnionItem) html += _sfUnionPickHtml(itemDef, uid);
    else html += '<button class="cv-btn cv-btn-sm cv-btn-secondary" data-sf-action="list-add" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.listAdd')) + '</button>';
    html += '</div>';
    return html + '</div>';
  }
  function _sfUnionPickHtml(def, uid) {
    var types = _sfTypesOf(def);
    var html = '<select class="ce-input ce-sf-pick" data-sf-list-pick="1" data-sf-uid="' + uid + '">' +
      '<option value="">-- ' + _escHtml(_t('craftengine.listAdd')) + ' --</option>';
    if (def.allowScalar) html += '<option value="__scalar">' + _escHtml(_t('craftengine.customValue')) + '</option>';
    var keys = Object.keys(types);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var lb = _labelOf(types[k]) || k;
      html += '<option value="' + _escHtml(k) + '">' + _escHtml(lb) + '</option>';
      if (def.negatable) html += '<option value="!' + _escHtml(k) + '">' + _escHtml('!' + lb) + '</option>';
    }
    return html + '</select>' +
      '<button class="cv-btn cv-btn-sm cv-btn-secondary" data-sf-action="list-add" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.listAdd')) + '</button>';
  }
  function _sfMapHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'map', def, opts);
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var keys = Object.keys(obj);
    var valueDef = def.valueType || { type: 'scalar' };
    var html = '<div class="ce-sf-map" data-sf-kind="map" data-sf-path="' + _escHtml(path) + '" data-sf-def="' +
      _escHtml(JSON.stringify(_sfNorm(def))) + '" data-sf-uid="' + uid + '">';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      html += '<div class="ce-sf-map-row" data-sf-okey="' + _escHtml(k) + '">' +
        '<input class="ce-input ce-sf-map-key" data-sf-kind="map-key" data-sf-path="' + _escHtml(path) + '" data-sf-okey="' + _escHtml(k) + '" value="' + _escHtml(k).replace(/"/g, '&quot;') + '" spellcheck="false">' +
        '<div class="ce-sf-map-val">' + _sfItemHtml(valueDef, _sfKeyPath(path, k), obj[k], { inList: opts && opts.inList }) + '</div>' +
        '<button class="cv-btn cv-btn-sm cv-btn-danger" data-sf-action="map-del" data-sf-path="' + _escHtml(path) + '" data-sf-okey="' + _escHtml(k) + '" data-sf-uid="' + uid + '">✕</button>' +
        '</div>';
    }
    if (!keys.length) html += '<div class="ce-sf-empty">' + _escHtml(_t('craftengine.listEmpty')) + '</div>';
    html += '<div class="ce-sf-map-add"><button class="cv-btn cv-btn-sm cv-btn-secondary" data-sf-action="map-add" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.mapAdd')) + '</button></div>';
    return html + '</div>';
  }
  function _sfUnionCurrent(def, value) {
    if (value === undefined || value === null) return { key: '', neg: false };
    if (typeof value === 'object') {
      if (def.noTypeKey) {
        var types = _sfTypesOf(def);
        var ks = Object.keys(types);
        if (Array.isArray(value)) {
          // 元素含对象 → 优先 listOf 类型; 全字符串 → 优先 lines/linesScalar
          var hasObj = false;
          for (var e = 0; e < value.length; e++) {
            if (value[e] !== null && typeof value[e] === 'object') { hasObj = true; break; }
          }
          for (var i = 0; i < ks.length; i++) {
            var w = (types[ks[i]].widget || {}).type;
            if (w === 'listOf' || w === 'lines' || w === 'linesScalar') {
              if (hasObj && w !== 'listOf') continue;
              if (!hasObj && w === 'listOf') continue;
              return { key: ks[i], neg: false };
            }
          }
        } else {
          // 键名形式: value 的键命中 types 键 → 该类型 (如 {simple: ''}); 否则回退第一个容器类型
          for (var kv in value) {
            if (types[kv]) return { key: kv, neg: false };
          }
          for (var j = 0; j < ks.length; j++) {
            var w2 = (types[ks[j]].widget || {}).type;
            if (w2 === 'object' || w2 === 'mapOf' || w2 === 'kv' || w2 === 'kvRest' || w2 === 'union') return { key: ks[j], neg: false };
          }
        }
        return { key: ks.length ? ks[0] : '', neg: false };
      }
      if (value.type === undefined || value.type === null || value.type === '') return { key: '', neg: false };
      var t = String(value.type);
      return { key: t.charAt(0) === '!' ? t.slice(1) : t, neg: t.charAt(0) === '!' };
    }
    if (def.allowScalar) return { key: '__scalar', neg: false };
    if (def.noTypeKey) {
      var types2 = _sfTypesOf(def);
      var ks2 = Object.keys(types2);
      for (var m = 0; m < ks2.length; m++) {
        var w3 = (types2[ks2[m]].widget || {}).type;
        if (w3 === 'text' || w3 === 'textarea' || w3 === 'miniText' || w3 === 'linesScalar' || w3 === 'bool') return { key: ks2[m], neg: false };
      }
      return { key: ks2.length ? ks2[0] : '', neg: false };
    }
    return { key: '', neg: false };
  }
  function _sfTypeBody(td, path, value, opts) {
    var html = '';
    var sub = { inList: opts && opts.inList, entry: opts && opts.entry }; // 不向下传播 uid: 子容器/嵌套 union 需要自己的 uid
    if (td.widget) return _sfFieldHtml(td.widget, path, value, sub);
    var modeled = {};
    if (td.fields) {
      html += '<div class="ce-sf-type-card">';
      td.fields.forEach(function (fld) {
        modeled[fld.key] = 1;
        html += _sfFieldHtml(fld, path + '.' + fld.key, (value && typeof value === 'object') ? value[fld.key] : undefined, sub);
      });
      html += '</div>';
    }
    // 类型体未知字段: 迷你折叠 kv, 防数据丢失
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      var rest = Object.keys(value).filter(function (k) { return k !== 'type' && !modeled[k]; });
      if (rest.length) {
        var text = _sfObjText((function () { var o = {}; rest.forEach(function (k) { o[k] = value[k]; }); return o; })());
        html += '<details class="ce-sf-collapse"><summary>' + _escHtml(_t('craftengine.otherFields') + ' (' + rest.length + ')') + '</summary>' +
          '<div class="ce-stack"><textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="kv-rest"' +
          ' data-sf-exclude="' + _escHtml(Object.keys(modeled).concat(['type']).join(',')) + '"' +
          ' rows="' + Math.max(3, Math.min(rest.length + 1, 8)) + '" spellcheck="false">' + _escHtml(text) + '</textarea></div></details>';
      }
    }
    return html;
  }
  function _sfUnionHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'union', def, opts);
    var types = _sfTypesOf(def);
    var cur = _sfUnionCurrent(def, value);
    // keepKey: 用户显式切换过的类型优先于形状推断 (如 lore 切到复杂定义后空数组不再弹回普通定义)
    if (def.keepKey && opts && opts.entry) {
      var kk = (opts.entry._unionKeys || {})[path];
      if (kk === '__scalar') cur = { key: '__scalar', neg: false };
      else if (kk && types[kk]) cur = { key: kk, neg: false };
    }
    // defaultKey: 空值时默认选中并展开该类型 (如 lore 默认普通定义)
    if (!cur.key && def.defaultKey && types[def.defaultKey]) cur = { key: def.defaultKey, neg: false };
    var optHtml = '<option value=""' + (!cur.key ? ' selected' : '') + '>' + _escHtml(_t('craftengine.unionEmpty')) + '</option>';
    if (def.allowScalar) {
      optHtml += '<option value="__scalar"' + (cur.key === '__scalar' ? ' selected' : '') + '>' + _escHtml(_t('craftengine.customValue')) + '</option>';
    }
    var hintPrefix = '';
    if (_sfSchemas) {
      if (def.types === _sfSchemas.functions) hintPrefix = 'function';
      else if (def.types === _sfSchemas.conditions) hintPrefix = 'condition';
      else if (def.types === _sfSchemas.loot) hintPrefix = 'loot';
    }
    var keys = Object.keys(types);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var lb = _labelOf(types[k]) || k;
      var otip = '';
      if (hintPrefix && _sfCeHints) {
        var oh = _sfCeHints[hintPrefix + '.' + k];
        if (oh) otip = ' title="' + _escHtml(_sfTipOf(oh)) + '"';
      }
      optHtml += '<option value="' + _escHtml(k) + '"' + otip + (cur.key === k && !cur.neg ? ' selected' : '') + '>' + _escHtml(lb) + '</option>';
      if (def.negatable) {
        optHtml += '<option value="!' + _escHtml(k) + '"' + (cur.key === k && cur.neg ? ' selected' : '') + '>' + _escHtml('!' + lb) + '</option>';
      }
    }
    var body = '';
    if (cur.key && cur.key !== '__scalar') {
      var td = types[cur.key];
      if (td) {
        // 键名形式 (noTypeKey, 值 = {类型键: 内容}) 时类型体取 value[类型键]; 形状推断形式值即内容
        var bodyValue = value;
        if (def.noTypeKey && value && typeof value === 'object' && !Array.isArray(value) && value[cur.key] !== undefined) {
          bodyValue = value[cur.key];
        }
        body = _sfTypeBody(td, path, bodyValue, opts);
      } else body = _sfControl({ type: 'kv' }, path, value); // 未知类型: kv 兜底
    } else if (cur.key === '__scalar') {
      var sd = (def.allowScalar && typeof def.allowScalar === 'object') ? def.allowScalar : {};
      sd.type = sd.type || 'text';
      if (sd.label) body = _sfFieldHtml(sd, path, value, opts);
      else body = '<div class="ce-sf-scalar">' + _sfControl(sd, path, value) + '</div>';
    }
    var clear = '';
    if (cur.key && !(opts && opts.inList)) {
      clear = '<button class="cv-btn cv-btn-sm cv-btn-danger ce-sf-union-clear" data-sf-action="union-clear" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '" title="' + _escHtml(_t('craftengine.unionClear')) + '">✕</button>';
    }
    return '<div class="ce-sf-union" data-sf-uid="' + uid + '">' +
      '<div class="ce-sf-union-head">' +
      '<select class="ce-input" data-sf-action="union-set" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">' + optHtml + '</select>' + clear +
      '</div>' +
      '<div class="ce-sf-union-body">' + body + '</div>' +
      '</div>';
  }
  function _sfObjectHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'object', def, opts);
    var html = '<div class="ce-sf-object" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">';
    var modeled = {};
    (def.fields || []).forEach(function (fld) {
      modeled[fld.key] = 1;
      html += _sfFieldHtml(fld, path + '.' + fld.key, (value && typeof value === 'object') ? value[fld.key] : undefined, { inList: opts && opts.inList });
    });
    html += '</div>';
    // 未知字段: 折叠 kv
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      var rest = Object.keys(value).filter(function (k) { return !modeled[k]; });
      if (rest.length) {
        var text = _sfObjText((function () { var o = {}; rest.forEach(function (k) { o[k] = value[k]; }); return o; })());
        html += '<details class="ce-sf-collapse"><summary>' + _escHtml(_t('craftengine.otherFields') + ' (' + rest.length + ')') + '</summary>' +
          '<div class="ce-stack"><textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="kv-rest"' +
          ' data-sf-exclude="' + _escHtml(Object.keys(modeled).join(',')) + '"' +
          ' rows="' + Math.max(3, Math.min(rest.length + 1, 8)) + '" spellcheck="false">' + _escHtml(text) + '</textarea></div></details>';
      }
    }
    return html;
  }
  // ---- data 组件编辑器: 键 + 每组件独立表单 + 添加组件下拉 ----
  function _sfCompsOf(def) {
    var c = def ? def.components : null;
    return (typeof c === 'function') ? c() : (c || {});
  }
  function _sfComponentsHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'components', def, opts);
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var comps = _sfCompsOf(def);
    var condKey = def.conditionKey;
    var keys = [];
    Object.keys(obj).forEach(function (k) { if (k !== condKey) keys.push(k); });
    var html = '<div class="ce-sf-map ce-sf-components" data-sf-kind="components" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">';
    // 组件列表: 行 = 名称 + 编辑弹窗按钮 + 删除按钮
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var base = String(k).split('#')[0];
      var wd = comps[base];
      var name = wd ? (_labelOf(wd) || base) : k;
      var bodyDef = wd ? (wd.widget || wd) : { type: 'kv', label: k };
      var puid = _sfUidAlloc(_sfKeyPath(path, k), 'popup', bodyDef, opts);
      html += '<div class="ce-sf-comp-row" data-sf-okey="' + _escHtml(k) + '">' +
        '<div class="ce-sf-comp-head">' +
        '<span class="ce-sf-comp-name" title="' + _escHtml(k) + '">' + _escHtml(name) + '</span>' +
        '<button class="cv-btn cv-btn-sm ce-sf-popup-btn" data-sf-action="popup-edit" data-sf-path="' + _escHtml(_sfKeyPath(path, k)) + '" data-sf-uid="' + puid + '">' + _escHtml(_t('craftengine.popupEdit')) + '</button>' +
        '<button class="cv-btn cv-btn-sm cv-btn-danger" data-sf-action="map-del" data-sf-path="' + _escHtml(path) + '" data-sf-okey="' + _escHtml(k) + '" data-sf-uid="' + uid + '" title="✕">✕</button>' +
        '</div></div>';
    }
    if (!keys.length) html += '<div class="ce-sf-empty">' + _escHtml(_t('craftengine.componentsEmpty')) + '</div>';
    // 条件部分: conditional 独立成区, 弹窗编辑 data + conditions
    if (condKey && comps[condKey]) {
      var condWd = comps[condKey].widget || comps[condKey];
      var condVal = obj[condKey];
      var hasCond = condVal !== undefined && condVal !== null && typeof condVal === 'object' && !Array.isArray(condVal);
      html += '<div class="ce-sf-cond-block">' +
        '<div class="ce-sf-cond-title">' + _escHtml(_t('craftengine.componentConditionTitle', '条件')) + '</div>';
      if (hasCond) {
        var cuid = _sfUidAlloc(_sfKeyPath(path, condKey), 'popup', condWd, opts);
        html += '<div class="ce-sf-cond-row">' + _sfPopupHtml(condWd, _sfKeyPath(path, condKey), condVal, { uid: cuid }) + '</div>';
      } else {
        html += '<button type="button" class="cv-btn cv-btn-sm ce-sf-cond-add" data-sf-action="cond-add" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.condAdd', '添加条件')) + '</button>';
      }
      html += '</div>';
    }
    var addSel = '<select class="ce-input ce-sf-pick" data-sf-action="comp-add" data-sf-uid="' + uid + '">' +
      '<option value="">-- ' + _escHtml(_t('craftengine.componentAdd')) + ' --</option>';
    var cks = Object.keys(comps);
    for (var c = 0; c < cks.length; c++) {
      var ck = cks[c];
      if (ck === condKey) continue;
      if (obj[ck] === undefined) {
        addSel += '<option value="' + _escHtml(ck) + '">' + _escHtml(_labelOf(comps[ck]) || ck) + '</option>';
      }
    }
    addSel += '<option value="__custom__">' + _escHtml(_t('craftengine.componentCustom')) + '</option>';
    addSel += '</select>';
    html += '<div class="ce-sf-map-add">' + addSel + '</div>';
    return html + '</div>';
  }
  // ---- 子选项卡 (tabs widget): 面板纯 CSS 切换, 字段写回走现有 field 委托 ----
  function _sfTabsWidgetHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'tabs', def, opts);
    var tabs = def.tabs || [];
    // 汇总所有面板已建模的键: 未建模键只在一个面板折叠一次, 避免重复 kv 编辑器
    var tabModeled = {};
    for (var ti = 0; ti < tabs.length; ti++) {
      var tflds = tabs[ti].fields;
      if (tflds) for (var tf = 0; tf < tflds.length; tf++) tabModeled[tflds[tf].key] = 1;
    }
    var html = '<div class="ce-sf-subtabs" data-sf-kind="tabs" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '"><div class="ce-sf-subtab-bar">';
    for (var i = 0; i < tabs.length; i++) {
      html += '<button type="button" class="cv-btn cv-btn-sm ce-sf-subtab-btn' + (i === 0 ? ' active' : '') + '" data-sf-action="subtab" data-sf-subtab="' + _escHtml(tabs[i].key) + '" data-sf-uid="' + uid + '">' +
        _escHtml(_labelOf(tabs[i]) || tabs[i].key) + '</button>';
    }
    html += '</div>';
    for (var j = 0; j < tabs.length; j++) {
      html += '<div class="ce-sf-subtab-panel' + (j === 0 ? ' active' : '') + '" data-sf-subtabpanel="' + _escHtml(tabs[j].key) + '" data-sf-uid="' + uid + '">' +
        _sfTabPanelHtml(tabs[j], path, value, opts, tabModeled) + '</div>';
    }
    return html + '</div>';
  }
  function _sfTabPanelHtml(panel, path, value, opts, tabModeled) {
    if (panel.bind) {
      var bkey = _sfFldKey({ key: panel.bind }, opts && opts.keyStyle);
      var bv = (opts && opts.entryData) ? opts.entryData[bkey] : undefined;
      return _sfItemHtml(panel.widget, bkey, bv, opts);
    }
    var modeled = {};
    var html = '';
    (panel.fields || []).forEach(function (fld) {
      modeled[fld.key] = 1;
      html += _sfFieldHtml(fld, _sfKeyPath(path, fld.key), value ? value[fld.key] : undefined, opts);
    });
    var rest = [];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      var ks = Object.keys(value);
      for (var i = 0; i < ks.length; i++) {
        if (!modeled[ks[i]] && !(tabModeled && tabModeled[ks[i]])) rest.push(ks[i]);
      }
    }
    if (rest.length) {
      html += '<details class="ce-sf-collapse"><summary>' + _escHtml(_t('craftengine.otherFields') + ' (' + rest.length + ')') + '</summary>';
      for (var r = 0; r < rest.length; r++) {
        var k = rest[r];
        var v = value[k];
        var p = _sfKeyPath(path, k);
        var editor = (v !== null && typeof v === 'object' && !Array.isArray(v))
          ? _sfKvTextarea({ type: 'kv' }, p, v)
          : _sfScalarInput({}, p, v);
        html += '<div class="ce-stack ce-sf-rest"><label class="ce-field-label">' + _escHtml(k) + '</label>' + editor + '</div>';
      }
      html += '</details>';
    }
    return html;
  }
  // ---- item 根级键风格: 检测文件已有写法 (snake 新版 / kebab 旧版), 新建用设置默认 ----
  function _sfItemKeyStyle(entryData) {
    var t = (_sfSchemas && _sfSchemas.itemKeyStyle) || null;
    if (t && entryData && typeof entryData === 'object') {
      for (var k in entryData) {
        if (!Object.prototype.hasOwnProperty.call(entryData, k)) continue;
        if (t[k]) return 'snake';
        for (var s in t) {
          if (Object.prototype.hasOwnProperty.call(t, s) && t[s].kebab === k) return 'kebab';
        }
      }
    }
    return _sfDefaultKeyStyle();
  }
  function _sfDefaultKeyStyle() {
    try {
      var cfg = JSON.parse(ROOT.localStorage.getItem('editorConfig') || '{}');
      return cfg.itemKeyStyle === 'kebab' ? 'kebab' : 'snake';
    } catch (e) { return 'snake'; }
  }
  function _sfFldKey(fld, style) {
    var t = (_sfSchemas && _sfSchemas.itemKeyStyle) || null;
    if (t && t[fld.key] && style === 'kebab') return t[fld.key].kebab;
    return fld.key;
  }
  // ---- item 模型编辑器: 简化 / 模型树 / 路径 三种模式 ----
  function _sfModelForms() {
    _sfInit();
    return (_sfSchemas && _sfSchemas.itemModelForms) ? _sfSchemas.itemModelForms : null;
  }
  function _sfModelHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'model', def, opts);
    var isStr = typeof value === 'string';
    var isObj = !isStr && value !== null && typeof value === 'object' && !Array.isArray(value);
    var mode = isStr ? 'path' : (isObj && value.type !== undefined && value.type !== null && value.type !== '' ? 'tree' : 'simplified');
    var clear = '';
    if (value !== undefined && value !== null) {
      clear = '<button class="cv-btn cv-btn-sm cv-btn-danger ce-sf-union-clear" data-sf-action="model-clear" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '" title="' + _escHtml(_t('craftengine.unionClear')) + '">✕</button>';
    }
    var html = '<div class="ce-sf-model" data-sf-uid="' + uid + '">' +
      '<div class="ce-sf-union-head">' +
      '<select class="ce-input" data-sf-action="model-mode" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">' +
      '<option value="simplified"' + (mode === 'simplified' ? ' selected' : '') + '>' + _escHtml(_t('craftengine.modelSimplified')) + '</option>' +
      '<option value="tree"' + (mode === 'tree' ? ' selected' : '') + '>' + _escHtml(_t('craftengine.modelTree')) + '</option>' +
      '<option value="path"' + (mode === 'path' ? ' selected' : '') + '>' + _escHtml(_t('craftengine.modelPath')) + '</option>' +
      '</select>' + clear + '</div>';
    var forms = _sfModelForms();
    var body;
    if (mode === 'path') {
      body = _sfInput({ type: 'text', placeholder: _sfL('minecraft:item/custom/xxx', 'minecraft:item/custom/xxx') }, path, value);
    } else if (mode === 'tree') {
      body = forms && forms.tree ? _sfUnionHtml(forms.tree, path, value, { inList: opts && opts.inList }) : _sfInput({ type: 'text' }, path, value);
    } else {
      body = forms && forms.simplified ? _sfObjectHtml(forms.simplified, path, value, opts) : _sfKvTextarea({ type: 'kv' }, path, value);
    }
    return html + '<div class="ce-sf-union-body">' + body + '</div></div>';
  }
  // ---- 弹窗编辑器 (popup): 界面显示简略值, 点击弹窗编辑完整字段 ----
  // content 可为函数 (延迟求值, 支持前向引用的共享 def)
  function _sfPopupContent(def) {
    var c = def.content;
    return typeof c === 'function' ? c() : c;
  }
  function _sfPopupScalar(fld, v) {
    var ft = fld.type;
    if (ft === 'union') {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (v.type) return String(v.type);
        if (v.id || v.name) return String(v.id || v.name);
        return _t('craftengine.popupDetailed');
      }
      return String(v);
    }
    if (ft === 'lines' || ft === 'linesScalar') return Array.isArray(v) ? String(v.length) + ' 行' : String(v);
    if (ft === 'mapOf' || ft === 'map') return String(Object.keys(v).length) + ' 项';
    if (ft === 'listOf') return String(v.length) + ' 项';
    if (v && typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function _sfPopupSummary(def, value) {
    // content 是 popup 字段定义; 递归传入的 widget 定义没有 content, 直接用自身
    var c = _sfPopupContent(def) || def;
    var empty = _t('craftengine.popupEmpty');
    if (!c || value === undefined || value === null || value === '') return empty;
    if (typeof value !== 'object') return String(value);
    var t = c.type;
    if (t === 'mapOf' || t === 'map' || t === 'components') {
      var keys = Object.keys(value);
      if (!keys.length) return empty;
      return keys.slice(0, 4).join(', ') + (keys.length > 4 ? ' …' : '') + ' (' + keys.length + ' 个)';
    }
    if (t === 'object') {
      var parts = [];
      (c.fields || []).forEach(function (fld) {
        var v = value[fld.key];
        if (v === undefined || v === null || v === '' || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)) return;
        parts.push(fld.key + ': ' + _sfPopupScalar(fld, v));
      });
      if (!parts.length) return empty;
      return parts.slice(0, 5).join(', ') + (parts.length > 5 ? ' …' : '');
    }
    if (t === 'listOf' || t === 'lines' || t === 'linesScalar') {
      if (!Array.isArray(value) || !value.length) return empty;
      return String(value.length) + ' 项';
    }
    if (t === 'union') {
      if (Array.isArray(value)) {
        var ks = _sfTypesOf(c), ksL = Object.keys(ks);
        for (var i = 0; i < ksL.length; i++) {
          var w = (ks[ksL[i]].widget || {}).type;
          if (w === 'listOf' || w === 'lines' || w === 'linesScalar') return _sfPopupSummary(ks[ksL[i]].widget, value);
        }
        return String(value.length) + ' 项';
      }
      if (value.type) return String(value.type);
      var ks2 = _sfTypesOf(c), ks2L = Object.keys(ks2);
      for (var j = 0; j < ks2L.length; j++) {
        var w2 = (ks2[ks2L[j]].widget || {}).type;
        if (w2 === 'object' || w2 === 'mapOf' || w2 === 'components') return _sfPopupSummary(ks2[ks2L[j]].widget, value);
      }
      return String(value);
    }
    return String(value);
  }
  function _sfPopupHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'popup', def, opts);
    var clear = '';
    if (value !== undefined && value !== null && value !== '') {
      clear = '<button class="cv-btn cv-btn-sm cv-btn-danger ce-sf-popup-clear" data-sf-action="popup-clear" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '" title="' + _escHtml(_t('craftengine.unionClear')) + '">✕</button>';
    }
    return '<div class="ce-sf-popup" data-sf-uid="' + uid + '">' +
      '<div class="ce-sf-popup-row">' +
      '<span class="ce-sf-popup-summary">' + _escHtml(_sfPopupSummary(def, value)) + '</span>' +
      '<button class="cv-btn cv-btn-sm ce-sf-popup-btn" data-sf-action="popup-edit" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.popupEdit')) + '</button>' + clear +
      '</div></div>';
  }
  // 打开 popup 弹窗: 弹窗 body 复用 _bindEvents, 编辑副本数据, 确定后写回真实数据
  function _sfOpenPopup(rec, path, containerEl, entry, parsed, section, uid) {
    if (!document) return;
    var old = document.getElementById('ce-popup-modal');
    if (old) old.remove();
    var cur = path ? _getNested(entry.data, path) : entry.data;
    var copy = (cur === undefined || cur === null) ? undefined : JSON.parse(JSON.stringify(cur));

    var bodyEl = document.createElement('div');
    bodyEl.className = 'ce-popup-body';
    bodyEl._ceParsed = { sections: [{ entries: [{ data: { __popup__: copy }, _rawOrder: ['__popup__'] }] }], _isPopup: true };
    bodyEl._ceUi = { section: 0, entry: 0 };
    bodyEl.innerHTML = _sfItemHtml(_sfPopupContent(rec.def) || rec.def, '__popup__', copy, {});
    _bindEvents(bodyEl);

    var modal = document.createElement('div');
    modal.id = 'ce-popup-modal';
    modal.className = 'cv-modal ce-popup-modal';
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content ce-popup-content">' +
      '<h3>' + _escHtml(_labelOf(rec.def)) + '</h3>' +
      '<div class="ce-popup-scroll"></div>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" data-ce-popup="cancel">' + _escHtml(_t('craftengine.popupCancel')) + '</button>' +
      '<button class="cv-btn cv-btn-primary" data-ce-popup="ok">' + _escHtml(_t('craftengine.popupOk')) + '</button>' +
      '</div></div>';
    modal.querySelector('.ce-popup-scroll').appendChild(bodyEl);
    document.body.appendChild(modal);

    function close() { modal.remove(); }
    modal.querySelector('[data-ce-popup="cancel"]').addEventListener('click', close);
    modal.querySelector('[data-ce-popup="ok"]').addEventListener('click', function () {
      var got = bodyEl._ceParsed.sections[0].entries[0].data.__popup__;
      close();
      if (got === undefined || got === null ||
          (typeof got === 'object' && !Array.isArray(got) && Object.keys(got).length === 0)) {
        // 弹窗内为空 → 删除字段
        if (path) _applyValue(entry, path, undefined, parsed, section);
      } else {
        if (path) _applyValue(entry, path, got, parsed, section);
      }
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
    });
    modal.addEventListener('click', function (e) { if (e.target === this) close(); });
  }
  // 容器局部重渲染 (list/map/union/object/components/model 内容), 不整页刷新、不丢焦点
  function _sfRerender(uid, containerEl) {
    var rec = _sfUidMap[uid];
    if (!rec || !containerEl || !containerEl.querySelectorAll) return;
    var wraps = containerEl.querySelectorAll('[data-sf-uid="' + uid + '"]');
    if (!wraps.length) return;
    var wrap = wraps[0];
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var entry = _sfEntry(parsed, ui);
    if (!entry) return;
    var value = rec.path ? _getNested(entry.data, rec.path) : entry.data;
    var html;
    if (rec.kind === 'list') html = _sfListHtml(rec.def, rec.path, value, { uid: uid, inList: rec.inList });
    else if (rec.kind === 'map') html = _sfMapHtml(rec.def, rec.path, value, { uid: uid });
    else if (rec.kind === 'union') html = _sfUnionHtml(rec.def, rec.path, value, { uid: uid, inList: rec.inList, entry: entry });
    else if (rec.kind === 'object') html = _sfObjectHtml(rec.def, rec.path, value, { uid: uid });
    else if (rec.kind === 'components') html = _sfComponentsHtml(rec.def, rec.path, value, { uid: uid });
    else if (rec.kind === 'model') html = _sfModelHtml(rec.def, rec.path, value, { uid: uid });
    else if (rec.kind === 'popup') html = _sfPopupHtml(rec.def, rec.path, value, { uid: uid });
    else return;
    // html 含根节点, 必须替换节点本身 (innerHTML 会把新根嵌套进旧根, 每轮残留一层)
    wrap.outerHTML = html;
  }
  // schema 动作: 点击按钮 (list/map/union) / select 变更 (union-set/list-add)
  function _sfHandleAction(action, el, containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var section = _sfSection(parsed, ui);
    var entry = _sfEntry(parsed, ui);
    if (!section || !entry) return;
    var uid = el.getAttribute('data-sf-uid');
    var rec = uid ? _sfUidMap[uid] : null;
    if (action === 'subtab') {
      // 子选项卡切换: 仅切 CSS 类, 不改数据
      var root = el.closest ? el.closest('.ce-sf-subtabs') : null;
      if (root && root.querySelectorAll) {
        var key = el.getAttribute('data-sf-subtab');
        var btns = root.querySelectorAll('[data-sf-action="subtab"]');
        for (var b = 0; b < btns.length; b++) btns[b].classList.toggle('active', btns[b] === el);
        var panels = root.querySelectorAll('[data-sf-subtabpanel]');
        for (var p = 0; p < panels.length; p++) {
          panels[p].classList.toggle('active', panels[p].getAttribute('data-sf-subtabpanel') === key);
        }
      }
      return;
    }
    if (action === 'mini-edit') {
      // 打开 MiniMessage 编辑器; 沙箱/未加载时静默跳过
      if (!ROOT.MiniMessageEditor) return;
      var wrapEl = el.closest ? el.closest('.ce-sf-mini-wrap') : null;
      var inp = wrapEl ? wrapEl.querySelector('input.ce-input, textarea.ce-input') : null;
      if (!inp) return;
      _sound('click');
      ROOT.MiniMessageEditor.open(inp.value, function (out) {
        if (out != null && String(out) !== inp.value) {
          inp.value = out;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      return;
    }
    _sfMarkDirty(parsed); // 所有 schema 动作都会修改数据

    if (action === 'union-set') {
      if (!rec || rec.kind !== 'union') return;
      var path = el.getAttribute('data-sf-path') || rec.path;
      var v = el.value;
      if (v === '') {
        // 改回"不指定": 删除字段值
        if (path) _applyValue(entry, path, undefined, parsed, section);
        if (rec.def.keepKey && entry && entry._unionKeys) delete entry._unionKeys[path];
        _sfRerender(uid, containerEl);
        if (ROOT.__keAutoSync) syncToSource(parsed);
        return;
      }
      var cur = path ? _getNested(entry.data, path) : entry.data;
      if (rec.def.noTypeKey) {
        // keepKey: 记录用户显式选择的类型, rerender 后形状推断不覆盖
        if (rec.def.keepKey && entry) {
          if (!entry._unionKeys) entry._unionKeys = {};
          entry._unionKeys[path] = v;
        }
        // 形状推断 union: 切换类型时若当前值不匹配目标形状, 创建默认值
        var curShape = _sfUnionCurrent(rec.def, cur);
        if (v === '__scalar') {
          if (curShape.key !== '__scalar' && path) _sfSetScalar(entry, path);
        } else if (curShape.key !== v) {
          var td = _sfTypesOf(rec.def)[v];
          var defVal = {};
          if (td && td.widget) {
            // 形状切换时尽量保留数据:
            // 目标为 list/lines 且当前为对象/标量 → 包裹为 [cur]
            // 目标为对象值 widget 且当前为单元素数组 → 解包 cur[0]
            var wt = td.widget.type;
            var listLike = wt === 'listOf' || wt === 'lines' || wt === 'linesScalar';
            var objLike = wt === 'object' || wt === 'union' || wt === 'mapOf' || wt === 'kv' || wt === 'kvRest' || wt === 'components' || wt === 'model';
            if (listLike && cur !== undefined && cur !== null) {
              defVal = Array.isArray(cur) ? cur : [cur];
            } else if (objLike && Array.isArray(cur) && cur.length === 1) {
              defVal = cur[0];
            } else {
              defVal = _sfDefaultOf(td.widget);
            }
          }
          if (path) _applyValue(entry, path, defVal, parsed, section);
        }
        _sfRerender(uid, containerEl);
        if (ROOT.__keAutoSync) syncToSource(parsed);
        return;
      }
      var newVal;
      if (v === '__scalar') {
        newVal = (typeof cur === 'string') ? cur : '';
      } else {
        var neg = v.charAt(0) === '!';
        var tk = neg ? v.slice(1) : v;
        var td = _sfTypesOf(rec.def)[tk];
        newVal = { type: neg ? '!' + tk : tk };
        if (td && td.fields && cur && typeof cur === 'object' && !Array.isArray(cur)) {
          td.fields.forEach(function (f) {
            if (cur[f.key] !== undefined) newVal[f.key] = cur[f.key];
          });
        }
      }
      if (path) {
        if (newVal === '') _sfSetScalar(entry, path);
        else _applyValue(entry, path, newVal, parsed, section);
      }
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'list-add') {
      if (!rec || rec.kind !== 'list') return;
      var arr = _getNested(entry.data, rec.path);
      if (!Array.isArray(arr)) { arr = []; _setNested(entry.data, rec.path, arr); }
      var itemDef = rec.def.itemType;
      var nv;
      if (itemDef && itemDef.type === 'union') {
        var tv = '';
        if (el.closest) {
          var addBox = el.closest('.ce-sf-list-add');
          var pick = addBox ? addBox.querySelector('.ce-sf-pick') : null;
          if (pick) tv = pick.value;
        }
        if (!tv) return;
        if (tv === '__scalar') nv = '';
        else if (itemDef.noTypeKey) {
          // 形状推断 union: 键名形式 {类型键: 默认值}, 否则渲染会推断到第一个容器类型
          var wd = _sfTypesOf(itemDef)[tv];
          nv = {};
          nv[tv] = (wd && wd.widget) ? _sfDefaultOf(wd.widget) : '';
        }
        else nv = { type: tv };
      } else {
        nv = _sfDefaultOf(itemDef);
      }
      arr.push(nv);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'list-del') {
      if (!rec || rec.kind !== 'list') return;
      var arr2 = _getNested(entry.data, rec.path);
      var idx = parseInt(el.getAttribute('data-sf-idx'), 10);
      if (Array.isArray(arr2) && idx >= 0 && idx < arr2.length) arr2.splice(idx, 1);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'list-move') {
      if (!rec || rec.kind !== 'list') return;
      var arr3 = _getNested(entry.data, rec.path);
      var i3 = parseInt(el.getAttribute('data-sf-idx'), 10);
      var dir = el.getAttribute('data-sf-dir');
      if (Array.isArray(arr3)) {
        var j3 = dir === 'up' ? i3 - 1 : i3 + 1;
        if (i3 >= 0 && i3 < arr3.length && j3 >= 0 && j3 < arr3.length) {
          var tmp = arr3[i3]; arr3[i3] = arr3[j3]; arr3[j3] = tmp;
        }
      }
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'map-add') {
      if (!rec || rec.kind !== 'map') return;
      var obj = rec.path ? _getNested(entry.data, rec.path) : entry.data;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        obj = {};
        if (rec.path) _setNested(entry.data, rec.path, obj);
        else entry.data = obj;
      }
      var base = 'new';
      var n = 1;
      var nk = base;
      while (Object.prototype.hasOwnProperty.call(obj, nk)) nk = base + (n++);
      obj[nk] = _sfDefaultOf(rec.def.valueType);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'map-del') {
      var path2 = el.getAttribute('data-sf-path');
      var okey = el.getAttribute('data-sf-okey');
      var obj2 = path2 ? _getNested(entry.data, path2) : entry.data;
      if (obj2 && typeof obj2 === 'object' && !Array.isArray(obj2)) delete obj2[okey];
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'union-clear') {
      if (!rec || rec.kind !== 'union') return;
      var path3 = el.getAttribute('data-sf-path') || rec.path;
      if (path3) _applyValue(entry, path3, undefined, parsed, section);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
    }
    if (action === 'model-clear') {
      if (!rec || rec.kind !== 'model') return;
      var mp = el.getAttribute('data-sf-path') || rec.path;
      if (mp) _applyValue(entry, mp, undefined, parsed, section);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
    }
    if (action === 'popup-clear') {
      if (!rec || rec.kind !== 'popup') return;
      var pp = el.getAttribute('data-sf-path') || rec.path;
      if (pp) _applyValue(entry, pp, undefined, parsed, section);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'popup-edit') {
      if (!rec || rec.kind !== 'popup') return;
      var pep = el.getAttribute('data-sf-path') || rec.path;
      _sfOpenPopup(rec, pep, containerEl, entry, parsed, section, uid);
      return;
    }
    if (action === 'comp-add') {
      if (!rec || rec.kind !== 'components') return;
      var ckey = el.value;
      if (!ckey) return;
      if (ckey === rec.def.conditionKey) return; // 条件走 cond-add, 不占组件槽
      var comps = _sfCompsOf(rec.def);
      var cobj = rec.path ? _getNested(entry.data, rec.path) : entry.data;
      if (!cobj || typeof cobj !== 'object' || Array.isArray(cobj)) {
        cobj = {};
        if (rec.path) _setNested(entry.data, rec.path, cobj);
      }
      if (ckey === '__custom__') {
        // 自定义组件: 自动生成不冲突的键, 值用 kv 编辑器 (支持嵌套)
        var cbn = 'custom';
        var cni = 1;
        while (cobj[cbn + (cni === 1 ? '' : '_' + cni)] !== undefined) cni++;
        ckey = cbn + (cni === 1 ? '' : '_' + cni);
      }
      var wd = comps[ckey];
      cobj[ckey] = wd ? _sfDefaultOf(wd.widget || wd) : {};
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'cond-add') {
      if (!rec || rec.kind !== 'components') return;
      var cdk = rec.def.conditionKey;
      if (!cdk) return;
      var cdobj = rec.path ? _getNested(entry.data, rec.path) : entry.data;
      if (!cdobj || typeof cdobj !== 'object' || Array.isArray(cdobj)) {
        cdobj = {};
        if (rec.path) _setNested(entry.data, rec.path, cdobj);
      }
      if (cdobj[cdk] !== undefined) return;
      var cdWd = _sfCompsOf(rec.def)[cdk];
      cdobj[cdk] = cdWd ? _sfDefaultOf(cdWd.widget || cdWd) : {};
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'model-mode') {
      if (!rec || rec.kind !== 'model') return;
      var mode2 = el.value;
      var cur = rec.path ? _getNested(entry.data, rec.path) : entry.data;
      var next;
      if (mode2 === 'path') {
        next = (typeof cur === 'string') ? cur
          : (cur && typeof cur === 'object' && typeof cur.path === 'string') ? cur.path
          : '';
      } else if (mode2 === 'simplified') {
        next = (cur !== null && typeof cur === 'object' && !Array.isArray(cur)) ? cur
          : (typeof cur === 'string') ? { path: cur }
          : {};
      } else {
        next = (cur !== null && typeof cur === 'object' && !Array.isArray(cur)) ? Object.assign({}, cur) : {};
        if (!next.type) next.type = 'minecraft:model';
      }
      if (rec.path) _applyValue(entry, rec.path, next, parsed, section);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
  }

  // ---- schema section 表单 ----
  function _sfSchemaOf(type) {
    _sfInit();
    return (_sfSchemas && _sfSchemas.sections) ? (_sfSchemas.sections[type] || null) : null;
  }
  function _sfConfigSchemaOf(group) {
    _sfInit();
    return (_sfSchemas && _sfSchemas.config) ? (_sfSchemas.config[group] || null) : null;
  }
  // 条目其他字段: 折叠 + 每键 kv 行编辑
  function _sfOtherFieldsHtml(entry, modeled) {
    var data = entry.data;
    var rest = [];
    var keys = _entryKeyOrder(entry);
    for (var i = 0; i < keys.length; i++) {
      if (!modeled[keys[i]]) rest.push(keys[i]);
    }
    if (!rest.length) return '';
    var html = '<details class="ce-sf-collapse"><summary>' + _escHtml(_t('craftengine.otherFields') + ' (' + rest.length + ')') + '</summary>';
    for (var r = 0; r < rest.length; r++) {
      var k = rest[r];
      var v = data ? data[k] : undefined;
      var editor;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) editor = _sfKvTextarea({ type: 'kv' }, k, v);
      else editor = _sfScalarInput({}, k, v);
      html += '<div class="ce-stack ce-sf-rest"><label class="ce-field-label">' + _escHtml(k) + '</label>' + editor + '</div>';
    }
    return html + '</details>';
  }
  function _sfEntryFormHtml(section, entry, schema, formTab, evKey) {
    _sfInit();
    var html = _renderField(_t('craftengine.entryKey'),
      '<input class="ce-input ce-key-input" data-ce-field="__key__" value="' + _escHtml(entry.key).replace(/"/g, '&quot;') + '" spellcheck="false">',
      _t('craftengine.entryKeyHint'));
    if (schema.wholeValue) {
      if (entry.data !== null && typeof entry.data === 'object' && !Array.isArray(entry.data)) {
        html += _renderField(_t('craftengine.content'), _sfKvWhole({}, entry.data), _t('craftengine.kvWholeHint'));
      } else if (typeof entry.data === 'string') {
        html += _renderField(_t('craftengine.content'), _sfWholeText({}, entry.data), _t('craftengine.kvWholeHint'));
      } else {
        html += _renderField(_t('craftengine.content'),
          '<textarea class="ce-input ce-json-field ce-json-whole" data-ce-field-json="__whole__" rows="6" spellcheck="false">' +
          _escHtml(JSON.stringify(entry.data)) + '</textarea>', _t('craftengine.jsonEditorHint'));
      }
      return html;
    }
    var modeled = {};
    var tabs = null;
    if (schema.tabs && schema.tabs.length) {
      tabs = { other: '' };
      for (var t = 0; t < schema.tabs.length; t++) tabs[schema.tabs[t].key] = '';
    }
    var keyStyle = _sfItemKeyStyle(entry.data);
    (schema.fields || []).forEach(function (fld) {
      var fk = _sfFldKey(fld, keyStyle);
      modeled[fk] = 1;
      var fhtml;
      if (fld.custom === 'events') fhtml = _eventsPanel(entry, evKey);
      else if (fld.custom === 'root-map') {
        fhtml = _sfFieldHtml(fld, '', entry.data, { entryData: entry.data, entry: entry, keyStyle: keyStyle });
        // 根键已由 root-map 渲染, 全部标记为已建模
        if (entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)) {
          for (var rk = 0; rk < Object.keys(entry.data).length; rk++) modeled[Object.keys(entry.data)[rk]] = 1;
        }
      }
      else fhtml = _sfFieldHtml(fld, fk, entry.data ? entry.data[fk] : undefined, { entryData: entry.data, entry: entry, keyStyle: keyStyle });
      if (tabs) {
        var tk = fld.tab || 'other';
        if (tabs[tk] === undefined) tabs[tk] = '';
        tabs[tk] += fhtml;
      } else {
        html += fhtml;
      }
    });
    if (tabs && tabs.custom !== undefined) {
      // 自定义选项卡: 警告 + 未建模键 kv 折叠 (写回保留 modeled 键)
      var cdata = (entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)) ? entry.data : {};
      var customRest = [];
      var customKeys = _entryKeyOrder(entry);
      for (var cr = 0; cr < customKeys.length; cr++) {
        if (!modeled[customKeys[cr]]) customRest.push(customKeys[cr]);
      }
      var customText = _sfObjText((function () { var o = {}; customRest.forEach(function (k) { o[k] = cdata[k]; }); return o; })());
      tabs.custom = '<div class="ce-sf-custom-warn">⚠ ' + _escHtml(_t('craftengine.customTabWarning')) + '</div>' +
        '<div class="ce-stack"><textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="" data-sf-type="kv-rest"' +
        ' data-sf-exclude="' + _escHtml(Object.keys(modeled).join(',')) + '"' +
        ' rows="' + Math.max(3, Math.min(customRest.length + 1, 10)) + '" spellcheck="false">' + _escHtml(customText) + '</textarea></div>';
    }
    var other = _sfOtherFieldsHtml(entry, modeled);
    if (tabs) {
      tabs.other += other;
      html += _sfTabsHtml(schema, tabs, formTab);
    } else {
      html += other;
    }
    html += _sfDatalistHtml();
    return html;
  }
  // schema 选项卡: 标签取 schema.tabs 定义, 'other' 用 i18n
  function _sfTabsHtml(schema, tabsData, activeTab) {
    var order = [];
    Object.keys(tabsData).forEach(function (k) {
      if (tabsData[k] !== '') order.push(k);
    });
    if (!order.length) return '';
    var tabDefs = {};
    (schema.tabs || []).forEach(function (t) { tabDefs[t.key] = t; });
    var idx = 0;
    for (var i = 0; i < order.length; i++) {
      if (order[i] === activeTab) { idx = i; break; }
    }
    var bar = '<div class="ce-tabs">';
    for (var j = 0; j < order.length; j++) {
      var label;
      if (tabDefs[order[j]]) label = _labelOf(tabDefs[order[j]]);
      else if (order[j] === 'other') label = _t('craftengine.otherFields');
      else label = order[j];
      bar += '<button class="cv-btn cv-btn-sm ce-tab-btn' + (j === idx ? ' active' : '') + '" data-action="ce-tab" data-ce-tab="' + _escHtml(order[j]) + '">' +
        _escHtml(label) + '</button>';
    }
    bar += '</div>';
    var panels = '';
    for (var k = 0; k < order.length; k++) {
      panels += '<div class="ce-tab-panel' + (k === idx ? ' ce-tab-active' : '') + '" data-ce-tabpanel="' + _escHtml(order[k]) + '">' + tabsData[order[k]] + '</div>';
    }
    return bar + panels;
  }
  // config.yml 组表单: 顶层键投影的伪 section
  function _sfConfigEntryForm(section, entry) {
    _sfInit();
    var data = entry.data;
    var schema = _sfConfigSchemaOf(section.key);
    var html = '';
    if (schema && schema.type && !schema.fields) {
      // 标量组值 (config-version / metrics ...)
      var t = schema.type;
      if (t === 'bool') {
        html += _sfWrap(schema, '<input type="checkbox" class="ce-input" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="whole-bool"' + (data ? ' checked' : '') + '>');
      } else if (t === 'number') {
        html += _sfWrap(schema, '<input class="ce-input" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="whole-number" value="' + _escHtml(_sfScalarText(data)) + '" spellcheck="false">');
      } else {
        html += _sfWrap(schema, '<input class="ce-input" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="whole-text" value="' + _escHtml(_sfScalarText(data)).replace(/"/g, '&quot;') + '" spellcheck="false">');
      }
      return html;
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      var modeled = {};
      if (schema && schema.fields) {
        for (var i = 0; i < schema.fields.length; i++) {
          var fld = schema.fields[i];
          modeled[fld.key] = 1;
          html += _sfFieldHtml(fld, fld.key, data[fld.key]);
        }
      }
      // 未建模键: 单个折叠 kv 编辑器 (整组替换, 保留已建模键)
      var rest = [];
      var keys = _entryKeyOrder(entry);
      for (var r = 0; r < keys.length; r++) {
        if (!modeled[keys[r]]) rest.push(keys[r]);
      }
      if (rest.length) {
        var text = _sfObjText((function () { var o = {}; rest.forEach(function (k) { o[k] = data[k]; }); return o; })());
        html += '<details class="ce-sf-collapse"><summary>' + _escHtml(_t('craftengine.otherFields') + ' (' + rest.length + ')') + '</summary>' +
          '<div class="ce-stack"><textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="" data-sf-type="kv-rest"' +
          ' data-sf-exclude="' + _escHtml(Object.keys(modeled).join(',')) + '"' +
          ' rows="' + Math.max(3, Math.min(rest.length + 1, 10)) + '" spellcheck="false">' + _escHtml(text) + '</textarea></div></details>';
      }
    } else {
      html += _renderField(_t('craftengine.content'), _sfWholeText({}, data), _t('craftengine.kvWholeHint'));
    }
    html += _sfDatalistHtml();
    return html;
  }
  // config.yml: 顶层键投影为伪 sections (渲染层), 数据仍存 _fileLevelRaw
  function _projectConfigSections(parsed) {
    var ordered = [];
    for (var i = 0; i < parsed._topOrder.length; i++) {
      if (parsed._topOrder[i].kind === 'raw') ordered.push(parsed._topOrder[i].key);
    }
    for (var o = 0; o < ordered.length; o++) {
      var k = ordered[o];
      var v = parsed._fileLevelRaw[k];
      var isObj = v !== null && typeof v === 'object' && !Array.isArray(v);
      parsed.sections.push({
        key: k, base: 'config', segment: '',
        entries: [{ key: k, data: v, _rawOrder: isObj ? Object.keys(v) : [], _comments: { before: {}, inline: {}, afterKey: {} } }],
        _comments: { beforeEntry: {}, inlineEntry: {} },
      });
    }
  }

  // ============ 渲染 ============
  // 路径: 点号分段; map/组件键含 '.' 时经 _sfKeyPath 转义为 \.
  function _pathParts(path) {
    var parts = [];
    var cur = '';
    var s = String(path);
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '\\' && s[i + 1] === '.') { cur += '.'; i++; }
      else if (s[i] === '.') { parts.push(cur); cur = ''; }
      else cur += s[i];
    }
    parts.push(cur);
    return parts;
  }
  function _sfKeyPath(path, key) {
    var esc = String(key).replace(/\./g, '\\.');
    return path ? path + '.' + esc : esc;
  }
  function _setNested(obj, path, value) {
    var parts = _pathParts(path);
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  }
  function _getNested(obj, path) {
    var parts = _pathParts(path);
    var o = obj;
    for (var i = 0; i < parts.length; i++) {
      if (o == null) return undefined;
      o = o[parts[i]];
    }
    return o;
  }
  function _deleteNested(obj, path) {
    var parts = _pathParts(path);
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (o == null || typeof o[parts[i]] !== 'object') return;
      o = o[parts[i]];
    }
    delete o[parts[parts.length - 1]];
  }

  function _renderField(label, html, hint, key) {
    var icon = '';
    var tip = hint || '';
    var k = _sfHintKey(key);
    if (_sfCeHints && k && _sfCeHints[k]) tip = _sfTipOf(_sfCeHints[k]);
    if (tip) icon = '<span class="ce-sf-hint-icon" data-sf-hint="' + _escHtml(tip) + '">ℹ</span>';
    return '<div class="ce-field">' +
      '<label class="ce-field-label">' + _escHtml(label) + icon + '</label>' +
      (hint ? '<div class="ce-field-hint">' + _escHtml(hint) + '</div>' : '') +
      html + '</div>';
  }
  function _textInput(path, value, placeholder, type) {
    var v = (value === undefined || value === null) ? '' : String(value);
    return '<input class="ce-input" data-ce-field="' + _escHtml(path) + '"' +
      (type === 'number' ? ' type="number" data-ce-type="number"' : '') +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' value="' + _escHtml(v).replace(/"/g, '&quot;') + '">';
  }
  function _checkbox(path, value) {
    return '<input type="checkbox" class="ce-input" data-ce-field="' + _escHtml(path) + '" data-ce-type="bool"' +
      (value ? ' checked' : '') + '>';
  }
  function _selectField(path, value, options, num, titlePrefix) {
    var html = '<select class="ce-input" data-ce-field="' + _escHtml(path) + '">' +
      '<option value="">-- ' + _escHtml(_t('craftengine.fieldEmpty')) + ' --</option>';
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      var otip = '';
      if (titlePrefix && _sfCeHints) {
        var oh = _sfCeHints[titlePrefix + '.' + o];
        if (oh) otip = ' title="' + _escHtml(_sfTipOf(oh)) + '"';
      }
      html += '<option value="' + _escHtml(o) + '"' + otip + (String(value) === o ? ' selected' : '') + '>' + _escHtml(o) + '</option>';
    }
    return html + '</select>';
  }
  function _jsonField(path, value, exclude, placeholder) {
    var obj = value;
    if (exclude && obj && typeof obj === 'object' && !Array.isArray(obj)) {
      var copy = {};
      Object.keys(obj).forEach(function (k) {
        if (exclude.indexOf(k) === -1) copy[k] = obj[k];
      });
      obj = copy;
    }
    var text = '';
    if (obj !== undefined && obj !== null) {
      try { text = JSON.stringify(obj, null, 2); } catch (e) { text = String(obj); }
    }
    return '<textarea class="ce-input ce-json-field" data-ce-field-json="' + _escHtml(path) + '"' +
      (exclude ? ' data-json-exclude="' + _escHtml(exclude.join(',')) + '"' : '') +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="4" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _linesField(path, value, placeholder) {
    var arr = Array.isArray(value) ? value : [];
    var text = arr.map(function (l) { return String(l); }).join('\n');
    return '<textarea class="ce-input ce-lines-field" data-ce-field="' + _escHtml(path) + '" data-ce-type="lines"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="4" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _kvField(path, value, placeholder) {
    // 键值行编辑器: A: default:topaz / #tag / {...JSON}
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var text = Object.keys(obj).map(function (k) {
      var v = obj[k];
      var vs = (v && typeof v === 'object') ? JSON.stringify(v) : String(v);
      return k + ': ' + vs;
    }).join('\n');
    return '<textarea class="ce-input ce-kv-field" data-ce-field="' + _escHtml(path) + '" data-ce-type="kv"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="5" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _textArea(path, value, placeholder, rows) {
    var v = (value === undefined || value === null) ? '' : String(value);
    return '<textarea class="ce-input" data-ce-field="' + _escHtml(path) + '" data-ce-type="text"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="' + (rows || 4) + '" spellcheck="false">' + _escHtml(v) + '</textarea>';
  }
  function _linesScalarField(path, value, placeholder) {
    // 1 行写字符串, 多行写数组 (item category / template)
    var arr = Array.isArray(value) ? value : (value !== undefined && value !== null ? [String(value)] : []);
    var text = arr.map(function (l) { return String(l); }).join('\n');
    return '<textarea class="ce-input ce-lines-field" data-ce-field="' + _escHtml(path) + '" data-ce-type="lines-scalar"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="' + (arr.length > 1 ? Math.min(arr.length + 1, 8) : 2) + '" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _linesJsonField(path, value, placeholder) {
    // 每行: 纯字符串或 JSON 对象 (sound.sounds 列表)
    var arr = Array.isArray(value) ? value : [];
    var text = arr.map(function (l) {
      if (l !== null && typeof l === 'object') return JSON.stringify(l);
      return String(l);
    }).join('\n');
    return '<textarea class="ce-input ce-lines-field" data-ce-field="' + _escHtml(path) + '" data-ce-type="lines-json"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="5" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _wholeTextField(value, placeholder, rows) {
    // 整条 entry 值为纯文本 (global_variables)
    var v = (value === undefined || value === null) ? '' : String(value);
    return '<textarea class="ce-input" data-ce-field="__whole__" data-ce-type="whole-text"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="' + (rows || 3) + '" spellcheck="false">' + _escHtml(v) + '</textarea>';
  }
  function _kvWholeField(value, placeholder) {
    // 整条 entry 值为 map (translations / lang)
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var text = Object.keys(obj).map(function (k) {
      var v = obj[k];
      var vs = (v && typeof v === 'object') ? JSON.stringify(v) : String(v);
      return k + ': ' + vs;
    }).join('\n');
    return '<textarea class="ce-input ce-kv-field" data-ce-field="__whole__" data-ce-type="kv-whole"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="8" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  // behavior 子表单: type select + 该 type 的建模字段 + JSON 兜底
  function _behaviorForm(used, behaviorObj, typeOptions, typeKey, jsonKey) {
    var html = '';
    var bhv = behaviorObj && typeof behaviorObj === 'object' && !Array.isArray(behaviorObj) ? behaviorObj : {};
    var type = bhv.type;
    used[jsonKey || 'behavior'] = 1;
    html += _renderField(_t('craftengine.behaviorType'), _selectField('behavior.type', type, typeOptions, null, 'behavior'));
    var fields = BEHAVIOR_FIELDS[type] || null;
    var modeled = ['type'];
    if (fields) {
      for (var i = 0; i < fields.length; i++) {
        var spec = fields[i];
        var f = spec[0], ft = spec[1];
        modeled.push(f);
        var path = 'behavior.' + f;
        var v = _getNested(bhv, f);
        if (ft === 'number') html += _renderField(f, _textInput(path, v, '', 'number'));
        else if (ft === 'bool') html += _renderField(f, _checkbox(path, v));
        else if (ft === 'lines') html += _renderField(f, _linesField(path, v));
        else if (ft === 'lines-scalar') html += _renderField(f, _linesScalarField(path, v));
        else if (ft === 'lines-json') html += _renderField(f, _linesJsonField(path, v));
        else if (ft === 'select') html += _renderField(f, _selectField(path, v, spec[2] || []));
        else if (ft === 'json') html += _renderField(f, _jsonField(path, v));
        else html += _renderField(f, _textInput(path, v));
      }
    }
    html += _renderField(_t('craftengine.jsonEditor'), _jsonField('behavior', bhv, modeled));
    return html;
  }

  // ---- 条目表单 ----
  function _renderEntryForm(section, entry, formTab, evKey) {
    var type = TYPE_SECTIONS[section.base];
    var data = entry.data;
    // config 伪 section / schema 化 section (简单类型) 走数据驱动表单
    if (section.base === 'config') return _sfConfigEntryForm(section, entry);
    var schema = _sfSchemaOf(type);
    if (schema) return _sfEntryFormHtml(section, entry, schema, formTab, evKey);
    var keyField = _renderField(_t('craftengine.entryKey'),
      '<input class="ce-input ce-key-input" data-ce-field="__key__" value="' + _escHtml(entry.key).replace(/"/g, '&quot;') + '" spellcheck="false">',
      _t('craftengine.entryKeyHint'));
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      // 标量条目 → 整条文本 (global_variables); 数组 → 通用 JSON
      if (type === 'globalVariable' && typeof data === 'string') {
        return keyField + _renderField(_t('craftengine.content'), _wholeTextField(data, '<global:id> 内容'));
      }
      return keyField + _renderField(_t('craftengine.jsonEditor'),
        '<textarea class="ce-input ce-json-field ce-json-whole" data-ce-field-json="__whole__" rows="6" spellcheck="false">' +
        _escHtml(JSON.stringify(data)) + '</textarea>',
        _t('craftengine.jsonEditorHint'));
    }
    var keys = _entryKeyOrder(entry);
    var html = '';
    var used = {};
    // 选项卡缓冲: basic/model/itemData/behavior/events/other
    var tabs = { basic: '', model: '', itemData: '', behavior: '', events: '', other: '' };

    if (type === 'item') {
      used['material'] = 1; tabs.basic += _renderField(_t('craftengine.material'), _textInput('material', data.material, 'paper'));
      used['custom-model-data'] = 1; tabs.basic += _renderField(_t('craftengine.customModelData'), _textInput('custom-model-data', data['custom-model-data'], '10000', 'number'));
      used['texture'] = 1; tabs.basic += _renderField(_t('craftengine.texture'), _textInput('texture', data.texture, 'minecraft:item/custom/xxx'));
      used['category'] = 1; tabs.basic += _renderField(_t('craftengine.category'), _linesScalarField('category', data.category, 'default:category（多行 = 多个分类）'));
      used['template'] = 1; tabs.basic += _renderField(_t('craftengine.template'), _linesScalarField('template', data.template, 'default:template（多行 = 多模板组合）'));
      used['arguments'] = 1; tabs.basic += _renderField(_t('craftengine.arguments'), _kvField('arguments', data.arguments, 'part: helmet\nslot: head'));
      used['client-bound-material'] = 1; tabs.basic += _renderField(_t('craftengine.clientBoundMaterial'), _textInput('client-bound-material', data['client-bound-material'], 'minecraft:paper'));
      tabs.basic += '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.settings')) + '</div>';
      used['settings'] = 1;
      tabs.basic += _renderField(_t('craftengine.tags'), _linesField('settings.tags', _getNested(data, 'settings.tags'), 'minecraft:planks'));
      tabs.basic += _renderField(_t('craftengine.equipment'), _jsonField('settings.equipment', _getNested(data, 'settings.equipment')));
      tabs.basic += _renderField(_t('craftengine.jsonEditor'), _jsonField('settings', data.settings, ['tags', 'equipment']));
      tabs.basic += '</div>';
      used['model'] = 1; tabs.model += _renderField(_t('craftengine.model'), _jsonField('model', data.model), _t('craftengine.modelJsonHint'));
      tabs.itemData += '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.dataLabel')) + '</div>';
      used['data'] = 1;
      tabs.itemData += _renderField(_t('craftengine.displayName'), _textInput('data.item-name', _getNested(data, 'data.item-name'), '<!i><#FF8C00>Name'));
      tabs.itemData += _renderField(_t('craftengine.itemName'), _textInput('data.display-name', _getNested(data, 'data.display-name'), '<!i><white>Name'));
      tabs.itemData += _renderField(_t('craftengine.lore'), _linesField('data.lore', _getNested(data, 'data.lore'), '每行一条 lore'));
      tabs.itemData += _renderField(_t('craftengine.food'), _jsonField('data.food', _getNested(data, 'data.food')));
      tabs.itemData += _renderField(_t('craftengine.jsonEditor'), _jsonField('data', data.data), _t('craftengine.dataJsonHint'));
      tabs.itemData += '</div>';
      tabs.behavior += _behaviorForm(used, data.behavior, ITEM_BEHAVIOR_TYPES);
      used['merges'] = 1; tabs.events += _renderField(_t('craftengine.merges'), _jsonField('merges', data.merges));
      used['overrides'] = 1; tabs.events += _renderField(_t('craftengine.overrides'), _jsonField('overrides', data.overrides));
      used['events'] = 1; tabs.events += _eventsPanel(entry, evKey);
      used['updater'] = 1; tabs.events += _renderField(_t('craftengine.updater'), _jsonField('updater', data.updater));
    } else if (type === 'block') {
      used['state'] = 1; tabs.basic += _renderField(_t('craftengine.state'), _jsonField('state', data.state));
      used['states'] = 1; tabs.basic += _renderField(_t('craftengine.states'), _jsonField('states', data.states), _t('craftengine.statesHint'));
      tabs.basic += '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.settings')) + '</div>';
      used['settings'] = 1;
      tabs.basic += _renderField(_t('craftengine.hardness'), _textInput('settings.hardness', _getNested(data, 'settings.hardness'), '2.0', 'number'));
      tabs.basic += _renderField(_t('craftengine.resistance'), _textInput('settings.resistance', _getNested(data, 'settings.resistance'), '2.0', 'number'));
      tabs.basic += _renderField(_t('craftengine.settingsItem'), _textInput('settings.item', _getNested(data, 'settings.item'), 'default:my_block'));
      tabs.basic += _renderField(_t('craftengine.mapColor'), _textInput('settings.map-color', _getNested(data, 'settings.map-color'), '19'));
      tabs.basic += _renderField(_t('craftengine.tags'), _linesField('settings.tags', _getNested(data, 'settings.tags'), 'minecraft:planks'));
      tabs.basic += _renderField(_t('craftengine.settingsSounds'), _jsonField('settings.sounds', _getNested(data, 'settings.sounds')));
      tabs.basic += _renderField(_t('craftengine.jsonEditor'), _jsonField('settings', data.settings, ['hardness', 'resistance', 'item', 'map-color', 'tags', 'sounds']));
      tabs.basic += '</div>';
      tabs.behavior += _behaviorForm(used, data.behavior, BLOCK_BEHAVIOR_TYPES);
      used['behaviors'] = 1; tabs.events += _renderField(_t('craftengine.behaviors'), _jsonField('behaviors', data.behaviors));
      used['loot'] = 1; tabs.events += _renderField(_t('craftengine.loot'), _jsonField('loot', data.loot));
      used['events'] = 1; tabs.events += _eventsPanel(entry, evKey);
    } else if (type === 'furniture') {
      used['variants'] = 1; tabs.basic += _renderField(_t('craftengine.variants'), _jsonField('variants', data.variants), _t('craftengine.variantsHint'));
      tabs.basic += '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.settings')) + '</div>';
      used['settings'] = 1;
      tabs.basic += _renderField(_t('craftengine.settingsItem'), _textInput('settings.item', _getNested(data, 'settings.item'), 'default:my_furniture'));
      tabs.basic += _renderField(_t('craftengine.hitTimes'), _textInput('settings.hit-times', _getNested(data, 'settings.hit-times'), '0', 'number'));
      tabs.basic += _renderField(_t('craftengine.settingsSounds'), _jsonField('settings.sounds', _getNested(data, 'settings.sounds')));
      tabs.basic += _renderField(_t('craftengine.jsonEditor'), _jsonField('settings', data.settings, ['item', 'hit-times', 'sounds']));
      tabs.basic += '</div>';
      tabs.behavior += _behaviorForm(used, data.behavior, FURNITURE_BEHAVIOR_TYPES);
      used['behaviors'] = 1; tabs.events += _renderField(_t('craftengine.behaviors'), _jsonField('behaviors', data.behaviors));
      used['loot'] = 1; tabs.events += _renderField(_t('craftengine.loot'), _jsonField('loot', data.loot));
      used['events'] = 1; tabs.events += _eventsPanel(entry, evKey);
    } else if (type === 'recipe') {
      used['type'] = 1; html += _renderField(_t('craftengine.recipeType'), _selectField('type', data.type, RECIPE_TYPES));
      used['pattern'] = 1; html += _renderField(_t('craftengine.pattern'), _linesField('pattern', data.pattern), _t('craftengine.patternHint'));
      used['ingredients'] = 1; html += _renderField(_t('craftengine.ingredients'), _kvField('ingredients', data.ingredients), _t('craftengine.ingredientsHint'));
      html += '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.result')) + '</div>';
      used['result'] = 1;
      html += _renderField(_t('craftengine.resultId'), _textInput('result.id', _getNested(data, 'result.id'), 'default:item'));
      html += _renderField(_t('craftengine.resultCount'), _textInput('result.count', _getNested(data, 'result.count'), '1', 'number'));
      html += _renderField(_t('craftengine.jsonEditor'), _jsonField('result', data.result, ['id', 'count']));
      html += '</div>';
      used['experience'] = 1; html += _renderField(_t('craftengine.experience'), _textInput('experience', data.experience, '1.0', 'number'));
      used['time'] = 1; html += _renderField(_t('craftengine.time'), _textInput('time', data.time, '200', 'number'));
      used['base'] = 1; html += _renderField(_t('craftengine.base'), _textInput('base', data.base, 'default:item'));
      used['addition'] = 1; html += _renderField(_t('craftengine.addition'), _textInput('addition', data.addition, 'default:item'));
      used['template_type'] = 1; html += _renderField(_t('craftengine.templateType'), _textInput('template_type', data.template_type, 'minecraft:netherite_upgrade_smithing_template'));
      used['category'] = 1; html += _renderField(_t('craftengine.category'), _textInput('category', data.category, 'building'));
      used['group'] = 1; html += _renderField(_t('craftengine.group'), _textInput('group', data.group));
      used['unlock_on_ingredient_obtained'] = 1; html += _renderField(_t('craftengine.unlockOnIngredient'), _checkbox('unlock_on_ingredient_obtained', data.unlock_on_ingredient_obtained));
      used['unlock_on_join'] = 1; html += _renderField(_t('craftengine.unlockOnJoin'), _checkbox('unlock_on_join', data.unlock_on_join));
    } else if (type === 'equipment') {
      used['type'] = 1; html += _renderField(_t('craftengine.equipmentType'), _selectField('type', data.type, EQUIPMENT_TYPES));
      used['layers'] = 1; html += _renderField(_t('craftengine.layers'), _kvField('layers', data.layers), _t('craftengine.layersHint', { names: EQUIPMENT_LAYERS.join(' / ') }));
    } else if (type === 'image') {
      used['file'] = 1; html += _renderField(_t('craftengine.file'), _textInput('file', data.file, 'assets/images/xxx.png'));
      used['height'] = 1; html += _renderField(_t('craftengine.height'), _textInput('height', data.height, '16', 'number'));
      used['ascent'] = 1; html += _renderField(_t('craftengine.ascent'), _textInput('ascent', data.ascent, '12', 'number'));
      used['font'] = 1; html += _renderField(_t('craftengine.font'), _textInput('font', data.font, 'minecraft:default'));
      used['char'] = 1; html += _renderField(_t('craftengine.char'), _textInput('char', data.char, ''));
      used['chars'] = 1; html += _renderField(_t('craftengine.chars'), _linesField('chars', data.chars, '每行一个字符'));
      used['grid_size'] = 1; html += _renderField(_t('craftengine.gridSize'), _textInput('grid_size', data.grid_size, '16', 'number'));
      used['ref'] = 1; html += _renderField(_t('craftengine.ref'), _textInput('ref', data.ref, 'default:image'));
      used['row'] = 1; html += _renderField(_t('craftengine.row'), _textInput('row', data.row, '0', 'number'));
      used['column'] = 1; html += _renderField(_t('craftengine.column'), _textInput('column', data.column, '0', 'number'));
    } else if (type === 'category') {
      used['name'] = 1; html += _renderField(_t('craftengine.name'), _textInput('name', data.name, '分类显示名'));
      used['icon'] = 1; html += _renderField(_t('craftengine.icon'), _textInput('icon', data.icon, 'minecraft:paper'));
      used['priority'] = 1; html += _renderField(_t('craftengine.priority'), _textInput('priority', data.priority, '0', 'number'));
      used['hidden'] = 1; html += _renderField(_t('craftengine.hidden'), _checkbox('hidden', data.hidden));
      used['lore'] = 1; html += _renderField(_t('craftengine.lore'), _linesField('lore', data.lore, '每行一条 lore'));
      used['list'] = 1; html += _renderField(_t('craftengine.list'), _linesField('list', data.list, '分类下物品列表'));
      used['all_items'] = 1; html += _renderField(_t('craftengine.allItems'), _checkbox('all_items', data.all_items));
      used['conditions'] = 1; html += _renderField(_t('craftengine.conditions'), _jsonField('conditions', data.conditions));
    } else if (type === 'sound') {
      used['replace'] = 1; html += _renderField(_t('craftengine.replace'), _checkbox('replace', data.replace));
      used['subtitle'] = 1; html += _renderField(_t('craftengine.subtitle'), _textInput('subtitle', data.subtitle, '声音字幕'));
      var snds = data.sounds;
      used['sounds'] = 1;
      if (snds && typeof snds === 'object' && !Array.isArray(snds)) {
        html += _renderField(_t('craftengine.sounds'), _jsonField('sounds', snds));
      } else {
        html += _renderField(_t('craftengine.sounds'), _linesJsonField('sounds', snds), _t('craftengine.soundsHint'));
      }
    } else if (type === 'emoji') {
      used['keywords'] = 1; html += _renderField(_t('craftengine.keywords'), _linesField('keywords', data.keywords, '每行一个关键词'));
      used['content'] = 1; html += _renderField(_t('craftengine.content'), _textArea('content', data.content, 'emoji 文本', 2));
      used['image'] = 1; html += _renderField(_t('craftengine.image'), _textInput('image', data.image, 'assets/emoji/xxx.png'));
      used['permission'] = 1; html += _renderField(_t('craftengine.permission'), _textInput('permission', data.permission, 'chat.emoji.xxx'));
      used['chat_completion'] = 1; html += _renderField(_t('craftengine.chatCompletion'), _checkbox('chat_completion', data.chat_completion));
      used['template'] = 1; html += _renderField(_t('craftengine.template'), _textInput('template', data.template, 'default:emoji'));
      used['overrides'] = 1; html += _renderField(_t('craftengine.overrides'), _jsonField('overrides', data.overrides));
    } else if (type === 'jukeboxSong') {
      used['sound'] = 1; html += _renderField(_t('craftengine.sound'), _textInput('sound', data.sound, 'minecraft:music_disc.pigstep'));
      used['length'] = 1; html += _renderField(_t('craftengine.length'), _textInput('length', data.length, '150', 'number'));
      used['description'] = 1; html += _renderField(_t('craftengine.description'), _textInput('description', data.description, '唱片描述'));
      used['comparator_output'] = 1; html += _renderField(_t('craftengine.comparatorOutput'), _textInput('comparator_output', data.comparator_output, '0', 'number'));
      used['range'] = 1; html += _renderField(_t('craftengine.range'), _textInput('range', data.range, '10', 'number'));
    } else if (type === 'painting') {
      used['width'] = 1; html += _renderField(_t('craftengine.width'), _textInput('width', data.width, '2', 'number'));
      used['height'] = 1; html += _renderField(_t('craftengine.height'), _textInput('height', data.height, '2', 'number'));
      used['asset_id'] = 1; html += _renderField(_t('craftengine.assetId'), _textInput('asset_id', data.asset_id, 'assets/paintings/xxx'));
      used['title'] = 1; html += _renderField(_t('craftengine.title'), _textInput('title', data.title, '画名'));
      used['author'] = 1; html += _renderField(_t('craftengine.author'), _textInput('author', data.author, '作者'));
      used['show_in_op_tab'] = 1; html += _renderField(_t('craftengine.showInOpTab'), _checkbox('show_in_op_tab', data.show_in_op_tab));
    } else if (type === 'globalVariable') {
      // object 值: 整条键值行编辑 (string 已在上方标量分支处理)
      return _renderField(_t('craftengine.globalVariableMap'), _kvWholeField(data), _t('craftengine.kvWholeHint'));
    } else if (type === 'translation' || type === 'lang') {
      return _renderField(_t('craftengine.translationMap'), _kvWholeField(data), _t('craftengine.kvWholeHint'));
    } else if (type === 'lootSource') {
      used['type'] = 1; html += _renderField(_t('craftengine.lootSourceType'), _selectField('type', data.type, LOOT_SOURCE_TYPES, null, 'loot_source'));
      used['target'] = 1; html += _renderField(_t('craftengine.target'), _textInput('target', data.target, 'default:block'));
      used['targets'] = 1; html += _renderField(_t('craftengine.targets'), _linesField('targets', data.targets, '每行一个目标'));
      used['overwrite'] = 1; html += _renderField(_t('craftengine.overwrite'), _selectField('overwrite', data.overwrite, LOOT_OVERWRITE));
      used['conditions'] = 1; html += _renderField(_t('craftengine.conditions'), _jsonField('conditions', data.conditions));
      used['loot'] = 1; html += _renderField(_t('craftengine.loot'), _jsonField('loot', data.loot));
    } else if (type === 'placedFeature') {
      used['feature'] = 1; html += _renderField(_t('craftengine.feature'), _jsonField('feature', data.feature), _t('craftengine.featureHint'));
      used['placement'] = 1; html += _renderField(_t('craftengine.placement'), _jsonField('placement', data.placement));
      used['world'] = 1; html += _renderField(_t('craftengine.world'), _linesField('world', data.world, '每行一个世界'));
      used['dimension'] = 1; html += _renderField(_t('craftengine.dimension'), _linesField('dimension', data.dimension, '每行一个维度'));
      used['dimension_type'] = 1; html += _renderField(_t('craftengine.dimensionType'), _linesField('dimension_type', data.dimension_type));
      used['biome'] = 1; html += _renderField(_t('craftengine.biome'), _linesField('biome', data.biome, '每行一个生物群系'));
    } else if (type === 'template') {
      used['type'] = 1; html += _renderField(_t('craftengine.type'), _textInput('type', data.type, 'helmet'));
      used['material'] = 1; html += _renderField(_t('craftengine.material'), _textInput('material', data.material, 'minecraft:paper'));
      used['content'] = 1; html += _renderField(_t('craftengine.content'), _textArea('content', data.content, '模板内容', 4));
      used['template'] = 1; html += _renderField(_t('craftengine.template'), _linesScalarField('template', data.template, 'default:template（多行 = 多模板）'));
      used['arguments'] = 1; html += _renderField(_t('craftengine.arguments'), _kvField('arguments', data.arguments, 'part: helmet\nslot: head'));
      used['merges'] = 1; html += _renderField(_t('craftengine.merges'), _jsonField('merges', data.merges));
      used['overrides'] = 1; html += _renderField(_t('craftengine.overrides'), _jsonField('overrides', data.overrides));
    } else {
      // 通用 section: 整条 JSON
      return _renderField(_t('craftengine.jsonEditor'),
        '<textarea class="ce-input ce-json-field ce-json-whole" data-ce-field-json="__whole__" rows="6" spellcheck="false">' +
        _escHtml(JSON.stringify(data)) + '</textarea>',
        _t('craftengine.jsonEditorHint'));
    }

    // 未建模字段: 逐键 JSON 编辑 (选项卡类型 → 附加到"其他"选项卡)
    var rest = [];
    for (var i = 0; i < keys.length; i++) {
      if (!used[keys[i]]) rest.push(keys[i]);
    }
    if (rest.length > 0) {
      var restHtml = '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.otherFields')) + ' (' + rest.length + ')</div>';
      for (var r = 0; r < rest.length; r++) {
        restHtml += _renderField(_escHtml(rest[r]), _jsonField(rest[r], data[rest[r]]));
      }
      restHtml += '</div>';
      if (TABBED_TYPES[type]) tabs.other = restHtml;
      else html += restHtml;
    }
    if (TABBED_TYPES[type]) {
      tabs.basic = keyField + tabs.basic;
      return _renderTabsHtml(tabs, formTab);
    }
    return keyField + html;
  }

  // ---- 选项卡表单 ----
  function _renderTabsHtml(tabs, activeTab) {
    var order = [];
    if (tabs.basic !== '') order.push(['basic', _t('craftengine.tabBasic')]);
    if (tabs.model !== '') order.push(['model', _t('craftengine.tabModel')]);
    if (tabs.itemData !== '') order.push(['itemData', _t('craftengine.tabItemData')]);
    if (tabs.behavior !== '') order.push(['behavior', _t('craftengine.tabBehavior')]);
    if (tabs.events !== '') order.push(['events', _t('craftengine.tabEvents')]);
    if (tabs.other !== '') order.push(['other', _t('craftengine.otherFields')]);
    if (!order.length) return tabs.basic || tabs.events || '';
    var idx = 0;
    for (var i = 0; i < order.length; i++) {
      if (order[i][0] === activeTab) { idx = i; break; }
    }
    var bar = '<div class="ce-tabs">';
    for (var j = 0; j < order.length; j++) {
      bar += '<button class="cv-btn cv-btn-sm ce-tab-btn' + (j === idx ? ' active' : '') + '" data-action="ce-tab" data-ce-tab="' + order[j][0] + '">' +
        _escHtml(order[j][1]) + '</button>';
    }
    bar += '</div>';
    var panels = '';
    for (var k = 0; k < order.length; k++) {
      panels += '<div class="ce-tab-panel' + (k === idx ? ' ce-tab-active' : '') + '" data-ce-tabpanel="' + order[k][0] + '">' + tabs[order[k][0]] + '</div>';
    }
    return bar + panels;
  }

  // ---- 事件选项卡: 列表 + 子页面 ----
  function _eventsPanel(entry, evKey) {
    var evs = entry.data.events;
    var isArr = Array.isArray(evs);
    var isMap = evs && typeof evs === 'object' && !Array.isArray(evs);
    if (evKey !== undefined && evKey !== null && evKey !== '') {
      if (isArr) {
        var iIdx = parseInt(evKey, 10);
        if (!isNaN(iIdx) && evs[iIdx] !== undefined) {
          return _eventsSubHtml(entry, String(iIdx), evs[iIdx], true);
        }
      } else if (isMap && evs[evKey] !== undefined) {
        return _eventsSubHtml(entry, evKey, evs[evKey], false);
      }
    }
    // 列表视图
    var html = '<div class="ce-events-header">' +
      '<span class="ce-events-title">' + _escHtml(_t('craftengine.eventsCount', { count: isArr ? evs.length : (isMap ? Object.keys(evs).length : 0) })) + '</span>' +
      '<button class="cv-btn cv-btn-primary cv-btn-sm" data-action="ce-add-event">' + _escHtml(_t('craftengine.eventsAdd')) + '</button>' +
      '</div>';
    if (isArr) {
      for (var i = 0; i < evs.length; i++) {
        var item = evs[i];
        var label = item && typeof item === 'object' ? (item.on !== undefined ? (Array.isArray(item.on) ? item.on.join(', ') : String(item.on)) : String(i + 1)) : String(i + 1);
        html += _eventRow(String(i), label);
      }
    } else if (isMap) {
      var mk = Object.keys(evs);
      for (var m = 0; m < mk.length; m++) {
        html += _eventRow(mk[m], mk[m]);
      }
    } else {
      html += '<div class="ce-events-empty">' + _escHtml(_t('craftengine.eventsEmpty')) + '</div>';
    }
    return html;
  }
  function _eventRow(evKey, label) {
    return '<div class="ce-event-item">' +
      '<span class="ce-event-name" data-action="ce-open-event" data-ce-ev="' + _escHtml(evKey) + '">' + _escHtml(label) + '</span>' +
      '<button class="cv-btn cv-btn-danger cv-btn-sm ce-event-del" data-action="ce-del-event" data-ce-ev="' + _escHtml(evKey) + '">✕</button>' +
      '</div>';
  }
  function _eventsSubHtml(entry, evKey, item, isArr) {
    var html = '<button class="cv-btn cv-btn-secondary cv-btn-sm ce-ev-back" data-action="ce-ev-back">' + _escHtml(_t('craftengine.eventsBack')) + '</button>';
    if (!_sfSchemas) {
      html += _renderField(_t('craftengine.eventsTrigger'), _linesScalarField('events.' + evKey + '.on', _getNested(entry.data, 'events.' + evKey + '.on'), 'right_click（多行 = 多个触发器）'));
      html += _renderField(_t('craftengine.eventsFunctions'), _jsonField('events.' + evKey + '.functions', _getNested(entry.data, 'events.' + evKey + '.functions'), null, '[{"type":"command","command":"say hi"}]'));
      html += _renderField(_t('craftengine.jsonEditor'), _jsonField('events.' + evKey, item, ['on', 'functions']));
      return html;
    }
    _sfInit();
    if (isArr) {
      var p = 'events.' + evKey;
      html += _sfFieldHtml({
        type: 'linesScalar', label: _sfL(_t('craftengine.eventsTrigger'), _t('craftengine.eventsTrigger')),
        hint: _t('craftengine.eventsTriggerHint'), placeholder: _t('craftengine.eventsTriggerPh'),
      }, p + '.on', item ? item.on : undefined);
      html += _sfFieldHtml({
        type: 'listOf', label: _sfL(_t('craftengine.eventsFunctions'), _t('craftengine.eventsFunctions')),
        hint: _t('craftengine.eventsFunctionsHint'),
        itemType: { type: 'union', types: _sfSchemas.functions },
      }, p + '.functions', item ? item.functions : undefined);
    } else {
      html += _sfFieldHtml({
        type: 'listOf', label: _sfL(_t('craftengine.eventsContent'), _t('craftengine.eventsContent')),
        hint: _t('craftengine.eventsFunctionsHint'),
        itemType: { type: 'union', types: _sfSchemas.functions, allowScalar: { type: 'text', placeholder: _t('craftengine.eventsScalarPh') } },
      }, 'events.' + evKey, item);
    }
    html += _sfDatalistHtml();
    return html;
  }

  function _renderFromParsed(containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    if (!parsed) return;

    // 全量重建会重置 .ce-entry-scroll 滚动位置, 选中远处条目后视口会跳回顶部
    var prevScroll = 0;
    var prevSection = ui.section;
    var scrollEl = containerEl.querySelector('.ce-entry-scroll');
    if (scrollEl) prevScroll = scrollEl.scrollTop;

    if (parsed.error) {
      containerEl.innerHTML =
        '<div class="cv-error-banner"><span class="cv-error-icon">⚠️</span><div>' +
        '<strong>' + _escHtml(_t('craftengine.yamlError')) + '</strong>' +
        '<p>' + _escHtml(parsed.error) + '</p>' +
        '<p>' + _escHtml(_t('craftengine.yamlErrorHint')) + '</p></div></div>';
      return;
    }

    if (ui.section >= parsed.sections.length) ui.section = 0;
    var section = parsed.sections[ui.section];
    if (section) {
      if (ui.entry >= section.entries.length) ui.entry = 0;
    } else {
      ui.entry = 0;
    }

    // 左1: sections
    var secHtml = '';
    for (var s = 0; s < parsed.sections.length; s++) {
      var sec = parsed.sections[s];
      secHtml += '<div class="ce-section-item' + (s === ui.section ? ' ce-active' : '') + '" data-action="ce-select-section" data-section="' + s + '">' +
        _escHtml(sec.key) + ' <span class="ce-count">' + sec.entries.length + '</span></div>';
    }
    if (parsed.sections.length === 0) {
      secHtml += '<div class="ce-empty">' + _escHtml(_t('craftengine.noSections')) + '</div>';
    }

    // 左2: 条目列表
    var entryHtml = '';
    var addBtnHtml = '';
    if (section) {
      for (var e = 0; e < section.entries.length; e++) {
        var en = section.entries[e];
        entryHtml += '<div class="ce-entry-item' + (e === ui.entry ? ' ce-active' : '') + '" data-action="ce-select-entry" data-entry="' + e + '">' +
          _escHtml(en.key) + '</div>';
      }
      if (section.entries.length === 0) {
        entryHtml += '<div class="ce-empty">' + _escHtml(_t('craftengine.noEntries')) + '</div>';
      }
      if (!parsed._isConfig) {
        addBtnHtml = '<button class="cv-btn cv-btn-secondary ce-add-btn" data-action="ce-add-entry">' +
          _escHtml(_t('craftengine.addEntry')) + '</button>';
      }
    }

    // 右: 表单
    var mainHtml = '';
    if (section && section.entries[ui.entry]) {
      var entry = section.entries[ui.entry];
      var typeName;
      if (section.base === 'config') typeName = _t('craftengine.type_config') + ' · ' + section.key;
      else typeName = TYPE_SECTIONS[section.base] ? _t('craftengine.type_' + TYPE_SECTIONS[section.base]) : _t('craftengine.type_generic');
      mainHtml =
        '<div class="ce-form-header">' +
        '<div class="ce-form-title">' + _escHtml(typeName) + '</div>' +
        '<div class="ce-form-actions">' +
        (parsed._isConfig ? '' :
          '<button class="cv-btn cv-btn-danger ce-rm-btn" data-action="ce-delete-entry">' + _escHtml(_t('craftengine.deleteEntry')) + '</button>') +
        '</div></div>' +
        '<div class="ce-form-body">' + _renderEntryForm(section, entry, ui.formTab, ui.evKey) + '</div>';
    } else if (section && section.entries.length === 0) {
      mainHtml = '<div class="ce-empty">' + _escHtml(_t('craftengine.emptySection')) + '</div>';
    } else {
      mainHtml = '<div class="ce-empty">' + _escHtml(_t('craftengine.selectEntry')) + '</div>';
    }

    containerEl.innerHTML =
      '<div class="ce-container">' +
      '<div class="ce-header">' +
      '<div class="ce-badge" id="ce-owner-badge">' + _escHtml(_t('craftengine.ownerLoading')) + '</div>' +
      '<div class="ce-toolbar">' +
      '<button class="cv-btn cv-btn-secondary" data-action="ce-sync">' + _escHtml(_t('craftengine.syncToSource')) + '</button>' +
      '<label class="ce-autosync"><input type="checkbox" id="ce-autosync"' + (ROOT.__keAutoSync ? ' checked' : '') + '> ' + _escHtml(_t('craftengine.autoSync')) + '</label>' +
      '</div></div>' +
      '<div class="ce-layout">' +
      '<div class="ce-sections">' + secHtml + '</div>' +
      '<div class="ce-entry-list">' + '<div class="ce-entry-scroll">' + entryHtml + '</div>' + addBtnHtml + '</div>' +
      '<div class="ce-main">' + mainHtml + '</div>' +
      '</div></div>';

    // 同 section 内重建时恢复条目列表滚动位置
    if (ui.section === prevSection && prevScroll > 0) {
      var sc = containerEl.querySelector('.ce-entry-scroll');
      if (sc) sc.scrollTop = prevScroll;
    }

    // 工程归属徽章（异步）
    var badge = containerEl.querySelector('#ce-owner-badge');
    if (badge) {
      resolveProjectRoot(containerEl._ceFilePath).then(function (r) {
        if (badge.isConnected && r && r.found) {
          badge.textContent = _t('craftengine.ownerBadge', {
            pack: r.namespace || '',
            root: r.pluginRoot || r.packRoot || '',
          });
        } else if (badge.isConnected) {
          badge.textContent = _t('craftengine.ownerNone');
        }
      });
    }
  }

  // ============ 事件绑定 ============
  function _applyValue(entry, path, value, parsed, section) {
    if (path === '__key__') return; // 由 ce-rename 处理
    if (path === '__whole__') {
      entry.data = value;
      entry._rawOrder = (value && typeof value === 'object' && !Array.isArray(value)) ? Object.keys(value) : [];
      if (parsed && parsed._isConfig && section) parsed._fileLevelRaw[section.key] = value;
      _sfMarkDirty(parsed || _sfLastParsed);
      return;
    }
    var existed = _getNested(entry.data, path) !== undefined;
    if (value === undefined || value === null || value === '') {
      if (existed) {
        _deleteNested(entry.data, path);
        _sfMarkDirty(parsed || _sfLastParsed);
      }
      return;
    }
    if (!existed) {
      // 记录新键序
      var topKey = _pathParts(path)[0];
      if (entry._rawOrder.indexOf(topKey) === -1) entry._rawOrder.push(topKey);
    }
    _setNested(entry.data, path, value);
    _sfMarkDirty(parsed || _sfLastParsed);
  }
  // union 切到简单值: 存空串 (不走 _applyValue 的空值删除), 让输入框出现
  function _sfSetScalar(entry, path) {
    if (_getNested(entry.data, path) === undefined) {
      var tk = _pathParts(path)[0];
      if (entry._rawOrder.indexOf(tk) === -1) entry._rawOrder.push(tk);
    }
    _setNested(entry.data, path, '');
    _sfMarkDirty(_sfLastParsed);
  }

  function _bindEvents(containerEl) {
    var clickHandler = function (e) {
      var el = e.target.closest ? e.target.closest('[data-action], [data-sf-action]') : null;
      if (!el) return;
      var action = el.getAttribute('data-action');
      var parsed = containerEl._ceParsed;
      var ui = containerEl._ceUi;
      if (!parsed || !ui) return;

      // schema 按钮动作 (list/map/union; select 类动作由 change 事件触发)
      var sfAction = el.getAttribute('data-sf-action');
      if (sfAction && el.tagName !== 'SELECT') {
        _sound('click');
        _sfHandleAction(sfAction, el, containerEl);
        return;
      }

      if (action === 'ce-select-section') {
        _sound('click');
        ui.section = parseInt(el.getAttribute('data-section'), 10);
        ui.entry = 0;
        _ceRenderFn();
      } else if (action === 'ce-select-entry') {
        _sound('click');
        ui.entry = parseInt(el.getAttribute('data-entry'), 10);
        _ceRenderFn();
      } else if (action === 'ce-sync') {
        _sound('click');
        syncToSource(parsed);
      } else if (action === 'ce-add-entry') {
        _sound('click');
        _showAddEntryModal(containerEl);
      } else if (action === 'ce-delete-entry') {
        _sound('click');
        _showDeleteConfirm(containerEl);
      } else if (action === 'ce-tab') {
        _sound('click');
        var tab = el.getAttribute('data-ce-tab');
        ui.formTab = tab;
        var btns = containerEl.querySelectorAll('[data-action="ce-tab"]');
        for (var b = 0; b < btns.length; b++) btns[b].classList.toggle('active', btns[b] === el);
        var panels = containerEl.querySelectorAll('[data-ce-tabpanel]');
        for (var p = 0; p < panels.length; p++) {
          panels[p].classList.toggle('ce-tab-active', panels[p].getAttribute('data-ce-tabpanel') === tab);
        }
      } else if (action === 'ce-open-event') {
        _sound('click');
        ui.evKey = el.getAttribute('data-ce-ev');
        ui.formTab = 'events';
        _ceRenderFn();
      } else if (action === 'ce-ev-back') {
        _sound('click');
        ui.evKey = null;
        _ceRenderFn();
      } else if (action === 'ce-add-event') {
        _sound('click');
        _showAddEventModal(containerEl);
      } else if (action === 'ce-del-event') {
        _sound('click');
        _showEventDeleteConfirm(containerEl, el.getAttribute('data-ce-ev'));
      }
    };
    var changeHandler = function (e) {
      var target = e.target;
      if (!target || !target.getAttribute) return;
      var parsed = containerEl._ceParsed;
      var ui = containerEl._ceUi;
      if (!parsed || !ui || !parsed.sections[ui.section]) return;
      var section = parsed.sections[ui.section];
      var entry = section.entries[ui.entry];
      if (!entry) return;

      // ---- schema 表单 ----
      var sfAct = target.getAttribute('data-sf-action');
      if (sfAct) {
        _sfHandleAction(sfAct, target, containerEl);
        return;
      }
      var sfKind = target.getAttribute('data-sf-kind');
      if (sfKind) {
        var path = target.getAttribute('data-sf-path');
        var sfType = target.getAttribute('data-sf-type');
        if (sfKind === 'map-key') {
          var okey = target.getAttribute('data-sf-okey');
          var nkey = target.value.trim();
          if (!nkey) { target.classList.add('ce-invalid'); return; }
          var mkObj = path ? _getNested(entry.data, path) : entry.data;
          if (mkObj && typeof mkObj === 'object' && !Array.isArray(mkObj)) {
            if (nkey !== okey) {
              if (Object.prototype.hasOwnProperty.call(mkObj, nkey)) { target.classList.add('ce-invalid'); return; }
              mkObj[nkey] = mkObj[okey];
              delete mkObj[okey];
            }
          }
          target.classList.remove('ce-invalid');
          var muid = _sfUidOf(target);
          if (muid) _sfRerender(muid, containerEl);
          if (ROOT.__keAutoSync) syncToSource(parsed);
          return;
        }
        var val;
        if (path === '__whole__') {
          if (sfType === 'kv-whole') {
            var wr = _parseKvText(target.value);
            if (wr.bad) { target.classList.add('ce-invalid'); return; }
            target.classList.remove('ce-invalid');
            _applyValue(entry, '__whole__', wr.obj, parsed, section);
          } else if (sfType === 'whole-bool') {
            _applyValue(entry, '__whole__', target.checked, parsed, section);
          } else if (sfType === 'whole-number') {
            var wn = parseFloat(target.value);
            _applyValue(entry, '__whole__', isNaN(wn) ? undefined : wn, parsed, section);
          } else {
            _applyValue(entry, '__whole__', target.value, parsed, section);
          }
          if (ROOT.__keAutoSync) syncToSource(parsed);
          return;
        }
        if (sfType === 'number') {
          var n2 = parseFloat(target.value);
          val = isNaN(n2) ? undefined : n2;
        } else if (sfType === 'bool') {
          val = target.checked;
        } else if (sfType === 'lines') {
          var la = target.value.split('\n').map(function (l) { return l.replace(/\r$/, ''); })
            .filter(function (l) { return l.trim() !== ''; });
          val = la.length ? la : undefined;
        } else if (sfType === 'lines-scalar') {
          var lsa = target.value.split('\n').map(function (l) { return l.replace(/\r$/, ''); })
            .filter(function (l) { return l.trim() !== ''; });
          val = lsa.length > 1 ? lsa : (lsa.length === 1 ? lsa[0] : undefined);
        } else if (sfType === 'kv' || sfType === 'kv-rest') {
          var kr = _parseKvText(target.value);
          if (kr.bad) { target.classList.add('ce-invalid'); return; }
          target.classList.remove('ce-invalid');
          if (sfType === 'kv-rest') {
            var excl = (target.getAttribute('data-sf-exclude') || '').split(',').filter(Boolean);
            var curObj = path ? _getNested(entry.data, path) : entry.data;
            var next = {};
            if (curObj && typeof curObj === 'object' && !Array.isArray(curObj)) {
              Object.keys(curObj).forEach(function (k) {
                if (excl.indexOf(k) !== -1) next[k] = curObj[k];
              });
            }
            Object.keys(kr.obj).forEach(function (k) { next[k] = kr.obj[k]; });
            if (!path) _applyValue(entry, '__whole__', next, parsed, section);
            else _applyValue(entry, path, next, parsed, section);
          } else {
            val = Object.keys(kr.obj).length ? kr.obj : undefined;
          }
        } else if (sfType === 'scalar') {
          val = _parseKvLine(target.value);
        } else if (sfType === 'select') {
          val = target.getAttribute('data-sf-num') ? parseFloat(target.value) : target.value;
        } else {
          val = target.value;
        }
        if (val !== undefined || sfType === 'kv' || sfType === 'kv-rest') {
          if (val !== undefined) _applyValue(entry, path, val, parsed, section);
        }
        if (ROOT.__keAutoSync) syncToSource(parsed);
        return;
      }

      var field = target.getAttribute('data-ce-field');
      if (field) {
        if (field === '__key__') return; // 由 ce-rename 处理
        var type = target.getAttribute('data-ce-type');
        if (type === 'number') {
          var n = parseFloat(target.value);
          _applyValue(entry, field, isNaN(n) ? undefined : n);
        } else if (type === 'bool') {
          _applyValue(entry, field, target.checked);
        } else if (type === 'lines') {
          var arr = target.value.split('\n').map(function (l) { return l.replace(/\r$/, ''); })
            .filter(function (l) { return l.trim() !== ''; });
          _applyValue(entry, field, arr.length ? arr : undefined);
        } else if (type === 'kv') {
          var obj = {};
          var bad = null;
          var lns = target.value.split('\n');
          for (var i = 0; i < lns.length; i++) {
            var ln = lns[i].replace(/\r$/, '');
            if (!ln.trim()) continue;
            var idx = ln.indexOf(':');
            if (idx <= 0) { bad = lns[i]; break; }
            var k = ln.slice(0, idx).trim();
            var v = ln.slice(idx + 1).trim();
            var parsedV = v;
            if (/^[\[{"]/.test(v)) {
              try { parsedV = JSON.parse(v); } catch (err) { parsedV = v; }
            }
            obj[k] = parsedV;
          }
          if (bad) {
            target.classList.add('ce-invalid');
            return;
          }
          target.classList.remove('ce-invalid');
          _applyValue(entry, field, Object.keys(obj).length ? obj : undefined);
        } else if (type === 'lines-scalar') {
          var ls = target.value.split('\n').map(function (l) { return l.replace(/\r$/, ''); })
            .filter(function (l) { return l.trim() !== ''; });
          _applyValue(entry, field, ls.length > 1 ? ls : (ls.length === 1 ? ls[0] : undefined));
        } else if (type === 'lines-json') {
          var lj = [];
          var ljBad = null;
          var ljs = target.value.split('\n');
          for (var j = 0; j < ljs.length; j++) {
            var l = ljs[j].replace(/\r$/, '').trim();
            if (!l) continue;
            if (/^[\[{"']/.test(l)) {
              try { lj.push(JSON.parse(l)); } catch (err) { ljBad = ljs[j]; break; }
            } else lj.push(l);
          }
          if (ljBad) { target.classList.add('ce-invalid'); return; }
          target.classList.remove('ce-invalid');
          _applyValue(entry, field, lj.length ? lj : undefined);
        } else if (type === 'whole-text') {
          _applyValue(entry, '__whole__', target.value, parsed, section);
        } else if (type === 'kv-whole') {
          var kw = {};
          var kwBad = null;
          var kls = target.value.split('\n');
          for (var k2 = 0; k2 < kls.length; k2++) {
            var kl = kls[k2].replace(/\r$/, '');
            if (!kl.trim()) continue;
            var kIdx = kl.indexOf(':');
            if (kIdx <= 0) { kwBad = kls[k2]; break; }
            var kk = kl.slice(0, kIdx).trim();
            var kvv = kl.slice(kIdx + 1).trim();
            var pv = kvv;
            if (/^[\[{"]/.test(kvv)) {
              try { pv = JSON.parse(kvv); } catch (err) { pv = kvv; }
            }
            kw[kk] = pv;
          }
          if (kwBad) { target.classList.add('ce-invalid'); return; }
          target.classList.remove('ce-invalid');
          _applyValue(entry, '__whole__', kw, parsed, section);
        } else {
          _applyValue(entry, field, target.value);
        }
        if (ROOT.__keAutoSync) syncToSource(parsed);
        return;
      }

      var jsonField = target.getAttribute('data-ce-field-json');
      if (jsonField) {
        var exclude = target.getAttribute('data-json-exclude');
        var excl = exclude ? exclude.split(',') : [];
        var current = _getNested(entry.data, jsonField);
        var newVal = null;
        try {
          newVal = JSON.parse(target.value);
        } catch (err) {
          target.classList.add('ce-invalid');
          return;
        }
        target.classList.remove('ce-invalid');
        if (jsonField === '__whole__') {
          _applyValue(entry, '__whole__', newVal, parsed, section);
          _ceRenderFn();
          return;
        }
        if (excl.length && current && typeof current === 'object' && !Array.isArray(current) &&
          newVal && typeof newVal === 'object' && !Array.isArray(newVal)) {
          for (var x = 0; x < excl.length; x++) {
            if (current[excl[x]] !== undefined) newVal[excl[x]] = current[excl[x]];
          }
        }
        _applyValue(entry, jsonField, newVal);
        if (ROOT.__keAutoSync) syncToSource(parsed);
      }
    };
    var keyChangeHandler = function (e) {
      var target = e.target;
      if (!target || target.getAttribute('data-ce-field') !== '__key__') return;
      var parsed = containerEl._ceParsed;
      var ui = containerEl._ceUi;
      if (!parsed || !ui || !parsed.sections[ui.section]) return;
      var section = parsed.sections[ui.section];
      if (parsed._isConfig) return; // config 伪 section 键不可编辑
      var entry = section.entries[ui.entry];
      if (!entry) return;
      var newKey = target.value.trim();
      if (!newKey) return;
      var keyOnly = !!KEY_ONLY_SECTIONS[section.key];
      var valid = keyOnly ? KEY_ONLY_RE.test(newKey) :
        (NS_RE.test(newKey.split(':')[0] || '') && PATH_RE.test(newKey.split(':')[1] || '') && newKey.indexOf(':') !== -1);
      if (!valid) {
        target.classList.add('ce-invalid');
        return;
      }
      for (var i = 0; i < section.entries.length; i++) {
        if (i !== ui.entry && section.entries[i].key === newKey) {
          target.classList.add('ce-invalid');
          return;
        }
      }
      target.classList.remove('ce-invalid');
      if (entry.key !== newKey) {
        entry.key = newKey;
        _sfMarkDirty(parsed);
        _ceRenderFn();
      }
    };
    var autoSyncHandler = function (e) {
      if (e.target && e.target.id === 'ce-autosync') {
        ROOT.__keAutoSync = e.target.checked;
      }
    };

    containerEl.addEventListener('click', clickHandler);
    containerEl.addEventListener('change', changeHandler);
    containerEl.addEventListener('change', keyChangeHandler);
    containerEl.addEventListener('change', autoSyncHandler);
    containerEl._ceClickHandler = clickHandler;
    containerEl._ceChangeHandler = changeHandler;
    containerEl._ceKeyChangeHandler = keyChangeHandler;
    containerEl._ceAutoSyncHandler = autoSyncHandler;
  }

  function _ceRenderFn() {
    if (ROOT._ceRenderFn) ROOT._ceRenderFn();
  }

  // ---- 新建条目弹窗 ----
  function _showAddEntryModal(containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var section = parsed.sections[ui.section];
    if (!section) return;
    var old = document.getElementById('ce-add-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ce-add-modal';
    modal.className = 'cv-modal';
    var secOptions = parsed.sections.map(function (s, i) {
      return '<option value="' + i + '"' + (i === ui.section ? ' selected' : '') + '>' + _escHtml(s.key) + '</option>';
    }).join('');
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content">' +
      '<h3>' + _escHtml(_t('craftengine.newEntryTitle')) + '</h3>' +
      '<div class="cv-modal-field"><label>' + _escHtml(_t('craftengine.section')) + '</label>' +
      '<select id="ce-add-section" class="cv-select cv-select-lg">' + secOptions + '</select></div>' +
      '<div class="cv-modal-field" id="ce-add-ns-field"><label>' + _escHtml(_t('craftengine.entryNamespace')) + '</label>' +
      '<input id="ce-add-ns" class="cv-input" placeholder="kangelitem" spellcheck="false"></div>' +
      '<div class="cv-modal-field" id="ce-add-path-field"><label>' + _escHtml(_t('craftengine.entryPath')) + '</label>' +
      '<input id="ce-add-path" class="cv-input" placeholder="white_horse" spellcheck="false"></div>' +
      '<div class="cv-modal-field" id="ce-add-id-field" style="display:none;"><label>' + _escHtml(_t('craftengine.entryId')) + '</label>' +
      '<input id="ce-add-id" class="cv-input" placeholder="my_variable" spellcheck="false">' +
      '<div class="ce-field-hint">' + _escHtml(_t('craftengine.keyOnlyHint')) + '</div></div>' +
      '<div class="cv-modal-field" id="ce-add-err" style="display:none;color:var(--color-error);font-size:12px;"></div>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" id="ce-add-cancel">' + _escHtml(_t('common.close')) + '</button>' +
      '<button class="cv-btn cv-btn-primary" id="ce-add-confirm">' + _escHtml(_t('craftengine.confirmAdd')) + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    var errEl = document.getElementById('ce-add-err');
    function showErr(msg) { errEl.textContent = msg; errEl.style.display = ''; }
    var secSel = document.getElementById('ce-add-section');
    var nsWrap = document.getElementById('ce-add-ns-field');
    var pathWrap = document.getElementById('ce-add-path-field');
    var idWrap = document.getElementById('ce-add-id-field');
    function syncKeyFields() {
      var s = parsed.sections[parseInt(secSel.value, 10)];
      var ko = !!(s && KEY_ONLY_SECTIONS[s.key]);
      nsWrap.style.display = ko ? 'none' : '';
      pathWrap.style.display = ko ? 'none' : '';
      idWrap.style.display = ko ? '' : 'none';
    }
    secSel.addEventListener('change', syncKeyFields);
    syncKeyFields();
    document.getElementById('ce-add-confirm').addEventListener('click', function () {
      var secIdx = parseInt(secSel.value, 10);
      var target = parsed.sections[secIdx];
      var key;
      if (KEY_ONLY_SECTIONS[target.key]) {
        var id = document.getElementById('ce-add-id').value.trim();
        if (!KEY_ONLY_RE.test(id)) { showErr(_t('craftengine.entryIdInvalid')); return; }
        key = id;
      } else {
        var ns = document.getElementById('ce-add-ns').value.trim();
        var p = document.getElementById('ce-add-path').value.trim();
        if (!NS_RE.test(ns)) { showErr(_t('craftengine.entryNamespaceInvalid')); return; }
        if (!PATH_RE.test(p)) { showErr(_t('craftengine.entryPathInvalid')); return; }
        key = ns + ':' + p;
      }
      for (var i = 0; i < target.entries.length; i++) {
        if (target.entries[i].key === key) { showErr(_t('craftengine.entryExists', { key: key })); return; }
      }
      target.entries.push({ key: key, data: {}, _rawOrder: [] });
      _sfMarkDirty(parsed);
      ui.section = secIdx;
      ui.entry = target.entries.length - 1;
      modal.remove();
      _ceRenderFn();
    });
    document.getElementById('ce-add-cancel').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === this) modal.remove(); });
  }

  // ---- 删除确认弹窗 ----
  function _showDeleteConfirm(containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var section = parsed.sections[ui.section];
    var entry = section && section.entries[ui.entry];
    if (!entry) return;
    var old = document.getElementById('ce-del-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ce-del-modal';
    modal.className = 'cv-modal';
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content">' +
      '<h3>' + _escHtml(_t('craftengine.deleteConfirmTitle')) + '</h3>' +
      '<p class="cv-modal-desc">' + _escHtml(_t('craftengine.deleteConfirmMsg', { key: entry.key })) + '</p>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" id="ce-del-cancel">' + _escHtml(_t('common.close')) + '</button>' +
      '<button class="cv-btn cv-btn-danger" id="ce-del-confirm">' + _escHtml(_t('craftengine.confirmDelete')) + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    document.getElementById('ce-del-confirm').addEventListener('click', function () {
      section.entries.splice(ui.entry, 1);
      _sfMarkDirty(parsed);
      if (ui.entry >= section.entries.length) ui.entry = Math.max(0, section.entries.length - 1);
      modal.remove();
      _ceRenderFn();
    });
    document.getElementById('ce-del-cancel').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === this) modal.remove(); });
  }

  // ---- 新建事件弹窗 ----
  function _showAddEventModal(containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var section = parsed.sections[ui.section];
    var entry = section && section.entries[ui.entry];
    if (!entry) return;
    var old = document.getElementById('ce-ev-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ce-ev-modal';
    modal.className = 'cv-modal';
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content">' +
      '<h3>' + _escHtml(_t('craftengine.newEventTitle')) + '</h3>' +
      '<div class="cv-modal-field"><label>' + _escHtml(_t('craftengine.eventsTrigger')) + '</label>' +
      '<input id="ce-ev-name" class="cv-input" placeholder="right_click" spellcheck="false">' +
      '<div class="ce-field-hint">' + _escHtml(_t('craftengine.newEventHint')) + '</div></div>' +
      '<div class="cv-modal-field" id="ce-ev-err" style="display:none;color:var(--color-error);font-size:12px;"></div>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" id="ce-ev-cancel">' + _escHtml(_t('common.close')) + '</button>' +
      '<button class="cv-btn cv-btn-primary" id="ce-ev-confirm">' + _escHtml(_t('craftengine.confirmAdd')) + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    var errEl = document.getElementById('ce-ev-err');
    function showErr(msg) { errEl.textContent = msg; errEl.style.display = ''; }
    document.getElementById('ce-ev-confirm').addEventListener('click', function () {
      var name = document.getElementById('ce-ev-name').value.trim();
      if (!name) { showErr(_t('craftengine.eventsTriggerRequired')); return; }
      var evs = entry.data.events;
      if (!evs || typeof evs !== 'object') {
        entry.data.events = [];
        evs = entry.data.events;
        if (entry._rawOrder.indexOf('events') === -1) entry._rawOrder.push('events');
      }
      var triggers = name.split(/[\s,]+/).filter(function (t) { return t !== ''; });
      var onVal = triggers.length > 1 ? triggers : triggers[0];
      if (Array.isArray(evs)) {
        for (var i = 0; i < evs.length; i++) {
          var e2 = evs[i];
          if (e2 && typeof e2 === 'object' && (Array.isArray(e2.on) ? e2.on.join(' ') : String(e2.on)) === (Array.isArray(onVal) ? onVal.join(' ') : onVal)) {
            showErr(_t('craftengine.eventExists', { name: name })); return;
          }
        }
        evs.push({ on: onVal, functions: [] });
        ui.evKey = String(evs.length - 1);
      } else {
        if (evs[name] !== undefined) { showErr(_t('craftengine.eventExists', { name: name })); return; }
        evs[name] = [];
        ui.evKey = name;
      }
      _sfMarkDirty(parsed);
      ui.formTab = 'events';
      modal.remove();
      _ceRenderFn();
    });
    document.getElementById('ce-ev-cancel').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === this) modal.remove(); });
  }

  // ---- 删除事件确认 ----
  function _showEventDeleteConfirm(containerEl, evKey) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var section = parsed.sections[ui.section];
    var entry = section && section.entries[ui.entry];
    if (!entry || evKey === null) return;
    var old = document.getElementById('ce-evd-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ce-evd-modal';
    modal.className = 'cv-modal';
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content">' +
      '<h3>' + _escHtml(_t('craftengine.deleteConfirmTitle')) + '</h3>' +
      '<p class="cv-modal-desc">' + _escHtml(_t('craftengine.eventDeleteMsg', { name: evKey })) + '</p>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" id="ce-evd-cancel">' + _escHtml(_t('common.close')) + '</button>' +
      '<button class="cv-btn cv-btn-danger" id="ce-evd-confirm">' + _escHtml(_t('craftengine.confirmDelete')) + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    document.getElementById('ce-evd-confirm').addEventListener('click', function () {
      var evs = entry.data.events;
      if (Array.isArray(evs)) {
        var i = parseInt(evKey, 10);
        if (!isNaN(i) && i >= 0 && i < evs.length) evs.splice(i, 1);
      } else if (evs && typeof evs === 'object') {
        delete evs[evKey];
      }
      _sfMarkDirty(parsed);
      ui.evKey = null;
      modal.remove();
      _ceRenderFn();
    });
    document.getElementById('ce-evd-cancel').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === this) modal.remove(); });
  }

  // ============ 主入口 ============
  function render(filePath, content, containerEl, opts) {
    opts = opts || {};
    if (containerEl._ceClickHandler) {
      containerEl.removeEventListener('click', containerEl._ceClickHandler);
      containerEl.removeEventListener('change', containerEl._ceChangeHandler);
      containerEl.removeEventListener('change', containerEl._ceKeyChangeHandler);
      containerEl.removeEventListener('change', containerEl._ceAutoSyncHandler);
      containerEl._ceClickHandler = null;
      containerEl._ceChangeHandler = null;
      containerEl._ceKeyChangeHandler = null;
      containerEl._ceAutoSyncHandler = null;
    }
    var parsed = parse(content);
    var fname2 = String(filePath || '').replace(/\\/g, '/').split('/').pop() || '';
    if (_looksLikeCeConfig(fname2, content)) {
      parsed._isConfig = true;
      _projectConfigSections(parsed);
    }
    parsed._visualDirty = false;
    _sfLastParsed = parsed;
    containerEl._ceParsed = parsed;
    containerEl._ceFilePath = filePath;
    if (!containerEl._ceUi) containerEl._ceUi = { section: 0, entry: 0 };
    ROOT._ceRenderFn = function () { _renderFromParsed(containerEl); };
    _bindEvents(containerEl);
    _sfBindHintIcons();
    _renderFromParsed(containerEl);
    return parsed;
  }

  // ============ 公共 API ============
  ROOT.CraftEngineInterpreter = {
    TYPES: ['craftengine'],
    SECTION_KEYS: SECTION_KEYS,
    detectFileType: detectFileType,
    resolveProjectRoot: resolveProjectRoot,
    parse: parse,
    render: render,
    generateYAML: generateYAML,
    syncToSource: syncToSource,
  };
})();
