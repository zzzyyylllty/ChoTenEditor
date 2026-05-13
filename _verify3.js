const fs = require('fs');

// Extract splitSyntaxFirst and parseSyntax from the actual file
const lines = fs.readFileSync('kether-editor.js', 'utf8').split('\n');
const fnLines = lines.slice(347, 468); // 0-indexed, line 348-467
const fnCode = fnLines.join('\n');

eval(fnCode);

const data = JSON.parse(fs.readFileSync('desc/kether-actions.json', 'utf8'));
const CONTROL = { if_else: 1, all: 1, any: 1, while: 1, repeat: 1, foreach: 1, 'case & when': 1 };

let hasIssues = false;

data.forEach(mod => {
  mod.actions.forEach(a => {
    if (CONTROL[a.id]) return;

    try {
      const params = parseSyntax(a.syntax);

      params.forEach((p, idx) => {
        if (p.type === 'keyword') {
          const v = p.value || '';
          if (/^[<&{(]/.test(v)) {
            console.log(`UNRESOLVED: [${mod.name}] ${a.id}: keyword "${v}"`);
            console.log(`  syntax: ${a.syntax.substring(0, 80)}`);
            hasIssues = true;
          }
        }
        if (p.type === 'text' && p.label && p.label.includes(')')) {
          console.log(`PAREN_SUFFIX: [${mod.name}] ${a.id}: label="${p.label}"`);
          console.log(`  syntax: ${a.syntax.substring(0, 80)}`);
          hasIssues = true;
        }
      });
    } catch (e) {
      console.log(`ERROR: [${mod.name}] ${a.id}: ${e.message}`);
      hasIssues = true;
    }
  });
});

if (!hasIssues) {
  console.log('ALL 295 ACTIONS PARSED OK');

  // Print detailed debug for complex actions
  const debug = ['case & when', 'check', 'variable_set', 'location', 'title', 'profile_data', 'ui', 'wizard', 'workflow_fetch', 'icon'];
  data.forEach(mod => {
    mod.actions.forEach(a => {
      if (debug.includes(a.id)) {
        const params = parseSyntax(a.syntax);
        console.log(`\n--- ${mod.name}.${a.id} ---`);
        console.log(`syntax: ${a.syntax.substring(0, 100)}`);
        params.forEach((p, i) => {
          console.log(`  [${i}] type=${p.type} label="${p.label || ''}" key="${p.key || ''}" value="${p.value || ''}"`);
        });
      }
    });
  });
}
