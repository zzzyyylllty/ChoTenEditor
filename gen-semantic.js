// Generate semantic display templates for all Kether actions
var actions;
try {
  actions = require('./desc/kether-actions.json');
} catch(e) {
  console.error('Cannot load kether-actions.json. Make sure the file exists at ./desc/kether-actions.json');
  process.exit(1);
}
const fs = require('fs');

const NAME_CN = {
  check: '检查', tell: '发送消息', print: '输出', give: '给予', take: '取出',
  set: '设置', delete: '删除', remove: '移除', create: '创建', spawn: '生成',
  kill: '杀死', damage: '伤害', heal: '治疗', teleport: '传送', play: '播放',
  stop: '停止', wait: '等待', loop: '循环', break: '中断', return: '返回',
  random: '随机数', math: '数学计算', format: '格式化', eval: '表达式计算',
  papi: '变量解析', placeholderapi: '变量解析', command: '执行命令',
  permission: '权限检测', hasPermission: '权限判断', has: '拥有判断',
  item: '物品操作', inventory: '背包操作',
  open: '打开', close: '关闭', click: '点击事件', sound: '音效',
  particle: '粒子效果', title: '标题显示', actionbar: '操作栏', bossbar: 'Boss血条',
  json: 'JSON操作', yaml: 'YAML操作', http: '网络请求',
  if_else: '如果/判断', all: '全部条件', any: '任一条件',
  while: '循环执行', repeat: '重复执行', foreach: '遍历循环', for: '遍历循环',
};

