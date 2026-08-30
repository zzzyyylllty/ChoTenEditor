// ============================================
// 音效播放工具
// ============================================
(function () {
  'use strict';

  var _enabled = true;
  var _volume = 0.5;
  var _cache = {};

  // 音效文件映射
  var SOUND_NAMES = ['back', 'click', 'close', 'collapse', 'drag', 'error', 'lightclick', 'save', 'select', 'submit', 'update'];

  // 预加载音效
  function preload() {
    for (var i = 0; i < SOUND_NAMES.length; i++) {
      var name = SOUND_NAMES[i];
      try {
        var audio = new Audio('sound/' + name + '.ogg');
        audio.preload = 'auto';
        _cache[name] = audio;
      } catch (e) {
        // 静默失败
      }
    }
  }

  // 加载设置
  function loadSettings() {
    try {
      var stored = localStorage.getItem('editorConfig');
      if (stored) {
        var config = JSON.parse(stored);
        if (config.sound !== undefined) _enabled = !!config.sound;
        if (config.soundVolume !== undefined) _volume = parseFloat(config.soundVolume) || 0.5;
      }
    } catch (e) {}
  }

  // 播放音效
  function playSound(name) {
    if (!_enabled) return;
    if (!name) return;
    name = name.toLowerCase();
    if (SOUND_NAMES.indexOf(name) === -1) return;
    var audio;
    if (_cache[name]) {
      audio = _cache[name];
    } else {
      try {
        audio = new Audio('sound/' + name + '.ogg');
        _cache[name] = audio;
      } catch (e) { return; }
    }
    try {
      audio.volume = _volume;
      audio.currentTime = 0;
      audio.play().catch(function () {});
    } catch (e) {}
  }

  // 设置启用状态
  function setEnabled(enabled) {
    _enabled = !!enabled;
    try {
      var stored = localStorage.getItem('editorConfig');
      var config = stored ? JSON.parse(stored) : {};
      config.sound = _enabled;
      localStorage.setItem('editorConfig', JSON.stringify(config));
    } catch (e) {}
  }

  // 设置音量
  function setVolume(vol) {
    _volume = Math.max(0, Math.min(1, parseFloat(vol) || 0.5));
    try {
      var stored = localStorage.getItem('editorConfig');
      var config = stored ? JSON.parse(stored) : {};
      config.soundVolume = _volume;
      localStorage.setItem('editorConfig', JSON.stringify(config));
    } catch (e) {}
  }

  // 获取状态
  function isEnabled() { return _enabled; }
  function getVolume() { return _volume; }

  // 初始化
  loadSettings();

  // 暴露到全局
  window.playSound = playSound;
  window.soundSetEnabled = setEnabled;
  window.soundSetVolume = setVolume;
  window.soundIsEnabled = isEnabled;
  window.soundGetVolume = getVolume;

  // DOM 加载完毕后预加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preload);
  } else {
    preload();
  }
})();
