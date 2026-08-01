// CE round-trip regression: parse -> generateYAML -> parse, deep compare
// Usage: node _ce_roundtrip.js [dir]   (default: E:\MC\tra\Ets\plugins\CraftEngine)
const fs = require('fs');
const path = require('path');
const jsyaml = require('js-yaml');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'craftengine-interpreter.js'), 'utf8');
const sandbox = { jsyaml, console, require };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const CEI = sandbox.CraftEngineInterpreter;

const ROOT = process.argv[2] || 'E:\\MC\\tra\\Ets\\plugins\\CraftEngine';
let pass = 0, fail = 0, skip = 0, missing = 0, dataErr = 0;
const failures = [];

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.ya?ml$/i.test(ent.name)) out.push(p);
  }
  return out;
}

function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!(k in b)) return false;
    if (!deepEq(a[k], b[k])) return false;
  }
  return true;
}

function countComments(text) {
  return (text.match(/^\s*#/gm) || []).length;
}

const files = walk(ROOT, []);
for (const f of files) {
  let content;
  try { content = fs.readFileSync(f, 'utf8'); } catch (e) { skip++; continue; }
  let det;
  try { det = CEI.detectFileType(content, f); } catch (e) { det = 'error'; }
  if (det !== 'craftengine') { skip++; continue; }
  const origComments = countComments(content);
  try {
    const parsed = CEI.parse(content);
    if (parsed.error) { dataErr++; continue; } // 源文件本身 YAML 损坏 (重复键等), 非代码缺陷
    const out = CEI.generateYAML(parsed);
    const reparsed = CEI.parse(out);
    const a = stripMeta(parsed), b = stripMeta(reparsed);
    if (!deepEq(a, b)) {
      fail++;
      failures.push(f + ' semantic mismatch');
      continue;
    }
    if (countComments(out) < origComments) {
      missing += origComments - countComments(out);
      fail++;
      failures.push(f + ' lost ' + (origComments - countComments(out)) + ' comments');
      continue;
    }
    pass++;
  } catch (e) {
    fail++;
    failures.push(f + ' ERROR: ' + e.message);
  }
}

function stripMeta(p) {
  const s = { sections: [] };
  for (const sec of p.sections) {
    const ss = { key: sec.key, entries: [] };
    for (const en of sec.entries) {
      const e = { key: en.key };
      if (typeof en.data === 'object' && en.data !== null) e.data = en.data;
      else e.data = en.data;
      ss.entries.push(e);
    }
    s.sections.push(ss);
  }
  return s;
}

console.log('files=' + files.length + ' pass=' + pass + ' fail=' + fail + ' skip=' + skip + ' dataErr=' + dataErr + ' missing=' + missing);
if (failures.length) {
  console.log('--- failures ---');
  failures.slice(0, 20).forEach(x => console.log(x));
  process.exit(1);
}
