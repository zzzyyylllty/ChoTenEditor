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

// 远程文件管理
let _fmMode = 'local'; // 'local' | 'remote'
let _remoteFiles = [];
let _remoteDirPath = '';
let _editingFilesMap = {}; // { filePath: true } 当前客户端正在编辑的文件
let _otherEditingFiles = {}; // { filePath: true } 其他人正在编辑的文件

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
  // 同步到全局标志供可视化编辑器使用
  window.__keAutoSync = autoSyncEnabled;
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
      let typeMsg = I18N.t('status.projectOpened', { name: getFileName(state.currentProjectPath) });
      if (types.hasConversation && types.hasQuest) {
        typeMsg += I18N.t('status.projectTypesConversationQuest');
      } else if (types.hasConversation) {
        typeMsg += I18N.t('status.projectTypesConversation');
      } else if (types.hasQuest) {
        typeMsg += I18N.t('status.projectTypesQuest');
      }
      updateStatus(typeMsg);
    } else {
      updateStatus(I18N.t('status.projectOpened', { name: state.currentProjectPath }));
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

document.addEventListener('DOMContentLoaded', async () => {

  // 等待本地化字典就绪（首次启动时等待用户选择语言）
  try { await I18N.ready; } catch (e) {}

  setTimeout(async () => {

    // 检查 electronAPI
    if (!window.electronAPI) {
      console.error('[RENDERER] electronAPI 不可用!');
      showErrorDialog(
        I18N.t('dialog.apiInitFailed'),
        I18N.t('dialog.apiInitFailedMsg')
      );
      return;
    }

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
  codeMirrorEditor.setOption('theme', theme);
}

// ============================================
// CodeMirror 初始化
// ============================================

function initCodeMirror() {
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


  // 暴露给 ChemdahInterpreter（可视化编辑器需要同步到源码）
  window.codeMirrorEditor = codeMirrorEditor;
}

// ============================================
// 初始化函数
// ============================================

function init() {
  initCodeMirror();
  setupEventListeners();
  updateNavigationButtons();

  // 应用已保存的配置（主题/字体/颜色/背景）
  applyStoredConfig();

  // 加载自动同步设置
  loadAutoSyncSetting();

  updateStatus(I18N.t('status.ready'));

  // 从 desc/ 目录加载任务定义数据
  loadQuestDefinitions();

  // 启动预热（异步，不阻塞界面）
  prewarmStartup();

  // 监听 localStorage 变化，更新 CodeMirror 主题
  window.addEventListener('storage', (e) => {
    if (e.key === 'editorConfig') {
      updateCodeMirrorTheme();
    }
  });

  // 隐藏加载页面（从设置页返回时 inline script 已直接 display:none）
  var splash = document.getElementById('splash-overlay');
  if (splash && splash.style.display !== 'none') {
    setTimeout(function() { splash.classList.add('hidden'); }, 400);
  }

  // 标题栏显示版本号（便于区分旧版/新版）
  try {
    if (window.electronAPI && window.electronAPI.appVersion) {
      var tbt = document.querySelector('.title-bar-text');
      if (tbt) tbt.textContent = 'Choten Editor v' + window.electronAPI.appVersion;
    }
  } catch (e) {}

  // 恢复上次的会话
  restoreAppState();

  // 根据设置决定是否打开 DevTools
  if (window.electronAPI && window.electronAPI.openDevTools) {
    try {
      var cfg = JSON.parse(localStorage.getItem('editorConfig') || '{}');
      if (cfg.devTools === true) {
        window.electronAPI.openDevTools();
      }
    } catch (_) {}
  }

  // 监听页面关闭/刷新，防止丢失未保存更改
  window.addEventListener('beforeunload', function (e) {
    if (window.__allowUnload) return;
    var hasDirty = Object.values(dirtyTabs).some(function(v) { return v === true; });
    if (hasDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

}

// ============================================
// 事件监听设置
// ============================================

function setupEventListeners() {

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
  const remoteBtn = document.getElementById('remote-btn');
  if (remoteBtn) remoteBtn.addEventListener('click', () => { playSound('select'); openRemoteMode(); });
  const aiBtn = document.getElementById('ai-btn');
  if (aiBtn) aiBtn.addEventListener('click', () => { playSound('select'); openAIPanel(); });

  // 编辑器模式按钮
  if (sourceModeBtn) sourceModeBtn.addEventListener('click', async () => { playSound('click'); await switchEditorMode(false); });
  if (visualModeBtn) visualModeBtn.addEventListener('click', async () => { playSound('click'); await switchEditorMode(true); });

  // 编辑器文本框
  if (codeMirrorEditor) codeMirrorEditor.on('change', handleEditorChange);

  // 导航按钮
  if (navUpBtn) navUpBtn.addEventListener('click', () => { playSound('click'); navigateUp(); });
  if (navBackBtn) navBackBtn.addEventListener('click', () => { playSound('back'); navigateBack(); });

  // 解释器类型选择器
  const typeSelect = document.getElementById('interpreter-type-select');
  if (typeSelect) {
    typeSelect.addEventListener('change', function () {
      playSound('click');
      const val = this.value;
      if (!currentFile || typeof ChemdahInterpreter === 'undefined') return;

      if (val === 'auto') {
        ChemdahInterpreter.removeTypeOverride(currentFile);
        updateStatus(I18N.t('status.interpreterTypeAuto'));
      } else {
        ChemdahInterpreter.setTypeOverride(currentFile, val);
        updateStatus(I18N.t('status.interpreterType', { type: typeLabel(val) }));
      }

      // 如果当前在可视化模式，重新渲染
      if (isVisualMode && visualEditor) {
        renderVisualEditor();
      }
    });
  }

  // 键盘快捷键 (从设置读取, 支持自定义组合键)
  document.addEventListener('keydown', async function (e) {
    const hit = (combo) => matchShortcut(e, combo);
    if (hit(_ceShortcuts.save)) {
      e.preventDefault();
      playSound('save');
      saveCurrentFile();
    } else if (hit(_ceShortcuts.newFile)) {
      e.preventDefault();
      playSound('click');
      createNewFile();
    } else if (hit(_ceShortcuts.openProject)) {
      e.preventDefault();
      playSound('click');
      openProject();
    } else if (hit(_ceShortcuts.toggleMode)) {
      e.preventDefault();
      playSound('click');
      // 检查是否可以对当前文件切换
      if (currentFile && (currentFile.endsWith('.yml') || currentFile.endsWith('.yaml'))) {
        await switchEditorMode(!isVisualMode);
      }
    }
  });

  // 文件管理器选项卡切换
  document.querySelectorAll('.fm-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var mode = this.dataset.fm;
      if (mode === _fmMode) return;
      _fmMode = mode;
      document.querySelectorAll('.fm-tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      // 显示/隐藏删除按钮
      document.getElementById('fm-delete').style.display = 'none';
      if (mode === 'remote') {
        // 切换到远程：请求远程文件列表
        if (window.electronAPI && window.electronAPI.remote) {
          window.electronAPI.remote.getClientStatus().then(function(rs) {
            if (rs && rs.connected) {
              window.electronAPI.remote.requestFileList({ dirPath: _remoteDirPath || '/' });
            }
          }).catch(function() {});
        }
      } else {
        // 切换到本地：重新加载当前目录
        if (currentDirectoryPath) {
          loadDirectory(currentDirectoryPath, true);
        }
      }
    });
  });

  // 重新加载按钮
  var reloadBtn = document.getElementById('fm-reload');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', function() {
      playSound('click');
      if (_fmMode === 'remote') {
        if (window.electronAPI && window.electronAPI.remote) {
          window.electronAPI.remote.requestFileList({ dirPath: _remoteDirPath || '/' });
        }
      } else if (currentDirectoryPath) {
        loadDirectory(currentDirectoryPath, true);
      }
    });
  }

  // 删除按钮
  var deleteBtn = document.getElementById('fm-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async function() {
      var selected = fileTreeEl.querySelector('li.selected');
      if (!selected) return;
      var path = selected.dataset.path;
      if (!path) return;
      if (!(await UI.confirm({ message: I18N.t('confirm.deleteFile', { name: getFileName(path) }) }))) return;
      playSound('click');
      if (_fmMode === 'remote') {
        if (window.electronAPI && window.electronAPI.remote) {
          window.electronAPI.remote.requestFileDelete({ filePath: path });
          setRemoteStatus('rm-client-status', I18N.t('rm.requestingDelete'));
        }
      } else {
        // 本地删除
        try {
          await _electronAPI.deleteFile(path);
          if (currentDirectoryPath) loadDirectory(currentDirectoryPath, true);
        } catch (e) {
          showErrorDialog(I18N.t('dialog.deleteFailed'), e.message);
        }
      }
    });
  }

  // 文件树右键菜单 - 选择文件以显示删除按钮
  if (fileTreeEl) {
    fileTreeEl.addEventListener('contextmenu', function(e) {
      var li = e.target.closest('li');
      if (li) {
        li.classList.add('selected');
        document.getElementById('fm-delete').style.display = '';
        e.preventDefault();
      }
    });
    // 点击其他地方取消选择
    fileTreeEl.addEventListener('click', function(e) {
      var li = e.target.closest('li');
      fileTreeEl.querySelectorAll('li.selected').forEach(function(el) { el.classList.remove('selected'); });
      if (li) li.classList.add('selected');
    });
  }

}

// ============================================
// 打开项目
// ============================================

