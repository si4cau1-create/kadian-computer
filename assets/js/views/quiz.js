/* 做题（2.0 核心）：出题 → 语篇触点精讲（不会→了解，就地展开）→ 学会入库 → 间隔复习
   - 语篇来源二选一：AI 现造一段，或从题库（自导入 / 已识别知识点）选题
   - 即点即学：题库里用 |{|…|}| 标出的语法点渲染成下划线，点一下就讲
   - 精讲结果缓存：同一「学科+片段」只问一次 API，再点直接读缓存
   全程不跳出本页：不出弹窗提问、不跳路由，从「不会」到「了解」零跳转。 */
window.Views = window.Views || {};

window.Views.quiz = {
  state: {
    subject: 'japanese',
    count: 3,
    session: null,      // { passageText, marked, source, passageZh, problems: [] }
    answers: {},        // problemId → userAnswer
    results: {},        // problemId → { correct }
    explains: {}        // sel → { exp, saved, loading, error, cached }
  },

  render: async function (root, params) {
    var self = this;
    var st = await Store.getSettings();
    this.state.subject = st.study.subject || 'japanese';
    this.state.count = st.study.quizCount || 3;
    this.state.session = null;
    this.state.answers = {};
    this.state.results = {};
    this.state.explains = {};

    if (!AI.isConfigured()) {
      root.innerHTML = '<div class="page-head"><h1 class="page-title">做题</h1></div>' +
        '<div class="notice notice-warn"><div class="notice-title">还没配置 AI 服务</div>' +
        '<p class="notice-text">出题和讲解都需要大模型。到「设置」填 base_url、API Key 和模型名即可，配置只存在你本机。</p>' +
        '<button class="btn btn-primary" data-act="tosettings">去配置</button></div>';
      root.querySelector('[data-act="tosettings"]').addEventListener('click', function () { location.hash = '#/settings'; });
      return;
    }

    root.innerHTML =
      '<div class="page-head"><div><h1 class="page-title">做题</h1>' +
      '<p class="page-sub">做题 → 不会 → 了解 → 学会，全程不跳出这一页</p></div></div>' +
      '<div id="qzIdle"></div>' +
      '<div id="qzArea"></div>';

    root.addEventListener('click', function (e) { self.onClick(e, root); });

    /* 窗口跨越 1024px 断点时重新摆放精讲区（手机：语篇下方；桌面：右栏） */
    if (!this._resizeBound) {
      this._resizeBound = true;
      window.addEventListener('resize', Util.debounce(function () {
        var v = document.getElementById('view');
        var q = window.Views && window.Views.quiz;
        if (v && q && q.state.session) q.placeExplain(v);
      }, 150));
    }

    this.renderIdle(root);
  },

  /* ---------- 起始页：学科 + 出题 + 题库 ---------- */
  renderIdle: async function (root) {
    var self = this;
    var idle = root.querySelector('#qzIdle');
    if (!idle) return;

    var chips = CONFIG.SUBJECTS.map(function (sub) {
      var on = self.state.subject === sub.id;
      var ready = sub.beta !== false;              /* 其它学科暂未适配 → 敬请期待 */
      return '<button class="chip' + (on ? ' on' : '') + (ready ? '' : ' chip-soon') +
        '" data-subj="' + sub.id + '" data-ready="' + (ready ? '1' : '0') + '" style="--c:' + sub.color + '">' +
        sub.name + (ready ? '' : '<span class="chip-soon-t">敬请期待</span>') + '</button>';
    }).join('');

    var passages = await Store.listPassages({ subject: this.state.subject });
    var h = [];
    h.push('<div class="subject-pick" id="qzSubj">' + chips + '</div>');
    h.push('<div class="qz-start"><button class="btn btn-primary" data-act="gen">出 ' + this.state.count + ' 道题</button>' +
      '<button class="btn btn-ghost" data-act="import">导入语篇</button>' +
      '<span class="muted small">AI 现造一段真实语篇，或用自己导入的语篇（' + this.state.count + ' 道题）</span></div>');

    h.push('<div class="section"><div class="section-head"><h2>我的题库</h2>' +
      '<span class="muted">' + passages.length + ' 篇</span></div>');
    if (!passages.length) {
      h.push(UI.empty('题库还是空的', '导入一段带标记的语篇，或让 AI 帮你识别知识点'));
    } else {
      h.push('<div class="stack">');
      passages.forEach(function (p) {
        h.push('<div class="pz-item" data-pid="' + p.id + '">');
        h.push('<div class="pz-top"><b>' + Util.esc(p.title) + '</b>' +
          '<span class="pz-meta">' + (p.markCount ? p.markCount + ' 个即点区域' : '未标记知识点') +
          (p.source ? ' · ' + Util.esc(p.source) : '') + '</span></div>');
        h.push('<div class="pz-text">' + Util.esc(String(p.plain || '').slice(0, 80)) + (String(p.plain || '').length > 80 ? '…' : '') + '</div>');
        h.push('<div class="row-btns">');
        h.push('<button class="btn btn-primary btn-xs" data-act="pzdo" data-pid="' + p.id + '">开始做题</button>');
        h.push('<button class="btn btn-ghost btn-xs" data-act="pzedit" data-pid="' + p.id + '">编辑</button>');
        h.push('<button class="btn btn-ghost btn-xs" data-act="pzdel" data-pid="' + p.id + '">删除</button>');
        h.push('</div></div>');
      });
      h.push('</div>');
    }
    h.push('</div>');

    idle.innerHTML = h.join('');
  },

  /* ---------- 出题（AI 现造语篇） ---------- */
  generate: async function (root) {
    var l = UI.loading('AI 正在出题（语篇 + 题目）…');
    try {
      var res = await Store.generateQuiz(this.state.subject, this.state.count);
      l.close();
      this.state.session = {
        passageText: res.passage, marked: false, source: res.source || 'AI 生成',
        passageZh: res.passageZh || '', problems: res.problems
      };
      this.state.answers = {};
      this.state.results = {};
      this.state.explains = {};
      this.renderSession(root);
      UI.toast('出好了：先读语篇，不会的就选中它', 'info');
    } catch (err) {
      l.close();
      UI.toast(err.message || '出题失败', 'error');
    }
  },

  /* ---------- 基于题库语篇出题 ---------- */
  startFromPassage: async function (root, pid) {
    var p = await Store.getPassage(pid);
    if (!p) { UI.toast('语篇不存在', 'error'); return; }
    var l = UI.loading('正在基于这段语篇出题…');
    try {
      var res = await Store.generateQuizFromPassage(this.state.subject, p.text, this.state.count);
      l.close();
      this.state.session = {
        passageText: p.text, marked: Marks.has(p.text), source: p.title || '题库语篇',
        passageZh: '', format: p.format || 'text', problems: res.problems
      };
      this.state.answers = {};
      this.state.results = {};
      this.state.explains = {};
      this.renderSession(root);
      UI.toast('出好了：下划线的点可以直接点开讲', 'info');
    } catch (err) {
      l.close();
      UI.toast(err.message || '出题失败', 'error');
    }
  },

  /* 当前交互模式的提示文案：键鼠划词 / 触屏长按选中 */
  tipText: function () {
    var s = this.state.session;
    if (s && s.marked) return '带下划线的就是即点区域，点一下直接讲；也可以划词后自己提问';
    return InputMode.isMouse()
      ? '选中不懂的词或句子，点弹出的「提问」——自己写下问题，当场讲完接着做题'
      : '长按选中不懂的词或句子，点弹出的「提问」——自己写下问题，当场讲完接着做题';
  },

  modeLabel: function () {
    return InputMode.isMouse() ? '键鼠模式 · 划词提问' : '触屏模式 · 长按选中提问';
  },

  refreshTip: function (root) {
    var tip = root.querySelector('#qzTip');
    if (tip) tip.textContent = this.tipText();
    var md = root.querySelector('#qzMode');
    if (md) md.textContent = this.modeLabel();
  },

  /* ---------- 会话渲染 ---------- */
  renderSession: function (root) {
    var self = this;
    var s = this.state.session;
    if (!s) return;
    var idle = root.querySelector('#qzIdle');
    if (idle) idle.innerHTML = '';
    var h = [];

    h.push('<div id="qzArea" class="qz-layout">');
    h.push('<div id="qzMain">');

    /* 语篇卡 */
    h.push('<div class="qz-card qz-passage-card">');
    h.push('<div class="qz-card-top">' + UI.subjectTag(this.state.subject) +
      '<span class="muted small qz-src">' + Util.esc(s.source || '') + '</span>' +
      '<span class="muted small qz-mode" id="qzMode">' + Util.esc(this.modeLabel()) + '</span>' +
      (s.passageZh ? '<button class="btn btn-ghost btn-xs" data-act="zh">显示翻译</button>' : '') + '</div>');
    h.push('<div class="qz-passage" id="qzPassage">' + this.passageHTML(s.passageText, s.marked, s.format) + '</div>');
    if (s.passageZh) h.push('<div class="qz-zh" id="qzZh" style="display:none">' + Util.esc(s.passageZh) + '</div>');
    h.push('<div class="qz-tip" id="qzTip">' + Util.esc(this.tipText()) + '</div>');
    h.push('<div class="row-btns">');
    h.push('<button class="btn btn-ghost btn-xs" data-act="back">换一篇</button>');
    h.push('</div></div>');

    /* 精讲卡区：手机端在语篇与题目之间；桌面端移到右栏（见 placeExplain） */
    h.push('<div id="qzExplains" class="stack"></div>');

    /* 题目区 */
    h.push('<div class="qz-q-head-row"><span class="muted small">基于语篇作答</span>' +
      '<button class="btn btn-ghost btn-xs" data-act="regen">再来一组</button></div>');
    h.push('<div class="stack" id="qzQuestions">');
    s.problems.forEach(function (p, i) { h.push(self.questionHTML(p, i)); });
    h.push('</div>');
    h.push('<div id="qzSummary"></div>');

    h.push('</div>');   /* /qzMain */
    h.push('<div id="qzSide" class="qz-side"><div class="qz-side-title">就点即讲 · 不跳页</div></div>');
    h.push('</div>');   /* /qzArea */

    var area = root.querySelector('#qzArea');
    area.innerHTML = h.join('');

    var passage = root.querySelector('#qzPassage');
    if (passage) {
      /* 划词提问：选中后浮出提问按钮 → 弹输入框，用户自己问（留空则按默认讲解） */
      Select.enable(passage, function (sel) { self.askQuestion(root, sel); }, '提问');
    }
    this.placeExplain(root);
    window.scrollTo(0, 0);
  },

  /* 桌面端（≥1024px）：精讲卡移到右栏，不打断左侧滚动 */
  placeExplain: function (root) {
    var main = root.querySelector('#qzMain');
    var side = root.querySelector('#qzSide');
    var ex = root.querySelector('#qzExplains');
    if (!main || !side || !ex) return;
    if (window.innerWidth >= 1024) {
      if (ex.parentNode !== side) side.appendChild(ex);
    } else if (ex.parentNode !== main) {
      var qs = main.querySelector('#qzQuestions');
      main.insertBefore(ex, qs);
    }
  },

  /* 语篇渲染：即点区域 → 下划线可点；支持原文 / markdown 两种格式 */
  passageHTML: function (text, marked, format) {
    if (format === 'md') return this.passageMarkdownHTML(text, marked);
    if (!marked) return Util.esc(text);
    var i = 0;
    return Marks.parse(text).map(function (seg) {
      if (seg.type === 'text') return Util.esc(seg.value);
      i++;
      return '<span class="qz-mark" data-mark="' + i + '" data-text="' + Util.escapeAttr(seg.value) + '">' +
        Util.esc(seg.value) + '</span>';
    }).join('');
  },

  /* Markdown 语篇：先渲染 markdown，再把即点区域包回可点 span */
  passageMarkdownHTML: function (text, marked) {
    if (!marked) return Util.mdToHtml(text);
    var toks = [];
    var parts = Marks.parse(text).map(function (seg) {
      if (seg.type === 'text') return seg.value;
      var i = toks.length;
      toks.push(seg.value);
      return '\u0001M' + i + '\u0001';
    });
    var html = Util.mdToHtml(parts.join(''));
    toks.forEach(function (v, i) {
      var token = '\u0001M' + i + '\u0001';
      html = html.split(token).join(
        '<span class="qz-mark" data-mark="' + (i + 1) + '" data-text="' + Util.escapeAttr(v) + '">' + Util.esc(v) + '</span>'
      );
    });
    return html;
  },

  questionHTML: function (p, i) {
    var self = this;
    var r = this.state.results[p.id];
    var answered = !!r;
    var h = [];
    h.push('<div class="qz-card qz-q" data-qid="' + p.id + '">');
    h.push('<div class="qz-q-head"><span class="qz-q-no">第 ' + (i + 1) + ' 题</span>' +
      (p.point ? '<span class="muted small">考点：' + Util.esc(p.point) + '</span>' : '') + '</div>');
    h.push('<div class="qz-q-stem">' + Util.esc(p.stem) + '</div>');

    if (p.type === 'choice') {
      h.push('<div class="opt-list">');
      p.options.forEach(function (o, idx) {
        var on = self.state.answers[p.id] === o ? ' on' : '';
        h.push('<button class="opt' + on + '" data-opt="' + Util.escapeAttr(o) + '"' +
          (answered ? ' disabled' : '') + '><span class="opt-key">' + String.fromCharCode(65 + idx) +
          '</span><span class="opt-text">' + Util.esc(o.replace(/^[A-D][.．、]\s*/, '')) + '</span></button>');
      });
      h.push('</div>');
    } else if (p.type === 'fill') {
      h.push('<input class="input" id="qzFill-' + p.id + '" placeholder="输入答案" value="' +
        Util.escapeAttr(self.state.answers[p.id] || '') + '"' + (answered ? ' disabled' : '') + ' />');
    } else {
      h.push('<textarea class="input" rows="3" id="qzSubj-' + p.id + '" placeholder="写下你的答案"' +
        (answered ? ' disabled' : '') + '>' + Util.esc(self.state.answers[p.id] || '') + '</textarea>');
    }

    if (!answered) {
      h.push('<div class="row-btns"><button class="btn btn-primary btn-sm" data-act="submit" data-qid="' + p.id + '">提交</button></div>');
    } else {
      var verdict = r.correct === true ? '答对了' : (r.correct === false ? '答错了' : '已记录');
      h.push('<div class="verdict ' + (r.correct === true ? 'ok' : r.correct === false ? 'bad' : 'half') + '">' + verdict + '</div>');
      h.push('<div class="qz-q-ans"><b>答案：</b>' + Util.esc(p.answer || '（无）') + '</div>');
      if (p.explanation) h.push('<div class="qz-q-exp">' + Util.esc(p.explanation) + '</div>');
    }
    h.push('</div>');
    return h.join('');
  },

  refreshQuestionCard: function (root, pid) {
    var s = this.state.session;
    if (!s) return;
    var idx = -1;
    for (var i = 0; i < s.problems.length; i++) if (s.problems[i].id === pid) idx = i;
    if (idx < 0) return;
    var card = root.querySelector('.qz-q[data-qid="' + pid + '"]');
    if (!card) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = this.questionHTML(s.problems[idx], idx);
    var fresh = tmp.firstChild;
    if (fresh && card.parentNode) card.parentNode.replaceChild(fresh, card);
  },

  /* ---------- 触点精讲 / 即点即学（不会 → 了解） ---------- */

  /* 划词提问：在语篇下方就地展开输入条，让用户自己问（可留空 → 按默认讲解）
     就地展开而不是弹窗遮罩——不打断做题节奏，也符合「全程不跳页」的理念。 */
  askQuestion: function (root, sel) {
    var host = root.querySelector('#qzExplains');
    if (!host) return;
    var old = host.querySelector('#qzAsk');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var box = document.createElement('div');
    box.className = 'qz-ask';
    box.id = 'qzAsk';
    box.innerHTML =
      '<div class="qz-ask-sel">' + Util.esc(sel.length > 60 ? sel.slice(0, 60) + '…' : sel) + '</div>' +
      '<textarea class="input qz-ask-input" rows="2" placeholder="你想问什么？（留空则按默认讲解：释义 + 例句 + 用法）"></textarea>' +
      '<div class="qz-ask-acts">' +
      '<button class="btn btn-primary btn-sm" data-act="askgo" data-sel="' + Util.escapeAttr(sel) + '">提问</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="askcancel">取消</button></div>';
    host.insertBefore(box, host.firstChild);
    var ta = box.querySelector('.qz-ask-input');
    if (ta && ta.focus) {
      try { ta.focus(); } catch (e) { /* 某些 WebView 需要用户手势 */ }
    }
  },

  askGo: function (root, sel) {
    var box = root.querySelector('#qzAsk');
    var q = '';
    if (box) {
      var ta = box.querySelector('.qz-ask-input');
      q = ta ? String(ta.value || '').trim() : '';
      if (box.parentNode) box.parentNode.removeChild(box);
    }
    this.explain(root, sel, { question: q });
  },

  askCancel: function (root) {
    var box = root.querySelector('#qzAsk');
    if (box && box.parentNode) box.parentNode.removeChild(box);
  },

  explain: async function (root, sel, opts) {
    opts = opts || {};
    var st = this.state;
    var prev = st.explains[sel] || {};

    /* 缓存命中：同一「学科 + 片段 + 问题」不再问 API */
    var cached = await Store.getCachedExplain(st.subject, sel, opts.question);
    if (cached) {
      st.explains[sel] = { exp: cached, saved: !!prev.saved, cached: true };
      this.renderExplainCard(root, sel);
      return;
    }

    st.explains[sel] = { loading: true, saved: prev.saved };
    this.renderExplainCard(root, sel);
    try {
      var exp = opts.marked
        ? await AI.explainMarked(st.subject, sel, st.session.passageText)
        : await AI.explainPoint(st.subject, sel, st.session.passageText, { question: opts.question });
      await Store.saveCachedExplain(st.subject, sel, exp, opts.question);
      st.explains[sel] = { exp: exp, saved: !!prev.saved, cached: false };
    } catch (err) {
      st.explains[sel] = { error: err.message || '讲解失败', loading: false, saved: prev.saved };
    }
    this.renderExplainCard(root, sel);
  },

  explainCardHTML: function (sel) {
    var st = this.state.explains[sel] || {};
    var h = [];
    h.push('<div class="qz-card qz-explain" data-sel="' + Util.escapeAttr(sel) + '">');
    if (st.loading) {
      h.push('<div class="qe-loading">讲解中…</div>');
    } else if (st.error) {
      h.push('<div class="qe-error">' + Util.esc(st.error) + '</div>');
      h.push('<div class="qe-acts"><button class="btn btn-ghost btn-sm" data-act="retry" data-sel="' + Util.escapeAttr(sel) + '">重试</button></div>');
    } else if (st.exp) {
      var e = st.exp;
      h.push('<div class="qe-head"><b class="qe-point">' + Util.esc(e.point) + '</b>' +
        (st.cached ? '<span class="qe-cached">已缓存 · 不再花额度</span>' : '') +
        '<span class="qe-sel">' + Util.esc(sel.length > 40 ? sel.slice(0, 40) + '…' : sel) + '</span></div>');
      if (e.meaning) h.push('<div class="qe-meaning">' + Util.esc(e.meaning) + '</div>');
      if (e.examples.length) {
        h.push('<ul class="qe-examples">');
        e.examples.forEach(function (x) {
          h.push('<li><span class="qe-src">' + Util.esc(x.src) + '</span>' +
            (x.zh ? '<span class="qe-zh">' + Util.esc(x.zh) + '</span>' : '') + '</li>');
        });
        h.push('</ul>');
      }
      if (e.usage) h.push('<div class="qe-sec"><span class="qe-label">用法</span><span>' + Util.esc(e.usage) + '</span></div>');
      if (e.mistake) h.push('<div class="qe-sec"><span class="qe-label">常见误用</span><span>' + Util.esc(e.mistake) + '</span></div>');
      h.push('<div class="qe-acts">');
      if (st.saved) {
        h.push('<span class="qe-saved">已入库 · 之后按遗忘曲线复习</span>');
      } else {
        h.push('<button class="btn btn-primary btn-sm" data-act="learn" data-sel="' + Util.escapeAttr(sel) + '">学会了，入库</button>');
        h.push('<button class="btn btn-ghost btn-sm" data-act="simpler" data-sel="' + Util.escapeAttr(sel) + '">没懂，再讲简单点</button>');
      }
      h.push('</div>');
    }
    h.push('</div>');
    return h.join('');
  },

  renderExplainCard: function (root, sel) {
    var host = root.querySelector('#qzExplains');
    if (!host) return;
    var exist = host.querySelector('.qz-explain[data-sel="' + cssEsc(sel) + '"]');
    var tmp = document.createElement('div');
    tmp.innerHTML = this.explainCardHTML(sel);
    var fresh = tmp.firstChild;
    if (!fresh) return;
    if (exist && exist.parentNode) exist.parentNode.replaceChild(fresh, exist);
    else host.appendChild(fresh);
    if (typeof fresh.scrollIntoView === 'function') {
      try { fresh.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { /* 老浏览器不管 */ }
    }
  },

  /* ---------- 学会入库 ---------- */
  learn: async function (root, sel) {
    var st = this.state;
    var rec = st.explains[sel];
    if (!rec || !rec.exp) return;
    var l = UI.loading('入库中…');
    try {
      await Store.savePointAsCard(st.subject, rec.exp, sel, st.session.passageText, st.session.source);
      l.close();
      rec.saved = true;
      this.renderExplainCard(root, sel);
      UI.toast('已入库，之后按遗忘曲线找你复习', 'info');
    } catch (err) {
      l.close();
      UI.toast(err.message || '入库失败', 'error');
    }
  },

  simpler: async function (root, sel) {
    var st = this.state;
    var rec = st.explains[sel] || {};
    var l = UI.loading('换一种更简单的讲法…');
    st.explains[sel] = { loading: true, saved: rec.saved };
    this.renderExplainCard(root, sel);
    try {
      var exp = await AI.explainPoint(st.subject, sel, st.session.passageText, {
        simpler: true,
        prev: rec.exp ? (rec.exp.point + '：' + rec.exp.meaning) : ''
      });
      l.close();
      await Store.saveCachedExplain(st.subject, sel, exp);
      st.explains[sel] = { exp: exp, saved: !!rec.saved, cached: false };
    } catch (err) {
      l.close();
      st.explains[sel] = { error: err.message || '讲解失败', saved: rec.saved, loading: false };
    }
    this.renderExplainCard(root, sel);
  },

  /* ---------- 作答 ---------- */
  submitAnswer: async function (root, pid) {
    var s = this.state.session;
    if (!s) return;
    var p = null;
    for (var i = 0; i < s.problems.length; i++) if (s.problems[i].id === pid) p = s.problems[i];
    if (!p || this.state.results[pid]) return;

    var ua = '';
    if (p.type === 'choice') {
      ua = this.state.answers[pid] || '';
      if (!ua) { UI.toast('先选一个选项', 'error'); return; }
    } else {
      var input = root.querySelector(p.type === 'fill' ? '#qzFill-' + pid : '#qzSubj-' + pid);
      ua = input ? String(input.value || '').trim() : '';
      if (!ua) { UI.toast('先写下答案', 'error'); return; }
      this.state.answers[pid] = ua;
    }

    var selfGrade = null;
    if (p.type === 'subjective') {
      var g = await UI.formDialog({
        title: '自评',
        fields: [{
          key: 'g', label: '这道题你做对了吗？', type: 'select',
          options: [{ value: 'true', label: '做对了' }, { value: 'half', label: '半对' }, { value: 'false', label: '做错了' }]
        }],
        submitText: '记录'
      });
      if (!g) return;
      selfGrade = g.g === 'true' ? true : g.g === 'false' ? false : 'half';
    }

    var l = UI.loading('判分中…');
    try {
      var updated = await Store.answerProblem(pid, ua, selfGrade);
      l.close();
      this.state.results[pid] = { correct: updated.correct };
      this.refreshQuestionCard(root, pid);
      this.maybeSummary(root);
    } catch (err) {
      l.close();
      UI.toast(err.message || '提交失败', 'error');
    }
  },

  maybeSummary: function (root) {
    var s = this.state.session;
    if (!s) return;
    var done = s.problems.filter(function (p) { return this.state.results[p.id]; }, this).length;
    if (done < s.problems.length) return;
    var right = s.problems.filter(function (p) {
      return this.state.results[p.id] && this.state.results[p.id].correct === true;
    }, this).length;
    var host = root.querySelector('#qzSummary');
    if (!host) return;
    host.innerHTML = '<div class="qz-card qz-summary">' +
      '<div class="qz-sum-title">这一组做完了：答对 ' + right + ' / ' + s.problems.length + '</div>' +
      '<div class="qz-sum-sub">语篇里没听懂的点都讲了吗？听懂了就点「学会了，入库」——下次复习会自动找上你。</div>' +
      '<div class="row-btns"><button class="btn btn-primary btn-sm" data-act="regen">再来一组</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="back">换一篇</button></div></div>';
  },

  /* ---------- 题库操作 ---------- */
  importPassage: async function (root) {
    var res = await UI.formDialog({
      title: '导入语篇（题库）',
      fields: [
        { key: 'title', label: '标题', type: 'text', required: true, placeholder: '如：2024高考英语阅读·说明文' },
        {
          key: 'subject', label: '学科', type: 'select',
          options: CONFIG.SUBJECTS.filter(function (s) { return s.beta !== false; })
            .map(function (s) { return { value: s.id, label: s.name }; })
        },
        { key: 'source', label: '来源', type: 'text', placeholder: '如：2024全国甲卷' },
        {
          key: 'format', label: '格式', type: 'select',
          options: [
            { value: 'text', label: '原文（逐字呈现，适合日语课文/真题）' },
            { value: 'md', label: 'Markdown（渲染标题/列表/表格，适合语法讲解文档）' }
          ]
        },
        {
          key: 'text', label: '语篇原文', type: 'textarea', rows: 8, required: true,
          placeholder: '把要学的词用 |{| … |}| 框住，例如：日本語を勉強し始めて|{|まだ半年|}だが',
          hint: '标记语法：|{| 内容 |}| —— 框住的部分就是「即点区域」，做题时渲染成下划线，点一下直接讲。Markdown 格式下也可用'
        }
      ],
      values: { subject: this.state.subject, format: 'text' },
      submitText: '存入题库'
    });
    if (!res) return;
    try {
      var rec = await Store.savePassage({
        subject: res.subject || this.state.subject,
        title: res.title,
        source: res.source,
        format: res.format,
        text: res.text
      });
      UI.toast(rec.markCount ? '已存入题库（' + rec.markCount + ' 个即点区域）' : '已存入题库', 'info');
      this.renderIdle(root);
    } catch (err) {
      UI.toast(err.message || '导入失败', 'error');
    }
  },

  /* 编辑语篇：识别后的标记可以改，标记可以重新框选 */
  editPassage: async function (root, pid) {
    var p = await Store.getPassage(pid);
    if (!p) { UI.toast('语篇不存在', 'error'); return; }
    var res = await UI.formDialog({
      title: '编辑语篇',
      fields: [
        { key: 'title', label: '标题', type: 'text', required: true },
        { key: 'source', label: '来源', type: 'text' },
        {
          key: 'format', label: '格式', type: 'select',
          options: [
            { value: 'text', label: '原文（逐字呈现）' },
            { value: 'md', label: 'Markdown（渲染）' }
          ]
        },
        {
          key: 'text', label: '语篇原文', type: 'textarea', rows: 8, required: true,
          hint: '即点区域用 |{| … |}| 框住；直接改文字即可重新框选，保存后立即生效'
        }
      ],
      values: { title: p.title, source: p.source, format: p.format || 'text', text: p.text },
      submitText: '保存'
    });
    if (!res) return;
    try {
      var rec = await Store.savePassage({
        id: p.id, createdAt: p.createdAt, subject: p.subject,
        title: res.title, source: res.source, format: res.format, text: res.text
      });
      UI.toast(rec.markCount ? '已保存（' + rec.markCount + ' 个即点区域）' : '已保存', 'info');
      this.renderIdle(root);
    } catch (err) {
      UI.toast(err.message || '保存失败', 'error');
    }
  },



  deletePassage: async function (root, pid) {
    var okDel = await UI.confirmDialog('删除这篇语篇？已入库的卡点不受影响。', '删除');
    if (!okDel) return;
    await Store.deletePassage(pid);
    UI.toast('已删除', 'info');
    this.renderIdle(root);
  },

  /* ---------- 事件 ---------- */
  onClick: function (e, root) {
    var self = this;

    var subj = e.target.closest ? e.target.closest('[data-subj]') : null;
    if (subj) {
      if (subj.getAttribute('data-ready') === '0') {
        UI.toast('该学科暂未适配这种学法，敬请期待', 'info');
        return;
      }
      this.state.subject = subj.getAttribute('data-subj');
      root.querySelectorAll('#qzSubj .chip').forEach(function (x) { x.classList.remove('on'); });
      subj.classList.add('on');
      this.renderIdle(root);
      return;
    }

    /* 即点区域：点一下直接讲 */
    var mark = e.target.closest ? e.target.closest('.qz-mark') : null;
    if (mark) {
      var sel = mark.getAttribute('data-text') || mark.textContent || '';
      if (sel.trim()) this.explain(root, sel.trim(), { marked: true });
      return;
    }

    var opt = e.target.closest ? e.target.closest('[data-opt]') : null;
    if (opt && !opt.disabled) {
      var qcard = opt.closest('.qz-q');
      var pid = qcard ? qcard.getAttribute('data-qid') : '';
      this.state.answers[pid] = opt.getAttribute('data-opt');
      qcard.querySelectorAll('.opt').forEach(function (x) { x.classList.remove('on'); });
      opt.classList.add('on');
      return;
    }

    var node = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!node) return;
    var act = node.getAttribute('data-act');
    var sel2 = node.getAttribute('data-sel') || '';
    var ppid = node.getAttribute('data-pid') || '';

    if (act === 'tosettings') location.hash = '#/settings';
    else if (act === 'gen' || act === 'regen') this.generate(root);
    else if (act === 'import') this.importPassage(root);
    else if (act === 'pzdo') this.startFromPassage(root, ppid);
    else if (act === 'pzedit') this.editPassage(root, ppid);
    else if (act === 'pzdel') this.deletePassage(root, ppid);
    else if (act === 'back') {
      this.state.session = null;
      this.state.explains = {};
      var area = root.querySelector('#qzArea');
      if (area) area.innerHTML = '';
      this.renderIdle(root);
    } else if (act === 'zh') {
      var zh = root.querySelector('#qzZh');
      if (zh) {
        var show = zh.style.display === 'none';
        zh.style.display = show ? 'block' : 'none';
        node.textContent = show ? '隐藏翻译' : '显示翻译';
      }
    } else if (act === 'submit') this.submitAnswer(root, node.getAttribute('data-qid'));
    else if (act === 'askgo') this.askGo(root, sel2);
    else if (act === 'askcancel') this.askCancel(root);
    else if (act === 'learn') this.learn(root, sel2);
    else if (act === 'simpler') this.simpler(root, sel2);
    else if (act === 'retry') this.explain(root, sel2);
  }
};

/* data-sel 属性选择器转义（选中文本可能含引号） */
function cssEsc(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}
