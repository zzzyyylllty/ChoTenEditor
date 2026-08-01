/* ChoTenEditor CraftEngine (CE) 配置 Schema 定义
 * 依赖: 无 (纯数据 + 小型构建助手)。在 craftengine-interpreter.js 之前加载。
 * 数据源: CraftEngine 官方 Wiki (docs/configuration + docs/reference)
 * 结构: window.CESchemas = { constants, conditions, functions, loot, sections, ... }
 * 字段类型 (由 interpreter 表单引擎消费):
 *   text / number / bool / select / textarea / miniText / lines / linesScalar / kv /
 *   listOf / mapOf / union / idRef / sound / vec3 / color / events / obj / wholeText / kvWhole
 * union 扩展项: noTypeKey(值不带 type 字段) / allowScalar(值可为标量) / negatable(生成 !type 选项)
 *   / types.{k}.widget(以其它 widget 渲染该类型体) / sharedKeys(切换类型时保留的公共键)
 */
(function () {
  'use strict';
  var ROOT = typeof window !== 'undefined' ? window : globalThis;
  var S = {};

  function l(zh, en) { return { zh: zh, en: en }; }
  function f(key, zh, en, type, extra) {
    var o = extra || {};
    o.key = key;
    o.label = l(zh, en);
    if (type) o.type = type;
    return o;
  }

  // ============ 常量 ============
  S.constants = {
    // 常用原版物品 (datalist 数据源, 不完全)
    vanillaItems: [
      'minecraft:air', 'minecraft:stone', 'minecraft:granite', 'minecraft:diorite', 'minecraft:andesite',
      'minecraft:deepslate', 'minecraft:cobblestone', 'minecraft:dirt', 'minecraft:grass_block',
      'minecraft:sand', 'minecraft:gravel', 'minecraft:oak_log', 'minecraft:spruce_log',
      'minecraft:birch_log', 'minecraft:jungle_log', 'minecraft:acacia_log', 'minecraft:dark_oak_log',
      'minecraft:mangrove_log', 'minecraft:cherry_log', 'minecraft:oak_planks', 'minecraft:spruce_planks',
      'minecraft:birch_planks', 'minecraft:jungle_planks', 'minecraft:acacia_planks',
      'minecraft:dark_oak_planks', 'minecraft:mangrove_planks', 'minecraft:cherry_planks',
      'minecraft:oak_leaves', 'minecraft:spruce_leaves', 'minecraft:birch_leaves', 'minecraft:jungle_leaves',
      'minecraft:acacia_leaves', 'minecraft:dark_oak_leaves', 'minecraft:mangrove_leaves',
      'minecraft:cherry_leaves', 'minecraft:glass', 'minecraft:obsidian', 'minecraft:bedrock',
      'minecraft:brick', 'minecraft:stone_bricks', 'minecraft:nether_brick', 'minecraft:netherrack',
      'minecraft:soul_sand', 'minecraft:end_stone', 'minecraft:purpur_block', 'minecraft:prismarine',
      'minecraft:sea_lantern', 'minecraft:glowstone', 'minecraft:redstone_lamp', 'minecraft:iron_block',
      'minecraft:gold_block', 'minecraft:diamond_block', 'minecraft:emerald_block', 'minecraft:netherite_block',
      'minecraft:redstone_block', 'minecraft:lapis_block', 'minecraft:copper_block', 'minecraft:amethyst_block',
      'minecraft:note_block', 'minecraft:mushroom_stem', 'minecraft:red_mushroom_block',
      'minecraft:brown_mushroom_block', 'minecraft:oak_sapling', 'minecraft:spruce_sapling',
      'minecraft:birch_sapling', 'minecraft:jungle_sapling', 'minecraft:acacia_sapling',
      'minecraft:dark_oak_sapling', 'minecraft:cherry_sapling', 'minecraft:cactus', 'minecraft:sugar_cane',
      'minecraft:bamboo', 'minecraft:vine', 'minecraft:lily_pad', 'minecraft:kelp', 'minecraft:seagrass',
      'minecraft:chorus_flower', 'minecraft:paper', 'minecraft:stick', 'minecraft:bone', 'minecraft:bone_meal',
      'minecraft:feather', 'minecraft:flint', 'minecraft:string', 'minecraft:leather', 'minecraft:rabbit_hide',
      'minecraft:slime_ball', 'minecraft:clay_ball', 'minecraft:gunpowder', 'minecraft:blaze_rod',
      'minecraft:blaze_powder', 'minecraft:ender_pearl', 'minecraft:ender_eye', 'minecraft:ghast_tear',
      'minecraft:magma_cream', 'minecraft:nether_star', 'minecraft:experience_bottle', 'minecraft:book',
      'minecraft:enchanted_book', 'minecraft:book_written', 'minecraft:name_tag', 'minecraft:map',
      'minecraft:compass', 'minecraft:clock', 'minecraft:recovery_compass', 'minecraft:torch',
      'minecraft:soul_torch', 'minecraft:lantern', 'minecraft:soul_lantern', 'minecraft:sea_pickle',
      'minecraft:glass_bottle', 'minecraft:water_bucket', 'minecraft:lava_bucket', 'minecraft:milk_bucket',
      'minecraft:bowl', 'minecraft:bow', 'minecraft:arrow', 'minecraft:spectral_arrow', 'minecraft:crossbow',
      'minecraft:shield', 'minecraft:fishing_rod', 'minecraft:carrot_on_a_stick', 'minecraft:elytra',
      'minecraft:trident', 'minecraft:wooden_sword', 'minecraft:stone_sword', 'minecraft:iron_sword',
      'minecraft:golden_sword', 'minecraft:diamond_sword', 'minecraft:netherite_sword',
      'minecraft:wooden_pickaxe', 'minecraft:stone_pickaxe', 'minecraft:iron_pickaxe',
      'minecraft:golden_pickaxe', 'minecraft:diamond_pickaxe', 'minecraft:netherite_pickaxe',
      'minecraft:wooden_axe', 'minecraft:stone_axe', 'minecraft:iron_axe', 'minecraft:golden_axe',
      'minecraft:diamond_axe', 'minecraft:netherite_axe', 'minecraft:wooden_shovel', 'minecraft:stone_shovel',
      'minecraft:iron_shovel', 'minecraft:golden_shovel', 'minecraft:diamond_shovel', 'minecraft:netherite_shovel',
      'minecraft:wooden_hoe', 'minecraft:stone_hoe', 'minecraft:iron_hoe', 'minecraft:golden_hoe',
      'minecraft:diamond_hoe', 'minecraft:netherite_hoe', 'minecraft:shears', 'minecraft:flint_and_steel',
      'minecraft:apple', 'minecraft:golden_apple', 'minecraft:enchanted_golden_apple', 'minecraft:bread',
      'minecraft:cooked_beef', 'minecraft:cooked_porkchop', 'minecraft:cooked_chicken',
      'minecraft:cooked_cod', 'minecraft:cooked_salmon', 'minecraft:cookie', 'minecraft:cake',
      'minecraft:pumpkin_pie', 'minecraft:sweet_berries', 'minecraft:glow_berries', 'minecraft:honey_bottle',
      'minecraft:golden_carrot', 'minecraft:carrot', 'minecraft:potato', 'minecraft:baked_potato',
      'minecraft:beetroot', 'minecraft:melon_slice', 'minecraft:chorus_fruit', 'minecraft:dried_kelp',
      'minecraft:coal', 'minecraft:charcoal', 'minecraft:iron_ingot', 'minecraft:gold_ingot',
      'minecraft:copper_ingot', 'minecraft:netherite_ingot', 'minecraft:diamond', 'minecraft:emerald',
      'minecraft:lapis_lazuli', 'minecraft:quartz', 'minecraft:amethyst_shard', 'minecraft:redstone',
      'minecraft:iron_nugget', 'minecraft:gold_nugget', 'minecraft:netherite_scrap', 'minecraft:echo_shard',
      'minecraft:leather_helmet', 'minecraft:leather_chestplate', 'minecraft:leather_leggings',
      'minecraft:leather_boots', 'minecraft:iron_helmet', 'minecraft:iron_chestplate',
      'minecraft:iron_leggings', 'minecraft:iron_boots', 'minecraft:golden_helmet', 'minecraft:golden_chestplate',
      'minecraft:golden_leggings', 'minecraft:golden_boots', 'minecraft:diamond_helmet',
      'minecraft:diamond_chestplate', 'minecraft:diamond_leggings', 'minecraft:diamond_boots',
      'minecraft:netherite_helmet', 'minecraft:netherite_chestplate', 'minecraft:netherite_leggings',
      'minecraft:netherite_boots', 'minecraft:turtle_helmet', 'minecraft:chainmail_helmet',
      'minecraft:chainmail_chestplate', 'minecraft:chainmail_leggings', 'minecraft:chainmail_boots',
      'minecraft:potion', 'minecraft:splash_potion', 'minecraft:lingering_potion', 'minecraft:spawn_egg',
      'minecraft:chest', 'minecraft:barrel', 'minecraft:furnace', 'minecraft:crafting_table', 'minecraft:anvil',
      'minecraft:enchanting_table', 'minecraft:brewing_stand', 'minecraft:beacon', 'minecraft:ender_chest',
      'minecraft:hopper', 'minecraft:dispenser', 'minecraft:dropper', 'minecraft:piston', 'minecraft:sticky_piston',
      'minecraft:lever', 'minecraft:redstone_torch', 'minecraft:redstone_lamp', 'minecraft:daylight_detector',
      'minecraft:repeater', 'minecraft:comparator', 'minecraft:target', 'minecraft:bell', 'minecraft:campfire',
      'minecraft:soul_campfire', 'minecraft:ladder', 'minecraft:oak_door', 'minecraft:iron_door',
      'minecraft:oak_trapdoor', 'minecraft:iron_trapdoor', 'minecraft:oak_fence', 'minecraft:oak_fence_gate',
      'minecraft:oak_slab', 'minecraft:oak_stairs', 'minecraft:oak_button', 'minecraft:stone_button',
      'minecraft:oak_pressure_plate', 'minecraft:stone_pressure_plate', 'minecraft:oak_sign',
      'minecraft:oak_hanging_sign', 'minecraft:item_frame', 'minecraft:painting', 'minecraft:armor_stand',
      'minecraft:minecart', 'minecraft:chest_minecart', 'minecraft:boat', 'minecraft:written_book',
      'minecraft:firework_rocket', 'minecraft:firework_star', 'minecraft:lead', 'minecraft:saddle',
      'minecraft:egg', 'minecraft:snowball', 'minecraft:ender_pearl', 'minecraft:heart_of_the_sea',
      'minecraft:nautilus_shell', 'minecraft:scute', 'minecraft:nether_wart', 'minecraft:poisonous_potato',
      'minecraft:spider_eye', 'minecraft:fermented_spider_eye', 'minecraft:blaze_cream', 'minecraft:rabbit_foot',
      'minecraft:phantom_membrane', 'minecraft:shulker_shell', 'minecraft:totem_of_undying',
      'minecraft:dragon_breath', 'minecraft:music_disc_13', 'minecraft:music_disc_cat',
      'minecraft:music_disc_pigstep', 'minecraft:goat_horn', 'minecraft:honeycomb', 'minecraft:beehive',
      'minecraft:honey_block', 'minecraft:slime_block', 'minecraft:ice', 'minecraft:packed_ice',
      'minecraft:blue_ice', 'minecraft:snow_block', 'minecraft:magma_block', 'minecraft:tnt',
      'minecraft:sponge', 'minecraft:wet_sponge', 'minecraft:bookshelf', 'minecraft:jukebox',
      'minecraft:note_block', 'minecraft:mushroom_stem', 'minecraft:shroomlight', 'minecraft:sculk',
      'minecraft:sculk_sensor', 'minecraft:sculk_shrieker', 'minecraft:sculk_catalyst', 'minecraft:sculk_vein',
      'minecraft:reinforced_deepslate', 'minecraft:echo_shard', 'minecraft:disc_fragment_5',
    ],
    equipmentSlots: ['head', 'chest', 'legs', 'feet', 'body', 'mainhand', 'offhand', 'saddle'],
    equipmentLayers: ['humanoid', 'humanoid_leggings', 'wings', 'wolf_body', 'horse_body', 'llama_body', 'pig_saddle', 'strider_saddle', 'camel_saddle', 'horse_saddle', 'donkey_saddle', 'mule_saddle', 'skeleton_horse_saddle', 'zombie_horse_saddle', 'happy_ghast_body', 'camel_husk_saddle', 'nautilus_body'],
    soundSources: ['music', 'master', 'record', 'weather', 'block', 'hostile', 'neutral', 'player', 'ambient', 'voice', 'ui'],
    pushReactions: ['NORMAL', 'DESTROY', 'BLOCK', 'IGNORE', 'PUSH_ONLY'],
    billboards: ['fixed', 'vertical', 'horizontal', 'center'],
    displayTransforms: ['none', 'third_person_left_hand', 'third_person_right_hand', 'first_person_left_hand', 'first_person_right_hand', 'head', 'gui', 'ground', 'fixed'],
    alignments: ['any', 'center', 'half', 'quarter', 'corner', 'center_quarter'],
    rotations: ['any', 'four', 'eight', 'sixteen', 'north', 'east', 'west', 'south'],
    hitboxDirections: ['UP', 'DOWN', 'NORTH', 'WEST', 'EAST', 'SOUTH'],
    glowColors: ['black', 'dark_blue', 'dark_green', 'dark_aqua', 'dark_red', 'dark_purple', 'gold', 'gray', 'dark_gray', 'blue', 'green', 'aqua', 'red', 'light_purple', 'yellow', 'white'],
    openWindowTypes: ['anvil', 'enchantment', 'grindstone', 'loom', 'smithing', 'crafting', 'cartography'],
    eventTriggers: ['break', 'place', 'right_click', 'left_click', 'consume', 'pick_up', 'attack', 'step'],
    equipmentTypes: ['component', 'trim'],
    lootSourceTypes: ['block_break', 'entity_death', 'fishing', 'piglin_barter', 'container', 'archaeology', 'entity_drop', 'harvest', 'shear_block', 'vault', 'advancement'],
    lootOverwrites: ['none', 'items', 'experience', 'all'],
    recipeTypes: ['shaped', 'shapeless', 'shaped_transform', 'shapeless_transform', 'smelting', 'blasting', 'smoking', 'campfire_cooking', 'stonecutting', 'smithing_transform', 'smithing_trim', 'brewing'],
    autoStateGroups: ['solid', 'note_block', 'mushroom_stem', 'red_mushroom_block', 'brown_mushroom_block', 'mushroom', 'tintable_leaves', 'waterlogged_tintable_leaves', 'non_tintable_leaves', 'waterlogged_non_tintable_leaves', 'leaves', 'waterlogged_leaves', 'lower_tripwire', 'higher_tripwire', 'tripwire', 'sapling', 'pressure_plate', 'cactus', 'sugar_cane', 'weeping_vine', 'twisting_vine', 'cave_vine', 'kelp', 'chorus'],
    blockPropertyTypes: ['boolean', 'int', 'axis', 'direction', 'horizontal_direction', 'half', 'hinge', 'slab_type', 'stairs_shape', 'string', 'rotation'],
    // 特殊属性名 → 自动旋转等硬编码行为
    specialPropertyNames: ['axis', 'facing', 'facing_clockwise', 'rotation', 'waterlogged'],
    instruments: ['BASEDRUM', 'SNARE', 'HAT', 'BASS', 'FLUTE', 'BELL', 'GUITAR', 'CHIME', 'XYLOPHONE', 'IRON_XYLOPHONE', 'COW_BELL', 'DIDGERIDOO', 'BIT', 'BANJO', 'PLING', 'HARP'],
    fluidStates: ['empty', 'water', 'lava'],
    attributeOperations: ['add_value', 'add_multiplied_base', 'add_multiplied_total'],
    attributeSlots: ['any', 'mainhand', 'offhand', 'hand', 'feet', 'legs', 'chest', 'head', 'body', 'saddle', 'equipment'],
  };

  // ============ 条件类型 (wiki reference/conditions.mdx) ============
  var COND_TYPES = {
    any_of: { label: l('任一满足 (any_of)', 'Any Of'), fields: [f('terms', '子条件', 'Terms', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES_REF }, label: l('子条件', 'Terms') })] },
    all_of: { label: l('全部满足 (all_of)', 'All Of'), fields: [f('terms', '子条件', 'Terms', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES_REF }, label: l('子条件', 'Terms') })] },
    inverted: { label: l('取反 (inverted)', 'Inverted'), fields: [f('term', '条件', 'Term', 'union', { types: COND_TYPES_REF, negatable: true, label: l('条件', 'Term') })] },
    falling_block: { label: l('方块坠落掉落', 'Falling Block') },
    survives_explosion: { label: l('爆炸存活', 'Survives Explosion') },
    has_item: { label: l('手中有物品', 'Has Item') },
    match_item: { label: l('匹配手中物品', 'Match Item'), fields: [f('id', '物品 ID', 'Item ID', 'linesScalar', { hint: l('单个 ID 或每行一个 ID', 'Single ID or one ID per line'), datalist: 'items' }), f('regex', '正则匹配', 'Regex', 'bool')] },
    match_block_property: { label: l('匹配方块属性', 'Match Block Property'), fields: [f('properties', '属性', 'Properties', 'mapOf', { valueType: { type: 'scalar' }, label: l('属性', 'Properties') })] },
    match_block: { label: l('匹配方块', 'Match Block'), fields: [f('id', '方块 ID', 'Block ID', 'text', { datalist: 'blocks' }), f('x', 'X', 'X', 'number'), f('y', 'Y', 'Y', 'number'), f('z', 'Z', 'Z', 'number'), f('regex', '正则匹配', 'Regex', 'bool')] },
    match_entity: { label: l('匹配实体', 'Match Entity'), fields: [f('id', '实体 ID', 'Entity ID', 'text'), f('regex', '正则匹配', 'Regex', 'bool')] },
    match_furniture_variant: { label: l('匹配家具变体', 'Match Furniture Variant'), fields: [f('variants', '变体', 'Variants', 'lines', { hint: l('每行一个变体名', 'One variant per line') })] },
    enchantment: { label: l('附魔检测', 'Enchantment'), fields: [f('predicate', '谓词', 'Predicate', 'text', { hint: l('如 minecraft:silk_touch>=1 (> >= = < <=)', 'e.g. minecraft:silk_touch>=1') })] },
    table_bonus: { label: l('附魔概率表 (table_bonus)', 'Table Bonus'), fields: [f('enchantment', '附魔', 'Enchantment', 'text'), f('chances', '概率', 'Chances', 'lines', { hint: l('每行一个概率, 对应附魔等级', 'One chance per line, per enchantment level') })] },
    random: { label: l('随机概率', 'Random'), fields: [f('value', '概率', 'Value', 'number', { hint: l('0.1 = 10%', '0.1 = 10%') })] },
    permission: { label: l('权限', 'Permission'), fields: [f('permission', '权限', 'Permission', 'text')] },
    expression: { label: l('表达式', 'Expression'), fields: [f('expression', '表达式', 'Expression', 'text', { hint: l('返回 true 时满足 (EvalEx)', 'Passes when it returns true (EvalEx)') })] },
    string_equals: { label: l('字符串相等', 'String Equals'), fields: [f('value1', '值 1', 'Value 1', 'text'), f('value2', '值 2', 'Value 2', 'text')] },
    string_contains: { label: l('字符串包含', 'String Contains'), fields: [f('value1', '值 1', 'Value 1', 'text'), f('value2', '值 2', 'Value 2', 'text')] },
    regex: { label: l('正则匹配', 'Regex'), fields: [f('value', '值', 'Value', 'text'), f('regex', '正则', 'Regex', 'text')] },
    is_null: { label: l('参数为空', 'Is Null'), fields: [f('argument', '参数', 'Argument', 'text', { hint: l('如 player.main_hand_item', 'e.g. player.main_hand_item') })] },
    hand: { label: l('交互手', 'Hand'), fields: [f('hand', '手', 'Hand', 'select', { options: ['main_hand', 'off_hand'] })] },
    on_cooldown: { label: l('冷却中', 'On Cooldown'), fields: [f('id', '冷却 ID', 'Cooldown ID', 'text', { hint: l('由 set_cooldown 函数设置', 'Set by the set_cooldown function') })] },
    'worldguard:region': { label: l('WorldGuard 区域', 'WorldGuard Region'), fields: [f('mode', '模式', 'Mode', 'select', { options: [{ v: '1', l: '1 (并集)' }, { v: '2', l: '2 (交集)' }] }), f('regions', '区域', 'Regions', 'lines')] },
    distance: { label: l('距离范围', 'Distance'), fields: [f('min', '最小', 'Min', 'number'), f('max', '最大', 'Max', 'number')] },
    has_player: { label: l('有玩家', 'Has Player') },
    inventory_has_item: { label: l('背包有物品', 'Inventory Has Item'), fields: [f('id', '物品 ID', 'Item ID', 'text', { datalist: 'items' }), f('count', '数量', 'Count', 'number')] },
    is_bedrock_player: { label: l('基岩版玩家', 'Is Bedrock Player') },
    test_flag: { label: l('测试交互旗标', 'Test Flag'), fields: [f('flag', '旗标', 'Flag', 'select', { options: ['break', 'place', 'interact', 'open_container'] })] },
    world: { label: l('世界', 'World'), fields: [f('world', '世界', 'World', 'text')] },
    js: { label: l('JavaScript', 'JS'), fields: [
      f('script', '脚本 ID', 'Script ID', 'text', { hint: l('namespace:path', 'namespace:path') }),
      f('function', '函数', 'Function', 'text', { hint: l('默认 main', 'Default: main') }),
      f('args', '参数', 'Args', 'union', { noTypeKey: true, label: l('参数', 'Args'), types: {
        list: { label: l('列表', 'List'), widget: { type: 'listOf', label: l('参数', 'Args'), itemType: { type: 'text' } } },
        map: { label: l('映射', 'Map'), widget: { type: 'mapOf', label: l('参数', 'Args'), valueType: { type: 'scalar' } } },
      } }),
    ]},
  };
  function COND_TYPES_REF() { return COND_TYPES; }

  // ============ 函数类型 (wiki reference/events.mdx) ============
  // 通用: 每个函数都附带 conditions 条件列表 (自动追加)
  function FN(fields) {
    var flds = fields.slice ? fields.slice() : [];
    flds.push(f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions'), hint: l('全部满足才执行该函数', 'All must pass for the function to run') }));
    return { fields: flds };
  }
  var FN_TYPES = {
    cancel_event: { label: l('取消事件', 'Cancel Event') },
    run: { label: l('依次执行 (run)', 'Run'), fields: [
      f('delay', '延迟 (tick)', 'Delay (ticks)', 'number', { hint: l('默认 0', 'Default 0') }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('函数', 'Functions') }),
    ] },
    command: { label: l('执行命令', 'Command'), fields: [
      f('command', '命令', 'Command', 'linesScalar', { hint: l('支持 <arg:...> 占位符; 多行 = 多条命令', 'Supports <arg:...>; multiple lines = multiple commands') }),
      f('target', '目标', 'Target', 'text', { hint: l('all / self / 玩家选择器', 'all / self / player selector') }),
      f('as_player', '以玩家身份', 'As Player', 'bool'),
      f('as_op', '以 OP 身份', 'As OP', 'bool', { hint: l('不推荐, 有安全风险', 'Not recommended, security risk') }),
      f('as_event', '以事件执行', 'As Event', 'bool', { hint: l('部分事件式命令插件需要', 'Some event-based command plugins require this') }),
    ] },
    message: { label: l('发送消息', 'Message'), fields: [
      f('message', '消息', 'Message', 'linesScalar', { hint: l('多行 = 多条消息', 'Multiple lines = multiple messages') }),
      f('target', '目标', 'Target', 'text', { hint: l('all / self / 玩家选择器', 'all / self / player selector') }),
      f('overlay', 'Actionbar', 'Overlay', 'bool', { hint: l('true = actionbar, false = 聊天框', 'true = actionbar, false = chat') }),
    ] },
    actionbar: { label: l('Actionbar', 'Actionbar'), fields: [
      f('actionbar', '内容', 'Content', 'text'),
      f('target', '目标', 'Target', 'text'),
    ] },
    title: { label: l('Title', 'Title'), fields: [
      f('title', '标题', 'Title', 'miniText'),
      f('subtitle', '副标题', 'Subtitle', 'miniText'),
      f('fade_in', '淡入 (tick)', 'Fade In', 'number'),
      f('stay', '停留 (tick)', 'Stay', 'number'),
      f('fade_out', '淡出 (tick)', 'Fade Out', 'number'),
    ] },
    open_window: { label: l('打开界面', 'Open Window'), fields: [
      f('gui_type', '界面类型', 'GUI Type', 'select', { options: S.constants.openWindowTypes }),
      f('title', '标题', 'Title', 'text'),
      f('target', '目标', 'Target', 'text'),
    ] },
    break_block: { label: l('破坏方块', 'Break Block'), fields: [
      f('x', 'X', 'X', 'text', { hint: l('默认 <arg:position.x>', 'Default <arg:position.x>') }),
      f('y', 'Y', 'Y', 'text', { hint: l('默认 <arg:position.y>', 'Default <arg:position.y>') }),
      f('z', 'Z', 'Z', 'text', { hint: l('默认 <arg:position.z>', 'Default <arg:position.z>') }),
    ] },
    place_block: { label: l('放置方块', 'Place Block'), fields: [
      f('block_state', '方块状态', 'Block State', 'text', { hint: l('如 default:chinese_lantern', 'e.g. default:chinese_lantern'), datalist: 'blocks' }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
    ] },
    update_block_property: { label: l('更新方块属性', 'Update Block Property'), fields: [
      f('properties', '属性', 'Properties', 'mapOf', { valueType: { type: 'scalar' }, label: l('属性', 'Properties') }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
    ] },
    transform_block: { label: l('转换方块', 'Transform Block'), fields: [
      f('block', '方块', 'Block', 'text', { datalist: 'blocks' }),
      f('properties', '属性', 'Properties', 'mapOf', { valueType: { type: 'scalar' }, label: l('属性', 'Properties') }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
    ] },
    drop_loot: { label: l('掉落战利品', 'Drop Loot'), fields: [
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('to_inventory', '直接进背包', 'To Inventory', 'bool'),
      f('loot', '战利品表', 'Loot Table', 'union', { noTypeKey: true, allowScalar: { type: 'text', placeholder: 'minecraft:chests/simple_dungeon' }, label: l('战利品表', 'Loot Table'), types: LOOT_TYPES_REF() }),
    ] },
    update_interaction_tick: { label: l('更新交互计时', 'Update Interaction Tick') },
    set_count: { label: l('设置物品数量', 'Set Count'), fields: [
      f('add', '追加', 'Add', 'bool'), f('count', '数量', 'Count', 'number'),
      f('target', '目标', 'Target', 'text'),
    ] },
    set_food: { label: l('设置饱食度', 'Set Food'), fields: [
      f('add', '追加', 'Add', 'bool'), f('food', '饱食度 (0~20)', 'Food (0-20)', 'number'),
      f('target', '目标', 'Target', 'text'),
    ] },
    set_saturation: { label: l('设置饱和度', 'Set Saturation'), fields: [
      f('add', '追加', 'Add', 'bool'), f('saturation', '饱和度 (0~10)', 'Saturation (0-10)', 'number'),
      f('target', '目标', 'Target', 'text'),
    ] },
    swing_hand: { label: l('挥手', 'Swing Hand'), fields: [
      f('hand', '手', 'Hand', 'select', { options: ['main_hand', 'off_hand'], hint: l('留空 = 事件中的手', 'Empty = the hand in this context') }),
    ] },
    particle: { label: l('生成粒子', 'Particle'), fields: [
      f('particle', '粒子', 'Particle', 'text', { hint: l('如 minecraft:end_rod', 'e.g. minecraft:end_rod') }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('count', '数量', 'Count', 'number'), f('offset_x', '偏移 X', 'Offset X', 'number'),
      f('offset_y', '偏移 Y', 'Offset Y', 'number'), f('offset_z', '偏移 Z', 'Offset Z', 'number'),
      f('speed', '速度', 'Speed', 'number'),
    ] },
    potion_effect: { label: l('药水效果', 'Potion Effect'), fields: [
      f('potion_effect', '效果', 'Effect', 'text', { hint: l('如 minecraft:blindness', 'e.g. minecraft:blindness') }),
      f('duration', '时长 (tick)', 'Duration', 'number'), f('amplifier', '等级', 'Amplifier', 'number'),
      f('ambient', '环境 (信标)', 'Ambient', 'bool'), f('particles', '粒子', 'Particles', 'bool'),
      f('show_icon', '显示图标', 'Show Icon', 'bool'),
    ] },
    remove_potion_effect: { label: l('移除药水效果', 'Remove Potion Effect'), fields: [
      f('potion_effect', '效果', 'Effect', 'text'), f('all', '全部', 'All', 'bool'),
    ] },
    leveler_exp: { label: l('技能经验 (leveler)', 'Leveler Exp'), fields: [
      f('plugin', '插件', 'Plugin', 'text', { hint: l('如 AuraSkills', 'e.g. AuraSkills') }),
      f('leveler', '技能/职业 ID', 'Leveler ID', 'text'), f('count', '经验', 'Exp', 'number'),
    ] },
    set_cooldown: { label: l('设置冷却', 'Set Cooldown'), fields: [
      f('time', '时长', 'Time', 'text', { hint: l('如 1m30s (t/s/m/h/d/w)', 'e.g. 1m30s (t/s/m/h/d/w)') }),
      f('id', '冷却 ID', 'Cooldown ID', 'text'), f('add', '累加', 'Add', 'bool'),
    ] },
    remove_cooldown: { label: l('移除冷却', 'Remove Cooldown'), fields: [
      f('id', '冷却 ID', 'Cooldown ID', 'text'), f('all', '全部', 'All', 'bool'),
    ] },
    play_sound: { label: l('播放音效', 'Play Sound'), fields: [
      f('sound', '音效', 'Sound', 'text', { hint: l('如 minecraft:block.xxx.xxx', 'e.g. minecraft:block.xxx.xxx') }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('target', '目标', 'Target', 'text'), f('pitch', '音调', 'Pitch', 'number'),
      f('volume', '音量', 'Volume', 'number'), f('source', '来源', 'Source', 'select', { options: S.constants.soundSources }),
    ] },
    cast_mythic_skill: { label: l('释放 MythicMobs 技能', 'Cast Mythic Skill'), fields: [
      f('skill', '技能 ID', 'Skill ID', 'text'), f('power', '强度', 'Power', 'number'),
    ] },
    spawn_furniture: { label: l('生成家具', 'Spawn Furniture'), fields: [
      f('furniture_id', '家具 ID', 'Furniture ID', 'text', { datalist: 'furniture' }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('pitch', 'Pitch', 'Pitch', 'text'), f('yaw', 'Yaw', 'Yaw', 'text'),
      f('variant', '变体', 'Variant', 'text'), f('play_sound', '播放音效', 'Play Sound', 'bool'),
    ] },
    remove_furniture: { label: l('移除家具', 'Remove Furniture'), fields: [
      f('drop_loot', '掉落战利品', 'Drop Loot', 'bool'), f('play_sound', '播放音效', 'Play Sound', 'bool'),
    ] },
    replace_furniture: { label: l('替换家具', 'Replace Furniture'), fields: [
      f('furniture_id', '家具 ID', 'Furniture ID', 'text', { datalist: 'furniture' }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('pitch', 'Pitch', 'Pitch', 'text'), f('yaw', 'Yaw', 'Yaw', 'text'),
      f('variant', '变体', 'Variant', 'text'), f('drop_loot', '掉落战利品', 'Drop Loot', 'bool'),
      f('play_sound', '播放音效', 'Play Sound', 'bool'),
    ] },
    rotate_furniture: { label: l('旋转家具', 'Rotate Furniture'), fields: [
      f('degree', '角度', 'Degree', 'number'),
      f('on_success', '成功时', 'On Success', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('成功时', 'On Success') }),
      f('on_failure', '失败时', 'On Failure', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('失败时', 'On Failure') }),
    ] },
    teleport: { label: l('传送', 'Teleport'), fields: [
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('pitch', 'Pitch', 'Pitch', 'text'), f('yaw', 'Yaw', 'Yaw', 'text'), f('world', '世界', 'World', 'text'),
    ] },
    toast: { label: l('发送 Toast', 'Toast'), fields: [
      f('toast', '内容', 'Content', 'text'),
      f('advancement_type', '类型', 'Type', 'select', { options: ['goal', 'task', 'challenge'] }),
      f('icon', '图标', 'Icon', 'text', { datalist: 'items' }),
    ] },
    damage: { label: l('造成伤害', 'Damage'), fields: [
      f('target', '目标', 'Target', 'text'), f('amount', '伤害', 'Amount', 'number'),
      f('damage_type', '伤害类型', 'Damage Type', 'text', { hint: l('默认 generic', 'Default: generic') }),
    ] },
    set_variable: { label: l('设置变量', 'Set Variable'), fields: [
      f('name', '变量名', 'Name', 'text', { hint: l('用 <arg:var_[name]> 访问', 'Access via <arg:var_[name]>') }),
      f('number', '数字', 'Number', 'number'), f('as_int', '取整', 'As Int', 'bool'),
      f('text', '文本', 'Text', 'text'),
    ] },
    merchant_trade: { label: l('村民交易', 'Merchant Trade'), fields: [
      f('title', '标题', 'Title', 'text'),
      f('offers', '交易项', 'Offers', 'listOf', {
        label: l('交易项', 'Offers'),
        itemType: { type: 'object', fields: [
          f('cost_1', '花费 1', 'Cost 1', 'union', { noTypeKey: true, label: l('花费 1', 'Cost 1'), types: {
            string: { label: l('物品 ID', 'Item ID'), widget: { type: 'text' } },
            map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
              f('item', '物品', 'Item', 'text', { datalist: 'items' }),
              f('count', '数量', 'Count', 'number'),
              f('components', '组件', 'Components', 'kv'),
            ] } },
          } }),
          f('cost_2', '花费 2 (可选)', 'Cost 2', 'union', { noTypeKey: true, label: l('花费 2', 'Cost 2'), types: {
            string: { label: l('物品 ID', 'Item ID'), widget: { type: 'text' } },
            map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
              f('item', '物品', 'Item', 'text', { datalist: 'items' }), f('count', '数量', 'Count', 'number'),
            ] } },
          } }),
          f('result', '结果', 'Result', 'union', { noTypeKey: true, label: l('结果', 'Result'), types: {
            string: { label: l('物品 ID', 'Item ID'), widget: { type: 'text' } },
            map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
              f('item', '物品', 'Item', 'text', { datalist: 'items' }), f('count', '数量', 'Count', 'number'),
            ] } },
          } }),
          f('experience', '经验', 'Experience', 'number'),
        ] },
      }),
    ] },
    remove_entity: { label: l('移除实体', 'Remove Entity') },
    if_else: { label: l('条件分支 (if_else)', 'If Else'), fields: [
      f('rules', '规则', 'Rules', 'listOf', {
        label: l('规则', 'Rules'),
        itemType: { type: 'object', fields: [
          f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
          f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('函数', 'Functions') }),
        ] },
        hint: l('依次匹配, 最后一条无条件的规则作为 else', 'First match wins; a rule without conditions acts as else'),
      }),
    ] },
    when: { label: l('多路分支 (when)', 'When'), fields: [
      f('source', '源值', 'Source', 'text', { hint: l('如 <papi:player_world>', 'e.g. <papi:player_world>') }),
      f('cases', '分支', 'Cases', 'listOf', {
        label: l('分支', 'Cases'),
        itemType: { type: 'object', fields: [
          f('when', '匹配值', 'When', 'linesScalar', { hint: l('单行 = 单个值, 多行 = 多个值', 'One line = one value, multiple lines = several') }),
          f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('函数', 'Functions') }),
        ] },
      }),
      f('fallback', '兜底', 'Fallback', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('兜底', 'Fallback') }),
    ] },
    damage_item: { label: l('消耗耐久', 'Damage Item'), fields: [
      f('amount', '数量', 'Amount', 'number'),
      f('slot', '槽位', 'Slot', 'select', { options: ['mainhand', 'offhand', 'feet', 'legs', 'chest', 'head'] }),
    ] },
    cycle_block_property: { label: l('循环方块属性', 'Cycle Block Property'), fields: [
      f('property', '属性', 'Property', 'text', { hint: l('如 axis / facing', 'e.g. axis / facing') }),
      f('inverse', '反向', 'Inverse', 'text', { hint: l('默认 <arg:player.is_sneaking>', 'Default <arg:player.is_sneaking>') }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('rules', '自定义顺序', 'Rules', 'mapOf', { valueType: { type: 'text' }, label: l('自定义顺序', 'Rules'), hint: l('值 → 下一个值', 'value → next value') }),
    ] },
    set_exp: { label: l('设置经验值', 'Set Exp'), fields: [
      f('count', '经验', 'Exp', 'number'), f('add', '追加', 'Add', 'bool'), f('target', '目标', 'Target', 'text'),
    ] },
    set_level: { label: l('设置等级', 'Set Level'), fields: [
      f('count', '等级', 'Level', 'number'), f('add', '追加', 'Add', 'bool'), f('target', '目标', 'Target', 'text'),
    ] },
    play_totem_animation: { label: l('图腾动画', 'Play Totem Animation'), fields: [
      f('item', '物品', 'Item', 'text', { datalist: 'items' }), f('sound', '音效', 'Sound', 'text'),
      f('pitch', '音调', 'Pitch', 'number'), f('volume', '音量', 'Volume', 'number'),
      f('silent', '静默', 'Silent', 'bool'), f('target', '目标', 'Target', 'text'),
    ] },
    close_inventory: { label: l('关闭背包', 'Close Inventory'), fields: [
      f('target', '目标', 'Target', 'text'),
    ] },
    clear_item: { label: l('清除物品', 'Clear Item'), fields: [
      f('id', '物品 ID', 'Item ID', 'text', { datalist: 'items' }), f('count', '数量', 'Count', 'number'),
    ] },
    heal: { label: l('治疗', 'Heal'), fields: [
      f('amount', '生命值', 'Amount', 'number'), f('target', '目标', 'Target', 'text'),
    ] },
    spawn_mythic_mob: { label: l('生成 MythicMobs 生物', 'Spawn Mythic Mob'), fields: [
      f('mob', '生物 ID', 'Mob ID', 'text'), f('level', '等级', 'Level', 'number'),
      f('world', '世界', 'World', 'text'), f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'),
      f('z', 'Z', 'Z', 'text'), f('pitch', 'Pitch', 'Pitch', 'text'), f('yaw', 'Yaw', 'Yaw', 'text'),
    ] },
    set_furniture_variant: { label: l('切换家具变体', 'Set Furniture Variant'), fields: [
      f('variant', '变体', 'Variant', 'text'),
    ] },
    set_item_cooldown: { label: l('物品冷却 (1.21.2+)', 'Set Item Cooldown'), fields: [
      f('id', '物品 ID', 'Item ID', 'text', { hint: l('冷却组, 如 minecraft:ender_pearl', 'Cooldown group, e.g. minecraft:ender_pearl') }),
      f('time', '时长', 'Time', 'text', { hint: l('如 5s (t/s/m/h/d/w)', 'e.g. 5s (t/s/m/h/d/w)') }),
      f('add', '追加', 'Add', 'bool'),
    ] },
    js: { label: l('JavaScript', 'JS'), fields: [
      f('script', '脚本 ID', 'Script ID', 'text', { hint: l('namespace:path', 'namespace:path') }),
      f('function', '函数', 'Function', 'text'),
      f('args', '参数', 'Args', 'union', { noTypeKey: true, label: l('参数', 'Args'), types: {
        list: { label: l('列表', 'List'), widget: { type: 'listOf', label: l('参数', 'Args'), itemType: { type: 'text' } } },
        map: { label: l('映射', 'Map'), widget: { type: 'mapOf', label: l('参数', 'Args'), valueType: { type: 'scalar' } } },
      } }),
    ] },
  };
  function FN_TYPES_REF() { return FN_TYPES; }

  // ============ 战利品表 (wiki reference/loot_table.mdx) ============
  var LOOT_FN_TYPES = {
    apply_bonus: { label: l('附魔加成', 'Apply Bonus'), fields: [
      f('enchantment', '附魔', 'Enchantment', 'text'),
      f('formula', '公式', 'Formula', 'union', { noTypeKey: true, label: l('公式', 'Formula'), types: {
        ore_drops: { label: l('矿石掉落 (ore_drops)', 'Ore Drops') },
        binomial_with_bonus_count: { label: l('二项分布 (binomial)', 'Binomial With Bonus Count'), widget: { type: 'object', fields: [
          f('extra', '额外', 'Extra', 'number'), f('probability', '概率', 'Probability', 'number'),
        ] } },
      } }),
    ] },
    apply_data: { label: l('应用数据', 'Apply Data'), fields: [
      f('data', '数据', 'Data', 'kv'),
    ] },
    set_count: { label: l('设置数量', 'Set Count'), fields: [
      f('count', '数量', 'Count', 'text'), f('add', '追加', 'Add', 'bool'),
    ] },
    explosion_decay: { label: l('爆炸衰减', 'Explosion Decay') },
    drop_exp: { label: l('掉落经验', 'Drop Exp'), fields: [
      f('count', '经验', 'Count', 'text'),
    ] },
    limit_count: { label: l('限制数量', 'Limit Count'), fields: [
      f('min', '最小', 'Min', 'number'), f('max', '最大', 'Max', 'number'),
    ] },
  };
  var LOOT_ENTRY_TYPES = {
    item: { label: l('物品', 'Item'), fields: [
      f('item', '物品 ID', 'Item ID', 'text', { datalist: 'items' }),
      f('weight', '权重', 'Weight', 'number'),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES_REF }, label: l('函数', 'Functions') }),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    furniture_item: { label: l('家具物品', 'Furniture Item'), fields: [
      f('item', '物品 ID', 'Item ID', 'text', { hint: l('掉落放置时使用的物品', 'Drops the item used to place'), datalist: 'items' }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES_REF }, label: l('函数', 'Functions') }),
    ] },
    exp: { label: l('经验', 'Exp'), fields: [
      f('count', '经验', 'Count', 'text'),
    ] },
    alternatives: { label: l('备选 (alternatives)', 'Alternatives'), fields: [
      f('children', '子条目', 'Children', 'listOf', { itemType: { type: 'union', types: LOOT_ENTRY_TYPES_REF }, label: l('子条目', 'Children') }),
    ] },
    loot_table: { label: l('引用战利品表', 'Loot Table'), fields: [
      f('id', 'ID', 'ID', 'text', { hint: l('如 minecraft:chests/simple_dungeon', 'e.g. minecraft:chests/simple_dungeon') }),
    ] },
  };
  function LOOT_FN_TYPES_REF() { return LOOT_FN_TYPES; }
  function LOOT_ENTRY_TYPES_REF() { return LOOT_ENTRY_TYPES; }
  var LOOT_POOL = {
    type: 'object',
    fields: [
      f('rolls', '抽取次数', 'Rolls', 'text', { hint: l('数字或表达式, 如 1~3', 'Number or expression, e.g. 1~3') }),
      f('bonus_rolls', '额外次数', 'Bonus Rolls', 'text'),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
      f('entries', '条目', 'Entries', 'listOf', { itemType: { type: 'union', types: LOOT_ENTRY_TYPES }, label: l('条目', 'Entries') }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES }, label: l('函数', 'Functions') }),
    ],
  };
  var LOOT_TYPES = {
    template: { label: l('模板', 'Template'), fields: [
      f('template', '模板 ID', 'Template ID', 'text', { hint: l('如 default:loot_table/furniture', 'e.g. default:loot_table/furniture') }),
      f('arguments', '参数', 'Arguments', 'mapOf', { valueType: { type: 'scalar' }, label: l('参数', 'Arguments') }),
    ] },
    pools: { label: l('内联战利品', 'Inline Loot'), fields: [
      f('pools', '战利品池', 'Pools', 'listOf', { itemType: LOOT_POOL, label: l('战利品池', 'Pools') }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES }, label: l('函数', 'Functions') }),
    ] },
  };
  function LOOT_TYPES_REF() { return LOOT_TYPES; }
  S.loot = { types: LOOT_TYPES, pool: LOOT_POOL, entries: LOOT_ENTRY_TYPES, functions: LOOT_FN_TYPES };

  // ============ 共享字段构建 ============
  function conditionsList() {
    return { type: 'listOf', label: l('条件', 'Conditions'), itemType: { type: 'union', negatable: true, types: COND_TYPES }, hint: l('全部满足才生效 (可加 ! 取反)', 'All must pass (! prefix inverts)') };
  }
  function functionsList(labelZh) {
    return { type: 'listOf', label: l(labelZh || '函数', 'Functions'), itemType: { type: 'union', types: FN_TYPES } };
  }
  S.conditions = COND_TYPES;
  S.functions = FN_TYPES;
  S.conditionsList = conditionsList;
  S.functionsList = functionsList;

  // ============ Section 表单 (简单类型) ============
  // 复杂类型 (item/block/furniture/recipe) 在后续模块补充
  var SECTIONS = {};

  SECTIONS.equipment = {
    fields: [
      f('type', '类型', 'Type', 'select', { options: S.constants.equipmentTypes }),
      f('layers', '层', 'Layers', 'mapOf', {
        label: l('层', 'Layers'),
        hint: l('键为层类型: ' + S.constants.equipmentLayers.join(' / '), 'Key is layer type: ' + S.constants.equipmentLayers.join(' / ')),
        valueType: { type: 'union', noTypeKey: true, label: l('层', 'Layer'), types: {
          string: { label: l('纹理路径', 'Texture Path'), widget: { type: 'text' } },
          map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
            f('texture', '纹理', 'Texture', 'text', { hint: l('如 minecraft:leather', 'e.g. minecraft:leather') }),
            f('dyeable', '可染色', 'Dyeable', 'union', { noTypeKey: true, label: l('可染色', 'Dyeable'), types: {
              bool: { label: l('布尔', 'Boolean'), widget: { type: 'bool' } },
              map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
                f('color_when_undyed', '未染色颜色', 'Color When Undyed', 'number', { hint: l('十进制颜色值, 如 -6265536', 'Decimal color, e.g. -6265536') }),
              ] } },
            } }),
            f('use_player_texture', '玩家纹理 (鞘翅)', 'Use Player Texture', 'bool'),
          ] } },
          list: { label: l('多纹理组合', 'Texture List'), widget: { type: 'listOf', label: l('层', 'Layers'), itemType: { type: 'union', noTypeKey: true, types: {
            string: { label: l('纹理路径', 'Texture Path'), widget: { type: 'text' } },
            map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
              f('texture', '纹理', 'Texture', 'text'),
              f('dyeable', '可染色', 'Dyeable', 'union', { noTypeKey: true, label: l('可染色', 'Dyeable'), types: {
                bool: { label: l('布尔', 'Boolean'), widget: { type: 'bool' } },
                map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
                  f('color_when_undyed', '未染色颜色', 'Color When Undyed', 'number'),
                ] } },
              } }),
            ] } },
          } } },
        } } },
      }),
    ],
  };

  SECTIONS.image = {
    fields: [
      f('file', '文件', 'File', 'text', { hint: l('如 assets/images/xxx.png', 'e.g. assets/images/xxx.png') }),
      f('height', '高度', 'Height', 'number'),
      f('ascent', '基线偏移', 'Ascent', 'number'),
      f('font', '字体', 'Font', 'text', { hint: l('默认 minecraft:default', 'Default: minecraft:default') }),
      f('char', '字符', 'Char', 'text'),
      f('chars', '字符集', 'Chars', 'lines', { hint: l('每行一个字符', 'One char per line') }),
      f('grid_size', '网格大小', 'Grid Size', 'number'),
      f('ref', '引用', 'Ref', 'text'),
      f('row', '行', 'Row', 'number'),
      f('column', '列', 'Column', 'number'),
    ],
  };

  SECTIONS.category = {
    fields: [
      f('name', '显示名', 'Name', 'miniText', { hint: l('支持 MiniMessage', 'Supports MiniMessage') }),
      f('lore', '描述', 'Lore', 'lines', { hint: l('每行一条', 'One line each') }),
      f('icon', '图标', 'Icon', 'text', { hint: l('注册的物品 ID', 'A registered item ID'), datalist: 'items' }),
      f('priority', '优先级', 'Priority', 'number', { hint: l('越小越靠前', 'Lower shows first') }),
      f('hidden', '隐藏', 'Hidden', 'bool', { hint: l('不出现在主菜单 (子分类)', 'Hidden from main menu (sub-category)') }),
      f('conditions', '显示条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('显示条件', 'Conditions') }),
      f('list', '成员列表', 'List', 'lines', { hint: l('物品 ID 或 #分类ID (每行一个)', 'Item IDs or #category refs (one per line)') }),
      f('all_items', '包含全部物品', 'All Items', 'bool', { hint: l('自动包含所有注册的自定义物品', 'Auto-include all registered custom items') }),
    ],
  };

  SECTIONS.sound = {
    fields: [
      f('replace', '替换原音效', 'Replace', 'bool'),
      f('subtitle', '字幕', 'Subtitle', 'text'),
      f('sounds', '音效列表', 'Sounds', 'listOf', {
        label: l('音效列表', 'Sounds'),
        itemType: { type: 'union', noTypeKey: true, types: {
          string: { label: l('路径', 'Path'), widget: { type: 'text', hint: l('如 block/custom_block_1', 'e.g. block/custom_block_1') } },
          map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
            f('name', '路径', 'Path', 'text'),
            f('volume', '音量', 'Volume', 'number'),
            f('weight', '权重', 'Weight', 'number'),
            f('stream', '流式播放', 'Stream', 'bool'),
            f('attenuation_distance', '衰减距离', 'Attenuation Distance', 'number'),
            f('preload', '预加载', 'Preload', 'bool'),
            f('type', '类型', 'Type', 'select', { options: ['file', 'event'] }),
          ] } },
        } },
      }),
    ],
  };

  SECTIONS.emoji = {
    fields: [
      f('keywords', '关键词', 'Keywords', 'lines', { hint: l('每行一个', 'One per line') }),
      f('content', '内容', 'Content', 'textarea'),
      f('image', '图片', 'Image', 'text', { hint: l('如 assets/emoji/xxx.png', 'e.g. assets/emoji/xxx.png') }),
      f('permission', '权限', 'Permission', 'text'),
      f('chat_completion', '聊天补全', 'Chat Completion', 'bool'),
      f('template', '模板', 'Template', 'text'),
      f('overrides', '覆盖', 'Overrides', 'kv'),
    ],
  };

  SECTIONS.jukeboxSong = {
    fields: [
      f('sound', '音效', 'Sound', 'text', { hint: l('如 minecraft:music_disc.pigstep', 'e.g. minecraft:music_disc.pigstep') }),
      f('length', '时长 (秒)', 'Length (seconds)', 'number'),
      f('description', '描述', 'Description', 'text'),
      f('comparator_output', '红石输出', 'Comparator Output', 'number'),
      f('range', '范围', 'Range', 'number'),
    ],
  };

  SECTIONS.painting = {
    fields: [
      f('width', '宽 (1~16)', 'Width', 'number'),
      f('height', '高 (1~16)', 'Height', 'number'),
      f('asset_id', '纹理', 'Asset ID', 'text', { hint: l('默认等于条目 ID', 'Defaults to the entry id') }),
      f('title', '标题', 'Title', 'miniText', { hint: l('支持 <lang:...>', 'Supports <lang:...>') }),
      f('author', '作者', 'Author', 'miniText'),
      f('show_in_op_tab', 'OP 工具选项卡显示', 'Show in OP Tab', 'bool'),
    ],
  };

  // 全局变量/翻译: 值可能为字符串或对象, 由表单引擎按值形态处理
  SECTIONS.globalVariable = { wholeValue: true };
  SECTIONS.translation = { wholeValue: true };
  SECTIONS.lang = { wholeValue: true };

  SECTIONS.lootSource = {
    fields: [
      f('type', '类型', 'Type', 'select', { options: S.constants.lootSourceTypes }),
      f('target', '目标', 'Target', 'text', { hint: l('按类型可为方块/实体/战利品表/进度 ID; fishing 与 piglin_barter 无目标', 'Block/entity/loot-table/advancement id; fishing & piglin_barter take none') }),
      f('targets', '多个目标', 'Targets', 'lines', { hint: l('每行一个', 'One per line') }),
      f('overwrite', '覆盖', 'Overwrite', 'select', { options: S.constants.lootOverwrites, hint: l('从原版掉落中移除的内容', 'What to remove from the vanilla result') }),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
      f('loot', '战利品', 'Loot', 'union', { noTypeKey: true, allowScalar: { type: 'text', placeholder: 'minecraft:chests/simple_dungeon' }, label: l('战利品', 'Loot'), types: LOOT_TYPES }),
    ],
  };

  SECTIONS.placedFeature = {
    fields: [
      f('feature', '地物', 'Feature', 'kv', { hint: l('生成结构定义', 'Structure definition') }),
      f('placement', '放置规则', 'Placement', 'kv', { hint: l('放置修饰器', 'Placement modifiers') }),
      f('world', '世界', 'World', 'lines'),
      f('dimension', '维度', 'Dimension', 'lines'),
      f('dimension_type', '维度类型', 'Dimension Type', 'lines'),
      f('biome', '生物群系', 'Biome', 'lines'),
    ],
  };

  SECTIONS.template = {
    fields: [
      f('type', '类型', 'Type', 'text'),
      f('material', '材质', 'Material', 'text', { datalist: 'items' }),
      f('content', '内容', 'Content', 'textarea'),
      f('template', '模板', 'Template', 'linesScalar', { hint: l('多行 = 多个模板', 'Multiple lines = several templates') }),
      f('arguments', '参数', 'Arguments', 'mapOf', { valueType: { type: 'scalar' }, label: l('参数', 'Arguments') }),
      f('merges', '合并', 'Merges', 'kv'),
      f('overrides', '覆盖', 'Overrides', 'kv'),
    ],
  };

  // ============ 插件 config.yml (S.config) ============
  // 数据源: 插件 config.yml 实测 + wiki reference/file_conflict.mdx + getting_start/installation.mdx
  var CONFIG_TERM_TYPES = {
    all_of: { label: l('全部满足 (all_of)', 'All Of'), fields: [f('terms', '子条件', 'Terms', 'listOf', { itemType: { type: 'union', types: CONFIG_TERM_TYPES_REF }, label: l('子条件', 'Terms') })] },
    any_of: { label: l('任一满足 (any_of)', 'Any Of'), fields: [f('terms', '子条件', 'Terms', 'listOf', { itemType: { type: 'union', types: CONFIG_TERM_TYPES_REF }, label: l('子条件', 'Terms') })] },
    inverted: { label: l('取反 (inverted)', 'Inverted'), fields: [f('term', '条件', 'Term', 'union', { types: CONFIG_TERM_TYPES_REF, label: l('条件', 'Term') })] },
    filename: { label: l('文件名匹配', 'Filename'), fields: [f('name', '文件名', 'Name', 'text')] },
    exact: { label: l('精确路径', 'Exact Path'), fields: [f('path', '路径', 'Path', 'text')] },
    parent_path_prefix: { label: l('路径前缀', 'Path Prefix'), fields: [f('path', '路径', 'Path', 'text')] },
    parent_path_suffix: { label: l('路径后缀', 'Path Suffix'), fields: [f('path', '路径', 'Path', 'text')] },
    contains: { label: l('包含字符', 'Contains'), fields: [f('path', '路径', 'Path', 'text')] },
    pattern: { label: l('正则匹配', 'Pattern'), fields: [f('pattern', '正则', 'Pattern', 'text')] },
  };
  function CONFIG_TERM_TYPES_REF() { return CONFIG_TERM_TYPES; }
  var CONFIG_RESOLUTION_TYPES = {
    merge_json: { label: l('合并 JSON', 'Merge JSON'), fields: [f('deeply', '深度合并', 'Deeply', 'bool')] },
    retain_matching: { label: l('保留匹配项', 'Retain Matching'), fields: [f('term', '条件', 'Term', 'union', { types: CONFIG_TERM_TYPES_REF, label: l('条件', 'Term') })] },
    conditional: { label: l('条件解决', 'Conditional'), fields: [
      f('term', '条件', 'Term', 'union', { types: CONFIG_TERM_TYPES_REF, label: l('条件', 'Term') }),
      f('resolution', '解决方式', 'Resolution', 'union', { types: CONFIG_RESOLUTION_TYPES_REF, label: l('解决方式', 'Resolution') }),
    ] },
    merge_pack_mcmeta: { label: l('合并 pack.mcmeta', 'Merge Pack Mcmeta'), fields: [f('description', '描述', 'Description', 'text')] },
    merge_atlas: { label: l('合并 Atlas', 'Merge Atlas') },
    merge_font: { label: l('合并字体', 'Merge Font') },
  };
  function CONFIG_RESOLUTION_TYPES_REF() { return CONFIG_RESOLUTION_TYPES; }
  var CONFIG_HOSTING_TYPES = {
    self: { label: l('内置 HTTP 服务器', 'Self Hosting'), fields: [
      f('ip', 'IP', 'IP', 'text', { hint: l('默认 auto', 'Default: auto') }),
      f('port', '端口', 'Port', 'text', { hint: l('默认 auto', 'Default: auto') }),
      f('protocol', '协议', 'Protocol', 'select', { options: ['http', 'https'] }),
      f('deny-non-minecraft-request', '拒绝非 MC 请求', 'Deny Non-Minecraft Request', 'bool'),
      f('one-time-token', '一次性令牌', 'One-Time Token', 'bool'),
      f('rate-limit', '限流', 'Rate Limit', 'object', { fields: [
        f('max-requests', '最大请求数', 'Max Requests', 'number'),
        f('reset-interval', '重置间隔 (秒)', 'Reset Interval (seconds)', 'number'),
      ] }),
    ] },
    external: { label: l('外部 URL', 'External'), fields: [f('url', 'URL', 'URL', 'text')] },
    lobfile: { label: l('Lobfile', 'Lobfile'), fields: [f('url', 'URL', 'URL', 'text'), f('api-key', 'API 密钥', 'API Key', 'text')] },
    s3: { label: l('S3 对象存储', 'S3'), fields: [
      f('endpoint', '端点', 'Endpoint', 'text'), f('bucket', '存储桶', 'Bucket', 'text'),
      f('region', '区域', 'Region', 'text'), f('access-key-id', 'Access Key ID', 'Access Key ID', 'text'),
      f('secret-access-key', 'Secret Access Key', 'Secret Access Key', 'text'), f('path-prefix', '路径前缀', 'Path Prefix', 'text'),
    ] },
    openlist: { label: l('OpenList', 'OpenList'), fields: [f('url', 'URL', 'URL', 'text'), f('token', '令牌', 'Token', 'text')] },
    onedrive: { label: l('OneDrive', 'OneDrive'), fields: [f('url', 'URL', 'URL', 'text'), f('token', '令牌', 'Token', 'text')] },
    gitlab: { label: l('GitLab', 'GitLab'), fields: [f('url', 'URL', 'URL', 'text'), f('project-id', '项目 ID', 'Project ID', 'text'), f('token', '令牌', 'Token', 'text')] },
    dropbox: { label: l('Dropbox', 'Dropbox'), fields: [f('url', 'URL', 'URL', 'text'), f('token', '令牌', 'Token', 'text')] },
  };
  function CONFIG_HOSTING_TYPES_REF() { return CONFIG_HOSTING_TYPES; }

  // 资源包导航按钮 (gui.browser.*.page-navigation) 共用
  var CFG_PAGE_NAV = [
    f('next', '下一页', 'Next', 'object', { fields: [
      f('available', '可用', 'Available', 'text'), f('not-available', '不可用', 'Not Available', 'text'),
    ] }),
    f('previous', '上一页', 'Previous', 'object', { fields: [
      f('available', '可用', 'Available', 'text'), f('not-available', '不可用', 'Not Available', 'text'),
    ] }),
  ];

  var CONFIG = {
    'config-version': { type: 'text', label: l('配置版本', 'Config Version'), hint: l('请勿修改此值', 'Do not modify this value') },
    metrics: { type: 'bool', label: l('统计 (BStats)', 'Metrics'), hint: l('启用或禁用通过 BStats 收集信息', 'Enable or disable BStats data collection') },
    'update-checker': { type: 'bool', label: l('版本检查', 'Update Checker'), hint: l('自动检查插件新版本', 'Auto-check for new plugin versions') },
    'forced-locale': { type: 'text', label: l('强制语言', 'Forced Locale'), hint: l('如 zh_cn, 留空 = 自动', 'e.g. zh_cn, empty = auto') },

    'resource-pack': { fields: [
      f('path', '生成路径', 'Path', 'text', { hint: l('资源包输出位置 (绝对或相对路径)', 'Absolute or relative output path') }),
      f('supported-version', '支持版本范围', 'Supported Version', 'object', { fields: [
        f('min', '最低版本', 'Min', 'text', { hint: l('如 SERVER / 1.20.1', 'e.g. SERVER / 1.20.1') }),
        f('max', '最高版本', 'Max', 'text', { hint: l('如 LATEST', 'e.g. LATEST') }),
      ] }),
      f('description', '描述', 'Description', 'miniText'),
      f('remove-tinted-leaves-particle', '移除落叶粒子', 'Remove Tinted Leaves Particle', 'bool', { hint: l('移除 1.21.5+ 的落叶粒子效果', 'Removes the 1.21.5+ tinted leaves particles') }),
      f('overlay-format', '覆盖层目录名', 'Overlay Format', 'text', { hint: l('如 ce_overlay_{version}', 'e.g. ce_overlay_{version}') }),
      f('override-uniform-font', '覆盖 uniform 字体', 'Override Uniform Font', 'bool', { hint: l('让 minecraft:default 字体中的图像在 minecraft:uniform 中生效', 'Applies default font images to the uniform font') }),
      f('generate-mod-assets', '生成模组资源', 'Generate Mod Assets', 'bool', { hint: l('为 CraftEngine fabric 模组 (客户端 Axiom/WorldEdit) 生成资源包', 'Generate assets for the CraftEngine fabric mod') }),
      f('exclude-core-shaders', '排除核心着色器', 'Exclude Core Shaders', 'bool'),
      f('merge-external-folders', '合并外部文件夹', 'Merge External Folders', 'lines', { hint: l('每行一个资源包文件夹', 'One pack folder per line') }),
      f('merge-external-zip-files', '合并外部 ZIP', 'Merge External Zip Files', 'lines', { hint: l('每行一个 zip 文件', 'One zip file per line') }),
      f('exclude-file-extensions', '排除扩展名', 'Exclude File Extensions', 'lines', { hint: l('如 md / psd / bbmodel (每行一个)', 'e.g. md / psd / bbmodel (one per line)') }),
      f('duplicated-files-handler', '冲突文件处理', 'Duplicated Files Handler', 'listOf', {
        label: l('冲突文件处理', 'Duplicated Files Handler'),
        hint: l('依次匹配, 使用第一个符合条件解决方式', 'First matching resolution wins'),
        itemType: { type: 'object', fields: [
          f('term', '匹配规则', 'Term', 'union', { types: CONFIG_TERM_TYPES_REF, label: l('匹配规则', 'Term') }),
          f('resolution', '解决方式', 'Resolution', 'union', { types: CONFIG_RESOLUTION_TYPES_REF, label: l('解决方式', 'Resolution') }),
        ] },
      }),
      f('validation', '校验', 'Validation', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('fix-atlas', '修复图集', 'Fix Atlas', 'bool', { hint: l('修复不在图集内的纹理', 'Fix textures not within the atlas') }),
        f('fix-missing-texture', '修复缺失纹理', 'Fix Missing Texture', 'bool', { hint: l('修复 #missing 导致的模型错误', 'Fix model errors caused by #missing') }),
      ] }),
      f('optimization', '优化', 'Optimization', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('texture', '纹理优化', 'Texture', 'object', { fields: [
          f('enable', '启用', 'Enable', 'bool'),
          f('zopfli-iterations', 'Zopfli 迭代次数', 'Zopfli Iterations', 'number', { hint: l('0 = 禁用 (很慢, 4~8 一般足够)', '0 = disabled (very slow, 4-8 usually enough)') }),
          f('exclude', '排除', 'Exclude', 'lines', { hint: l('每行一个纹理路径', 'One texture path per line') }),
        ] }),
        f('json', 'JSON 优化', 'JSON', 'object', { fields: [
          f('enable', '启用', 'Enable', 'bool'), f('exclude', '排除', 'Exclude', 'lines'),
        ] }),
      ] }),
      f('protection', '资源包保护', 'Protection', 'object', { fields: [
        f('unprotected-copy', '生成未保护副本', 'Unprotected Copy', 'bool', { hint: l('完全使用标准 Java 库创建, 兼容其他程序', 'Standard-java copy, compatible with other tools') }),
        f('crash-tools', 'Crash 工具', 'Crash Tools', 'object', { fields: [
          f('method-1', '方法 1', 'Method 1', 'bool'), f('method-2', '方法 2', 'Method 2', 'bool'),
          f('method-3', '方法 3', 'Method 3', 'bool', { hint: l('体积增加约 0.67MB', 'Adds ~0.67MB to the pack') }),
          f('method-4', '方法 4', 'Method 4', 'bool'), f('method-5', '方法 5', 'Method 5', 'bool'),
          f('method-6', '方法 6', 'Method 6', 'bool'), f('method-7', '方法 7', 'Method 7', 'bool'),
        ] }),
        f('incorrect-crc', '错误 CRC', 'Incorrect CRC', 'bool'),
        f('fake-file-size', '伪造文件大小', 'Fake File Size', 'bool'),
        f('escape-json', '转义 JSON', 'Escape JSON', 'bool', { hint: l('让 JSON 不可读', 'Make JSON human-unreadable') }),
        f('fake-directory', '伪造目录', 'Fake Directory', 'bool'),
        f('break-texture', '破坏纹理文件', 'Break Texture', 'bool'),
        f('obfuscation', '混淆', 'Obfuscation', 'object', { fields: [
          f('enable', '启用', 'Enable', 'bool'), f('seed', '种子', 'Seed', 'number', { hint: l('0 = 随机', '0 = random') }),
          f('overlay', '覆盖层', 'Overlay', 'object', { fields: [f('length', '长度', 'Length', 'number', { hint: l('0 = 禁用', '0 = disabled') })] }),
          f('namespace', '命名空间', 'Namespace', 'object', { fields: [
            f('amount', '数量', 'Amount', 'number', { hint: l('0 = 禁用', '0 = disabled') }), f('length', '长度', 'Length', 'number'),
          ] }),
          f('path', '路径', 'Path', 'object', { fields: [
            f('depth', '深度', 'Depth', 'number'), f('length', '长度', 'Length', 'number'),
            f('anti-unzip', '防解压', 'Anti Unzip', 'bool'),
          ] }),
          f('atlas', '纹理图集', 'Atlas', 'object', { fields: [
            f('prefix', '前缀', 'Prefix', 'text'), f('images-per-canvas', '每画布图片数', 'Images Per Canvas', 'number', { hint: l('-1 = 禁用', '-1 = disabled') }),
          ] }),
          f('bypass-textures', '绕过纹理', 'Bypass Textures', 'lines', { hint: l('如 minecraft:block/farmland, @vanilla_textures (每行一个)', 'e.g. minecraft:block/farmland, @vanilla_textures') }),
          f('bypass-models', '绕过模型', 'Bypass Models', 'lines'),
          f('bypass-sounds', '绕过音效', 'Bypass Sounds', 'lines'),
          f('bypass-equipments', '绕过装备', 'Bypass Equipments', 'lines'),
        ] }),
      ] }),
      f('delivery', '分发', 'Delivery', 'object', { fields: [
        f('send-on-join', '进服发送', 'Send On Join', 'bool'),
        f('kick-if-declined', '拒绝则踢出', 'Kick If Declined', 'bool'),
        f('kick-if-failed-to-apply', '应用失败则踢出', 'Kick If Failed To Apply', 'bool'),
        f('prompt', '提示文本', 'Prompt', 'miniText'),
        f('strict-player-uuid-validation', '严格 UUID 校验', 'Strict Player UUID Validation', 'bool'),
        f('auto-upload', '自动上传', 'Auto Upload', 'bool', { hint: l('生成后自动上传, 禁用后需手动 /ce upload', 'Auto-upload on generation, otherwise use /ce upload') }),
        f('resend-on-upload', '上传后重发', 'Resend On Upload', 'bool'),
        f('file-to-upload', '上传文件', 'File To Upload', 'text'),
        f('hosting', '托管方式', 'Hosting', 'listOf', {
          label: l('托管方式', 'Hosting'), hint: l('更改后运行 /ce reload all', 'Run /ce reload all after changing'),
          itemType: { type: 'union', types: CONFIG_HOSTING_TYPES_REF },
        }),
      ] }),
    ] },

    item: { fields: [
      f('client-bound-model', '客户端侧模型 (Premium)', 'Client Bound Model', 'bool', { hint: l('custom-model-data 与 item-model 默认仅在客户端生效', 'Makes CMD and item-model client-side by default') }),
      f('always-use-item-model', '始终使用 item-model', 'Always Use Item Model', 'bool', { hint: l('资源包支持 1.21.1 及以下时同时添加 item-model 优化客户端渲染', 'Adds item-model for packs supporting 1.21.1 or below') }),
      f('always-use-custom-model-data', '始终使用 custom-model-data', 'Always Use Custom Model Data', 'bool'),
      f('always-generate-model-overrides', '始终生成 model overrides', 'Always Generate Model Overrides', 'bool', { hint: l('为 1.21.2+ 资源包也生成旧版 overrides, 兼容 Bedrock 转换器', 'Generate old overrides even for 1.21.2+ packs (Bedrock converters)') }),
      f('non-italic-tag', '非斜体标签', 'Non Italic Tag', 'bool', { hint: l('在物品名称和描述中添加 <!i> 标签', 'Adds the <!i> tag to item names and lore') }),
      f('default-material', '默认材质', 'Default Material', 'text', { hint: l('未指定材质时使用的原版物品', 'Vanilla material used when none is specified'), datalist: 'items' }),
      f('update-triggers', '更新触发器', 'Update Triggers', 'object', { hint: l('物品更新器的触发条件 (性能开销较大, 仅在需要时启用)', 'Item updater triggers (performance-intensive, enable only if needed)'), fields: [
        f('click-in-inventory', '背包内点击', 'Click In Inventory', 'bool', { hint: l('对创造模式玩家无效', "Won't work for players in creative mode") }),
        f('drop', '丢弃', 'Drop', 'bool'), f('pick-up', '拾取', 'Pick Up', 'bool'),
      ] }),
      f('custom-model-data-starting-value', 'CMD 起始值', 'Custom Model Data Starting Value', 'object', { fields: [
        f('default', '默认', 'Default', 'number'),
        f('overrides', '覆盖', 'Overrides', 'kv', { hint: l('键 = 材质名, 值 = 起始值', 'Key = material, value = start value') }),
      ] }),
      f('default-drop-display', '默认掉落显示', 'Default Drop Display', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('format', '格式', 'Format', 'text', { hint: l('如 <arg:count>x <name>', 'e.g. <arg:count>x <name>') }),
      ] }),
      f('data-fixer-upper', '数据修复', 'Data Fixer Upper', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('fallback-version', '回退数据版本', 'Fallback Version', 'number', { hint: l('数据版本号, 见 minecraft.wiki/w/Data_version', 'Data version, see minecraft.wiki/w/Data_version') }),
      ] }),
    ] },

    equipment: { fields: [
      f('sacrificed-vanilla-armor', '牺牲的原版护甲', 'Sacrificed Vanilla Armor', 'object', { hint: l('trim 类型护甲会移除指定原版护甲的全部纹饰', 'Trim-type armor removes all trims from this vanilla armor'), fields: [
        f('type', '类型', 'Type', 'select', { options: ['chainmail', 'iron', 'gold', 'diamond', 'netherite', 'leather', 'turtle'] }),
        f('asset-id', '资源 ID', 'Asset ID', 'text', { hint: l('如 minecraft:chainmail', 'e.g. minecraft:chainmail') }),
        f('humanoid', 'Humanoid 纹理', 'Humanoid', 'text', { hint: l('如 minecraft:trims/entity/humanoid/chainmail', 'e.g. minecraft:trims/entity/humanoid/chainmail') }),
        f('humanoid-leggings', '护腿纹理', 'Humanoid Leggings', 'text'),
      ] }),
    ] },

    block: { fields: [
      f('serverside-blocks', '服务端方块数', 'Serverside Blocks', 'number', { hint: l('需要重启生效, 建议每次增加 1000', 'Restart required; increase by 1000 at a time') }),
      f('sound-system', '音效系统', 'Sound System', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('process-cancelled-events', '处理被取消事件', 'Process Cancelled Events', 'object', { fields: [
          f('step', '踩踏', 'Step', 'bool'), f('break', '破坏', 'Break', 'bool'),
        ] }),
      ] }),
      f('simplify-adventure-break-check', '简化冒险模式挖掘检查', 'Simplify Adventure Break Check', 'bool'),
      f('simplify-adventure-place-check', '简化冒险模式放置检查', 'Simplify Adventure Place Check', 'bool'),
      f('deceive-bukkit-material', '伪装 Bukkit 材质', 'Deceive Bukkit Material', 'object', { hint: l('自定义方块 GetMaterial() 返回值', 'GetMaterial() return value for custom blocks'), fields: [
        f('default', '默认', 'Default', 'text', { datalist: 'items' }),
        f('overrides', '覆盖', 'Overrides', 'kv', { hint: l('键 = 内部真实 ID (如 0, 1~8)', 'Key = internal real ID (e.g. 0, 1~8)') }),
      ] }),
    ] },

    furniture: { fields: [
      f('hide-base-entity', '隐藏基础实体', 'Hide Base Entity', 'bool', { hint: l('隐藏用于存储家具数据的实体 (建议保持启用)', 'Hides the invisible furniture-tracking entity') }),
      f('collision-entity-type', '碰撞实体类型', 'Collision Entity Type', 'select', { options: ['interaction', 'boat'], hint: l('interaction = 最佳性能; boat = 兼容部分反作弊', 'interaction = best performance; boat = anti-cheat compatibility') }),
    ] },

    emoji: { fields: [
      f('contexts', '启用环境', 'Contexts', 'object', { fields: [
        f('chat', '聊天', 'Chat', 'bool'), f('book', '书本', 'Book', 'bool'),
        f('anvil', '铁砧', 'Anvil', 'bool'), f('sign', '告示牌', 'Sign', 'bool'),
      ] }),
      f('max-emojis-per-parse', '单次解析上限', 'Max Emojis Per Parse', 'number', { hint: l('防止解析表情过多的内容造成卡顿', 'Prevent lag from emoji-heavy content') }),
    ] },

    loot: { fields: [
      f('entity-sources', '实体掉落源', 'Entity Sources', 'lines', { hint: l('每行一个实体 ID', 'One entity id per line') }),
    ] },

    image: { fields: [
      f('illegal-characters-filter', '非法字符过滤', 'Illegal Characters Filter', 'object', { hint: l('权限绕过: craftengine.filter.bypass.xxx', 'Bypass permission: craftengine.filter.bypass.xxx'), fields: [
        f('anvil', '铁砧', 'Anvil', 'bool'), f('book', '书本', 'Book', 'bool'),
        f('chat', '聊天', 'Chat', 'bool'), f('command', '命令', 'Command', 'bool'), f('sign', '告示牌', 'Sign', 'bool'),
      ] }),
      f('codepoint-starting-value', '码点起始值', 'Codepoint Starting Value', 'object', { fields: [
        f('default', '默认', 'Default', 'number'),
        f('overrides', '覆盖', 'Overrides', 'kv', { hint: l('键 = 字体, 值 = 起始码点', 'Key = font, value = start codepoint') }),
      ] }),
      f('offset-characters', '偏移字符', 'Offset Characters', 'object', { hint: l('定义 <shift:xxx> 定位使用的 Unicode 字符 (与资源包字体定义匹配); 键 = 偏移量 (-256~256), 值 = 字符', 'Defines the Unicode chars used by <shift:xxx>; key = offset (-256~256), value = char'), fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('font', '字体', 'Font', 'text', { hint: l('默认 minecraft:default', 'Default: minecraft:default') }),
      ] }),
    ] },

    network: { fields: [
      f('disable-chat-report', '禁用聊天举报', 'Disable Chat Report', 'bool', { hint: l('需要重启生效', 'Restart required') }),
      f('disable-item-operations', '禁用物品网络操作', 'Disable Item Operations', 'bool', { hint: l('将禁用 client-bound-data/material 与名称 lore 标签替换', 'Disables client-bound data/material and tag replacement') }),
      f('intercept-packets', '拦截数据包', 'Intercept Packets', 'object', { hint: l('允许第三方插件通过数据包使用 <image> <shift> <global> 标签; 禁用未使用的处理器可降低 Netty 负载', 'Allow third-party plugins to use image/shift/global tags via packets'), fields: [
        f('system-chat', '系统聊天', 'System Chat', 'bool'), f('tab-list', 'Tab 列表', 'Tab List', 'bool'),
        f('player-info', '玩家列表', 'Player Info', 'bool'), f('set-score', '计分板分数', 'Set Score', 'bool'),
        f('actionbar', 'Actionbar', 'Actionbar', 'bool'), f('title', 'Title', 'Title', 'bool'),
        f('bossbar', 'Bossbar', 'Bossbar', 'bool'), f('container', '容器 GUI', 'Container', 'bool'),
        f('team', '团队', 'Team', 'bool'), f('scoreboard', '计分板', 'Scoreboard', 'bool'),
        f('entity-name', '实体名', 'Entity Name', 'bool'), f('armor-stand', '盔甲架 (旧全息)', 'Armor Stand', 'bool'),
        f('text-display', '文本显示 (新全息)', 'Text Display', 'bool'), f('item', '物品', 'Item', 'bool'),
        f('advancement', '进度 Toast', 'Advancement', 'bool'), f('player-chat', '玩家聊天', 'Player Chat', 'bool'),
      ] }),
    ] },

    recipe: { fields: [
      f('enable', '启用', 'Enable', 'bool', { hint: l('启用时插件配方将覆盖原版配方', 'Plugin recipes override vanilla when enabled') }),
      f('disable-vanilla-recipes', '禁用原版配方', 'Disable Vanilla Recipes', 'object', { fields: [
        f('all', '全部禁用', 'All', 'bool', { hint: l('⚠️ 启用时禁用所有原版配方 (与 list 冲突)', '⚠️ Disables ALL vanilla recipes (conflicts with list)') }),
        f('list', '选择性禁用', 'List', 'lines', { hint: l('如 minecraft:wooden_sword (每行一个)', 'e.g. minecraft:wooden_sword (one per line)') }),
      ] }),
      f('ingredient-sources', '额外原料来源', 'Ingredient Sources', 'lines', { hint: l('其他插件提供的原料来源, 如 ItemAdder', 'Ingredient sources from other plugins') }),
      f('unlock-on-ingredient-obtained', '获得原料自动解锁', 'Unlock On Ingredient Obtained', 'bool'),
    ] },

    gui: { fields: [
      f('browser', '物品浏览器', 'Browser', 'object', { fields: [
        f('sounds', '音效', 'Sounds', 'object', { fields: [
          f('change-page', '翻页', 'Change Page', 'text'), f('return-page', '返回', 'Return Page', 'text'),
          f('pick-item', '选择物品', 'Pick Item', 'text'), f('click-button', '点击按钮', 'Click Button', 'text'),
        ] }),
        f('main', '主界面', 'Main', 'object', { fields: [
          f('title', '标题', 'Title', 'miniText'),
          f('page-navigation', '翻页按钮', 'Page Navigation', 'object', { fields: CFG_PAGE_NAV }),
        ] }),
        f('category', '分类界面', 'Category', 'object', { fields: [
          f('title', '标题', 'Title', 'miniText'),
          f('page-navigation', '翻页按钮', 'Page Navigation', 'object', { fields: CFG_PAGE_NAV }),
        ] }),
        f('recipe', '配方界面', 'Recipe', 'object', { fields: [
          f('get-item-icon', '获取物品图标', 'Get Item Icon', 'text'),
          f('cooking-information-icon', '烹饪信息图标', 'Cooking Information Icon', 'text'),
          f('page-navigation', '翻页按钮', 'Page Navigation', 'object', { fields: CFG_PAGE_NAV }),
          f('none', '无配方', 'None', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('blasting', '高炉', 'Blasting', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('smelting', '熔炉', 'Smelting', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('smoking', '烟熏炉', 'Smoking', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('campfire-cooking', '篝火', 'Campfire Cooking', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('crafting', '工作台', 'Crafting', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('stonecutting', '切石机', 'Stonecutting', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('smithing-transform', '锻造台', 'Smithing Transform', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('brewing', '酿造台', 'Brewing', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
        ] }),
      ] }),
    ] },

    'light-system': { fields: [
      f('enable', '启用', 'Enable', 'bool', { hint: l('自定义发光方块的必需设置', 'Required for glowing custom blocks') }),
      f('async-update', '异步更新', 'Async Update', 'bool'),
    ] },

    'chunk-system': { fields: [
      f('cache-system', '缓存系统', 'Cache System', 'bool', { hint: l('降低频繁加载/卸载区块的序列化消耗', 'Reduces serialization cost of frequent chunk loads') }),
      f('compression-method', '压缩方法', 'Compression Method', 'select', { options: [1, 2, 3, 4, 5], hint: l('1=无压缩 2=DEFLATE 3=GZIP 4=LZ4 5=ZSTD', '1=none 2=DEFLATE 3=GZIP 4=LZ4 5=ZSTD') }),
      f('injection', '注入方式', 'Injection', 'object', { fields: [
        f('target', '目标', 'Target', 'select', { options: ['PALETTE', 'SECTION'], hint: l('SECTION = 注入 LevelChunkSection (更快, 实验性); PALETTE = 注入 PalettedContainer', 'SECTION = LevelChunkSection injection (faster, experimental); PALETTE = PalettedContainer') }),
        f('use-fast-method', '快速注入', 'Use Fast Method', 'bool', { hint: l('可能不与某些修改区块类的服务端分支兼容', 'May not work with server forks that alter chunk classes') }),
      ] }),
      f('restore-vanilla-blocks-on-chunk-unload', '卸载时还原原版方块', 'Restore Vanilla Blocks On Chunk Unload', 'bool', { hint: l('防止移除插件后自定义方块变空气 (强烈建议启用)', 'Prevents custom blocks becoming air after plugin removal') }),
      f('restore-custom-blocks-on-chunk-load', '加载时还原自定义方块', 'Restore Custom Blocks On Chunk Load', 'bool', { hint: l('false = 性能模式, true = 兼容模式 (完整状态恢复)', 'false = performance, true = compatibility (full state restore)') }),
      f('sync-custom-blocks-on-chunk-load', '加载时同步自定义方块', 'Sync Custom Blocks On Chunk Load', 'bool', { hint: l('fabric 模组本地编辑地图时的数据同步', 'Syncs data when editing maps with the fabric mod') }),
      f('process-invalid-blocks', '处理无效方块', 'Process Invalid Blocks', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'), f('remove', '移除', 'Remove', 'lines'), f('convert', '转换', 'Convert', 'kv'),
      ] }),
      f('process-invalid-furniture', '处理无效家具', 'Process Invalid Furniture', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'), f('remove', '移除', 'Remove', 'lines'), f('convert', '转换', 'Convert', 'kv'),
      ] }),
    ] },

    'client-optimization': { fields: [
      f('entity-culling', '实体剔除 (Premium)', 'Entity Culling', 'object', { hint: l('需要重启才能完全生效', 'Restart required to fully apply'), fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('ray-tracing', '服务端射线检测', 'Ray Tracing', 'bool', { hint: l('隐藏方块实体/家具, 降低客户端渲染压力', 'Hide block entities/furniture via server-side ray tracing') }),
        f('view-distance', '可视距离', 'View Distance', 'number', { hint: l('-1 = 无限', '-1 = no limit') }),
        f('threads', '线程数', 'Threads', 'number'),
        f('rate-limiting', '限速', 'Rate Limiting', 'object', { fields: [
          f('enable', '启用', 'Enable', 'bool'), f('bucket-size', '桶大小', 'Bucket Size', 'number'),
          f('restore-per-tick', '每 tick 恢复', 'Restore Per Tick', 'number'),
        ] }),
      ] }),
    ] },

    misc: { fields: [
      f('filter-configuration-phase-disconnect', '过滤配置阶段断线日志', 'Filter Configuration Phase Disconnect', 'bool'),
      f('delay-configuration-load', '延迟加载配置', 'Delay Configuration Load', 'bool', { hint: l('延迟到所有插件启动后再读取配置', 'Delays config reading until after all plugins start') }),
      f('inject-packetevents', '注入 PacketEvents', 'Inject PacketEvents', 'bool', { hint: l('解决部分依赖 packetevents 的插件问题', 'Resolves issues with plugins relying on packetevents') }),
    ] },

    debug: { fields: [
      f('common', '通用', 'Common', 'bool'), f('furniture', '家具', 'Furniture', 'bool'),
      f('item', '物品', 'Item', 'bool'), f('resource-pack', '资源包', 'Resource Pack', 'bool'),
      f('block', '方块', 'Block', 'bool'), f('entity-culling', '实体剔除', 'Entity Culling', 'bool'),
      f('packet', '数据包', 'Packet', 'bool'), f('ignored-packets', '忽略的数据包', 'Ignored Packets', 'lines'),
    ] },
  };
  S.config = CONFIG;
  S.configTypes = { term: CONFIG_TERM_TYPES, resolution: CONFIG_RESOLUTION_TYPES, hosting: CONFIG_HOSTING_TYPES };

  // 循环引用类型注册表: 表单引擎通过字符串 key 引用这些类型 (避免 JSON 化/递归问题)
  S.types = {
    conditions: COND_TYPES,
    functions: FN_TYPES,
    lootEntries: LOOT_ENTRY_TYPES,
    lootFunctions: LOOT_FN_TYPES,
    lootTypes: LOOT_TYPES,
    term: CONFIG_TERM_TYPES,
    resolution: CONFIG_RESOLUTION_TYPES,
    hosting: CONFIG_HOSTING_TYPES,
  };

  S.sections = SECTIONS;

  // 注册为全局
  ROOT.CESchemas = S;
})();