async function openProject() {

  if (!_electronAPI || !_electronAPI.openDirectory) {
    showErrorDialog(I18N.t('dialog.apiError'), I18N.t('error.openDirectoryApi'));
    return;
  }

  try {
    const result = await _electronAPI.openDirectory();

    if (result && result.length > 0) {
      await openProjectPath(result[0]);
    } else {
    }
  } catch (error) {
    console.error('[RENDERER] 打开项目错误:', error);
    showErrorDialog(I18N.t('dialog.openProjectFailed'), error.message || error);
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
    let typeMsg = I18N.t('status.projectOpened', { name: getFileName(path) });
    if (types.hasConversation && types.hasQuest) {
      typeMsg += I18N.t('status.projectTypesConversationQuest');
    } else if (types.hasConversation) {
      typeMsg += I18N.t('status.projectTypesConversation');
    } else if (types.hasQuest) {
      typeMsg += I18N.t('status.projectTypesQuest');
    }
    updateStatus(typeMsg);
  } else {
    updateStatus(I18N.t('status.projectOpened', { name: path }));
  }

  saveAppState();
}

// ============================================
// 加载目录
// ============================================

async function loadDirectory(path, silent = false) {

  if (!_electronAPI || !_electronAPI.readdir) {
    if (!silent) showErrorDialog(I18N.t('dialog.apiError'), I18N.t('error.readdirApi'));
    return false;
  }

  try {
    const result = await _electronAPI.readdir(path);

    if (result.success) {
      files = result.files;
      renderFileTree(files);
      currentDirectoryPath = path;
      updateBreadcrumbs();
      updateNavigationButtons();
      updateStatus(I18N.t('status.directory', { path: path }));
      return true;
    } else {
      if (!silent) showErrorDialog(I18N.t('dialog.loadDirFailed'), result.error);
      return false;
    }
  } catch (error) {
    console.error('[RENDERER] 加载目录错误:', error);
    if (!silent) showErrorDialog(I18N.t('dialog.loadDirError'), error.message || error);
    return false;
  }
}

// ============================================
// 文件树渲染
// ============================================

function renderFileTree(files) {

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
    // 远程模式下标记其他人正在编辑的文件
    if (_fmMode === 'remote' && !file.isDirectory && _otherEditingFiles[file.path]) {
      li.classList.add('editing-by-other');
    }
    li.addEventListener('click', async () => { playSound('click'); await handleFileClick(file); });
    fileTreeEl.appendChild(li);
  });
}

// ============================================
// 处理文件点击
// ============================================

async function handleFileClick(file) {

  if (file.isDirectory) {
    if (_fmMode === 'remote') {
      // 远程模式：向服务器请求目录列表
      _remoteDirPath = file.path;
      if (window.electronAPI && window.electronAPI.remote) {
        window.electronAPI.remote.requestFileList({ dirPath: file.path });
        setRemoteStatus('rm-client-status', I18N.t('rm.loadingRemoteDir'));
      }
    } else {
      await navigateToDirectory(file.path);
    }
  } else {
    if (_fmMode === 'remote') {
      // 远程模式：向服务器请求文件内容
      if (window.electronAPI && window.electronAPI.remote) {
        setRemoteStatus('rm-client-status', I18N.t('rm.readingRemoteFile'));
        window.electronAPI.remote.requestFileRead({ filePath: file.path });
      }
    } else {
      // 检查不支持的格式
      var ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
      var unsupportedExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.exe', '.dll', '.so', '.bin', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.mp3', '.wav', '.ogg', '.mp4', '.avi', '.mov', '.mkv', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jar', '.class', '.ttf', '.otf', '.woff', '.woff2', '.iso', '.img', '.db', '.sqlite'];
      if (unsupportedExts.indexOf(ext) >= 0) {
        var confirmed = await showUnsupportedFormatDialog(ext);
        if (!confirmed) return;
      }
      await openFile(file.path);
    }
  }
}

// ============================================
// 打开文件
// ============================================

let _openingFile = null;
let _closingTabs = {};
let _loadingFile = false;
let _fileContents = {}; // 文件内容缓存，用于标签页切换
let _remoteSaveWaiters = {}; // path → [{resolve, timer}] 远程保存等待服务器确认

