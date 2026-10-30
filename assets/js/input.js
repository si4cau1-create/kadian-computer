/* 输入模式自适应：键鼠 → 划词提问；触屏 → 点词即讲
   判据是「最近一次交互的输入设备」，不是设备类型：
   手机插上蓝牙/USB 键鼠后，pointerdown 的 pointerType 变成 mouse → 自动切到划词模式。 */
var InputMode = (function () {
  var mode = 'touch';                 /* 'mouse' | 'touch' */
  var listeners = [];
  var segCache = {};

  function current() { return mode; }
  function isMouse() { return mode === 'mouse'; }
  function isTouch() { return mode === 'touch'; }

  function set(m) {
    if (mode === m) return;
    mode = m;
    listeners.forEach(function (fn) {
      try { fn(m); } catch (e) { console.warn(e); }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return fn;
  }

  function init() {
    /* 初始按设备能力猜：有 hover 且 pointer:fine → 键鼠 */
    try {
      if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) set('mouse');
    } catch (e) { /* 老浏览器忽略 */ }
    var handler = function (e) {
      var pt = (e && e.pointerType ? e.pointerType : '').toLowerCase();
      if (pt === 'mouse') set('mouse');
      else if (pt === 'touch' || pt === 'pen') set('touch');
    };
    /* pointer 事件优先；老 WebView 退回 touch/mouse 事件 */
    if (window.PointerEvent) {
      document.addEventListener('pointerdown', handler, { passive: true, capture: true });
    } else {
      document.addEventListener('mousedown', handler, { passive: true, capture: true });
      document.addEventListener('touchstart', handler, { passive: true, capture: true });
    }
  }

  /* ---------- 点词取词 ---------- */

  function langOf(subject) {
    if (subject === 'japanese') return 'ja';
    if (subject === 'english') return 'en';
    if (subject === 'chinese') return 'zh';
    return 'zh';
  }

  function segmenter(lang) {
    if (segCache[lang] !== undefined) return segCache[lang];
    var seg = null;
    try {
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        seg = new Intl.Segmenter(lang, { granularity: 'word' });
      }
    } catch (e) { seg = null; }
    segCache[lang] = seg;
    return seg;
  }

  /* 文本 → 词列表 [{start, end, text}] */
  function wordsOf(text, lang) {
    var out = [];
    var seg = segmenter(langOf(lang));
    if (seg) {
      /* segment() 返回的是 Segments 对象，需按迭代协议遍历 */
      for (var part of seg.segment(text)) {
        if (!part || !part.isWordLike) continue;
        out.push({ start: part.index, end: part.index + part.segment.length, text: part.segment });
      }
      return out;
    }
    /* 兜底：英文按字母数字，日文/中文按连续汉字假名 */
    var re = /[A-Za-z0-9_]+|[぀-ヿㇰ-ㇿ㐀-䶿一-鿿豈-﫿]+/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
    return out;
  }

  /* 点击坐标 → 该位置所在的词（点词即讲用） */
  function wordAt(x, y, subject) {
    var range = null;
    try {
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
      } else if (document.caretPositionFromPoint) {
        var pos = document.caretPositionFromPoint(x, y);
        if (pos && pos.offsetNode) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }
    } catch (e) { range = null; }
    if (!range || !range.startContainer) return '';

    var node = range.startContainer;
    if (node.nodeType !== 3) {
      node = node.firstChild;
      if (!node || node.nodeType !== 3) return '';
    }
    var text = node.textContent || '';
    if (!text) return '';

    var words = wordsOf(text, subject);
    if (!words.length) return '';
    var offset = range.startOffset;

    /* 光标可能落在字符前或后，两个偏移都试 */
    for (var k = 0; k < 2; k++) {
      var off = k === 0 ? offset : offset - 1;
      if (off < 0 || off > text.length) continue;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (off >= w.start && off < w.end) return w.text;
      }
    }
    return '';
  }

  return {
    current: current,
    isMouse: isMouse,
    isTouch: isTouch,
    set: set,
    onChange: onChange,
    init: init,
    wordAt: wordAt,
    wordsOf: wordsOf
  };
})();
