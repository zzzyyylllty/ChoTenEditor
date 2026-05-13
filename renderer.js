// ============================================
// 渲染进程主逻辑
// ============================================

let _electronAPI = null;
let codeMirrorEditor = null; // CodeMirror 实例

// DOM 元素
const fileTreeEl = document.getElementById('file-tree');
const editorContainer = document.getElementById('editor-textarea'); // 现在是一个 div 容器
const sourceEditor = document.getElementById('source-editor');
const visualEditor = document.getElementById('visual-editor');
const sourceModeBtn = document.getElementById('source-mode-btn');
const visualModeBtn = document.getElementById('visual-mode-btn');
const openProjectBtn = document.getElementById('open-project-btn');
const newFileBtn = document.getElementById('new-file-btn');
const saveBtn = document.getElementById('save-btn');
const settingsBtn = document.getElementById('settings-btn');
const statusInfo = document.getElementById('status-info');
const filePathEl = document.getElementById('file-path');
const editorTabs = document.querySelector('.editor-tabs');
const navBackBtn = document.getElementById('nav-back-btn');
const navUpBtn = document.getElementById('nav-up-btn');

// 状态变量
let currentProjectPath = null;
let currentFile = null;
let files = [];
let openTabs = [];
let activeTab = null;
let isVisualMode = false;
let dirtyTabs = {}; // {filePath: true|false}
let autoSyncEnabled = false;
let autoSyncTimer = null;

// 文件夹导航状态
let currentDirectoryPath = null;
let directoryHistory = [];
let breadcrumbs = [];

// ============================================
// 应用状态持久化
// ============================================

function saveAppState() {
  try {
    const state = {
      currentProjectPath: currentProjectPath || null,
      currentFile: currentFile || null,
      openTabs: openTabs || [],
      activeTab: activeTab || null,
    };
    localStorage.setItem('appState', JSON.stringify(state));
  } catch (e) {
    console.error('[RENDERER] 保存应用状态失败:', e);
  }
}

function loadAutoSyncSetting() {
  try {
    const stored = localStorage.getItem('editorConfig');
    if (stored) {
      const config = JSON.parse(stored);
      autoSyncEnabled = config.autoSync === true;
    }
  } catch (e) {
    console.warn('[RENDERER] 加载自动同步设置失败:', e);
  }
}

async function restoreAppState() {
  try {
    const stored = localStorage.getItem('appState');
    if (!stored) return;
    const state = JSON.parse(stored);
    if (!state.currentProjectPath) return;

    currentProjectPath = state.currentProjectPath;
    currentDirectoryPath = state.currentProjectPath;
    directoryHistory = [];
    breadcrumbs = [];

    const ok = await loadDirectory(state.currentProjectPath, true);
    if (!ok) {
      // 目录不可用，清除保存的状态
      console.warn('[RENDERER] 保存的项目目录不可用，清除状态');
      localStorage.removeItem('appState');
      currentProjectPath = null;
      currentDirectoryPath = null;
      return;
    }

    // 检测项目类型
    if (typeof ChemdahInterpreter !== 'undefined') {
      const types = await ChemdahInterpreter.detectProjectTypes(state.currentProjectPath);
      let typeMsg = `项目已打开: ${getFileName(state.currentProjectPath)}`;
      if (types.hasConversation && types.hasQuest) {
        typeMsg += ' [对话 + 任务]';
      } else if (types.hasConversation) {
        typeMsg += ' [对话文件]';
      } else if (types.hasQuest) {
        typeMsg += ' [任务文件]';
      }
      updateStatus(typeMsg);
    } else {
      updateStatus(`项目已打开: ${state.currentProjectPath}`);
    }

    // 恢复标签页
    if (state.openTabs && state.openTabs.length > 0) {
      // 先添加非活跃标签（只创建 tab DOM，不加载内容）
      for (const tabPath of state.openTabs) {
        if (tabPath !== state.activeTab && !openTabs.includes(tabPath)) {
          openTabs.push(tabPath);
          addTab(tabPath);
        }
      }
      // 再打开活跃标签
      if (state.activeTab && state.openTabs.includes(state.activeTab)) {
        await openFile(state.activeTab);
      }
    }
  } catch (e) {
    console.warn('[RENDERER] 恢复应用状态失败:', e);
    localStorage.removeItem('appState');
    if (!currentProjectPath) {
      currentProjectPath = null;
      currentFile = null;
    }
  }
}

// ============================================
// 初始化 - 等待DOM和API就绪
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('[RENDERER] DOMContentLoaded fired');

  setTimeout(() => {
    console.log('[RENDERER] 检查API可用性');
    console.log('[RENDERER] window.testAPI:', window.testAPI);
    console.log('[RENDERER] window.electronAPI:', window.electronAPI);

    // 测试 testAPI
    if (window.testAPI && window.testAPI.test) {
      console.log('[RENDERER] testAPI 可用:', window.testAPI.test());
    } else {
      console.error('[RENDERER] testAPI 不可用');
    }

    // 检查 electronAPI
    if (!window.electronAPI) {
      console.error('[RENDERER] electronAPI 不可用!');
      showErrorDialog(
        'API 初始化失败',
        'Electron API 未能正确初始化。请检查控制台错误。'
      );
      return;
    }

    console.log('[RENDERER] electronAPI 可用，方法:', Object.keys(window.electronAPI));
    _electronAPI = window.electronAPI;
    init();
  }, 300);
});

// ============================================
// CodeMirror 主题管理
// ============================================

