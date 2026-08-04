// ============================================
// Chemdah 插件解释器 — 核心模块 v1.0
// 功能：类型检测、对话解析、可视化渲染、双向同步
// ============================================

window.ChemdahInterpreter = (() => {
  'use strict';

  // ============================================
  // 常量
  // ============================================
  const TYPES = {
    CONVERSATION: 'conversation',
    QUEST: 'quest',
    UNKNOWN: 'unknown',
  };

  // 预设对话主题列表
  const PRESET_THEMES = ['chat', 'chest', 'yosin-movie', 'bedrock'];
  // 预设 flags
  const PRESET_FLAGS = [
    'FORCE_LOOK', 'FORCE_DISPLAY', 'LOOK_PLAYER',
    'NO_EFFECT', 'NO_EFFECT:SLOW', 'NO_EFFECT:BLINDNESS',
    'NO_EFFECT:SOUND', 'NO_EFFECT:PARTICLE', 'NO_MOVE', 'NO_SKIP',
  ];

  // localStorage key
  const STORAGE_KEY = 'chemdahTypeOverrides';

  // ============================================
  // 类型覆盖设置（持久化）
  // ============================================
  let _overrides = null;

  function _loadOverrides() {
    if (_overrides) return _overrides;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _overrides = raw ? JSON.parse(raw) : {};
    } catch { _overrides = {}; }
    return _overrides;
  }

  function _saveOverrides() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_overrides));
    } catch {}
  }

  /** 设置类型覆盖 */
  function setTypeOverride(path, type) {
    const o = _loadOverrides();
    if (type && type !== 'auto') {
      o[path] = type;
    } else {
      delete o[path];
    }
    _saveOverrides();
  }

  /** 获取覆盖类型（没有则返回 null） */
  function getTypeOverride(path) {
    const o = _loadOverrides();
    // 先检查精确路径匹配
    if (o[path]) return o[path];
    // 再检查父目录匹配
    const parts = path.replace(/\\/g, '/').split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const dir = parts.slice(0, i).join('/');
      if (o[dir]) return o[dir];
    }
    return null;
  }

  /** 获取所有覆盖 */
  function getAllOverrides() {
    return { ..._loadOverrides() };
  }

  /** 移除覆盖 */
  function removeTypeOverride(path) {
    const o = _loadOverrides();
    delete o[path];
    _saveOverrides();
  }

  // ============================================
  // 项目类型检测
  // ============================================

  /**
   * 检测项目目录下是否存在 conversation / quest 目录
   * 返回 { hasConversation, hasQuest, types: [...] }
   */
  async function detectProjectTypes(projectPath) {
    const result = { hasConversation: false, hasQuest: false, types: [] };

    if (!projectPath || !window.electronAPI) return result;

    try {
      const entries = await window.electronAPI.readdir(projectPath);
      if (!entries.success) return result;

      for (const f of entries.files) {
        if (!f.isDirectory) continue;
        const name = f.name.toLowerCase();
        if (name === 'conversation') result.hasConversation = true;
        if (name === 'quest') result.hasQuest = true;
      }
    } catch {}

    if (result.hasConversation) result.types.push(TYPES.CONVERSATION);
    if (result.hasQuest) result.types.push(TYPES.QUEST);

    return result;
  }

  /**
   * 检测单个文件的类型
   * 优先检查用户覆盖 → 目录路径 → 内容启发式
   */
  function detectFileType(filePath, content) {
    // 1. 检查用户覆盖
    const override = getTypeOverride(filePath);
    if (override) return override;

    // 2. 根据目录路径判断
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    if (/\/conversation\//.test(normalized)) return TYPES.CONVERSATION;
    if (/\/quest\//.test(normalized)) return TYPES.QUEST;

    // 3. 内容启发式检测（需要 YAML 内容）
    if (!content || content.trim().length === 0) return TYPES.UNKNOWN;

    try {
      const lines = content.split('\n');
      const text = content;

      // conversation 特征：有 __option__ 或 "npc id:" 或 "player:"
      const hasOption = /__option__\s*:/.test(text);
      const hasNpcId = /\n\s+npc\s+id\s*:/.test(text);
      const hasPlayer = /\n\s+player\s*:/.test(text);
      const hasNPC = /\n\s+npc\s*:[|>\s]/.test(text);

      if (hasOption || hasNpcId || (hasPlayer && hasNPC)) {
        return TYPES.CONVERSATION;
      }

      // quest 特征（常见字段）
      const questPatterns = [
        /\n\s*(quest|mission|task)_?(id|name|title)?\s*:/i,
        /\n\s*(start|accept)_(npc|trigger)\s*:/i,
        /\n\s*(objective|goal|stage)s?\s*:/i,
        /\n\s*reward\s*:/i,
      ];
      let questScore = 0;
      for (const p of questPatterns) {
        if (p.test(text)) questScore++;
      }
      if (questScore >= 2) return TYPES.QUEST;
    } catch {}

    return TYPES.UNKNOWN;
  }

  // ============================================
  // 对话文件解析器
  // ============================================

  /**
   * 解析对话 YAML 为结构化数据
   * 返回 { options, dialogues }
   */
  function parseConversation(content) {
    const result = {
      options: { theme: 'chat', title: '', flags: [] },
      dialogues: [],
    };

    if (!content || !content.trim()) return result;

    let data;
    try {
      data = jsyaml.load(content);
    } catch (e) {
      console.warn('[ChemdahInterpreter] YAML 解析失败，尝试容错解析:', e.message);
      return { error: e.message, options: result.options, dialogues: [] };
    }

    if (!data || typeof data !== 'object') return result;

    // 1. 解析 __option__
    if (data.__option__) {
      const opt = data.__option__;
      if (opt.theme) result.options.theme = String(opt.theme);
      if (opt.title) result.options.title = String(opt.title);
      if (Array.isArray(opt.flags)) {
        result.options.flags = opt.flags.map(String);
      } else if (opt.flags) {
        result.options.flags = [String(opt.flags)];
      }
      delete data.__option__;
    }

    // 2. 解析每个对话条目
    for (const [name, entry] of Object.entries(data)) {
      if (!entry || typeof entry !== 'object') continue;
      if (name.startsWith('__') && name.endsWith('__')) continue; // skip YAML directives

      const dialogue = {
        name,
        type: 'dialogue',   // 'dialogue' | 'switch'
        npcText: '',
        npcId: '',
        format: 'generic',
        flags: [],
        conditions: [],      // for switch type
        options: [],         // for dialogue type (player replies)
        _raw: {},            // 无法识别的字段, 编辑后原样写回
      };

      // 收集对话条目级未知字段 (npc/when/player 等已知字段之外的), 防止编辑后丢失
      {
        const knownKeys = ['npc', 'npcId', 'npc id', 'when', 'player', 'format', 'flags'];
        for (const ek of Object.keys(entry)) {
          if (!knownKeys.includes(ek)) dialogue._raw[ek] = entry[ek];
        }
      }

      // 检测对话类型
      if (entry.npcId || entry['npc id']) {
        dialogue.type = 'switch';
        dialogue.npcId = entry.npcId || entry['npc id'] || '';
      }

      if (entry.npc) {
        dialogue.npcText = String(entry.npc);
        // 已有 npc id 时保持 switch 类型(npc 是 switch 的默认文本), 否则是普通对话
        if (!dialogue.npcId) dialogue.type = 'dialogue';
      }

      if (entry.format) dialogue.format = String(entry.format);
      if (entry.flags) {
        dialogue.flags = Array.isArray(entry.flags) ? entry.flags.map(String) : [String(entry.flags)];
      }

      // switch 类型的条件分支
      if (entry.when && Array.isArray(entry.when)) {
        for (const w of entry.when) {
          if (w && typeof w === 'object') {
            dialogue.conditions.push({
              if: w.if !== undefined ? String(w.if) : 'true',
              open: w.open !== undefined ? String(w.open) : '',
            });
          } else if (typeof w === 'string') {
            dialogue.conditions.push({ if: 'true', open: w });
          }
        }
      }

      // dialogue 类型的玩家选项
      if (entry.player && Array.isArray(entry.player)) {
        for (const p of entry.player) {
          if (p && typeof p === 'object') {
            dialogue.options.push({
              if: p.if !== undefined ? String(p.if) : null,
              reply: p.reply !== undefined ? String(p.reply) : '',
              then: p.then !== undefined ? String(p.then) : '',
            });
          }
        }
      }

      // 也支持 switch 类型有 player（如带条件的 NPC 对话）
      if (dialogue.type === 'switch' && entry.player && Array.isArray(entry.player)) {
        for (const p of entry.player) {
          if (p && typeof p === 'object') {
            dialogue.options.push({
              if: p.if !== undefined ? String(p.if) : null,
              reply: p.reply !== undefined ? String(p.reply) : '',
              then: p.then !== undefined ? String(p.then) : '',
            });
          }
        }
      }

      result.dialogues.push(dialogue);
    }

    return result;
  }

  // ============================================
  // 对话可视化渲染
  // ============================================

  function _escHtml(text) {
    if (!text) return '';
    const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, x => m[x]);
  }

  function _textToLines(text) {
    if (!text) return [];
    return String(text).split('\n');
  }

  /**
   * 渲染对话文件的可视化编辑界面
   */
  function renderConversationVisual(parsed, containerEl) {
    if (!containerEl) return;

    // 如果有解析错误
    if (parsed.error) {
      containerEl.innerHTML = `
        <div class="cv-error-banner">
          <span class="cv-error-icon">⚠️</span>
          <div>
            <strong>${I18N.t('chemdah.yamlError')}</strong>
            <p>${_escHtml(parsed.error)}</p>
            <p>${I18N.t('chemdah.yamlErrorHint')}</p>
          </div>
        </div>
      `;
      return;
    }

    const { options, dialogues } = parsed;
    const viewMode = containerEl._cvViewMode || 'card';

    let html = '<div class="cv-container">';

    // === 左侧主内容区 ===
    html += '<div class="cv-main-content">';

    // === 文件选项面板 ===
    html += _renderOptionsPanel(options);

    // === 对话列表 / 思维导图 ===
    if (viewMode === 'mindmap') {
      html += '<div class="cv-mindmap-wrapper"><svg class="cv-mindmap-svg"></svg></div>';
    } else {
      html += '<div class="cv-dialogue-list">';
      html += `<div class="cv-section-header">
        <h3>${I18N.t('chemdah.dialoguesHeader')} <span class="cv-count">${dialogues.length}</span></h3>
        <button class="cv-btn cv-btn-sm cv-btn-primary" data-action="add-dialogue">${I18N.t('chemdah.addDialogue')}</button>
      </div>`;

      if (dialogues.length === 0) {
        html += '<div class="cv-empty">' + I18N.t('chemdah.noDialogues') + '</div>';
      } else {
        for (const d of dialogues) {
          html += _renderDialogueCard(d);
        }
      }
      html += '</div>'; // cv-dialogue-list
    }

    // === 底部操作栏 ===
    const toggleLabel = viewMode === 'mindmap' ? I18N.t('chemdah.cardView') : I18N.t('chemdah.mindmapView');
    const toggleCls = viewMode === 'mindmap' ? 'cv-btn-primary' : 'cv-btn-secondary';
    html += `<div class="cv-toolbar">
      <button class="cv-btn cv-btn-primary" data-action="sync-to-source">${I18N.t('chemdah.syncToSource')}</button>
      <label class="ke-auto-sync-toggle" style="font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;margin-left:8px;user-select:none;"><input type="checkbox" data-action="toggle-visual-autosync" ${window.__keAutoSync ? 'checked' : ''}> ${I18N.t('chemdah.autoSync')}</label>
      <span class="cv-toolbar-hint">${I18N.t('chemdah.syncHint')}</span>
      <button class="cv-btn cv-btn-sm ${toggleCls}" data-action="toggle-view" style="margin-left:auto">${toggleLabel}</button>
    </div>`;

    html += '</div>'; // cv-main-content

    // === 右侧对话导航栏（思维导图模式下隐藏） ===
    if (viewMode !== 'mindmap') {
      html += '<div class="cv-sidebar">';
      html += '<div class="cv-sidebar-header">' + I18N.t('chemdah.dialogueNav') + '</div>';
      html += '<div class="cv-sidebar-list">';
      for (const d of dialogues) {
        const typeClass = d.type === 'switch' ? 'switch' : 'dialogue';
        const typeLabel = d.type === 'switch' ? 'S' : 'D';
        html += `<div class="cv-sidebar-item" data-action="sidebar-nav" data-sidebar-dialogue="${_escHtml(d.name)}" data-tip="${_escHtml(d.name)}">
          <span class="cv-sidebar-type ${typeClass}">${typeLabel}</span>
          <span class="cv-sidebar-name">${_escHtml(d.name)}</span>
        </div>`;
      }
      html += '</div>'; // cv-sidebar-list
      html += '</div>'; // cv-sidebar
    }

    html += '</div>'; // cv-container

    containerEl.innerHTML = html;

    // 如果是思维导图模式，初始化导图
    if (viewMode === 'mindmap') {
      const svgEl = containerEl.querySelector('.cv-mindmap-svg');
      if (svgEl) _renderMindMapSVG(parsed, svgEl, containerEl);
    }

    // 绑定事件
    _bindConversationEvents(containerEl, parsed);
  }

  function _renderOptionsPanel(options) {
    let html = '<div class="cv-options-panel">';
    html += '<div class="cv-section-header"><h3>' + I18N.t('chemdah.fileOptions') + '</h3></div>';
    html += '<div class="cv-options-grid">';

    // Theme
    html += '<div class="cv-field">';
    html += '<label>' + I18N.t('chemdah.theme') + '</label>';
    const themeVal = _escHtml(options.theme || 'chat');
    const isPreset = PRESET_THEMES.includes(themeVal);
    html += `<div class="cv-select-wrapper">
      <select class="cv-select" data-field="options.theme">
        <option value="">${I18N.t('chemdah.customTheme')}</option>
        ${PRESET_THEMES.map(t =>
          `<option value="${t}"${t === themeVal ? ' selected' : ''}>${t}</option>`
        ).join('')}
      </select>
      <input class="cv-input cv-theme-custom${isPreset ? ' hidden' : ''}"
        data-field="options.theme.custom" value="${isPreset ? '' : themeVal}"
        placeholder="${I18N.t('chemdah.customThemePlaceholder')}">
    </div>`;
    html += '</div>';

    // Title
    html += '<div class="cv-field">';
    html += '<label>' + I18N.t('chemdah.title') + '</label>';
    html += `<input class="cv-input" data-field="options.title" value="${_escHtml(options.title || '')}" placeholder="${I18N.t('chemdah.optionalTitle')}">`;
    html += '</div>';

    // Flags
    html += '<div class="cv-field cv-field-wide">';
    html += '<label>' + I18N.t('chemdah.flags') + '</label>';
    html += '<div class="cv-flags-container">';
    // 已有 flags
    if (options.flags && options.flags.length > 0) {
      for (const f of options.flags) {
        html += `<span class="cv-flag" data-tag="${_escHtml(f)}">
          ${_escHtml(f)}
          <span class="cv-flag-remove" data-action="remove-flag">&times;</span>
        </span>`;
      }
    }
    html += `<select class="cv-flag-add" data-action="add-flag">
      <option value="">${I18N.t('chemdah.addFlag')}</option>
      ${PRESET_FLAGS.map(f =>
        `<option value="${f}">${f}</option>`
      ).join('')}
      <option value="__custom__">${I18N.t('chemdah.custom')}</option>
    </select>`;
    html += '</div></div>';

    html += '</div></div>';
    return html;
  }

  function _renderDialogueCard(d) {
    const isSwitch = d.type === 'switch';
    const typeLabel = isSwitch ? I18N.t('chemdah.switch') : I18N.t('chemdah.dialogue');
    const typeClass = isSwitch ? 'cv-type-switch' : 'cv-type-dialogue';
    // 预览：显示简短信息
    let preview = '';
    if (isSwitch) {
      const target = d.conditions.length > 0 ? d.conditions[0].open : '';
      preview = target ? `→ ${target}` : I18N.t('chemdah.noCondition');
    } else {
      const optCount = d.options.length;
      const npcFirst = d.npcText ? d.npcText.split('\n')[0].substring(0, 30) : '';
      preview = npcFirst || I18N.t('chemdah.optionCount', {count: optCount});
    }

    let html = `<div class="cv-dialogue-card collapsed" data-dialogue="${_escHtml(d.name)}">`;
    html += `<div class="cv-dialogue-header">
      <span class="cv-header-toggle-area" data-action="toggle-card">
        <span class="cv-toggle-arrow">▶</span>
        <span class="cv-card-preview">${_escHtml(preview)}</span>
      </span>
      <span class="cv-dialogue-name">
        <input class="cv-dialogue-name-input" value="${_escHtml(d.name)}"
          data-field="dialogue.name" data-dialogue="${_escHtml(d.name)}">
      </span>
      <span class="cv-type-badge ${typeClass}">${typeLabel}</span>
      <div class="cv-dialogue-actions">
        <button class="cv-btn-icon" data-action="delete-dialogue" data-dialogue="${_escHtml(d.name)}"
          data-tip="${I18N.t('chemdah.deleteDialogue')}">&times;</button>
      </div>
    </div>`;

    if (isSwitch) {
      // SWITCH 类型：NPC ID + 条件分支
      html += '<div class="cv-dialogue-body">';
      html += `<div class="cv-body-dialogue-id">${I18N.t('chemdah.dialogueIdPrefix', {id: _escHtml(d.name)})}</div>`;
      html += '<div class="cv-field">';
      html += '<label>' + I18N.t('chemdah.npcId') + '</label>';
      html += `<input class="cv-input cv-input-mono" data-field="dialogue.npcId"
        data-dialogue="${_escHtml(d.name)}" value="${_escHtml(d.npcId)}" placeholder="${I18N.t('chemdah.npcIdPlaceholder')}">`;
      html += '</div>';

      // 条件分支
      html += `<div class="cv-conditions" data-dialogue="${_escHtml(d.name)}">`;
      html += '<div class="cv-sub-header">';
      html += '<label>' + I18N.t('chemdah.whenBranches') + '</label>';
      html += `<button class="cv-btn cv-btn-xs cv-btn-secondary" data-action="add-condition"
        data-dialogue="${_escHtml(d.name)}">${I18N.t('chemdah.addBranch')}</button>`;
      html += '</div>';

      if (d.conditions.length === 0) {
        html += '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.noWhenBranches') + '</div>';
      } else {
        for (let i = 0; i < d.conditions.length; i++) {
          html += _renderConditionBranch(d.name, i, d.conditions[i]);
        }
      }
      html += '</div>'; // cv-conditions
      html += '</div>'; // cv-dialogue-body

      // switch 类型也可能有 player 选项
      if (d.options && d.options.length > 0) {
        html += '<div class="cv-dialogue-section">';
        html += _renderPlayerOptions(d.name, d.options);
        html += '</div>';
      }

    } else {
      // 普通对话类型
      html += '<div class="cv-dialogue-body">';
      html += `<div class="cv-body-dialogue-id">${I18N.t('chemdah.dialogueIdPrefix', {id: _escHtml(d.name)})}</div>`;

      // NPC 对话文本
      html += '<div class="cv-field cv-field-wide">';
      html += '<label>' + I18N.t('chemdah.npcText') + '</label>';
      const npcLines = _textToLines(d.npcText);
      html += `<textarea class="cv-textarea" data-field="dialogue.npcText"
        data-dialogue="${_escHtml(d.name)}" rows="${Math.max(3, npcLines.length)}"
        placeholder="${I18N.t('chemdah.npcTextPlaceholder')}">${_escHtml(d.npcText)}</textarea>`;
      html += '</div>';

      // Format
      html += '<div class="cv-field">';
      html += '<label>' + I18N.t('chemdah.format') + '</label>';
      html += `<input class="cv-input" data-field="dialogue.format"
        data-dialogue="${_escHtml(d.name)}" value="${_escHtml(d.format)}" placeholder="generic">`;
      html += '</div>';

      // Flags per dialogue
      if (d.flags && d.flags.length > 0) {
        html += '<div class="cv-field">';
        html += '<label>' + I18N.t('chemdah.tags') + '</label>';
        html += `<span class="cv-tag-list">${d.flags.map(f =>
          `<span class="cv-flag cv-flag-sm">${_escHtml(f)}</span>`
        ).join('')}</span>`;
        html += '</div>';
      }

      html += '</div>'; // cv-dialogue-body

      // 玩家选项
      html += '<div class="cv-dialogue-section">';
      html += _renderPlayerOptions(d.name, d.options);
      html += '</div>';
    }

    html += '</div>'; // cv-dialogue-card
    return html;
  }

  function _renderConditionBranch(dialogueName, index, cond) {
    let html = `<div class="cv-condition" data-dialogue="${_escHtml(dialogueName)}" data-index="${index}">`;
    html += '<div class="cv-condition-row">';
    html += '<span class="cv-condition-label">' + I18N.t('chemdah.ifCondition') + '</span>';
    html += `<input class="cv-input cv-input-mono" data-field="condition.if"
      data-dialogue="${_escHtml(dialogueName)}" data-index="${index}"
      value="${_escHtml(cond.if)}" placeholder="${I18N.t('chemdah.conditionPlaceholder')}">`;
    html += '</div>';
    html += '<div class="cv-condition-row">';
    html += '<span class="cv-condition-label">' + I18N.t('chemdah.openJump') + '</span>';
    html += `<input class="cv-input" data-field="condition.open"
      data-dialogue="${_escHtml(dialogueName)}" data-index="${index}"
      value="${_escHtml(cond.open)}" placeholder="${I18N.t('chemdah.targetDialoguePlaceholder')}">`;
    html += `<button class="cv-btn-icon cv-btn-icon-danger" data-action="delete-condition"
      data-dialogue="${_escHtml(dialogueName)}" data-index="${index}" data-tip="${I18N.t('chemdah.deleteBranch')}">&times;</button>`;
    html += '</div>';
    html += '</div>';
    return html;
  }

  function _renderPlayerOptions(dialogueName, options) {
    let html = '<div class="cv-player-options"';
    html += ` data-dialogue="${_escHtml(dialogueName)}">`;
    html += '<div class="cv-sub-header">';
    html += '<label>' + I18N.t('chemdah.playerOptions') + '</label>';
    html += `<button class="cv-btn cv-btn-xs cv-btn-secondary" data-action="add-option"
      data-dialogue="${_escHtml(dialogueName)}">${I18N.t('chemdah.addOption')}</button>`;
    html += '</div>';

    if (!options || options.length === 0) {
      html += '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.noOptions') + '</div>';
    } else {
      for (let i = 0; i < options.length; i++) {
        html += _renderPlayerOption(dialogueName, i, options[i]);
      }
    }

    html += '</div>';
    return html;
  }

  function _renderPlayerOption(dialogueName, index, opt) {
    let html = `<div class="cv-player-option" data-dialogue="${_escHtml(dialogueName)}" data-index="${index}">`;

    // 头部：条件和回复
    html += '<div class="cv-option-header">';
    if (opt.if) {
      html += `<div class="cv-option-if-row">
        <span class="cv-condition-label">${I18N.t('chemdah.condition')}</span>
        <input class="cv-input cv-input-mono cv-input-sm" data-field="option.if"
          data-dialogue="${_escHtml(dialogueName)}" data-index="${index}"
          value="${_escHtml(opt.if)}">
      </div>`;
    }
    html += `<div class="cv-option-reply-row">
      <span class="cv-option-reply-icon">💬</span>
      <input class="cv-input cv-option-reply-input" data-field="option.reply"
        data-dialogue="${_escHtml(dialogueName)}" data-index="${index}"
        value="${_escHtml(opt.reply)}" placeholder="${I18N.t('chemdah.optionTextPlaceholder')}">
    </div>`;
    html += '</div>';

    // Then 脚本
    const thenLines = _textToLines(opt.then);
    html += `<div class="cv-option-then">
      <label class="cv-label-sm">
        <span class="cv-toggle-btn" data-action="toggle-then-vis"
          data-dialogue="${_escHtml(dialogueName)}" data-index="${index}">▶</span>
        ${I18N.t('chemdah.thenScript')}
      </label>
      <textarea class="cv-textarea cv-textarea-code" data-field="option.then"
        data-dialogue="${_escHtml(dialogueName)}" data-index="${index}"
        rows="${Math.max(2, thenLines.length)}" placeholder="${I18N.t('chemdah.ketherScriptPlaceholder')}">${_escHtml(opt.then)}</textarea>
    </div>`;

    // 删除按钮
    html += `<button class="cv-btn-icon cv-btn-icon-danger cv-option-delete"
      data-action="delete-option"
      data-dialogue="${_escHtml(dialogueName)}" data-index="${index}" data-tip="${I18N.t('chemdah.deleteOption')}">&times;</button>`;

    html += '</div>';
    return html;
  }

  // ============================================
  // 对话编辑器事件绑定
  // ============================================

  function _bindConversationEvents(container, parsed) {
    // 清除上次的点击事件代理（防止重复监听导致连点）
    if (container._cvClickHandler) {
      container.removeEventListener('click', container._cvClickHandler);
    }
    if (container._qvClickHandler) {
      container.removeEventListener('click', container._qvClickHandler);
    }

    // 统一的点击事件代理
    container._cvClickHandler = function (e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const dName = btn.dataset.dialogue;

      switch (action) {

        // ===== 卡片折叠/展开（点击箭头或预览区） =====
        case 'toggle-card': {
          const card = btn.closest('.cv-dialogue-card');
          if (!card) break;
          const isCollapsed = card.classList.contains('collapsed');
          card.classList.toggle('collapsed', !isCollapsed);
          card.classList.toggle('expanded', isCollapsed);
          playSound('collapse');
          // 更新侧栏高亮
          const cardName = card.dataset.dialogue;
          container.querySelectorAll('.cv-sidebar-item').forEach(el => {
            el.classList.toggle('active', el.dataset.sidebarDialogue === cardName && isCollapsed);
          });
          break;
        }

        // ===== 侧栏导航点击 =====
        case 'sidebar-nav': {
          const targetName = btn.dataset.sidebarDialogue;
          if (!targetName) break;
          const targetCard = container.querySelector(`.cv-dialogue-card[data-dialogue="${_escHtml(targetName)}"]`);
          if (targetCard) {
            targetCard.classList.remove('collapsed');
            targetCard.classList.add('expanded');
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            container.querySelectorAll('.cv-sidebar-item').forEach(el => {
              el.classList.toggle('active', el.dataset.sidebarDialogue === targetName);
            });
          }
          break;
        }

        // ===== 添加条件分支 =====
        case 'add-condition':
          if (dName) {
            const d = parsed.dialogues.find(d => d.name === dName);
            if (d) {
              d.conditions.push({ if: 'true', open: '' });
              if (window._cvRenderFn) window._cvRenderFn();
            }
          }
          break;

        // ===== 删除条件分支 =====
        case 'delete-condition':
          if (dName) {
            const idx = parseInt(btn.dataset.index);
            const d = parsed.dialogues.find(d => d.name === dName);
            if (d && d.conditions[idx] !== undefined) {
              d.conditions.splice(idx, 1);
              if (window._cvRenderFn) window._cvRenderFn();
            }
          }
          break;

        // ===== 添加玩家选项 =====
        case 'add-option':
          if (dName) {
            const d = parsed.dialogues.find(d => d.name === dName);
            if (d) {
              d.options.push({ if: null, reply: '', then: 'close' });
              if (window._cvRenderFn) window._cvRenderFn();
            }
          }
          break;

        // ===== 删除玩家选项 =====
        case 'delete-option':
          if (dName) {
            const idx = parseInt(btn.dataset.index);
            const d = parsed.dialogues.find(d => d.name === dName);
            if (d && d.options[idx] !== undefined) {
              d.options.splice(idx, 1);
              if (window._cvRenderFn) window._cvRenderFn();
            }
          }
          break;

        // ===== 添加对话 =====
        case 'add-dialogue':
          parsed.dialogues.push({
            name: I18N.t('chemdah.newDialoguePrefix', {count: parsed.dialogues.length + 1}),
            type: 'dialogue',
            npcText: '',
            npcId: '',
            format: 'generic',
            flags: [],
            conditions: [{ if: 'true', open: '' }],
            options: [{ if: null, reply: I18N.t('chemdah.defaultReply'), then: 'close' }],
          });
          if (window._cvRenderFn) window._cvRenderFn();
          break;

        // ===== 删除对话 =====
        case 'delete-dialogue':
          if (dName) {
            const idx = parsed.dialogues.findIndex(d => d.name === dName);
            if (idx !== -1) {
              parsed.dialogues.splice(idx, 1);
              if (window._cvRenderFn) window._cvRenderFn();
            }
          }
          break;

        // ===== 切换 then 脚本可见性 =====
        case 'toggle-then-vis': {
          const idx = parseInt(btn.dataset.index);
          const textarea = container.querySelector(
            `textarea[data-field="option.then"][data-dialogue="${_escHtml(dName)}"][data-index="${idx}"]`
          );
          if (textarea) {
            textarea.classList.toggle('hidden');
            btn.textContent = textarea.classList.contains('hidden') ? '▶' : '▼';
          }
          break;
        }

        // ===== 同步到源码 =====
        case 'sync-to-source':
          _syncConversationToSource(parsed);
          break;

        // ===== 切换自动同步 =====
        case 'toggle-visual-autosync':
          window.__keAutoSync = btn.checked;
          // 更新本地存储配置
          (function updateAutoSyncConfig(val) {
            try {
              var stored = localStorage.getItem('editorConfig');
              var config = stored ? JSON.parse(stored) : {};
              config.autoSync = val;
              localStorage.setItem('editorConfig', JSON.stringify(config));
            } catch (e) {}
          })(window.__keAutoSync);
          break;

        // ===== 切换视图模式（卡片/思维导图） =====
        case 'toggle-view':
          container._cvViewMode = container._cvViewMode === 'mindmap' ? 'card' : 'mindmap';
          if (window._cvRenderFn) window._cvRenderFn();
          break;

        // ===== 删除 flag =====
        case 'remove-flag': {
          const tag = btn.parentElement.dataset.tag;
          if (tag) {
            parsed.options.flags = parsed.options.flags.filter(f => f !== tag);
            if (window._cvRenderFn) window._cvRenderFn();
          }
          break;
        }
      }
    };

    container.addEventListener('click', container._cvClickHandler);
    // 音效包装：为所有 data-action 按钮添加点击音效
    (function addCvSounds(c) {
      var handler = c._cvClickHandler;
      if (!handler) return;
      var wrapped = function (e) {
        var btn = e.target.closest('[data-action]');
        if (btn) {
          var action = btn.dataset.action;
          if (action && action !== 'toggle-then-vis') {
            if (action.indexOf('delete') >= 0 || action.indexOf('remove') >= 0) playSound('close');
            else playSound('click');
          }
        }
        handler(e);
      };
      c.removeEventListener('click', handler);
      c._cvClickHandler = wrapped;
      c.addEventListener('click', wrapped);
    })(container);

    // --- 文件选项 ---
    // 主题选择
    container.querySelectorAll('select[data-field="options.theme"]').forEach(el => {
      el.addEventListener('change', function () {
        const customInput = container.querySelector('.cv-theme-custom');
        if (this.value === '') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
          parsed.options.theme = this.value;
        }
      });
    });
    container.querySelectorAll('.cv-theme-custom').forEach(el => {
      el.addEventListener('change', function () {
        parsed.options.theme = this.value;
      });
      el.addEventListener('input', function () {
        parsed.options.theme = this.value;
      });
    });

    // 标题
    container.querySelectorAll('input[data-field="options.title"]').forEach(el => {
      el.addEventListener('change', function () {
        parsed.options.title = this.value;
      });
    });

    // 添加 flag
    container.querySelectorAll('select[data-action="add-flag"]').forEach(el => {
      el.addEventListener('change', async function () {
        let val = this.value;
        if (!val) return;
        if (val === '__custom__') {
          val = await UI.prompt({ message: I18N.t('chemdah.customTagPrompt') });
          if (!val) { this.value = ''; return; }
        }
        if (!parsed.options.flags.includes(val)) {
          parsed.options.flags.push(val);
        }
        this.value = '';
        // 重绘
        if (window._cvRenderFn) window._cvRenderFn();
      });
    });

    // --- 对话名称编辑 ---
    if (container._cvCh1) container.removeEventListener('change', container._cvCh1);
    container._cvCh1 = function (e) {
      const input = e.target.closest('[data-field="dialogue.name"]');
      if (input) {
        const oldName = input.closest('[data-dialogue]').dataset.dialogue;
        const newName = input.value.trim();
        if (newName && newName !== oldName) {
          const d = parsed.dialogues.find(d => d.name === oldName);
          if (d) {
            d.name = newName;
            input.closest('[data-dialogue]').dataset.dialogue = newName;
            // 更新所有关联的 data-dialogue 属性
            const card = input.closest('.cv-dialogue-card');
            card.querySelectorAll('[data-dialogue]').forEach(el => {
              if (el !== input.closest('[data-dialogue]')) {
                el.dataset.dialogue = newName;
              }
            });
            // 更新侧栏名称
            const sidebarItem = container.querySelector(`.cv-sidebar-item[data-sidebar-dialogue="${_escHtml(oldName)}"]`);
            if (sidebarItem) {
              sidebarItem.dataset.sidebarDialogue = newName;
              const nameSpan = sidebarItem.querySelector('.cv-sidebar-name');
              if (nameSpan) nameSpan.textContent = newName;
              sidebarItem.setAttribute('data-tip', newName);
            }
          }
        }
      }
    };
    container.addEventListener('change', container._cvCh1);

    // --- NPC ID / NPC 文本 / Format 编辑 ---
    if (container._cvCh2) container.removeEventListener('change', container._cvCh2);
    container._cvCh2 = function (e) {
      const input = e.target.closest('[data-field="dialogue.npcId"], [data-field="dialogue.format"]');
      if (input) {
        const field = input.dataset.field;
        const dName = input.dataset.dialogue;
        const d = parsed.dialogues.find(d => d.name === dName);
        if (d) {
          if (field === 'dialogue.npcId') d.npcId = input.value;
          else if (field === 'dialogue.format') d.format = input.value;
        }
      }
    };
    container.addEventListener('change', container._cvCh2);

    if (container._cvCh3) container.removeEventListener('change', container._cvCh3);
    container._cvCh3 = function (e) {
      const input = e.target.closest('[data-field="dialogue.npcText"]');
      if (input) {
        const dName = input.dataset.dialogue;
        const d = parsed.dialogues.find(d => d.name === dName);
        if (d) d.npcText = input.value;
      }
    };
    container.addEventListener('change', container._cvCh3);

    // --- 条件分支编辑 ---
    if (container._cvCh4) container.removeEventListener('change', container._cvCh4);
    container._cvCh4 = function (e) {
      const input = e.target.closest('[data-field="condition.if"], [data-field="condition.open"]');
      if (input) {
        const field = input.dataset.field;
        const dName = input.dataset.dialogue;
        const idx = parseInt(input.dataset.index);
        const d = parsed.dialogues.find(d => d.name === dName);
        if (d && d.conditions[idx]) {
          if (field === 'condition.if') d.conditions[idx].if = input.value;
          else if (field === 'condition.open') d.conditions[idx].open = input.value;
        }
      }
    };
    container.addEventListener('change', container._cvCh4);

    // --- 玩家选项编辑 ---
    if (container._cvCh5) container.removeEventListener('change', container._cvCh5);
    container._cvCh5 = function (e) {
      const input = e.target.closest('[data-field^="option."]');
      if (input) {
        const field = input.dataset.field;
        const dName = input.dataset.dialogue;
        const idx = parseInt(input.dataset.index);
        const d = parsed.dialogues.find(d => d.name === dName);
        if (d && d.options[idx]) {
          if (field === 'option.reply') d.options[idx].reply = input.value;
          else if (field === 'option.if') d.options[idx].if = input.value;
          else if (field === 'option.then') d.options[idx].then = input.value;
        }
      }
    };
    container.addEventListener('change', container._cvCh5);

    // --- 自动同步（字段编辑后自动同步到源码） ---
    // 移除旧的 change 监听器防止累积（每次渲染替换监听，避免旧闭包引用旧 parsed 数据）
    if (container._cvChangeListener) {
      container.removeEventListener('change', container._cvChangeListener);
    }
    container._cvChangeListener = function (e) {
      if (window.__keAutoSync && e.target) {
        var tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          _syncConversationToSource(parsed);
        }
      }
    };
    container.addEventListener('change', container._cvChangeListener);

    // 双向清理: 清除任务编辑器残留的 change 监听
    // (quest→conversation 切换后旧 handler 引用旧 parsed, 触发会把编辑器覆盖成旧文件内容)
    if (container._qvCh1) container.removeEventListener('change', container._qvCh1);
    if (container._qvCh2) container.removeEventListener('change', container._qvCh2);
    if (container._qvCh3) container.removeEventListener('change', container._qvCh3);
    if (container._qvChangeListener) container.removeEventListener('change', container._qvChangeListener);

  }

  // ============================================
  // 对话 → YAML 序列化
  // ============================================

  function _genYAMLValue(val, indent) {
    if (val === null || val === undefined) return '~';
    const s = String(val); // 保留原值(含尾部空白与多行空行)
    if (s === '') return "''";
    const lines = s.split('\n');
    if (lines.length > 1) {
      // 多行：使用 |-
      const innerIndent = '  '.repeat(indent + 1);
      return '|-\n' + lines.map(l => innerIndent + l).join('\n');
    }
    // 单行：判断是否需引号(含以 - 开头的值, 否则会被解析为列表项)
    if (s.includes("'") || s.includes('"')) {
      // 含引号: JSON 双引号转义, 保证 YAML 合法
      return JSON.stringify(s);
    }
    // on/off/null/~ 等字面量不带引号写回会被解析成布尔/空值, 数字样字符串
    // (123/1./.5/+123/0x1F/1e5) 会被解析成数字, 均需加引号保护
    if (/^-|[:\{\}\[\],&\*\?\|>!%@`#]|^\s|\s$|^[>!]\S/.test(s) || /^(true|false|yes|no|on|off|null|none|~)$/i.test(s) || /^[-+]?(?:0x[0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|\.?(?:inf|nan))$/i.test(s)) {
      const q = s.includes("'") ? '"' : "'";
      return q + s + q;
    }
    return s;
  }

  // YAML 键加引号保护(含特殊字符的对话名/任务 id, 以及 YAML 保留字/数字样键)
  function _quoteYamlKey(key) {
    const s = String(key);
    if (/[:\{\}\[\],&\*\?\|>!%@`#]|^\s|\s$/.test(s) || s === '' ||
        /^(true|false|yes|no|on|off|null|none|~)$/i.test(s) ||
        /^[-+]?(?:0x[0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|\.?(?:inf|nan))$/i.test(s)) {
      const q = s.includes("'") ? '"' : "'";
      return q + s + q;
    }
    return s;
  }

  function _genConversationYAML(parsed) {
    const lines = [];
    const indent = '  ';

    // __option__
    lines.push('__option__:');
    lines.push(`${indent}theme: ${_genYAMLValue(parsed.options.theme || 'chat', 1)}`);
    if (parsed.options.title) {
      lines.push(`${indent}title: ${_genYAMLValue(parsed.options.title, 1)}`);
    }
    if (parsed.options.flags && parsed.options.flags.length > 0) {
      lines.push(`${indent}flags:`);
      for (const f of parsed.options.flags) {
        lines.push(`${indent}${indent}- ${_genYAMLValue(f, 2)}`);
      }
    }
    lines.push('');

    // Dialogues
    for (const d of parsed.dialogues) {
      lines.push(`${_quoteYamlKey(d.name)}:`);

      if (d.type === 'switch') {
        lines.push(`${indent}npc id: ${_genYAMLValue(d.npcId, 1)}`);

        // conditions
        if (d.conditions && d.conditions.length > 0) {
          lines.push(`${indent}when:`);
          for (const c of d.conditions) {
            lines.push(`${indent}${indent}- if: ${_genYAMLValue(c.if, 2)}`);
            lines.push(`${indent}${indent}  open: ${_genYAMLValue(c.open, 3)}`);
          }
        }
      }

      // NPC text (dialogue 默认文本; switch 也可带默认文本)
      if (d.npcText) {
        lines.push(`${indent}npc: ${_genYAMLValue(d.npcText, 1)}`);
      }

      // format (for dialogue type)
      if (d.type === 'dialogue' && d.format && d.format !== 'generic') {
        lines.push(`${indent}format: ${_genYAMLValue(d.format, 1)}`);
      }

      // player options
      if (d.options && d.options.length > 0) {
        lines.push(`${indent}player:`);
        for (const o of d.options) {
          lines.push(`${indent}${indent}- reply: ${_genYAMLValue(o.reply, 2)}`);
          if (o.if) {
            // if needs to be on the line before reply for proper ordering in YAML
            // Actually in YAML order doesn't matter, but for readability, insert it
            // We need to edit the previous line
            const lastIdx = lines.length - 1;
            const ifLine = `${indent}${indent}  if: ${_genYAMLValue(o.if, 2)}`;
            // Insert if before reply
            const replyLine = lines[lastIdx];
            lines[lastIdx] = `${indent}${indent}- if: ${_genYAMLValue(o.if, 2)}`;
            lines.push(`${indent}${indent}  reply: ${_genYAMLValue(o.reply, 3)}`);
          }
          if (o.then) {
            lines.push(`${indent}${indent}  then: ${_genYAMLValue(o.then, 3)}`);
          }
        }
      }

      // 对话级 flags
      if (d.flags && d.flags.length > 0) {
        lines.push(`${indent}flags:`);
        for (const f of d.flags) {
          lines.push(`${indent}${indent}- ${_genYAMLValue(f, 2)}`);
        }
      }

      // 无法识别的字段原样写回 (内容级保留)
      if (d._raw && Object.keys(d._raw).length > 0) {
        for (const [rk, rv] of Object.entries(d._raw)) {
          lines.push(_genRawYAML({ [rk]: rv }, 1));
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 将可视化编辑器的更改同步回 CodeMirror 源码
   */
  function _syncConversationToSource(parsed) {
    const yaml = _genConversationYAML(parsed);
    if (window.codeMirrorEditor) {
      window.codeMirrorEditor.setValue(yaml);
      window.updateStatus(I18N.t('chemdah.syncedToSource'));
    }
  }

  // ============================================
  // 思维导图 — 对话连接视图
  // ============================================

  /**
   * 从对话解析数据构建图结构
   * 分析 SWITCH 条件的 open 跳转 + 玩家选项中的 "open/goto" 指令
   */
  function _buildConversationGraph(dialogues) {
    const nodes = [];
    const edges = [];
    const nodeNames = new Set(dialogues.map(d => d.name));

    for (const d of dialogues) {
      var previewText = '';
      if (d.npcText) {
        previewText = d.npcText.replace(/\s+/g, ' ').trim();
        if (previewText.length > 12) previewText = previewText.substring(0, 11) + '…';
      }
      nodes.push({ id: d.name, type: d.type, preview: previewText });

      // SWITCH 类型: conditions[].open → 目标对话
      if (d.type === 'switch') {
        for (const c of d.conditions) {
          if (c.open) {
            const target = c.open.replace(/^@/, ''); // 去掉 @ 前缀
            if (nodeNames.has(target)) {
              edges.push({
                from: d.name, to: target,
                label: c.if !== 'true' ? c.if : '',
                type: 'condition',
              });
            }
          }
        }
      }

      // 玩家选项: 解析 then 中的 "open <名称>" 模式
      for (const opt of d.options) {
        if (opt.then) {
          const re = /\b(?:open|goto)\s+@?(\S+)/gi;
          let match;
          while ((match = re.exec(opt.then)) !== null) {
            const target = match[1];
            if (nodeNames.has(target)) {
              edges.push({
                from: d.name, to: target,
                label: opt.reply || '',
                type: 'option',
              });
            }
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * 树形布局计算 — 入口在左上，逐层向右展开
   */
  function _computeTreeLayout(nodes, edges, width, height) {
    if (nodes.length === 0) return;
    if (nodes.length === 1) {
      nodes[0].x = 80;
      nodes[0].y = height / 2;
      return;
    }

    // 1. 构建邻接表
    var children = {}, parents = {};
    for (var ni = 0; ni < nodes.length; ni++) {
      children[nodes[ni].id] = [];
      parents[nodes[ni].id] = [];
    }
    for (var ei = 0; ei < edges.length; ei++) {
      if (children[edges[ei].from]) children[edges[ei].from].push(edges[ei].to);
      if (parents[edges[ei].to]) parents[edges[ei].to].push(edges[ei].from);
    }

    // 2. 找根节点（没有入边的节点）
    var roots = [];
    for (ni = 0; ni < nodes.length; ni++) {
      if (parents[nodes[ni].id].length === 0) roots.push(nodes[ni].id);
    }
    if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0].id);

    // 3. BFS 分配层级
    var layer = {}, visited = {};
    var queue = [];
    for (var ri = 0; ri < roots.length; ri++) {
      layer[roots[ri]] = 0;
      queue.push(roots[ri]);
    }
    while (queue.length > 0) {
      var cur = queue.shift();
      if (visited[cur]) continue;
      visited[cur] = true;
      var curLayer = layer[cur] || 0;
      var childList = children[cur] || [];
      for (var ci = 0; ci < childList.length; ci++) {
        var child = childList[ci];
        var newLayer = curLayer + 1;
        if (layer[child] === undefined || newLayer > layer[child]) {
          layer[child] = newLayer;
        }
        queue.push(child);
      }
    }

    // 处理未被 BFS 访问的节点（孤立/环路节点）
    var maxLayer = 0;
    for (ni = 0; ni < nodes.length; ni++) {
      if (layer[nodes[ni].id] !== undefined) {
        maxLayer = Math.max(maxLayer, layer[nodes[ni].id]);
      }
    }
    for (ni = 0; ni < nodes.length; ni++) {
      if (layer[nodes[ni].id] === undefined) {
        maxLayer++;
        layer[nodes[ni].id] = maxLayer;
      }
    }

    // 4. 按层分组
    var groups = {};
    var layerKeys = [];
    for (ni = 0; ni < nodes.length; ni++) {
      var l = layer[nodes[ni].id];
      if (!groups[l]) { groups[l] = []; layerKeys.push(l); }
      groups[l].push(nodes[ni]);
    }
    layerKeys.sort(function (a, b) { return a - b; });

    // 5. 定位：从左到右逐层，层内上下居中排列
    var layerCount = layerKeys.length;
    var marginX = 80, marginY = 40;
    var hSpacing = Math.min(200, (width - marginX * 2) / Math.max(layerCount - 1 || 1, 1));

    for (var li = 0; li < layerKeys.length; li++) {
      var lk = layerKeys[li];
      var layerNodes = groups[lk];
      // 层内按父节点顺序排序（尽量保持兄弟节点连续）
      layerNodes.sort(function (a, b) {
        var pa = parents[a.id] && parents[a.id][0] ? parents[a.id][0] : '';
        var pb = parents[b.id] && parents[b.id][0] ? parents[b.id][0] : '';
        if (pa !== pb) return pa < pb ? -1 : 1;
        return a.id < b.id ? -1 : 1;
      });
      var vSpacing = Math.max(70, Math.min(90, (height - marginY * 2) / Math.max(layerNodes.length, 1)));
      var totalH = (layerNodes.length - 1) * vSpacing;
      var startY = (height - totalH) / 2;

      for (var li2 = 0; li2 < layerNodes.length; li2++) {
        layerNodes[li2].x = marginX + lk * hSpacing;
        layerNodes[li2].y = startY + li2 * vSpacing;
      }
    }
  }

  /**
   * 将缓存的节点位置覆盖到当前布局
   */
  function _applyCachedPositions(nodes, cachedPos) {
    for (var ci = 0; ci < nodes.length; ci++) {
      var cn = nodes[ci];
      if (cachedPos[cn.id]) {
        cn.x = cachedPos[cn.id].x;
        cn.y = cachedPos[cn.id].y;
      }
    }
  }

  /**
   * 渲染思维导图 SVG
   */
  function _renderMindMapSVG(parsed, svgEl, containerEl) {
    const { dialogues } = parsed;

    // 构建图
    const graph = _buildConversationGraph(dialogues);

    // 获取容器尺寸（containerEl 一直存在于 DOM 中，尺寸可靠）
    const containerRect = containerEl.getBoundingClientRect();
    const width = Math.max(containerRect.width - 40, 400);
    const height = Math.max(containerRect.height - 180, 300);

    // 清除旧内容
    svgEl.innerHTML = '';
    svgEl.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    // 计算树形布局
    _computeTreeLayout(graph.nodes, graph.edges, width, height);

    // 加载内存中的缓存位置（同步），覆盖力导向结果
    var cacheKey = _hashPath(containerEl._cvFilePath);
    var cachedPos = (window._mmCache && window._mmCache[cacheKey]) ? window._mmCache[cacheKey] : null;
    if (cachedPos) {
      _applyCachedPositions(graph.nodes, cachedPos);
    } else {
      // 首次加载：异步从磁盘读取缓存，加载后重新应用位置
      _loadMindMapCache(containerEl).then(function (loadedPos) {
        if (!loadedPos) return;
        _applyCachedPositions(graph.nodes, loadedPos);
        // 直接在 SVG 上更新所有节点位置
        for (var ni2 = 0; ni2 < graph.nodes.length; ni2++) {
          var n2 = graph.nodes[ni2];
          var el = mainG.querySelector('g[data-node-id="' + CSS.escape(n2.id) + '"]');
          if (!el) continue;
          var halfW2 = nodeW / 2, halfH2 = nodeH / 2;
          var rx2 = n2.x - halfW2, ry2 = n2.y - halfH2;
          var r = el.querySelector('rect');
          if (r) { r.setAttribute('x', rx2); r.setAttribute('y', ry2); }
          var d = el.querySelector('line');
          if (d) { d.setAttribute('x1', rx2); d.setAttribute('y1', ry2 + 20); d.setAttribute('x2', rx2 + nodeW); d.setAttribute('y2', ry2 + 20); }
          var t = el.querySelectorAll('text');
          if (t[0]) { t[0].setAttribute('x', n2.x - halfW2 + 8); t[0].setAttribute('y', ry2 + 14); }
          if (t[1]) { t[1].setAttribute('x', n2.x + 6); t[1].setAttribute('y', ry2 + 14); }
          if (t[2]) { t[2].setAttribute('x', n2.x); t[2].setAttribute('y', ry2 + 38); }
        }
        // 更新所有边
        for (var ei2 = 0; ei2 < graph.edges.length; ei2++) {
          var edge2 = graph.edges[ei2];
          var fn = graph.nodes.find(function (n) { return n.id === edge2.from; });
          var tn = graph.nodes.find(function (n) { return n.id === edge2.to; });
          if (!fn || !tn) continue;
          var p1 = _rectEdgePoint(fn.x, fn.y, tn.x, tn.y, nodeW, nodeH);
          var p2 = _rectEdgePoint(tn.x, tn.y, fn.x, fn.y, nodeW, nodeH);
          var ln = mainG.querySelector('line[data-from="' + edge2.from + '"][data-to="' + edge2.to + '"]');
          if (ln) { ln.setAttribute('x1', p1.x); ln.setAttribute('y1', p1.y); ln.setAttribute('x2', p2.x); ln.setAttribute('y2', p2.y); }
          var lb = mainG.querySelector('text[data-from="' + edge2.from + '"][data-to="' + edge2.to + '"]');
          if (lb) { lb.setAttribute('x', (p1.x + p2.x) / 2); lb.setAttribute('y', (p1.y + p2.y) / 2 - 5); }
        }
      });
    }

    // 确定入口节点（没有入边的节点）
    const hasIncoming = new Set();
    for (const e of graph.edges) hasIncoming.add(e.to);
    const rootNodes = graph.nodes.filter(n => !hasIncoming.has(n.id));

    // 确定孤立节点
    const connected = new Set();
    for (const e of graph.edges) { connected.add(e.from); connected.add(e.to); }

    const nodeW = 130, nodeH = 52, nodeRx = 6;

    // 箭头标记
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = '<marker id="mm-arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" fill="#667"><polygon points="0 0,10 3.5,0 7"/></marker>';
    svgEl.appendChild(defs);

    // 主变换组
    const mainG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svgEl.appendChild(mainG);

    /** 计算矩形边框与连线的交点 */
    function _rectEdgePoint(rx, ry, tx, ty, w, h) {
      var dx = tx - rx, dy = ty - ry;
      if (dx === 0 && dy === 0) return { x: rx, y: ry };
      var absDx = Math.abs(dx), absDy = Math.abs(dy);
      var hw = w / 2, hh = h / 2;
      var t = Math.min(hw / (absDx || 1e-10), hh / (absDy || 1e-10));
      return { x: rx + dx * t, y: ry + dy * t };
    }

    // --- 绘制边 ---
    for (const e of graph.edges) {
      const from = graph.nodes.find(n => n.id === e.from);
      const to = graph.nodes.find(n => n.id === e.to);
      if (!from || !to) continue;

      var p1 = _rectEdgePoint(from.x, from.y, to.x, to.y, nodeW, nodeH);
      var p2 = _rectEdgePoint(to.x, to.y, from.x, from.y, nodeW, nodeH);
      const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', e.type === 'option' ? '#5a7' : '#667');
      line.setAttribute('stroke-width', e.type === 'option' ? 1.2 : 1.5);
      line.setAttribute('stroke-dasharray', e.type === 'option' ? '4,3' : '');
      line.setAttribute('marker-end', 'url(#mm-arrow)');
      line.setAttribute('data-from', e.from);
      line.setAttribute('data-to', e.to);
      if (e.type === 'option') line.setAttribute('opacity', '0.6');
      mainG.appendChild(line);

      // 边标签
      if (e.label) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', mx); lbl.setAttribute('y', my - 5);
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('font-size', '9');
        lbl.setAttribute('fill', e.type === 'option' ? '#5a7' : '#889');
        lbl.setAttribute('data-type', 'edge-label');
        lbl.setAttribute('data-from', e.from);
        lbl.setAttribute('data-to', e.to);
        lbl.textContent = e.label.length > 18 ? e.label.substring(0, 17) + '…' : e.label;
        mainG.appendChild(lbl);
      }
    }

    // --- 绘制节点 ---
    for (const n of graph.nodes) {
      const isRoot = rootNodes.includes(n);
      const isOrphan = !connected.has(n.id) && graph.nodes.length > 1;
      let fill, stroke, labelColor;
      if (isRoot)      { fill = '#1a3a5c'; stroke = '#3498db'; labelColor = '#64b5f6'; }
      else if (isOrphan) { fill = '#3a3a3a'; stroke = '#888'; labelColor = '#999'; }
      else if (n.type === 'switch') { fill = '#5a4a00'; stroke = '#f1c40f'; labelColor = '#f1c40f'; }
      else              { fill = '#1a5a2a'; stroke = '#2ecc71'; labelColor = '#2ecc71'; }

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-node-id', n.id);
      g.style.cursor = 'pointer';

      const halfW = nodeW / 2, halfH = nodeH / 2;
      const rx = n.x - halfW, ry = n.y - halfH;

      // 矩形背景
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', rx); rect.setAttribute('y', ry);
      rect.setAttribute('width', nodeW); rect.setAttribute('height', nodeH);
      rect.setAttribute('rx', nodeRx); rect.setAttribute('ry', nodeRx);
      rect.setAttribute('fill', fill); rect.setAttribute('stroke', stroke);
      rect.setAttribute('stroke-width', '1.5');
      g.appendChild(rect);

      // 顶部分隔线（ID 区与内容区）
      const divider = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      divider.setAttribute('x1', rx); divider.setAttribute('y1', ry + 20);
      divider.setAttribute('x2', rx + nodeW); divider.setAttribute('y2', ry + 20);
      divider.setAttribute('stroke', stroke);
      divider.setAttribute('stroke-width', '0.5');
      divider.setAttribute('opacity', '0.5');
      g.appendChild(divider);

      // 类型标记 + ID（左上区域）
      const iconText = n.type === 'switch' ? 'S' : 'T';
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.setAttribute('x', n.x - halfW + 8); icon.setAttribute('y', ry + 14);
      icon.setAttribute('font-size', '10');
      icon.setAttribute('font-family', 'Consolas, monospace');
      icon.setAttribute('font-weight', 'bold');
      icon.setAttribute('fill', labelColor);
      icon.textContent = iconText;
      g.appendChild(icon);

      // 对话 ID（顶栏）
      const idLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      idLbl.setAttribute('x', n.x + 6); idLbl.setAttribute('y', ry + 14);
      idLbl.setAttribute('font-size', '10');
      idLbl.setAttribute('font-family', 'Consolas, monospace');
      idLbl.setAttribute('fill', '#ddd');
      var displayId = n.id.length > 14 ? n.id.substring(0, 13) + '…' : n.id;
      idLbl.textContent = displayId;
      g.appendChild(idLbl);

      // 内容预览（下方区域）
      const preview = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      preview.setAttribute('x', n.x); preview.setAttribute('y', ry + 38);
      preview.setAttribute('text-anchor', 'middle');
      preview.setAttribute('font-size', '9');
      preview.setAttribute('fill', '#aaa');
      preview.setAttribute('font-family', 'Consolas, monospace');
      preview.textContent = n.preview || I18N.t('chemdah.empty');
      g.appendChild(preview);

      // 悬浮提示
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      const extras = [];
      if (isRoot) extras.push(I18N.t('chemdah.entryNode'));
      if (isOrphan) extras.push(I18N.t('chemdah.orphanNode'));
      title.textContent = n.id + ' (' + (n.type === 'switch' ? I18N.t('chemdah.switch') : I18N.t('chemdah.dialogue')) + ')' + (extras.length ? '\n' + extras.join(', ') : '');
      g.appendChild(title);

      mainG.appendChild(g);
    }

    // --- 交互: 平移/缩放 ---
    let panX = 0, panY = 0, scale = 1;

    function updateTransform() {
      mainG.setAttribute('transform', 'translate(' + panX + ',' + panY + ') scale(' + scale + ')');
    }

    // 鼠标拖拽平移 (window 监听器用共享引用, 渲染前移除旧的, 防止累积泄漏)
    let isPan = false, startPX, startPY;
    svgEl.addEventListener('mousedown', function (e) {
      if (e.target === svgEl || e.target.tagName === 'svg') {
        isPan = true;
        startPX = e.clientX - panX;
        startPY = e.clientY - panY;
        svgEl.style.cursor = 'grabbing';
      }
    });
    if (window._cvPanMove) window.removeEventListener('mousemove', window._cvPanMove);
    if (window._cvPanUp) window.removeEventListener('mouseup', window._cvPanUp);
    window._cvPanMove = function (e) {
      if (isPan) {
        panX = e.clientX - startPX;
        panY = e.clientY - startPY;
        updateTransform();
      }
    };
    window.addEventListener('mousemove', window._cvPanMove);
    window._cvPanUp = function () {
      if (isPan) {
        isPan = false;
        svgEl.style.cursor = '';
      }
    };
    window.addEventListener('mouseup', window._cvPanUp);

    // 滚轮缩放
    svgEl.addEventListener('wheel', function (e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const ns = Math.max(0.2, Math.min(3, scale * delta));
      const r = svgEl.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      panX = mx - (mx - panX) * (ns / scale);
      panY = my - (my - panY) * (ns / scale);
      scale = ns;
      updateTransform();
    }, { passive: false });

    // 双击重置视图
    svgEl.addEventListener('dblclick', function (e) {
      if (e.target === svgEl || e.target.tagName === 'svg') {
        scale = 1; panX = 0; panY = 0;
        updateTransform();
      }
    });

    // 节点交互：区分点击（跳转）和拖拽（移动位置）
    (function enableNodeInteraction() {
      var dragNode = null, dragOffX = 0, dragOffY = 0;
      var isClick = false;

      function navigateToDialogue(nid) {
        containerEl._cvViewMode = 'card';
        if (window._cvRenderFn) window._cvRenderFn();
        requestAnimationFrame(function () {
          var card = containerEl.querySelector('.cv-dialogue-card[data-dialogue="' + _escHtml(nid) + '"]');
          if (card) {
            card.classList.remove('collapsed');
            card.classList.add('expanded');
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            card.style.transition = 'box-shadow 0.3s';
            card.style.boxShadow = '0 0 0 3px var(--color-primary)';
            setTimeout(function () { card.style.boxShadow = ''; }, 1500);
          }
        });
      }

      function updateNodeVisual(node) {
        var el = mainG.querySelector('g[data-node-id="' + CSS.escape(node.id) + '"]');
        if (!el) return;
        var halfW = nodeW / 2, halfH = nodeH / 2;
        var rx = node.x - halfW, ry = node.y - halfH;

        // 更新矩形位置
        var rect = el.querySelector('rect');
        if (rect) {
          rect.setAttribute('x', rx);
          rect.setAttribute('y', ry);
        }
        // 更新分隔线
        var div = el.querySelector('line');
        if (div) {
          div.setAttribute('x1', rx);
          div.setAttribute('y1', ry + 20);
          div.setAttribute('x2', rx + nodeW);
          div.setAttribute('y2', ry + 20);
        }
        // 更新文本元素（按顺序: 0=类型标记, 1=ID, 2=预览）
        var textNodes = el.querySelectorAll('text');
        if (textNodes[0]) { textNodes[0].setAttribute('x', node.x - halfW + 8); textNodes[0].setAttribute('y', ry + 14); }
        if (textNodes[1]) { textNodes[1].setAttribute('x', node.x + 6); textNodes[1].setAttribute('y', ry + 14); }
        if (textNodes[2]) { textNodes[2].setAttribute('x', node.x); textNodes[2].setAttribute('y', ry + 38); }

        // 更新与该节点相连的所有边
        for (var ei = 0; ei < graph.edges.length; ei++) {
          var edge = graph.edges[ei];
          if (edge.from !== node.id && edge.to !== node.id) continue;
          var fromNode = graph.nodes.find(function (n) { return n.id === edge.from; });
          var toNode = graph.nodes.find(function (n) { return n.id === edge.to; });
          if (!fromNode || !toNode) continue;
          var p1 = _rectEdgePoint(fromNode.x, fromNode.y, toNode.x, toNode.y, nodeW, nodeH);
          var p2 = _rectEdgePoint(toNode.x, toNode.y, fromNode.x, fromNode.y, nodeW, nodeH);
          var x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;

          var line = mainG.querySelector('line[data-from="' + edge.from + '"][data-to="' + edge.to + '"]');
          if (line) {
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
          }
          var lbl = mainG.querySelector('text[data-from="' + edge.from + '"][data-to="' + edge.to + '"]');
          if (lbl) {
            lbl.setAttribute('x', (x1 + x2) / 2);
            lbl.setAttribute('y', (y1 + y2) / 2 - 5);
          }
        }
      }

      mainG.addEventListener('mousedown', function (e) {
        var g = e.target.closest ? e.target.closest('g[data-node-id]') : null;
        if (!g) return;
        var nid = g.getAttribute('data-node-id');
        dragNode = graph.nodes.find(function (n) { return n.id === nid; });
        if (!dragNode) return;
        e.stopPropagation();
        isClick = true;
        var svgRect = svgEl.getBoundingClientRect();
        var mouseSvgX = (e.clientX - svgRect.left - panX) / scale;
        var mouseSvgY = (e.clientY - svgRect.top - panY) / scale;
        dragOffX = mouseSvgX - dragNode.x;
        dragOffY = mouseSvgY - dragNode.y;
        svgEl.style.cursor = 'grabbing';
      });

      // 复用全局监听器引用, 每次渲染先移除旧的, 防止累积
      if (window._cvMmMove) window.removeEventListener('mousemove', window._cvMmMove);
      if (window._cvMmUp) window.removeEventListener('mouseup', window._cvMmUp);
      window._cvMmMove = function (e) {
        if (!dragNode) return;
        var svgRect = svgEl.getBoundingClientRect();
        var mouseSvgX = (e.clientX - svgRect.left - panX) / scale;
        var mouseSvgY = (e.clientY - svgRect.top - panY) / scale;
        // 移动超过阈值则视为拖拽，不是点击
        if (Math.abs(mouseSvgX - (dragNode.x + dragOffX)) > 3 ||
            Math.abs(mouseSvgY - (dragNode.y + dragOffY)) > 3) {
          isClick = false;
        }
        dragNode.x = mouseSvgX - dragOffX;
        dragNode.y = mouseSvgY - dragOffY;
        updateNodeVisual(dragNode);
      };
      window.addEventListener('mousemove', window._cvMmMove);

      window._cvMmUp = function () {
        if (dragNode) {
          if (isClick) {
            // 没有移动 → 点击跳转
            navigateToDialogue(dragNode.id);
          } else {
            // 有移动 → 拖拽，保存位置
            _saveMindMapCache(containerEl, graph.nodes);
          }
          dragNode = null;
          svgEl.style.cursor = '';
        }
      };
      window.addEventListener('mouseup', window._cvMmUp);
    })();

    // 信息浮层
    var infoDiv = document.createElement('div');
    infoDiv.className = 'cv-mindmap-info';
    var countsHtml = I18N.t('chemdah.nodeCount', {count: graph.nodes.length}) + ' · ' + I18N.t('chemdah.edgeCount', {count: graph.edges.length});
    if (rootNodes.length > 0) countsHtml += ' · ' + I18N.t('chemdah.entryCount', {count: rootNodes.length});
    infoDiv.innerHTML = '<span>' + I18N.t('chemdah.mindmapHint') + '</span><span class="cv-mindmap-counts">' + countsHtml + '</span>';
    // 移除旧的 info 浮层
    var oldInfo = wrapper.querySelector('.cv-mindmap-info');
    if (oldInfo) oldInfo.remove();
    wrapper.appendChild(infoDiv);
  }

  // ============================================
  // 思维导图节点位置缓存
  // ============================================

  /** 简单字符串哈希，生成文件路径对应的缓存 key */
  function _hashPath(str) {
    var hash = 0, i, chr, len;
    if (!str) return '0';
    for (i = 0, len = str.length; i < len; i++) {
      chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  /** 从用户数据目录加载思维导图节点位置缓存 */
  function _loadMindMapCache(containerEl) {
    var filePath = containerEl._cvFilePath;
    if (!filePath || !window.electronAPI) return Promise.resolve(null);
    var key = _hashPath(filePath);

    // 尝试从内存缓存读取
    if (window._mmCache && window._mmCache[key]) {
      return Promise.resolve(window._mmCache[key]);
    }

    // 异步加载（返回 Promise）
    return window.electronAPI.ai.getUserDataPath().then(function (userDataPath) {
      var cachePath = userDataPath + '/mindmap-cache/' + key + '.json';
      return window.electronAPI.readFile(cachePath).then(function (result) {
        if (result && result.success && result.content) {
          try {
            var data = JSON.parse(result.content);
            if (data && data.positions) {
              if (!window._mmCache) window._mmCache = {};
              window._mmCache[key] = data.positions;
              return data.positions;
            }
          } catch (e) {}
        }
        return null;
      }).catch(function () { return null; });
    }).catch(function () { return null; });
  }

  /** 保存思维导图节点位置到用户数据目录缓存 */
  function _saveMindMapCache(containerEl, nodes) {
    var filePath = containerEl._cvFilePath;
    if (!filePath || !nodes || !window.electronAPI) return;
    var key = _hashPath(filePath);

    // 保存到内存缓存
    if (!window._mmCache) window._mmCache = {};
    var positions = {};
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      positions[n.id] = { x: Math.round(n.x), y: Math.round(n.y) };
    }
    window._mmCache[key] = positions;

    // 异步写入文件
    window.electronAPI.ai.getUserDataPath().then(function (userDataPath) {
      var cacheDir = userDataPath + '/mindmap-cache';
      var cachePath = cacheDir + '/' + key + '.json';
      // 确保目录存在
      window.electronAPI.mkdir(cacheDir).then(function () {
        window.electronAPI.writeFile(cachePath, JSON.stringify({
          version: 1,
          positions: positions,
        }));
      }).catch(function () {
        // mkdir 可能已存在，尝试直接写
        window.electronAPI.writeFile(cachePath, JSON.stringify({
          version: 1,
          positions: positions,
        }));
      });
    });
  }

  // ============================================
  // 任务文件解析器（结构化）
  // ============================================

  // ============================================
  // 定义数据（从 desc/ JSON 文件加载）
  // ============================================

  let _definitions = null;

  function _ensureDefs() {
    if (_definitions) return _definitions;
    // 兜底硬编码（当 desc 文件未加载时使用）
    _definitions = {
      objectiveDefs: [
        { id: 'trigger', label: 'trigger', desc: '触发器条件触发' },
        { id: 'chat', label: 'chat', desc: '与指定 NPC 对话' },
        { id: 'collect', label: 'collect', desc: '收集指定物品' },
        { id: 'kill', label: 'kill', desc: '击杀指定实体' },
        { id: 'go_to', label: 'go_to', desc: '到达指定位置' },
        { id: 'player fish', label: 'player fish', desc: '钓鱼' },
        { id: 'player jump', label: 'player jump', desc: '跳跃' },
        { id: 'player sneak', label: 'player sneak', desc: '潜行' },
        { id: 'inventory', label: 'inventory', desc: '检测背包物品' },
        { id: 'consume', label: 'consume', desc: '消耗物品' },
        { id: 'brewing', label: 'brewing', desc: '酿造' },
        { id: 'enchant', label: 'enchant', desc: '附魔' },
        { id: 'craft', label: 'craft', desc: '合成' },
        { id: 'smelt', label: 'smelt', desc: '熔炼' },
        { id: 'cook', label: 'cook', desc: '烹饪' },
        { id: 'repair', label: 'repair', desc: '修复' },
        { id: 'shear', label: 'shear', desc: '剪羊毛' },
        { id: 'tame', label: 'tame', desc: '驯服动物' },
        { id: 'breed', label: 'breed', desc: '繁殖动物' },
        { id: 'milk', label: 'milk', desc: '挤奶' },
        { id: 'trade', label: 'trade', desc: '与村民交易' },
        { id: 'eat', label: 'eat', desc: '吃东西' },
        { id: 'bend', label: 'bend', desc: 'MMOCore 技能' },
        { id: 'practice', label: 'practice', desc: 'MMOCore 练习' },
        { id: 'sword block', label: 'sword block', desc: '剑格挡' },
      ],
      addonDefs: [
        { id: 'track', label: 'Track 追踪', desc: '任务追踪开关，可配置计分板显示', fields: { 'track': { scoreboard: true } }, params: [] },
        { id: 'stats', label: 'Stats 进度显示', desc: 'BossBar 进度条，支持自定义样式和脚本计算', fields: { 'stats': { visible: true } }, params: [] },
        { id: 'restart', label: 'Restart 重启', desc: '任务重启条件（如 player dead）', fields: {}, params: [] },
        { id: 'optional', label: 'Optional 可选条目', desc: '标记任务条目为可选，不影响任务完成状态', fields: {}, params: [] },
        { id: 'reset-data-on-accepted', label: 'Reset 数据重置', desc: '接受任务时重置条目进度数据', fields: {}, params: [] },
        { id: 'depend', label: 'Depend 任务依赖', desc: '设置任务前置条件，支持单个/组/条目间依赖', fields: {}, params: [] },
      ],
      agentHookDefs: [
        { id: 'accepted', label: 'accepted', desc: '接受任务之后执行', group: '任务' },
        { id: 'accept', label: 'accept', desc: '接受任务前执行（返回 false 可取消）', group: '任务' },
        { id: 'accept_cancelled', label: 'accept_cancelled', desc: '任务接受被取消后执行', group: '任务' },
        { id: 'complete', label: 'complete', desc: '任务完成前执行（返回 false 可取消）', group: '任务' },
        { id: 'completed', label: 'completed', desc: '任务完成后执行', group: '任务' },
        { id: 'fail', label: 'fail', desc: '任务失败前执行', group: '任务' },
        { id: 'failed', label: 'failed', desc: '任务失败后执行', group: '任务' },
        { id: 'restart', label: 'restart', desc: '重置任务前执行', group: '任务' },
        { id: 'restarted', label: 'restarted', desc: '重置任务后执行', group: '任务' },
        { id: 'continued', label: 'continued', desc: '任务条目继续后执行', group: '条目' },
      ],
    };
    _definitions.objectiveDefs.forEach(d => d._sec = 'objective');
    _definitions.addonDefs.forEach(d => d._sec = 'addon');
    _definitions.agentHookDefs.forEach(d => d._sec = 'hook');
    return _definitions;
  }

  // 向后兼容变量
  let QUEST_OBJECTIVE_TYPES = _ensureDefs().objectiveDefs.map(d => d.id);
  let QUEST_AGENT_HOOKS = _ensureDefs().agentHookDefs.map(d => d.id);
  let QUEST_ADDON_TYPES = _ensureDefs().addonDefs.map(d => d.id);

  /**
   * 从 desc/ 目录的 JSON 文件加载定义数据
   * @param {object} defs - 合并后的定义数据（api-default.json + api-*.json）
   */
  function setDefinitions(defs) {
    const objectives = [];
    const addons = [];

    // 1. 提取 minecraft 原版 objective
    if (defs?.minecraft?.objective) {
      for (const [id, obj] of Object.entries(defs.minecraft.objective)) {
        if (!obj || typeof obj !== 'object') continue;
        objectives.push({
          id,
          label: obj.name || id,
          desc: Array.isArray(obj.description) ? obj.description.join(' ') : (obj.description || ''),
          params: obj.params || [],
        });
      }
    }

    // 2. 提取插件 API objective（Adyeshach / MythicMobs / PlaceholderAPI / Chemdah）
    for (const [pluginName, pluginData] of Object.entries(defs || {})) {
      if (pluginName === 'minecraft' || !pluginData?.objective) continue;
      for (const [id, obj] of Object.entries(pluginData.objective)) {
        if (!obj || typeof obj !== 'object') continue;
        const desc = Array.isArray(obj.description) ? obj.description.join(' ') : (obj.description || '');
        objectives.push({
          id,
          label: obj.name || id,
          desc: pluginName !== 'Chemdah' ? `${desc} (${pluginName})` : desc,
          params: obj.params || [],
        });
      }
    }

    // 排序：minecraft 在前，其余按字母序
    objectives.sort((a, b) => {
      const aIsMc = defs?.minecraft?.objective?.[a.id] ? 0 : 1;
      const bIsMc = defs?.minecraft?.objective?.[b.id] ? 0 : 1;
      return aIsMc - bIsMc || a.id.localeCompare(b.id);
    });

    // 3. 提取 addon（addon + task_addon + quest_addon）
    const allAddonData = {
      ...(defs?.minecraft?.addon || {}),
      ...(defs?.minecraft?.task_addon || {}),
      ...(defs?.minecraft?.quest_addon || {}),
    };
    for (const [id, addon] of Object.entries(allAddonData)) {
      if (!addon || typeof addon !== 'object') continue;
      const desc = Array.isArray(addon.description) ? addon.description.join(' ') : (addon.description || '');
      const fields = _buildAddonFields(id, addon);
      addons.push({ id, label: addon.name || id, desc, fields, params: addon.params || [] });
    }

    // 4. agent 钩子 — JSON 中无定义，保留兜底
    const agentHookDefs = _ensureDefs().agentHookDefs;
    // JSON 无数据时不覆盖内置兜底定义（避免 UI 定义列表消失）
    const finalObjectives = objectives.length ? objectives : _ensureDefs().objectiveDefs;
    const finalAddons = addons.length ? addons : _ensureDefs().addonDefs;

    _definitions = { objectiveDefs: finalObjectives, addonDefs: finalAddons, agentHookDefs };
    finalObjectives.forEach(d => d._sec = 'objective');
    finalAddons.forEach(d => d._sec = 'addon');

    // 更新向后兼容变量
    QUEST_OBJECTIVE_TYPES = finalObjectives.map(d => d.id);
    QUEST_ADDON_TYPES = finalAddons.map(d => d.id);
    QUEST_AGENT_HOOKS = agentHookDefs.map(d => d.id);

    return true;
  }

  /** 根据 addon 定义构建默认 fields 对象 */
  function _buildAddonFields(id, addon) {
    if (addon.option_type === 'SECTION') {
      const obj = {};
      for (const p of addon.params || []) {
        if (p.type === 'boolean') obj[p.name] = false;
        else if (p.type === 'number') obj[p.name] = 0;
        else if (p.type === 'section') obj[p.name] = {};
        else if (p.type === 'list') obj[p.name] = [];
        else obj[p.name] = '';
      }
      return { [id]: Object.keys(obj).length > 0 ? obj : {} };
    }
    if (addon.option_type === 'BOOLEAN') return { [id]: false };
    if (addon.option_type === 'TEXT') return { [id]: '' };
    return { [id]: '' }; // ANY / MAP_LIST 默认空字符串
  }

  /**
   * 解析任务 YAML 为结构化数据
   * 返回 { quests: [...] }
   */
  function parseQuest(content) {
    if (!content || !content.trim()) return { quests: [] };

    try {
      const data = jsyaml.load(content);
      if (!data || typeof data !== 'object') return { quests: [] };

      const quests = [];
      for (const [questId, questData] of Object.entries(data)) {
        if (questId.startsWith('__') && questId.endsWith('__')) continue;
        if (!questData || typeof questData !== 'object') continue;

        const quest = {
          id: questId,
          meta: {},
          start: { npc: '', script: '' },
          accept: { script: '' },
          tasks: [],
          addon: {},
          agent: {},
          _raw: {},  // 保留无法识别的字段
        };

        for (const [section, sectionData] of Object.entries(questData)) {
          if (!sectionData || typeof sectionData !== 'object') {
            quest._raw[section] = sectionData;
            continue;
          }

          switch (section) {
            case 'meta':
              quest.meta = _parseQuestMeta(sectionData);
              break;
            case 'start':
              quest.start = _parseQuestStartAccept(sectionData);
              break;
            case 'accept':
              quest.accept = _parseQuestStartAccept(sectionData);
              break;
            case 'objectives':
            case 'task':
              quest.tasks = _parseQuestTasks(sectionData);
              break;
            case 'addon':
              quest.addon = _parseQuestAddon(sectionData);
              break;
            case 'agent':
              quest.agent = _parseQuestAgent(sectionData);
              break;
            default:
              quest._raw[section] = sectionData;
          }
        }

        quests.push(quest);
      }

      return { quests };
    } catch (e) {
      return { error: e.message, quests: [] };
    }
  }

  function _parseQuestMeta(data) {
    const meta = {};
    if (data.name) meta.name = String(data.name);
    if (data.type) meta.type = String(data.type);
    if (data.description) meta.description = String(data.description);
    if (data.depend !== undefined) {
      meta.depend = Array.isArray(data.depend)
        ? data.depend.map(String)
        : [String(data.depend)];
    }
    // stats
    if (data.stats && typeof data.stats === 'object') {
      meta.stats = {};
      if (data.stats.visible !== undefined) meta.stats.visible = data.stats.visible;
    }
    if (data.optional !== undefined) meta.optional = data.optional;
    if (data['reset-data-on-accepted'] !== undefined) meta['reset-data-on-accepted'] = data['reset-data-on-accepted'];
    // 保留 meta 内无法识别的字段 (编辑后原样写回)
    meta._raw = {};
    const metaKnown = ['name', 'type', 'description', 'depend', 'stats', 'optional', 'reset-data-on-accepted'];
    for (const mk of Object.keys(data)) {
      if (!metaKnown.includes(mk)) meta._raw[mk] = data[mk];
    }
    return meta;
  }

  function _parseQuestStartAccept(data) {
    const obj = { npc: '', script: '', _raw: {} };
    if (data.npc) obj.npc = String(data.npc);
    if (data.script) obj.script = String(data.script);
    for (const [k, v] of Object.entries(data)) {
      if (k !== 'npc' && k !== 'script') obj._raw[k] = v;
    }
    return obj;
  }

  function _parseQuestTasks(data) {
    const tasks = [];
    if (!Array.isArray(data)) {
      // 对象格式：可能是 { task_id: {...}, task_id2: {...} } 或单个 { condition: {...}, goal: {...} }
      // 判断：如果顶层 key 是任务字段名，则是单个任务；否则是 map
      const entries = Object.entries(data);
      if (entries.length === 0) return tasks;

      const taskFieldKeys = ['id', 'meta', 'objective', 'condition', 'goal', 'agent', 'position', 'value'];
      const firstKey = String(entries[0][0]);
      const isSingleTask = taskFieldKeys.includes(firstKey);

      if (isSingleTask) {
        // 单个任务对象：{ condition: {...}, goal: {...} }
        const item = { ...data };
        if (!item.id) item.id = '1';
        data = [item];
      } else {
        // Map 格式：{ '1': {...}, '2': {...} }
        data = entries.map(([key, val]) => {
          if (val && typeof val === 'object') {
            val.id = val.id || String(key);
          }
          return val;
        });
      }
    }
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const task = {
        id: item.id ? String(item.id) : String(tasks.length + 1),
        meta: {},
        objective: '',
        condition: {},
        goal: {},
        agent: {},
        _raw: {},
      };

      for (const [k, v] of Object.entries(item)) {
        if (k === 'id') continue;
        switch (k) {
          case 'meta':
            if (v && typeof v === 'object') {
              task.meta.name = v.name ? String(v.name) : '';
            }
            break;
          case 'objective':
            task.objective = String(v);
            break;
          case 'condition':
            if (v && typeof v === 'object') {
              if (v.value !== undefined) task.condition.value = String(v.value);
              if (v.position !== undefined) task.condition.position = String(v.position);
              // 如果 value 是 $ 开头，放入 kether
              const rawKeys = Object.keys(v).filter(key => key !== 'value' && key !== 'position');
              for (const rk of rawKeys) {
                if (rk === '$' || rk.startsWith('$')) {
                  task.condition.kether = String(v[rk]);
                } else {
                  task.condition[rk] = String(v[rk]);
                }
              }
            }
            break;
          case 'goal':
            if (v && typeof v === 'object') {
              Object.assign(task.goal, v);
              if (task.goal.amount !== undefined) task.goal.amount = String(task.goal.amount);
            }
            break;
          case 'agent':
            task.agent = _parseQuestAgent(v);
            break;
          default:
            task._raw[k] = v;
        }
      }

      tasks.push(task);
    }
    return tasks;
  }

  function _parseQuestAddon(data) {
    if (!data || typeof data !== 'object') return {};
    const addon = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'object' && !Array.isArray(v)) {
        addon[k] = {};
        for (const [sk, sv] of Object.entries(v)) {
          if (sv !== null && sv !== undefined) addon[k][sk] = sv;
        }
        if (Object.keys(addon[k]).length === 0) delete addon[k];
      } else {
        addon[k] = v;
      }
    }
    return addon;
  }

  function _parseQuestAgent(data) {
    if (!data || typeof data !== 'object') return {};
    const agent = {};
    for (const [k, v] of Object.entries(data)) {
      agent[k] = String(v);
    }
    return agent;
  }

  /** Look up Chinese label for addon ID from defs */
  function _getAddonLabel(id) {
    const def = _ensureDefs().addonDefs.find(d => d.id === id);
    return def ? I18N.desc('addonLabel', def.id, def.label) : id;
  }

  /** Look up field description for an addon parameter */
  function _getAddonFieldDesc(addonId, fieldName) {
    if (!addonId) return '';
    const def = _ensureDefs().addonDefs.find(d => d.id === addonId);
    if (!def || !def.params) return '';
    const param = def.params.find(function(p) { return p.name === fieldName; });
    return param ? (param.description || '') : '';
  }

  /** Recursively render an addon field value for the visual editor */
  function _renderAddonField(label, v, path, qi, addonId) {
    var descHtml = addonId ? _getAddonFieldDesc(addonId, path.split('.').pop()) : '';
    var descTag = descHtml ? ' <span class="cv-field-desc">— ' + _escHtml(descHtml) + '</span>' : '';
    if (typeof v === 'boolean') {
      return '<div class="cv-field"><label>' + label + descTag + '</label>' +
        '<select class="cv-select" data-field="' + path + '" data-q-index="' + qi + '">' +
        '<option value="true"' + (v === true ? ' selected' : '') + '>true</option>' +
        '<option value="false"' + (v === false ? ' selected' : '') + '>false</option>' +
        '</select></div>';
    }
    if (Array.isArray(v)) {
      return '<div class="cv-field cv-field-wide"><label>' + label + descTag + '</label>' +
        '<input class="cv-input" data-field="' + path + '" data-q-index="' + qi + '"' +
        ' value="' + _escHtml(v.join(', ')) + '"></div>';
    }
    if (typeof v === 'object' && v !== null) {
      var html = '<div class="qv-subsection"><div class="qv-subsection-title">' + label + '</div>';
      var entries = Object.entries(v);
      if (entries.length === 0) {
        html += '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.emptyObject') + '</div>';
      } else {
        for (var ei = 0; ei < entries.length; ei++) {
          var sk = entries[ei][0];
          var sv = entries[ei][1];
          html += _renderAddonField(_escHtml(sk), sv, path + '.' + _escHtml(sk), qi, addonId);
        }
      }
      html += '</div>';
      return html;
    }
    return '<div class="cv-field cv-field-wide"><label>' + label + descTag + '</label>' +
      '<input class="cv-input" data-field="' + path + '" data-q-index="' + qi + '"' +
      ' value="' + _escHtml(v != null ? String(v) : '') + '"></div>';
  }

  // ============================================
  // 任务可视化渲染
  // ============================================

  /**
   * 渲染任务文件的可视化编辑界面
   */
  function renderQuestVisual(parsed, containerEl) {
    if (!containerEl) return;

    if (parsed.error) {
      containerEl.innerHTML = `
        <div class="cv-error-banner">
          <span class="cv-error-icon">⚠️</span>
          <div>
            <strong>${I18N.t('chemdah.yamlError')}</strong>
            <p>${_escHtml(parsed.error)}</p>
            <p>${I18N.t('chemdah.yamlErrorHint')}</p>
          </div>
        </div>
      `;
      return;
    }

    let html = '<div class="cv-container cv-quest-container">';

    // === 左侧主内容区 ===
    html += '<div class="cv-main-content">';
    html += `<div class="cv-section-header">
      <h3>${I18N.t('chemdah.questList')} <span class="cv-count">${parsed.quests.length}</span></h3>
      <button class="cv-btn cv-btn-sm cv-btn-primary" data-action="q-add-quest">${I18N.t('chemdah.addQuest')}</button>
    </div>`;

    if (parsed.quests.length === 0) {
      html += '<div class="cv-empty">' + I18N.t('chemdah.noQuests') + '</div>';
    } else {
      for (let qi = 0; qi < parsed.quests.length; qi++) {
        html += _renderQuestCard(parsed.quests[qi], qi);
      }
    }

    // 底部操作栏
    html += `<div class="cv-toolbar">
      <button class="cv-btn cv-btn-primary" data-action="q-sync-to-source">${I18N.t('chemdah.syncToSource')}</button>
      <label class="ke-auto-sync-toggle" style="font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;margin-left:8px;user-select:none;"><input type="checkbox" data-action="toggle-visual-autosync" ${window.__keAutoSync ? 'checked' : ''}> ${I18N.t('chemdah.autoSync')}</label>
      <span class="cv-toolbar-hint">${I18N.t('chemdah.syncHint')}</span>
    </div>`;

    html += '</div>'; // cv-main-content

    // === 右侧导航 ===
    html += '<div class="cv-sidebar">';
    html += '<div class="cv-sidebar-header">' + I18N.t('chemdah.questNav') + '</div>';
    html += '<div class="cv-sidebar-list">';
    for (let qi = 0; qi < parsed.quests.length; qi++) {
      const q = parsed.quests[qi];
      const label = q.meta.name || q.id;
      html += `<div class="cv-sidebar-item" data-action="q-nav" data-q-index="${qi}" data-tip="${_escHtml(q.id)}">
        <span class="cv-sidebar-type Q">Q</span>
        <span class="cv-sidebar-name">${_escHtml(label)}</span>
      </div>`;
    }
    html += '</div></div>'; // cv-sidebar

    html += '</div>'; // cv-container

    containerEl.innerHTML = html;

    // 绑定事件
    _bindQuestEvents(containerEl, parsed);
  }

  function _renderQuestCard(quest, qi) {
    const label = quest.meta.name || quest.id;
    const typeLabel = quest.meta.type || 'L1';
    // class 只允许字母数字下划线连字符, 防止 meta.type 注入 HTML
    const typeCls = String(typeLabel).replace(/[^\w-]/g, '') || 'L1';

    let html = `<div class="qv-card collapsed" data-q-index="${qi}">`;

    // === 头部 ===
    html += `<div class="qv-header">
      <span class="qv-toggle-area" data-action="q-toggle-card" data-q-index="${qi}">
        <span class="cv-toggle-arrow">▶</span>
        <span class="cv-card-preview">${_escHtml(label)}</span>
      </span>
      <span class="qv-type-badge qv-type-${typeCls}">${_escHtml(typeLabel)}</span>
      <span class="qv-task-count">${I18N.t('chemdah.subtaskCount', {count: quest.tasks.length})}</span>
      <button class="cv-btn-icon" data-action="q-delete-quest" data-q-index="${qi}" data-tip="${I18N.t('chemdah.deleteQuest')}">&times;</button>
    </div>`;

    // === 体部（折叠后隐藏） ===
    html += '<div class="qv-body">';

    // ---- 基本信息 ----
    html += '<div class="qv-section">';
    html += '<div class="qv-section-title">' + I18N.t('chemdah.basicInfo') + '</div>';
    html += '<div class="qv-grid-2">';
    html += `<div class="cv-field"><label>${I18N.t('chemdah.questId')}</label>
      <input class="cv-input cv-input-mono" data-field="q.id" data-q-index="${qi}"
        value="${_escHtml(quest.id)}" placeholder="${I18N.t('chemdah.questIdPlaceholder')}"></div>`;
    html += `<div class="cv-field"><label>${I18N.t('chemdah.displayName')}</label>
      <input class="cv-input" data-field="q.meta.name" data-q-index="${qi}"
        value="${_escHtml(quest.meta.name || '')}" placeholder="${I18N.t('chemdah.questNamePlaceholder')}"></div>`;
    html += `<div class="cv-field"><label>${I18N.t('chemdah.type')}</label>
      <input class="cv-input cv-input-mono" data-field="q.meta.type" data-q-index="${qi}"
        value="${_escHtml(quest.meta.type || 'L1')}" placeholder="L1"></div>`;
    html += '</div>'; // qv-grid-2

    html += `<div class="cv-field cv-field-wide"><label>${I18N.t('chemdah.description')}</label>
      <textarea class="cv-textarea" data-field="q.meta.description" data-q-index="${qi}"
        rows="2" placeholder="${I18N.t('chemdah.questDescPlaceholder')}">${_escHtml(quest.meta.description || '')}</textarea></div>`;

    // 前置任务
    html += `<div class="cv-field cv-field-wide"><label>${I18N.t('chemdah.depend')}</label>
      <input class="cv-input" data-field="q.meta.depend" data-q-index="${qi}"
        value="${_escHtml(quest.meta.depend ? quest.meta.depend.join(', ') : '')}" placeholder="${I18N.t('chemdah.dependPlaceholder')}"></div>`;

    // meta 附加字段
    if (quest.meta.stats) {
      html += `<div class="cv-field"><label>${I18N.t('chemdah.statsVisible')}</label>
        <select class="cv-select" data-field="q.meta.stats.visible" data-q-index="${qi}">
          <option value="true" ${quest.meta.stats.visible !== false ? 'selected' : ''}>${I18N.t('chemdah.show')}</option>
          <option value="false" ${quest.meta.stats.visible === false ? 'selected' : ''}>${I18N.t('chemdah.hide')}</option>
        </select></div>`;
    }
    if (quest.meta.optional !== undefined) {
      html += `<div class="cv-field"><label>${I18N.t('chemdah.optional')}</label>
        <select class="cv-select" data-field="q.meta.optional" data-q-index="${qi}">
          <option value="true" ${quest.meta.optional === true ? 'selected' : ''}>${I18N.t('chemdah.yes')}</option>
          <option value="false" ${quest.meta.optional !== true ? 'selected' : ''}>${I18N.t('chemdah.no')}</option>
        </select></div>`;
    }

    html += '</div>'; // qv-section

    // ---- 子任务列表 ----
    html += `<div class="qv-section" data-action="q-open-task-manager" data-q-index="${qi}" style="cursor:pointer;">`;
    html += `<div class="qv-section-title">${I18N.t('chemdah.subtasks')} <span class="cv-count">${quest.tasks.length}</span></div>`;

    if (quest.tasks.length === 0) {
      html += '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.noSubtasks') + '</div>';
    } else {
      html += '<div class="qv-task-list-preview">';
      const previews = [];
      for (let ti = 0; ti < quest.tasks.length; ti++) {
        const t = quest.tasks[ti];
        const objDef = _ensureDefs().objectiveDefs.find(d => d.id === t.objective);
        const objLabel = objDef ? I18N.desc('objectiveLabel', objDef.id, objDef.label) : (t.objective || '?');
        previews.push(`<span class="qv-task-chip">${_escHtml(t.id)} <span class="qv-task-chip-obj">${_escHtml(t.meta?.name || objLabel)}</span></span>`);
      }
      html += previews.join('') + '</div>';
    }
    html += '</div>'; // qv-section

    // ---- Agent (任务级) ----
    html += '<div class="qv-section">';
    html += `<div class="qv-section-title">${I18N.t('chemdah.agentScripts')}
      <button class="cv-btn cv-btn-xs cv-btn-secondary" data-action="q-add-agent-hook"
        data-q-index="${qi}">${I18N.t('chemdah.addHook')}</button>
    </div>`;
    const agentEntries = Object.entries(quest.agent);
    if (agentEntries.length === 0) {
      html += '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.noHooks') + '</div>';
    } else {
      for (const [hook, script] of agentEntries) {
        html += `<div class="cv-field cv-field-wide" style="position:relative;">
          <label>${_escHtml(hook)}</label>
          <textarea class="cv-textarea cv-textarea-code" data-field="q.agent.${_escHtml(hook)}"
            data-q-index="${qi}" rows="2" placeholder="${I18N.t('chemdah.ketherScript')}">${_escHtml(script)}</textarea>
          <button class="cv-btn-icon cv-btn-icon-danger" style="position:absolute;top:0;right:0;"
            data-action="q-delete-agent-hook"
            data-q-index="${qi}" data-hook="${_escHtml(hook)}" data-tip="${I18N.t('chemdah.deleteHook')}">&times;</button>
        </div>`;
      }
    }
    html += '</div>';

    // ---- Addon (管理弹窗) ----
    var addonKeys = Object.keys(quest.addon);
    html += '<div class="qv-section" data-action="q-open-addon-manager" data-q-index="' + qi + '" style="cursor:pointer;">';
    html += '<div class="qv-section-title">' + I18N.t('chemdah.addons') + ' <span class="cv-count">' + addonKeys.length + '</span></div>';
    if (addonKeys.length === 0) {
      html += '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.noAddons') + '</div>';
    } else {
      html += '<div class="qv-task-list-preview">';
      for (var ai = 0; ai < addonKeys.length; ai++) {
        var ak = addonKeys[ai];
        var aLabel = _getAddonLabel(ak);
        html += '<span class="qv-task-chip">' + _escHtml(aLabel) + '</span>';
      }
      html += '</div>';
    }
    html += '</div>'; // qv-section addon

    html += '</div>'; // qv-body
    html += '</div>'; // qv-card
    return html;
  }

  // ============================================
  // 任务选择器弹窗
  // ============================================

  /**
   * 通用搜索选择弹窗
   * @param {object} options
   * @param {string} options.title - 弹窗标题
   * @param {string} options.placeholder - 搜索框占位
   * @param {Array<{id:string, label:string, desc:string, group:string}>} options.items - 可选项列表
   * @param {'single'|'multi'} options.mode - 单选/多选
   * @param {function} options.onConfirm - (selectedIds) => {}
   */
  function _showQuestSelectorModal(options) {
    const old = document.getElementById('qv-modal-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'qv-modal-overlay';
    overlay.className = 'cv-modal'; // reuse existing modal style

    const itemsHtml = options.items.map(item => {
      const sec = item._sec || '';
      const label = sec ? I18N.desc(sec + 'Label', item.id, item.label) : item.label;
      const desc = sec ? I18N.desc(sec, item.id, item.desc) : item.desc;
      return `<div class="qv-sel-item" data-id="${_escHtml(item.id)}" data-group="${_escHtml(item.group || '')}">
        <span class="qv-sel-item-label">${_escHtml(label)}</span>
        <span class="qv-sel-item-desc">${_escHtml(desc || '')}</span>
      </div>`;
    }).join('');

    overlay.innerHTML = `
      <div class="cv-modal-content qv-modal-content">
        <h3>${_escHtml(options.title)}</h3>
        <input class="cv-input qv-sel-search" type="text" placeholder="${_escHtml(options.placeholder || I18N.t('chemdah.search'))}" autofocus>
        <div class="qv-sel-list${options.mode === 'multi' ? ' qv-sel-multi' : ''}">
          ${itemsHtml}
        </div>
        <div class="cv-modal-actions">
          <button class="cv-btn cv-btn-secondary qv-sel-cancel">${I18N.t('chemdah.cancel')}</button>
          <button class="cv-btn cv-btn-primary qv-sel-confirm">${options.mode === 'multi' ? I18N.t('chemdah.addSelected') : I18N.t('chemdah.select')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector('.qv-sel-list');
    const search = overlay.querySelector('.qv-sel-search');
    const confirmBtn = overlay.querySelector('.qv-sel-confirm');

    // 已选（多选模式）
    const selected = new Set();

    // 搜索过滤
    search.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      list.querySelectorAll('.qv-sel-item').forEach(el => {
        const text = el.textContent.toLowerCase();
        el.style.display = (!q || text.includes(q)) ? '' : 'none';
      });
    });

    // 选择
    list.addEventListener('click', function (e) {
      const item = e.target.closest('.qv-sel-item');
      if (!item) return;
      playSound('click');

      if (options.mode === 'multi') {
        item.classList.toggle('qv-sel-selected');
        const id = item.dataset.id;
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        confirmBtn.textContent = selected.size > 0 ? I18N.t('chemdah.addSelectedCount', {count: selected.size}) : I18N.t('chemdah.addSelected');
      } else {
        // 单选：高亮后自动确认
        list.querySelectorAll('.qv-sel-item').forEach(el => el.classList.remove('qv-sel-selected'));
        item.classList.add('qv-sel-selected');
        const id = item.dataset.id;
        overlay.remove();
        if (options.onConfirm) options.onConfirm([id]);
      }
    });

    overlay.querySelector('.qv-sel-cancel').addEventListener('click', () => {
      playSound('close');
      overlay.remove();
      if (options.onCancel) options.onCancel();
    });

    confirmBtn.addEventListener('click', () => {
      playSound('submit');
      if (options.mode === 'multi') {
        const ids = Array.from(selected);
        overlay.remove();
        if (options.onConfirm) options.onConfirm(ids);
      }
    });

    // 点击背景关闭
    overlay.addEventListener('click', function (e) {
      if (e.target === this) {
        overlay.remove();
        if (options.onCancel) options.onCancel();
      }
    });

    // 搜索框自动聚焦
    setTimeout(() => search.focus(), 100);
  }

  // ============================================
  // 可视化物品编辑器弹窗
  // ============================================

  const ITEM_NAMESPACES_NATIVE = [
    { id: 'minecraft', label: 'minecraft/mc' },
    { id: 'zaphkiel', label: 'Zaphkiel' },
    { id: 'rpgitem', label: 'RPGItem' },
    { id: 'mmoitem', label: 'MMOItem' },
    { id: 'qrpg', label: 'QRPG' },
    { id: 'pxrpg', label: 'PxRPG' },
    { id: 'julyitem', label: 'JulyItem' },
    { id: 'eitems', label: 'EItems' },
  ];
  const ITEM_NAMESPACES_ADDON = [
    { id: 'ni', label: 'NI' },
    { id: 'mm', label: 'MM' },
    { id: 'af', label: 'AF' },
    { id: 'ce', label: 'CE' },
    { id: 'sx', label: 'SX/SXI/SXItem' },
  ];

  /**
   * 可视化物品编辑器
   * @param {string} initialValue - 初始物品格式字符串
   * @param {function} onConfirm - (itemString) => {}
   */
  function _showItemEditorModal(initialValue, onConfirm) {
    const old = document.getElementById('qv-item-editor-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'qv-item-editor-overlay';
    overlay.className = 'cv-modal';

    // 解析初始值
    const parsed = _parseItemString(initialValue || '');

    // 构建命名空间选项
    const nsHtml = ['<option value="">' + I18N.t('chemdah.minecraftVanilla') + '</option>'];
    nsHtml.push('<optgroup label="' + I18N.t('chemdah.nativeSupport') + '">');
    for (const ns of ITEM_NAMESPACES_NATIVE) {
      nsHtml.push(`<option value="${_escHtml(ns.id)}" ${parsed.namespace === ns.id ? 'selected' : ''}>${_escHtml(ns.label)}</option>`);
    }
    nsHtml.push('</optgroup><optgroup label="' + I18N.t('chemdah.addonSupport') + '">');
    for (const ns of ITEM_NAMESPACES_ADDON) {
      nsHtml.push(`<option value="${_escHtml(ns.id)}" ${parsed.namespace === ns.id ? 'selected' : ''}>${_escHtml(ns.label)}</option>`);
    }
    nsHtml.push('</optgroup>');

    // Lore 转为多行文本
    const loreText = Array.isArray(parsed.lore) ? parsed.lore.join('\n') : (parsed.lore || '');

    // 附魔列表
    let enchHtml = '';
    for (const [i, ench] of (parsed.enchants || []).entries()) {
      enchHtml += `<div class="qie-ench-row" data-idx="${i}">
        <input class="cv-input cv-input-mono qie-ench-id" value="${_escHtml(ench.id)}" placeholder="${I18N.t('chemdah.enchantIdPlaceholder')}" style="flex:2;">
        <input class="cv-input qie-ench-lvl" value="${_escHtml(ench.level)}" placeholder="${I18N.t('chemdah.level')}" style="width:70px;">
        <button class="cv-btn-icon cv-btn-icon-danger qie-ench-del">&times;</button>
      </div>`;
    }

    // NBT 列表
    let nbtHtml = '';
    for (const [i, nbt] of (parsed.nbtList || []).entries()) {
      nbtHtml += `<div class="qie-nbt-row" data-idx="${i}">
        <input class="cv-input cv-input-mono qie-nbt-key" value="${_escHtml(nbt.key)}" placeholder="${I18N.t('chemdah.nbtPathPlaceholder')}" style="flex:2;">
        <input class="cv-input cv-input-mono qie-nbt-val" value="${_escHtml(nbt.value)}" placeholder="${I18N.t('chemdah.value')}" style="flex:2;">
        <span class="qie-nbt-op">
          <select class="cv-select qie-nbt-operator"><option value="=" ${nbt.op === '=' ? 'selected' : ''}>=</option><option value="!=" ${nbt.op === '!=' ? 'selected' : ''}>!=</option></select>
        </span>
        <button class="cv-btn-icon cv-btn-icon-danger qie-nbt-del">&times;</button>
      </div>`;
    }

    overlay.innerHTML = `
      <div class="cv-modal-content qv-task-editor-content" style="max-width:620px!important;">
        <h3>${I18N.t('chemdah.itemEditor')}</h3>
        <div class="qv-task-editor-form">
          <div class="qie-notice" style="display:none;padding:8px 10px;margin-bottom:10px;background:rgba(255,214,0,0.1);border:1px solid rgba(255,214,0,0.3);border-radius:4px;font-size:12px;color:var(--color-warning);">
            ${I18N.t('chemdah.namespaceNotice')}
          </div>
          <div class="qv-grid-2">
            <div class="cv-field"><label>${I18N.t('chemdah.namespace')}</label>
              <select class="cv-select" id="qie-namespace">${nsHtml.join('')}</select></div>
            <div class="cv-field"><label>${I18N.t('chemdah.itemId')}</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input class="cv-input cv-input-mono" id="qie-item-id" value="${_escHtml(parsed.itemId)}" placeholder="${I18N.t('chemdah.itemIdPlaceholder')}" style="flex:1;">
                <label style="font-size:12px;white-space:nowrap;display:flex;align-items:center;gap:4px;cursor:pointer;">
                  <input type="checkbox" id="qie-wildcard" ${parsed.itemId === '*' ? 'checked' : ''}> ${I18N.t('chemdah.wildcard')}
                </label>
              </div></div>
          </div>

          <div class="qv-subsection">
            <div class="qv-subsection-title">${I18N.t('chemdah.display')}</div>
            <div class="cv-field"><label>${I18N.t('chemdah.nameField')}</label>
              <div style="display:flex;gap:6px;">
                <select class="cv-select" id="qie-name-op" style="width:auto;flex-shrink:0;">
                  <option value="=" ${parsed.nameOp === '=' ? 'selected' : ''}>= ${I18N.t('chemdah.exact')}</option>
                  <option value="!=" ${parsed.nameOp === '!=' ? 'selected' : ''}>!= ${I18N.t('chemdah.notEqual')}</option>
                  <option value="#" ${parsed.nameOp === '#' ? 'selected' : ''}># ${I18N.t('chemdah.ignoreColor')}</option>
                  <option value="()" ${parsed.nameOp === '()' ? 'selected' : ''}>( ) ${I18N.t('chemdah.contains')}</option>
                </select>
                <input class="cv-input" id="qie-name" value="${_escHtml(parsed.name || '')}" placeholder="${I18N.t('chemdah.namePlaceholder')}" style="flex:1;">
              </div></div>
            <div class="cv-field"><label>${I18N.t('chemdah.lore')}</label>
              <textarea class="cv-textarea" id="qie-lore" rows="3" placeholder="lore">${_escHtml(loreText)}</textarea></div>
          </div>

          <div class="qv-subsection">
            <div class="qv-subsection-title">${I18N.t('chemdah.attributes')}</div>
            <div class="qv-grid-2">
              <div class="cv-field"><label>Amount</label>
                <div style="display:flex;gap:6px;">
                  <select class="cv-select" id="qie-amount-op" style="width:auto;flex-shrink:0;">
                    <option value="=" ${parsed.amountOp === '=' ? 'selected' : ''}>=</option>
                    <option value="!=" ${parsed.amountOp === '!=' ? 'selected' : ''}>!=</option>
                    <option value="<" ${parsed.amountOp === '<' ? 'selected' : ''}><</option>
                    <option value=">" ${parsed.amountOp === '>' ? 'selected' : ''}>></option>
                    <option value="<=" ${parsed.amountOp === '<=' ? 'selected' : ''}><=</option>
                    <option value=">=" ${parsed.amountOp === '>=' ? 'selected' : ''}>>=</option>
                    <option value="()" ${parsed.amountOp === '()' ? 'selected' : ''}>( )</option>
                  </select>
                  <input class="cv-input" id="qie-amount" value="${_escHtml(parsed.amount || '')}" placeholder="${I18N.t('chemdah.amountPlaceholder')}" style="flex:1;">
                </div></div>
              <div class="cv-field"><label>Damage</label>
                <div style="display:flex;gap:6px;">
                  <select class="cv-select" id="qie-damage-op" style="width:auto;flex-shrink:0;">
                    <option value="=" ${parsed.damageOp === '=' ? 'selected' : ''}>=</option>
                    <option value="!=" ${parsed.damageOp === '!=' ? 'selected' : ''}>!=</option>
                    <option value="<" ${parsed.damageOp === '<' ? 'selected' : ''}><</option>
                    <option value=">" ${parsed.damageOp === '>' ? 'selected' : ''}>></option>
                    <option value="<=" ${parsed.damageOp === '<=' ? 'selected' : ''}><=</option>
                    <option value=">=" ${parsed.damageOp === '>=' ? 'selected' : ''}>>=</option>
                    <option value="()" ${parsed.damageOp === '()' ? 'selected' : ''}>( )</option>
                  </select>
                  <input class="cv-input" id="qie-damage" value="${_escHtml(parsed.damage || '')}" placeholder="${I18N.t('chemdah.damagePlaceholder')}" style="flex:1;">
                </div></div>
            </div>
            <div class="cv-field"><label>Custom Model Data</label>
              <div style="display:flex;gap:6px;">
                <select class="cv-select" id="qie-cmd-op" style="width:auto;flex-shrink:0;">
                  <option value="=" ${parsed.cmdOp === '=' ? 'selected' : ''}>=</option>
                  <option value="!=" ${parsed.cmdOp === '!=' ? 'selected' : ''}>!=</option>
                  <option value="<" ${parsed.cmdOp === '<' ? 'selected' : ''}><</option>
                  <option value=">" ${parsed.cmdOp === '>' ? 'selected' : ''}>></option>
                  <option value="<=" ${parsed.cmdOp === '<=' ? 'selected' : ''}><=</option>
                  <option value=">=" ${parsed.cmdOp === '>=' ? 'selected' : ''}>>=</option>
                  <option value="()" ${parsed.cmdOp === '()' ? 'selected' : ''}>( )</option>
                </select>
                <input class="cv-input" id="qie-cmd" value="${_escHtml(parsed.customModelData || '')}" placeholder="${I18N.t('chemdah.valuePlaceholder')}" style="flex:1;">
              </div></div>
          </div>

          <div class="qv-subsection">
            <div class="qv-subsection-title">${I18N.t('chemdah.enchants')}
              <button class="cv-btn cv-btn-xs cv-btn-secondary" id="qie-ench-add" style="margin-left:auto;">${I18N.t('chemdah.add')}</button>
            </div>
            <div id="qie-ench-list">${enchHtml || '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.noEnchants') + '</div>'}</div>
          </div>

          <div class="qv-subsection">
            <div class="qv-subsection-title">${I18N.t('chemdah.nbt')}
              <button class="cv-btn cv-btn-xs cv-btn-secondary" id="qie-nbt-add" style="margin-left:auto;">${I18N.t('chemdah.add')}</button>
            </div>
            <div id="qie-nbt-list">${nbtHtml || '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.noNbt') + '</div>'}</div>
          </div>

          <div class="qv-subsection">
            <div class="qv-subsection-title">${I18N.t('chemdah.preview')}</div>
            <div class="qie-preview" id="qie-preview">${_escHtml(initialValue || '—')}</div>
          </div>
        </div>
        <div class="cv-modal-actions">
          <button class="cv-btn cv-btn-secondary" id="qie-cancel">${I18N.t('chemdah.cancel')}</button>
          <button class="cv-btn cv-btn-primary" id="qie-confirm">${I18N.t('chemdah.confirm')}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // 命名空间切换 -> 警告提示
    overlay.querySelector('#qie-namespace').addEventListener('change', function () {
      const isAddon = ITEM_NAMESPACES_ADDON.some(ns => ns.id === this.value);
      overlay.querySelector('.qie-notice').style.display = isAddon ? 'block' : 'none';
      _updatePreview(overlay);
    });

    // 所有输入变更 -> 更新预览
    overlay.querySelectorAll('#qie-item-id, #qie-name, #qie-amount, #qie-damage, #qie-cmd').forEach(el => {
      el.addEventListener('input', () => _updatePreview(overlay));
    });
    overlay.querySelector('#qie-lore').addEventListener('input', () => _updatePreview(overlay));
    overlay.querySelector('#qie-name-op').addEventListener('change', () => _updatePreview(overlay));
    overlay.querySelector('#qie-amount-op').addEventListener('change', () => _updatePreview(overlay));
    overlay.querySelector('#qie-damage-op').addEventListener('change', () => _updatePreview(overlay));
    overlay.querySelector('#qie-cmd-op').addEventListener('change', () => _updatePreview(overlay));
    overlay.querySelector('#qie-wildcard').addEventListener('change', function () {
      const idInput = overlay.querySelector('#qie-item-id');
      if (this.checked) {
        idInput.value = '*';
        idInput.disabled = true;
      } else {
        idInput.disabled = false;
        if (idInput.value === '*') idInput.value = '';
      }
      _updatePreview(overlay);
    });
    if (overlay.querySelector('#qie-wildcard').checked) {
      overlay.querySelector('#qie-item-id').disabled = true;
    }

    // 附魔添加
    overlay.querySelector('#qie-ench-add').addEventListener('click', () => { playSound('click');
      const list = overlay.querySelector('#qie-ench-list');
      const empty = list.querySelector('.cv-empty');
      if (empty) empty.remove();
      const row = document.createElement('div');
      row.className = 'qie-ench-row';
      row.innerHTML = `
        <input class="cv-input cv-input-mono qie-ench-id" placeholder="${I18N.t('chemdah.enchantIdPlaceholder')}" style="flex:2;">
        <input class="cv-input qie-ench-lvl" placeholder="${I18N.t('chemdah.level')}" style="width:70px;">
        <button class="cv-btn-icon cv-btn-icon-danger qie-ench-del">&times;</button>`;
      list.appendChild(row);
      _updatePreview(overlay);
    });

    // 附魔删除（委托）
    overlay.querySelector('#qie-ench-list').addEventListener('click', (e) => {
      if (e.target.closest('.qie-ench-del')) {
        e.target.closest('.qie-ench-row').remove();
        _updatePreview(overlay);
      }
    });
    // 附魔输入更新预览
    overlay.querySelector('#qie-ench-list').addEventListener('input', () => _updatePreview(overlay));

    // NBT 添加
    overlay.querySelector('#qie-nbt-add').addEventListener('click', () => { playSound('click');
      const list = overlay.querySelector('#qie-nbt-list');
      const empty = list.querySelector('.cv-empty');
      if (empty) empty.remove();
      const row = document.createElement('div');
      row.className = 'qie-nbt-row';
      row.innerHTML = `
        <input class="cv-input cv-input-mono qie-nbt-key" placeholder="${I18N.t('chemdah.nbtPathPlaceholder')}" style="flex:2;">
        <input class="cv-input cv-input-mono qie-nbt-val" placeholder="${I18N.t('chemdah.value')}" style="flex:2;">
        <span class="qie-nbt-op">
          <select class="cv-select qie-nbt-operator"><option value="=">=</option><option value="!=">!=</option></select>
        </span>
        <button class="cv-btn-icon cv-btn-icon-danger qie-nbt-del">&times;</button>`;
      list.appendChild(row);
      _updatePreview(overlay);
    });

    // NBT 删除
    overlay.querySelector('#qie-nbt-list').addEventListener('click', (e) => {
      if (e.target.closest('.qie-nbt-del')) {
        e.target.closest('.qie-nbt-row').remove();
        _updatePreview(overlay);
      }
    });
    overlay.querySelector('#qie-nbt-list').addEventListener('input', () => _updatePreview(overlay));

    // 确认
    overlay.querySelector('#qie-confirm').addEventListener('click', () => { playSound('click');
      const result = _generateItemString(overlay);
      overlay.remove();
      if (onConfirm) onConfirm(result);
    });

    // 取消
    overlay.querySelector('#qie-cancel').addEventListener('click', () => { playSound('close'); overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === this) overlay.remove(); });

    // 通知
    overlay.querySelector('.qie-notice').style.display = ITEM_NAMESPACES_ADDON.some(ns => ns.id === parsed.namespace) ? 'block' : 'none';
  }

  /** 解析物品字符串为结构化对象 */
  function _parseItemString(str) {
    const result = { namespace: '', itemId: '', name: '', nameOp: '=', lore: [], amount: '', amountOp: '=', damage: '', damageOp: '=', customModelData: '', cmdOp: '=', enchants: [], nbtList: [] };
    if (!str) return result;

    // namespace:item_id[...]
    let rest = str;
    const colonIdx = rest.indexOf(':');
    if (colonIdx > 0) {
      result.namespace = rest.substring(0, colonIdx);
      rest = rest.substring(colonIdx + 1);
    }

    // item_id[...]
    const bracketIdx = rest.indexOf('[');
    if (bracketIdx < 0) {
      result.itemId = rest;
      return result;
    }
    result.itemId = rest.substring(0, bracketIdx);
    const content = rest.substring(bracketIdx + 1, rest.lastIndexOf(']'));
    if (!content) return result;

    // 解析条件：用逗号分隔，但注意括号内的逗号
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of content) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());

    for (const part of parts) {
      // 检测操作符
      const opMatch = part.match(/^(\w[\w.]*)\s*(!=|<=|>=|=|<|>|\(.*\))\s*(.*)$/);
      if (!opMatch) continue;
      const key = opMatch[1];
      const op = opMatch[2];
      const val = opMatch[3];

      if (key === 'name') {
        if (op.startsWith('(') && op.endsWith(')')) {
          result.name = op.slice(1, -1) || val;
          result.nameOp = '()';
        } else if (op === '=' && val.startsWith('#')) {
          result.name = val.substring(1);
          result.nameOp = '#';
        } else {
          result.name = val;
          result.nameOp = op;
        }
      } else if (key === 'lore') {
        // Lore 可能是 name(lore内容) 或 key=lore内容
        if (op.startsWith('(')) {
          result.lore.push(op + val);
        } else {
          result.lore.push(val);
        }
      } else if (key === 'amount' || key === 'damage' || key === 'durability') {
        const target = key === 'durability' ? 'damage' : key;
        const opKey = target + 'Op';
        if (op.startsWith('(') && op.endsWith(')')) {
          result[target] = op.slice(1, -1) || val;
          result[opKey] = '()';
        } else {
          result[target] = val;
          result[opKey] = op;
        }
      } else if (key === 'custom-model-data' || key === 'model') {
        if (op.startsWith('(') && op.endsWith(')')) {
          result.customModelData = op.slice(1, -1) || val;
          result.cmdOp = '()';
        } else {
          result.customModelData = val;
          result.cmdOp = op;
        }
      } else if (key.startsWith('ench')) {
        const enchName = key.includes('.') ? key.split('.')[1] : key;
        if (enchName !== 'ench') {
          result.enchants.push({ id: enchName, level: op + val });
        } else {
          // ench=damage_all  -> 等级默认为1
          result.enchants.push({ id: val, level: '1' });
        }
      } else if (key.startsWith('nbt')) {
        const nbtPath = key.includes('.') ? key.substring(key.indexOf('.') + 1) : '';
        if (nbtPath) {
          result.nbtList.push({ key: nbtPath, value: val, op });
        }
      }
    }

    return result;
  }

  /** 从编辑器表单生成物品字符串 */
  function _generateItemString(overlay) {
    const namespace = overlay.querySelector('#qie-namespace').value;
    const itemId = overlay.querySelector('#qie-item-id').value.trim();
    const name = overlay.querySelector('#qie-name').value.trim();
    const loreRaw = overlay.querySelector('#qie-lore').value.trim();
    const amount = overlay.querySelector('#qie-amount').value.trim();
    const damage = overlay.querySelector('#qie-damage').value.trim();
    const cmd = overlay.querySelector('#qie-cmd').value.trim();

    const conditions = [];

    if (name) {
      const nameOp = overlay.querySelector('#qie-name-op').value;
      if (nameOp === '()') {
        conditions.push(`name(${name})`);
      } else if (nameOp === '#') {
        conditions.push(`name=#${name}`);
      } else {
        conditions.push(`name${nameOp}${name}`);
      }
    }
    if (loreRaw) {
      const loreLines = loreRaw.split('\n').filter(Boolean);
      for (const line of loreLines) {
        conditions.push(`lore=${line}`);
      }
    }
    if (amount) {
      const op = overlay.querySelector('#qie-amount-op').value;
      if (op === '()') conditions.push(`amount(${amount})`);
      else conditions.push(`amount${op}${amount}`);
    }
    if (damage) {
      const op = overlay.querySelector('#qie-damage-op').value;
      if (op === '()') conditions.push(`damage(${damage})`);
      else conditions.push(`damage${op}${damage}`);
    }
    if (cmd) {
      const op = overlay.querySelector('#qie-cmd-op').value;
      if (op === '()') conditions.push(`custom-model-data(${cmd})`);
      else conditions.push(`custom-model-data${op}${cmd}`);
    }

    // 附魔
    overlay.querySelectorAll('.qie-ench-row').forEach(row => {
      const id = row.querySelector('.qie-ench-id').value.trim();
      const lvl = row.querySelector('.qie-ench-lvl').value.trim();
      if (id) {
        conditions.push(lvl ? `enchant.${id}=${lvl}` : `ench=${id}`);
      }
    });

    // NBT
    overlay.querySelectorAll('.qie-nbt-row').forEach(row => {
      const key = row.querySelector('.qie-nbt-key').value.trim();
      const val = row.querySelector('.qie-nbt-val').value.trim();
      const op = row.querySelector('.qie-nbt-operator').value;
      if (key && val) {
        conditions.push(`nbt.${key}${op}${val}`);
      }
    });

    const prefix = namespace ? `${namespace}:${itemId}` : (itemId || '*');
    if (conditions.length === 0) return prefix;
    return `${prefix}[${conditions.join(',')}]`;
  }

  /** 更新预览 */
  function _updatePreview(overlay) {
    const preview = overlay.querySelector('#qie-preview');
    if (preview) {
      preview.textContent = _generateItemString(overlay) || '—';
    }
  }

  // ============================================
  // 子任务编辑器弹窗
  // ============================================

  /**
   * 子任务编辑器弹窗（左右分栏，同 addon 管理器风格）
   * 左侧列出所有子任务，右侧显示选中任务的详情
   */
  function _showQuestTaskEditorModal(quest, qi, ti, container) {
    const defs = _ensureDefs();
    const old = document.getElementById('qv-task-editor-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'qv-task-editor-overlay';
    overlay.className = 'cv-modal';

    const questLabel = quest.meta.name || quest.id;
    var html = `
      <div class="cv-modal-content qv-task-editor-content" style="width:960px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;background:var(--color-bg-primary);">
        <h3>${I18N.t('chemdah.taskManager', {name: _escHtml(questLabel)})}</h3>
        <div style="font-size:12px;color:var(--color-text-secondary);flex-shrink:0;margin-bottom:8px;">
          ${I18N.t('chemdah.totalSubtasks', {count: quest.tasks.length})}
        </div>
        <div class="qv-task-editor-layout" style="display:flex;gap:12px;flex:1;min-height:0;overflow:hidden;">
          <div class="qv-task-editor-tabs" style="width:160px;flex-shrink:0;display:flex;flex-direction:column;gap:4px;overflow-y:auto;">
            ${quest.tasks.length === 0 ? '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.noSubtasks') + '</div>' : ''}
            ${quest.tasks.map(function(t, idx) {
              var tLabel = t.meta?.name || t.id || I18N.t('chemdah.subtaskPrefix', {count: idx + 1});
              return '<button class="cv-btn qte-tab' + (idx === ti ? ' active' : '') + '" data-ti="' + idx + '">' + I18N.t('chemdah.subtaskTab', {index: idx + 1}) + ' <span class="qte-tab-id">' + _escHtml(tLabel) + '</span></button>';
            }).join('')}
            <button class="cv-btn cv-btn-xs cv-btn-secondary qte-add-btn" style="margin-top:8px;">${I18N.t('chemdah.addSubtask')}</button>
          </div>
          <div class="qv-task-editor-panel" style="flex:1;overflow-y:auto;padding:0 4px;min-height:0;">
            ${quest.tasks.length === 0 ? '<div class="cv-empty" style="margin-top:60px;">' + I18N.t('chemdah.addSubtaskHint') + '</div>' : ''}
          </div>
        </div>
        <div class="cv-modal-actions" style="margin-top:12px;flex-shrink:0;">
          <button class="cv-btn cv-btn-secondary" id="qte-close">${I18N.t('chemdah.close')}</button>
        </div>
      </div>`;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    // Render initial selected task
    if (quest.tasks.length > 0 && ti >= 0 && ti < quest.tasks.length) {
      _renderTaskEditorPanel(overlay, quest, qi, ti, container);
    }

    // Tab switching
    overlay.querySelectorAll('.qte-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        playSound('click');
        var newTi = parseInt(btn.dataset.ti);
        overlay.querySelectorAll('.qte-tab').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _renderTaskEditorPanel(overlay, quest, qi, newTi, container);
      });
    });

    // Add task
    overlay.querySelector('.qte-add-btn').addEventListener('click', function() {
      playSound('click');
      _showQuestSelectorModal({
        title: I18N.t('chemdah.selectObjectiveType'),
        placeholder: I18N.t('chemdah.searchObjectivePlaceholder'),
        items: defs.objectiveDefs,
        mode: 'single',
        onConfirm: function(ids) {
          var objType = ids[0];
          var taskId = String(quest.tasks.length + 1);
          quest.tasks.push({
            id: taskId,
            meta: { name: '' },
            objective: objType,
            condition: {},
            goal: { amount: '1' },
            agent: {},
            _raw: {},
          });
          if (window._cvRenderFn) window._cvRenderFn();
          overlay.remove();
          setTimeout(function() {
            _showQuestTaskEditorModal(quest, qi, quest.tasks.length - 1, container);
          }, 50);
        },
      });
    });

    // Close
    overlay.querySelector('#qte-close').addEventListener('click', function() { playSound('close'); overlay.remove(); });
    overlay.addEventListener('click', function(e) {
      if (e.target === this) overlay.remove();
    });
  }

  /** 渲染子任务编辑面板（右侧详情） */
  function _renderTaskEditorPanel(overlay, quest, qi, ti, container) {
    const panel = overlay.querySelector('.qv-task-editor-panel');
    if (!panel) return;

    const task = quest.tasks[ti];
    if (!task) { panel.innerHTML = '<div class="cv-empty" style="margin-top:60px;">' + I18N.t('chemdah.noSubtaskSelected') + '</div>'; return; }

    const defs = _ensureDefs();
    const currentObjDef = defs.objectiveDefs.find(function(d) { return d.id === task.objective; });
    const objLabel = currentObjDef ? I18N.desc('objectiveLabel', currentObjDef.id, currentObjDef.label) : (task.objective || I18N.t('chemdah.selectType'));

    var html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
    html += '<h4 style="margin:0;">' + I18N.t('chemdah.subtaskTab', {index: ti + 1}) + ' ' + _escHtml(task.id) + ' <span style="font-weight:400;font-size:12px;color:var(--color-text-secondary);">' + _escHtml(currentObjDef ? I18N.desc('objectiveLabel', currentObjDef.id, currentObjDef.label) : '') + '</span></h4>';
    html += '<button class="cv-btn cv-btn-xs cv-btn-danger qte-delete-btn" data-ti="' + ti + '">' + I18N.t('chemdah.delete') + '</button>';
    html += '</div>';

    html += '<div class="qv-task-editor-form">';
    html += '<div class="qv-grid-2">';
    html += '<div class="cv-field"><label>' + I18N.t('chemdah.subtaskId') + '</label><input class="cv-input cv-input-mono qte-field" data-qte-field="id" value="' + _escHtml(task.id) + '"></div>';
    html += '<div class="cv-field"><label>' + I18N.t('chemdah.name') + '</label><input class="cv-input qte-field" data-qte-field="meta.name" value="' + _escHtml(task.meta?.name || '') + '"></div>';
    html += '</div>';
    html += '<div class="cv-field"><label>' + I18N.t('chemdah.objectiveType') + '</label><div style="display:flex;gap:8px;">';
    html += '<button class="cv-btn cv-btn-secondary qte-obj-btn" data-ti="' + ti + '">' + _escHtml(objLabel) + '</button>';
    html += '<input class="cv-input cv-input-mono qte-obj-custom" placeholder="' + I18N.t('chemdah.customObjectivePlaceholder') + '" style="flex:1"></div></div>';
    html += '<div class="qv-subsection"><div class="qv-subsection-title">' + I18N.t('chemdah.objectiveCondition') + '</div><div class="qv-grid-2">';
    html += '<div class="cv-field"><label>Value</label><input class="cv-input cv-input-mono qte-field" data-qte-field="condition.value" value="' + _escHtml(task.condition?.value || '') + '"></div>';
    html += '<div class="cv-field"><label>' + I18N.t('chemdah.position') + '</label><div style="display:flex;gap:6px;">';
    html += '<input class="cv-input cv-input-mono qte-field" data-qte-field="condition.position" value="' + _escHtml(task.condition?.position || '') + '" style="flex:1;">';
    html += '<button class="cv-btn cv-btn-xs cv-btn-secondary qpe-trigger" data-target="condition.position" data-tip="' + I18N.t('chemdah.posEdit') + '">📍</button>';
    html += '</div></div></div>';
    html += '<div class="cv-field"><label>' + I18N.t('chemdah.ketherScriptField') + '</label><textarea class="cv-textarea cv-textarea-code qte-field" data-qte-field="condition.kether" rows="2">' + _escHtml(task.condition?.kether || '') + '</textarea></div>';

    // Objective-specific condition params
    var _objDef = defs.objectiveDefs.find(function(d) { return d.id === task.objective; });
    if (_objDef && _objDef.params && _objDef.params.length > 0) {
      var _skipped2 = ['value', 'position'];
      var _objParams = _objDef.params.filter(function(p) { return _skipped2.indexOf(p.name) < 0; });
      for (var pi = 0; pi < _objParams.length; pi++) {
        var _p = _objParams[pi];
        var _val = task.condition?.[_p.name] || '';
        var _isItem = (_p.type || '').toLowerCase().indexOf('item') >= 0 || _p.type === 'ItemStack';
        var _isPosition = (_p.type || '').toLowerCase().indexOf('position') >= 0 || (_p.type || '').toLowerCase().indexOf('location') >= 0 || _p.name === 'position';
        if (_isItem) {
          html += '<div class="cv-field"><label>' + _escHtml(_p.name) + ' <span class="cv-label-sm">' + _escHtml(_p.type) + '</span></label><div style="display:flex;gap:6px;"><input class="cv-input cv-input-mono qte-field" data-qte-field="condition.' + _escHtml(_p.name) + '" value="' + _escHtml(_val) + '" placeholder="' + _escHtml(_p.description || '') + '" style="flex:1;"><button class="cv-btn cv-btn-xs cv-btn-secondary qie-trigger" data-target="condition.' + _escHtml(_p.name) + '" data-tip="' + I18N.t('chemdah.itemEdit') + '">📦</button></div></div>';
        } else if (_isPosition) {
          html += '<div class="cv-field"><label>' + _escHtml(_p.name) + ' <span class="cv-label-sm">' + _escHtml(_p.type) + '</span></label><div style="display:flex;gap:6px;"><input class="cv-input cv-input-mono qte-field" data-qte-field="condition.' + _escHtml(_p.name) + '" value="' + _escHtml(_val) + '" placeholder="' + _escHtml(_p.description || '') + '" style="flex:1;"><button class="cv-btn cv-btn-xs cv-btn-secondary qpe-trigger" data-target="condition.' + _escHtml(_p.name) + '" data-tip="' + I18N.t('chemdah.posEdit') + '">📍</button></div></div>';
        } else {
          html += '<div class="cv-field"><label>' + _escHtml(_p.name) + ' <span class="cv-label-sm">' + _escHtml(_p.type) + '</span></label><input class="cv-input cv-input-mono qte-field" data-qte-field="condition.' + _escHtml(_p.name) + '" value="' + _escHtml(_val) + '" placeholder="' + _escHtml(_p.description || '') + '"></div>';
        }
      }
    }

    html += '</div><div class="qv-subsection"><div class="qv-subsection-title">' + I18N.t('chemdah.goal') + '</div>';
    html += '<div class="cv-field"><label>' + I18N.t('chemdah.amountField') + '</label><input class="cv-input cv-input-mono qte-field" data-qte-field="goal.amount" value="' + _escHtml(task.goal?.amount || '') + '"></div>';

    // Extra goal fields
    var goalKeys = task.goal ? Object.keys(task.goal) : [];
    for (var gi = 0; gi < goalKeys.length; gi++) {
      if (goalKeys[gi] === 'amount') continue;
      html += '<div class="cv-field"><label>goal.' + _escHtml(goalKeys[gi]) + '</label><input class="cv-input cv-input-mono qte-field" data-qte-field="goal.' + _escHtml(goalKeys[gi]) + '" value="' + _escHtml(String(task.goal[goalKeys[gi]])) + '"></div>';
    }

    // Task agent
    var agentKeys = task.agent ? Object.keys(task.agent) : [];
    if (agentKeys.length > 0) {
      html += '</div><div class="qv-subsection"><div class="qv-subsection-title">' + I18N.t('chemdah.subtaskAgentScripts') + '</div>';
      for (var hi = 0; hi < agentKeys.length; hi++) {
        html += '<div class="cv-field"><label>' + _escHtml(agentKeys[hi]) + '</label><textarea class="cv-textarea cv-textarea-code qte-field" data-qte-field="agent.' + _escHtml(agentKeys[hi]) + '" rows="2">' + _escHtml(task.agent[agentKeys[hi]]) + '</textarea></div>';
      }
    }

    html += '</div></div>';

    panel.innerHTML = html;

    // === Event bindings ===

    // Auto-save on field change
    panel.querySelectorAll('.qte-field').forEach(function(el) {
      el.addEventListener('input', function() {
        var path = el.dataset.qteField;
        _setNestedValue(task, path.split('.'), el.value);
      });
    });

    // Objective type button
    var objBtn = panel.querySelector('.qte-obj-btn');
    if (objBtn) {
      objBtn.addEventListener('click', function() {
        _showQuestSelectorModal({
          title: I18N.t('chemdah.selectTaskObjectiveType'),
          placeholder: I18N.t('chemdah.searchObjectivePlaceholder'),
          items: defs.objectiveDefs,
          mode: 'single',
          onConfirm: function(ids) {
            var selected = defs.objectiveDefs.find(function(d) { return d.id === ids[0]; });
            objBtn.textContent = selected ? I18N.desc('objectiveLabel', selected.id, selected.label) : ids[0];
            objBtn.dataset.selected = ids[0];
            task.objective = ids[0];
            var customInput = panel.querySelector('.qte-obj-custom');
            if (customInput) customInput.value = '';
          },
        });
      });
    }

    // Item editor triggers
    panel.querySelectorAll('.qie-trigger').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var targetField = btn.dataset.target;
        var input = panel.querySelector('.qte-field[data-qte-field="' + targetField + '"]');
        if (!input) return;
        _showItemEditorModal(input.value, function(result) {
          input.value = result;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    });

    // Position editor triggers
    panel.querySelectorAll('.qpe-trigger').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var targetField = btn.dataset.target;
        var input = panel.querySelector('.qte-field[data-qte-field="' + targetField + '"]');
        if (!input) return;
        _showPositionEditorModal(input.value, function(result) {
          if (result != null) {
            input.value = result;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      });
    });

    // Delete task
    var delBtn = panel.querySelector('.qte-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', function() {
        playSound('close');
        var idx = parseInt(delBtn.dataset.ti);
        if (idx >= 0 && idx < quest.tasks.length) {
          quest.tasks.splice(idx, 1);
          if (window._cvRenderFn) window._cvRenderFn();
          overlay.remove();
          setTimeout(function() {
            if (quest.tasks.length > 0) {
              _showQuestTaskEditorModal(quest, qi, Math.min(idx, quest.tasks.length - 1), container);
            }
          }, 50);
        }
      });
    }
  }

  // ============================================
  // Addon 组件管理弹窗
  // ============================================

  /**
   * 打开 Addon 组件管理器弹窗（含字段合并）
   */
  function _showQuestAddonManagerModal(quest, qi, container) {
    const defs = _ensureDefs();
    const old = document.getElementById('qv-addon-manager-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'qv-addon-manager-overlay';
    overlay.className = 'cv-modal';

    const questLabel = quest.meta.name || quest.id;
    const addonKeys = Object.keys(quest.addon);

    let html = `
      <div class="cv-modal-content qv-addon-mgr-content" style="width:720px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;">
        <h3>${I18N.t('chemdah.addonManager', {name: _escHtml(questLabel)})}</h3>
        <div style="margin-bottom:8px;font-size:12px;color:var(--color-text-secondary);flex-shrink:0;">
          ${I18N.t('chemdah.totalAddons', {count: addonKeys.length})}
        </div>
        <div class="qv-addon-mgr-layout" style="display:flex;gap:12px;flex:1;min-height:0;overflow:hidden;">
          <div class="qv-addon-mgr-tabs" style="width:160px;flex-shrink:0;display:flex;flex-direction:column;gap:4px;overflow-y:auto;">
            ${addonKeys.length === 0 ? '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.noAddonComponents') + '</div>' : ''}
            ${addonKeys.map(function(ak, ai) {
              var aLabel = _getAddonLabel(ak);
              return '<button class="cv-btn qam-tab' + (ai === 0 ? ' active' : '') + '" data-addon-id="' + _escHtml(ak) + '">' + _escHtml(aLabel) + '<span class="qam-tab-id">' + _escHtml(ak) + '</span></button>';
            }).join('')}
            <button class="cv-btn cv-btn-xs cv-btn-secondary qam-add-btn" style="margin-top:8px;">${I18N.t('chemdah.addAddon')}</button>
          </div>
          <div class="qv-addon-mgr-panel" style="flex:1;overflow-y:auto;padding:0 4px;min-height:0;">
            ${addonKeys.length === 0 ? '<div class="cv-empty" style="margin-top:60px;">' + I18N.t('chemdah.addAddonHint') + '</div>' : ''}
          </div>
        </div>
        <div class="cv-modal-actions" style="margin-top:12px;flex-shrink:0;">
          <button class="cv-btn cv-btn-secondary" id="qam-close">${I18N.t('chemdah.close')}</button>
        </div>
      </div>`;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    // Render fields for the first addon
    if (addonKeys.length > 0) {
      _renderAddonManagerPanel(overlay, quest, addonKeys[0]);
    }

    // Tab switching
    overlay.querySelectorAll('.qam-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        playSound('click');
        overlay.querySelectorAll('.qam-tab').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _renderAddonManagerPanel(overlay, quest, btn.dataset.addonId);
      });
    });

    // Add addon
    overlay.querySelector('.qam-add-btn').addEventListener('click', function() {
      playSound('click');
      _showQuestSelectorModal({
        title: I18N.t('chemdah.selectAddon'),
        placeholder: I18N.t('chemdah.searchAddonPlaceholder'),
        items: defs.addonDefs,
        mode: 'multi',
        onConfirm: function(ids) {
          var changed = false;
          for (var ii = 0; ii < ids.length; ii++) {
            var id = ids[ii];
            if (quest.addon[id] !== undefined) continue;
            var def = defs.addonDefs.find(function(d) { return d.id === id; });
            if (def && def.fields && Object.keys(def.fields).length > 0) {
              var defaults = def.fields[id];
              if (typeof defaults === 'object' && defaults !== null && !Array.isArray(defaults)) {
                quest.addon[id] = JSON.parse(JSON.stringify(defaults));
              } else {
                quest.addon[id] = defaults;
              }
            } else {
              quest.addon[id] = true;
            }
            changed = true;
          }
          if (changed) {
            overlay.remove();
            if (window._cvRenderFn) window._cvRenderFn();
            setTimeout(function() {
              _showQuestAddonManagerModal(quest, qi, container);
            }, 50);
          }
        },
      });
    });

    // Close
    overlay.querySelector('#qam-close').addEventListener('click', function() { playSound('close'); overlay.remove(); });
    overlay.addEventListener('click', function(e) {
      if (e.target === this) overlay.remove();
    });
  }

  /** Render the right panel for a given addon */
  function _renderAddonManagerPanel(overlay, quest, addonId) {
    if (!addonId) return;
    const panel = overlay.querySelector('.qv-addon-mgr-panel');
    if (!panel) return;

    const defs = _ensureDefs();
    const def = defs.addonDefs.find(function(d) { return d.id === addonId; });
    const actual = quest.addon[addonId];

    var aLabel = _getAddonLabel(addonId);
    var html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
    html += '<h4 style="margin:0;">' + _escHtml(aLabel) + ' <span style="font-weight:400;font-size:12px;color:var(--color-text-secondary);">' + _escHtml(addonId) + '</span></h4>';
    html += '<button class="cv-btn cv-btn-xs cv-btn-danger qam-delete-btn" data-addon-id="' + _escHtml(addonId) + '">' + I18N.t('chemdah.delete') + '</button>';
    html += '</div>';

    if (!def) {
      // No definition — map editor for arbitrary key-value pairs
      var mapKeys = typeof actual === 'object' && actual !== null ? Object.keys(actual) : [];
      html += '<div class="qv-subsection"><div class="qv-subsection-title">' + I18N.t('chemdah.customKeyValues') + '</div>';
      if (mapKeys.length === 0 && (typeof actual !== 'object' || actual === null)) {
        if (typeof actual === 'boolean') {
          html += '<div class="cv-field"><label>' + I18N.t('chemdah.enabled') + '</label>';
          html += '<select class="cv-select qam-field" data-addon-id="' + _escHtml(addonId) + '" data-field="' + _escHtml(addonId) + '">';
          html += '<option value="true"' + (actual === true ? ' selected' : '') + '>true</option>';
          html += '<option value="false"' + (actual === false ? ' selected' : '') + '>false</option>';
          html += '</select></div>';
        } else {
          html += '<div class="cv-field cv-field-wide"><label>' + I18N.t('chemdah.value') + '</label>';
          html += '<input class="cv-input qam-field" data-addon-id="' + _escHtml(addonId) + '" data-field="' + _escHtml(addonId) + '" value="' + _escHtml(actual != null ? String(actual) : '') + '"></div>';
        }
      } else {
        for (var mi = 0; mi < mapKeys.length; mi++) {
          var mk = mapKeys[mi];
          var mv = actual[mk];
          html += '<div class="cv-field cv-field-wide qam-map-row" data-addon-id="' + _escHtml(addonId) + '" data-index="' + mi + '">';
          html += '<div style="display:flex;gap:6px;align-items:center;">';
          html += '<input class="cv-input qam-map-key" style="width:120px;flex-shrink:0;font-family:monospace;" value="' + _escHtml(mk) + '" placeholder="key">';
          html += '<span style="color:var(--color-text-tertiary);">:</span>';
          html += '<input class="cv-input qam-map-val" style="flex:1;" value="' + _escHtml(mv != null ? String(mv) : '') + '" placeholder="value">';
          html += '<button class="cv-btn cv-btn-xs cv-btn-danger qam-map-del" data-addon-id="' + _escHtml(addonId) + '" data-map-key="' + _escHtml(mk) + '" data-tip="' + I18N.t('chemdah.deleteItem') + '">&times;</button>';
          html += '</div></div>';
        }
        html += '<button class="cv-btn cv-btn-xs cv-btn-secondary qam-map-add" data-addon-id="' + _escHtml(addonId) + '" style="margin-top:4px;">' + I18N.t('chemdah.addNode') + '</button>';
      }
      html += '</div>';
    } else {
      var defaults = def.fields[addonId];
      if (typeof defaults === 'object' && defaults !== null && !Array.isArray(defaults)) {
        // Merge defaults with actual values
        var merged = JSON.parse(JSON.stringify(defaults));
        if (typeof actual === 'object' && actual !== null) {
          for (var ak in actual) {
            if (actual.hasOwnProperty(ak)) {
              merged[ak] = actual[ak];
            }
          }
        }

        // Nest flat keys (e.g. "beacon-option.type") under their section parent (e.g. "beacon-option")
        var mergedKeys = Object.keys(merged);
        var sectionPrefixes = [];
        for (var ski = 0; ski < mergedKeys.length; ski++) {
          var sk = mergedKeys[ski];
          if (typeof merged[sk] === 'object' && merged[sk] !== null && !Array.isArray(merged[sk])) {
            sectionPrefixes.push(sk + '.');
          }
        }
        if (sectionPrefixes.length > 0) {
          for (var fi = mergedKeys.length - 1; fi >= 0; fi--) {
            var fk2 = mergedKeys[fi];
            for (var si = 0; si < sectionPrefixes.length; si++) {
              var prefix = sectionPrefixes[si];
              if (fk2.startsWith(prefix) && fk2 !== prefix.slice(0, -1)) {
                // Move this flat key into the section object
                var sectionKey = prefix.slice(0, -1);
                var subKey = fk2.slice(prefix.length);
                if (typeof merged[sectionKey] !== 'object' || merged[sectionKey] === null) {
                  merged[sectionKey] = {};
                }
                merged[sectionKey][subKey] = merged[fk2];
                delete merged[fk2];
                break;
              }
            }
          }
        }

        var fieldKeys = Object.keys(merged);
        if (fieldKeys.length === 0) {
          html += '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.noConfigurableFields') + '</div>';
        } else {
          html += '<div class="qv-addon-fields">';
          for (var fi = 0; fi < fieldKeys.length; fi++) {
            var fk = fieldKeys[fi];
            var fv = merged[fk];
            var descHtml = _getAddonFieldDesc(addonId, fk);
            var descTag = descHtml ? ' <span class="cv-field-desc">— ' + _escHtml(descHtml) + '</span>' : '';

            if (typeof fv === 'boolean') {
              html += '<div class="cv-field"><label>' + _escHtml(fk) + descTag + '</label>';
              html += '<select class="cv-select qam-field" data-addon-id="' + _escHtml(addonId) + '" data-field="' + _escHtml(fk) + '">';
              html += '<option value="true"' + (fv === true ? ' selected' : '') + '>true</option>';
              html += '<option value="false"' + (fv === false ? ' selected' : '') + '>false</option>';
              html += '</select></div>';
            } else if (Array.isArray(fv)) {
              html += '<div class="cv-field cv-field-wide"><label>' + _escHtml(fk) + descTag + '</label>';
              html += '<input class="cv-input qam-field" data-addon-id="' + _escHtml(addonId) + '" data-field="' + _escHtml(fk) + '" value="' + _escHtml(fv.join(', ')) + '"></div>';
            } else if (typeof fv === 'object' && fv !== null) {
              // Nested object section — use recursive render
              html += _renderQamSubSection(fk, fv, addonId, '');
            } else {
              html += '<div class="cv-field cv-field-wide"><label>' + _escHtml(fk) + descTag + '</label>';
              html += '<input class="cv-input qam-field" data-addon-id="' + _escHtml(addonId) + '" data-field="' + _escHtml(fk) + '" value="' + _escHtml(fv != null ? String(fv) : '') + '"></div>';
            }
          }
          html += '</div>';
        }
      } else {
        // Non-section with definition — simple field
        var boolVal = actual !== undefined ? actual : defaults;
        if (typeof boolVal === 'boolean') {
          html += '<div class="cv-field"><label>' + I18N.t('chemdah.enabled') + '</label>';
          html += '<select class="cv-select qam-field" data-addon-id="' + _escHtml(addonId) + '" data-field="' + _escHtml(addonId) + '">';
          html += '<option value="true"' + (boolVal === true ? ' selected' : '') + '>true</option>';
          html += '<option value="false"' + (boolVal === false ? ' selected' : '') + '>false</option>';
          html += '</select></div>';
        } else {
          html += '<div class="cv-field cv-field-wide"><label>' + I18N.t('chemdah.value') + '</label>';
          html += '<input class="cv-input qam-field" data-addon-id="' + _escHtml(addonId) + '" data-field="' + _escHtml(addonId) + '" value="' + _escHtml(boolVal != null ? String(boolVal) : '') + '"></div>';
        }
      }
    }

    panel.innerHTML = html;

    // Bind delete
    var deleteBtn = panel.querySelector('.qam-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function() {
        playSound('close');
        var aid = deleteBtn.dataset.addonId;
        if (aid && quest.addon[aid] !== undefined) {
          delete quest.addon[aid];
          overlay.remove();
          if (window._cvRenderFn) window._cvRenderFn();
        }
      });
    }

    // Bind field changes (select/change)
    panel.querySelectorAll('.qam-field').forEach(function(el) {
      el.addEventListener('change', function() {
        var aid = el.dataset.addonId;
        var field = el.dataset.field;
        var val = el.value;
        if (val === 'true') val = true;
        else if (val === 'false') val = false;

        var fieldParts = field.split('.');
        if (fieldParts.length === 1) {
          quest.addon[aid] = val;
        } else {
          if (typeof quest.addon[aid] !== 'object' || quest.addon[aid] === null) {
            quest.addon[aid] = {};
          }
          _setNestedValue(quest.addon[aid], fieldParts.slice(1), val);
        }
      });
    });

    // Bind live input for text fields
    panel.querySelectorAll('input.qam-field').forEach(function(el) {
      el.addEventListener('input', function() {
        var aid = el.dataset.addonId;
        var field = el.dataset.field;
        var val = el.value;
        var fieldParts = field.split('.');
        if (fieldParts.length === 1) {
          quest.addon[aid] = val;
        } else {
          if (typeof quest.addon[aid] !== 'object' || quest.addon[aid] === null) {
            quest.addon[aid] = {};
          }
          _setNestedValue(quest.addon[aid], fieldParts.slice(1), val);
        }
      });
    });

    // Map editor: add row
    panel.querySelector('.qam-map-add')?.addEventListener('click', function() {
      if (typeof quest.addon[addonId] !== 'object' || quest.addon[addonId] === null) {
        quest.addon[addonId] = {};
      }
      var n = 0;
      while (quest.addon[addonId]['_new_' + n] !== undefined) n++;
      quest.addon[addonId]['_new_' + n] = '';
      _renderAddonManagerPanel(overlay, quest, addonId);
      // Focus the new key input
      setTimeout(function() {
        var rows = panel.querySelectorAll('.qam-map-key');
        if (rows.length > 0) rows[rows.length - 1].focus();
      }, 50);
    });

    // Map editor: delete row
    panel.querySelectorAll('.qam-map-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = btn.getAttribute('data-map-key');
        if (key && quest.addon[addonId] && quest.addon[addonId][key] !== undefined) {
          delete quest.addon[addonId][key];
        } else {
          // Fallback: get key from sibling input
          var row = btn.closest('.qam-map-row');
          var inp = row ? row.querySelector('.qam-map-key') : null;
          if (inp) {
            var k = inp.value;
            if (k && quest.addon[addonId]) delete quest.addon[addonId][k];
          }
        }
        _renderAddonManagerPanel(overlay, quest, addonId);
      });
    });

    // Map editor: key rename
    panel.querySelectorAll('.qam-map-key').forEach(function(inp) {
      inp.addEventListener('change', function() {
        var oldKey = this.defaultValue;
        var newKey = this.value.trim();
        if (!newKey || newKey === oldKey || !quest.addon[addonId]) return;
        quest.addon[addonId][newKey] = quest.addon[addonId][oldKey];
        if (oldKey && quest.addon[addonId][oldKey] !== undefined) {
          delete quest.addon[addonId][oldKey];
        }
        // Update data attribute on the delete button
        var row = this.closest('.qam-map-row');
        if (row) {
          var delBtn = row.querySelector('.qam-map-del');
          if (delBtn) delBtn.setAttribute('data-map-key', newKey);
        }
      });
    });

    // Map editor: value update
    panel.querySelectorAll('.qam-map-val').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var row = this.closest('.qam-map-row');
        var keyInput = row ? row.querySelector('.qam-map-key') : null;
        var key = keyInput ? keyInput.value : '';
        if (key && quest.addon[addonId]) {
          quest.addon[addonId][key] = this.value;
        }
      });
    });
  }

  /** Recursively render a subsection for a nested addon object */
  function _renderQamSubSection(key, obj, addonId, prefix) {
    var fullPrefix = prefix ? prefix + '.' + key : key;
    var html = '<div class="qv-subsection"><div class="qv-subsection-title">' + _escHtml(key) + '</div>';
    var keys = Object.keys(obj);
    if (keys.length === 0) {
      html += '<div class="cv-empty cv-empty-sm">' + I18N.t('chemdah.emptyObject') + '</div>';
    } else {
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = obj[k];
        var fieldPath = fullPrefix + '.' + k;
        var descHtml = _getAddonFieldDesc(addonId, fieldPath);
        var descTag = descHtml ? ' <span class="cv-field-desc">— ' + _escHtml(descHtml) + '</span>' : '';
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          html += _renderQamSubSection(k, v, addonId, fullPrefix);
        } else if (typeof v === 'boolean') {
          html += '<div class="cv-field"><label>' + _escHtml(k) + descTag + '</label>';
          html += '<select class="cv-select qam-field" data-addon-id="' + _escHtml(addonId) + '" data-field="' + _escHtml(fieldPath) + '">';
          html += '<option value="true"' + (v === true ? ' selected' : '') + '>true</option>';
          html += '<option value="false"' + (v === false ? ' selected' : '') + '>false</option>';
          html += '</select></div>';
        } else if (Array.isArray(v)) {
          html += '<div class="cv-field cv-field-wide"><label>' + _escHtml(k) + descTag + '</label>';
          html += '<input class="cv-input qam-field" data-addon-id="' + _escHtml(addonId) + '" data-field="' + _escHtml(fieldPath) + '" value="' + _escHtml(v.join(', ')) + '"></div>';
        } else {
          html += '<div class="cv-field cv-field-wide"><label>' + _escHtml(k) + descTag + '</label>';
          html += '<input class="cv-input qam-field" data-addon-id="' + _escHtml(addonId) + '" data-field="' + _escHtml(fieldPath) + '" value="' + _escHtml(v != null ? String(v) : '') + '"></div>';
        }
      }
    }
    html += '</div>';
    return html;
  }

  // ============================================
  // 任务编辑器事件绑定
  // ============================================

  function _bindQuestEvents(container, parsed) {
    // 清除旧的点击代理（包括可能残留的会话点击代理）
    if (container._qvClickHandler) {
      container.removeEventListener('click', container._qvClickHandler);
    }
    if (container._cvClickHandler) {
      container.removeEventListener('click', container._cvClickHandler);
    }

    container._qvClickHandler = function (e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      switch (action) {

        case 'q-toggle-card': {
          const qi = parseInt(btn.dataset.qIndex);
          const card = container.querySelector(`.qv-card[data-q-index="${qi}"]`);
          if (!card) break;
          card.classList.toggle('collapsed');
          playSound('collapse');
          // 更新导航高亮
          container.querySelectorAll('.cv-sidebar-item').forEach(el => {
            el.classList.toggle('active', el.dataset.qIndex === String(qi) && !card.classList.contains('collapsed'));
          });
          break;
        }

        case 'q-open-addon-manager': {
          const qi = parseInt(btn.dataset.qIndex);
          const quest = parsed.quests[qi];
          if (quest) {
            _showQuestAddonManagerModal(quest, qi, container);
          }
          break;
        }

        case 'q-nav': {
          const qi = parseInt(btn.dataset.qIndex);
          const card = container.querySelector(`.qv-card[data-q-index="${qi}"]`);
          if (card) {
            card.classList.remove('collapsed');
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            container.querySelectorAll('.cv-sidebar-item').forEach(el => {
              el.classList.toggle('active', el.dataset.qIndex === String(qi));
            });
          }
          break;
        }

        case 'q-add-quest': {
          parsed.quests.push({
            id: I18N.t('chemdah.newQuestPrefix', {count: parsed.quests.length + 1}),
            meta: { name: '', type: 'L1' },
            start: { npc: '', script: '' },
            accept: { script: '' },
            tasks: [],
            addon: {},
            agent: {},
            _raw: {},
          });
          if (window._cvRenderFn) window._cvRenderFn();
          break;
        }

        case 'q-open-task-manager': {
          const qi = parseInt(btn.dataset.qIndex);
          const quest = parsed.quests[qi];
          if (quest) {
            _showQuestTaskEditorModal(quest, qi, 0, container);
          }
          break;
        }

        case 'q-delete-quest': {
          const qi = parseInt(btn.dataset.qIndex);
          if (qi >= 0 && qi < parsed.quests.length) {
            parsed.quests.splice(qi, 1);
            if (window._cvRenderFn) window._cvRenderFn();
          }
          break;
        }

        case 'q-add-task': {
          const qi = parseInt(btn.dataset.qIndex);
          const quest = parsed.quests[qi];
          if (!quest) break;
          _showQuestSelectorModal({
            title: I18N.t('chemdah.selectObjectiveType'),
            placeholder: I18N.t('chemdah.searchObjectivePlaceholder'),
            items: _ensureDefs().objectiveDefs,
            mode: 'single',
            onConfirm: (ids) => {
              const objType = ids[0];
              const taskId = String(quest.tasks.length + 1);
              quest.tasks.push({
                id: taskId,
                meta: { name: '' },
                objective: objType,
                condition: {},
                goal: { amount: '1' },
                agent: {},
                _raw: {},
              });
              if (window._cvRenderFn) window._cvRenderFn();
              // 重绘后自动打开新任务编辑器
              const newTi = quest.tasks.length - 1;
              setTimeout(() => {
                _showQuestTaskEditorModal(quest, qi, newTi, container);
              }, 50);
            },
          });
          break;
        }

        case 'q-edit-task': {
          const qi = parseInt(btn.dataset.qIndex);
          const ti = parseInt(btn.dataset.tIndex);
          const quest = parsed.quests[qi];
          if (quest && quest.tasks[ti]) {
            _showQuestTaskEditorModal(quest, qi, ti, container);
          }
          break;
        }

        case 'q-delete-task': {
          const qi = parseInt(btn.dataset.qIndex);
          const ti = parseInt(btn.dataset.tIndex);
          const quest = parsed.quests[qi];
          if (quest && ti >= 0 && ti < quest.tasks.length) {
            quest.tasks.splice(ti, 1);
            if (window._cvRenderFn) window._cvRenderFn();
          }
          break;
        }

        case 'q-add-addon': {
          const qi = parseInt(btn.dataset.qIndex);
          const quest = parsed.quests[qi];
          if (!quest) break;
          _showQuestAddonManagerModal(quest, qi, container);
          break;
        }

        case 'q-add-agent-hook': {
          const qi = parseInt(btn.dataset.qIndex);
          const quest = parsed.quests[qi];
          if (!quest) break;
          // 用弹窗选择钩子
          const scopeItems = [
            { id: '@ all', label: '@ all', desc: I18N.desc('scope', '@ all', '所有作用域类型') },
            { id: '@ party', label: '@ party', desc: I18N.desc('scope', '@ party', '队伍作用域') },
            { id: '@ custom', label: I18N.t('chemdah.customScopeLabel'), desc: I18N.desc('scope', '@ custom', '自定义作用域') },
          ];
          const defs = _ensureDefs();
          const allAgentItems = defs.agentHookDefs.map(h => ({ ...h }));
          allAgentItems.push(...scopeItems.map(s => ({ ...s, group: I18N.t('chemdah.scopeGroup') })));
          _showQuestSelectorModal({
            title: I18N.t('chemdah.selectAgentHook'),
            placeholder: I18N.t('chemdah.searchHookPlaceholder'),
            items: allAgentItems,
            mode: 'single',
            onConfirm: async (ids) => {
              const hookName = ids[0];
              if (hookName === '@ custom') {
                const custom = await UI.prompt({ message: I18N.t('chemdah.customScopePrompt'), defaultValue: 'all' });
                if (custom) {
                  quest.agent['@ ' + custom.trim()] = '';
                  if (window._cvRenderFn) window._cvRenderFn();
                }
                return;
              }
              // 如果是钩子（无@开头），打开第二个选择器选作用域
              if (!hookName.startsWith('@')) {
                _showQuestSelectorModal({
                  title: I18N.t('chemdah.selectScopeForHook', {hook: hookName}),
                  placeholder: I18N.t('chemdah.searchScopePlaceholder'),
                  items: scopeItems,
                  mode: 'single',
                  onConfirm: async (scopeIds) => {
                    let scope = scopeIds[0];
                    if (scope === '@ custom') {
                      scope = await UI.prompt({ message: I18N.t('chemdah.customScopePrompt'), defaultValue: 'all' });
                      if (!scope) return;
                    }
                    const fullHook = `${hookName} ${scope}`;
                    quest.agent[fullHook] = '';
                    if (window._cvRenderFn) window._cvRenderFn();
                  },
                });
              } else {
                // 纯作用域选择——添加一个空的钩子名+作用域占位
                const hook = await UI.prompt({ message: I18N.t('chemdah.customHookPrompt'), defaultValue: 'completed @ all' });
                if (hook) {
                  quest.agent[hook.trim()] = '';
                  if (window._cvRenderFn) window._cvRenderFn();
                }
              }
            },
          });
          break;
        }

        case 'q-delete-agent-hook': {
          const qi = parseInt(btn.dataset.qIndex);
          const hook = btn.dataset.hook;
          const quest = parsed.quests[qi];
          if (quest && hook && quest.agent[hook] !== undefined) {
            delete quest.agent[hook];
            if (window._cvRenderFn) window._cvRenderFn();
          }
          break;
        }

        case 'q-sync-to-source':
          _syncQuestToSource(parsed);
          break;

        // ===== 切换自动同步 =====
        case 'toggle-visual-autosync':
          window.__keAutoSync = btn.checked;
          (function updateAutoSyncConfig(val) {
            try {
              var stored = localStorage.getItem('editorConfig');
              var config = stored ? JSON.parse(stored) : {};
              config.autoSync = val;
              localStorage.setItem('editorConfig', JSON.stringify(config));
            } catch (e) {}
          })(window.__keAutoSync);
          break;
      }
    };

    container.addEventListener('click', container._qvClickHandler);
    // 音效包装：为 quest 编辑器所有 data-action 按钮添加点击音效
    (function addQvSounds(c) {
      var handler = c._qvClickHandler;
      if (!handler) return;
      var wrapped = function (e) {
        var btn = e.target.closest('[data-action]');
        if (btn) {
          var action = btn.dataset.action;
          if (action && action !== 'q-toggle-card') {
            if (action.indexOf('delete') >= 0 || action.indexOf('remove') >= 0) playSound('close');
            else playSound('click');
          }
        }
        handler(e);
      };
      c.removeEventListener('click', handler);
      c._qvClickHandler = wrapped;
      c.addEventListener('click', wrapped);
    })(container);

    // --- 文本字段变更事件 ---
    if (container._qvCh1) container.removeEventListener('change', container._qvCh1);
    container._qvCh1 = function (e) {
      const input = e.target.closest('[data-field^="q."]');
      if (!input) return;
      const field = input.dataset.field;
      const qi = parseInt(input.dataset.qIndex);
      const ti = input.dataset.tIndex !== undefined ? parseInt(input.dataset.tIndex) : -1;
      const quest = parsed.quests[qi];
      if (!quest) return;

      // Parse field path: q.meta.name, q.task.id, q.start.npc, etc.
      const parts = field.split('.');
      // parts[0] = 'q', parts[1] = section, parts[2...] = subpath

      if (ti >= 0 && parts[1] === 'task') {
        // Task field: q.task.id, q.task.meta.name, q.task.objective, q.task.condition.value, etc.
        const task = quest.tasks[ti];
        if (!task) return;
        _setNestedValue(task, parts.slice(2), input.value);
      } else if (parts[1] === 'agent') {
        // Quest agent: q.agent.hook_name
        const hook = parts.slice(2).join('.');
        quest.agent[hook] = input.value;
      } else if (parts[1] === 'addon') {
        // Quest addon: q.addon.field 或 q.addon.nested.field
        const val = input.value;
        const converted = val === 'true' ? true : val === 'false' ? false : val;
        _setNestedValue(quest, parts.slice(1), converted);
      } else {
        // Quest-level field: q.meta.name, q.start.npc, q.accept.script, etc.
        _setNestedValue(quest, parts.slice(1), input.value);
      }
    };
    container.addEventListener('change', container._qvCh1);

    // 处理 task objective 自定义输入
    if (container._qvCh2) container.removeEventListener('change', container._qvCh2);
    container._qvCh2 = function (e) {
      const input = e.target.closest('[data-field="q.task.objective.custom"]');
      if (!input) return;
      const qi = parseInt(input.dataset.qIndex);
      const ti = parseInt(input.dataset.tIndex);
      const task = parsed.quests[qi]?.tasks[ti];
      if (task) task.objective = input.value;
    };
    container.addEventListener('change', container._qvCh2);

    // 处理 task objective 选择器联动
    if (container._qvCh3) container.removeEventListener('change', container._qvCh3);
    container._qvCh3 = function (e) {
      const sel = e.target.closest('select[data-field="q.task.objective"]');
      if (!sel) return;
      const qi = parseInt(sel.dataset.qIndex);
      const ti = parseInt(sel.dataset.tIndex);
      const task = parsed.quests[qi]?.tasks[ti];
      if (task) {
        task.objective = sel.value;
        const customInput = container.querySelector(
          `input[data-field="q.task.objective.custom"][data-q-index="${qi}"][data-t-index="${ti}"]`
        );
        if (customInput) customInput.value = sel.value ? '' : customInput.value;
      }
    };
    container.addEventListener('change', container._qvCh3);

    // 处理 textarea 文本变更（change 事件对 textarea 足够）
    // 已经包含在 change 事件代理中

    // --- 自动同步（字段编辑后自动同步到源码） ---
    if (container._qvChangeListener) {
      container.removeEventListener('change', container._qvChangeListener);
    }
    container._qvChangeListener = function (e) {
      if (window.__keAutoSync && e.target) {
        var tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          _syncQuestToSource(parsed);
        }
      }
    };
    container.addEventListener('change', container._qvChangeListener);

    // 双向清理: 清除对话编辑器残留的 change 监听
    // (conversation→quest 切换后旧 handler 引用旧 parsed, 触发会把编辑器覆盖成旧对话内容)
    if (container._cvCh1) container.removeEventListener('change', container._cvCh1);
    if (container._cvCh2) container.removeEventListener('change', container._cvCh2);
    if (container._cvCh3) container.removeEventListener('change', container._cvCh3);
    if (container._cvCh4) container.removeEventListener('change', container._cvCh4);
    if (container._cvCh5) container.removeEventListener('change', container._cvCh5);
    if (container._cvChangeListener) container.removeEventListener('change', container._cvChangeListener);
  }

  function _setNestedValue(obj, path, value) {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]] || typeof current[path[i]] !== 'object') {
        current[path[i]] = {};
      }
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
  }

  // ============================================
  // 任务 → YAML 序列化
  // ============================================

  /** 递归生成 addon 的 YAML */
  // 递归序列化 addon 结构(任意深度嵌套对象 + 数组), 避免深层字段退化成 [object Object]/逗号字符串
  function _genAddonYAML(obj, indent) {
    var lines = [];
    for (var keys = Object.keys(obj), ki = 0; ki < keys.length; ki++) {
      var k = keys[ki];
      var v = obj[k];
      if (v === null || v === undefined) continue;
      if (typeof v === 'boolean') {
        lines.push('  '.repeat(indent) + k + ': ' + v);
      } else if (Array.isArray(v)) {
        if (v.length === 0) {
          lines.push('  '.repeat(indent) + k + ': []');
        } else {
          lines.push('  '.repeat(indent) + k + ':');
          var pad = '  '.repeat(indent + 1);
          for (var ai = 0; ai < v.length; ai++) {
            var item = v[ai];
            if (item === null || item === undefined) continue;
            if (typeof item === 'object' && !Array.isArray(item)) {
              var oks = Object.keys(item);
              if (oks.length === 0) {
                lines.push(pad + '- {}');
              } else {
                var firstOk = oks[0];
                lines.push(pad + '- ' + firstOk + ': ' + _genYAMLValue(item[firstOk], indent + 2));
                for (var oi = 1; oi < oks.length; oi++) {
                  var ok = oks[oi];
                  var ov = item[ok];
                  if (ov === null || ov === undefined) continue;
                  lines.push('  '.repeat(indent + 2) + ok + ': ' + _genYAMLValue(ov, indent + 2));
                }
              }
            } else {
              lines.push(pad + '- ' + _genYAMLValue(item, indent + 1));
            }
          }
        }
      } else if (typeof v === 'object') {
        lines.push('  '.repeat(indent) + k + ':');
        var subKeys = Object.keys(v);
        if (subKeys.length === 0) {
          lines.push('  '.repeat(indent + 1) + '{}');
        } else {
          lines.push(_genAddonYAML(v, indent + 1));
        }
      } else {
        lines.push('  '.repeat(indent) + k + ': ' + _genYAMLValue(v, indent));
      }
    }
    return lines.join('\n');
  }

  // ============================================
  // 坐标表达式编辑器弹窗
  // ============================================

  /**
   * 可视化坐标编辑器
   * 格式: [world] x y z [~ radius | > rx ry rz] [& pos2 & pos3 ...]
   */
  function _showPositionEditorModal(initialValue, onConfirm) {
    const old = document.getElementById('qv-pos-editor-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'cv-modal-overlay';
    overlay.id = 'qv-pos-editor-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';

    // Parse initial value
    function parsePos(str) {
      const parts = (str || '').trim().split(/\s+/);
      const result = { world: '', x: '', y: '', z: '', mode: 'exact', radius: '', toX: '', toY: '', toZ: '', multi: [] };
      if (parts.length === 0) return result;

      // Check for & (multi position)
      const multiStr = (str || '').split('&').map(s => s.trim()).filter(Boolean);
      if (multiStr.length > 1) {
        result.mode = 'multi';
        result.multi = multiStr.map(s => {
          const p = s.split(/\s+/);
          if (p.length === 3) return { world: '', x: p[0], y: p[1], z: p[2] };
          if (p.length >= 4) return { world: p[0], x: p[1], y: p[2], z: p[3] };
          return { world: '', x: '', y: '', z: '' };
        });
        return result;
      }

      // Single position
      if (parts.length === 3) {
        result.x = parts[0]; result.y = parts[1]; result.z = parts[2];
      } else if (parts.length === 4 && parts[0] !== '~' && parts[0] !== '>') {
        result.world = parts[0]; result.x = parts[1]; result.y = parts[2]; result.z = parts[3];
      } else if (parts.length === 4 && parts[0] === '~') {
        // 相对坐标(以玩家位置为基准): ~ 作为 world 占位, 序列化时原样回写
        result.world = '~'; result.x = parts[1]; result.y = parts[2]; result.z = parts[3]; result.mode = 'exact';
      } else if (parts.length === 5) {
        if (parts[3] === '~') { result.world = parts[0]; result.x = parts[1]; result.y = parts[2]; result.mode = 'radius'; result.radius = parts[4]; }
        else if (parts[3] === '>') { result.world = parts[0]; result.x = parts[1]; result.y = parts[2]; result.mode = 'area'; result.toX = parts[4]; result.toY = ''; result.toZ = ''; }
        else { result.x = parts[0]; result.y = parts[1]; result.z = parts[2]; result.mode = 'radius'; result.radius = parts[4]; }
      } else if (parts.length === 6) {
        result.world = parts[0]; result.x = parts[1]; result.y = parts[2]; result.z = parts[3];
        if (parts[4] === '~') { result.mode = 'radius'; result.radius = parts[5]; }
        else if (parts[4] === '>') { result.mode = 'area'; result.toX = parts[5]; result.toY = ''; result.toZ = ''; }
      } else if (parts.length >= 7) {
        result.world = parts[0]; result.x = parts[1]; result.y = parts[2]; result.z = parts[3];
        result.mode = 'area'; result.toX = parts[5]; result.toY = parts[6];
        // Check if there's a 7th part or already reached end
        if (parts[7] && !parts[7].startsWith('&')) result.toZ = parts[7];
        else result.toZ = '';
      }
      return result;
    }

    let parsed = parsePos(initialValue);

    function generatePos() {
      if (parsed.mode === 'multi') {
        return parsed.multi.map(p => {
          let s = '';
          s += (p.world || parsed.world) + ' ';
          s += (p.x || '0') + ' ' + (p.y || '0') + ' ' + (p.z || '0');
          return s.trim();
        }).join(' & ');
      }
      let s = parsed.world + ' ';
      s += (parsed.x || '0') + ' ' + (parsed.y || '0') + ' ' + (parsed.z || '0');
      if (parsed.mode === 'radius' && parsed.radius) s += ' ~ ' + parsed.radius;
      else if (parsed.mode === 'area') s += ' > ' + (parsed.toX || '0') + ' ' + (parsed.toY || '0') + ' ' + (parsed.toZ || '0');
      return s.trim();
    }

    function render() {
      const preview = overlay.querySelector('#qpe-preview');
      if (preview) preview.textContent = generatePos();
    }

    overlay.innerHTML = `
      <div class="cv-modal-content" style="background:var(--color-bg-secondary);border-radius:10px;padding:20px;max-width:520px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
        <h3 style="margin:0 0 16px;font-size:15px;">${I18N.t('chemdah.posEditor')}</h3>
        <div class="cv-field"><label>${I18N.t('chemdah.world')}</label>
          <input class="cv-input cv-input-mono" id="qpe-world" value="${_escHtml(parsed.world)}" placeholder="${I18N.t('chemdah.required')}">
        </div>
        <div class="cv-field"><label>${I18N.t('chemdah.xyz')}</label>
          <div style="display:flex;gap:6px;">
            <input class="cv-input cv-input-mono" id="qpe-x" value="${_escHtml(parsed.x)}" placeholder="X" style="flex:1;">
            <input class="cv-input cv-input-mono" id="qpe-y" value="${_escHtml(parsed.y)}" placeholder="Y" style="flex:1;">
            <input class="cv-input cv-input-mono" id="qpe-z" value="${_escHtml(parsed.z)}" placeholder="Z" style="flex:1;">
          </div>
        </div>
        <div class="cv-field"><label>${I18N.t('chemdah.mode')}</label>
          <select class="cv-input" id="qpe-mode">
            <option value="exact"${parsed.mode === 'exact' ? ' selected' : ''}>${I18N.t('chemdah.exactPos')}</option>
            <option value="radius"${parsed.mode === 'radius' ? ' selected' : ''}>${I18N.t('chemdah.radiusPos')}</option>
            <option value="area"${parsed.mode === 'area' ? ' selected' : ''}>${I18N.t('chemdah.areaPos')}</option>
            <option value="multi"${parsed.mode === 'multi' ? ' selected' : ''}>${I18N.t('chemdah.multiPos')}</option>
          </select>
        </div>
        <div id="qpe-radius-field" class="cv-field" style="display:${parsed.mode === 'radius' ? '' : 'none'};"><label>${I18N.t('chemdah.radius')}</label>
          <input class="cv-input cv-input-mono" id="qpe-radius" value="${_escHtml(parsed.radius)}" placeholder="${I18N.t('chemdah.radiusPlaceholder')}">
        </div>
        <div id="qpe-area-field" class="cv-field" style="display:${parsed.mode === 'area' ? '' : 'none'};"><label>${I18N.t('chemdah.areaTo')}</label>
          <div style="display:flex;gap:6px;">
            <input class="cv-input cv-input-mono" id="qpe-to-x" value="${_escHtml(parsed.toX)}" placeholder="${I18N.t('chemdah.toX')}" style="flex:1;">
            <input class="cv-input cv-input-mono" id="qpe-to-y" value="${_escHtml(parsed.toY)}" placeholder="${I18N.t('chemdah.toY')}" style="flex:1;">
            <input class="cv-input cv-input-mono" id="qpe-to-z" value="${_escHtml(parsed.toZ)}" placeholder="${I18N.t('chemdah.toZ')}" style="flex:1;">
          </div>
        </div>
        <div id="qpe-multi-field" class="cv-field" style="display:${parsed.mode === 'multi' ? '' : 'none'};">
          <label>${I18N.t('chemdah.multiCoords')}</label>
          <div id="qpe-multi-list"></div>
          <button class="cv-btn cv-btn-xs cv-btn-secondary" id="qpe-multi-add" style="margin-top:4px;">${I18N.t('chemdah.addCoord')}</button>
        </div>
        <div class="cv-field"><label>${I18N.t('chemdah.preview')}</label>
          <div class="cv-input cv-input-mono" id="qpe-preview" style="background:var(--color-bg-primary);padding:6px 10px;word-break:break-all;">${_escHtml(generatePos())}</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button class="cv-btn cv-btn-secondary" id="qpe-cancel">${I18N.t('chemdah.cancel')}</button>
          <button class="cv-btn cv-btn-primary" id="qpe-confirm">${I18N.t('chemdah.ok')}</button>
        </div>
      </div>
    `;

    // --- Event handlers ---
    const worldInp = overlay.querySelector('#qpe-world');
    const xInp = overlay.querySelector('#qpe-x');
    const yInp = overlay.querySelector('#qpe-y');
    const zInp = overlay.querySelector('#qpe-z');
    const modeSel = overlay.querySelector('#qpe-mode');
    const radiusInp = overlay.querySelector('#qpe-radius');
    const toXInp = overlay.querySelector('#qpe-to-x');
    const toYInp = overlay.querySelector('#qpe-to-y');
    const toZInp = overlay.querySelector('#qpe-to-z');
    const radiusField = overlay.querySelector('#qpe-radius-field');
    const areaField = overlay.querySelector('#qpe-area-field');
    const multiField = overlay.querySelector('#qpe-multi-field');
    const multiList = overlay.querySelector('#qpe-multi-list');
    const multiAddBtn = overlay.querySelector('#qpe-multi-add');

    function readInputs() {
      parsed.world = worldInp.value.trim();
      parsed.x = xInp.value.trim();
      parsed.y = yInp.value.trim();
      parsed.z = zInp.value.trim();
      parsed.mode = modeSel.value;
      parsed.radius = radiusInp.value.trim();
      parsed.toX = toXInp.value.trim();
      parsed.toY = toYInp.value.trim();
      parsed.toZ = toZInp.value.trim();
      radiusField.style.display = parsed.mode === 'radius' ? '' : 'none';
      areaField.style.display = parsed.mode === 'area' ? '' : 'none';
      multiField.style.display = parsed.mode === 'multi' ? '' : 'none';
      if (parsed.mode === 'multi') renderMultiList();
      render();
    }

    [worldInp, xInp, yInp, zInp, modeSel, radiusInp, toXInp, toYInp, toZInp].forEach(el => {
      el.addEventListener('input', readInputs);
      el.addEventListener('change', readInputs);
    });
    modeSel.addEventListener('change', readInputs);

    function renderMultiList() {
      multiList.innerHTML = '';
      parsed.multi.forEach((p, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:4px;margin-bottom:4px;align-items:center;';
        row.innerHTML = `
          <input class="cv-input cv-input-mono" data-idx="${i}" data-field="w" value="${_escHtml(p.world)}" placeholder="${I18N.t('chemdah.world')}" style="flex:1;min-width:60px;">
          <input class="cv-input cv-input-mono" data-idx="${i}" data-field="x" value="${_escHtml(p.x)}" placeholder="X" style="flex:1;">
          <input class="cv-input cv-input-mono" data-idx="${i}" data-field="y" value="${_escHtml(p.y)}" placeholder="Y" style="flex:1;">
          <input class="cv-input cv-input-mono" data-idx="${i}" data-field="z" value="${_escHtml(p.z)}" placeholder="Z" style="flex:1;">
          <button class="cv-btn-icon cv-btn-icon-danger qpe-multi-del" data-idx="${i}" style="width:auto;height:auto;font-size:14px;">✕</button>
        `;
        row.querySelectorAll('input').forEach(inp => {
          inp.addEventListener('input', () => {
            const idx = parseInt(inp.dataset.idx);
            const field = inp.dataset.field;
            if (field === 'w') parsed.multi[idx].world = inp.value.trim();
            else if (field === 'x') parsed.multi[idx].x = inp.value.trim();
            else if (field === 'y') parsed.multi[idx].y = inp.value.trim();
            else if (field === 'z') parsed.multi[idx].z = inp.value.trim();
            render();
          });
        });
        row.querySelector('.qpe-multi-del').addEventListener('click', () => { playSound('close');
          parsed.multi.splice(i, 1);
          renderMultiList();
          render();
        });
        multiList.appendChild(row);
      });
    }

    multiAddBtn.addEventListener('click', () => { playSound('click');
      parsed.multi.push({ world: '', x: '', y: '', z: '' });
      renderMultiList();
      render();
    });

    if (parsed.mode === 'multi') renderMultiList();

    overlay.querySelector('#qpe-cancel').addEventListener('click', () => { playSound('close'); overlay.remove(); });
    overlay.querySelector('#qpe-confirm').addEventListener('click', async () => { playSound('click');
      readInputs();
      if (!parsed.world) {
        await UI.alert({ message: I18N.t('chemdah.worldRequired') });
        worldInp.focus();
        return;
      }
      const result = generatePos();
      if (onConfirm) onConfirm(result);
      overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  /** Expose position editor for external use */
  function _showPositionEditor(initialValue, onConfirm) {
    _showPositionEditorModal(initialValue, onConfirm);
  }

  // 未知 section 原样写回(内容级保留; 引号风格可能与原文不同)
  function _genRawYAML(value, indent) {
    if (value === null || value === undefined) return '  '.repeat(indent) + '~';
    if (typeof value !== 'object') return '  '.repeat(indent) + _genYAMLValue(value, indent);
    let dumped;
    try {
      dumped = jsyaml.dump(value, { indent: 2, noRefs: true, lineWidth: -1 });
    } catch (e) {
      return '  '.repeat(indent) + JSON.stringify(value);
    }
    const pad = '  '.repeat(indent);
    return String(dumped).trimEnd().split('\n').map(l => (l ? pad + l : '')).join('\n');
  }

  function _genQuestYAML(parsed) {
    const lines = [];

    for (const quest of parsed.quests) {
      lines.push(`${_quoteYamlKey(quest.id)}:`);

      // meta
      const hasMeta = quest.meta.name || quest.meta.type || quest.meta.description ||
        quest.meta.depend || quest.meta.stats || quest.meta.optional !== undefined ||
        quest.meta['reset-data-on-accepted'] !== undefined ||
        (quest.meta._raw && Object.keys(quest.meta._raw).length > 0);
      if (hasMeta) {
        lines.push('  meta:');
        if (quest.meta.name) lines.push(`    name: ${_genYAMLValue(quest.meta.name, 2)}`);
        if (quest.meta.type) lines.push(`    type: ${_genYAMLValue(quest.meta.type, 2)}`);
        if (quest.meta.description) lines.push(`    description: ${_genYAMLValue(quest.meta.description, 2)}`);
        if (quest.meta.depend && quest.meta.depend.length > 0) {
          const depStr = quest.meta.depend.filter(Boolean).join(', ');
          if (depStr) lines.push(`    depend: ${_genYAMLValue(depStr, 2)}`);
        }
        if (quest.meta.stats && quest.meta.stats.visible !== undefined) {
          lines.push('    stats:');
          lines.push(`      visible: ${quest.meta.stats.visible}`);
        }
        if (quest.meta.optional !== undefined) {
          lines.push(`    optional: ${quest.meta.optional}`);
        }
        if (quest.meta['reset-data-on-accepted'] !== undefined) {
          lines.push(`    reset-data-on-accepted: ${quest.meta['reset-data-on-accepted']}`);
        }
        // 无法识别的 meta 字段原样写回
        if (quest.meta._raw && Object.keys(quest.meta._raw).length > 0) {
          for (const [rk, rv] of Object.entries(quest.meta._raw)) {
            lines.push(_genRawYAML({ [rk]: rv }, 2));
          }
        }
      }

      // tasks
      if (quest.tasks && quest.tasks.length > 0) {
        lines.push('  objectives:');
        for (const task of quest.tasks) {
          lines.push('    - id: ' + _genYAMLValue(task.id, 2));

          if (task.meta && task.meta.name) {
            lines.push('      meta:');
            lines.push(`        name: ${_genYAMLValue(task.meta.name, 3)}`);
          }

          if (task.objective) {
            lines.push(`      objective: ${_genYAMLValue(task.objective, 3)}`);
          }

          // condition
          if (task.condition && (task.condition.value || task.condition.position || task.condition.kether)) {
            lines.push('      condition:');
            if (task.condition.value) lines.push(`        value: ${_genYAMLValue(task.condition.value, 3)}`);
            if (task.condition.position) lines.push(`        position: ${_genYAMLValue(task.condition.position, 3)}`);
            if (task.condition.kether) lines.push(`        $: ${_genYAMLValue(task.condition.kether, 3)}`);
          }

          // goal
          if (task.goal && Object.keys(task.goal).length > 0) {
            lines.push('      goal:');
            for (const [gk, gv] of Object.entries(task.goal)) {
              if (gv === null || gv === undefined) continue;
              lines.push(`        ${gk}: ${_genYAMLValue(gv, 4)}`);
            }
          }

          // task agent
          if (task.agent && Object.keys(task.agent).length > 0) {
            lines.push('      agent:');
            for (const [hook, script] of Object.entries(task.agent)) {
              lines.push(`        ${hook}: ${_genYAMLValue(script, 4)}`);
            }
          }

          // 任务内无法识别的字段原样写回
          if (task._raw && Object.keys(task._raw).length > 0) {
            for (const [rk, rv] of Object.entries(task._raw)) {
              lines.push(_genRawYAML({ [rk]: rv }, 3));
            }
          }
        }
      }

      // addon
      if (quest.addon && Object.keys(quest.addon).length > 0) {
        lines.push('  addon:');
        lines.push(_genAddonYAML(quest.addon, 2));
      }

      // quest agent
      if (quest.agent && Object.keys(quest.agent).length > 0) {
        lines.push('  agent:');
        for (const [hook, script] of Object.entries(quest.agent)) {
          lines.push(`    ${hook}: ${_genYAMLValue(script, 2)}`);
        }
      }

      // start / accept(有值才写, 避免凭空出现空字段)
      if (quest.start && (quest.start.npc || quest.start.script ||
          (quest.start._raw && Object.keys(quest.start._raw).length > 0))) {
        lines.push('  start:');
        if (quest.start.npc) lines.push(`    npc: ${_genYAMLValue(quest.start.npc, 3)}`);
        if (quest.start.script) lines.push(`    script: ${_genYAMLValue(quest.start.script, 3)}`);
        if (quest.start._raw) {
          for (const [rk, rv] of Object.entries(quest.start._raw)) {
            lines.push(_genRawYAML({ [rk]: rv }, 2));
          }
        }
      }
      if (quest.accept && (quest.accept.npc || quest.accept.script ||
          (quest.accept._raw && Object.keys(quest.accept._raw).length > 0))) {
        lines.push('  accept:');
        if (quest.accept.npc) lines.push(`    npc: ${_genYAMLValue(quest.accept.npc, 3)}`);
        if (quest.accept.script) lines.push(`    script: ${_genYAMLValue(quest.accept.script, 3)}`);
        if (quest.accept._raw) {
          for (const [rk, rv] of Object.entries(quest.accept._raw)) {
            lines.push(_genRawYAML({ [rk]: rv }, 2));
          }
        }
      }

      // 无法识别的 section 原样写回
      if (quest._raw && Object.keys(quest._raw).length > 0) {
        for (const [rk, rv] of Object.entries(quest._raw)) {
          lines.push(_genRawYAML({ [rk]: rv }, 1));
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 将可视化编辑器的更改同步回 CodeMirror 源码
   */
  function _syncQuestToSource(parsed) {
    const yaml = _genQuestYAML(parsed);
    if (window.codeMirrorEditor) {
      window.codeMirrorEditor.setValue(yaml);
      window.updateStatus(I18N.t('chemdah.syncedToSource'));
    }
  }

  // ============================================
  // 类型选择对话框
  // ============================================

  /**
   * 显示类型选择对话框
   * callback(type, scope) — scope: 'file' | 'directory' | 'project'
   */
  function showTypeSelector(filePath, detectedType, callback) {
    // 移除已存在的
    const old = document.getElementById('cv-type-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'cv-type-modal';
    modal.className = 'cv-modal';

    const typeLabels = {
      conversation: I18N.t('chemdah.typeConversationFull'),
      quest: I18N.t('chemdah.typeQuestFull'),
      unknown: I18N.t('chemdah.typeUnknown'),
    };
    const hasCE = typeof CraftEngineInterpreter !== 'undefined';
    if (hasCE) {
      typeLabels.craftengine = I18N.t('editor.typeCraftEngine');
    }

    modal.innerHTML = `
      <div class="cv-modal-content">
        <h3>${I18N.t('chemdah.selectTypeTitle')}</h3>
        <p class="cv-modal-desc">
          ${I18N.t('chemdah.typeUnknownMsg', {detected: detectedType !== 'unknown' ? I18N.t('chemdah.detectedAs', {type: typeLabels[detectedType] || detectedType}) : ''})}
        </p>
        <div class="cv-modal-field">
          <label>${I18N.t('chemdah.interpreterType')}</label>
          <select id="cv-type-select" class="cv-select cv-select-lg">
            <option value="conversation" ${detectedType === 'conversation' ? 'selected' : ''}>${I18N.t('chemdah.typeConversation')}</option>
            <option value="quest" ${detectedType === 'quest' ? 'selected' : ''}>${I18N.t('chemdah.typeQuest')}</option>
            ${hasCE ? `<option value="craftengine" ${detectedType === 'craftengine' ? 'selected' : ''}>${I18N.t('editor.typeCraftEngine')}</option>` : ''}
          </select>
        </div>
        <div class="cv-modal-field">
          <label>${I18N.t('chemdah.scopeLabel')}</label>
          <select id="cv-scope-select" class="cv-select cv-select-lg">
            <option value="file">${I18N.t('chemdah.scopeFile')}</option>
            <option value="directory">${I18N.t('chemdah.scopeDirectory')}</option>
            <option value="project">${I18N.t('chemdah.scopeProject')}</option>
          </select>
        </div>
        <div class="cv-modal-actions">
          <button class="cv-btn cv-btn-secondary" id="cv-type-cancel">${I18N.t('chemdah.cancel')}</button>
          <button class="cv-btn cv-btn-primary" id="cv-type-confirm">${I18N.t('chemdah.confirm')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('cv-type-confirm').addEventListener('click', () => {
      const type = document.getElementById('cv-type-select').value;
      const scope = document.getElementById('cv-scope-select').value;
      modal.remove();
      if (callback) callback(type, scope);
    });

    document.getElementById('cv-type-cancel').addEventListener('click', () => {
      modal.remove();
      if (callback) callback(null, null);
    });

    // 点击背景关闭
    modal.addEventListener('click', function (e) {
      if (e.target === this) {
        modal.remove();
        if (callback) callback(null, null);
      }
    });
  }

  // ============================================
  // 主入口：渲染可视化编辑器
  // ============================================

  /**
   * 渲染可视化编辑器
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @param {HTMLElement} containerEl - 容器元素
   * @param {object} options - { forceType, onSync }
   */
  function render(filePath, content, containerEl, options = {}) {
    if (!containerEl) return;

    const forceType = options.forceType || null;
    let detectedType = forceType || detectFileType(filePath, content);
    const parsedContent = content || '';

    if (detectedType === TYPES.UNKNOWN && !forceType) {
      // 显示类型选择对话框
      showTypeSelector(filePath, detectedType, (type, scope) => {
        if (!type) {
          containerEl.innerHTML = `<div class="cv-empty">
            <h2>${I18N.t('chemdah.visualEditTitle')}</h2>
            <p>${I18N.t('chemdah.visualEditHint')}</p>
          </div>`;
          return;
        }

        // 保存覆盖设置(跨平台分隔符)
        const sep = filePath.includes('/') ? '/' : '\\';
        let scopePath = filePath;
        if (scope === 'directory') {
          scopePath = filePath.substring(0, filePath.lastIndexOf(sep));
        } else if (scope === 'project') {
          // 项目根: 向上找含 configuration/ 的目录(与 detectProjectTypes 一致)
          let dir = filePath.substring(0, filePath.lastIndexOf(sep));
          while (dir && dir.includes(sep)) {
            const dirName = dir.substring(dir.lastIndexOf(sep) + 1);
            if (dirName === 'configuration') break;
            dir = dir.substring(0, dir.lastIndexOf(sep));
          }
          scopePath = dir || filePath.substring(0, filePath.lastIndexOf(sep));
        }
        setTypeOverride(scopePath, type);

        // 重新渲染
        render(filePath, content, containerEl, { forceType: type, onSync: options.onSync });
      });
      return;
    }

    if (detectedType === TYPES.CONVERSATION) {
      const parsed = parseConversation(parsedContent);

      // 存储文件路径，供思维导图缓存使用
      containerEl._cvFilePath = filePath;

      // 存储渲染函数以便重新渲染（从当前 parsed 数据重绘，不丢失未同步修改）
      const reRender = () => {
        const current = containerEl._cvParsed;
        if (current) {
          renderConversationVisual(current, containerEl);
          // 自动同步到源码（通过 window.__keAutoSync 控制）
          if (window.__keAutoSync) _syncConversationToSource(current);
        }
      };
      window._cvRenderFn = reRender;

      renderConversationVisual(parsed, containerEl);

      // 把 parsed 数据挂载到 container 上，供事件处理使用
      containerEl._cvParsed = parsed;
      return parsed;
    }

    if (detectedType === TYPES.QUEST) {
      const parsed = parseQuest(parsedContent);

      // 存储渲染函数以便重新渲染（从当前 parsed 数据重绘，不丢失未同步修改）
      const reRender = () => {
        const current = containerEl._qvParsed;
        if (current) {
          renderQuestVisual(current, containerEl);
          // 自动同步到源码（通过 window.__keAutoSync 控制）
          if (window.__keAutoSync) _syncQuestToSource(current);
        }
      };
      window._cvRenderFn = reRender;

      renderQuestVisual(parsed, containerEl);

      // 把 parsed 数据挂载到 container 上
      containerEl._qvParsed = parsed;
      return parsed;
    }

    // Unknown
    containerEl.innerHTML = `<div class="cv-empty">
      <h2>${I18N.t('chemdah.unknownTypeTitle')}</h2>
      <p>${I18N.t('chemdah.unknownTypeMsg')}</p>
      <p>${I18N.t('chemdah.unknownTypeHint')} <button class="cv-btn cv-btn-sm cv-btn-secondary" id="cv-unknown-type-btn">${I18N.t('chemdah.manualSelect')}</button></p>
    </div>`;
    // 事件委托绑定, 避免 filePath 拼进 inline onclick 的注入面
    const unknownBtn = containerEl.querySelector('#cv-unknown-type-btn');
    if (unknownBtn) {
      unknownBtn.addEventListener('click', function () {
        ChemdahInterpreter.showTypeSelector(filePath, 'unknown', function (type, scope) {
          if (type) {
            document.getElementById('visual-editor').innerHTML = '<div class="cv-empty">' + I18N.t('chemdah.rendering') + '</div>';
            ChemdahInterpreter.render(filePath, document.getElementById('source-editor').textContent || window.codeMirrorEditor.getValue(), document.getElementById('visual-editor'), { forceType: type });
          }
        });
      });
    }
  }

  // ============================================
  // 公共 API
  // ============================================

  return {
    TYPES,
    PRESET_THEMES,
    PRESET_FLAGS,

    // 类型检测
    detectProjectTypes,
    detectFileType,
    setTypeOverride,
    getTypeOverride,
    getAllOverrides,
    removeTypeOverride,

    // 解析
    parseConversation,
    parseQuest,

    // 定义数据加载
    setDefinitions,

    // 可视化渲染
    render,

    // 对话框
    showTypeSelector,

    // 可视化物品编辑器
    showItemEditor: _showItemEditorModal,

    // 可视化坐标编辑器
    showPositionEditor: _showPositionEditorModal,

    // YAML 生成
    generateConversationYAML: _genConversationYAML,
    syncConversationToSource: _syncConversationToSource,

    // Quest YAML 生成
    generateQuestYAML: _genQuestYAML,
    syncQuestToSource: _syncQuestToSource,

    // Quest 类型数据（供外部使用）
    QUEST_OBJECTIVE_TYPES,
    QUEST_AGENT_HOOKS,
    QUEST_ADDON_TYPES,
  };
})();
