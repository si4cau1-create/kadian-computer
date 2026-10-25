/* 卡点库 + 语篇：搜索筛选、详情、编辑、语篇划选标记 */
window.Views = window.Views || {};

window.Views.library = {
  state: { tab: 'cards', q: '', subject: 'all' },

  render: async function (root, params) {
    var self = this;
    if (params && params.new) { location.hash = '#/library'; setTimeout(function () { self.quickNew(); }, 100); }

    var h = [];
    h.push('<div class="page-head"><h1 class="page-title">卡点库</h1>');
    h.push('<button class="btn btn-primary btn-sm" data-act="newcard">＋ 记卡点</button></div>');

    h.push('<div class="seg" id="libSeg">');
    h.push('<button class="seg-btn' + (this.state.tab === 'cards' ? ' on' : '') + '" data-tab="cards">卡点</button>');
    h.push('<button class="seg-btn' + (this.state.tab === 'passages' ? ' on' : '') + '" data-tab="passages">语篇</button>');
    h.push('</div>');

    if (this.state.tab === 'cards') {
      h.push('<div class="search-row">');
      h.push('<input class="input search-input" id="searchInput" placeholder="搜索卡点、讲解、来源…" value="' + Util.escapeAttr(this.state.q) + '" />');
      h.push('</div>');
      h.push('<div class="chip-row" id="filterRow"><button class="chip on" data-subj="all">全部</button>');
      CONFIG.SUBJECTS.forEach(function (s) {
        h.push('<button class="chip" data-subj="' + s.id + '" style="--c:' + s.color + '">' + s.name + '</button>');
      });
      h.push('</div>');
    } else {
      h.push('<div class="row-btns"><button class="btn btn-primary btn-sm" data-act="newpassage">＋ 新建语篇</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="newcard">＋ 记卡点</button></div>');
    }

    h.push('<div id="listArea" class="stack"></div>');
    root.innerHTML = h.join('');

    root.querySelectorAll('#libSeg .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { self.state.tab = b.getAttribute('data-tab'); self.render(root); });
    });
    root.querySelectorAll('#filterRow .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        root.querySelectorAll('#filterRow .chip').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        self.state.subject = b.getAttribute('data-subj');
        self.loadList(root);
      });
    });
    var si = root.querySelector('#searchInput');
    if (si) {
      si.addEventListener('input', Util.debounce(function () {
        self.state.q = si.value;
        self.loadList(root);
      }, 220));
    }
    root.addEventListener('click', function (e) {
      var node = e.target.closest('[data-act]');
      if (!node) return;
      var act = node.getAttribute('data-act');
      if (act === 'newcard') self.quickNew();
      else if (act === 'newpassage') self.newPassage(root);
    });

    this.loadList(root);
  },

  loadList: async function (root) {
    var self = this;
    var area = root.querySelector('#listArea');
    if (!area) return;
    if (this.state.tab === 'passages') {
      var ps = await Store.listPassages();
      if (!ps.length) { area.innerHTML = UI.empty('还没有语篇', '把课文或阅读材料粘进来，就能划选提问'); return; }
      area.innerHTML = ps.map(function (p) {
        return '<div class="passage-card" data-passage="' + p.id + '">' +
          '<div class="pc-top"><div class="pc-title">' + Util.esc(p.title) + '</div>' + UI.subjectTag(p.subject) + '</div>' +
          '<div class="pc-excerpt">' + Util.esc(String(p.content || '').slice(0, 90)) + '…</div>' +
          '<div class="pc-meta">' + (p.source ? Util.esc(p.source) + ' · ' : '') + p.content.length + ' 字</div></div>';
      }).join('');
      area.querySelectorAll('[data-passage]').forEach(function (node) {
        node.addEventListener('click', function () { self.openPassage(node.getAttribute('data-passage')); });
      });
      return;
    }

    var cards = await Store.listStuck({ q: this.state.q, subject: this.state.subject });
    if (!cards.length) {
      area.innerHTML = UI.empty(
        this.state.q || this.state.subject !== 'all' ? '没有匹配的卡点' : '卡点库还是空的',
        this.state.q || this.state.subject !== 'all' ? '换个关键词或筛选条件' : '去「拍照问」记第一条，30 秒就好');
      return;
    }
    area.innerHTML = cards.map(function (c) {
      var due = SRS.isDue(c);
      return '<div class="card-item" data-id="' + c.id + '">' +
        '<div class="ci-top">' + UI.subjectTag(c.subject) +
        '<span class="ci-topic">' + Util.esc(c.topic || '未分类') + '</span>' +
        '<span class="ci-due' + (due ? ' due' : '') + '">' + (due ? '待复习' : Util.relDate(c.srs && c.srs.due)) + '</span></div>' +
        '<div class="ci-q">' + Util.esc(c.question || '') + '</div>' +
        (c.context ? '<div class="ci-c">' + Util.esc(String(c.context).slice(0, 70)) + '</div>' : '') +
        '<div class="ci-bot">' + UI.masteryBar(cardMastery(c)) + '<span class="muted">' + (c.reviewCount || 0) + ' 次复习</span></div>' +
        '</div>';
    }).join('');
    area.querySelectorAll('[data-id]').forEach(function (node) {
      node.addEventListener('click', function () { self.openCard(node.getAttribute('data-id')); });
    });
  },

  quickNew: async function () {
    var topics = [];
    var cards = await Store.listStuck({});
    var set = {};
    cards.forEach(function (c) { if (c.topic) set[c.topic] = 1; });
    topics = Object.keys(set).sort();
    var res = await UI.formDialog({
      title: '记一个卡点',
      fields: [
        { key: 'subject', label: '学科', type: 'select', options: CONFIG.SUBJECTS.map(function (s) { return { value: s.id, label: s.name }; }) },
        { key: 'topic', label: '知识点', type: 'text', required: true, placeholder: '如：楞次定律 / 〜很简单 / 定积分', datalist: 'topicList2' },
        { key: 'question', label: '卡在哪', type: 'textarea', rows: 2, required: true, placeholder: '一句话说清你卡住的地方' },
        { key: 'context', label: '语境 / 题目片段', type: 'textarea', rows: 3, placeholder: '把这句原文或这一步算式粘过来' },
        { key: 'answer', label: '讲解 / 答案', type: 'textarea', rows: 3, placeholder: '查到的答案写这里；留空也行，之后可以补' },
        { key: 'source', label: '来源', type: 'text', placeholder: '如：2024全国甲卷·物理·第12题 / 日语第3课' }
      ],
      datalistId: 'topicList2',
      datalistHTML: topics.map(function (t) { return '<option value="' + Util.esc(t) + '">'; }).join(''),
      submitText: '存入卡点库'
    });
    if (!res) return;
    await Store.saveStuck(res);
    UI.toast('已存入，复习计划已排好', 'info');
    if (window.Views.library.state.tab === 'cards') this.loadList(document.getElementById('view'));
  },

  openCard: async function (id) {
    var self = this;
    var c = await Store.getStuck(id);
    if (!c) return;
    var reviews = (await DB.all('reviews')).filter(function (r) { return r.spId === id; })
      .sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    var img = c.imageId ? await Store.getImage(c.imageId) : null;

    var body = UI.el('div', 'detail');
    var h = [];
    h.push('<div class="detail-head">' + UI.subjectTag(c.subject) + '<span class="ci-topic">' + Util.esc(c.topic || '未分类') + '</span>' +
      '<span class="muted">下次复习 ' + Util.relDate(c.srs && c.srs.due) + '</span></div>');
    if (img) h.push('<img class="detail-img" src="' + img.dataUrl + '" alt="原题照片" />');
    h.push('<div class="detail-block"><div class="detail-label">卡在哪</div><div class="detail-text">' + Util.esc(c.question) + '</div></div>');
    if (c.context) h.push('<div class="detail-block"><div class="detail-label">语境 / 题目</div><div class="detail-text pre">' + Util.esc(c.context) + '</div></div>');
    h.push('<div class="detail-block"><div class="detail-label">讲解 / 答案</div><div class="detail-md" id="detailAnswer"></div></div>');
    if (c.source) h.push('<div class="detail-block"><div class="detail-label">来源</div><div class="detail-text">' + Util.esc(c.source) + '</div></div>');
    if (reviews.length) {
      h.push('<div class="detail-block"><div class="detail-label">复习记录（' + reviews.length + ' 次）</div><div class="hist">');
      reviews.slice(0, 6).forEach(function (r) {
        var g = SRS.GRADES.filter(function (x) { return x.q === r.quality; })[0];
        h.push('<div class="hist-item"><span>' + Util.fmtDate(r.at) + '</span><span class="hist-grade" style="color:' +
          (r.quality <= 1 ? '#A32D2D' : r.quality === 3 ? '#BA7517' : '#3B6D11') + '">' + (g ? g.label : r.quality) + '</span></div>');
      });
      h.push('</div></div>');
    }
    body.innerHTML = h.join('');

    var m = UI.modal({
      title: '卡点详情',
      wide: true,
      body: body,
      actions: [
        { label: '关闭', kind: 'btn-ghost' },
        { label: '针对这个出题', kind: 'btn-ghost', onClick: function () { self.genForCard(id); return true; } },
        { label: '编辑', kind: 'btn-ghost', onClick: function () { self.editCard(c); return true; } },
        { label: '立即复习', kind: 'btn-primary', onClick: function () { location.hash = '#/review?card=' + id; return true; } }
      ]
    });
    var ans = m.body.querySelector('#detailAnswer');
    if (ans) Util.renderInto(ans, c.answer || '_还没有讲解，点「拍照问」让模型补一条_');
  },

  editCard: async function (c) {
    var res = await UI.formDialog({
      title: '编辑卡点',
      values: {
        subject: c.subject, topic: c.topic, question: c.question,
        context: c.context, answer: c.answer, source: c.source
      },
      fields: [
        { key: 'subject', label: '学科', type: 'select', options: CONFIG.SUBJECTS.map(function (s) { return { value: s.id, label: s.name }; }) },
        { key: 'topic', label: '知识点', type: 'text', required: true },
        { key: 'question', label: '卡在哪', type: 'textarea', rows: 2, required: true },
        { key: 'context', label: '语境 / 题目片段', type: 'textarea', rows: 3 },
        { key: 'answer', label: '讲解 / 答案', type: 'textarea', rows: 4 },
        { key: 'source', label: '来源', type: 'text' }
      ],
      submitText: '保存'
    });
    if (!res) return;
    await Store.saveStuck(Object.assign({}, c, res));
    UI.toast('已保存', 'info');
    this.loadList(document.getElementById('view'));
  },

  genForCard: async function (id) {
    var l = UI.loading('正在针对这个卡点出题…');
    try {
      var res = await Store.generateForCard(id, 3);
      l.close();
      UI.toast('出了 ' + res.problems.length + ' 道题', 'info');
      location.hash = '#/practice';
    } catch (err) {
      l.close();
      UI.toast(err.message || '出题失败', 'error');
    }
  },

  newPassage: async function (root) {
    var res = await UI.formDialog({
      title: '新建语篇',
      fields: [
        { key: 'title', label: '标题', type: 'text', required: true, placeholder: '如：日语第3课 课文 / 2024甲卷阅读理解' },
        { key: 'subject', label: '学科', type: 'select', options: CONFIG.SUBJECTS.map(function (s) { return { value: s.id, label: s.name }; }) },
        { key: 'source', label: '来源', type: 'text' },
        { key: 'content', label: '正文', type: 'textarea', rows: 10, required: true }
      ],
      submitText: '创建'
    });
    if (!res) return;
    await Store.savePassage(res);
    UI.toast('语篇已创建', 'info');
    this.loadList(root);
  },

  openPassage: async function (id) {
    var self = this;
    var p = await Store.listPassages().then(function (all) {
      for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
      return null;
    });
    if (!p) return;
    var body = UI.el('div', 'passage-reader');
    body.innerHTML = '<div class="pr-head"><div class="pr-title">' + Util.esc(p.title) + '</div>' +
      '<div class="muted">' + (p.source ? Util.esc(p.source) + ' · ' : '') + '划选任意一句即可标记卡点</div></div>' +
      '<div class="pr-body" id="prBody">' + Util.esc(p.content).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</div>';

    var m = UI.modal({ title: p.title, wide: true, body: body, actions: [{ label: '关闭', kind: 'btn-ghost' }] });
    var prBody = m.body.querySelector('#prBody');
    Select.enable(prBody, function (sel, ctx) { self.markFromPassage(p, sel, ctx, m); }, '标记卡点');
  },

  markFromPassage: async function (p, sel, ctx, m) {
    var res = await UI.formDialog({
      title: '标记卡点',
      fields: [
        { key: 'topic', label: '知识点', type: 'text', required: true, placeholder: '如：被动形动态' },
        { key: 'question', label: '卡在哪', type: 'textarea', rows: 2, required: true },
        { key: 'answer', label: '讲解 / 答案', type: 'textarea', rows: 3 },
        { key: 'source', label: '来源', type: 'text' }
      ],
      values: { source: p.source || p.title || '' },
      submitText: '存入卡点库'
    });
    if (!res) return;
    await Store.saveStuck({
      subject: p.subject,
      topic: res.topic,
      question: res.question,
      context: sel,
      answer: res.answer,
      source: res.source,
      passageId: p.id,
      highlight: sel
    });
    UI.toast('已标记', 'info');
    if (m) m.close();
  }
};

function cardMastery(c) {
  var reps = c.reviewCount || 0;
  if (!reps) return 0.12;
  var q = (c.srs && c.srs.reps) || 0;
  return Math.min(0.98, 0.2 + q * 0.18 + ((c.srs && c.srs.ease) - 2.5) * 0.1);
}
