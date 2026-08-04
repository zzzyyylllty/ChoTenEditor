// ============================================
// 弹窗模式（嵌入主窗口 iframe）
// ============================================

// 用户是否实际修改过设置：beforeunload/关闭弹窗时避免用陈旧的 UI 状态全量覆盖配置
// （iframe 每次打开都会重载, 期间主页面可能已写入 theme/ai 等字段, 无改动时保存会丢失这些并发写入）
let _settingsDirty = false;
document.addEventListener('change', function () { _settingsDirty = true; }, true);
document.addEventListener('input', function () { _settingsDirty = true; }, true);

const IS_EMBEDDED = window.self !== window.top;

if (IS_EMBEDDED) {
  document.body.classList.add('embedded');
  // 父页面关闭弹窗前会通知保存（弹窗关闭不触发 beforeunload）
  // 保存完成后回复父页面，等它关闭弹窗，避免异步操作（如密码哈希）未完成
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    if (e.data && e.data.type === 'saveSettings') {
      Promise.resolve(_settingsDirty ? saveSettings() : Promise.resolve()).catch(() => {}).then(() => {
        window.parent.postMessage({ type: 'settingsSaved' }, '*');
      });
    }
  });
}

// ============================================
// 延迟初始化DOM元素
// ============================================

let themeSelect;
let backBtn;
let saveBtn;
let resetBtn;
let exportBtn;
let importBtn;
let importFile;
let colorInputs = {};
let presetBtns = [];

// 编辑器设置
let editorFontSize;
let editorTabSize;
let editorLineNumbers;
let editorLineWrapping;
let editorTheme;
let editorAutoSync;
let editorDevtools;
let checkboxMarkOn;
let checkboxMarkOff;
let hidePremiumHints;
let hideVersionHints;
let itemKeyStyle;
let uiFont;
let editorFontFamily;
let prewarmFiles;
let prewarmFilesMax;
let prewarmKether;

// 积木块显示
let blockFontSize;
let catColorInputs = {};

// 快捷键设置
let shortcutInputs = {};
let resetShortcutsBtn;
let editShortcutsBtn;
let _scRecording = null;

// 切换快捷键编辑模式 (编辑按钮文案随 i18n 语言切换)
function setShortcutEditing(on) {
  document.body.classList.toggle('sc-editing', on);
  if (!on) {
    _scRecording = null;
    document.querySelectorAll('.sc-recording').forEach((el) => el.classList.remove('sc-recording'));
  }
  if (editShortcutsBtn) {
    editShortcutsBtn.textContent = on ? I18N.t('settings.editShortcutDone') : I18N.t('settings.editShortcuts');
  }
}

// 远程设置
let remotePassword;
let remoteAllowDifferentVersions;

// 实验性功能
let experimentalRemote;
let experimentalAIStudio;

// AI 设置
let aiEndpoint;
let aiModel;
let aiCustomModel;
let aiCustomModelGroup;
let aiKeysList;
let aiNewKey;
let aiAddKeyBtn;
let aiSystemPrompt;
let aiCustomPrompt;
let aiCustomPromptGroup;
let aiMaxTokens;
let aiTemperature;
let aiPromptList;
let aiNewPromptName;
let aiNewPromptDesc;
let aiSavePromptBtn;
let aiPromptInfo;

// 背景图片
let bgGrid;
let bgOpacity;
let bgOpacityValue;
let bgUploadBtn;
let bgAppPath = '';
let bgImages = [];

// 默认配置
const defaultConfig = {
  theme: 'dark',
  itemKeyStyle: 'snake',
  uiFont: '',
  colors: {
    primary: '#0098ff',
    success: '#00c853',
    warning: '#ffd600',
    error: '#ff1744',
    bgPrimary: '#000000',
    bgSecondary: '#080808',
    textPrimary: '#e0e0e0',
    textSecondary: '#9e9e9e',
    syntaxKeyword: '#569cd6',
    syntaxString: '#ce9178',
    syntaxNumber: '#b5cea8',
    syntaxComment: '#6a9955',
    syntaxFunction: '#dcdcaa',
    syntaxOperator: '#d4d4d4',
    syntaxPunctuation: '#d4d4d4',
    syntaxProperty: '#9cdcfe',
    checkboxOff: '#ff1744',
    checkboxOn: '#00c853',
  },
  editor: {
    fontSize: '14',
    tabSize: '4',
    lineNumbers: true,
    lineWrapping: true,
    theme: 'dracula',
    fontFamily: '',
  },
  autoSync: false,
  checkboxMarkOn: true,
  checkboxMarkOff: false,
  hidePremiumHints: false,
  hideVersionHints: false,
  blockFontSize: '11',
  categoryColors: {
    '实体操作': '#c06262',
    '数据与变量': '#5edf85',
    '文本与运算': '#437a32',
    '游戏机制': '#1566d1',
    '系统管理': '#430000',
    '逻辑判断': '#ddb271',
    '世界与坐标': '#59745d',
    '物品管理': '#615432',
    '脚本控制': '#d115a8',
    '界面与显示': '#3e5255',
    '时间与日期': '#1a182c',
    '基本': '#6b7475',
  },
  shortcuts: {
    save: 'Ctrl+S',
    newFile: 'Ctrl+N',
    openProject: 'Ctrl+O',
    toggleMode: 'F2',
  },
  background: {
    filename: '',
    opacity: 0.3,
  },
  remotePasswordHash: '',
  allowDifferentVersions: false,
  devTools: false,
  experimental: {
    remote: false,
    aiStudio: false,
  },
  prewarm: {
    files: true,
    filesMaxMb: 50,
    kether: true,
  },
  ai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    customModel: '',
    keys: [],
    systemPrompt: 'default',
    customPrompt: '',
    maxTokens: 4096,
    temperature: 0.7,
  },
};

