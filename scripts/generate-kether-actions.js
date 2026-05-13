const fs = require('fs');
const path = require('path');

const files = [
  'kether.ts', 'taboolib.ts', 'chemdah.ts', 'adyeshach.ts',
  'aiyatsbus.ts', 'arim.ts', 'dungeonPlus.ts', 'invero.ts',
  'trmenu.ts', 'vulpecula.ts', 'zaphkiel.ts'
];

const dir = 'C:/Users/Administrator/Downloads/TabooLib-guide-main/TabooLib-guide-main/src/components/KetherList/actions';
const modules = [];

for (const file of files) {
  let content = fs.readFileSync(path.join(dir, file), 'utf-8');
  // Remove import lines
  content = content.replace(/^import .*$/gm, '');
  // Remove type annotations (simplified: after const name, remove :Type)
  content = content.replace(/:\s*\w+(?:<[^>]*>)?\s*=\s*/g, ' = ');
  // Remove | after type annotations in object types
  content = content.replace(/:\s*(string|number|boolean|string\[\]|public|private|both)\s*/g, '');
  // Remove export default
  content = content.replace(/^export default \w+;$/gm, '');
  // Trim each line
  const lines = content.split('\n');
  const cleaned = lines.map(l => l.trimEnd()).join('\n');

  // Extract the const assignment value
  const match = cleaned.match(/const\s+\w+\s*=\s*(\{[\s\S]*\})/);
  if (match) {
    try {
      const mod = eval('(' + match[1] + ')');
      modules.push(mod);
      console.log(`OK: ${file} -> ${mod.actions.length} actions`);
    } catch (e) {
      console.error(`FAIL: ${file} - ${e.message}`);
    }
  } else {
    console.error(`NO MATCH: ${file}`);
  }
}

fs.writeFileSync(
  path.join(__dirname, '..', 'desc', 'kether-actions.json'),
  JSON.stringify(modules, null, 2)
);
console.log(`\nDone! Generated ${modules.length} modules with ${modules.reduce((s, m) => s + m.actions.length, 0)} total actions.`);
