/* ui.js — 自定义对话框控件库（替代浏览器原生 alert/confirm/prompt）
   主题色驱动：使用 --color-primary / --color-error 等 CSS 变量，随主题和自定义颜色自动变化 */
(function () {
  'use strict';

  function tr(key, fallback) {
    if (window.I18N && typeof window.I18N.t === 'function') {
      try {
        var v = window.I18N.t(key);
        if (v && v !== key) return v;
      } catch (e) {}
    }
    return fallback;
  }

  function playSoundSafe(name) {
    try {
      if (window.playSound) window.playSound(name);
    } catch (e) {}
  }

  /* 构建单个对话框，返回 Promise：
     mode: 'alert' | 'confirm' | 'prompt'
     opts: { title, message, okText, cancelText, defaultValue, placeholder, danger } */
  function dialog(mode, opts) {
    return new Promise(function (resolve) {
      var o = opts || {};

      var overlay = document.createElement('div');
      overlay.className = 'ui-overlay';

      var modal = document.createElement('div');
      modal.className = 'ui-modal';
      modal.setAttribute('role', 'dialog');

      var title = document.createElement('div');
      title.className = 'ui-modal-title';
      title.textContent = o.title || (mode === 'confirm'
        ? tr('ui.confirmTitle', '请确认')
        : mode === 'prompt' ? tr('ui.promptTitle', '请输入') : tr('ui.alertTitle', '提示'));

      var body = document.createElement('div');
      body.className = 'ui-modal-body';
      body.textContent = o.message || '';

      modal.appendChild(title);
      modal.appendChild(body);

      var input = null;
      if (mode === 'prompt') {
        input = document.createElement('input');
        input.className = 'ui-input';
        input.type = 'text';
        if (o.defaultValue) input.value = o.defaultValue;
        if (o.placeholder) input.placeholder = o.placeholder;
        modal.appendChild(input);
      }

      var actions = document.createElement('div');
      actions.className = 'ui-modal-actions';

      var cancelBtn = null;
      if (mode !== 'alert') {
        cancelBtn = document.createElement('button');
        cancelBtn.className = 'ui-btn ui-btn-secondary';
        cancelBtn.textContent = o.cancelText || tr('ui.cancel', '取消');
        actions.appendChild(cancelBtn);
      }

      var okBtn = document.createElement('button');
      okBtn.className = 'ui-btn ' + (mode === 'confirm' && o.danger ? 'ui-btn-danger' : 'ui-btn-primary');
      okBtn.textContent = o.okText || tr('ui.ok', '确定');
      actions.appendChild(okBtn);

      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      requestAnimationFrame(function () { overlay.classList.add('show'); });

      function close(result) {
        playSoundSafe(result ? 'click' : 'close');
        overlay.classList.remove('show');
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 160);
        resolve(result);
      }

      okBtn.addEventListener('click', function () {
        if (mode === 'prompt') close(input.value);
        else close(mode === 'alert' ? undefined : true);
      });
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
          close(mode === 'prompt' ? null : false);
        });
      }
      overlay.addEventListener('mousedown', function (e) {
        if (e.target === overlay) close(mode === 'prompt' ? null : false);
      });
      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close(mode === 'prompt' ? null : false);
        } else if (e.key === 'Enter' && mode === 'prompt') {
          close(input.value);
        }
      });

      if (input) {
        input.addEventListener('keydown', function (e) {
          e.stopPropagation();
          if (e.key === 'Enter') close(input.value);
          if (e.key === 'Escape') close(null);
        });
        setTimeout(function () { input.focus(); input.select(); }, 50);
      } else {
        (cancelBtn || okBtn).focus();
      }
    });
  }

  window.UI = {
    alert: function (opts) { return dialog('alert', opts); },
    confirm: function (opts) { return dialog('confirm', opts); },
    prompt: function (opts) { return dialog('prompt', opts); }
  };
})();
