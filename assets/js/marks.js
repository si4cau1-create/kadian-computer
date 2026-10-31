/* 即点区域标记：|{| … |}|
   用户自导入与 API 一键识别共用这一套语法（弃用 *{*…*}*：与 Markdown 斜体冲突）
   容错：闭合写成 |}（少一个竖线，模型常犯）也认，避免整段不渲染。
   解析结果是一串段：[文本段] 与 [即点区域段] 交替。 */
var Marks = (function () {
  var OPEN = '|{|';
  var CLOSE = '|}|';
  var CLOSE_SHORT = '|}';       /* 容错：闭合少一个竖线 */

  /* 解析带标记文本 → [{type:'text'|'mark', value}] */
  function parse(text) {
    var out = [];
    var s = String(text == null ? '' : text);
    var i = 0;
    while (i < s.length) {
      var o = s.indexOf(OPEN, i);
      if (o < 0) {
        if (i < s.length) out.push({ type: 'text', value: s.slice(i) });
        break;
      }
      if (o > i) out.push({ type: 'text', value: s.slice(i, o) });
      var c = s.indexOf(CLOSE, o + OPEN.length);
      var closeLen = CLOSE.length;
      if (c < 0) {                      /* 容错：闭合写成 |} */
        c = s.indexOf(CLOSE_SHORT, o + OPEN.length);
        closeLen = CLOSE_SHORT.length;
      }
      if (c < 0) {                       /* 未闭合的标记：原样当普通文本，不吞内容 */
        out.push({ type: 'text', value: s.slice(o) });
        break;
      }
      out.push({ type: 'mark', value: s.slice(o + OPEN.length, c) });
      i = c + closeLen;
    }
    return out;
  }

  /* 去掉标记 → 纯文本 */
  function strip(text) {
    return parse(text).map(function (seg) { return seg.value; }).join('');
  }

  /* 列出所有即点区域文本 */
  function list(text) {
    return parse(text)
      .filter(function (seg) { return seg.type === 'mark'; })
      .map(function (seg) { return seg.value; });
  }

  /* 给纯文本里的若干片段加标记（按出现顺序，依次匹配，不重复标记） */
  function wrap(text, pieces) {
    var s = String(text == null ? '' : text);
    var list2 = (pieces || []).map(function (p) { return String(p || ''); })
      .filter(function (p) { return p.length > 0; })
      .sort(function (a, b) { return b.length - a.length; });   /* 长片段优先，避免短片段先吃掉 */
    var marks = [];
    list2.forEach(function (p) {
      var idx = s.indexOf(p);
      if (idx < 0) return;
      marks.push({ start: idx, end: idx + p.length });
      s = s.slice(0, idx) + ' ' + s.slice(idx + p.length);
    });
    marks.sort(function (a, b) { return a.start - b.start; });
    var out = '';
    var cur = 0;
    marks.forEach(function (m) {
      out += String(text).slice(cur, m.start) + OPEN + String(text).slice(m.start, m.end) + CLOSE;
      cur = m.end;
    });
    out += String(text).slice(cur);
    return out;
  }

  /* 是否含标记 */
  function has(text) {
    return String(text == null ? '' : text).indexOf(OPEN) >= 0;
  }

  return {
    OPEN: OPEN, CLOSE: CLOSE,
    parse: parse, strip: strip, list: list, wrap: wrap, has: has
  };
})();