async function openFile(filePath, content) {

  // 防止重复打开同一文件
  if (_openingFile === filePath) {
    // 如果正在打开中但有内容到达（远程响应），先缓存内容供等待者使用
    if (content) {
      _fileContents[filePath] = content;
    }
    return;
  }
  // 防止在关闭过程中重新打开
  if (_closingTabs[filePath]) {
    var _wait = 0;
    while (_closingTabs[filePath] && _wait < 20) {
      await new Promise(function(r) { setTimeout(r, 50); });
      _wait++;
    }
    if (_closingTabs[filePath]) return;
  }

  if (currentFile === filePath && openTabs.includes(filePath)) {
    await setActiveTab(filePath);
    return;
  }
  _openingFile = filePath;

  // 缓存内容（当从远程加载或首次读取时）
  if (content) {
    _fileContents[filePath] = content;
  }

  // 无内容时尝试从缓存读取
  if (!content && _fileContents[filePath]) {
    content = _fileContents[filePath];
  }

  // 仍无内容时为远程模式：向服务器请求并等待
  if (!content && _fmMode === 'remote') {
    if (window.electronAPI && window.electronAPI.remote) {
      window.electronAPI.remote.requestFileRead({ filePath: filePath });
      setRemoteStatus('rm-client-status', I18N.t('rm.readingRemoteFile'));
      // 等待远程内容加载（最多等待 10 秒）
      for (var _w = 0; _w < 200; _w++) {
        await new Promise(function(r) { setTimeout(r, 50); });
        if (_fileContents[filePath]) {
          content = _fileContents[filePath];
          break;
        }
        if (_closingTabs[filePath]) {
          _openingFile = null;
          return;
        }
      }
      if (!content) {
        showErrorDialog(I18N.t('dialog.readFailed'), I18N.t('error.cannotReadRemote'));
        _openingFile = null;
        return;
      }
    } else {
      showErrorDialog(I18N.t('dialog.error'), I18N.t('error.remoteApiUnavailable'));
      _openingFile = null;
      return;
    }
  }

  if (!content && (!_electronAPI || !_electronAPI.readFile)) {
    showErrorDialog(I18N.t('dialog.apiError'), I18N.t('error.readFileApi'));
    _openingFile = null;
    return;
  }

  try {
    // 检查当前文件是否有未保存更改（避免与 _openingFile 冲突）
    if (currentFile && currentFile !== filePath && dirtyTabs[currentFile] && !_closingTabs[currentFile]) {
      var switchResult = await showDirtyConfirmDialog(getFileName(currentFile));
      if (_openingFile !== filePath) return; // 已被更新的打开请求抢占
      if (switchResult === 'cancel') {
        _openingFile = null;
        return;
      }
      if (switchResult === 'save') {
        var savedOk = await saveCurrentFile();
        if (_openingFile !== filePath) return;
        if (savedOk === false) {
          // 保存失败: 中止切换, 防止未保存修改被新内容覆盖
          _openingFile = null;
          return;
        }
      } else {
        // 放弃: 清除脏标记, 避免之后反复提示
        delete dirtyTabs[currentFile];
      }
    }

    if (!content) {
      const result = await _electronAPI.readFile(filePath);
      if (_openingFile !== filePath) return;
      if (!result.success) {
        showErrorDialog(I18N.t('dialog.readFailed'), result.error || I18N.t('error.cannotReadFile'));
        _openingFile = null;
        return;
      }
      content = result.content;
      _fileContents[filePath] = content; // 缓存本地读取的内容
    }

    // 添加标签页
    if (!openTabs.includes(filePath)) {
      openTabs.push(filePath);
      addTab(filePath);
    }

    // 更新编辑器内容（临时禁止脏标记）
    if (codeMirrorEditor) {
      _loadingFile = true;
      codeMirrorEditor.setValue(content);
      _loadingFile = false;
      delete dirtyTabs[filePath];
      updateTabDirtyIndicator(filePath);
      updateCodeMirrorMode(filePath);
    }

    // 激活标签页（放于 setValue 之后，以使 renderVisualEditor 读到最新内容）
    currentFile = filePath;
    activeTab = filePath;
    await setActiveTab(filePath);

    // 更新编辑器模式
    updateEditorModeForFile(filePath);

    // 更新状态栏
    if (filePathEl) {
      filePathEl.textContent = filePath;
    }

    // 检测类型并显示在状态栏
    if (typeof ChemdahInterpreter !== 'undefined') {
      const detectedType = detectCombinedType(filePath, content);
      if (detectedType !== 'unknown') {
        updateStatus(I18N.t('status.fileType', { name: getFileName(filePath), type: typeLabel(detectedType) }));
        // CE 文件: 异步回溯定位工程根, 仅追加归属展示, 不阻塞不导航
        if (detectedType === 'craftengine' && typeof CraftEngineInterpreter !== 'undefined') {
          CraftEngineInterpreter.resolveProjectRoot(filePath).then(function (r) {
            if (r && r.found && currentFile === filePath && !_closingTabs[filePath]) {
              updateStatus(I18N.t('status.fileType', { name: getFileName(filePath), type: typeLabel('craftengine') }) +
                I18N.t('status.ceOwner', { root: r.pluginRoot || r.packRoot || '', pack: r.namespace || '' }));
            }
          });
        }
      } else {
        updateStatus(I18N.t('status.file', { name: getFileName(filePath) }));
      }
    } else {
      updateStatus(I18N.t('status.file', { name: getFileName(filePath) }));
    }

    // 如果是远程文件，通知服务器开始编辑
    if (_fmMode === 'remote' && window.electronAPI && window.electronAPI.remote) {
      window.electronAPI.remote.notifyEditingStart({ filePath: filePath });
    }

    saveAppState();
    if (_openingFile === filePath) _openingFile = null;
  } catch (error) {
    console.error('[RENDERER] 打开文件错误:', error);
    showErrorDialog(I18N.t('dialog.openFileFailed'), error.message || error);
    if (_openingFile === filePath) _openingFile = null;
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

  if (!editorTabs) {
    console.error('[RENDERER] editorTabs 不存在');
    return;
  }

  // 防止重复标签
  if (findTabByPath(filePath)) {
    return;
  }

  const tab = document.createElement('div');
  tab.classList.add('editor-tab');
  tab.dataset.path = filePath;

  const nameSpan = document.createElement('span');
  nameSpan.classList.add('editor-tab-name');
  const baseName = getFileName(filePath);
  nameSpan.textContent = dirtyTabs[filePath] ? '● ' + baseName : baseName;
  nameSpan.setAttribute('data-tip', dirtyTabs[filePath] ? I18N.t('tab.unsavedTitle', { name: baseName }) : baseName);
  tab.appendChild(nameSpan);

  tab.addEventListener('click', async () => {
    playSound('click');
    await setActiveTab(filePath);
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

  // 更新标签页样式
  document.querySelectorAll('.editor-tab').forEach((tab) => {
    if (tab.dataset.path === filePath) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // 可视化模式下有未同步修改时, 切换前先确认
  // (可视化修改只存在于 _ceParsed 中, syncToSource 仅在切代码模式时触发, 直接切标签会丢失)
  if (currentFile && currentFile !== filePath && isVisualMode && visualEditor &&
      visualEditor._ceParsed && visualEditor._ceParsed._visualDirty) {
    var vdResult = await showUnsyncedConfirmDialog(getFileName(currentFile));
    if (vdResult === 'cancel') return;
    if (vdResult === 'sync' && typeof CraftEngineInterpreter !== 'undefined') {
      try {
        CraftEngineInterpreter.syncToSource(visualEditor._ceParsed);
        await saveCurrentFile();
      } catch (e) {
        console.error('[RENDERER] 同步可视化状态失败:', e);
      }
    }
  }

  // 如果文件不同，加载内容
  if (currentFile !== filePath) {
    await openFile(filePath);
    // 如果 openFile 未能成功加载（如远程缓存未命中），跳过后续操作
    if (currentFile !== filePath) return;
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

async function showDirtyConfirmDialog(fileName) {
  return await new Promise(function (resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'cv-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100001;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:10px;padding:24px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">' +
        '<h3 style="margin:0 0 12px;font-size:15px;">' + I18N.t('tabs.unsaved') + '</h3>' +
        '<p style="margin:0 0 20px;font-size:13px;color:var(--color-text-secondary);line-height:1.5;">' +
          (fileName ? I18N.t('tabs.unsavedMsg', { name: escapeHtml(fileName) }) : I18N.t('tabs.unsavedMsgNoName')) +
        '</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="cv-btn cv-btn-secondary" id="dirty-save">' + I18N.t('tabs.save') + '</button>' +
          '<button class="cv-btn cv-btn-secondary" id="dirty-discard">' + I18N.t('tabs.discard') + '</button>' +
          '<button class="cv-btn cv-btn-primary" id="dirty-cancel">' + I18N.t('tabs.cancel') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#dirty-save').addEventListener('click', function () {
      overlay.remove(); resolve('save');
    });
    overlay.querySelector('#dirty-discard').addEventListener('click', function () {
      overlay.remove(); resolve('discard');
    });
    overlay.querySelector('#dirty-cancel').addEventListener('click', function () {
      overlay.remove(); resolve('cancel');
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === this) { this.remove(); resolve('cancel'); }
    });
  });
}
async function showUnsyncedConfirmDialog(fileName) {
  return await new Promise(function (resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'cv-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100001;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:10px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">' +
        '<h3 style="margin:0 0 12px;font-size:15px;">' + I18N.t('tabs.unsynced') + '</h3>' +
        '<p style="margin:0 0 20px;font-size:13px;color:var(--color-text-secondary);line-height:1.5;">' +
          (fileName ? I18N.t('tabs.unsyncedMsg', { name: escapeHtml(fileName) }) : I18N.t('tabs.unsyncedMsgNoName')) +
        '</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="cv-btn cv-btn-secondary" id="unsynced-discard">' + I18N.t('tabs.discard') + '</button>' +
          '<button class="cv-btn cv-btn-secondary" id="unsynced-cancel">' + I18N.t('tabs.cancel') + '</button>' +
          '<button class="cv-btn cv-btn-primary" id="unsynced-sync">' + I18N.t('tabs.syncAndContinue') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#unsynced-sync').addEventListener('click', function () {
      overlay.remove(); resolve('sync');
    });
    overlay.querySelector('#unsynced-discard').addEventListener('click', function () {
      overlay.remove(); resolve('discard');
    });
    overlay.querySelector('#unsynced-cancel').addEventListener('click', function () {
      overlay.remove(); resolve('cancel');
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === this) { this.remove(); resolve('cancel'); }
    });
  });
}

// 暴露给页面内脚本（如标题栏关闭按钮）
window.__showDirtyConfirm = showDirtyConfirmDialog;
window.__saveAllDirtyFiles = saveAllDirtyFiles;

async function showUnsupportedFormatDialog(ext) {
  return await new Promise(function (resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'cv-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100001;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:10px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">' +
        '<h3 style="margin:0 0 12px;font-size:15px;">' + I18N.t('unsupported.title') + '</h3>' +
        '<p style="margin:0 0 20px;font-size:13px;color:var(--color-text-secondary);line-height:1.5;">' + I18N.t('unsupported.msg', { ext: escapeHtml(ext) }) + '</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="cv-btn cv-btn-danger" id="unsup-force">' + I18N.t('unsupported.forceLoad') + '</button>' +
          '<button class="cv-btn cv-btn-primary" id="unsup-cancel">' + I18N.t('tabs.cancel') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#unsup-force').addEventListener('click', function () {
      overlay.remove(); resolve(true);
    });
    overlay.querySelector('#unsup-cancel').addEventListener('click', function () {
      overlay.remove(); resolve(false);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === this) { this.remove(); resolve(false); }
    });
  });
}

async function saveAllDirtyFiles() {
  // 只有当前文件（CodeMirror 中加载的）才能保存，其他标签切换时内容已丢失
  if (currentFile && dirtyTabs[currentFile] && codeMirrorEditor) {
    await saveCurrentFile();
  }
  // 无法保存其他标签的未保存更改（切换标签时编辑内容已丢失）
  // 将它们的脏标记清除
  for (var p = 0; p < openTabs.length; p++) {
    var fp = openTabs[p];
    if (dirtyTabs[fp] && fp !== currentFile) {
      delete dirtyTabs[fp];
      updateTabDirtyIndicator(fp);
    }
  }
}

async function closeTab(filePath, force = false) {

  // 标记正在关闭，防止并发重复打开
  _closingTabs[filePath] = true;

  // 检查是否有未保存的更改
  if (!force && dirtyTabs[filePath]) {
    const fileName = getFileName(filePath);
    const result = await showDirtyConfirmDialog(fileName);

    if (result === 'cancel') {
      delete _closingTabs[filePath]; return;
    }
    if (result === 'save' && currentFile === filePath) {
      await saveCurrentFile();
    }
    // 后台标签: 缓冲区已不属于它(切换标签时内容即丢失), 按放弃处理, 防止把当前文件内容写入被关闭文件
  }

  delete dirtyTabs[filePath];
  delete _fileContents[filePath];

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
      updateStatus(I18N.t('status.noFileOpen'));
    }
  }

  // 如果是远程文件，通知服务器停止编辑
  if (_fmMode === 'remote' && window.electronAPI && window.electronAPI.remote) {
    try { window.electronAPI.remote.notifyEditingEnd({ filePath: filePath }); } catch (e) {}
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
    { label: I18N.t('tabMenu.closeCurrent'), icon: '×', fn: function() { closeTab(filePath); } },
    { label: I18N.t('tabMenu.closeSaved'), icon: '✓', fn: function() { closeSavedTabs(); } },
    { type: 'sep' },
    { label: I18N.t('tabMenu.closeLeft'), icon: '◀', fn: function() { closeTabsDirection(filePath, 'left'); } },
    { label: I18N.t('tabMenu.closeRight'), icon: '▶', fn: function() { closeTabsDirection(filePath, 'right'); } },
    { type: 'sep' },
    { label: I18N.t('tabMenu.closeAll'), icon: '■■', fn: function() { closeAllTabs(filePath); } },
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

  if (currentDirectoryPath) {
    directoryHistory.push(currentDirectoryPath);
  }
  await loadDirectory(dirPath);
}

async function navigateUp() {

  if (!currentDirectoryPath || currentDirectoryPath === currentProjectPath) {
    return;
  }

  const parentPath = getParentPath(currentDirectoryPath);
  await navigateToDirectory(parentPath);
}

