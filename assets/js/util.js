/* 通用工具：图片压缩、Markdown 渲染、时间格式化 */
var Util = (function () {

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* HTML 属性值转义（esc 已转双引号，这里统一入口） */
  function escapeAttr(s) { return esc(s); }

  /* 图片压缩为 dataURL（控制上传体积与 token 成本） */
  function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1600;
    quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片解码失败')); };
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ dataUrl: dataUrl, width: cw, height: ch, bytes: Math.round(dataUrl.length * 0.75) });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* 轻量 Markdown → HTML（离线可用），数学公式保留 $ 交给 KaTeX */
  function mdToHtml(src) {
    var lines = String(src == null ? '' : src).replace(/\r\n/g, '\n').split('\n');
    var out = [], listType = null, inCode = false, codeBuf = [];

    function closeList() {
      if (listType) { out.push('</' + listType + '>'); listType = null; }
    }
    function inline(s) {
      s = esc(s);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return s;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i], m;
      if (/^```/.test(line)) {
        if (inCode) { out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>'); codeBuf = []; inCode = false; }
        else { closeList(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        closeList();
        var lv = m[1].length;
        out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>');
        continue;
      }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
        out.push('<li>' + inline(m[1]) + '</li>');
        continue;
      }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
        out.push('<li>' + inline(m[1]) + '</li>');
        continue;
      }
      if ((m = line.match(/^>\s?(.*)$/))) {
        closeList();
        out.push('<blockquote>' + inline(m[1]) + '</blockquote>');
        continue;
      }
      if (!line.trim()) { closeList(); continue; }
      closeList();
      out.push('<p>' + inline(line) + '</p>');
    }
    closeList();
    if (inCode) out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>');
    return out.join('');
  }

  function renderInto(el, text) {
    el.innerHTML = mdToHtml(text);
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false,
          ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
        });
      } catch (e) { /* 公式渲染失败不影响正文 */ }
    }
    return el;
  }

  function fmtDate(d) {
    if (!d) return '';
    var s = String(d);
    return s.length > 10 ? s.slice(0, 10) : s;
  }

  function relDate(dateStr) {
    if (!dateStr) return '';
    var d = daysBetween(dateStr, todayStr());
    if (d === 0) return '今天';
    if (d === 1) return '明天';
    if (d === 2) return '后天';
    if (d < 0) return '逾期 ' + (-d) + ' 天';
    return d + ' 天后';
  }

  function fmtBytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }

  /* UTF-8 字符串 → base64（APK 桥接用） */
  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(String(str == null ? '' : str));
    var bin = '';
    var CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }

  function download(filename, content, mime) {
    /* APK 内：经 JavascriptInterface 交给系统下载目录（分片防 Binder 限制） */
    var ka = window.KadianAndroid;
    if (ka && typeof ka.exportChunk === 'function') {
      try {
        var b64 = utf8ToB64(content);
        var step = 400000;
        for (var i = 0; i < b64.length; i += step) ka.exportChunk(b64.slice(i, i + step));
        ka.exportEnd(filename, mime || 'application/json');
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    }
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    return Promise.resolve();
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return Promise.reject(new Error('当前环境不支持剪贴板'));
  }

  return {
    esc: esc,
    escapeAttr: escapeAttr,
    utf8ToB64: utf8ToB64,
    compressImage: compressImage,
    mdToHtml: mdToHtml,
    renderInto: renderInto,
    fmtDate: fmtDate,
    relDate: relDate,
    fmtBytes: fmtBytes,
    debounce: debounce,
    download: download,
    copyText: copyText
  };
})();
