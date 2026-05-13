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

// 积木块显示
let blockFontSize;
let catColorInputs = {};

// 快捷键设置
let shortcutInputs = {};
let resetShortcutsBtn;
let editShortcutsBtn;

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
  editor: {
    fontSize: '14',
    tabSize: '4',
    lineNumbers: true,
    lineWrapping: true,
    theme: 'dracula',
  },
  autoSync: false,
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
    find: 'Ctrl+F',
    replace: 'Ctrl+H',
    comment: 'Ctrl+/',
    format: 'Shift+Alt+F',
  },
  background: {
    filename: '',
    opacity: 0.3,
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

document.addEventListener('DOMContentLoaded', () => {
  console.log('[SETTINGS] DOMContentLoaded fired');
  
  // 初始化DOM元素
  initializeDOMElements();
  
  
  // 设置事件监听
  setupEventListeners();
  
  
  console.log('[SETTINGS] 初始化完成?');
});

// ============================================
// 初始化DOM元素
// ============================================

function initializeDOMElements() {
  console.log('[SETTINGS] 初始化DOM元素');
  
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
    find: document.getElementById('shortcut-find'),
    replace: document.getElementById('shortcut-replace'),
    comment: document.getElementById('shortcut-comment'),
    format: document.getElementById('shortcut-format'),
  };

  // 背景图片
  bgGrid = document.getElementById('bg-grid');
  bgOpacity = document.getElementById('bg-opacity');
  bgOpacityValue = document.getElementById('bg-opacity-value');
  bgUploadBtn = document.getElementById('bg-upload-btn');

  console.log('  - themeSelect:', !!themeSelect);
  console.log('  - backBtn:', !!backBtn);
  console.log('  - saveBtn:', !!saveBtn);
  console.log('  - resetBtn:', !!resetBtn);
  console.log('  - exportBtn:', !!exportBtn);
  console.log('  - importBtn:', !!importBtn);
  console.log('  - importFile:', !!importFile);
  console.log('  - presetBtns count:', presetBtns.length);
  console.log('  - colorInputs count:', Object.keys(colorInputs).length);
  console.log('  - editorFontSize:', !!editorFontSize);
  console.log('  - editorTabSize:', !!editorTabSize);
  console.log('  - editorLineNumbers:', !!editorLineNumbers);
  console.log('  - editorLineWrapping:', !!editorLineWrapping);
  console.log('  - editorTheme:', !!editorTheme);
  console.log('  - shortcutInputs count:', Object.keys(shortcutInputs).filter(key => shortcutInputs[key]).length);
}

// ============================================
// 事件监听设置
// ============================================

function setupEventListeners() {
  console.log('[SETTINGS] 设置事件监听');

  // 主题选择
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      playSound('click');
      console.log('[SETTINGS] 主题改变:', e.target.value);
      applyTheme(e.target.value);
      updateColorInputs();
    });
  }

  // 返回按钮
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      playSound('back');
      console.log('[SETTINGS] 返回到编辑器');
      window.location.href = 'index.html';
    });
  }

  // 颜色输入
  Object.values(colorInputs).forEach((input) => {
    if (input) {
      input.addEventListener('input', (e) => {
        console.log('[SETTINGS] 颜色变更:', e.target.id, e.target.value);
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
    saveBtn.addEventListener('click', () => {
      playSound('save');
      console.log('[SETTINGS] 保存设置');
      saveSettings();
    });
  }

  // 重置按钮
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      playSound('update');
      console.log('[SETTINGS] 重置设置');
      resetSettings();
    });
  }

  // 导出按钮
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      playSound('click');
      console.log('[SETTINGS] 导出设置');
      exportSettings();
    });
  }

  // 导入按钮
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      playSound('click');
      console.log('[SETTINGS] 导入设置');
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
        console.log('[SETTINGS] 应用预设:', preset);
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
    resetShortcutBtn.addEventListener('click', () => { playSound('update'); console.log('[SETTINGS] 重置快捷键'); });
  }
  const editShortcutBtn = document.getElementById('edit-shortcuts');
  if (editShortcutBtn) {
    editShortcutBtn.addEventListener('click', () => { playSound('click'); console.log('[SETTINGS] 编辑快捷键'); });
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

  console.log('[SETTINGS] 事件监听器设置完成?');
}

// ============================================
// 主题应用
// ============================================

function applyTheme(theme) {
  console.log('[SETTINGS] 应用主题:', theme);
  document.body.setAttribute('data-theme', theme);
}

function applyPreset(presetName) {
  console.log('[SETTINGS] 应用预设主题:', presetName);
  
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
  // 根据主题更新输入框颜色
  const theme = themeSelect ? themeSelect.value : 'dark';
  console.log('[SETTINGS] 更新颜色输入，当前主题', theme);
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
  const stored = localStorage.getItem('editorConfig');
  const config = stored ? JSON.parse(stored) : { theme: 'dark', colors: {} };
  if (!config.background) config.background = {};
  config.background.filename = filename || '';
  if (opacity !== undefined) config.background.opacity = opacity;
  localStorage.setItem('editorConfig', JSON.stringify(config));
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
  const theme = themeSelectEl ? themeSelectEl.value : 'dark';

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
        { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }
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
      showNotification('背景上传成功', 'success');
    } else {
      showNotification('上传失败: ' + result.error, 'error');
    }
  } catch (e) {
    console.error('[SETTINGS] 上传背景错误:', e);
    showNotification('上传背景失败', 'error');
  }
}


// ============================================
// 设置保存