function getCodeMirrorTheme() {
  // 从 localStorage 读取配置
  const stored = localStorage.getItem('editorConfig');
  let editorTheme = 'dracula'; // 默认主题

  if (stored) {
    try {
      const config = JSON.parse(stored);
      // 优先使用用户选择的编辑器主题
      if (config.editor && config.editor.theme) {
        editorTheme = config.editor.theme;
      } else {
        // 根据应用主题选择默认主题
        const appTheme = config.theme || 'dark';
        editorTheme = appTheme === 'light' ? 'eclipse' : 'dracula';
      }
    } catch (e) {
      console.error('[RENDERER] 解析 editorConfig 失败:', e);
    }
  }

  return editorTheme;
}

function getEditorConfig() {
  // 从 localStorage 读取配置
  const stored = localStorage.getItem('editorConfig');
  const defaultConfig = {
    fontSize: '14',
    tabSize: '4',
    lineNumbers: true,
    lineWrapping: true,
    theme: 'dracula',
  };

  if (stored) {
    try {
      const config = JSON.parse(stored);
      if (config.editor) {
        return {
          fontSize: config.editor.fontSize || defaultConfig.fontSize,
          tabSize: config.editor.tabSize || defaultConfig.tabSize,
          lineNumbers: config.editor.lineNumbers !== undefined ? config.editor.lineNumbers : defaultConfig.lineNumbers,
          lineWrapping: config.editor.lineWrapping !== undefined ? config.editor.lineWrapping : defaultConfig.lineWrapping,
          theme: config.editor.theme || defaultConfig.theme,
        };
      }
    } catch (e) {
      console.error('[RENDERER] 解析 editorConfig 失败:', e);
    }
  }

  return defaultConfig;
}

function updateCodeMirrorTheme() {
  if (!codeMirrorEditor) return;

  const theme = getCodeMirrorTheme();
  console.log('[RENDERER] 更新 CodeMirror 主题:', theme);
  codeMirrorEditor.setOption('theme', theme);
}

// ============================================
// CodeMirror 初始化
// ============================================

function initCodeMirror() {
  console.log('[RENDERER] 初始化 CodeMirror');
  if (!editorContainer) {
    console.error('[RENDERER] editorContainer 不存在');
    return;
  }

  // 获取当前主题
  const initialTheme = getCodeMirrorTheme();

  // 创建 CodeMirror 实例
  codeMirrorEditor = CodeMirror(editorContainer, {
    lineNumbers: true,
    lineWrapping: true,
    theme: initialTheme,
    mode: 'yaml',
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    extraKeys: {
      'Tab': 'indentMore',
      'Shift-Tab': 'indentLess',
    },
    placeholder: 'Open a file to start editing...',
    autofocus: true,
  });

  console.log('[RENDERER] CodeMirror 初始化完成，主题:', initialTheme);

  // 暴露给 ChemdahInterpreter（可视化编辑器需要同步到源码）
  window.codeMirrorEditor = codeMirrorEditor;
}

// ============================================
// 初始化函数
// ============================================

function init() {
  console.log('[RENDERER] 初始化开始');
  initCodeMirror();
  setupEventListeners();
  updateNavigationButtons();

  // 加载自动同步设置
  loadAutoSyncSetting();

  updateStatus('准备就绪');

  // 从 desc/ 目录加载任务定义数据
  loadQuestDefinitions();

  // 监听 localStorage 变化，更新 CodeMirror 主题
  window.addEventListener('storage', (e) => {
    if (e.key === 'editorConfig') {
      console.log('[RENDERER] editorConfig 更新，重新应用 CodeMirror 主题');
      updateCodeMirrorTheme();
    }
  });

  // 恢复上次的会话
  restoreAppState();

  console.log('[RENDERER] 初始化完成');
}

// ============================================
// 事件监听设置
// ============================================

function setupEventListeners() {
  console.log('[RENDERER] 设置事件监听器');

  // 检查元素是否存在
  if (!openProjectBtn) console.error('openProjectBtn 不存在');
  if (!newFileBtn) console.error('newFileBtn 不存在');
  if (!saveBtn) console.error('saveBtn 不存在');
  if (!settingsBtn) console.error('settingsBtn 不存在');
  if (!sourceModeBtn) console.error('sourceModeBtn 不存在');
  if (!visualModeBtn) console.error('visualModeBtn 不存在');
  if (!codeMirrorEditor) console.error('codeMirrorEditor 不存在');

  // 按钮点击事件 - 添加非空检查
  if (openProjectBtn) openProjectBtn.addEventListener('click', () => { playSound('click'); openProject(); });
  if (newFileBtn) newFileBtn.addEventListener('click', () => { playSound('click'); createNewFile(); });
  if (saveBtn) saveBtn.addEventListener('click', () => { playSound('save'); saveCurrentFile(); });
  if (settingsBtn) settingsBtn.addEventListener('click', () => { playSound('select'); openSettings(); });

  // 编辑器模式按钮
  if (sourceModeBtn) sourceModeBtn.addEventListener('click', () => { playSound('click'); switchEditorMode(false); });
  if (visualModeBtn) visualModeBtn.addEventListener('click', () => { playSound('click'); switchEditorMode(true); });

  // 编辑器文本框
  if (codeMirrorEditor) codeMirrorEditor.on('change', handleEditorChange);

  // 导航按钮
  if (navUpBtn) navUpBtn.addEventListener('click', () => { playSound('click'); navigateUp(); });
  if (navBackBtn) navBackBtn.addEventListener('click', () => { playSound('back'); navigateBack(); });

  // 主题选择器监听
  const themeSelect = document.getElementById('theme');
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      playSound('click');
      console.log('[RENDERER] 主题选择器变化，更新 CodeMirror 主题');
      updateCodeMirrorTheme();
    });
  }

  // 解释器类型选择器
  const typeSelect = document.getElementById('interpreter-type-select');
  if (typeSelect) {
    typeSelect.addEventListener('change', function () {
      playSound('click');
      const val = this.value;
      if (!currentFile || typeof ChemdahInterpreter === 'undefined') return;

      if (val === 'auto') {
        ChemdahInterpreter.removeTypeOverride(currentFile);
        updateStatus('解释器类型: 自动检测');
      } else {
        ChemdahInterpreter.setTypeOverride(currentFile, val);
        updateStatus(`解释器类型: ${val}`);
      }

      // 如果当前在可视化模式，重新渲染
      if (isVisualMode && visualEditor) {
        renderVisualEditor();
      }
    });
  }

  // 键盘快捷键
  document.addEventListener('keydown', function (e) {
    // Ctrl+S: 保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      playSound('save');
      saveCurrentFile();
    }
    // Ctrl+N: 新建
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      playSound('click');
      createNewFile();
    }
    // Ctrl+O: 打开项目
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      playSound('click');
      openProject();
    }
    // F2: 切换编辑器模式
    if (e.key === 'F2') {
      e.preventDefault();
      playSound('click');
      // 检查是否可以对当前文件切换
      if (currentFile && (currentFile.endsWith('.yml') || currentFile.endsWith('.yaml'))) {
        switchEditorMode(!isVisualMode);
      }
    }
  });

  console.log('[RENDERER] 事件监听器设置完成');
}

