/* 复习模式：先回忆，再翻讲解，四档自评驱动遗忘曲线 */
window.Views = window.Views || {};

window.Views.review = {
  state: { queue: [], idx: 0, revealed: false, only: null, done: {} },

  render: async function (root, params) {
    var self = this;
    if (params && params.card) {
      var c = await Store.getStuck(params.card);
      this.state.queue = c ? [c] : [];
      this.state.done = {};
    } else if (!this.state.queue.length) {
      var cards = await DB.all('stuckPoints');
      this.state.queue = SRS.dueCards(cards);
      this.state.done = {};
    }
    /* 会话内已复习过的卡片不再出现 */
    this.state.queue = this.state.queue.filter(function (c) { return !self.state.done[c.id]; });
    this.state.idx = 0;
    this.state.revealed = false;
    if (!this.state.queue.length) {
      root.innerHTML = '<div class="page-head"><h1 class="page-title">复习</h1></div>' +
        UI.empty('今天没有到期的卡点', '明天再来，或者去「拍照问」记一条新的');
      return;
    }
    this.draw(root);
  },

  draw: function (root) {
    var self = this;
    var q = this.state.queue;
    var c = q[this.state.idx];
    if (!c) { this.finish(root); return; }

    var h = [];
    h.push('<div class="page-head"><h1 class="page-title">复习</h1><span class="muted">' + (this.state.idx + 1) + ' / ' + q.length + '</span></div>');
    h.push('<div class="progress"><div class="progress-fill" style="width:' + Math.round(this.state.idx / q.length * 100) + '%"></div></div>');

    h.push('<div class="review-card">');
    h.push('<div class="rc-top">' + UI.subjectTag(c.subject) + '<span class="ci-topic">' + Util.esc(c.topic || '未分类') + '</span></div>');
    if (c.context) h.push('<div class="rc-context pre">' + Util.esc(c.context) + '</div>');
    h.push('<div class="rc-question">卡在哪：' + Util.esc(c.question || '') + '</div>');
    if (c.source) h.push('<div class="rc-source">来源：' + Util.esc(c.source) + '</div>');

    if (!this.state.revealed) {
      h.push('<div class="rc-hidden"><p>先在心里把答案说出来，或者写在旁边纸上</p>');
      h.push('<button class="btn btn-primary" data-act="reveal">看讲解</button></div>');
    } else {
      h.push('<div class="rc-answer" id="rcAnswer"></div>');
      h.push('<div class="grade-row">');
      SRS.GRADES.forEach(function (g) {
        h.push('<button class="grade-btn grade-' + g.key + '" data-grade="' + g.q + '">' +
          '<span class="grade-label">' + g.label + '</span><span class="grade-hint">' + g.hint + '</span></button>');
      });
      h.push('</div>');
    }
    h.push('</div>');

    h.push('<div class="row-btns"><button class="btn btn-ghost btn-sm" data-act="exit">结束复习</button></div>');
    root.innerHTML = h.join('');

    if (this.state.revealed) {
      var ans = root.querySelector('#rcAnswer');
      if (ans) Util.renderInto(ans, c.answer || '_这条卡点还没有讲解，点「卡点库」补一条，或在「拍照问」里让模型讲一次_');
    }

    root.querySelectorAll('[data-grade]').forEach(function (b) {
      b.addEventListener('click', async function () {
        await Store.reviewStuck(c.id, Number(b.getAttribute('data-grade')));
        self.state.done[c.id] = 1;
        self.state.idx++;
        self.state.revealed = false;
        self.draw(root);
      });
    });
    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        if (act === 'reveal') { self.state.revealed = true; self.draw(root); }
        else if (act === 'exit') { self.state.queue = []; location.hash = '#/home'; }
      });
    });
  },

  finish: function (root) {
    var self = this;
    root.innerHTML = '<div class="page-head"><h1 class="page-title">复习完成</h1></div>' +
      '<div class="empty"><div class="done-badge"></div><p class="empty-text">这批卡点都过了一遍</p>' +
      '<p class="empty-sub">下次复习时间已按你的自评重新排好</p></div>' +
      '<div class="row-btns"><button class="btn btn-primary" data-act="home">回到今日</button>' +
      '<button class="btn btn-ghost" data-act="again">再来一批</button></div>';
    root.querySelector('[data-act="home"]').addEventListener('click', function () { location.hash = '#/home'; });
    root.querySelector('[data-act="again"]').addEventListener('click', function () {
      self.state.queue = [];
      self.state.done = {};
      self.render(root);
    });
  }
};
