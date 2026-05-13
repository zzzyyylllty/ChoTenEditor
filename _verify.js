const fs = require('fs');
const src = fs.readFileSync('kether-editor.js', 'utf8');

// Find splitSyntaxFirst function boundaries
const s1 = src.indexOf('function splitSyntaxFirst(syntax)');
const s2 = src.indexOf('function parseSyntax(syntax)');
if (s1 < 0 || s2 < 0) { console.error('Functions not found'); process.exit(1); }

const splitFn = src.slice(s1, s2).trim();

// Find parseSyntax function boundaries (ends before next function or major section)
const s3 = s2;
let s4 = src.indexOf('function generateCode(blocks)', s3);
if (s4 < 0) s4 = src.indexOf('\n  // =====', s3 + 200);
const parseFn = src.slice(s3, s4).trim();

const fullCode = splitFn + '\n\n' + parseFn + '\n\n' +
`const data = JSON.parse(require('fs').readFileSync('desc/kether-actions.json','utf8'));
const CONTROL = { if_else:1, all:1, any:1, while:1, repeat:1, foreach:1, 'case & when':1 };
let hasIssues = false;

data.forEach(mod => {
  mod.actions.forEach(a => {
    if (CONTROL[a.id]) return;
    try {
      const params = parseSyntax(a.syntax);
      params.forEach(p => {
        if (p.type === 'keyword') {
          const v = p.value || '';
          if (/^[<&{(]/.test(v)) {
            console.log('UNRESOLVED: [' + mod.name + '] ' + a.id + ': keyword "' + v + '" in "' + a.syntax.substring(0,60) + '"');
            hasIssues = true;
          }
        }
        if (p.type === 'text' && p.label && p.label.match(/[)\]}>]$/)) {
          console.log('TRAILING_CHAR: [' + mod.name + '] ' + a.id + ': label="' + p.label + '" in "' + a.syntax.substring(0,60) + '"');
          hasIssues = true;
        }
      });
    } catch(e) {
      console.log('ERROR: [' + mod.name + '] ' + a.id + ': ' + e.message);
      hasIssues = true;
    }
  });
});

if (!hasIssues) {
  console.log('ALL OK');
  // Debug complex actions
  const debug = ['case & when','check','variable_set','location','title','profile_data','ui','wizard','workflow_fetch','icon','math','foreach','quest_stats','variable'];
  data.forEach(mod => {
    mod.actions.forEach(a => {
      if (debug.includes(a.id)) {
        const params = parseSyntax(a.syntax);
        console.log('\\n--- ' + mod.name + '.' + a.id + ' ---');
        console.log('syntax: ' + a.syntax.substring(0, 100).replace(/\\n/g, '\\\\n'));
        params.forEach((p,i) => {
          console.log('  [' + i + '] type=' + p.type + ' label="' + (p.label||'') + '" key="' + (p.key||'') + '" val="' + (p.value||'') + '"');
        });
      }
    });
  });
}`;

const outPath = '_verify_run.js';
fs.writeFileSync(outPath, fullCode);
console.log('Written to ' + outPath);