// ============================================
// 打开项目
// ============================================

async function openProject() {
  console.log('[RENDERER] 打开项目');

  if (!_electronAPI || !_electronAPI.openDirectory) {
    showErrorDialog('API 错误', 'openDirectory API 不可用');
    return;
  }

  try {
    const result = await _electronAPI.openDirectory();
    console.log('[RENDERER] 打开目录结果:', result);

    if (result && result.length > 0) {
      await openProjectPath(result[0]);
    } else {
      console.log('[RENDERER] 用户取消或未选择目录');
    }
  } catch (error) {
    console.error('[RENDERER] 打开项目错误:', error);
    showErrorDialog('打开项目失败', error.message || error);
  }
}

async function openProjectPath(path) {
  currentProjectPath = path;
  currentDirectoryPath = path;
  directoryHistory = [];
  breadcrumbs = [];
  await loadDirectory(path);

  // 检测项目中的类型
  if (typeof ChemdahInterpreter !== 'undefined') {
    const types = await ChemdahInterpreter.detectProjectTypes(path);
    let typeMsg = `项目已打开: ${getFileName(path)}`;
    if (types.hasConversation && types.hasQuest) {
      typeMsg += ' [对话 + 任务]';
    } else if (types.hasConversation) {
      typeMsg += ' [对话文件]';
    } else if (types.hasQuest) {
      typeMsg += ' [任务文件]';
    }
    updateStatus(typeMsg);
  } else {
    updateStatus(`项目已打开: ${path}`);
  }

  saveAppState();
}

// ============================================
// 加载目录
// ============================================

async function loadDirectory(path, silent = false) {
  console.log('[RENDERER] 加载目录:', path);

  if (!_electronAPI || !_electronAPI.readdir) {
    if (!silent) showErrorDialog('API 错误', 'readdir API 不可用');
    return false;
  }

  try {
    const result = await _electronAPI.readdir(path);
    console.log('[RENDERER] readdir 结果:', result);

    if (result.success) {
      files = result.files;
      renderFileTree(files);
      currentDirectoryPath = path;
      updateBreadcrumbs();
      updateNavigationButtons();
      updateStatus(`目录: ${path}`);
      return true;
    } else {
      if (!silent) showErrorDialog('读取目录失败', result.error);
      return false;
    }
  } catch (error) {
    console.error('[RENDERER] 加载目录错误:', error);
    if (!silent) showErrorDialog('加载目录失败', error.message || error);
    return false;
  }
}

// ============================================
// 文件树渲染
// ============================================

function renderFileTree(files) {
  console.log('[RENDERER] 渲染文件树，文件数:', files.length);

  if (!fileTreeEl) {
    console.error('[RENDERER] fileTreeEl 不存在');
    return;
  }

  fileTreeEl.innerHTML = '';

  files.forEach((file) => {
    const li = document.createElement('li');
    li.textContent = file.name;
    li.classList.add(file.isDirectory ? 'directory' : 'file');
    li.dataset.path = file.path;
    li.addEventListener('click', () => { playSound('click'); handleFileClick(file); });
    fileTreeEl.appendChild(li);
  });
}

// ============================================
// 处理文件点击
// ============================================

async function handleFileClick(file) {
  console.log('[RENDERER] 文件点击:', file.name);

  if (file.isDirectory) {
    await navigateToDirectory(file.path);
  } else {
    await openFile(file.path);
  }
}

// ============================================
// 打开文件
// ============================================

let _openingFile = null;
let _closingTabs = {};
let _loadingFile = false;

