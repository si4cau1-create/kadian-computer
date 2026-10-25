/* 划选交互：在文本区选中任意片段后浮出操作按钮 */
var Select = (function () {
  var btn = null;

  function ensureBtn() {
    if (btn && btn.parentNode) return btn;
    btn = document.createElement('button');
    btn.className = 'float-select';
    btn.style.display = 'none';
    document.body.appendChild(btn);
    return btn;
  }

  function hide() { if (btn) btn.style.display = 'none'; }

  function contextAround(container, sel) {
    var node = sel.anchorNode;
    while (node && node !== container) {
      if (node.nodeType === 3 && node.textContent && node.textContent.trim().length > 24) {
        return node.textContent.trim().slice(0, 800);
      }
      node = node.parentNode;
    }
    var p = container.querySelector('p');
    return p ? p.textContent.trim().slice(0, 800) : '';
  }

  function enable(container, onSelect, label) {
    function onUp() {
      setTimeout(function () {
        var sel = window.getSelection();
        var text = sel ? String(sel).trim() : '';
        if (!text || !sel.anchorNode || !container.contains(sel.anchorNode)) { hide(); return; }
        var rect;
        try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch (e) { hide(); return; }
        if (!rect || (!rect.width && !rect.height)) { hide(); return; }
        var b = ensureBtn();
        b.textContent = label || '提问';
        b.style.display = 'block';
        b.style.top = Math.max(8, rect.top + window.scrollY - 46) + 'px';
        b.style.left = Math.max(8, Math.min(window.innerWidth - 90, rect.left + window.scrollX + rect.width / 2 - 36)) + 'px';
        b.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          var t = String(window.getSelection() ? window.getSelection() : '').trim();
          var ctx = contextAround(container, sel);
          hide();
          if (t) onSelect(t, ctx);
        };
      }, 20);
    }
    container.addEventListener('mouseup', onUp);
    container.addEventListener('touchend', onUp);
    document.addEventListener('scroll', hide, true);
    return { hide: hide };
  }

  return { enable: enable, hide: hide };
})();
