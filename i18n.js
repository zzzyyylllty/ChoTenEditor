/* ChoTenEditor 本地化核心模块
 * 依赖: js-yaml (全局 jsyaml)。在 index.html / settings.html 中紧随 js-yaml 加载。
 * 字典: locales/zh_cn.yml, locales/en_us.yml。语言持久化: localStorage.editorConfig.language
 */
(function () {
  var current = 'zh_cn';
  var dicts = {}; // lang -> dict object
  var initPromise = null;

  function getConfig() {
    try { return JSON.parse(localStorage.getItem('editorConfig') || '{}'); } catch (e) { return {}; }
  }

  function saveLang(lang) {
    var cfg = getConfig();
    cfg.language = lang;
    localStorage.setItem('editorConfig', JSON.stringify(cfg));
  }

  function getLang() {
    var cfg = getConfig();
    return cfg.language === 'en_us' ? 'en_us' : 'zh_cn';
  }

  function lookup(dict, key) {
    var parts = key.split('.');
    var o = dict;
    for (var i = 0; i < parts.length; i++) {
      if (o == null || typeof o !== 'object') return undefined;
      o = o[parts[i]];
    }
    return o;
  }

  // 当前语言 → zh_cn → 原样返回 key
  function t(key, params) {
    var v = lookup(dicts[current], key);
    if (v == null && current !== 'zh_cn') v = lookup(dicts['zh_cn'], key);
    if (v == null) v = key;
    if (params) {
      v = String(v).replace(/\{(\w+)\}/g, function (m, name) {
        return params[name] != null ? params[name] : m;
      });
    }
    return v;
  }

  // 扫描 [data-i18n](textContent) / [data-i18n-placeholder] / [data-i18n-title]
  function applyDOM(root) {
    root = root || document;
    var els = root.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-title]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
      key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
      key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('data-tip', t(key));
    }
    document.documentElement.lang = current === 'zh_cn' ? 'zh-CN' : 'en';
    var titleKey = (document.body && document.body.getAttribute('data-title-key'));
    document.title = titleKey ? t(titleKey) : t('app.title');
  }

  function load(lang) {
    if (dicts[lang]) return Promise.resolve();
    return fetch('locales/' + lang + '.yml')
      .then(function (r) { if (!r.ok) throw new Error('load failed: ' + lang); return r.text(); })
      .then(function (text) {
        var parsed = jsyaml.load(text);
        dicts[lang] = (parsed && typeof parsed === 'object') ? parsed : {};
      });
  }

  function init(lang) {
    current = lang;
    var chain = Promise.resolve();
    if (lang !== 'zh_cn') chain = chain.then(function () { return load('zh_cn'); });
    chain = chain.then(function () { return load(lang); });
    return chain.then(function () {
      applyDOM();
      return current;
    });
  }

  // 立即以已保存语言（或默认）开始加载；ready 永远指向最新的 init
  initPromise = init(getLang());

  function setLang(lang) {
    saveLang(lang);
    initPromise = init(lang);
    return initPromise;
  }

  // 启动加载提示列表（替代 loadingtips.txt）
  function tips() {
    var arr = lookup(dicts[current], 'tips');
    if (!Array.isArray(arr) || !arr.length) arr = lookup(dicts['zh_cn'], 'tips');
    return Array.isArray(arr) ? arr : [];
  }

  // 内容描述覆盖: content.<section>.<id>，无翻译则返回 fallback（zh 原文）
  function desc(section, id, fallback) {
    var v = lookup(dicts[current], 'content.' + section + '.' + id);
    if (v == null && current !== 'zh_cn') v = lookup(dicts['zh_cn'], 'content.' + section + '.' + id);
    return v != null ? v : (fallback != null ? fallback : '');
  }

  // 远程消息: 有 errorKey 且译文与原文不同 → "原文 (译文)"；否则显示原文（兼容旧端）
  function localizeRemote(text, errorKey, params) {
    if (!errorKey) return text;
    var local = params ? t(errorKey, params) : t(errorKey);
    if (local === errorKey || local === text) return text;
    return text + ' (' + local + ')';
  }

  window.I18N = {
    get lang() { return current; },
    get ready() { return initPromise; },
    t: t,
    applyDOM: applyDOM,
    setLang: setLang,
    tips: tips,
    desc: desc,
    localizeRemote: localizeRemote,
  };
})();