async function openFile(filePath) {
  console.log('[RENDERER] 打开文件:', filePath);

  // 防止重复打开同一文件
  if (_openingFile === filePath) {
    console.log('[RENDERER] 正在打开中，跳过重复请求');
    return;
  }
  // 防止在关闭过程中重新打开
  if (_closingTabs[filePath]) {
    console.log('[RENDERER] 文件正在关闭中，等待...');
    var _wait = 0;
    while (_closingTabs[filePath] && _wait < 20) {
      await new Promise(function(r) { setTimeout(r, 50); });
      _wait++;
    }
    if (_closingTabs[filePath]) return;
  }
  if (currentFile === filePath && openTabs.includes(filePath)) {
    setActiveTab(filePath);
    return;
  }
  _openingFile = filePath;

  if (!_electronAPI || !_electronAPI.readFile) {
    showErrorDialog('API 错误', 'readFile API 不可用');
    _openingFile = null;
    return;
  }

  try {
    const result = await _electronAPI.readFile(filePath);
    console.log('[RENDERER] 读取文件成功');

    if (result.success) {
      currentFile = filePath;
      const content = result.content;

      // 添加标签页
      if (!openTabs.includes(filePath)) {
        openTabs.push(filePath);
        addTab(filePath);
      }

      // 激活标签页
      setActiveTab(filePath);

      // 更新编辑器内容（临时禁止脏标记）
      if (codeMirrorEditor) {
        _loadingFile = true;
        codeMirrorEditor.setValue(content);
        _loadingFile = false;
        delete dirtyTabs[filePath];
        updateTabDirtyIndicator(filePath);
        updateCodeMirrorMode(filePath);
      }

      // 更新编辑器模式
      updateEditorModeForFile(filePath);

      // 更新状态栏
      if (filePathEl) {
        filePathEl.textContent = filePath;
      }

      // 检测类型并显示在状态栏
      if (typeof ChemdahInterpreter !== 'undefined') {
        const detectedType = ChemdahInterpreter.detectFileType(filePath, content);
        if (detectedType !== 'unknown') {
          updateStatus(`文件: ${getFileName(filePath)} [${detectedType}]`);
        } else {
          updateStatus(`文件: ${getFileName(filePath)}`);
        }
      } else {
        updateStatus(`文件: ${getFileName(filePath)}`);
      }

      saveAppState();
      _openingFile = null;
    } else {
      showErrorDialog('读取文件失败', result.error);
      _openingFile = null;
    }
  } catch (error) {
    console.error('[RENDERER] 打开文件错误:', error);
    showErrorDialog('打开文件失败', error.message || error);
    _openingFile = null;
  }
}

// ============================================
// 标签页管理
// ============================================

function findTabByPath(filePath) {
  var tabs = document.querySelectorAll('.editor-tab');
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].dataset.path === filePath) return tabs[i];
  }
  return null;
}

function addTab(filePath) {
  console.log('[RENDERER] 添加标签页:', filePath);

  if (!editorTabs) {
    console.error('[RENDERER] editorTabs 不存在');
    return;
  }

  // 防止重复标签
  if (findTabByPath(filePath)) {
    console.log('[RENDERER] 标签页已存在，跳过添加:', filePath);
    return;
  }

  const tab = document.createElement('div');
  tab.classList.add('editor-tab');
  tab.dataset.path = filePath;

  const nameSpan = document.createElement('span');
  nameSpan.classList.add('editor-tab-name');
  const baseName = getFileName(filePath);
  nameSpan.textContent = dirtyTabs[filePath] ? '● ' + baseName : baseName;
  nameSpan.title = dirtyTabs[filePath] ? baseName + ' (未保存)' : baseName;
  tab.appendChild(nameSpan);

  tab.addEventListener('click', () => {
    playSound('click');
    setActiveTab(filePath);
  });

  // 右键菜单
  tab.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showTabContextMenu(e, filePath);
  });

  // 关闭按钮
  const closeBtn = document.createElement('span');
  closeBtn.classList.add('editor-tab-close');
  closeBtn.textContent = ' ×';
  closeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    playSound('close');
    await closeTab(filePath);
  });
  tab.appendChild(closeBtn);

  editorTabs.appendChild(tab);
}