const KW_CN = {
  'as': '以', 'to': '为', 'from': '从', 'in': '于', 'on': '在', 'at': '于',
  'of': '的', 'for': '对于', 'by': '通过', 'with': '使用',
  'then': '则', 'else': '否则', 'and': '与', 'or': '或', 'is': '为',
  'into': '到', 'inside': '位于', 'step': '步进', 'until': '直到',
  'after': '之后', 'before': '之前',
  'add': '增加', 'remove': '移除', 'reset': '重置',
  'set': '设置', 'get': '获取', 'has': '拥有', 'not': '非',
  'all': '全部', 'any': '任意', 'if': '如果', 'self': '自身',
  'temp': '临时', 'temporary': '临时', 'persistent': '持久',
  'true': '是', 'false': '否', 'default': '默认值', 'check': '检查',
  'list': '列表', 'key': '键', 'name': '名称', 'type': '类型',
  'id': '标识', 'uuid': 'UUID', 'count': '数量', 'amount': '数量',
  'total': '总数', 'required': '需求', 'max': '最大', 'min': '最小',
  'main': '主', 'size': '大小', 'run': '运行', 'stop': '停止',
  'hide': '隐藏', 'refresh': '刷新', 'show': '显示',
  'open': '开启', 'close': '关闭', 'cancel': '取消', 'clear': '清空',
  'create': '创建', 'delete': '删除', 'spawn': '生成', 'kill': '杀死',
  'save': '保存', 'load': '加载', 'import': '导入', 'export': '导出',
  'mark': '标记', 'trigger': '触发', 'format': '格式化', 'inline': '内联',
  'console': '控制台', 'player': '玩家', 'op': 'OP', 'task': '任务',
  'goal': '目标', 'challenge': '挑战', 'percent': '百分比',
  'value': '值', 'target': '目标', 'bar': '条', 'cooldown': '冷却',
  'success': '成功', 'pause': '暂停', 'pass': '通过', 'break': '中断',
  'return': '返回', 'function': '函数', 'action': '动作', 'event': '事件',
  'world': '世界', 'location': '坐标', 'position': '位置', 'item': '物品',
  'material': '材质', 'sound': '音效', 'message': '消息',
  'permission': '权限', 'command': '命令', 'number': '数字',
  'string': '文本', 'text': '文本', 'token': '参数', 'variable': '变量',
  'int': '整数', 'double': '小数', 'float': '小数', 'long': '长整数',
  'short': '短整数', 'byte': '字节', 'boolean': '布尔', 'slot': '槽位',
  'array': '数组', 'map': '映射', 'object': '对象', 'json': 'JSON',
  'yaml': 'YAML', 'http': 'HTTP', 'time': '时间', 'date': '日期',
  'hour': '小时', 'minute': '分钟', 'second': '秒', 'day': '天',
  'week': '周', 'month': '月', 'year': '年',
  'x': 'X', 'y': 'Y', 'z': 'Z', 'yaw': '偏航', 'pitch': '俯仰',
  'speed': '速度', 'health': '生命', 'damage': '伤害', 'food': '食物',
  'level': '等级', 'exp': '经验', 'mana': '魔力', 'stamina': '体力',
  'strength': '力量', 'skill': '技能', 'point': '点', 'attribute': '属性',
  'class': '职业', 'quest': '任务', 'dialog': '对话', 'dialogue': '对话',
  'conversation': '对话', 'npc': 'NPC', 'entity': '实体', 'mob': '怪物',
  'block': '方块', 'armor': '护甲', 'weapon': '武器', 'tool': '工具',
  'enchant': '附魔', 'potion': '药水', 'effect': '效果', 'particle': '粒子',
  'title': '标题', 'subtitle': '副标题', 'actionbar': '操作栏',
  'bossbar': 'Boss血条', 'scoreboard': '计分板', 'team': '队伍',
  'objective': '目标', 'sidebar': '侧边栏', 'tab': '列表',
  'header': '头部', 'footer': '底部', 'prefix': '前缀', 'suffix': '后缀',
  'display': '显示', 'color': '颜色', 'format': '格式', 'style': '样式',
  'weight': '权重', 'radius': '半径', 'range': '范围', 'distance': '距离',
  'angle': '角度', 'rotation': '旋转', 'direction': '方向', 'offset': '偏移',
  'origin': '原点', 'center': '中心', 'top': '顶部', 'bottom': '底部',
  'left': '左', 'right': '右', 'front': '前', 'back': '后', 'up': '上', 'down': '下',
  'relative': '相对', 'absolute': '绝对', 'global': '全局', 'local': '局部',
  'private': '私有', 'public': '公有', 'random': '随机',
  'round': '四舍五入', 'ceil': '取上整', 'floor': '取下整', 'abs': '绝对值',
  'sum': '总和', 'sort': '排序', 'reverse': '反转', 'shuffle': '打乱',
  'join': '连接', 'split': '分割', 'slice': '切片',
  'contains': '包含', 'matches': '匹配', 'replace': '替换', 'repeat': '重复',
  'trim': '修剪', 'upper': '大写', 'lower': '小写', 'empty': '空', 'null': '空',
  'none': '无', 'optional': '可选',
  'fly': '飞行', 'walk': '行走', 'swim': '游泳', 'sneak': '潜行',
  'sprint': '冲刺', 'jump': '跳跃', 'glide': '滑翔', 'sleep': '睡眠',
  'attack': '攻击', 'cast': '施法', 'learn': '学习', 'craft': '制作',
  'repair': '修复', 'upgrade': '升级', 'trade': '交易', 'sell': '出售',
  'buy': '购买', 'money': '金钱', 'balance': '余额', 'score': '分数',
  'xp': '经验', 'toggle': '切换', 'switch': '切换', 'enter': '进入',
  'exit': '退出', 'leave': '离开', 'kick': '踢出', 'ban': '封禁',
  'mute': '禁言', 'warn': '警告', 'log': '日志', 'start': '开始',
  'end': '结束', 'finish': '结束', 'complete': '完成', 'fail': '失败',
  'abort': '中止', 'next': '下一', 'prev': '上一', 'last': '最后',
  'first': '第一', 'current': '当前', 'active': '活跃', 'online': '在线',
  'offline': '离线', 'away': '离开', 'busy': '忙碌',
  'address': '地址', 'absorption': '吸收', 'compass': '指南针',
  'exhaustion': '饥饿度', 'gamemode': '游戏模式', 'gravity': '重力',
  'locale': '语言', 'saturation': '饱和度', 'whitelist': '白名单',
  'schematic': '结构', 'animation': '动画', 'controller': '控制器',
  'viewer': '观察者', 'freeze': '冻结', 'tag': '标签', 'use': '使用',
  'look': '看向', 'move': '移动', 'select': '选择', 'passenger': '乘客',
  'still': '静止', 'meta': '元数据', 'data': '数据', 'keys': '键列表',
  'stats': '统计', 'track': '追踪', 'tracking': '追踪中', 'this': '当前',
  'tasks': '任务列表', 'ticks': '刻', 'tick': '刻',
  'mmocore': 'MMOCore', 'mythicmobs': 'MythicMobs', 'skillapi': 'SkillAPI',
  'profile': '档案', 'profiles': '档案',
  'sneaking': '潜行中', 'sprinting': '冲刺中', 'sleeping': '睡眠中',
  'glowing': '发光中', 'blocking': '格挡中', 'flying': '飞行中',
  'gliding': '滑翔中', 'jumping': '跳跃中', 'swimming': '游泳中',
  'riptiding': '激流中', 'dead': '死亡', 'alive': '存活',
  'conversing': '对话中', 'on_guard': '着地', 'ground': '地面',
  'leashed': '拴绳中', 'riptide': '激流',
  'inventory': '背包', 'schem': '结构', 'script': '脚本',
  'talk': '对话', 'wizard': '向导', 'ui': '界面',
  'var': '变量', 'vars': '变量', 'profile': '档案',
  'data': '数据', 'particle': '粒子', 'schematic': '结构',
  'trigger': '触发', 'fetch': '获取', 'workflow': '工作流',
  'progress': '进度', 'value': '值', 'target': '目标',
  'accept': '接受', 'start': '开始', 'finish': '完成',
  'cancel': '取消', 'selected': '已选择',
};