// 预设主题配置
const presetThemes = {
  'dark-default': {
    theme: 'dark',
    colors: {
      primary: '#0098ff',
      success: '#00c853',
      warning: '#ffd600',
      error: '#ff1744',
      bgPrimary: '#000000',
      bgSecondary: '#080808',
      textPrimary: '#e0e0e0',
      textSecondary: '#9e9e9e',
      syntaxKeyword: '#569cd6',
      syntaxString: '#ce9178',
      syntaxNumber: '#b5cea8',
      syntaxComment: '#6a9955',
      syntaxFunction: '#dcdcaa',
      syntaxOperator: '#d4d4d4',
      syntaxPunctuation: '#d4d4d4',
      syntaxProperty: '#9cdcfe',
    },
  },
  'light-clean': {
    theme: 'light',
    colors: {
      primary: '#0066cc',
      success: '#107c10',
      warning: '#ffb900',
      error: '#e81123',
      bgPrimary: '#ffffff',
      bgSecondary: '#f3f3f3',
      textPrimary: '#333333',
      textSecondary: '#666666',
      syntaxKeyword: '#569cd6',
      syntaxString: '#ce9178',
      syntaxNumber: '#b5cea8',
      syntaxComment: '#6a9955',
      syntaxFunction: '#dcdcaa',
      syntaxOperator: '#d4d4d4',
      syntaxPunctuation: '#d4d4d4',
      syntaxProperty: '#9cdcfe',
    },
  },
  dracula: {
    theme: 'dark',
    colors: {
      primary: '#bd93f9',
      success: '#50fa7b',
      warning: '#f1fa8c',
      error: '#ff5555',
      bgPrimary: '#282a36',
      bgSecondary: '#21222c',
      textPrimary: '#f8f8f2',
      textSecondary: '#6272a4',
      syntaxKeyword: '#ff79c6',
      syntaxString: '#f1fa8c',
      syntaxNumber: '#bd93f9',
      syntaxComment: '#6272a4',
      syntaxFunction: '#50fa7b',
      syntaxOperator: '#ff79c6',
      syntaxPunctuation: '#f8f8f2',
      syntaxProperty: '#8be9fd',
    },
  },
  nord: {
    theme: 'dark',
    colors: {
      primary: '#88c0d0',
      success: '#a3be8c',
      warning: '#ebcb8b',
      error: '#bf616a',
      bgPrimary: '#2e3440',
      bgSecondary: '#3b4252',
      textPrimary: '#eceff4',
      textSecondary: '#d08770',
      syntaxKeyword: '#81a1c1',
      syntaxString: '#a3be8c',
      syntaxNumber: '#b48ead',
      syntaxComment: '#616e88',
      syntaxFunction: '#88c0d0',
      syntaxOperator: '#81a1c1',
      syntaxPunctuation: '#d8dee9',
      syntaxProperty: '#8fbcbb',
    },
  },
  solarized: {
    theme: 'dark',
    colors: {
      primary: '#268bd2',
      success: '#859900',
      warning: '#b58900',
      error: '#dc322f',
      bgPrimary: '#002b36',
      bgSecondary: '#073642',
      textPrimary: '#839496',
      textSecondary: '#586e75',
      syntaxKeyword: '#268bd2',
      syntaxString: '#2aa198',
      syntaxNumber: '#d33682',
      syntaxComment: '#586e75',
      syntaxFunction: '#b58900',
      syntaxOperator: '#859900',
      syntaxPunctuation: '#839496',
      syntaxProperty: '#cb4b16',
    },
  },
};

// ============================================
// DOM加载完成后初始化
// ============================================

document.addEventListener('DOMContentLoaded', async () => {

  await I18N.ready;

  // 初始化DOM元素
  initializeDOMElements();


  // 设置事件监听
  setupEventListeners();

  // 选项卡导航
  initTabNavigation();


});

// ============================================
// 初始化DOM元素
// ============================================

function initializeDOMElements() {
  
  themeSelect = document.getElementById('theme');
  backBtn = document.getElementById('back-btn');
  saveBtn = document.getElementById('save-settings');
  resetBtn = document.getElementById('reset-settings');
  exportBtn = document.getElementById('export-settings');
  importBtn = document.getElementById('import-settings');
  importFile = document.getElementById('import-file');

  // 颜色输入
  colorInputs = {
    primary: document.getElementById('color-primary'),
    success: document.getElementById('color-success'),
    warning: document.getElementById('color-warning'),
    error: document.getElementById('color-error'),
    bgPrimary: document.getElementById('color-bg-primary'),
    bgSecondary: document.getElementById('color-bg-secondary'),
    textPrimary: document.getElementById('color-text-primary'),
    textSecondary: document.getElementById('color-text-secondary'),
    'syntax-keyword': document.getElementById('color-syntax-keyword'),
    'syntax-string': document.getElementById('color-syntax-string'),
    'syntax-number': document.getElementById('color-syntax-number'),
    'syntax-comment': document.getElementById('color-syntax-comment'),
    'syntax-function': document.getElementById('color-syntax-function'),
    'syntax-operator': document.getElementById('color-syntax-operator'),
    'syntax-punctuation': document.getElementById('color-syntax-punctuation'),
    'syntax-property': document.getElementById('color-syntax-property'),
    checkboxOff: document.getElementById('color-checkbox-off'),
    checkboxOn: document.getElementById('color-checkbox-on'),
  };

  // 预设按钮
  presetBtns = document.querySelectorAll('.preset-btn');

  // 编辑器设置
  editorFontSize = document.getElementById('editor-font-size');
  editorTabSize = document.getElementById('editor-tab-size');
  editorLineNumbers = document.getElementById('editor-line-numbers');
  editorLineWrapping = document.getElementById('editor-line-wrapping');
  editorTheme = document.getElementById('editor-theme');
  editorAutoSync = document.getElementById('editor-auto-sync');
  itemKeyStyle = document.getElementById('item-key-style');
  uiFont = document.getElementById('ui-font');
  editorFontFamily = document.getElementById('editor-font-family');

  // 积木块显示
  blockFontSize = document.getElementById('block-font-size');
  catColorInputs = {};
  document.querySelectorAll('.cat-color').forEach(el => {
    catColorInputs[el.dataset.cat] = el;
  });

  // 快捷键输入
  shortcutInputs = {
    save: document.getElementById('shortcut-save'),
    newFile: document.getElementById('shortcut-new-file'),
    openProject: document.getElementById('shortcut-open-project'),
    toggleMode: document.getElementById('shortcut-toggle-mode'),
  };

  // 背景图片
  bgGrid = document.getElementById('bg-grid');
  bgOpacity = document.getElementById('bg-opacity');
  bgOpacityValue = document.getElementById('bg-opacity-value');
  bgUploadBtn = document.getElementById('bg-upload-btn');

  // 远程设置
  remotePassword = document.getElementById('remote-password');
  remoteAllowDifferentVersions = document.getElementById('remote-allow-different-versions');

  // 实验性功能
  experimentalRemote = document.getElementById('experimental-remote');
  experimentalAIStudio = document.getElementById('experimental-ai-studio');

  // 开发者工具
  editorDevtools = document.getElementById('editor-devtools');

  // 复选框设置
  checkboxMarkOn = document.getElementById('checkbox-mark-on');
  checkboxMarkOff = document.getElementById('checkbox-mark-off');
  hidePremiumHints = document.getElementById('hide-premium-hints');
  hideVersionHints = document.getElementById('hide-version-hints');

  // AI 设置
  aiEndpoint = document.getElementById('ai-endpoint');
  aiModel = document.getElementById('ai-model');
  aiCustomModel = document.getElementById('ai-custom-model');
  aiCustomModelGroup = document.getElementById('ai-custom-model-group');
  aiKeysList = document.getElementById('ai-keys-list');
  aiNewKey = document.getElementById('ai-new-key');
  aiAddKeyBtn = document.getElementById('ai-add-key');
  aiSystemPrompt = document.getElementById('ai-system-prompt');
  aiCustomPrompt = document.getElementById('ai-custom-prompt');
  aiCustomPromptGroup = document.getElementById('ai-custom-prompt-group');
  aiMaxTokens = document.getElementById('ai-max-tokens');
  aiTemperature = document.getElementById('ai-temperature');
  aiPromptList = document.getElementById('ai-prompt-list');
  aiNewPromptName = document.getElementById('ai-new-prompt-name');
  aiNewPromptDesc = document.getElementById('ai-new-prompt-desc');
  aiSavePromptBtn = document.getElementById('ai-save-prompt');
  aiPromptInfo = document.getElementById('ai-prompt-info');

  // 启动预热
  prewarmFiles = document.getElementById('prewarm-files');
  prewarmFilesMax = document.getElementById('prewarm-files-max');
  prewarmKether = document.getElementById('prewarm-kether');

}

// ============================================
// 选项卡导航
// ============================================