async function navigateBack() {

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
  crumbs.push({ name: I18N.t('breadcrumb.root'), path: currentProjectPath });

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

  if (!currentProjectPath) {
    await UI.alert({ message: I18N.t('alert.openProjectFirst') });
    return;
  }

  const fileName = await UI.prompt({ message: I18N.t('prompt.newFileName') });
  if (!fileName) return;
  // 拒绝路径分隔符与相对路径, 防止在项目目录外创建文件
  if (/[\\/]|\.\./.test(fileName)) {
    showErrorDialog(I18N.t('dialog.createFileFailed'), I18N.t('dialog.invalidFileName'));
    return;
  }

  const basePath = currentDirectoryPath || currentProjectPath;
  const filePath = `${basePath}/${fileName}`;

  try {
    const result = await _electronAPI.writeFile(filePath, '');
    if (result.success) {
      await loadDirectory(basePath);
      await openFile(filePath);
      updateStatus(I18N.t('status.fileCreated', { path: filePath }));
    } else {
      showErrorDialog(I18N.t('dialog.createFileFailed'), result.error);
    }
  } catch (error) {
    showErrorDialog(I18N.t('dialog.createFileFailed'), error.message || error);
  }
}

async function saveCurrentFile() {

  if (!currentFile) {
    await UI.alert({ message: I18N.t('alert.noFileOpen') });
    return false;
  }

  if (!codeMirrorEditor) {
    showErrorDialog(I18N.t('dialog.error'), I18N.t('error.codemirrorMissing'));
    return false;
  }

  const content = codeMirrorEditor.getValue();

  try {
    if (_fmMode === 'remote' && window.electronAPI && window.electronAPI.remote) {
      // 远程保存: 不立即清除脏标记, 等服务器 file:write:result 确认成功
      const path = currentFile;
      _fileContents[path] = content; // 预存提交内容
      window.electronAPI.remote.requestFileWrite({ filePath: path, content: content });
      setRemoteStatus('rm-client-status', I18N.t('rm.savingRemoteFile'));
      const ok = await new Promise(function (resolve) {
        const timer = setTimeout(function () {
          const arr = _remoteSaveWaiters[path];
          if (arr) {
            _remoteSaveWaiters[path] = arr.filter(function (w) { return w.timer !== timer; });
            if (!_remoteSaveWaiters[path].length) delete _remoteSaveWaiters[path];
          }
          showErrorDialog(I18N.t('dialog.saveFileFailed'), I18N.t('rm.saveTimeout'));
          resolve(false);
        }, 10000);
        if (!_remoteSaveWaiters[path]) _remoteSaveWaiters[path] = [];
        _remoteSaveWaiters[path].push({ resolve, timer });
      });
      if (ok) {
        if (dirtyTabs[path]) {
          dirtyTabs[path] = false;
          updateTabDirtyIndicator(path);
        }
        playSound('save');
      }
      return ok;
    }

    const result = await _electronAPI.writeFile(currentFile, content);
    if (result.success) {
      playSound('save');
      dirtyTabs[currentFile] = false;
      _fileContents[currentFile] = content; // 更新缓存
      updateTabDirtyIndicator(currentFile);
      updateStatus(I18N.t('status.fileSaved', { path: currentFile }));
      return true;
    } else {
      showErrorDialog(I18N.t('dialog.saveFileFailed'), result.error);
      return false;
    }
  } catch (error) {
    showErrorDialog(I18N.t('dialog.saveFileFailed'), error.message || error);
    return false;
  }
}

// ============================================
// 编辑器模式
// ============================================

async function switchEditorMode(visual) {
  // 从激活标签页 DOM 获取当前文件路径（比 currentFile 更可靠）
  var tabEl = document.querySelector('.editor-tab.active');
  var activeTabPath = tabEl ? tabEl.dataset.path : null;
  if (activeTabPath && activeTabPath !== currentFile) {
    currentFile = activeTabPath;
  }


  // 可视化编辑器有尚未同步到源码的更改: 切到源代码模式前先弹确认
  // (同步并继续 → 缓冲区更新后走保留+自动保存; 放弃 → 丢弃未同步的可视化更改)
  if (!visual && isVisualMode && currentFile &&
      visualEditor && visualEditor._ceParsed && visualEditor._ceParsed._visualDirty) {
    var usResult = await showUnsyncedConfirmDialog(getFileName(currentFile));
    if (usResult === 'cancel') {
      return;
    }
    if (usResult === 'sync' && typeof CraftEngineInterpreter !== 'undefined') {
      try {
        CraftEngineInterpreter.syncToSource(visualEditor._ceParsed);
      } catch (e) {
        console.error('[RENDERER] 同步可视化状态失败:', e);
      }
    }
  }

  // 可视化模式下缓冲区的改动均来自"同步到源码"写入, 即最新可视化状态:
  // 切到源代码模式时直接保留缓冲区, 不再弹"未保存更改"提示, 也不从磁盘重载
  // (重载会覆盖刚同步的可视化改动), 并自动保存到磁盘, 让未保存标记随写入完成消失。
  // 源代码模式下的手工编辑仍走保存/放弃确认。
  var keepBuffer = !visual && isVisualMode && currentFile && dirtyTabs[currentFile];

  // 切换模式前处理未保存更改
  if (!keepBuffer && currentFile && dirtyTabs[currentFile]) {
    var swResult = await showDirtyConfirmDialog(getFileName(currentFile));
    if (swResult === 'cancel') {
      return;
    }
    if (swResult === 'save') {
      await saveCurrentFile();
    } else {
      // 放弃: 清除脏标记, 避免之后反复提示
      delete dirtyTabs[currentFile];
    }
  }

  // 切换到源代码模式：始终从磁盘重新加载（CodeMirror 在隐藏时 DOM 可能过期）
  if (currentFile && !visual) {
    if (keepBuffer) {
      // 缓冲区已含"同步到源码"写入的最新内容: 保留并自动保存, 保证切回可视化不丢状态
      saveCurrentFile();
    } else {
      if (_fmMode !== 'remote' && _electronAPI && _electronAPI.readFile) {
        var reloadResult = await _electronAPI.readFile(currentFile);
        if (reloadResult && reloadResult.success) {
          var freshContent = reloadResult.content;
          _loadingFile = true;
          codeMirrorEditor.setValue(freshContent);
          _loadingFile = false;
          delete dirtyTabs[currentFile];
          updateTabDirtyIndicator(currentFile);
          _fileContents[currentFile] = freshContent;
          updateCodeMirrorMode(currentFile);
        }
      } else if (_fmMode === 'remote' && window.electronAPI && window.electronAPI.remote) {
        window.electronAPI.remote.requestFileRead({ filePath: currentFile });
      }
    }
  } else if (currentFile && visual && _fileContents[currentFile]) {
    // 切换到可视化模式：从缓存加载正确内容
    _loadingFile = true;
    codeMirrorEditor.setValue(_fileContents[currentFile]);
    _loadingFile = false;
    delete dirtyTabs[currentFile];
    updateTabDirtyIndicator(currentFile);
  }

  isVisualMode = visual;

  // 获取类型选择器
  const typeSelector = document.getElementById('editor-type-selector');
  const typeSelect = document.getElementById('interpreter-type-select');

  if (visual) {
    if (sourceEditor) sourceEditor.style.display = 'none';
    if (visualEditor) visualEditor.classList.add('active');
    if (sourceModeBtn) sourceModeBtn.classList.remove('active');
    if (visualModeBtn) visualModeBtn.classList.add('active');
    updateStatus(I18N.t('status.visualMode'));

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

    if (currentFile && (currentFile.endsWith('.yml') || currentFile.endsWith('.yaml'))) {
      renderVisualEditor();
    } else if (visualEditor) {
      // 不支持可视化编辑的文件类型，显示提示
      visualEditor.innerHTML = currentFile
        ? '<div class="empty-state"><h2>' + I18N.t('editor.visualEmptyTitle') + '</h2><p>' + I18N.t('visual.onlyYaml') + '</p></div>'
        : '<div class="empty-state"><h2>' + I18N.t('editor.visualEmptyTitle') + '</h2><p>' + I18N.t('editor.visualEmptyHint') + '</p></div>';
    }
  } else {
    if (sourceEditor) sourceEditor.style.display = 'block';
    if (visualEditor) visualEditor.classList.remove('active');
    if (sourceModeBtn) sourceModeBtn.classList.add('active');
    if (visualModeBtn) visualModeBtn.classList.remove('active');
    if (typeSelector) typeSelector.style.display = 'none';
    updateStatus(I18N.t('status.sourceMode'));
    // 在可视化模式下，CodeMirror 被隐藏，setValue 的 DOM 更新可能被延迟。
    // 恢复显示后强制刷新，确保显示正确的文件内容。
    if (codeMirrorEditor) {
      setTimeout(function() { codeMirrorEditor.refresh(); }, 50);
    }
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
    switchEditorMode(false).catch(function(e) { console.error('[RENDERER] 强制切换模式失败:', e); });
  }
}