function splitFirstSyntax(syntax) {
  if (!syntax) return '';
  let depth = 0;
  for (let i = 0; i < syntax.length; i++) {
    const ch = syntax[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if ((ch === '|' || ch === '\n' || ch === '\r') && depth === 0) {
      return syntax.substring(0, i).trim();
    }
  }
  return syntax.trim();
}

function isPlaceholder(t) {
  if (/^[<{(]/.test(t) && /[>})]$/.test(t)) return true;
  // Handle (xxx|yyy) and (xxx|yyy (trailing ] stripped)
  if (t.startsWith('(') && (t.endsWith(')') || t.includes('|'))) return true;
  if (t.startsWith('&')) return true;
  return false;
}

function generateSemantic(action) {
  const firstSyn = splitFirstSyntax(action.syntax);
  if (!firstSyn) return '';

  // Split and merge multi-word placeholders
  const rawTokens = firstSyn.split(/\s+/);
  if (rawTokens.length === 0) return '';

  // Step 1: Merge {action list} etc.
  const merged = [];
  for (let ri = 0; ri < rawTokens.length; ri++) {
    const t = rawTokens[ri];
    const next = rawTokens[ri + 1];
    if (t.startsWith('{') && !t.endsWith('}') && !t.includes(')') && next && next.endsWith('}') && !next.startsWith('{') && !next.includes(')')) {
      merged.push(t + ' ' + next);
      ri++;
    } else {
      merged.push(t);
    }
  }

  // Step 2: Process tokens
  // First remove alias suffixes like [ed], [s] (color[ed]->color, hour[s]->hour)
  // Then strip optional markers: leading [ and trailing ] independently
  const tokens = [];
  for (const t of merged) {
    let s = t;
    s = s.replace(/\[\w+\]$/, '');          // remove alias suffix
    if (s.startsWith('[')) s = s.slice(1);  // strip leading [
    else if (s.startsWith('\\[')) s = s.slice(2);
    if (s.startsWith(']')) s = s.slice(1);    // strip leading ] (from [max ]health)
    if (s.endsWith(']')) s = s.slice(0, -1);   // strip trailing ]
    else if (s.endsWith('\\]')) s = s.slice(0, -2);
    if (s) tokens.push(s);
  }

  if (tokens.length === 0) return '';

  // Step 3: Find where the action path ends (first placeholder)
  // For "player" prefixed actions, include ALL non-placeholder prefix as path
  // For other actions, only the first token is the path name
  const isPlayerAction = tokens[0] && tokens[0].toLowerCase() === 'player';
  let pathEnd = 1;
  if (isPlayerAction) {
    // Include player + all following non-placeholder tokens in the path
    for (let i = 0; i < tokens.length; i++) {
      if (isPlaceholder(tokens[i])) break;
      pathEnd = i + 1;
    }
  }

  // Step 4: Generate Chinese name
  let cnName = NAME_CN[action.id];
  if (!cnName) {
    let first = tokens[0];
    const altMatch = first.match(/^\((.+)\)$/);
    if (altMatch) first = altMatch[1].split('|')[0].trim();
    first = first.replace(/\[\w+\]$/, '').toLowerCase();
    cnName = KW_CN[first] || (first.charAt(0).toUpperCase() + first.slice(1));
    // For player actions, include ALL path tokens in the name
    if (isPlayerAction && pathEnd > 1) {
      const rest = tokens.slice(1, pathEnd).map(t => {
        const l = t.toLowerCase();
        return KW_CN[l] || l;
      });
      cnName = cnName + rest.join('');
    }
  }

  // Step 5: Build semantic template starting AFTER the path tokens
  const parts = [cnName];
  let paramIdx = 0;

  for (let i = pathEnd; i < tokens.length; i++) {
    const t = tokens[i];

    if (isPlaceholder(t)) {
      // Determine if it's a select (starts with '(') or action/text
      parts.push('{' + paramIdx + '}');
      paramIdx++;
    } else {
      const lower = t.toLowerCase();
      if (KW_CN[lower]) {
        parts.push(KW_CN[lower]);
      } else {
        parts.push(t);
      }
    }
  }

  let semantic = parts.join(' ');
  semantic = semantic.replace(/\s+/g, ' ').trim();
  return semantic;
}

// Generate for ALL actions
let updatedCount = 0;
for (const mod of actions) {
  for (const act of mod.actions) {
    const semantic = generateSemantic(act);
    if (semantic) {
      act.semantic = semantic;
      updatedCount++;
    }
  }
}

fs.writeFileSync('./desc/kether-actions.json', JSON.stringify(actions, null, 2));
console.log('Generated semantic descriptions for ' + updatedCount + ' out of 295 actions');

// Print samples
console.log('\n=== Samples ===');
const interesting = ['command','profile_data','set','tell','if_else','papi','print','while','repeat','foreach','variable_get','variable_set','bed_spawn','allow_flight','health','location','permission','title','sound','check','element','optional','break','pass','exit','dead','format_time','range','toast','quest_check','particle_normal','schematic','variable','inventory_check','absorption_amount','look','move','tag','freeze','meta','javascript','all','any','not','color','scale','player','address','dead','exp','fly___walk_speed','gamemode','date_hour'];
for (const m of actions) {
  for (const a of m.actions) {
    if (interesting.includes(a.id)) {
      console.log(a.id + ': "' + a.semantic + '"  | ' + a.syntax);
    }
  }
}