function initTabNavigation() {
  const navItems = document.querySelectorAll('.settings-nav-item');
  const panels = document.querySelectorAll('.settings-panel');
  const panelsContainer = document.querySelector('.settings-panels');
  if (!navItems.length || !panels.length) return;

  function switchTab(tab) {
    navItems.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    panels.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tab);
    });
    if (panelsContainer) panelsContainer.scrollTop = 0;
    sessionStorage.setItem('settingsActiveTab', tab);
  }

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      playSound('click');
      switchTab(btn.dataset.tab);
    });
  });

  // 恢复上次打开的选项卡
  const saved = sessionStorage.getItem('settingsActiveTab');
  if (saved && document.querySelector('.settings-nav-item[data-tab="' + saved + '"]')) {
    switchTab(saved);
  }
}

// ============================================
// 事件监听设置
// ============================================

function setupEventListeners() {

  // 主题选择
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      playSound('click');
      applyTheme(e.target.value);
      updateColorInputs();
    });
  }

  // 字体选择（实时预览）
  if (uiFont) {
    uiFont.addEventListener('change', () => { playSound('click'); applyFonts(); });
  }
  if (editorFontFamily) {
    editorFontFamily.addEventListener('change', () => { playSound('click'); applyFonts(); });
  }

  // 返回按钮
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      playSound('back');
      if (IS_EMBEDDED) {
        // 弹窗模式：通知父页面关闭弹窗
        window.parent.postMessage({ type: 'closeSettings' }, '*');
      } else {
        window.location.href = 'index.html?fromSettings=1';
      }
    });
  }

  // 颜色输入
  Object.values(colorInputs).forEach((input) => {
    if (input) {
      input.addEventListener('input', (e) => {
        updateCSSVariable(e.target.id, e.target.value);
        updateColorValue(e.target.id);
      });
      input.addEventListener('change', () => { playSound('click'); });
    }
  });

  // 分类颜色输入
  Object.values(catColorInputs).forEach((input) => {
    if (input) {
      input.addEventListener('input', (e) => {
        const valueEl = document.getElementById('cat-' + e.target.dataset.cat + '-value');
        if (valueEl) valueEl.textContent = e.target.value.toUpperCase();
      });
      input.addEventListener('change', () => { playSound('click'); });
    }
  });

  // 保存按钮
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      playSound('save');
      setShortcutEditing(false);
      await saveSettings();
    });
  }

  // 重置按钮
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      playSound('update');
      resetSettings();
    });
  }

  // 导出按钮
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      playSound('click');
      exportSettings();
    });
  }

  // 导入按钮
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      playSound('click');
      if (importFile) {
        importFile.click();
      }
    });
  }

  // 导入文件
  if (importFile) {
    importFile.addEventListener('change', importSettings);
  }

  // 预设主题
  if (presetBtns && presetBtns.length > 0) {
    presetBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        playSound('click');
        const preset = e.target.dataset.preset;
        applyPreset(preset);
      });
    });
  }

  // 背景图片
  if (bgOpacity) {
    bgOpacity.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (bgOpacityValue) bgOpacityValue.textContent = val.toFixed(2);
      applyBackgroundPreview();
    });
  }

  if (bgUploadBtn) {
    bgUploadBtn.addEventListener('click', () => { playSound('click'); uploadBackground(); });
  }

  // "无背景"点击
  const noneItem = document.querySelector('.bg-none-item');
  if (noneItem) {
    noneItem.addEventListener('click', () => { playSound('close'); selectBackground(''); });
  }

  // 快捷键按钮
  const resetShortcutBtn = document.getElementById('reset-shortcuts');
  if (resetShortcutBtn) {
    resetShortcutBtn.addEventListener('click', () => {
      playSound('update');
      setShortcutEditing(false);
      const defs = defaultConfig.shortcuts;
      Object.entries(shortcutInputs).forEach(([k, v]) => {
        if (v && defs[k]) {
          v.value = defs[k];
          v.classList.remove('sc-conflict');
          v.title = '';
        }
      });
    });
  }
  const editShortcutBtn = document.getElementById('edit-shortcuts');
  if (editShortcutBtn) {
    editShortcutBtn.addEventListener('click', () => {
      playSound('click');
      setShortcutEditing(!document.body.classList.contains('sc-editing'));
    });
  }
  // 编辑模式下点击输入框进入录制状态
  Object.values(shortcutInputs).forEach((input) => {
    if (!input) return;
    input.addEventListener('click', () => {
      if (!document.body.classList.contains('sc-editing')) return;
      playSound('click');
      document.querySelectorAll('.sc-recording').forEach((el) => el.classList.remove('sc-recording'));
      _scRecording = input;
      input.classList.add('sc-recording');
      input.title = I18N.t('settings.shortcutHint');
    });
  });
  // 录制: 按组合键写入输入框
  document.addEventListener('keydown', (e) => {
    if (!_scRecording) return;
    e.preventDefault();
    e.stopPropagation();
    const k = e.key;
    if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta' || k === 'Escape') {
      if (k === 'Escape') {
        _scRecording.classList.remove('sc-recording');
        _scRecording = null;
      }
      return;
    }
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Meta');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    parts.push(k.length === 1 ? k.toUpperCase() : k);
    const combo = parts.join('+');
    _scRecording.value = combo;
    _scRecording.classList.remove('sc-recording');
    // 冲突检测 (与其他快捷键相同则提示)
    let conflict = null;
    Object.entries(shortcutInputs).forEach(([ck, v]) => {
      if (v && v !== _scRecording && v.value === combo) conflict = ck;
    });
    _scRecording.classList.toggle('sc-conflict', !!conflict);
    _scRecording.title = conflict ? I18N.t('settings.shortcutConflict', { name: conflict }) : '';
    if (conflict) playSound('error');
    _scRecording = null;
  });

  // AI 模型切换
  if (aiModel) {
    aiModel.addEventListener('change', function() {
      if (aiCustomModelGroup) {
        aiCustomModelGroup.style.display = this.value === 'custom' ? '' : 'none';
      }
    });
  }

  // AI 提示词切换
  var _promptEditBackup = null;
  if (aiSystemPrompt) {
    aiSystemPrompt.addEventListener('change', function() {
      var val = this.value;
      if (val === 'custom') {
        if (aiCustomPromptGroup) aiCustomPromptGroup.style.display = '';
        // 切回自定义时恢复用户编辑的内容,避免被磁盘提示词预览覆盖
        if (_promptEditBackup !== null && aiCustomPrompt) {
          aiCustomPrompt.value = _promptEditBackup;
          _promptEditBackup = null;
        }
      } else {
        if (aiCustomPromptGroup) aiCustomPromptGroup.style.display = 'none';
        // 备份用户当前编辑内容
        if (aiCustomPrompt && _promptEditBackup === null) _promptEditBackup = aiCustomPrompt.value;
        // 从磁盘加载该提示词内容预览
        if (window.electronAPI && window.electronAPI.ai && window.electronAPI.ai.loadPrompts) {
          window.electronAPI.ai.loadPrompts().then(function(result) {
            if (result.success && result.prompts[val]) {
              if (aiCustomPrompt) aiCustomPrompt.value = result.prompts[val].content || '';
            }
          });
        }
      }
      updatePromptInfo(val, null, null);
      // 重新获取 diskPrompts 更新信息
      if (window.electronAPI && window.electronAPI.ai && window.electronAPI.ai.loadPrompts) {
        window.electronAPI.ai.loadPrompts().then(function(result) {
          if (result.success) {
            var cfg2 = getFullConfig();
            updatePromptInfo(val, result.prompts, (cfg2.ai && cfg2.ai.customPrompts) || {});
          }
        });
      }
    });
  }

  // AI 保存自定义提示词
  if (aiSavePromptBtn) {
    aiSavePromptBtn.addEventListener('click', function() {
      var name = aiNewPromptName ? aiNewPromptName.value.trim() : '';
      var content = aiCustomPrompt ? aiCustomPrompt.value.trim() : '';
      if (!name) { showNotification(I18N.t('settings.promptNameRequired'), 'error'); return; }
      if (!content) { showNotification(I18N.t('settings.promptContentRequired'), 'error'); return; }
      if (window.electronAPI && window.electronAPI.ai && window.electronAPI.ai.saveUserPrompt) {
        window.electronAPI.ai.saveUserPrompt(name, content).then(function(result) {
          if (result.success) {
            showNotification(I18N.t('settings.promptSaved'), 'success');
            loadAiPromptList();
          } else {
            showNotification(I18N.t('settings.promptSaveFailed', {msg: result.error || ''}), 'error');
          }
        });
      } else {
        // fallback: 保存到 localStorage
        var cfg = getFullConfig();
        if (!cfg.ai) cfg.ai = {};
        cfg.ai.customPrompts = cfg.ai.customPrompts || {};
        cfg.ai.customPrompts[name] = { desc: aiNewPromptDesc ? aiNewPromptDesc.value.trim() : '', content: content };
        localStorage.setItem('editorConfig', JSON.stringify(cfg));
        showNotification(I18N.t('settings.promptSavedLocal'), 'success');
        loadAiPromptList();
      }
    });
  }

  // AI 添加密钥
  if (aiAddKeyBtn) {
    aiAddKeyBtn.addEventListener('click', function() {
      var key = aiNewKey ? aiNewKey.value.trim() : '';
      if (!key) { showNotification(I18N.t('settings.keyRequired'), 'error'); return; }
      var config = getFullConfig();
      var keys = config.ai && config.ai.keys ? config.ai.keys : [];
      if (keys.includes(key)) { showNotification(I18N.t('settings.keyExists'), 'error'); return; }
      keys.push(key);
      if (!config.ai) config.ai = {};
      config.ai.keys = keys;
      localStorage.setItem('editorConfig', JSON.stringify(config));
      if (aiNewKey) aiNewKey.value = '';
      renderAiKeys(keys);
      showNotification(I18N.t('settings.keyAdded'), 'success');
    });
    aiNewKey && aiNewKey.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && aiAddKeyBtn) aiAddKeyBtn.click();
    });
  }

  // 语言切换
  var langSelect = document.getElementById('language');
  if (langSelect) {
    langSelect.value = I18N.lang;
    langSelect.addEventListener('change', function() {
      playSound('click');
      I18N.setLang(this.value);
      // 嵌入模式: 通知主窗口整页重载应用新语言 (否则语言只对设置页生效)
      if (window.self !== window.top) {
        window.parent.postMessage({ type: 'langChanged' }, '*');
      }
      location.reload();
    });
  }

  // 反馈按钮
  document.querySelectorAll('.feedback-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      playSound('click');
      var url = this.dataset.url;
      if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    });
  });

}

