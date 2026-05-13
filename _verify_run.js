function splitSyntaxFirst(syntax) {
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

  // ============================================
  // 语法解析（通用动作参数）
  // ============================================

function parseSyntax(syntax) {
    if (!syntax) return [];
    const first = splitSyntaxFirst(syntax);
    const rawTokens = first.split(/\s+/);
    // 去除动作名中的 [别名] 后缀：color[ed] → color, hour[s] → hour
    if (rawTokens[0]) rawTokens[0] = rawTokens[0].replace(/\[\w+\]$/, '');
    // 合并被空格拆分的花括号参数：{action list} → {action list}
    // 仅合并纯 {word ... word} 形式，排除 ( ) 后缀干扰
    const mergedTokens = [];
    for (let ri = 0; ri < rawTokens.length; ri++) {
      const t = rawTokens[ri];
      const next = rawTokens[ri + 1];
      if (t.startsWith('{') && !t.endsWith('}') && !t.includes(')') && next && next.endsWith('}') && !next.startsWith('{') && !next.includes(')')) {
        mergedTokens.push(t + ' ' + next);
        ri++;
      } else {
        mergedTokens.push(t);
      }
    }
    // 去除可选组标记 [ ]，保留内部内容
    const tokens = [];
    for (const t of mergedTokens) {
      let s = t;
      if (s.startsWith('[')) s = s.slice(1);
      else if (s.startsWith('\\[')) s = s.slice(2);
      if (s.endsWith(']')) s = s.slice(0, -1);
      else if (s.endsWith('\\]')) s = s.slice(0, -2);
      if (s) tokens.push(s);
    }
    const params = [];
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.startsWith('(') && t.endsWith(')')) {
        params.push({ type: 'select', label: '', key: i.toString(), options: t.slice(1, -1).split('|').map(s => s.trim()) });
      } else if (t === '{action}') {
        params.push({ type: 'action', label: '', key: 'action' + i });
      } else if (t === '{action' || t.startsWith('{action')) {
        const rest = t.slice(8, -1);
        params.push({ type: 'action', label: rest || '', key: 'action' + i });
      } else if (t === '{aciton}') {
        // 兼容 typo：{aciton} → 视为 {action}
        params.push({ type: 'action', label: '', key: 'action' + i });
      } else if (t === '{aciton' || t.startsWith('{aciton')) {
        const rest = t.slice(8, -1);
        params.push({ type: 'action', label: rest || '', key: 'action' + i });
      } else if (t.startsWith('<') && t.endsWith('>')) {
        // 兼容 Invero 的 <param> 语法
        const inner = t.slice(1, -1);
        params.push({ type: 'text', label: inner, key: 'param' + i });
      } else if (t.startsWith('{') && t.endsWith('}')) {
        const inner = t.slice(1, -1);
        if (inner === 'int' || inner === 'double' || inner === 'number') {
          params.push({ type: 'text', label: inner, key: 'param' + i });
        } else if (inner === 'token' || inner === 'string') {
          params.push({ type: 'text', label: inner, key: 'param' + i });
        } else if (inner.includes('list')) {
          params.push({ type: 'text', label: inner, key: 'list' + i });
        } else {
          params.push({ type: 'text', label: inner, key: 'param' + i });
        }
      } else if (t.startsWith('{') && !t.endsWith('}')) {
        // {token}) 之类的拆分 token，剥离后缀非字母字符
        var clean = t.slice(1);
        while (clean.length > 0 && !/[\w一-鿿]/.test(clean[clean.length - 1])) {
          clean = clean.slice(0, -1);
        }
        params.push({ type: 'text', label: clean || t.slice(1), key: 'param' + i });
      } else if (t.startsWith('(') && !t.endsWith(')') && t.length > 1) {
        // 处理以 ( 开头的混合 token，如 (to、(by、(percent|bar
        // 提取内部内容创建 select 或 keyword
        const inner = t.slice(1);
        if (inner.includes('|')) {
          params.push({ type: 'select', label: '', key: i.toString(), options: inner.split('|').map(s => s.trim()) });
        } else {
          params.push({ type: 'keyword', label: inner, key: inner, value: inner });
        }
      } else if ((t.endsWith(')') || t.endsWith('}>')) && t.length > 1 && (t.startsWith('<') || t.startsWith('{'))) {
        // 处理以 ) 或 }> 结尾的混合 token，如 <slot)>、{token})
        // 剥离后缀字符
        var clean = t;
        while (clean.length > 1 && (clean.endsWith(')') || clean.endsWith('>') || clean.endsWith('}'))) {
          clean = clean.slice(0, -1);
        }
        if (clean.startsWith('<') && clean.endsWith('>')) {
          params.push({ type: 'text', label: clean.slice(1, -1), key: 'param' + i });
        } else if (clean.startsWith('{') && clean.endsWith('}')) {
          params.push({ type: 'text', label: clean.slice(1, -1), key: 'param' + i });
        } else if (clean.startsWith('<')) {
          params.push({ type: 'text', label: clean.slice(1), key: 'param' + i });
        } else if (clean.startsWith('{')) {
          params.push({ type: 'text', label: clean.slice(1), key: 'param' + i });
        } else {
          params.push({ type: 'keyword', label: t, key: t, value: clean });
        }
      } else if (t.startsWith('&') && t.length > 1) {
        // Aiyatsbus &param → 视为可编辑文本
        params.push({ type: 'text', label: t, key: 'param' + i });
      } else {
        // keyword (e.g., "to", "as", "in", "then", "else")
        params.push({ type: 'keyword', label: t, key: t, value: t });
      }
    }
    return params;
  }

  // ============================================
  // 代码生成
  // ============================================

const data = JSON.parse(require('fs').readFileSync('desc/kether-actions.json','utf8'));
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
        if (p.type === 'text' && p.label && p.label.match(/[)]}>]$/)) {
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
        console.log('\n--- ' + mod.name + '.' + a.id + ' ---');
        console.log('syntax: ' + a.syntax.substring(0, 100).replace(/\n/g, '\\n'));
        params.forEach((p,i) => {
          console.log('  [' + i + '] type=' + p.type + ' label="' + (p.label||'') + '" key="' + (p.key||'') + '" val="' + (p.value||'') + '"');
        });
      }
    });
  });
}