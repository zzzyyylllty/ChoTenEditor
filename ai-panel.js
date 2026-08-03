// ============================================
// AI 制作面板
// ============================================

var AIPanel = (function() {

  var _overlay = null;
  var _messages = [];
  var _isStreaming = false;
  var _fileOps = [];
  var _currentFileContext = '';
  var _lastUserMessage = '';
  var _lastAIMessageEl = null;
  var _promptCache = {};

  // ============================================
  // Markdown 渲染
  // ============================================

  function renderMarkdown(text) {
    if (!text) return '';
    var codeBlocks = [];
    var processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, function(m, lang, code) {
      var idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || '', code: code });
      return '%%CB' + idx + '%%';
    });
    processed = escHtml(processed);
    processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
    processed = processed.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>');
    processed = processed.replace(/~~(.+?)~~/g, '<del>$1</del>');

    var lines = processed.split('\n');
    var html = '';
    var inUl = false, inOl = false;

    function closeList() {
      if (inUl) { html += '</ul>\n'; inUl = false; }
      if (inOl) { html += '</ol>\n'; inOl = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var cbMatch = line.match(/^%%CB(\d+)%%$/);
      if (cbMatch) {
        closeList();
        var idx = parseInt(cbMatch[1]);
        var block = codeBlocks[idx];
        var langClass = block.lang ? ' class="language-' + block.lang + '"' : '';
        html += '<pre><code' + langClass + '>' + escHtml(block.code) + '</code></pre>\n';
        continue;
      }
      var hMatch = line.match(/^(#{1,4})\s+(.+)/);
      if (hMatch) {
        closeList();
        html += '<h' + hMatch[1].length + '>' + hMatch[2].trim() + '</h' + hMatch[1].length + '>\n';
        continue;
      }
      if (/^---$/.test(line.trim())) {
        closeList();
        html += '<hr>\n';
        continue;
      }
      var bqMatch = line.match(/^>\s*(.*)/);
      if (bqMatch) {
        closeList();
        html += '<blockquote>' + (bqMatch[1] || '') + '</blockquote>\n';
        continue;
      }
      var ulMatch = line.match(/^[\s]*[-*+]\s+(.+)/);
      if (ulMatch) {
        if (inOl) { html += '</ol>\n'; inOl = false; }
        if (!inUl) { html += '<ul>\n'; inUl = true; }
        html += '<li>' + ulMatch[1] + '</li>\n';
        continue;
      }
      var olMatch = line.match(/^\s*\d+\.\s+(.+)/);
      if (olMatch) {
        if (inUl) { html += '</ul>\n'; inUl = false; }
        if (!inOl) { html += '<ol>\n'; inOl = true; }
        html += '<li>' + olMatch[1] + '</li>\n';
        continue;
      }
      closeList();
      if (line.trim() === '') {
        html += '</p><p>';
        continue;
      }
      html += line + '\n';
    }
    closeList();

    if (html.slice(-9) === '</p><p>') html = html.slice(0, -9);
    if (html.indexOf('<p>') === -1 && html.indexOf('<h') === -1 && html.indexOf('<pre') === -1 &&
        html.indexOf('<ul') === -1 && html.indexOf('<ol') === -1 && html.indexOf('<hr') === -1 &&
        html.indexOf('<blockquote') === -1) {
      html = '<p>' + html + '</p>';
    } else if (html.indexOf('<p>') === -1 && html.trim()) {
      html = '<p>' + html + '</p>';
    }
    return html;
  }

  // ============================================
  // Token 估算
  // ============================================

  function estimateTokens(text) {
    if (!text) return 0;
    var cjk = (text.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
    return Math.ceil(cjk * 0.65 + (text.length - cjk) * 0.25);
  }

  function updateTokenCount() {
    var el = document.getElementById('ai-token-count');
    if (!el) return;
    var total = 0;
    for (var i = 0; i < _messages.length; i++) {
      total += estimateTokens(_messages[i].content || '');
    }
    el.textContent = '~' + total + ' tokens';
  }

  // ============================================
  // 公共 API
  // ============================================

  function open() {
    if (_overlay) { _overlay.style.display = 'flex'; return; }
    I18N.ready.then(function() {
      createPanel();
      loadHistory();
    });
  }

  function close() {
    if (_overlay) _overlay.style.display = 'none';
    if (window.electronAPI && window.electronAPI.ai) window.electronAPI.ai.removeListeners();
  }

  function setFileContext(filePath) {
    _currentFileContext = filePath || '';
    var ctxEl = document.getElementById('ai-context-file');
    if (ctxEl) {
      ctxEl.textContent = _currentFileContext ? I18N.t('ai.currentFile', {name: _currentFileContext.split(/[\\/]/).pop()}) : I18N.t('ai.noContextFile');
    }
  }

  // ============================================
  // 创建面板
  // ============================================

  function createPanel() {
    _overlay = document.createElement('div');
    _overlay.id = 'ai-panel-overlay';
    _overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:200000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';

    _overlay.innerHTML = '\
<div id="ai-panel" style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:12px;width:92%;max-width:860px;height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,0.5);overflow:hidden;">\
  <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--color-border);flex-shrink:0;">\
    <div style="display:flex;align-items:center;gap:10px;">\
      <span style="font-size:16px;font-weight:700;background:linear-gradient(135deg,color-mix(in srgb, var(--color-primary) 72%, #ffffff),var(--color-primary));-webkit-background-clip:text;-webkit-text-fill-color:transparent;">' + I18N.t('ai.title') + '</span>\
      <select id="ai-model-select" style="padding:2px 6px;font-size:11px;background:var(--color-bg-tertiary);border:1px solid var(--color-border);border-radius:4px;color:var(--color-text-secondary);outline:none;cursor:pointer;">\
        <option value="">' + I18N.t('ai.followSettings') + '</option>\
        <option value="gpt-4o">GPT-4o</option>\
        <option value="gpt-4o-mini">GPT-4o Mini</option>\
        <option value="gpt-4-turbo">GPT-4 Turbo</option>\
        <option value="deepseek-chat">DeepSeek Chat</option>\
        <option value="deepseek-reasoner">DeepSeek Reasoner</option>\
        <option value="qwen2.5-coder">Qwen 2.5 Coder</option>\
        <option value="custom">' + I18N.t('ai.customModel') + '</option>\
      </select>\
      <span id="ai-status" style="font-size:11px;color:var(--color-text-tertiary);"></span>\
    </div>\
    <div style="display:flex;align-items:center;gap:6px;">\
      <button id="ai-btn-settings" class="ai-head-btn" data-tip="' + I18N.t('ai.settings') + '">⚙️</button>\
      <button id="ai-btn-clear" class="ai-head-btn" data-tip="' + I18N.t('ai.clearChat') + '">🗑️</button>\
      <button id="ai-btn-close" class="ai-head-btn" style="font-size:18px;" data-tip="' + I18N.t('common.close') + '">✕</button>\
    </div>\
  </div>\
  <div id="ai-context-bar" style="display:flex;align-items:center;padding:6px 16px;border-bottom:1px solid var(--color-border);background:var(--color-bg-tertiary);flex-shrink:0;font-size:11px;color:var(--color-text-tertiary);gap:12px;">\
    <span id="ai-context-file">' + I18N.t('ai.noContextFile') + '</span>\
    <span id="ai-token-count" style="margin-left:auto;"></span>\
  </div>\
  <div id="ai-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:0;"></div>\
  <div id="ai-file-ops" style="flex-shrink:0;max-height:200px;overflow-y:auto;border-top:1px solid var(--color-border);padding:8px 16px;display:none;"></div>\
  <div style="flex-shrink:0;padding:12px 16px;border-top:1px solid var(--color-border);">\
    <div style="display:flex;gap:8px;align-items:flex-end;">\
      <textarea id="ai-input" placeholder="' + I18N.t('ai.inputPlaceholder') + '" style="flex:1;padding:10px 12px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-tertiary);color:var(--color-text-primary);font-size:13px;resize:none;min-height:40px;max-height:120px;font-family:inherit;outline:none;" rows="2"></textarea>\
      <button id="ai-btn-send" class="btn-accent" style="padding:10px 20px;font-size:14px;font-weight:600;">' + I18N.t('ai.send') + '</button>\
      <button id="ai-btn-stop" class="btn-danger" style="padding:10px 16px;font-size:13px;display:none;">' + I18N.t('ai.stop') + '</button>\
    </div>\
  </div>\
</div>';

    document.body.appendChild(_overlay);
    bindEvents();

    try {
      var cfgRaw = localStorage.getItem('editorConfig');
      if (cfgRaw) {
        var cfg = JSON.parse(cfgRaw);
        var modelSelect = document.getElementById('ai-model-select');
        var currentModel = cfg.ai && cfg.ai.model;
        if (modelSelect && currentModel) {
          var found = false;
          for (var oi = 0; oi < modelSelect.options.length; oi++) {
            if (modelSelect.options[oi].value === currentModel) {
              modelSelect.selectedIndex = oi;
              found = true; break;
            }
          }
          if (!found && currentModel) modelSelect.value = 'custom';
        }
      }
    } catch(e) {}

    setFileContext(_currentFileContext);
    loadPromptsFromDisk();
    var saved = loadMessages();
    renderMessages(saved);
  }

  // ============================================
  // 事件绑定
  // ============================================

  function bindEvents() {
    document.getElementById('ai-btn-close').onclick = close;
    document.getElementById('ai-btn-clear').onclick = clearConversation;
    document.getElementById('ai-btn-settings').onclick = function() {
      try { var w = window.open('settings.html', '_blank'); } catch(e) {}
    };

    var input = document.getElementById('ai-input');
    var sendBtn = document.getElementById('ai-btn-send');
    var stopBtn = document.getElementById('ai-btn-stop');

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
      setTimeout(function() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      }, 0);
    });
    input.addEventListener('input', function() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    sendBtn.onclick = sendMessage;
    stopBtn.onclick = stopStreaming;

    document.getElementById('ai-model-select').onchange = function() {
      try {
        var cfgRaw = localStorage.getItem('editorConfig');
        if (cfgRaw) {
          var cfg = JSON.parse(cfgRaw);
          if (!cfg.ai) cfg.ai = {};
          cfg.ai.model = this.value || 'gpt-4o';
          localStorage.setItem('editorConfig', JSON.stringify(cfg));
        }
      } catch(e) {}
    };

    _overlay.addEventListener('click', function(e) {
      if (e.target === _overlay) close();
    });
  }

  // ============================================
  // 提示词加载
  // ============================================

  function loadPromptsFromDisk() {
    if (window.electronAPI && window.electronAPI.ai && window.electronAPI.ai.loadPrompts) {
      window.electronAPI.ai.loadPrompts().then(function(result) {
        if (result.success) _promptCache = result.prompts || {};
      }).catch(function(err) {
        console.warn('[AI] 加载提示词失败:', err);
      });
    }
  }

  function resolvePrompt(aiConfig) {
    if (aiConfig.systemPrompt === 'custom' && aiConfig.customPrompt) return aiConfig.customPrompt;
    var promptName = aiConfig.systemPrompt || 'default';
    var prompt = _promptCache[promptName];
    if (prompt && prompt.content) return prompt.content;
    return '你是一个 Minecraft 插件开发助手。当需要创建、编辑或删除文件时，请使用以下格式标记文件操作：\n\n```file:create 相对路径/文件名\n文件内容\n```\n\n```file:edit 相对路径/文件名\n---ORIGINAL---\n需要替换的原始内容\n---UPDATED---\n替换后的新内容\n```\n\n```file:delete 相对路径/文件名\n```';
  }

  // ============================================
  // 发送消息
  // ============================================

  async function getAIConfig() {
    try {
      var raw = localStorage.getItem('editorConfig');
      if (!raw) return null;
      var config = JSON.parse(raw);
      var ai = config.ai || {};
      var keys = ai.keys || [];
      if (keys.length === 0) return null;

      var modelSelect = document.getElementById('ai-model-select');
      var model = (modelSelect && modelSelect.value) || ai.model || 'gpt-4o';
      if (model === 'custom') model = ai.customModel || 'gpt-4o';
      if (model === '') model = ai.model || 'gpt-4o';

      var endpoint = ai.endpoint || 'https://api.openai.com/v1/chat/completions';
      var apiKey = keys[0];
      var systemPrompt = resolvePrompt(ai);

      var contextParts = [];
      if (_currentFileContext) {
        contextParts.push('当前正在编辑的文件: ' + _currentFileContext);
        try {
          if (window.electronAPI && window.electronAPI.readFile) {
            var result = await window.electronAPI.readFile(_currentFileContext);
            if (result && result.success && result.content) {
              var content = result.content;
              if (content.length > 30000) content = content.substring(0, 30000) + '\n\n... [文件过大，已截断]';
              contextParts.push('当前文件内容:\n```\n' + content + '\n```');
            }
          }
        } catch(e) {}
      }
      if (contextParts.length > 0) systemPrompt += '\n\n' + contextParts.join('\n\n');

      return {
        endpoint: endpoint,
        model: model,
        apiKey: apiKey,
        systemPrompt: systemPrompt,
        maxTokens: ai.maxTokens || 4096,
        temperature: ai.temperature !== undefined ? ai.temperature : 0.7,
      };
    } catch(e) { return null; }
  }

  async function sendMessage() {
    if (_isStreaming) return;
    var input = document.getElementById('ai-input');
    var text = input.value.trim();
    if (!text) return;
    _lastUserMessage = text;

    var config = await getAIConfig();
    if (!config) { addSystemMessage(I18N.t('ai.needApiKey')); return; }

    addUserMessage(text);
    input.value = '';
    input.style.height = 'auto';
    startAIResponse(config, text);
  }

  function startAIResponse(config, userText) {
    _isStreaming = true;
    setStatus(I18N.t('ai.thinking'));
    setSendingState(true);

    var messages = [];
    messages.push({ role: 'system', content: config.systemPrompt });
    var history = _messages.slice(-20);
    for (var i = 0; i < history.length; i++) {
      var m = history[i];
      if (m.type === 'system') continue;
      messages.push({ role: m.role, content: m.content });
    }
    messages.push({ role: 'user', content: userText });

    var msgEl = addAIMessage('');
    _lastAIMessageEl = msgEl;

    if (window.electronAPI && window.electronAPI.ai) {
      window.electronAPI.ai.removeListeners();

      window.electronAPI.ai.onChunk(function(chunk) {
        var contentEl = msgEl.querySelector('.ai-msg-content');
        if (contentEl) {
          var text = contentEl.textContent + chunk;
          contentEl.textContent = text;
          parseFileOps(text, contentEl);
        }
        scrollToBottom();
      });

      window.electronAPI.ai.onDone(function(content) {
        _isStreaming = false;
        setStatus(I18N.t('status.ready'));
        setSendingState(false);

        _messages.push({ role: 'assistant', content: content, id: Date.now() });
        saveMessages();

        var contentEl = msgEl.querySelector('.ai-msg-content');
        if (contentEl) {
          contentEl.innerHTML = renderMarkdown(content);
          if (typeof Prism !== 'undefined') {
            try { Prism.highlightAllUnder(msgEl); } catch(e) {}
          }
        }

        var opsEl = msgEl.querySelector('.ai-msg-ops');
        if (opsEl) {
          opsEl.innerHTML = '<button class="ai-btn-regenerate cv-btn-secondary" style="padding:3px 10px;font-size:11px;">🔄 ' + escHtml(I18N.t('ai.regenerate')) + '</button>';
          opsEl.querySelector('.ai-btn-regenerate').onclick = regenerateLastResponse;
        }

        parseFileOps(content, contentEl || msgEl);
        renderFileOps();
        updateTokenCount();
        window.electronAPI.ai.removeListeners();
      });

      window.electronAPI.ai.onError(function(errMsg) {
        _isStreaming = false;
        setStatus(I18N.t('ai.error'));
        setSendingState(false);
        var contentEl = msgEl.querySelector('.ai-msg-content');
        if (contentEl) contentEl.innerHTML = '<span style="color:var(--color-error);">⚠️ ' + escHtml(localizeErr(errMsg)) + '</span>';
        window.electronAPI.ai.removeListeners();
      });

      window.electronAPI.ai.chat(config, messages).catch(function(err) {
        console.error('[AI] 请求失败:', err);
        _isStreaming = false;
        setStatus(I18N.t('ai.error'));
        setSendingState(false);
        var contentEl = msgEl.querySelector('.ai-msg-content');
        if (contentEl) contentEl.innerHTML = '<span style="color:var(--color-error);">⚠️ ' + escHtml(localizeErr(err)) + '</span>';
        window.electronAPI.ai.removeListeners();
      });
    } else {
      msgEl.querySelector('.ai-msg-content').textContent = '⚠️ ' + I18N.t('ai.apiUnavailable');
      _isStreaming = false;
      setStatus(I18N.t('ai.error'));
      setSendingState(false);
    }
  }

  function stopStreaming() {
    _isStreaming = false;
    setStatus(I18N.t('ai.stopped'));
    setSendingState(false);
    if (window.electronAPI && window.electronAPI.ai) window.electronAPI.ai.removeListeners();
  }

  // ============================================
  // 重新生成
  // ============================================

  function regenerateLastResponse() {
    if (_isStreaming || !_lastUserMessage) return;
    if (_messages.length > 0 && _messages[_messages.length - 1].role === 'assistant') {
      _messages.pop();
      saveMessages();
    }
    if (_lastAIMessageEl && _lastAIMessageEl.parentNode) _lastAIMessageEl.remove();
    _lastAIMessageEl = null;
    _fileOps = [];
    renderFileOps();

    getAIConfig().then(function(config) {
      if (!config) { addSystemMessage(I18N.t('ai.needApiKey')); return; }
      startAIResponse(config, _lastUserMessage);
    });
  }

  // ============================================
  // 文件操作解析
  // ============================================

  function parseFileOps(text) {
    _fileOps = [];
    var re, match;

    re = /```file:create\s+(\S+)\s*\n([\s\S]*?)```/g;
    while ((match = re.exec(text)) !== null) {
      _fileOps.push({ type: 'create', path: match[1].trim(), content: match[2].trim(), accepted: null });
    }

    re = /```file:edit\s+(\S+)\s*\n---ORIGINAL---\s*\n([\s\S]*?)---UPDATED---\s*\n([\s\S]*?)```/g;
    while ((match = re.exec(text)) !== null) {
      _fileOps.push({ type: 'edit', path: match[1].trim(), original: match[2].trim(), content: match[3].trim(), accepted: null });
    }

    re = /```file:delete\s+(\S+)\s*```/g;
    while ((match = re.exec(text)) !== null) {
      _fileOps.push({ type: 'delete', path: match[1].trim(), accepted: null });
    }

    renderFileOps();
  }

  function renderFileOps() {
    var container = document.getElementById('ai-file-ops');
    if (!container) return;
    var pending = _fileOps.filter(function(op) { return op.accepted === null; });
    if (pending.length === 0) { container.style.display = 'none'; container.innerHTML = ''; return; }

    container.style.display = 'block';
    var html = '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:6px;font-weight:600;">📁 ' + escHtml(I18N.t('ai.pendingOps', {count: pending.length})) + '</div>';

    for (var i = 0; i < pending.length; i++) {
      var op = pending[i];
      var typeLabel = op.type === 'create' ? I18N.t('ai.opCreate') : op.type === 'edit' ? I18N.t('ai.opEdit') : I18N.t('ai.opDelete');
      var typeColor = op.type === 'create' ? 'var(--color-success)' : op.type === 'edit' ? 'var(--color-warning)' : 'var(--color-error)';
      var fileName = op.path.split('/').pop();
      html += '\
<div class="ai-file-op" data-idx="' + i + '" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;margin-bottom:4px;background:var(--color-bg-tertiary);border-radius:6px;border-left:3px solid ' + typeColor + ';">\
  <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">\
    <span style="font-size:11px;font-weight:600;color:' + typeColor + ';">' + typeLabel + '</span>\
    <span style="font-size:12px;color:var(--color-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(fileName) + '</span>\
    <span style="font-size:10px;color:var(--color-text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(op.path) + '</span>\
  </div>\
  <div style="display:flex;gap:4px;flex-shrink:0;">\
    <button class="ai-op-view cv-btn-secondary" data-idx="' + i + '" style="padding:3px 8px;font-size:11px;">' + escHtml(I18N.t('ai.view')) + '</button>\
    <button class="ai-op-accept btn-success" data-idx="' + i + '" style="padding:3px 10px;font-size:11px;">' + escHtml(I18N.t('ai.accept')) + '</button>\
    <button class="ai-op-reject btn-danger" data-idx="' + i + '" style="padding:3px 10px;font-size:11px;">' + escHtml(I18N.t('ai.reject')) + '</button>\
  </div>\
</div>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.ai-op-view').forEach(function(btn) {
      btn.onclick = function() { viewFileOp(parseInt(this.dataset.idx)); };
    });
    container.querySelectorAll('.ai-op-accept').forEach(function(btn) {
      btn.onclick = function() { acceptFileOp(parseInt(this.dataset.idx)); };
    });
    container.querySelectorAll('.ai-op-reject').forEach(function(btn) {
      btn.onclick = function() { rejectFileOp(parseInt(this.dataset.idx)); };
    });
  }

  function viewFileOp(idx) {
    var ops = _fileOps.filter(function(op) { return op.accepted === null; });
    if (idx < 0 || idx >= ops.length) return;
    var op = ops[idx];
    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:200002;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
    var typeLabel = op.type === 'create' ? I18N.t('ai.opCreate') : op.type === 'edit' ? I18N.t('ai.opEdit') : I18N.t('ai.opDelete');
    var contentHtml = '';
    if (op.type === 'create') {
      contentHtml = '<pre style="background:var(--color-bg-primary);padding:12px;border-radius:6px;font-size:12px;max-height:300px;overflow:auto;white-space:pre-wrap;word-break:break-all;">' + escHtml(op.content) + '</pre>';
    } else if (op.type === 'edit') {
      contentHtml = '<div style="font-size:12px;margin-bottom:6px;color:var(--color-text-secondary);">' + escHtml(I18N.t('ai.original')) + ':</div><pre style="background:var(--color-bg-primary);padding:12px;border-radius:6px;font-size:12px;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-all;border-left:3px solid var(--color-error);">' + escHtml(op.original) + '</pre><div style="font-size:12px;margin:8px 0 6px;color:var(--color-text-secondary);">' + escHtml(I18N.t('ai.updated')) + ':</div><pre style="background:var(--color-bg-primary);padding:12px;border-radius:6px;font-size:12px;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-all;border-left:3px solid var(--color-success);">' + escHtml(op.content) + '</pre>';
    } else {
      contentHtml = '<div style="font-size:13px;color:var(--color-text-tertiary);padding:20px;text-align:center;">' + escHtml(I18N.t('ai.willDelete')) + '</div>';
    }
    modal.innerHTML = '\
<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:10px;padding:20px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;">\
  <h3 style="margin:0 0 4px;font-size:15px;">' + typeLabel + ': ' + escHtml(op.path) + '</h3>\
  ' + contentHtml + '\
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">\
    <button class="ai-op-accept btn-success" data-idx="' + idx + '" style="padding:6px 16px;font-size:12px;">' + escHtml(I18N.t('ai.accept')) + '</button>\
    <button class="ai-op-reject btn-danger" data-idx="' + idx + '" style="padding:6px 16px;font-size:12px;">' + escHtml(I18N.t('ai.reject')) + '</button>\
    <button class="ai-op-close cv-btn-secondary" style="padding:6px 16px;font-size:12px;">' + escHtml(I18N.t('common.close')) + '</button>\
  </div>\
</div>';
    document.body.appendChild(modal);
    modal.querySelector('.ai-op-close').onclick = function() { modal.remove(); };
    modal.querySelector('.ai-op-accept').onclick = function() { modal.remove(); acceptFileOp(idx); };
    modal.querySelector('.ai-op-reject').onclick = function() { modal.remove(); rejectFileOp(idx); };
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  }

  function acceptFileOp(idx) {
    var ops = _fileOps.filter(function(op) { return op.accepted === null; });
    if (idx < 0 || idx >= ops.length) return;
    ops[idx].accepted = true;
    executeFileOp(ops[idx]);
    renderFileOps();
  }

  function rejectFileOp(idx) {
    var ops = _fileOps.filter(function(op) { return op.accepted === null; });
    if (idx < 0 || idx >= ops.length) return;
    ops[idx].accepted = false;
    renderFileOps();
  }

  function executeFileOp(op) {
    if (!window.electronAPI) { addSystemMessage(I18N.t('ai.opFailedNoApi')); return; }
    var sepIdx = _currentFileContext ? Math.max(_currentFileContext.lastIndexOf('\\'), _currentFileContext.lastIndexOf('/')) : -1;
    var basePath = sepIdx >= 0 ? _currentFileContext.substring(0, sepIdx) : '';
    if (!basePath) { addSystemMessage(I18N.t('ai.openFileFirst')); return; }
    var fullPath = basePath.replace(/\\/g, '/') + '/' + op.path;

    if (op.type === 'create') {
      window.electronAPI.writeFile(fullPath, op.content).then(function(r) {
        addSystemMessage(r.success ? I18N.t('ai.created', {path: op.path}) : I18N.t('ai.createFailed', {msg: r.error || I18N.t('error.unknown')}));
      });
    } else if (op.type === 'edit') {
      window.electronAPI.writeFile(fullPath, op.content).then(function(r) {
        addSystemMessage(r.success ? I18N.t('ai.edited', {path: op.path}) : I18N.t('ai.editFailed', {msg: r.error || I18N.t('error.unknown')}));
      });
    } else if (op.type === 'delete') {
      window.electronAPI.deleteFile(fullPath).then(function(r) {
        addSystemMessage(r.success ? I18N.t('ai.deleted', {path: op.path}) : I18N.t('ai.deleteFailed', {msg: r.error || I18N.t('error.unknown')}));
      });
    }
  }

  // ============================================
  // 消息渲染
  // ============================================

  function addUserMessage(text) {
    _messages.push({ role: 'user', content: text, id: Date.now() });
    var container = document.getElementById('ai-messages');
    var div = document.createElement('div');
    div.className = 'ai-msg ai-msg-user';
    div.innerHTML = '<div class="ai-msg-avatar" style="background:var(--color-primary);flex-shrink:0;">U</div><div class="ai-msg-bubble" style="background:var(--color-bg-tertiary);"><div class="ai-msg-content">' + escHtml(text) + '</div></div>';
    container.appendChild(div);
    scrollToBottom();
    saveMessages();
  }

  function addAIMessage(text) {
    var container = document.getElementById('ai-messages');
    var div = document.createElement('div');
    div.className = 'ai-msg ai-msg-ai';
    div.innerHTML = '<div class="ai-msg-avatar" style="background:linear-gradient(135deg,color-mix(in srgb, var(--color-primary) 72%, #ffffff),var(--color-primary));flex-shrink:0;">AI</div><div class="ai-msg-bubble" style="background:var(--color-bg-primary);border:1px solid var(--color-border);"><div class="ai-msg-content">' + escHtml(text) + '</div><div class="ai-msg-ops" style="margin-top:6px;display:flex;gap:6px;"></div></div>';
    container.appendChild(div);
    scrollToBottom();
    return div;
  }

  function addSystemMessage(text) {
    var container = document.getElementById('ai-messages');
    var div = document.createElement('div');
    div.className = 'ai-msg ai-msg-system';
    div.style.cssText = 'text-align:center;font-size:12px;color:var(--color-text-tertiary);padding:4px 0;';
    div.textContent = text;
    container.appendChild(div);
    scrollToBottom();
  }

  function scrollToBottom() {
    var container = document.getElementById('ai-messages');
    if (container) container.scrollTop = container.scrollHeight;
  }

  function renderMessages(messages) {
    var container = document.getElementById('ai-messages');
    if (!container) return;
    container.innerHTML = '';
    if (!messages || messages.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--color-text-tertiary);font-size:14px;">💡 ' + escHtml(I18N.t('ai.emptyHint')) + '</div>';
      return;
    }
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (m.role === 'user') {
        var div = document.createElement('div');
        div.className = 'ai-msg ai-msg-user';
        div.innerHTML = '<div class="ai-msg-avatar" style="background:var(--color-primary);flex-shrink:0;">U</div><div class="ai-msg-bubble" style="background:var(--color-bg-tertiary);"><div class="ai-msg-content">' + escHtml(m.content) + '</div></div>';
        container.appendChild(div);
      } else if (m.role === 'assistant') {
        var div = document.createElement('div');
        div.className = 'ai-msg ai-msg-ai';
        div.innerHTML = '<div class="ai-msg-avatar" style="background:linear-gradient(135deg,color-mix(in srgb, var(--color-primary) 72%, #ffffff),var(--color-primary));flex-shrink:0;">AI</div><div class="ai-msg-bubble" style="background:var(--color-bg-primary);border:1px solid var(--color-border);"><div class="ai-msg-content">' + renderMarkdown(m.content) + '</div></div>';
        container.appendChild(div);
        if (typeof Prism !== 'undefined') {
          try { Prism.highlightAllUnder(div); } catch(e) {}
        }
      } else if (m.type === 'system') {
        var div = document.createElement('div');
        div.style.cssText = 'text-align:center;font-size:12px;color:var(--color-text-tertiary);padding:4px 0;';
        div.textContent = m.content;
        container.appendChild(div);
      }
    }
    updateTokenCount();
    scrollToBottom();
  }

  // ============================================
  // 持久化
  // ============================================

  function saveMessages() {
    try { localStorage.setItem('ai_chat_history', JSON.stringify(_messages.slice(-50))); } catch(e) {}
  }

  function loadMessages() {
    try {
      var raw = localStorage.getItem('ai_chat_history');
      if (raw) { _messages = JSON.parse(raw); return _messages; }
    } catch(e) {}
    return [];
  }

  function loadHistory() { renderMessages(_messages || []); }

  function clearConversation() {
    UI.confirm({ message: I18N.t('ai.clearConfirm') }).then(function(ok) {
      if (!ok) return;
      doClearConversation();
    });
  }

  function doClearConversation() {
    _messages = [];
    _lastUserMessage = '';
    _lastAIMessageEl = null;
    localStorage.removeItem('ai_chat_history');
    renderMessages([]);
    _fileOps = [];
    renderFileOps();
    addSystemMessage(I18N.t('ai.cleared'));
  }

  // ============================================
  // UI 状态
  // ============================================

  function setStatus(text) {
    var el = document.getElementById('ai-status');
    if (el) el.textContent = text ? '· ' + text : '';
  }

  function setSendingState(isSending) {
    var sendBtn = document.getElementById('ai-btn-send');
    var stopBtn = document.getElementById('ai-btn-stop');
    var input = document.getElementById('ai-input');
    if (sendBtn) sendBtn.style.display = isSending ? 'none' : '';
    if (stopBtn) stopBtn.style.display = isSending ? '' : 'none';
    if (input) input.disabled = isSending;
    if (input && !isSending) input.focus();
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 本地化主进程传来的错误: 支持 {key, params, fallback} 对象或包裹 JSON 的字符串
  function localizeErr(err) {
    var obj = null;
    if (err && typeof err === 'object' && !(err instanceof Error)) {
      obj = err;
    } else if (typeof err === 'string') {
      var m = err.match(/\{[\s\S]*\}$/);
      if (m) { try { obj = JSON.parse(m[0]); } catch(e) {} }
    } else if (err instanceof Error) {
      var m2 = err.message.match(/\{[\s\S]*\}$/);
      if (m2) { try { obj = JSON.parse(m2[0]); } catch(e) {} }
    }
    if (obj) {
      if (obj.key) return I18N.t(obj.key, obj.params || {});
      if (obj.fallback) return obj.fallback;
      if (obj.message) return obj.message;
      if (obj.error) return obj.error;
    }
    return String(err || '');
  }

  // ============================================
  // 初始化
  // ============================================

  return {
    open: open,
    close: close,
    setFileContext: setFileContext,
  };
})();