// ============================================
// 主题应用
// ============================================

// auto 主题: 跟随系统 prefers-color-scheme
function resolveTheme(t) {
  if (t === 'auto') {
    try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  }
  return t || 'dark';
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', resolveTheme(theme));
}

// 系统主题切换时自动重新应用 (仅 auto 模式)
try {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
    const t = themeSelect ? themeSelect.value : '';
    if (t === 'auto') applyTheme('auto');
  });
} catch (e) {}

function applyPreset(presetName) {
  
  const preset = presetThemes[presetName];
  if (!preset) {
    console.error('[SETTINGS] 预设不存在!', presetName);
    return;
  }

  // 更新主题
  if (themeSelect) {
    themeSelect.value = preset.theme;
  }
  applyTheme(preset.theme);

  // 更新颜色
  Object.entries(preset.colors).forEach(([key, value]) => {
    const inputId = `color-${camelToKebab(key)}`;
    const input = document.getElementById(inputId);
    if (input) {
      input.value = value;
      // 直接传入 inputId，不要再做转换
      updateCSSVariable(inputId, value);
      updateColorValue(inputId);
    }
  });

  updatePresetButtonState(presetName);
  // 程序化赋值不触发 change/input 事件, 需手动标记, 否则关闭设置时更改丢失
  _settingsDirty = true;
}