async function setActiveTab(filePath) {
  console.log('[RENDERER] 设置活动标签页:', filePath);

  // 更新标签页样式
  document.querySelectorAll('.editor-tab').forEach((tab) => {
    if (tab.dataset.path === filePath) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // 如果文件不同，加载内容
  if (currentFile !== filePath) {
    await openFile(filePath);
  }

  activeTab = filePath;

  // 如果在可视化模式，重新渲染
  if (isVisualMode && visualEditor) {
    // 更新类型选择器
    const typeSelect = document.getElementById('interpreter-type-select');
    if (typeSelect && typeof ChemdahInterpreter !== 'undefined') {
      const override = ChemdahInterpreter.getTypeOverride(filePath);
      typeSelect.value = override || 'auto';
    }
    renderVisualEditor();
  }
}

async function closeTab(filePath, force = false) {
  console.log('[RENDERER] 关闭标签页:', filePath);

  // 标记正在关闭，防止并发重复打开
  _closingTabs[filePath] = true;

  // 检查是否有未保存的更改
  if (!force && dirtyTabs[filePath]) {
    const fileName = getFileName(filePath);
    const result = await new Promise((resolve) => {
      // 创建自定义确认对话框
      const overlay = document.createElement('div');
      overlay.className = 'cv-modal';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100001;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `
        <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:10px;padding:24px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
          <h3 style="margin:0 0 12px;font-size:15px;">未保存的更改</h3>
          <p style="margin:0 0 20px;font-size:13px;color:var(--color-text-secondary);line-height:1.5;">
            文件 <strong>${escapeHtml(fileName)}</strong> 有未保存的更改。<br>是否保存？
          </p>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="cv-btn cv-btn-secondary" id="dirty-save" style="padding:6px 14px;border-radius:6px;border:1px solid var(--color-border);background:var(--color-bg-tertiary);color:var(--color-text-primary);cursor:pointer;">保存</button>
            <button class="cv-btn cv-btn-secondary" id="dirty-discard" style="padding:6px 14px;border-radius:6px;border:1px solid var(--color-border);background:var(--color-bg-tertiary);color:var(--color-text-secondary);cursor:pointer;">不保存</button>
            <button class="cv-btn cv-btn-primary" id="dirty-cancel" style="padding:6px 14px;border-radius:6px;border:none;background:var(--color-primary);color:#fff;cursor:pointer;">取消</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.querySelector('#dirty-save').addEventListener('click', () => {
        overlay.remove(); resolve('save');
      });
      overlay.querySelector('#dirty-discard').addEventListener('click', () => {
        overlay.remove(); resolve('discard');
      });
      overlay.querySelector('#dirty-cancel').addEventListener('click', () => {
        overlay.remove(); resolve('cancel');
      });
      overlay.addEventListener('click', function(e) {
        if (e.target === this) { this.remove(); resolve('cancel'); }
      });
    });

    if (result === 'cancel') {
      delete _closingTabs[filePath]; return;
    }
    if (result === 'save') {
      currentFile = filePath;
      await saveCurrentFile();
    }
  }

  delete dirtyTabs[filePath];

  const index = openTabs.indexOf(filePath);
  if (index > -1) {
    openTabs.splice(index, 1);
  }

  // 移除标签页 DOM
  var tab2 = findTabByPath(filePath);
  if (tab2) {
    tab2.remove();
  }

  // 如果关闭的是当前活动标签页
  if (activeTab === filePath) {
    if (openTabs.length > 0) {
      await setActiveTab(openTabs[openTabs.length - 1]);
    } else {
      currentFile = null;
      if (codeMirrorEditor) {
        codeMirrorEditor.setValue('');
      }
      if (filePathEl) {
        filePathEl.textContent = '';
      }
      updateStatus('没有打开的文件');
    }
  }

  delete _closingTabs[filePath];
  saveAppState();
}

// ============================================
// 标签页右键菜单
// ============================================

function showTabContextMenu(e, filePath) {
  const old = document.getElementById('tab-context-menu');
  if (old) old.remove();

  const menu = document.createElement('div');
  menu.id = 'tab-context-menu';
  menu.style.cssText = 'position:fixed;z-index:200000;background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:8px;padding:4px 0;min-width:170px;box-shadow:0 8px 24px rgba(0,0,0,0.6);';

  const items = [
    { label: '关闭当前', icon: '×', fn: function() { closeTab(filePath); } },
    { label: '关闭已保存', icon: '✓', fn: function() { closeSavedTabs(); } },
    { type: 'sep' },
    { label: '关闭左侧', icon: '◀', fn: function() { closeTabsDirection(filePath, 'left'); } },
    { label: '关闭右侧', icon: '▶', fn: function() { closeTabsDirection(filePath, 'right'); } },
    { type: 'sep' },
    { label: '关闭全部', icon: '■■', fn: function() { closeAllTabs(filePath); } },
  ];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.type === 'sep') {
      var sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:var(--color-border);margin:4px 8px;';
      menu.appendChild(sep);
      continue;
    }
    var btn = document.createElement('button');
    btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:7px 14px;border:none;background:transparent;color:var(--color-text-primary);font-size:12px;cursor:pointer;text-align:left;';
    btn.innerHTML = '<span style="width:20px;text-align:center;opacity:0.6;">' + item.icon + '</span>' + escapeHtml(item.label);
    btn.addEventListener('mouseenter', function() { this.style.background = 'var(--color-bg-hover)'; });
    btn.addEventListener('mouseleave', function() { this.style.background = 'transparent'; });
    btn.addEventListener('click', function() { menu.remove(); item.fn(); });
    menu.appendChild(btn);
  }

  menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 250) + 'px';

  document.body.appendChild(menu);

  function closeHandler(ev) {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler);
    }
  }
  setTimeout(function() { document.addEventListener('click', closeHandler); }, 0);
}

async function closeAllTabs(exceptPath) {
  var paths = openTabs.filter(function(p) { return p !== exceptPath; });
  for (var i = 0; i < paths.length; i++) {
    await closeTab(paths[i]);
  }
}

async function closeSavedTabs() {
  var paths = openTabs.filter(function(p) { return !dirtyTabs[p]; });
  for (var i = 0; i < paths.length; i++) {
    await closeTab(paths[i]);
  }
}

async function closeTabsDirection(filePath, direction) {
  var idx = openTabs.indexOf(filePath);
  if (idx < 0) return;
  var paths = direction === 'left' ? openTabs.slice(0, idx) : openTabs.slice(idx + 1);
  for (var i = 0; i < paths.length; i++) {
    await closeTab(paths[i]);
  }
}

// ============================================
// 导航函数
// ============================================

async function navigateToDirectory(dirPath) {
  console.log('[RENDERER] 导航到目录:', dirPath);

  if (currentDirectoryPath) {
    directoryHistory.push(currentDirectoryPath);
  }
  await loadDirectory(dirPath);
}

async function navigateUp() {
  console.log('[RENDERER] 导航到上一级');

  if (!currentDirectoryPath || currentDirectoryPath === currentProjectPath) {
    return;
  }

  const parentPath = getParentPath(currentDirectoryPath);
  await navigateToDirectory(parentPath);
}

async function navigateBack() {
  console.log('[RENDERER] 返回上一个目录');

  if (directoryHistory.length === 0) return;

  const prevPath = directoryHistory.pop();
  await loadDirectory(prevPath);
}

function getParentPath(dirPath) {
  const parts = dirPath.split(/[\\/]/);
  parts.pop();
  return parts.join('/');
}

function updateNavigationButtons() {
  if (navUpBtn) {
    navUpBtn.disabled = !currentDirectoryPath || currentDirectoryPath === currentProjectPath;
  }
  if (navBackBtn) {
    navBackBtn.disabled = directoryHistory.length === 0;
  }
}

// ============================================
// 面包屑导航
// ============================================

function updateBreadcrumbs() {
  if (!currentProjectPath || !currentDirectoryPath) {
    renderBreadcrumbs([]);
    return;
  }

  const crumbs = [];

  // 添加根目录
  crumbs.push({ name: '根目录', path: currentProjectPath });

  // 计算相对于项目根的路径
  const relativePath = getRelativePath(currentProjectPath, currentDirectoryPath);
  if (relativePath && relativePath !== '.') {
    const parts = relativePath.split('/');
    let accumulatedPath = currentProjectPath;

    for (const part of parts) {
      if (part) {
        accumulatedPath = accumulatedPath + '/' + part;
        crumbs.push({ name: part, path: accumulatedPath });
      }
    }
  }

  renderBreadcrumbs(crumbs);
}

function renderBreadcrumbs(crumbs) {
  const breadcrumbsEl = document.getElementById('breadcrumbs');
  if (!breadcrumbsEl) return;

  breadcrumbsEl.innerHTML = '';

  crumbs.forEach((crumb, index) => {
    const span = document.createElement('span');
    span.textContent = crumb.name;
    span.classList.add('breadcrumb');
    span.dataset.path = crumb.path;
    span.addEventListener('click', () => { playSound('click'); navigateToDirectory(crumb.path); });

    breadcrumbsEl.appendChild(span);

    if (index < crumbs.length - 1) {
      const separator = document.createElement('span');
      separator.textContent = ' / ';
      separator.classList.add('breadcrumb-separator');
      breadcrumbsEl.appendChild(separator);
    }
  });
}

function getRelativePath(fromPath, toPath) {
  const fromParts = fromPath.split(/[\\/]/);
  const toParts = toPath.split(/[\\/]/);

  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
    i++;
  }

  return toParts.slice(i).join('/');
}

// ============================================
// 文件操作
// ============================================

async function createNewFile() {
  console.log('[RENDERER] 创建新文件');

  if (!currentProjectPath) {
    alert('请先打开一个项目');
    return;
  }

  const fileName = prompt('输入文件名 (例如: config.yml):');
  if (!fileName) return;

  const basePath = currentDirectoryPath || currentProjectPath;
  const filePath = `${basePath}/${fileName}`;

  try {
    const result = await _electronAPI.writeFile(filePath, '');
    if (result.success) {
      await loadDirectory(basePath);
      await openFile(filePath);
      updateStatus(`文件已创建: ${filePath}`);
    } else {
      showErrorDialog('创建文件失败', result.error);
    }
  } catch (error) {
    showErrorDialog('创建文件失败', error.message || error);
  }
}

async function saveCurrentFile() {
  console.log('[RENDERER] 保存当前文件');

  if (!currentFile) {
    alert('没有打开的文件');
    return;
  }

  if (!codeMirrorEditor) {
    showErrorDialog('错误', 'codeMirrorEditor 不存在');
    return;
  }

  const content = codeMirrorEditor.getValue();

  try {
    const result = await _electronAPI.writeFile(currentFile, content);
    if (result.success) {
      playSound('save');
      dirtyTabs[currentFile] = false;
      updateTabDirtyIndicator(currentFile);
      updateStatus(`文件已保存: ${currentFile}`);
    } else {
      showErrorDialog('保存文件失败', result.error);
    }
  } catch (error) {
    showErrorDialog('保存文件失败', error.message || error);
  }
}

// ============================================
// 编辑器模式
// ============================================

function switchEditorMode(visual) {
  console.log('[RENDERER] 切换编辑器模式:', visual ? '可视化' : '源代码');

  isVisualMode = visual;

  // 获取类型选择器
  const typeSelector = document.getElementById('editor-type-selector');
  const typeSelect = document.getElementById('interpreter-type-select');

  if (visual) {
    if (sourceEditor) sourceEditor.style.display = 'none';
    if (visualEditor) visualEditor.classList.add('active');
    if (sourceModeBtn) sourceModeBtn.classList.remove('active');
    if (visualModeBtn) visualModeBtn.classList.add('active');
    updateStatus('可视化编辑器模式');

    // 显示类型选择器（仅对 YAML 文件）
    const isYaml = currentFile && (currentFile.endsWith('.yml') || currentFile.endsWith('.yaml'));
    if (typeSelector) {
      typeSelector.style.display = isYaml ? 'flex' : 'none';
    }

    // 设置当前类型选择值
    if (typeSelect && currentFile && typeof ChemdahInterpreter !== 'undefined') {
      const override = ChemdahInterpreter.getTypeOverride(currentFile);
      typeSelect.value = override || 'auto';
    }

    if (currentFile && (currentFile.endsWith('.yml') || currentFile.endsWith('.yaml') || currentFile.endsWith('.json'))) {
      renderVisualEditor();
    }
  } else {
    if (sourceEditor) sourceEditor.style.display = 'block';
    if (visualEditor) visualEditor.classList.remove('active');
    if (sourceModeBtn) sourceModeBtn.classList.add('active');
    if (visualModeBtn) visualModeBtn.classList.remove('active');
    if (typeSelector) typeSelector.style.display = 'none';
    updateStatus('源代码编辑器模式');
  }
}

function updateEditorModeForFile(filePath) {
  const isConfigFile =
    filePath.endsWith('.yml') ||
    filePath.endsWith('.yaml') ||
    filePath.endsWith('.json');

  if (visualModeBtn) {
    visualModeBtn.disabled = !isConfigFile;
  }

  if (!isConfigFile && isVisualMode) {
    switchEditorMode(false);
  }
}

function renderVisualEditor() {
  if (!codeMirrorEditor || !visualEditor) return;
  if (!currentFile) {
    visualEditor.innerHTML = `
      <div class="empty-state">
        <h2>可视化编辑器</h2>
        <p>请先打开一个文件。</p>
      </div>
    `;
    return;
  }

  // 仅支持 YAML 文件
  if (!currentFile.endsWith('.yml') && !currentFile.endsWith('.yaml')) {
    visualEditor.innerHTML = `
      <div class="empty-state">
        <h2>可视化编辑器</h2>
        <p>仅支持 .yml / .yaml 文件的可视化编辑。</p>
      </div>
    `;
    return;
  }

  const content = codeMirrorEditor.getValue();

  // 检查 ChemdahInterpreter 是否可用
  if (typeof ChemdahInterpreter === 'undefined') {
    visualEditor.innerHTML = `
      <div class="cv-error-banner">
        <span class="cv-error-icon">⚠️</span>
        <div>
          <strong>解释器未加载</strong>
          <p>ChemdahInterpreter 模块未正确加载。请检查控制台错误。</p>
        </div>
      </div>
    `;
    return;
  }

  // 获取类型覆盖设置
  const overrideType = ChemdahInterpreter.getTypeOverride(currentFile);

  try {
    ChemdahInterpreter.render(currentFile, content, visualEditor, {
      forceType: overrideType || null,
    });
  } catch (error) {
    console.error('[RENDERER] 可视化渲染错误:', error);
    visualEditor.innerHTML = `
      <div class="cv-error-banner">
        <span class="cv-error-icon">⚠️</span>
        <div>
          <strong>可视化渲染失败</strong>
          <p>${escapeHtml(error.message)}</p>
          <p>请在源代码模式中编辑。</p>
        </div>
      </div>
    `;
  }
}

/**
 * 重置当前文件的类型覆盖设置
 */
function resetTypeOverride() {
  if (!currentFile) return;
  ChemdahInterpreter.removeTypeOverride(currentFile);
  updateStatus('类型覆盖已清除');

  // 如果当前在可视化模式，重新渲染
  if (isVisualMode && visualEditor) {
    renderVisualEditor();
  }
}

/**
 * 手动设置当前文件的解释器类型
 */
function setFileInterpreterType() {
  if (!currentFile) return;

  const detectedType = ChemdahInterpreter.detectFileType(
    currentFile,
    codeMirrorEditor ? codeMirrorEditor.getValue() : ''
  );

  ChemdahInterpreter.showTypeSelector(currentFile, detectedType, (type, scope) => {
    if (!type) return;

    let scopePath = currentFile;
    if (scope === 'directory') {
      const parts = currentFile.replace(/\\/g, '/').split('/');
      parts.pop();
      scopePath = parts.join('/');
    } else if (scope === 'project') {
      scopePath = currentProjectPath || currentFile;
    }

    ChemdahInterpreter.setTypeOverride(scopePath, type);
    updateStatus(`解释器类型已设置为: ${type} (范围: ${scope})`);

    if (isVisualMode && visualEditor) {
      renderVisualEditor();
    }
  });
}

// ============================================
// 编辑器事件处理
// ============================================

function handleEditorChange() {
  if (currentFile && !_loadingFile) {
    if (!dirtyTabs[currentFile]) {
      dirtyTabs[currentFile] = true;
      updateTabDirtyIndicator(currentFile);
    }
    updateStatus('文件已修改');

    // 自动同步（自动保存）
    if (autoSyncEnabled) {
      if (autoSyncTimer) clearTimeout(autoSyncTimer);
      autoSyncTimer = setTimeout(() => {
        saveCurrentFile();
      }, 800);
    }
  }
}

function updateTabDirtyIndicator(filePath) {
  const tab = findTabByPath(filePath);
  if (!tab) return;
  const isDirty = dirtyTabs[filePath];
  const nameSpan = tab.querySelector('.editor-tab-name');
  if (nameSpan) {
    const baseName = getFileName(filePath);
    nameSpan.textContent = isDirty ? '● ' + baseName : baseName;
    nameSpan.title = isDirty ? baseName + ' (未保存)' : baseName;
  }
}

// ============================================
// 设置相关
// ============================================

function openSettings() {
  console.log('[RENDERER] 打开设置');
  setTimeout(() => { window.location.href = 'settings.html'; }, 120);
}

/**
 * 从 desc/ 目录加载 Chemdah 定义数据（objective、addon 等）
 * 读取 api-default.json + api-*.json，合并后传入解释器
 */
async function loadQuestDefinitions() {
  if (!_electronAPI || typeof ChemdahInterpreter === 'undefined' || !ChemdahInterpreter.setDefinitions) return;

  try {
    // 获取应用根目录路径
    let appPath = '';
    if (_electronAPI.getAppPath) {
      try { appPath = await _electronAPI.getAppPath(); } catch {}
    }
    if (!appPath) {
      // fallback: 从 window.location 推导
      // file:///E:/ChoTenEditor/index.html → E:\ChoTenEditor
      let loc = decodeURIComponent(window.location.href).replace(/\\/g, '/');
      loc = loc.replace(/^file:\/\/\//, '').split('?')[0].split('#')[0];
      const lastSlash = loc.lastIndexOf('/');
      if (lastSlash > 0) loc = loc.substring(0, lastSlash);
      appPath = loc.replace(/\//g, '\\');
    }
    if (!appPath) {
      console.warn('[RENDERER] 无法确定应用路径，跳过加载 desc 定义');
      return;
    }

    const descPath = appPath + '\\desc';
    console.log('[RENDERER] 加载 desc 目录:', descPath);
    const dirResult = await _electronAPI.readdir(descPath);
    if (!dirResult.success) {
      console.warn('[RENDERER] 读取 desc 目录失败:', descPath, dirResult.error);
      return;
    }

    let merged = {};
    const jsonFiles = dirResult.files.filter(f => f.name.endsWith('.json') && !f.isDirectory);
    console.log('[RENDERER] 发现 desc 文件数:', jsonFiles.length);

    for (const file of jsonFiles) {
      const result = await _electronAPI.readFile(file.path);
      if (result.success) {
        try {
          const data = JSON.parse(result.content);
          for (const [key, value] of Object.entries(data)) {
            if (!merged[key]) {
              merged[key] = value;
            } else if (typeof value === 'object' && typeof merged[key] === 'object') {
              merged[key] = { ...merged[key], ...value };
            }
          }
        } catch (e) {
          console.warn('[RENDERER] 解析 desc 文件失败:', file.name, e.message);
        }
      } else {
        console.warn('[RENDERER] 读取 desc 文件失败:', file.name, result.error);
      }
    }

    ChemdahInterpreter.setDefinitions(merged);
    const objCount = Object.keys(merged?.minecraft?.objective || {}).length;
    const addonCount = Object.keys(merged?.minecraft?.addon || {}).length;
    console.log('[RENDERER] 任务定义数据已加载, objective:', objCount, 'addon:', addonCount);

    // 如果已在可视化模式，刷新编辑器以显示新定义
    if (isVisualMode && visualEditor && currentFile) {
      renderVisualEditor();
    }
  } catch (e) {
    console.warn('[RENDERER] 加载 desc 定义数据失败:', e.message);
  }
}

// 暴露 reload 函数到全局方便调试
window.reloadQuestDefinitions = () => {
  console.log('[RENDERER] 手动重新加载 desc 定义数据...');
  loadQuestDefinitions();
};
// ============================================

function getFileName(path) {
  return path.split(/[\\/]/).pop();
}

function updateStatus(message) {
  if (statusInfo) {
    statusInfo.textContent = message;
  }
  // 暴露给 ChemdahInterpreter
  window.updateStatus = updateStatus;
}

function showErrorDialog(title, message) {
  playSound('error');
  console.error(`${title}: ${message}`);
  alert(`${title}\n\n${message}`);
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// ============================================
// 导出状态用于调试
// ============================================

window.appState = {
  get currentProjectPath() {
    return currentProjectPath;
  },
  get currentFile() {
    return currentFile;
  },
  get files() {
    return files;
  },
  get openTabs() {
    return openTabs;
  },
  get activeTab() {
    return activeTab;
  },
  get isVisualMode() {
    return isVisualMode;
  },
};
console.log('[RENDERER] DOM ready, saveBtn:', !!saveBtn, 'settingsBtn:', !!settingsBtn);
window.addEventListener('focus', () => {
  // 页面重新获得焦点时，重新应用存储的主题
  const stored = localStorage.getItem('editorConfig');
  if (stored) {
    try {
      const config = JSON.parse(stored);
      document.body.setAttribute('data-theme', config.theme || 'dark');

      // 重新应用所有颜色变量
      if (config.colors) {
        Object.entries(config.colors).forEach(([key, value]) => {
          const cssVarName = `--color-${camelToKebab(key)}`;
          document.documentElement.style.setProperty(cssVarName, value);
        });
      }

      // 重新应用背景图片到 body
      const body = document.body;
      if (config.background && config.background.filename) {
        const bg = config.background;
        const theme = body.getAttribute('data-theme') || 'dark';
        const opacity = bg.opacity ?? 0.3;
        const alpha = (1 - opacity) * 0.6;
        const bgColor = theme === 'light' ? 'rgba(255,255,255,' + alpha + ')' : 'rgba(0,0,0,' + alpha + ')';
        body.style.background = 'linear-gradient(' + bgColor + ', ' + bgColor + '), url(background/' + bg.filename + ') center/cover no-repeat fixed';
      } else {
        const theme = body.getAttribute('data-theme') || 'dark';
        body.style.background = theme === 'light' ? '#ffffff' : '#000000';
      }
    } catch (e) {
      console.error('[RENDERER] 应用存储设置失败:', e);
    }
  }
});

// 工具函数（添加到 renderer.js）
function updateCodeMirrorMode(filePath) {
  if (!codeMirrorEditor) return;

  let mode = 'yaml'; // 默认模式
  if (filePath.endsWith('.json')) {
    mode = 'application/json';
  } else if (filePath.endsWith('.js') || filePath.endsWith('.javascript')) {
    mode = 'javascript';
  } else if (filePath.endsWith('.xml')) {
    mode = 'xml';
  } else if (filePath.endsWith('.css')) {
    mode = 'css';
  } else if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
    mode = 'htmlmixed';
  } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    mode = 'yaml';
  } else {
    mode = null; // 纯文本
  }

  codeMirrorEditor.setOption('mode', mode);
}

function camelToKebab(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}