/* 练习：AI 按薄弱点现编的题；作答 → 判分 → 解析 → 反哺掌握度 */
window.Views = window.Views || {};

window.Views.practice = {
  state: { list: [], idx: 0, mode: 'pending', answer: '', revealed: false, active: false },

  render: async function (root) {
    var self = this;
    this.state.active = false;
    this.state.answer = '';
    this.state.revealed = false;

    var st = await Store.getSettings();
    var mastery = await Store.buildMastery();
    var weak = MASTERY.weakFirst(mastery.filter(function (m) { return m.m < 0.85; }));

    var h = [];
    h.push('<div class="page-head"><h1 class="page-title">练习</h1>');
    h.push('<div class="row-btns-inline">');
    h.push('<button class="btn btn-primary btn-sm" data-act="genweak">出 3 道题</button>');
    h.push('<button class="btn btn-ghost btn-sm" data-act="genpick">指定知识点出题</button>');
    h.push('</div></div>');

    if (weak.length) {
      h.push('<div class="weak-strip">');
      h.push('<div class="ws-title">最薄弱：' + Util.esc(weak[0].topic) + '（掌握度 ' + Math.round(weak[0].m * 100) + '%）</div>');
      h.push('<div class="ws-bar">' + UI.masteryBar(weak[0].m) + '</div>');
      h.push('</div>');
    }

    h.push('<div class="seg" id="pSeg">');
    h.push('<button class="seg-btn' + (this.state.mode === 'pending' ? ' on' : '') + '" data-mode="pending">待做</button>');
    h.push('<button class="seg-btn' + (this.state.mode === 'done' ? ' on' : '') + '" data-mode="done">已做</button>');
    h.push('<button class="seg-btn' + (this.state.mode === 'mastery' ? ' on' : '') + '" data-mode="mastery">掌握度</button>');
    h.push('</div>');

    h.push('<div id="pArea" class="stack"></div>');
    root.innerHTML = h.join('');

    root.querySelectorAll('#pSeg .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { self.state.mode = b.getAttribute('data-mode'); self.render(root); });
    });
    root.addEventListener('click', function (e) {
      var node = e.target.closest('[data-act]');
      if (!node) return;
      var act = node.getAttribute('data-act');
      if (act === 'genweak') self.generate(null, root);
      else if (act === 'genpick') self.pickTopic(root);
      else if (act === 'do') self.openProblem(node.getAttribute('data-id'), root);
    });

    this.loadList(root);
  },

  loadList: async function (root) {
    var self = this;
    var area = root.querySelector('#pArea');
    if (!area) return;

    if (this.state.mode === 'mastery') {
      var ms = await Store.buildMastery();
      if (!ms.length) { area.innerHTML = UI.empty('还没有掌握度数据'); return; }
      area.innerHTML = MASTERY.weakFirst(ms).map(function (m) {
        var lv = MASTERY.level(m.m);
        return '<div class="mrow"><div class="mr-top"><span>' + UI.subjectTag(m.subject) + ' ' + Util.esc(m.topic) +
          '</span><span style="color:' + lv.color + '">' + Math.round(m.m * 100) + '% · ' + lv.label + '</span></div>' +
          UI.masteryBar(m.m) +
          '<div class="muted small">' + m.cards + ' 卡点 · ' + m.correct + '/' + m.total + ' 练习正确</div></div>';
      }).join('');
      return;
    }

    var list = await Store.listProblems({ status: this.state.mode === 'done' ? 'done' : 'pending' });
    if (!list.length) {
      area.innerHTML = this.state.mode === 'done'
        ? UI.empty('还没有做完的题')
        : UI.empty('没有待做的题', '点「出 3 道题」，AI 会照着你的薄弱点现编');
      return;
    }
    area.innerHTML = list.map(function (p) {
      var badge = p.status === 'done'
        ? '<span class="badge ' + (p.correct === true ? 'ok' : p.correct === false ? 'bad' : 'half') + '">' +
        (p.correct === true ? '答对' : p.correct === false ? '答错' : '已作答') + '</span>'
        : '<span class="badge">待做</span>';
      return '<div class="prob-item" data-id="' + p.id + '" data-act="do">' +
        '<div class="pi-top">' + UI.subjectTag(p.subject) + '<span class="ci-topic">' + Util.esc(p.topic || '') + '</span>' + badge + '</div>' +
        '<div class="pi-stem">' + Util.esc(String(p.stem).slice(0, 100)) + (String(p.stem).length > 100 ? '…' : '') + '</div></div>';
    }).join('');
  },

  openProblem: async function (id, root) {
    var self = this;
    var p = null;
    var list = await Store.listProblems({});
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { p = list[i]; break; }
    if (!p) return;

    var body = UI.el('div', 'prob');
    var h = [];
    h.push('<div class="pi-top">' + UI.subjectTag(p.subject) + '<span class="ci-topic">' + Util.esc(p.topic || '') + '</span></div>');
    h.push('<div class="prob-stem" id="probStem"></div>');
    if (p.type === 'choice') {
      h.push('<div class="opt-list" id="optList">');
      p.options.forEach(function (o, idx) {
        h.push('<button class="opt" data-opt="' + Util.escapeAttr(o) + '"><span class="opt-key">' + Util.esc(String.fromCharCode(65 + idx)) + '</span><span class="opt-text">' + Util.esc(o.replace(/^[A-D][.．、]\s*/, '')) + '</span></button>');
      });
      h.push('</div>');
    } else if (p.type === 'fill') {
      h.push('<input class="input" id="fillInput" placeholder="输入答案" />');
    } else {
      h.push('<textarea class="input" id="subjInput" rows="5" placeholder="写下你的思路或答案要点"></textarea>');
      h.push('<div class="muted small">主观题提交后由你自评</div>');
    }
    h.push('<div class="row-btns"><button class="btn btn-primary" data-act="submit">提交作答</button></div>');
    h.push('<div id="probResult"></div>');
    body.innerHTML = h.join('');

    var chosen = '';
    var m = UI.modal({ title: '做题', wide: true, body: body, actions: [{ label: '关闭', kind: 'btn-ghost' }] });
    Util.renderInto(m.body.querySelector('#probStem'), p.stem);

    m.body.querySelectorAll('[data-opt]').forEach(function (b) {
      b.addEventListener('click', function () {
        m.body.querySelectorAll('.opt').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        chosen = b.getAttribute('data-opt');
      });
    });

    m.body.querySelector('[data-act="submit"]').addEventListener('click', async function () {
      var ua = '';
      if (p.type === 'choice') ua = chosen;
      else if (p.type === 'fill') ua = m.body.querySelector('#fillInput').value;
      else ua = m.body.querySelector('#subjInput').value;
      if (!String(ua).trim()) { UI.toast('先写点答案', 'error'); return; }
      var updated;
      if (p.type === 'subjective') {
        var g = await UI.formDialog({
          title: '自评',
          fields: [{ key: 'g', label: '这道题你做对了吗？', type: 'select', options: [{ value: 'true', label: '做对了' }, { value: 'half', label: '半对' }, { value: 'false', label: '做错了' }] }],
          submitText: '记录'
        });
        if (!g) return;
        updated = await Store.answerProblem(p.id, ua, g.g === 'true' ? true : g.g === 'false' ? false : 'half');
      } else {
        updated = await Store.answerProblem(p.id, ua);
      }
      var res = m.body.querySelector('#probResult');
      res.innerHTML = '<div class="result-block" id="resultBlock"></div>';
      var res2 = m.body.querySelector('#resultBlock');
      var verdict = updated.correct === true ? '答对了' : (updated.correct === false ? '答错了' : '已记录');
      res2.innerHTML = '<div class="verdict ' + (p.correct === true ? 'ok' : p.correct === false ? 'bad' : 'half') + '">' + verdict + '</div>' +
        '<div class="detail-block"><div class="detail-label">标准答案</div><div class="detail-md" id="ansMd"></div></div>' +
        '<div class="detail-block"><div class="detail-label">解析</div><div class="detail-md" id="expMd"></div></div>';
      Util.renderInto(res2.querySelector('#ansMd'), p.answer || '_（无）_');
      Util.renderInto(res2.querySelector('#expMd'), p.explanation || '_（无）_');
      m.body.querySelector('[data-act="submit"]').style.display = 'none';
      self.loadList(root);
    });
  },

  generate: async function (subject, root) {
    var l = UI.loading('AI 正在按你的薄弱点出题…');
    try {
      var res = await Store.generateForWeak(subject, 3);
      l.close();
      UI.toast('出了 ' + res.problems.length + ' 道题：' + res.target.topic, 'info');
      this.state.mode = 'pending';
      this.render(root);
    } catch (err) {
      l.close();
      UI.toast(err.message || '出题失败', 'error');
    }
  },

  pickTopic: async function () {
    var ms = await Store.buildMastery();
    if (!ms.length) { UI.toast('还没有卡点数据，先记几条', 'error'); return; }
    var weak = MASTERY.weakFirst(ms);
    var res = await UI.formDialog({
      title: '针对哪个知识点出题',
      fields: [{
        key: 'topic', label: '知识点', type: 'select',
        options: weak.map(function (m) {
          return { value: m.id, label: CONFIG.subjectName(m.subject) + ' · ' + m.topic + '（掌握度 ' + Math.round(m.m * 100) + '%）' };
        })
      }],
      submitText: '出 3 道题'
    });
    if (!res) return;
    var parts = String(res.topic).split('::');
    var l = UI.loading('正在出题…');
    try {
      var out = await Store.generateForTopic(parts[0], parts[1] || '未分类', 3);
      l.close();
      UI.toast('已生成 ' + out.problems.length + ' 道题', 'info');
      self.state.mode = 'pending';
      self.render(root);
    } catch (err) {
      l.close();
      UI.toast(err.message || '出题失败', 'error');
    }
  }
};