function updatePresetButtonState(activePreset) {
  presetBtns.forEach((btn) => {
    if (btn.dataset.preset === activePreset) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// ============================================
// 颜色管理
// ============================================
function updateCSSVariable(inputId, value) {
  const cssVarName = `--color-${inputId.replace('color-', '')}`;
  // 生成: --color-primary, --color-bg-primary 等
  document.documentElement.style.setProperty(cssVarName, value);
}

function updateColorValue(inputId) {
  const valueEl = document.getElementById(`${inputId}-value`);
  const input = document.getElementById(inputId);
  if (valueEl && input) {
    valueEl.textContent = input.value.toUpperCase();
  }
}

function updateColorValues() {
  Object.keys(colorInputs).forEach((key) => {
    const inputId = `color-${camelToKebab(key)}`;
    updateColorValue(inputId);
  });
}

function updateColorInputs() {
  // 根据主题更新颜色输入框：清除自定义覆盖，恢复当前主题默认色，
  // 避免保存的 colors 里残留旧主题色值（否则重启后被锁死导致主题切换失效）
  Object.entries(colorInputs).forEach(([key, input]) => {
    if (!input) return;
    const cssVarName = `--color-${camelToKebab(key)}`;
    document.documentElement.style.removeProperty(cssVarName);
    const val = getComputedStyle(document.body).getPropertyValue(cssVarName).trim();
    if (val) {
      input.value = val;
      updateColorValue(input.id);
    }
  });
}

// 应用复选框标记显示开关 (body class: cb-mark-on 选中√ / cb-mark-off 未选中X)
// 选中√默认显示 (checkboxMarkOn 缺省视为 true), 可在设置里关闭
function applyCheckboxMarks(config) {
  const on = config.checkboxMarkOn !== false;
  const off = config.checkboxMarkOff === true;
  document.body.classList.toggle('cb-mark-on', on);
  document.body.classList.toggle('cb-mark-off', off);
}

// 高级版专属功能提示开关 (body class: ce-hide-premium-hints)
// 勾选后 tooltip 不再显示高级版专属红色提示行
function applyPremiumHint(config) {
  document.body.classList.toggle('ce-hide-premium-hints', config.hidePremiumHints === true);
}

// 版本限制提示开关 (body class: ce-hide-version-hints)
// 勾选后 tooltip 不再显示绿色版本限制提示行
function applyVersionHint(config) {
  document.body.classList.toggle('ce-hide-version-hints', config.hideVersionHints === true);
}

// 字体名 → CSS font-family (含空格/引号的单 family 自动加引号; 已有 CSS 列表保持原样)
function normalizeFontFamily(name) {
  name = (name || '').trim();
  if (!name) return '';
  if (name.indexOf(',') !== -1) return name;
  return /[\s"']/.test(name) ? "'" + name + "'" : name;
}

// CSS font-family → 显示名 (去首尾引号, 便于输入框回显)
function displayFontName(v) {
  if (!v) return '';
  if (v.indexOf(',') !== -1) return v;
  return v.replace(/^['"]|['"]$/g, '');
}

// 应用字体（实时预览，读取输入框当前值）
function applyFonts() {
  var ui = uiFont ? normalizeFontFamily(uiFont.value) : '';
  document.body.style.fontFamily = ui;
  var ed = editorFontFamily ? normalizeFontFamily(editorFontFamily.value) : '';
  document.documentElement.style.setProperty('--editor-font', ed || "'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace");
}

// ============================================
// 背景图片管理
// ============================================

async function loadBackgroundList() {
  if (!bgGrid) return;
  if (!bgAppPath) {
    // 获取应用路径
    try {
      if (window.electronAPI && window.electronAPI.getAppPath) {
        bgAppPath = await window.electronAPI.getAppPath();
      }
    } catch (e) {
      console.warn('[SETTINGS] 无法获取应用路径:', e);
      return;
    }
  }
  if (!bgAppPath) return;

  bgImages = [];

  // 读取 background 目录
  try {
    const result = await window.electronAPI.readdir(bgAppPath + '\\background');
    if (result.success) {
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
      bgImages = result.files
        .filter(f => {
          const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'));
          return !f.isDirectory && imageExts.includes(ext);
        })
        .map(f => f.name);
      bgImages.sort();
    }
  } catch (e) {
    console.warn('[SETTINGS] 读取背景目录失败:', e);
  }

  // 渲染背景网格
  renderBackgroundGrid();
}

function renderBackgroundGrid() {
  if (!bgGrid) return;
  // 保留"无背景"项
  const noneItem = bgGrid.querySelector('.bg-none-item');

  // 移除所有非"无背景"项
  bgGrid.querySelectorAll('.bg-grid-item:not(.bg-none-item)').forEach(el => el.remove());

  // 添加图片项
  bgImages.forEach(filename => {
    const item = document.createElement('div');
    item.className = 'bg-grid-item';
    item.dataset.bg = filename;

    const thumb = document.createElement('div');
    thumb.className = 'bg-thumb';
    thumb.style.backgroundImage = 'url(background/' + encodeURI(filename) + ')';

    const name = document.createElement('span');
    name.className = 'bg-name';
    name.textContent = filename;

    item.appendChild(thumb);
    item.appendChild(name);
    item.addEventListener('click', () => { playSound('click'); selectBackground(filename); });

    bgGrid.appendChild(item);
  });

  // 恢复选中状态
  const saved = getBackgroundConfig();
  if (saved && saved.filename) {
    highlightSelected(saved.filename);
  }
}

function getBackgroundConfig() {
  const stored = localStorage.getItem('editorConfig');
  if (!stored) return null;
  try {
    const config = JSON.parse(stored);
    return config.background || null;
  } catch { return null; }
}

function saveBackgroundConfig(filename, opacity) {
  try {
    const stored = localStorage.getItem('editorConfig');
    const config = stored ? JSON.parse(stored) : { theme: 'dark', colors: {} };
    if (!config.background) config.background = {};
    config.background.filename = filename || '';
    if (opacity !== undefined) config.background.opacity = opacity;
    localStorage.setItem('editorConfig', JSON.stringify(config));
  } catch (e) {
    console.warn('保存背景配置失败', e);
  }
}

function selectBackground(filename) {
  // 更新高亮
  highlightSelected(filename);

  // 保存
  const opacity = bgOpacity ? parseFloat(bgOpacity.value) : 0.3;
  saveBackgroundConfig(filename, opacity);

  // 预览
  applyBackgroundPreview();
}

function highlightSelected(filename) {
  bgGrid.querySelectorAll('.bg-grid-item').forEach(el => {
    if (el.dataset.bg === filename) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

function applyBackgroundPreview() {
  const saved = getBackgroundConfig();
  const filename = saved && saved.filename ? saved.filename : '';
  const themeSelectEl = document.getElementById('theme');
  let theme = themeSelectEl ? themeSelectEl.value : 'dark';
  // auto 主题按系统实际主题渲染预览, 避免设置页预览与主界面不一致
  if (theme === 'auto') {
    try { theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { theme = 'dark'; }
  }

  if (filename) {
    const alpha = String(Math.round((1 - (bgOpacity ? parseFloat(bgOpacity.value) : (saved ? saved.opacity : 0.3))) * 60) / 100);
    const bgColor = theme === 'light' ? 'rgba(255,255,255,' + alpha + ')' : 'rgba(0,0,0,' + alpha + ')';
    document.body.style.background = 'linear-gradient(' + bgColor + ', ' + bgColor + '), url(background/' + encodeURI(filename) + ') center/cover no-repeat fixed';
  } else {
    // 还原为纯色背景
    const bgColor = theme === 'light' ? '#ffffff' : '#000000';
    document.body.style.background = bgColor;
  }
}

async function uploadBackground() {
  if (!window.electronAPI) return;

  try {
    const paths = await window.electronAPI.openFile({
      properties: ['openFile'],
      filters: [
        { name: I18N.t('settings.imageFilter'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }
      ]
    });

    if (!paths || paths.length === 0) return;

    const srcPath = paths[0];
    const filename = srcPath.split(/[\\/]/).pop();

    // 复制到 background 目录
    const destPath = bgAppPath + '\\background\\' + filename;
    const result = await window.electronAPI.copyFile(srcPath, destPath);

    if (result.success) {
      // 刷新列表并选中
      await loadBackgroundList();
      selectBackground(filename);
      showNotification(I18N.t('settings.bgUploadSuccess'), 'success');
    } else {
      showNotification(I18N.t('settings.bgUploadFailed', {msg: result.error}), 'error');
    }
  } catch (e) {
    console.error('[SETTINGS] 上传背景错误:', e);
    showNotification(I18N.t('settings.bgUploadError'), 'error');
  }
}


// ============================================
// 设置保存

async function hashPassword(pw) {
  var encoder = new TextEncoder();
  var data = encoder.encode(pw);
  var hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function saveSettings() {

  // 读取现有配置以保留未修改的字段
  var existingRaw = localStorage.getItem('editorConfig');
  var existing = existingRaw ? JSON.parse(existingRaw) : {};

  const config = {
    theme: themeSelect ? themeSelect.value : 'dark',
    uiFont: uiFont ? normalizeFontFamily(uiFont.value) : '',
    colors: {},
    editor: {
      fontSize: editorFontSize ? editorFontSize.value : defaultConfig.editor.fontSize,
      tabSize: editorTabSize ? editorTabSize.value : defaultConfig.editor.tabSize,
      lineNumbers: editorLineNumbers ? editorLineNumbers.value === 'true' : defaultConfig.editor.lineNumbers,
      lineWrapping: editorLineWrapping ? editorLineWrapping.value === 'true' : defaultConfig.editor.lineWrapping,
      theme: editorTheme ? editorTheme.value : defaultConfig.editor.theme,
      fontFamily: editorFontFamily ? normalizeFontFamily(editorFontFamily.value) : '',
    },
    autoSync: editorAutoSync ? editorAutoSync.value === 'true' : defaultConfig.autoSync,
    devTools: editorDevtools ? editorDevtools.checked : defaultConfig.devTools,
    checkboxMarkOn: checkboxMarkOn ? checkboxMarkOn.checked : defaultConfig.checkboxMarkOn,
    checkboxMarkOff: checkboxMarkOff ? checkboxMarkOff.checked : defaultConfig.checkboxMarkOff,
    hidePremiumHints: hidePremiumHints ? hidePremiumHints.checked : defaultConfig.hidePremiumHints,
    hideVersionHints: hideVersionHints ? hideVersionHints.checked : defaultConfig.hideVersionHints,
    itemKeyStyle: itemKeyStyle ? itemKeyStyle.value : defaultConfig.itemKeyStyle,
    prewarm: {
      files: prewarmFiles ? prewarmFiles.checked : defaultConfig.prewarm.files,
      filesMaxMb: prewarmFilesMax ? parseInt(prewarmFilesMax.value) || defaultConfig.prewarm.filesMaxMb : defaultConfig.prewarm.filesMaxMb,
      kether: prewarmKether ? prewarmKether.checked : defaultConfig.prewarm.kether,
    },
    blockFontSize: blockFontSize ? blockFontSize.value : defaultConfig.blockFontSize,
    categoryColors: {},
    shortcuts: {
      save: shortcutInputs.save ? shortcutInputs.save.value : defaultConfig.shortcuts.save,
      newFile: shortcutInputs.newFile ? shortcutInputs.newFile.value : defaultConfig.shortcuts.newFile,
      openProject: shortcutInputs.openProject ? shortcutInputs.openProject.value : defaultConfig.shortcuts.openProject,
      toggleMode: shortcutInputs.toggleMode ? shortcutInputs.toggleMode.value : defaultConfig.shortcuts.toggleMode,
    },
  };

  Object.entries(colorInputs).forEach(([key, input]) => {
    if (input) {
      config.colors[kebabToCamel(key)] = input.value;
    }
  });

  Object.entries(catColorInputs).forEach(([cat, input]) => {
    if (input) config.categoryColors[cat] = input.value;
  });

  // 远程设置
  var pw = remotePassword ? remotePassword.value : '';
  if (pw) {
    config.remotePasswordHash = await hashPassword(pw);
    sessionStorage.setItem('remotePassword', pw);
  } else if (existing && existing.remotePasswordHash) {
    config.remotePasswordHash = existing.remotePasswordHash;
  }
  config.allowDifferentVersions = remoteAllowDifferentVersions ? remoteAllowDifferentVersions.checked : false;

  // 实验性功能
  config.experimental = {
    remote: experimentalRemote ? experimentalRemote.checked : false,
    aiStudio: experimentalAIStudio ? experimentalAIStudio.checked : false,
  };

  // AI 设置
  config.ai = {
    endpoint: aiEndpoint ? aiEndpoint.value : defaultConfig.ai.endpoint,
    model: aiModel ? aiModel.value : defaultConfig.ai.model,
    customModel: aiCustomModel ? aiCustomModel.value : '',
    keys: existing.ai && existing.ai.keys ? existing.ai.keys : [],
    systemPrompt: aiSystemPrompt ? aiSystemPrompt.value : 'default',
    customPrompt: aiCustomPrompt ? aiCustomPrompt.value : '',
    maxTokens: aiMaxTokens ? parseInt(aiMaxTokens.value) || 4096 : 4096,
    temperature: aiTemperature ? parseFloat(aiTemperature.value) || 0.7 : 0.7,
  };

  // 保留背景设置
  const currentBg = getBackgroundConfig();
  if (currentBg) {
    config.background = currentBg;
  } else {
    config.background = { filename: '', opacity: 0.3 };
  }

  // 保留其他模块管理的字段（不在此表单范围内，全量重建会抹掉它们）
  if (existing) {
    if (existing.sound !== undefined) config.sound = existing.sound;
    if (existing.soundVolume !== undefined) config.soundVolume = existing.soundVolume;
    if (existing.remoteClient) config.remoteClient = existing.remoteClient;
    if (existing.remoteServer) config.remoteServer = existing.remoteServer;
    if (existing.ai && existing.ai.customPrompts) config.ai.customPrompts = existing.ai.customPrompts;
  }

  // 保留语言设置（由 i18n.js 管理，不在此表单范围内）
  if (existing && existing.language) {
    config.language = existing.language;
  }

  localStorage.setItem('editorConfig', JSON.stringify(config));
  applyCheckboxMarks(config);
  applyPremiumHint(config);
  applyVersionHint(config);
  _settingsDirty = false;
  showNotification(I18N.t('settings.saved'), 'success');
}

function getFullConfig() {
  try {
    var raw = localStorage.getItem('editorConfig');
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(defaultConfig));
  } catch(e) { return JSON.parse(JSON.stringify(defaultConfig)); }
}

function loadAiPromptList() {
  if (!aiPromptList) return;
  aiPromptList.innerHTML = '<div style="font-size:12px;color:var(--color-text-tertiary);padding:4px 0;">' + escHtml(I18N.t('settings.loading')) + '</div>';

  // 从 localStorage 加载自定义提示词（fallback）
  var cfg = getFullConfig();
  var customPrompts = (cfg.ai && cfg.ai.customPrompts) || {};

  if (window.electronAPI && window.electronAPI.ai && window.electronAPI.ai.loadPrompts) {
    window.electronAPI.ai.loadPrompts().then(function(result) {
      if (result.success) {
        renderPromptList(result.prompts, customPrompts);
        populatePromptSelect(result.prompts, customPrompts);
      } else {
        renderPromptList(null, customPrompts);
      }
    }).catch(function() {
      renderPromptList(null, customPrompts);
    });
  } else {
    renderPromptList(null, customPrompts);
  }
}

function renderPromptList(diskPrompts, localCustom) {
  if (!aiPromptList) return;
  var html = '';
  var count = 0;

  // 内置提示词
  if (diskPrompts) {
    for (var key in diskPrompts) {
      var p = diskPrompts[key];
      var badge = p.builtIn ? '<span style="font-size:10px;color:var(--color-text-tertiary);background:var(--color-bg-tertiary);padding:1px 6px;border-radius:3px;">' + escHtml(I18N.t('settings.badgeBuiltIn')) + '</span>' : '<span style="font-size:10px;color:var(--color-warning);background:rgba(255,214,0,0.1);padding:1px 6px;border-radius:3px;">' + escHtml(I18N.t('settings.badgeUser')) + '</span>';
      var delBtn = p.builtIn ? '' : '<button class="ai-prompt-del cv-btn-icon-danger" data-name="' + key + '" style="width:auto;height:auto;padding:0 4px;font-size:13px;">✕</button>';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;margin-bottom:2px;background:var(--color-bg-tertiary);border-radius:4px;">' +
        '<div style="display:flex;align-items:center;gap:6px;overflow:hidden;">' +
        '<span style="font-weight:500;font-size:12px;">' + escHtml(key) + '</span>' +
        badge +
        (p.overridden ? '<span style="font-size:10px;color:var(--color-warning);">' + escHtml(I18N.t('settings.badgeOverridden')) + '</span>' : '') +
        '</div>' +
        '<div style="display:flex;gap:4px;flex-shrink:0;">' +
        delBtn +
        '</div></div>';
      count++;
    }
  }

  // localStorage 自定义提示词（不在磁盘中的）
  if (localCustom) {
    for (var ck in localCustom) {
      if (diskPrompts && diskPrompts[ck]) continue;
      var cd = localCustom[ck];
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;margin-bottom:2px;background:var(--color-bg-tertiary);border-radius:4px;">' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="font-weight:500;font-size:12px;">' + escHtml(ck) + '</span>' +
        '<span style="font-size:10px;color:var(--color-text-tertiary);">' + escHtml(I18N.t('settings.badgeLocal')) + '</span>' +
        (cd.desc ? '<span style="font-size:10px;color:var(--color-text-tertiary);">' + escHtml(cd.desc) + '</span>' : '') +
        '</div></div>';
      count++;
    }
  }

  if (count === 0) {
    aiPromptList.innerHTML = '<div style="font-size:12px;color:var(--color-text-tertiary);padding:4px 0;">' + escHtml(I18N.t('settings.noPrompts')) + '</div>';
  } else {
    aiPromptList.innerHTML = html;
    // 绑定删除事件
    aiPromptList.querySelectorAll('.ai-prompt-del').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var name = this.dataset.name;
        if (!(await UI.confirm({ message: I18N.t('settings.deletePromptConfirm', {name: name}) }))) return;
        if (window.electronAPI && window.electronAPI.ai && window.electronAPI.ai.deleteUserPrompt) {
          window.electronAPI.ai.deleteUserPrompt(name).then(function(r) {
            if (r.success) {
              showNotification(I18N.t('settings.promptDeleted'), 'success');
              loadAiPromptList();
            } else {
              showNotification(I18N.t('settings.promptDeleteFailed', {msg: r.error || ''}), 'error');
            }
          });
        }
      });
    });
  }
}

function populatePromptSelect(diskPrompts, localCustom) {
  if (!aiSystemPrompt) return;
  var currentVal = aiSystemPrompt.value;
  var html = '<option value="custom">' + escHtml(I18N.t('settings.aiPromptCustom')) + '</option>';
  if (diskPrompts) {
    var keys = Object.keys(diskPrompts).sort();
    for (var i = 0; i < keys.length; i++) {
      var sel = keys[i] === currentVal ? ' selected' : '';
      var label = diskPrompts[keys[i]].builtIn ? keys[i] : I18N.t('settings.promptNameUser', {name: keys[i]});
      html += '<option value="' + keys[i] + '"' + sel + '>' + escHtml(label) + '</option>';
    }
  }
  if (localCustom) {
    for (var ck in localCustom) {
      if (diskPrompts && diskPrompts[ck]) continue;
      var sel2 = ck === currentVal ? ' selected' : '';
      html += '<option value="' + ck + '"' + sel2 + '>' + escHtml(I18N.t('settings.promptNameLocal', {name: ck})) + '</option>';
    }
  }
  aiSystemPrompt.innerHTML = html;
  aiSystemPrompt.value = currentVal;

  // 更新提示词信息
  updatePromptInfo(currentVal, diskPrompts, localCustom);
}

function updatePromptInfo(selected, diskPrompts, localCustom) {
  if (!aiPromptInfo) return;
  if (selected === 'custom') {
    aiPromptInfo.textContent = I18N.t('settings.promptInfoCustom');
    return;
  }
  var p = diskPrompts ? diskPrompts[selected] : null;
  if (p) {
    aiPromptInfo.textContent = (p.builtIn ? I18N.t('settings.promptInfoBuiltin') : I18N.t('settings.promptInfoUser')) + (p.overridden ? I18N.t('settings.promptInfoOverridden') : '');
  } else if (localCustom && localCustom[selected]) {
    aiPromptInfo.textContent = I18N.t('settings.promptInfoLocal') + (localCustom[selected].desc ? ': ' + localCustom[selected].desc : '');
  } else {
    aiPromptInfo.textContent = '';
  }
}

function renderAiKeys(keys) {
  if (!aiKeysList) return;
  aiKeysList.innerHTML = '';
  if (!keys || keys.length === 0) {
    aiKeysList.innerHTML = '<div style="font-size:12px;color:var(--color-text-tertiary);padding:4px 0;">' + escHtml(I18N.t('settings.aiNoKeys')) + '</div>';
    return;
  }
  keys.forEach(function(key, i) {
    var masked = key.length > 12 ? key.slice(0, 6) + '...' + key.slice(-4) : key.slice(0, 4) + '...';
    var div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px;margin-bottom:4px;background:var(--color-bg-tertiary);border-radius:4px;font-size:12px;';
    div.innerHTML = '<span style="color:var(--color-text-secondary);">' + escHtml(masked) + '</span><button class="ai-key-del cv-btn-icon-danger" data-idx="' + i + '" style="width:auto;height:auto;padding:2px 6px;font-size:14px;">✕</button>';
    div.querySelector('.ai-key-del').addEventListener('click', function() {
      var idx = parseInt(this.dataset.idx);
      var cfg = getFullConfig();
      var keys = cfg.ai && cfg.ai.keys ? cfg.ai.keys : [];
      keys.splice(idx, 1);
      cfg.ai.keys = keys;
      localStorage.setItem('editorConfig', JSON.stringify(cfg));
      renderAiKeys(keys);
      showNotification(I18N.t('settings.keyDeleted'), 'success');
    });
    aiKeysList.appendChild(div);
  });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loadSettings() {
  
  const stored = localStorage.getItem('editorConfig');
  const config = stored ? JSON.parse(stored) : defaultConfig;


  // 应用主题
  if (themeSelect) {
    themeSelect.value = config.theme || defaultConfig.theme;
  }
  applyTheme(config.theme || defaultConfig.theme);

  // 应用字体
  if (uiFont) uiFont.value = displayFontName(config.uiFont || '');
  if (editorFontFamily) editorFontFamily.value = displayFontName((config.editor && config.editor.fontFamily) || '');
  applyFonts();

  // 应用颜色
  const colors = config.colors || defaultConfig.colors;
  Object.entries(colors).forEach(([key, value]) => {
    const inputId = `color-${camelToKebab(key)}`;
    const input = document.getElementById(inputId);
    if (input) {
      input.value = value;
      // 使用修复后的 updateCSSVariable 函数
      updateCSSVariable(inputId, value);
    }
  });

  updateColorValues();

  // 应用编辑器设置 (合并默认值, 避免部分配置缺失字段时崩溃)
  const editorConfig = Object.assign({}, defaultConfig.editor, config.editor || {});
  if (editorFontSize) editorFontSize.value = editorConfig.fontSize;
  if (editorTabSize) editorTabSize.value = editorConfig.tabSize;
  if (editorLineNumbers) editorLineNumbers.value = editorConfig.lineNumbers.toString();
  if (editorLineWrapping) editorLineWrapping.value = editorConfig.lineWrapping.toString();
  if (editorTheme) editorTheme.value = editorConfig.theme;
  if (editorAutoSync) editorAutoSync.value = String(config.autoSync === true);
  if (editorDevtools) editorDevtools.checked = config.devTools === true;
  if (checkboxMarkOn) checkboxMarkOn.checked = config.checkboxMarkOn !== false;
  if (checkboxMarkOff) checkboxMarkOff.checked = config.checkboxMarkOff === true;
  applyCheckboxMarks(config);
  if (hidePremiumHints) hidePremiumHints.checked = config.hidePremiumHints === true;
  applyPremiumHint(config);
  if (hideVersionHints) hideVersionHints.checked = config.hideVersionHints === true;
  applyVersionHint(config);
  if (itemKeyStyle) itemKeyStyle.value = config.itemKeyStyle || 'snake';

  // 启动预热设置
  var pw = config.prewarm || defaultConfig.prewarm;
  if (prewarmFiles) prewarmFiles.checked = pw.files !== false;
  if (prewarmFilesMax) prewarmFilesMax.value = pw.filesMaxMb || 50;
  if (prewarmKether) prewarmKether.checked = pw.kether !== false;

  // AI 设置
  var aiCfg = config.ai || defaultConfig.ai;
  if (aiEndpoint) aiEndpoint.value = aiCfg.endpoint || defaultConfig.ai.endpoint;
  if (aiModel) {
    aiModel.value = aiCfg.model || defaultConfig.ai.model;
    if (aiCustomModelGroup) {
      aiCustomModelGroup.style.display = aiModel.value === 'custom' ? '' : 'none';
    }
  }
  if (aiCustomModel) aiCustomModel.value = aiCfg.customModel || '';
  if (aiSystemPrompt) aiSystemPrompt.value = aiCfg.systemPrompt || 'default';
  if (aiCustomPrompt) aiCustomPrompt.value = aiCfg.customPrompt || '';
  if (aiCustomPromptGroup) {
    aiCustomPromptGroup.style.display = (aiCfg.systemPrompt || 'default') === 'custom' ? '' : 'none';
  }
  if (aiMaxTokens) aiMaxTokens.value = aiCfg.maxTokens || 4096;
  if (aiTemperature) aiTemperature.value = aiCfg.temperature || 0.7;
  renderAiKeys(aiCfg.keys || []);
  loadAiPromptList();

  // 应用积木块显示设置
  if (blockFontSize) {
    blockFontSize.value = config.blockFontSize || defaultConfig.blockFontSize;
  }
  const catColors = config.categoryColors || defaultConfig.categoryColors;
  Object.entries(catColorInputs).forEach(([cat, input]) => {
    if (input) {
      input.value = catColors[cat] || defaultConfig.categoryColors[cat] || '#7f8c8d';
      const valueEl = document.getElementById('cat-' + cat + '-value');
      if (valueEl) valueEl.textContent = input.value.toUpperCase();
    }
  });

  // 应用快捷键设置
  const shortcutsConfig = config.shortcuts || defaultConfig.shortcuts;
  if (shortcutInputs.save) shortcutInputs.save.value = shortcutsConfig.save;
  if (shortcutInputs.newFile) shortcutInputs.newFile.value = shortcutsConfig.newFile;
  if (shortcutInputs.openProject) shortcutInputs.openProject.value = shortcutsConfig.openProject;
  if (shortcutInputs.toggleMode) shortcutInputs.toggleMode.value = shortcutsConfig.toggleMode;

  // 加载背景图片列表并应用
  loadBackgroundList().then(() => {
    // 应用保存的背景
    const bgConfig = config.background || { filename: '', opacity: 0.3 };
    if (bgOpacity) bgOpacity.value = String(bgConfig.opacity || 0.3);
    if (bgOpacityValue) bgOpacityValue.textContent = (bgConfig.opacity || 0.3).toFixed(2);
    if (bgConfig.filename) {
      highlightSelected(bgConfig.filename);
    } else {
      highlightSelected('');
    }
    applyBackgroundPreview();
  });

  // 远程设置 - 不显示明文，只通过 placeholder 提示是否已设置
  if (remotePassword) {
    remotePassword.value = '';
    remotePassword.placeholder = config.remotePasswordHash ? I18N.t('settings.remotePasswordSet') : I18N.t('settings.remotePasswordPlaceholder');
  }
  // 如 sessionStorage 有明文（同会话），加载到输入框方便确认
  if (remotePassword && sessionStorage.getItem('remotePassword')) {
    remotePassword.value = sessionStorage.getItem('remotePassword');
    remotePassword.placeholder = I18N.t('settings.remotePasswordSet');
  }
  if (remoteAllowDifferentVersions) {
    remoteAllowDifferentVersions.checked = config.allowDifferentVersions === true;
  }

  // 实验性功能
  var exp = config.experimental || { remote: false, aiStudio: false };
  if (experimentalRemote) experimentalRemote.checked = exp.remote === true;
  if (experimentalAIStudio) experimentalAIStudio.checked = exp.aiStudio === true;
}

function resetSettings() {

  UI.confirm({ message: I18N.t('settings.resetConfirm'), danger: true }).then(function(ok) {
    if (!ok) return;
    localStorage.removeItem('editorConfig');
    sessionStorage.removeItem('remotePassword');
    loadSettings(); applyTheme(defaultConfig.theme);
    showNotification(I18N.t('settings.resetDone'), 'success');
  });
}


function exportSettings() {
  
  const config = {
    theme: themeSelect ? themeSelect.value : 'dark',
    colors: {},
  };

  Object.entries(colorInputs).forEach(([key, input]) => {
    if (input) {
      config.colors[kebabToCamel(key)] = input.value;
    }
  });

  const dataStr = JSON.stringify(config, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `editor-config-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);

  showNotification(I18N.t('settings.exportDone'), 'success');
}

function importSettings(e) {
  
  const file = e.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const config = JSON.parse(event.target.result);

      // 验证配置结构
      if (!config.theme || !config.colors) {
        throw new Error(I18N.t('settings.invalidConfig'));
      }

      // 应用导入   
      if (themeSelect) {
        themeSelect.value = config.theme;
      }
      applyTheme(config.theme);

      Object.entries(config.colors).forEach(([key, value]) => {
        const inputId = `color-${camelToKebab(key)}`;
        const input = document.getElementById(inputId);
        if (input) {
          input.value = value;
          // 使用修复后的 updateCSSVariable 函数
          updateCSSVariable(inputId, value);
          updateColorValue(inputId);
        }
      });

      // 程序化赋值不触发 change/input 事件, 需手动标记, 否则关闭设置时更改丢失
      _settingsDirty = true;
      showNotification(I18N.t('settings.importDone'), 'success');
    } catch (error) {
      console.error('[SETTINGS] 导入错误:', error);
      showNotification(I18N.t('settings.importFailed', {msg: error.message}), 'error');
    }
  };

  reader.readAsText(file);
  if (importFile) {
    importFile.value = ''; // 重置文件输入
  }
}
// ============================================
// 工具函数
// ============================================

function camelToKebab(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

function showNotification(message, type = 'info') {
  
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  let bgColor = 'var(--color-info)';
  if (type === 'success') {
    bgColor = 'var(--color-success)';
  } else if (type === 'error') {
    bgColor = 'var(--color-error)';
  }
  
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background-color: ${bgColor};
    color: white;
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 9999;
    animation: slideIn 0.3s ease;
    font-weight: 500;
  `;

  document.body.appendChild(notification);

  // 自动移除
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================
// 动画样式
// ============================================

const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// ============================================
// 页面加载时同步设置

window.addEventListener('beforeunload', () => {
  if (_settingsDirty) saveSettings();
});

document.addEventListener('DOMContentLoaded', async () => {
  await I18N.ready;
  loadSettings();
  I18N.applyDOM();

  // 预览区：示例对话框
  var pvDemo = document.getElementById('pv-demo-dialog');
  if (pvDemo) {
    pvDemo.addEventListener('click', function() {
      UI.confirm({
        title: I18N.t('settings.previewDialogTitle'),
        message: I18N.t('settings.previewDialogBody')
      }).then(function(ok) {
        if (!ok) return;
        UI.prompt({
          title: I18N.t('settings.previewDialogTitle'),
          message: I18N.t('settings.previewDialogInput'),
          defaultValue: 'example'
        }).then(function(v) {
          if (v === null) return;
          UI.alert({ title: I18N.t('settings.previewDialogTitle'), message: I18N.t('settings.previewDialogResult', { value: v }) });
        });
      });
    });
  }
});