function renderVisualEditor() {
  if (!codeMirrorEditor || !visualEditor) return;
  if (!currentFile) return;

  // 仅支持 YAML 文件
  if (!currentFile.endsWith('.yml') && !currentFile.endsWith('.yaml')) {
    visualEditor.innerHTML = `
      <div class="empty-state">
        <h2>${I18N.t('editor.visualEmptyTitle')}</h2>
        <p>${I18N.t('visual.onlyYaml')}</p>
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
          <strong>${I18N.t('visual.interpreterMissing')}</strong>
          <p>${I18N.t('visual.interpreterMissingMsg')}</p>
        </div>
      </div>
    `;
    return;
  }

  // 获取类型覆盖设置
  const overrideType = ChemdahInterpreter.getTypeOverride(currentFile);
  const ceType = (!overrideType && typeof CraftEngineInterpreter !== 'undefined')
    ? CraftEngineInterpreter.detectFileType(content, currentFile) : null;

  try {
    if (overrideType === 'craftengine' || ceType) {
      // CE 配置 → CraftEngine 可视化编辑器
      CraftEngineInterpreter.render(currentFile, content, visualEditor, {
        forceType: overrideType || null,
      });
    } else {
      ChemdahInterpreter.render(currentFile, content, visualEditor, {
        forceType: overrideType || null,
      });
    }
  } catch (error) {
    console.error('[RENDERER] 可视化渲染错误:', error);
    visualEditor.innerHTML = `
      <div class="cv-error-banner">
        <span class="cv-error-icon">⚠️</span>
        <div>
          <strong>${I18N.t('visual.renderFailed')}</strong>
          <p>${escapeHtml(error.message)}</p>
          <p>${I18N.t('visual.editInSource')}</p>
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
  updateStatus(I18N.t('status.typeOverrideCleared'));

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

  const detectedType = detectCombinedType(
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
    updateStatus(I18N.t('status.typeOverrideSet', { type: typeLabel(type), scope: scopeLabel(scope) }));

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
    updateStatus(I18N.t('status.fileModified'));

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
    nameSpan.setAttribute('data-tip', isDirty ? I18N.t('tab.unsavedTitle', { name: baseName }) : baseName);
  }
}

// ============================================
// 设置相关（弹窗模式）
// ============================================

function openSettings() {
  const overlay = document.getElementById('st-overlay');
  const frame = document.getElementById('st-frame');
  if (!overlay || !frame) {
    // 回退：无弹窗结构时跳转独立页面
    window.__allowUnload = true;
    setTimeout(() => { window.location.href = 'settings.html'; }, 120);
    return;
  }
  // 每次打开重新加载 iframe，确保展示最新配置
  frame.src = 'settings.html';
  overlay.style.display = 'flex';
}

// 请求 iframe 保存设置，等它保存完成（含异步操作如密码哈希）再关闭
function requestCloseSettingsModal() {
  const frame = document.getElementById('st-frame');
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage({ type: 'saveSettings' }, '*');
  } else {
    finishCloseSettingsModal();
  }
}

function finishCloseSettingsModal() {
  const overlay = document.getElementById('st-overlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  applyStoredConfig();
  updateCodeMirrorTheme();
}

// 设置页 iframe 内点击"返回编辑器"时关闭弹窗 (校验消息来源, 忽略其它窗口消息)
window.addEventListener('message', (e) => {
  const frame = document.getElementById('st-frame');
  if (!frame || !frame.contentWindow || e.source !== frame.contentWindow) return;
  if (e.data && e.data.type === 'closeSettings') {
    requestCloseSettingsModal();
  } else if (e.data && e.data.type === 'settingsSaved') {
    finishCloseSettingsModal();
  } else if (e.data && e.data.type === 'langChanged') {
    // 语言切换后整页重载应用新语言 (设置 iframe 已自行 reload)
    location.reload();
  }
});

// Esc 关闭设置弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('st-overlay');
    if (overlay && overlay.style.display !== 'none') requestCloseSettingsModal();
  }
});

// F12 切换调试屏幕 (DevTools)
document.addEventListener('keydown', (e) => {
  if (e.key === 'F12') {
    if (window.electronAPI && window.electronAPI.toggleDevTools) {
      window.electronAPI.toggleDevTools();
    }
  }
});

function openAIPanel() {
  if (typeof AIPanel !== 'undefined' && AIPanel.open) {
    // 更新当前文件上下文
    var ctx = currentFile || '';
    AIPanel.setFileContext(ctx);
    AIPanel.open();
  } else {
    console.warn('[RENDERER] AIPanel 未加载');
  }
}

/**
 * 从 desc/ 目录加载 Chemdah 定义数据（objective、addon 等）
 * 读取 api-default.json + api-*.json，合并后传入解释器
 */
// ============================================
// 启动预热
// ============================================

async function prewarmStartup() {
  try {
    var cfg = JSON.parse(localStorage.getItem('editorConfig') || '{}');
    var pw = cfg.prewarm || {};
    var prewarmSize = 0;
    var maxBytes = (pw.filesMaxMb || 50) * 1024 * 1024;

    // 预热文件
    if (pw.files !== false && _electronAPI && _electronAPI.readFile) {
      var appStateStr = localStorage.getItem('appState');
      if (appStateStr) {
        try {
          var state = JSON.parse(appStateStr);
          var tabs = state.openTabs || [];
          for (var i = 0; i < tabs.length; i++) {
            if (prewarmSize >= maxBytes) break;
            if (tabs[i] === state.currentFile) continue; // 当前文件将在 restoreAppState 中加载
            if (_fileContents[tabs[i]]) continue; // 已缓存
            var result = await _electronAPI.readFile(tabs[i]);
            if (result && result.success && result.content) {
              _fileContents[tabs[i]] = result.content;
              prewarmSize += result.content.length;
            }
          }
        } catch (_) {}
      }
    }

    // 预热 Kether 动作
    if (pw.kether !== false && window.KetherEditor && window.KetherEditor.loadActions) {
      window.KetherEditor.loadActions().then(function() {
      }).catch(function() {});
    }
  } catch (_) {}
}

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
    const dirResult = await _electronAPI.readdir(descPath);
    if (!dirResult.success) {
      console.warn('[RENDERER] 读取 desc 目录失败:', descPath, dirResult.error);
      return;
    }

    let merged = {};
    const jsonFiles = dirResult.files.filter(f => f.name.endsWith('.json') && !f.isDirectory);

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
  loadQuestDefinitions();
};
// ============================================

function getFileName(path) {
  return path.split(/[\\/]/).pop();
}

// 解释器类型 id → 本地化标签
function typeLabel(type) {
  if (type === 'conversation') return I18N.t('editor.typeConversation');
  if (type === 'quest') return I18N.t('editor.typeQuest');
  if (type === 'craftengine') return I18N.t('editor.typeCraftEngine');
  return type;
}

// 组合检测: 用户覆盖 → chemdah(路径/内容) → CE 内容启发式
function detectCombinedType(filePath, content) {
  if (typeof ChemdahInterpreter !== 'undefined') {
    var chemdahType = ChemdahInterpreter.detectFileType(filePath, content);
    if (chemdahType !== 'unknown') return chemdahType;
  }
  if (typeof CraftEngineInterpreter !== 'undefined') {
    var ceType = CraftEngineInterpreter.detectFileType(content, filePath);
    if (ceType !== 'unknown') return 'craftengine';
  }
  return 'unknown';
}

// 解释器类型覆盖范围 → 本地化标签
function scopeLabel(scope) {
  if (scope === 'directory') return I18N.t('typeScope.directory');
  if (scope === 'project') return I18N.t('typeScope.project');
  return I18N.t('typeScope.file');
}

// 远程消息：对象带 errorKey 时双语言显示，纯字符串原样显示（兼容旧端）
function localizeRemoteMsg(msg) {
  if (msg && typeof msg === 'object') {
    return I18N.localizeRemote(msg.error || msg.message || '', msg.errorKey || msg.messageKey, msg.errorKeyParams || msg.messageKeyParams);
  }
  return msg || '';
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
  UI.alert({ title: title, message: message || '' });
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

// 暴露脏状态供页面内脚本使用
Object.defineProperty(window, '__hasDirtyTabs', {
  get: function() { return Object.values(dirtyTabs).some(function(v) { return v === true; }); }
});

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
// auto 主题: 跟随系统 prefers-color-scheme
function resolveTheme(t) {
  if (t === 'auto') {
    try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  }
  return t || 'dark';
}
// 系统主题切换时自动重新应用 (仅 auto 模式)
try {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
    const c = localStorage.getItem('editorConfig');
    if (!c) return;
    try { if ((JSON.parse(c).theme || 'dark') === 'auto') applyStoredConfig(); } catch (e) {}
  });
} catch (e) {}

// 重新应用存储的主题/颜色/背景（窗口重新聚焦或设置弹窗关闭时调用）
// 快捷键配置 (由 applyStoredConfig 刷新; 无配置时用默认值)
let _ceShortcuts = { save: 'Ctrl+S', newFile: 'Ctrl+N', openProject: 'Ctrl+O', toggleMode: 'F2' };
// 匹配按键事件与 "Ctrl+S" 格式组合键 (配置中未含的修饰键若被按下则不匹配, 避免误触发)
function matchShortcut(e, combo) {
  if (!combo) return false;
  const parts = String(combo).split('+').map(s => s.trim().toLowerCase());
  const keyPart = parts.pop();
  const wantCtrl = parts.includes('ctrl') || parts.includes('control');
  const wantMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');
  const wantShift = parts.includes('shift');
  const wantAlt = parts.includes('alt');
  if (wantCtrl !== e.ctrlKey) return false;
  if (wantMeta !== e.metaKey) return false;
  if (wantShift !== e.shiftKey) return false;
  if (wantAlt !== e.altKey) return false;
  return e.key.toLowerCase() === keyPart;
}

function applyStoredConfig() {
  const stored = localStorage.getItem('editorConfig');
  if (!stored) return;
  try {
    const config = JSON.parse(stored);
    document.body.setAttribute('data-theme', resolveTheme(config.theme));
    if (config.shortcuts) {
      _ceShortcuts = Object.assign({}, _ceShortcuts, config.shortcuts);
    }

    // 重新应用字体（界面字体 + 编辑器字体）
    document.body.style.fontFamily = config.uiFont || '';
    const edFont = (config.editor && config.editor.fontFamily) || '';
    document.documentElement.style.setProperty('--editor-font', edFont || "'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace");

    // 重新应用所有颜色变量
    if (config.colors) {
      Object.entries(config.colors).forEach(([key, value]) => {
        const cssVarName = `--color-${camelToKebab(key)}`;
        // 仅当颜色与当前主题默认值不同（用户显式自定义）时才覆盖，
        // 与主题默认相同的值跳过，避免内联样式锁死主题变量导致浅色主题失效
        const current = getComputedStyle(document.body).getPropertyValue(cssVarName).trim();
        if (current && current !== value) {
          document.documentElement.style.setProperty(cssVarName, value);
        }
      });
    }

    // 重新应用复选框标记开关 (body class: cb-mark-on 选中√ / cb-mark-off 未选中X)
    // 选中√默认显示 (checkboxMarkOn 缺省视为 true), 可在设置里关闭
    document.body.classList.toggle('cb-mark-on', config.checkboxMarkOn !== false);
    document.body.classList.toggle('cb-mark-off', config.checkboxMarkOff === true);

    // 重新应用 tooltip 提示开关 (body class: ce-hide-premium-hints / ce-hide-version-hints)
    document.body.classList.toggle('ce-hide-premium-hints', config.hidePremiumHints === true);
    document.body.classList.toggle('ce-hide-version-hints', config.hideVersionHints === true);

    // 重新应用背景图片到 body
    const body = document.body;
    if (config.background && config.background.filename) {
      const bg = config.background;
      const theme = body.getAttribute('data-theme') || 'dark';
      const opacity = bg.opacity ?? 0.3;
      const alpha = (1 - opacity) * 0.6;
      const bgColor = theme === 'light' ? 'rgba(255,255,255,' + alpha + ')' : 'rgba(0,0,0,' + alpha + ')';
      // 文件名含空格/引号时 url() 需引号包裹, 否则背景失效
      const bgUrl = String(bg.filename).replace(/\\/g, '/').replace(/"/g, '%22');
      body.style.background = 'linear-gradient(' + bgColor + ', ' + bgColor + '), url("background/' + bgUrl + '") center/cover no-repeat fixed';
    } else {
      const theme = body.getAttribute('data-theme') || 'dark';
      body.style.background = theme === 'light' ? '#ffffff' : '#000000';
    }
  } catch (e) {
    console.error('[RENDERER] 应用存储设置失败:', e);
  }
}

window.addEventListener('focus', () => {
  // 页面重新获得焦点时，重新应用存储的主题
  applyStoredConfig();
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

// ============================================
// 远程模式
// ============================================

let _remoteListenersAttached = false;
let _pendingFileChanges = {}; // key: clientId_path → { clientId, path, content }
let _pendingFileDeletes = {}; // key: clientId_path → { clientId, path }

function openRemoteMode() {
  const overlay = document.getElementById('rm-overlay');
  if (overlay) overlay.style.display = '';

  // 加载已保存的远程设置
  try {
    var saved = localStorage.getItem('editorConfig');
    if (saved) {
      var config = JSON.parse(saved);
      var rc = config.remoteClient || {};
      // 客户端
      if (rc.host) document.getElementById('rm-client-host').value = rc.host;
      if (rc.port) document.getElementById('rm-client-port').value = rc.port;
      var cpw = sessionStorage.getItem('remoteClientPassword');
      if (cpw) {
        document.getElementById('rm-client-password').value = cpw;
      } else if (rc.password) {
        try { document.getElementById('rm-client-password').value = decodeURIComponent(escape(atob(rc.password))); } catch (e) {}
      }
      // 服务器端口
      var rs = config.remoteServer || {};
      if (rs.port) document.getElementById('rm-server-port').value = rs.port;
    }
  } catch (e) {}

  // 从 sessionStorage 加载服务器密码明文（由设置页在同会话中保存）
  try {
    var pw = sessionStorage.getItem('remotePassword');
    if (pw) {
      var pwInput = document.getElementById('rm-server-password');
      if (pwInput) pwInput.value = pw;
    }
  } catch (e) {}

  // 刷新状态并检测远程连接
  refreshRemoteUI().then(function() {
    if (window.electronAPI && window.electronAPI.remote) {
      window.electronAPI.remote.getClientStatus().then(function(cs) {
        if (cs && cs.connected) {
          var tabs = document.getElementById('fm-tabs');
          if (tabs) tabs.style.display = '';
        }
      }).catch(function() {});
    }
  });

  attachRemoteListeners();
}

function closeRemoteMode() {
  const overlay = document.getElementById('rm-overlay');
  if (overlay) overlay.style.display = 'none';
}

function attachRemoteListeners() {
  if (_remoteListenersAttached) return;
  _remoteListenersAttached = true;

  // 关闭按钮
  const closeBtn = document.getElementById('rm-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeRemoteMode);

  // 点击蒙层关闭（已禁用，防止编辑时误触）
  // const overlay = document.getElementById('rm-overlay');
  // if (overlay) {
  //   overlay.addEventListener('click', function(e) {
  //     if (e.target === this) closeRemoteMode();
  //   });
  // }

  // 标签切换
  document.querySelectorAll('.rm-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.rm-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.rm-panel').forEach(function(p) { p.classList.remove('active'); });
      this.classList.add('active');
      var panel = document.getElementById('rm-panel-' + this.dataset.rmTab);
      if (panel) panel.classList.add('active');
      playSound('click');
    });
  });

  // 服务器：启动
  const startBtn = document.getElementById('rm-server-start');
  if (startBtn) {
    startBtn.addEventListener('click', async function() {
      var port = parseInt(document.getElementById('rm-server-port').value) || 12345;
      var password = document.getElementById('rm-server-password').value || 'choten';

      // 保存服务器端口到 localStorage
      try {
        var saved = localStorage.getItem('editorConfig');
        var config = saved ? JSON.parse(saved) : {};
        config.remoteServer = { port: port };
        localStorage.setItem('editorConfig', JSON.stringify(config));
      } catch (e) {}
      if (!window.electronAPI || !window.electronAPI.remote) {
        setRemoteStatus('rm-server-status', I18N.t('rm.apiError'), true);
        return;
      }
      // 读取设置：是否允许不同版本
      var serverCfg = {};
      try {
        var savedCfg = localStorage.getItem('editorConfig');
        if (savedCfg) {
          var parsedCfg = JSON.parse(savedCfg);
          serverCfg.allowDifferentVersions = parsedCfg.allowDifferentVersions === true;
        }
      } catch (e) {}
      setRemoteStatus('rm-server-status', I18N.t('rm.startingServer'));
      try {
        var result = await window.electronAPI.remote.startServer({ port, password, allowDifferentVersions: serverCfg.allowDifferentVersions });
        if (result && result.stage !== undefined) {
          setRemoteStatus('rm-server-status', I18N.t('rm.serverStarted', { port: port }));
          document.getElementById('rm-server-start').style.display = 'none';
          document.getElementById('rm-server-stop').style.display = '';
        } else if (result && result.success === false) {
          setRemoteStatus('rm-server-status', I18N.t('rm.startFailed', { msg: localizeRemoteMsg(result.error) || I18N.t('error.unknown') }), true);
        } else {
          setRemoteStatus('rm-server-status', I18N.t('rm.serverStarted', { port: port }));
          document.getElementById('rm-server-start').style.display = 'none';
          document.getElementById('rm-server-stop').style.display = '';
        }
      } catch (err) {
        setRemoteStatus('rm-server-status', I18N.t('rm.startFailed', { msg: err.message }), true);
      }
    });
  }

  // 服务器：停止
  const stopBtn = document.getElementById('rm-server-stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', async function() {
      if (!window.electronAPI || !window.electronAPI.remote) return;
      await window.electronAPI.remote.stopServer();
      setRemoteStatus('rm-server-status', I18N.t('rm.serverStopped'));
      document.getElementById('rm-server-start').style.display = '';
      document.getElementById('rm-server-stop').style.display = 'none';
      document.getElementById('rm-clients').style.display = 'none';
    });
  }

  // 客户端：连接
  const connectBtn = document.getElementById('rm-client-connect');
  if (connectBtn) {
    connectBtn.addEventListener('click', async function() {
      var host = document.getElementById('rm-client-host').value || '127.0.0.1';
      var port = parseInt(document.getElementById('rm-client-port').value) || 12345;
      var password = document.getElementById('rm-client-password').value || '';

      // 保存地址、端口、密码到 localStorage
      try {
        var saved = localStorage.getItem('editorConfig');
        var config = saved ? JSON.parse(saved) : {};
        config.remoteClient = { host: host, port: port, password: btoa(unescape(encodeURIComponent(password))) };
        localStorage.setItem('editorConfig', JSON.stringify(config));
        sessionStorage.setItem('remoteClientPassword', password);
      } catch (e) {}
      if (!window.electronAPI || !window.electronAPI.remote) {
        setRemoteStatus('rm-client-status', I18N.t('rm.apiError'), true);
        return;
      }
      setRemoteStatus('rm-client-status', I18N.t('rm.connecting'));
      try {
        var appVer = window.electronAPI && window.electronAPI.appVersion ? window.electronAPI.appVersion : '';
        var result = await window.electronAPI.remote.connectToServer({ host, port, password, version: appVer });
        if (result && result.stage === 'challenge') {
          setRemoteStatus('rm-client-status', I18N.t('rm.sendCodeToAdmin'));
          document.getElementById('rm-client-connect').style.display = 'none';
          document.getElementById('rm-client-disconnect').style.display = '';
          // 显示安全码，等待管理员确认
          var codeArea = document.getElementById('rm-security-code-area');
          var codeDisplay = document.getElementById('rm-security-code-display');
          if (codeArea) codeArea.style.display = '';
          if (codeDisplay) codeDisplay.textContent = result.securityCode || '------';
        } else if (result && result.stage === 'approved') {
          setRemoteStatus('rm-client-status', I18N.t('rm.connected'));
          document.getElementById('rm-client-connect').style.display = 'none';
          document.getElementById('rm-client-disconnect').style.display = '';
          document.getElementById('rm-security-code-area').style.display = 'none';
        } else if (result && result.success === false) {
          setRemoteStatus('rm-client-status', I18N.t('rm.connectFailed', { msg: localizeRemoteMsg(result.error) || I18N.t('error.unknown') }), true);
        } else {
          setRemoteStatus('rm-client-status', I18N.t('rm.connected'));
          document.getElementById('rm-client-connect').style.display = 'none';
          document.getElementById('rm-client-disconnect').style.display = '';
        }
      } catch (err) {
        setRemoteStatus('rm-client-status', I18N.t('rm.connectFailed', { msg: err.message }), true);
      }
    });
  }

  // 客户端：断开
  const disconnectBtn = document.getElementById('rm-client-disconnect');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async function() {
      if (!window.electronAPI || !window.electronAPI.remote) return;
      await window.electronAPI.remote.disconnectFromServer();
      setRemoteStatus('rm-client-status', I18N.t('rm.disconnected'));
      document.getElementById('rm-client-connect').style.display = '';
      document.getElementById('rm-client-disconnect').style.display = 'none';
      document.getElementById('rm-security-code-area').style.display = 'none';
    });
  }

  // 断开全部
  const disconnectAllBtn = document.getElementById('rm-disconnect-all');
  if (disconnectAllBtn) {
    disconnectAllBtn.addEventListener('click', async function() {
      if (!window.electronAPI || !window.electronAPI.remote) return;
      await window.electronAPI.remote.disconnectAll();
    });
  }

  // 确认对话框按钮
  const acceptBtn = document.getElementById('rm-confirm-accept');
  if (acceptBtn) {
    acceptBtn.addEventListener('click', async function() {
      var clientId = this.dataset.clientId;
      if (!clientId || !window.electronAPI || !window.electronAPI.remote) return;
      await window.electronAPI.remote.confirmClient({ clientId });
      document.getElementById('rm-confirm-dialog').style.display = 'none';
      refreshRemoteUI();
    });
  }
  const rejectBtn = document.getElementById('rm-confirm-reject');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', async function() {
      var clientId = this.dataset.clientId;
      if (!clientId || !window.electronAPI || !window.electronAPI.remote) return;
      await window.electronAPI.remote.rejectClient({ clientId });
      document.getElementById('rm-confirm-dialog').style.display = 'none';
    });
  }

  // 点击确认对话框背景关闭
  const confirmDialog = document.getElementById('rm-confirm-dialog');
  if (confirmDialog) {
    confirmDialog.addEventListener('click', function(e) {
      if (e.target === this) this.style.display = 'none';
    });
  }

  // 文件更改对话框按钮
  const fcApproveBtn = document.getElementById('rm-fc-approve');
  if (fcApproveBtn) {
    fcApproveBtn.addEventListener('click', async function() {
      var key = this.dataset.key;
      var change = _pendingFileChanges[key];
      if (!change || !window.electronAPI || !window.electronAPI.remote) return;
      await window.electronAPI.remote.applyApprovedWrite({
        clientId: change.clientId,
        filePath: change.path,
        content: change.content,
      });
      delete _pendingFileChanges[key];
      document.getElementById('rm-filechange-dialog').style.display = 'none';
    });
  }
  const fcRejectBtn = document.getElementById('rm-fc-reject');
  if (fcRejectBtn) {
    fcRejectBtn.addEventListener('click', async function() {
      var key = this.dataset.key;
      var change = _pendingFileChanges[key];
      if (!change || !window.electronAPI || !window.electronAPI.remote) return;
      await window.electronAPI.remote.notifyFileChangeRejected({
        clientId: change.clientId,
        filePath: change.path,
      });
      delete _pendingFileChanges[key];
      document.getElementById('rm-filechange-dialog').style.display = 'none';
    });
  }

  // 文件删除对话框按钮
  const fdApproveBtn = document.getElementById('rm-fd-approve');
  if (fdApproveBtn) {
    fdApproveBtn.addEventListener('click', async function() {
      var key = this.dataset.key;
      var del = _pendingFileDeletes[key];
      if (!del || !window.electronAPI || !window.electronAPI.remote) return;
      await window.electronAPI.remote.applyApprovedDelete({
        clientId: del.clientId,
        filePath: del.path,
      });
      delete _pendingFileDeletes[key];
      document.getElementById('rm-filedelete-dialog').style.display = 'none';
      refreshRemoteUI();
    });
  }
  const fdRejectBtn = document.getElementById('rm-fd-reject');
  if (fdRejectBtn) {
    fdRejectBtn.addEventListener('click', async function() {
      var key = this.dataset.key;
      var del = _pendingFileDeletes[key];
      if (!del || !window.electronAPI || !window.electronAPI.remote) return;
      await window.electronAPI.remote.notifyFileDeleteRejected({
        clientId: del.clientId,
        filePath: del.path,
      });
      delete _pendingFileDeletes[key];
      document.getElementById('rm-filedelete-dialog').style.display = 'none';
    });
  }
}

function setRemoteStatus(elId, msg, isError) {
  var el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--color-error)' : 'var(--color-text-secondary)';
}

async function refreshRemoteUI() {
  if (!window.electronAPI || !window.electronAPI.remote) return;

  // 服务器状态
  try {
    var serverStatus = await window.electronAPI.remote.getServerStatus();
    if (serverStatus && serverStatus.running) {
      document.getElementById('rm-server-start').style.display = 'none';
      document.getElementById('rm-server-stop').style.display = '';
      renderClientList(serverStatus.clients || []);
    } else {
      document.getElementById('rm-server-start').style.display = '';
      document.getElementById('rm-server-stop').style.display = 'none';
      document.getElementById('rm-clients').style.display = 'none';
    }
  } catch (e) {}

  // 客户端状态
  try {
    var clientStatus = await window.electronAPI.remote.getClientStatus();
    if (clientStatus && clientStatus.connected) {
      document.getElementById('rm-client-connect').style.display = 'none';
      document.getElementById('rm-client-disconnect').style.display = '';
    }
  } catch (e) {}
}

function renderClientList(clients) {
  var container = document.getElementById('rm-clients-list');
  var section = document.getElementById('rm-clients');
  if (!container) return;

  if (!clients || clients.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = '';

  var html = '';
  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    var perm = c.permission || 'confirm';
    var isPending = c.pending;
    html += '<div class="rm-client-card">';
    html += '  <div class="rm-client-card-header">';
    html += '    <div>';
    html += '      <div class="rm-client-id">' + _escHtml(c.id) + (isPending ? ' ⏳' : '') + '</div>';
    html += '      <div class="rm-client-ip">' + _escHtml(c.ip || 'unknown') + '</div>';
    if (!isPending && c.securityCode) {
      html += '      <div style="font-size:10px;color:var(--color-text-tertiary);">' + I18N.t('rm.securityCode', { code: _escHtml(c.securityCode) }) + '</div>';
    }
    html += '    </div>';
    if (isPending) {
      html += '    <button class="rm-btn rm-btn-primary rm-btn-sm rm-confirm-btn" data-client-id="' + _escHtml(c.id) + '">' + I18N.t('remote.confirmAccept') + '</button>';
    } else {
      html += '    <button class="rm-btn rm-btn-danger rm-btn-sm rm-disconnect-btn" data-client-id="' + _escHtml(c.id) + '">' + I18N.t('rm.disconnect') + '</button>';
    }
    html += '  </div>';
    if (!isPending) {
      html += '  <div class="rm-client-perm">';
      var levels = [
        { id: 'guest', label: I18N.t('perm.guest') },
        { id: 'confirm', label: I18N.t('perm.confirm') },
        { id: 'full', label: I18N.t('perm.full') },
      ];
      for (var p = 0; p < levels.length; p++) {
        var active = perm === levels[p].id ? ' active' : '';
        html += '    <button class="rm-perm-btn' + active + '" data-client-id="' + _escHtml(c.id) + '" data-perm="' + levels[p].id + '">' + levels[p].label + '</button>';
      }
      html += '  </div>';
    }
    html += '</div>';
  }
  container.innerHTML = html;

  // 绑定事件
  // 确认按钮
  container.querySelectorAll('.rm-confirm-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var clientId = this.dataset.clientId;
      // 查找对应的客户端信息
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].id === clientId) {
          document.getElementById('rm-confirm-ip').textContent = clients[i].ip || 'unknown';
          document.getElementById('rm-confirm-code').textContent = clients[i].securityCode || '--';
          document.getElementById('rm-confirm-accept').dataset.clientId = clientId;
          document.getElementById('rm-confirm-reject').dataset.clientId = clientId;
          document.getElementById('rm-confirm-dialog').style.display = '';
          break;
        }
      }
    });
  });

  // 断开按钮
  container.querySelectorAll('.rm-disconnect-btn').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (!window.electronAPI || !window.electronAPI.remote) return;
      await window.electronAPI.remote.disconnectClient({ clientId: this.dataset.clientId });
      refreshRemoteUI();
    });
  });

  // 权限按钮
  container.querySelectorAll('.rm-perm-btn').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (!window.electronAPI || !window.electronAPI.remote) return;
      var clientId = this.dataset.clientId;
      var perm = this.dataset.perm;
      await window.electronAPI.remote.setClientPermission({ clientId, permission: perm });
      // 更新 UI 状态
      var parent = this.parentElement;
      parent.querySelectorAll('.rm-perm-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
    });
  });
}

// ---- 远程事件监听 ----
let _remoteEventsInited = false;
function initRemoteEvents() {
  if (_remoteEventsInited) return;
  _remoteEventsInited = true;
  if (!window.electronAPI || !window.electronAPI.remote) return;

  window.electronAPI.remote.onEvent(function(type, data) {
    switch (type) {

      // 服务器事件
      case 'server:started':
        setRemoteStatus('rm-server-status', I18N.t('rm.serverStarted', { port: data.port || '' }));
        document.getElementById('rm-server-start').style.display = 'none';
        document.getElementById('rm-server-stop').style.display = '';
        break;

      case 'server:stopped':
        setRemoteStatus('rm-server-status', I18N.t('rm.serverStopped'));
        document.getElementById('rm-server-start').style.display = '';
        document.getElementById('rm-server-stop').style.display = 'none';
        document.getElementById('rm-clients').style.display = 'none';
        break;

      case 'server:error':
        setRemoteStatus('rm-server-status', I18N.t('rm.errorPrefix', { msg: localizeRemoteMsg(data) || '' }), true);
        break;

      case 'client:joined':
        setRemoteStatus('rm-server-status', I18N.t('rm.newClient', { ip: data.ip || '' }));
        refreshRemoteUI();
        // 自动弹出确认对话框
        if (data.clientId) {
          document.getElementById('rm-confirm-ip').textContent = data.ip || 'unknown';
          document.getElementById('rm-confirm-code').textContent = data.securityCode || '--';
          document.getElementById('rm-confirm-accept').dataset.clientId = data.clientId;
          document.getElementById('rm-confirm-reject').dataset.clientId = data.clientId;
          document.getElementById('rm-confirm-dialog').style.display = '';
        }
        break;

      case 'client:left':
        refreshRemoteUI();
        break;

      case 'client:approved':
        refreshRemoteUI();
        break;

      case 'client:rejected':
        refreshRemoteUI();
        break;

      case 'client:permission-changed':
        refreshRemoteUI();
        break;

      case 'file:change:request':
        // 显示文件更改确认对话框
        var key = data.clientId + '_' + data.path;
        _pendingFileChanges[key] = data;
        document.getElementById('rm-fc-client').textContent = data.ip || data.clientId;
        document.getElementById('rm-fc-path').textContent = data.path;
        document.getElementById('rm-fc-approve').dataset.key = key;
        document.getElementById('rm-fc-reject').dataset.key = key;
        document.getElementById('rm-filechange-dialog').style.display = '';
        playSound('click');
        break;

      case 'file:change:applied':
        setRemoteStatus('rm-server-status', I18N.t('rm.fileUpdated', { path: data.path }));
        break;

      case 'file:delete:request':
        // 显示文件删除确认对话框
        var delKey = data.clientId + '_' + data.path;
        _pendingFileDeletes[delKey] = data;
        document.getElementById('rm-fd-client').textContent = data.ip || data.clientId;
        document.getElementById('rm-fd-path').textContent = data.path;
        document.getElementById('rm-fd-approve').dataset.key = delKey;
        document.getElementById('rm-fd-reject').dataset.key = delKey;
        document.getElementById('rm-filedelete-dialog').style.display = '';
        playSound('click');
        break;

      case 'file:delete:applied':
        setRemoteStatus('rm-server-status', I18N.t('rm.fileDeleted', { path: data.path }));
        if (currentFile === data.path) {
          closeTab(data.path);
        }
        break;

      case 'file:editing:started':
        _otherEditingFiles[data.path] = true;
        if (_fmMode === 'remote') {
          renderFileTree(_remoteFiles);
        }
        break;

      case 'file:editing:ended':
        delete _otherEditingFiles[data.path];
        if (_fmMode === 'remote') {
          renderFileTree(_remoteFiles);
        }
        break;

      // 客户端事件
      case 'client:connecting':
        setRemoteStatus('rm-client-status', I18N.t('rm.connecting'));
        break;

      case 'client:auth:challenge':
        setRemoteStatus('rm-client-status', I18N.t('rm.sendCodeToAdmin'));
        document.getElementById('rm-client-connect').style.display = 'none';
        document.getElementById('rm-client-disconnect').style.display = '';
        var codeArea = document.getElementById('rm-security-code-area');
        var codeDisplay = document.getElementById('rm-security-code-display');
        if (codeArea) codeArea.style.display = '';
        if (codeDisplay) codeDisplay.textContent = data.securityCode || '------';
        break;

      case 'client:auth:approved':
        setRemoteStatus('rm-client-status', I18N.t('rm.connected'));
        document.getElementById('rm-client-connect').style.display = 'none';
        document.getElementById('rm-client-disconnect').style.display = '';
        document.getElementById('rm-security-code-area').style.display = 'none';
        // 显示文件管理器远程选项卡
        var fmTabs = document.getElementById('fm-tabs');
        if (fmTabs) fmTabs.style.display = '';
        break;

      case 'client:disconnected':
        setRemoteStatus('rm-client-status', I18N.t('rm.disconnected'));
        document.getElementById('rm-client-connect').style.display = '';
        document.getElementById('rm-client-disconnect').style.display = 'none';
        document.getElementById('rm-security-code-area').style.display = 'none';
        // 清除远程文件状态并切回本地
        _remoteFiles = [];
        _otherEditingFiles = {};
        var fmTabs = document.getElementById('fm-tabs');
        if (fmTabs) fmTabs.style.display = 'none';
        if (_fmMode === 'remote') {
          _fmMode = 'local';
          document.querySelectorAll('.fm-tab').forEach(function(t) { t.classList.remove('active'); });
          var localTab = document.querySelector('.fm-tab[data-fm="local"]');
          if (localTab) localTab.classList.add('active');
          if (currentDirectoryPath) loadDirectory(currentDirectoryPath, true);
        }
        break;

      case 'client:error':
        setRemoteStatus('rm-client-status', I18N.t('rm.errorPrefix', { msg: localizeRemoteMsg(data) || '' }), true);
        break;

      case 'client:permission:updated':
        setRemoteStatus('rm-client-status', I18N.t('rm.permUpdated', { level: data.permissions ? data.permissions.level : '' }));
        break;

      case 'client:file:write:result': {
        const wpath = data.path;
        // 唤醒等待确认的保存调用
        const waiters = _remoteSaveWaiters[wpath];
        if (waiters && waiters.length) {
          delete _remoteSaveWaiters[wpath];
          for (var wi = 0; wi < waiters.length; wi++) {
            clearTimeout(waiters[wi].timer);
            waiters[wi].resolve(data.success);
          }
        }
        if (data.success) {
          setRemoteStatus('rm-client-status', I18N.t('rm.fileSavedOk', { path: wpath }));
          // 管理员批准等延迟确认路径: 结果到达后无条件清除脏标记
          if (dirtyTabs[wpath]) {
            dirtyTabs[wpath] = false;
            updateTabDirtyIndicator(wpath);
          }
        } else {
          // 失败: 保留脏标记, 用户可再次保存
          setRemoteStatus('rm-client-status', I18N.t('rm.fileSaveFailed', { msg: localizeRemoteMsg(data) || '' }), true);
        }
        break;
      }

      case 'client:file:write:pending':
        setRemoteStatus('rm-client-status', I18N.t('rm.waitingApproveWrite'));
        break;

      case 'client:file:read':
        if (data.success) {
          setRemoteStatus('rm-client-status', I18N.t('rm.fileReadOk'));
          openFile(data.path, data.content);
        } else {
          setRemoteStatus('rm-client-status', I18N.t('rm.fileReadFailed', { msg: localizeRemoteMsg(data) || '' }), true);
        }
        break;

      case 'client:file:list':
        if (data.success && data.files) {
          _remoteFiles = data.files;
          _remoteDirPath = data.path;
          renderFileTree(_remoteFiles);
          setRemoteStatus('rm-client-status', I18N.t('rm.listLoaded'));
        } else {
          setRemoteStatus('rm-client-status', I18N.t('rm.listLoadFailed', { msg: localizeRemoteMsg(data) || '' }), true);
        }
        break;

      case 'client:file:delete:result':
        if (data.success) {
          setRemoteStatus('rm-client-status', I18N.t('rm.fileDeleted', { path: data.path }));
          if (currentFile === data.path) {
            closeTab(data.path);
          }
          // 刷新远程文件列表
          if (_remoteDirPath && window.electronAPI && window.electronAPI.remote) {
            window.electronAPI.remote.requestFileList({ dirPath: _remoteDirPath });
          }
        } else {
          setRemoteStatus('rm-client-status', I18N.t('rm.deleteFailed', { msg: localizeRemoteMsg(data) || '' }), true);
        }
        break;

      case 'client:file:delete:pending':
        setRemoteStatus('rm-client-status', I18N.t('rm.waitingApproveDelete'));
        break;

      case 'client:server:stopped':
        setRemoteStatus('rm-client-status', I18N.t('rm.serverClosed'));
        document.getElementById('rm-client-connect').style.display = '';
        document.getElementById('rm-client-disconnect').style.display = 'none';
        document.getElementById('rm-security-code-area').style.display = 'none';
        break;
    }
  });
}

// 在初始化时设置远程事件监听
// 注意：不能在 init() 中调用，因为 electronAPI 可能尚未就绪
// 在 DOMContentLoaded 后的 setTimeout 中调用
(function scheduleRemoteInit() {
  var check = setInterval(function() {
    if (window.electronAPI && window.electronAPI.remote) {
      clearInterval(check);
      initRemoteEvents();
    }
  }, 200);
  // 最多等待 10 秒
  setTimeout(function() { clearInterval(check); }, 10000);
})();