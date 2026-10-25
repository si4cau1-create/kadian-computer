/* 通用 UI 组件：提示条、弹窗、底部抽屉、表单对话框、加载态 */
var UI = (function () {
  var modalStack = [];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg, type) {
    var host = document.getElementById('toastHost');
    if (!host) { host = el('div', 'toast-host'); document.body.appendChild(host); }
    host.innerHTML = '';
    var t = el('div', 'toast toast-' + (type || 'info'), Util.esc(msg));
    host.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
    }, type === 'error' ? 4200 : 2400);
  }

  /* ---------- Modal ---------- */
  function modal(opts) {
    opts = opts || {};
    var overlay = el('div', 'overlay');
    var card = el('div', 'modal' + (opts.wide ? ' modal-wide' : ''));
    var head = el('div', 'modal-head');
    head.appendChild(el('div', 'modal-title', Util.esc(opts.title || '')));
    var x = el('button', 'icon-btn', '×');
    x.setAttribute('aria-label', '关闭');
    head.appendChild(x);
    var body = el('div', 'modal-body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    card.appendChild(head);
    card.appendChild(body);

    var foot = null;
    if (opts.actions && opts.actions.length) {
      foot = el('div', 'modal-foot');
      opts.actions.forEach(function (a) {
        var b = el('button', 'btn ' + (a.kind || 'btn-ghost'), Util.esc(a.label));
        b.addEventListener('click', function () {
          if (!a.onClick) { close(); return; }
          var keep = a.onClick(api);
          if (keep !== false) close();
        });
        foot.appendChild(b);
      });
      card.appendChild(foot);
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(function () { overlay.classList.add('show'); });

    function close() {
      overlay.classList.remove('show');
      document.body.classList.remove('no-scroll');
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
      var i = modalStack.indexOf(api);
      if (i >= 0) modalStack.splice(i, 1);
      if (opts.onClose) opts.onClose();
    }
    x.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay && opts.dismissible !== false) close(); });

    var api = { el: card, body: body, close: close, overlay: overlay };
    modalStack.push(api);
    return api;
  }

  function confirmDialog(msg, okText, danger) {
    return new Promise(function (resolve) {
      var m = modal({
        title: '请确认',
        body: '<p class="confirm-text">' + Util.esc(msg) + '</p>',
        actions: [
          { label: '取消', kind: 'btn-ghost', onClick: function () { resolve(false); } },
          { label: okText || '确定', kind: danger ? 'btn-danger' : 'btn-primary', onClick: function () { resolve(true); } }
        ],
        onClose: function () { resolve(false); }
      });
      return m;
    });
  }

  /* 表单对话框
     fields: [{key,label,type,options,placeholder,required,hint,rows}] */
  function formDialog(opts) {
    opts = opts || {};
    var fields = opts.fields || [];
    var values = opts.values || {};
    var wrap = el('div', 'form');
    var inputs = {};

    fields.forEach(function (f) {
      var row = el('div', 'form-row');
      var lab = el('label', 'form-label', Util.esc(f.label) + (f.required ? ' <span class="req">*</span>' : ''));
      row.appendChild(lab);
      var input;
      if (f.type === 'textarea') {
        input = el('textarea', 'input');
        input.rows = f.rows || 3;
        input.placeholder = f.placeholder || '';
        input.value = values[f.key] != null ? values[f.key] : '';
      } else if (f.type === 'select') {
        input = el('select', 'input');
        (f.options || []).forEach(function (o) {
          var op = el('option', null, Util.esc(o.label));
          op.value = o.value;
          input.appendChild(op);
        });
        input.value = values[f.key] != null ? values[f.key] : (f.options && f.options[0] ? f.options[0].value : '');
      } else {
        input = el('input', 'input');
        input.type = 'text';
        input.placeholder = f.placeholder || '';
        input.value = values[f.key] != null ? values[f.key] : '';
      }
      if (f.datalist) {
        input.setAttribute('list', f.datalist);
      }
      inputs[f.key] = input;
      row.appendChild(input);
      if (f.hint) row.appendChild(el('div', 'form-hint', Util.esc(f.hint)));
      wrap.appendChild(row);
    });

    if (opts.datalistHTML) {
      var dl = el('datalist');
      dl.id = opts.datalistId;
      dl.innerHTML = opts.datalistHTML;
      wrap.appendChild(dl);
    }

    return new Promise(function (resolve) {
      var m = modal({
        title: opts.title || '填写',
        body: wrap,
        actions: [
          { label: '取消', kind: 'btn-ghost', onClick: function () { resolve(null); } },
          {
            label: opts.submitText || '保存', kind: 'btn-primary', onClick: function () {
              var out = {};
              var missing = null;
              fields.forEach(function (f) {
                var v = inputs[f.key].value;
                if (f.required && !String(v).trim() && !missing) missing = f.label;
                out[f.key] = typeof v === 'string' ? v.trim() : v;
              });
              if (missing) { toast('请填写「' + missing + '」', 'error'); return false; }
              resolve(out);
            }
          }
        ],
        onClose: function () { resolve(null); }
      });
      setTimeout(function () {
        var first = inputs[Object.keys(inputs)[0]];
        if (first && first.focus) first.focus();
      }, 120);
      return m;
    });
  }

  /* ---------- 加载态 ---------- */
  function loading(text) {
    var host = document.getElementById('loadingHost');
    if (!host) { host = el('div', 'loading-host'); document.body.appendChild(host); }
    host.innerHTML = '';
    var w = el('div', 'loading-box');
    w.appendChild(el('div', 'spinner'));
    w.appendChild(el('div', 'loading-text', Util.esc(text || '处理中…')));
    host.appendChild(w);
    host.classList.add('show');
    return {
      update: function (t) { var n = w.querySelector('.loading-text'); if (n) n.textContent = t; },
      close: function () { host.classList.remove('show'); setTimeout(function () { host.innerHTML = ''; }, 200); }
    };
  }

  /* ---------- 小组件 ---------- */
  function subjectTag(subjectId) {
    var s = CONFIG.subject(subjectId);
    return '<span class="tag" style="background:' + s.color + '18;color:' + s.color + '">' + Util.esc(s.name) + '</span>';
  }

  function masteryBar(m) {
    var lv = MASTERY.level(m);
    return '<div class="mbar"><div class="mbar-fill" style="width:' + Math.round(m * 100) + '%;background:' + lv.color + '"></div></div>';
  }

  function empty(text, sub) {
    return '<div class="empty"><div class="empty-icon"></div><p class="empty-text">' + Util.esc(text) + '</p>' +
      (sub ? '<p class="empty-sub">' + Util.esc(sub) + '</p>' : '') + '</div>';
  }

  function escapeAttr(s) { return Util.escapeAttr(s); }

  return {
    el: el,
    toast: toast,
    modal: modal,
    confirmDialog: confirmDialog,
    formDialog: formDialog,
    loading: loading,
    subjectTag: subjectTag,
    masteryBar: masteryBar,
    empty: empty,
    escapeAttr: escapeAttr
  };
})();