function saveSettings() {
  console.log('[SETTINGS] 保存设置');

  const config = {
    theme: themeSelect ? themeSelect.value : 'dark',
    colors: {},
    editor: {
      fontSize: editorFontSize ? editorFontSize.value : defaultConfig.editor.fontSize,
      tabSize: editorTabSize ? editorTabSize.value : defaultConfig.editor.tabSize,
      lineNumbers: editorLineNumbers ? editorLineNumbers.value === 'true' : defaultConfig.editor.lineNumbers,
      lineWrapping: editorLineWrapping ? editorLineWrapping.value === 'true' : defaultConfig.editor.lineWrapping,
      theme: editorTheme ? editorTheme.value : defaultConfig.editor.theme,
    },
    autoSync: editorAutoSync ? editorAutoSync.value === 'true' : defaultConfig.autoSync,
    blockFontSize: blockFontSize ? blockFontSize.value : defaultConfig.blockFontSize,
    categoryColors: {},
    shortcuts: {
      save: shortcutInputs.save ? shortcutInputs.save.value : defaultConfig.shortcuts.save,
      newFile: shortcutInputs.newFile ? shortcutInputs.newFile.value : defaultConfig.shortcuts.newFile,
      openProject: shortcutInputs.openProject ? shortcutInputs.openProject.value : defaultConfig.shortcuts.openProject,
      toggleMode: shortcutInputs.toggleMode ? shortcutInputs.toggleMode.value : defaultConfig.shortcuts.toggleMode,
      find: shortcutInputs.find ? shortcutInputs.find.value : defaultConfig.shortcuts.find,
      replace: shortcutInputs.replace ? shortcutInputs.replace.value : defaultConfig.shortcuts.replace,
      comment: shortcutInputs.comment ? shortcutInputs.comment.value : defaultConfig.shortcuts.comment,
      format: shortcutInputs.format ? shortcutInputs.format.value : defaultConfig.shortcuts.format,
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

  // 保留背景设置
  const currentBg = getBackgroundConfig();
  if (currentBg) {
    config.background = currentBg;
  } else {
    config.background = { filename: '', opacity: 0.3 };
  }

  console.log('[SETTINGS] 配置对象:', config);
  localStorage.setItem('editorConfig', JSON.stringify(config));
  showNotification('设置已经保存', 'success');
}

function loadSettings() {
  console.log('[SETTINGS] 加载设置');
  
  const stored = localStorage.getItem('editorConfig');
  const config = stored ? JSON.parse(stored) : defaultConfig;

  console.log('[SETTINGS] 加载的配置', config);

  // 应用主题
  if (themeSelect) {
    themeSelect.value = config.theme || defaultConfig.theme;
  }
  applyTheme(config.theme || defaultConfig.theme);

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

  // 应用编辑器设置
  const editorConfig = config.editor || defaultConfig.editor;
  if (editorFontSize) editorFontSize.value = editorConfig.fontSize;
  if (editorTabSize) editorTabSize.value = editorConfig.tabSize;
  if (editorLineNumbers) editorLineNumbers.value = editorConfig.lineNumbers.toString();
  if (editorLineWrapping) editorLineWrapping.value = editorConfig.lineWrapping.toString();
  if (editorTheme) editorTheme.value = editorConfig.theme;
  if (editorAutoSync) editorAutoSync.value = String(config.autoSync === true);

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

  // 应用快捷键设置（将在任务3中完善）
  const shortcutsConfig = config.shortcuts || defaultConfig.shortcuts;
  // 暂时只更新显示值
  if (shortcutInputs.save) shortcutInputs.save.value = shortcutsConfig.save;
  if (shortcutInputs.newFile) shortcutInputs.newFile.value = shortcutsConfig.newFile;
  if (shortcutInputs.openProject) shortcutInputs.openProject.value = shortcutsConfig.openProject;
  if (shortcutInputs.toggleMode) shortcutInputs.toggleMode.value = shortcutsConfig.toggleMode;
  if (shortcutInputs.find) shortcutInputs.find.value = shortcutsConfig.find;
  if (shortcutInputs.replace) shortcutInputs.replace.value = shortcutsConfig.replace;
  if (shortcutInputs.comment) shortcutInputs.comment.value = shortcutsConfig.comment;
  if (shortcutInputs.format) shortcutInputs.format.value = shortcutsConfig.format;

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
}

function resetSettings() {
  console.log('[SETTINGS] 重置设置');
  
  if (confirm('确定要重置为默认设置吗？')) {
    localStorage.removeItem('editorConfig');
    loadSettings(); applyTheme(defaultConfig.theme);
    showNotification('已经重置设置', 'success');
  }
}


function exportSettings() {
  console.log('[SETTINGS] 导出设置');
  
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

  showNotification('设置已经成功导出', 'success');
}

function importSettings(e) {
  console.log('[SETTINGS] 导入设置');
  
  const file = e.target.files[0];
  if (!file) {
    console.log('[SETTINGS] 未选择文件');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const config = JSON.parse(event.target.result);
      console.log('[SETTINGS] 导入配置', config);

      // 验证配置结构
      if (!config.theme || !config.colors) {
        throw new Error('无效的配置文件');
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

      showNotification('设置已经导入', 'success');
    } catch (error) {
      console.error('[SETTINGS] 导入错误:', error);
      showNotification(`导入失败: ${error.message}`, 'error');
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
  console.log('[SETTINGS] 显示通知:', message, type);
  
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
  saveSettings();
});

document.addEventListener('DOMContentLoaded', () => {
  console.log('[SETTINGS] 页面 DOMContentLoaded');
  loadSettings();
});

console.log('[SETTINGS] settings.js 已加载');