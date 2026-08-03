// v1.0.60 冒烟: Chemdah 序列化数据丢失修复 (start/accept/_raw/flags/switch/引号)
const fs = require('fs');
const vm = require('vm');
const jsyaml = require('js-yaml');

const src = fs.readFileSync('chemdah-interpreter.js', 'utf8');
const sb = { window: {}, console, require, jsyaml };
sb.window.jsyaml = jsyaml;
vm.createContext(sb);
vm.runInContext(src, sb);
const CI = sb.window.ChemdahInterpreter;

let fails = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg);
  if (!cond) fails++;
}

// 1. quest start/accept/_raw 写回
const questYaml = [
  'main_quest:',
  '  meta:',
  '    name: 主任务',
  '  start:',
  '    npc: farmer_npc',
  '    script: |',
  '      give item diamond * 1',
  '  accept:',
  '    script: "run commands"',
  '  trigger_custom:',           // 未知 section → _raw
  '    some_key: some_value',
  '  objectives:',
  '    - id: kill_1',
  '      objective: kill zombie',
].join('\n');
const qp = CI.parseQuest(questYaml);
const qg = CI.generateQuestYAML(qp);
check(qg.includes('start:'), 'quest.start 写回');
check(qg.includes('npc: farmer_npc'), 'quest.start.npc 写回');
check(qg.includes('script: |-') || qg.includes('script: |'), 'quest.start.script 写回');
check(qg.includes('accept:'), 'quest.accept 写回');
check(qg.includes('trigger_custom:'), 'quest._raw section 写回');
check(qg.includes('some_key: some_value'), 'quest._raw 内容写回');
// 重新解析 roundtrip
const qp2 = CI.parseQuest(qg);
const qp2Start = qp2.quests[0].start;
check(qp2Start && qp2Start.npc === 'farmer_npc', 'start roundtrip npc 保留');
check(qp2.quests[0]._raw && qp2.quests[0]._raw.trigger_custom, '_raw roundtrip 保留');

// 2. conversation flags / switch / 引号
const convYaml = [
  '__option__:',
  "  theme: 'chat'",
  'switch_dialog:',
  "  npc id: 'npc1'",
  '  npc: 默认文本',
  '  when:',
  '    - if: score money > 100',
  '      open: rich_dialog',
  '  flags:',
  '    - FORCE_LOOK',
  'plain:',
  '  npc: "hello: world"',
  '  flags:',
  '    - NO_MOVE',
].join('\n');
const cp = CI.parseConversation(convYaml);
check(cp.dialogues.length === 2, '对话解析 2 条');
const sw = cp.dialogues.find(d => d.name === 'switch_dialog');
check(sw && sw.type === 'switch', 'npc+npcId 并存保持 switch 类型');
const cg = CI.generateConversationYAML(cp);
check(cg.includes("npc id: npc1"), 'switch npc id 写回');
check(cg.includes('when:'), 'switch when 写回');
check(cg.includes('FORCE_LOOK'), '对话级 flags 写回');
check(cg.includes('NO_MOVE'), 'plain 对话 flags 写回');
check(cg.includes("npc: 'hello: world'") || cg.includes('npc: "hello: world"'), '含冒号值加引号');

// 3. - 前缀加引号
const dashVal = '- starting with dash';
const dv = sb.jsyaml.load(CI.generateConversationYAML({
  options: { theme: 'chat' },
  dialogues: [{ name: 'd', type: 'dialogue', npcText: dashVal, npcId: '', format: '', flags: [], conditions: [], options: [] }],
}).split('\n').find(l => l.startsWith('  npc:')).replace('  npc: ', ''));
check(dv === dashVal, '前导 - 的值 roundtrip 不丢 (' + dv + ')');

// 4. 含特殊字符的对话名/任务 id 键引号
const oddName = 'my: dialog';
const cg2 = CI.generateConversationYAML({
  options: { theme: 'chat' },
  dialogues: [{ name: oddName, type: 'dialogue', npcText: 'x', npcId: '', format: '', flags: [], conditions: [], options: [] }],
});
check(cg2.includes("'my: dialog':") || cg2.includes('"my: dialog":'), '特殊字符对话名加引号');
const parsedBack = CI.parseConversation(cg2);
check(parsedBack.dialogues[0] && parsedBack.dialogues[0].name === oddName, '特殊对话名 roundtrip');

// 5. 单引号值不破坏 YAML
const quoteYaml = [
  '__option__:',
  "  theme: 'chat'",
  'q:',
  "  npc id: 'farmer''s npc'",
  "  npc: 'it''s fine'",
].join('\n');
const qp3 = CI.parseConversation(quoteYaml);
const qg3 = CI.generateConversationYAML(qp3);
const reParsed = CI.parseConversation(qg3);
check(reParsed.dialogues[0] && reParsed.dialogues[0].npcId === "farmer's npc", '含单引号 npcId roundtrip');
check(reParsed.dialogues[0] && reParsed.dialogues[0].npcText === "it's fine", '含单引号文本 roundtrip');

console.log('fails=' + fails);
process.exit(fails ? 1 : 0);
