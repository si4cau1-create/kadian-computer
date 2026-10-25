/* 做题（2.0 核心）：API 出题 → 语篇触点精讲（不会→了解，就地展开）→ 学会入库 → 间隔复习
   全程不跳出本页：不出弹窗提问、不跳路由，从「不会」到「了解」零跳转。 */
window.Views = window.Views || {};

window.Views.quiz = {
  state: {
    subject: 'japanese',
    count: 3,
    session: null,      // { passage, passageZh, source, problems: [] }
    answers: {},        // problemId → userAnswer
    results: {},        // problemId → { correct }
    explains: {}        // sel → { exp, saved, loading, error }
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

    var chips = CONFIG.SUBJECTS.map(function (sub) {
      return '<button class="chip' + (self.state.subject === sub.id ? ' on' : '') +
        '" data-subj="' + sub.id + '" style="--c:' + sub.color + '">' + sub.name + '</button>';
    }).join('');

    root.innerHTML =
      '<div class="page-head"><div><h1 class="page-title">做题</h1>' +
      '<p class="page-sub">做题 → 不会 → 了解 → 学会，全程不跳出这一页</p></div></div>' +
      '<div class="subject-pick" id="qzSubj">' + chips + '</div>' +
      '<div class="qz-start"><button class="btn btn-primary" data-act="gen">出 ' + this.state.count + ' 道题</button>' +
      '<span class="muted small">AI 生成一段真实语篇 + ' + this.state.count + ' 道题；语篇里遇到不会的，选中即讲</span></div>' +
      '<div id="qzArea"></div>';

    root.addEventListener('click', function (e) { self.onClick(e, root); });
  },

  /* ---------- 出题 ---------- */
  generate: async function (root) {
    var self = this;
    var l = UI.loading('AI 正在出题（语篇 + 题目）…');
    try {
      var res = await Store.generateQuiz(this.state.subject, this.state.count);
      l.close();
      this.state.session = res;
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

  /* ---------- 会话渲染 ---------- */
  renderSession: function (root) {
    var self = this;
    var s = this.state.session;
    if (!s) return;
    var h = [];

    /* 语篇卡：语篇是「不会→了解」的载体，整段可划选 */
    h.push('<div class="qz-card qz-passage-card">');
    h.push('<div class="qz-card-top">' + UI.subjectTag(this.state.subject) +
      '<span class="muted small qz-src">' + Util.esc(s.source || '') + '</span>' +
      (s.passageZh ? '<button class="btn btn-ghost btn-xs" data-act="zh">显示翻译</button>' : '') + '</div>');
    h.push('<div class="qz-passage" id="qzPassage">' + Util.esc(s.passage) + '</div>');
    if (s.passageZh) h.push('<div class="qz-zh" id="qzZh" style="display:none">' + Util.esc(s.passageZh) + '</div>');
    h.push('<div class="qz-tip">选中不懂的词或句子，点弹出的「讲一下」——当场讲完接着做题，不跳页</div>');
    h.push('</div>');

    /* 精讲卡区：就地展开，位于语篇正下方 */
    h.push('<div id="qzExplains" class="stack"></div>');

    /* 题目区 */
    h.push('<div class="qz-q-head-row"><span class="muted small">基于语篇作答</span>' +
      '<button class="btn btn-ghost btn-xs" data-act="regen">再来一组</button></div>');
    h.push('<div class="stack" id="qzQuestions">');
    s.problems.forEach(function (p, i) { h.push(self.questionHTML(p, i)); });
    h.push('</div>');
    h.push('<div id="qzSummary"></div>');

    var area = root.querySelector('#qzArea');
    area.innerHTML = h.join('');

    /* 划选 → 讲一下 */
    var passage = root.querySelector('#qzPassage');
    if (passage) {
      Select.enable(passage, function (sel) { self.explain(root, sel); }, '讲一下');
    }
    window.scrollTo(0, 0);
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

  /* ---------- 触点精讲（不会 → 了解） ---------- */
  explain: async function (root, sel) {
    var self = this;
    var st = this.state;
    var prev = st.explains[sel] || {};
    st.explains[sel] = { loading: true, saved: prev.saved, exp: prev.exp };
    this.renderExplainCard(root, sel);
    try {
      var exp = await AI.explainPoint(st.subject, sel, st.session.passage);
      st.explains[sel] = { exp: exp, saved: !!prev.saved, loading: false };
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
      await Store.savePointAsCard(st.subject, rec.exp, sel, st.session.passage, st.session.source);
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
      var exp = await AI.explainPoint(st.subject, sel, st.session.passage, {
        simpler: true,
        prev: rec.exp ? (rec.exp.point + '：' + rec.exp.meaning) : ''
      });
      l.close();
      st.explains[sel] = { exp: exp, saved: !!rec.saved, loading: false };
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
      '<button class="btn btn-ghost btn-sm" data-act="toreview">去复习</button></div></div>';
  },

  /* ---------- 事件 ---------- */
  onClick: function (e, root) {
    var self = this;
    var subj = e.target.closest ? e.target.closest('[data-subj]') : null;
    if (subj) {
      this.state.subject = subj.getAttribute('data-subj');
      root.querySelectorAll('#qzSubj .chip').forEach(function (x) { x.classList.remove('on'); });
      subj.classList.add('on');
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
    var sel = node.getAttribute('data-sel') || '';
    if (act === 'tosettings') location.hash = '#/settings';
    else if (act === 'gen' || act === 'regen') this.generate(root);
    else if (act === 'zh') {
      var zh = root.querySelector('#qzZh');
      if (zh) {
        var show = zh.style.display === 'none';
        zh.style.display = show ? 'block' : 'none';
        node.textContent = show ? '隐藏翻译' : '显示翻译';
      }
    } else if (act === 'submit') this.submitAnswer(root, node.getAttribute('data-qid'));
    else if (act === 'learn') this.learn(root, sel);
    else if (act === 'simpler') this.simpler(root, sel);
    else if (act === 'retry') this.explain(root, sel);
    else if (act === 'toreview') location.hash = '#/review';
  }
};

/* data-sel 属性选择器转义（选中文本可能含引号） */
function cssEsc(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}
