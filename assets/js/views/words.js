/* 单词背诵：导入词表 → 生成词条（词性/及物性/释义/例句）→ 卡片背诵 → SM-2 排期复习 */
window.Views = window.Views || {};

window.Views.words = {
  state: {
    subject: 'japanese',
    mode: 'manage',       /* manage 管理词表 / recite 背诵 */
    queue: [],            /* 本次待背词条 */
    idx: 0,
    flipped: false,
    session: { done: 0, known: 0, forgot: 0 }
  },

  render: async function (root, params) {
    var self = this;
    var st = await Store.getSettings();
    this.state.subject = st.study.subject || 'japanese';
    if (params && params.mode === 'recite') this.state.mode = 'recite';
    else if (params && params.mode === 'manage') { this.state.mode = 'manage'; this.state.queue = []; }
    if (this.state.mode === 'recite' && !this.state.queue.length) this.state.mode = 'manage';

    if (this.state.mode === 'recite') await this.renderRecite(root);
    else await this.renderManage(root);
  },

  /* ---------- 管理页：词表 + 统计 ---------- */
  renderManage: async function (root) {
    var self = this;
    var stats = await Store.wordStats(this.state.subject);
    var lists = await Store.listWordLists({ subject: this.state.subject });
    var words = await Store.listWords({ subject: this.state.subject });
    var byList = {};
    words.forEach(function (w) { byList[w.listId] = (byList[w.listId] || 0) + 1; });

    var h = [];
    h.push('<div class="page-head"><div><h1 class="page-title">单词</h1>' +
      '<p class="page-sub">共 ' + stats.total + ' 词 · 已掌握 ' + stats.known + ' · 待背 ' + stats.due + '</p></div>' +
      '<div class="row-btns-inline"><button class="btn btn-ghost btn-sm" data-act="backlib">← 卡点库</button>' +
      '<button class="btn btn-primary btn-sm" data-act="import">导入词表</button></div></div>');

    h.push('<div class="stat-row">');
    h.push('<div class="stat-card stat-accent"><div class="stat-label">总词数</div><div class="stat-value">' + stats.total + '</div><div class="stat-sub">来自 ' + lists.length + ' 个词表</div></div>');
    h.push('<div class="stat-card stat-good"><div class="stat-label">已掌握</div><div class="stat-value">' + stats.known + '</div><div class="stat-sub">连续答对 2 次以上</div></div>');
    h.push('<div class="stat-card stat-warn"><div class="stat-label">待背</div><div class="stat-value">' + stats.due + '</div><div class="stat-sub">新词 + 到期复习</div></div>');
    h.push('</div>');

    h.push('<div class="section"><div class="section-head"><h2>词表</h2>' +
      '<span class="muted">' + lists.length + ' 个</span></div>');
    if (!lists.length) {
      h.push(UI.empty('还没有词表', '把单词表粘进来（每行一个词，或 Markdown 列表），生成词条后就能背'));
    } else {
      h.push('<div class="stack">');
      lists.forEach(function (l) {
        var n = byList[l.id] || 0;
        var unknown = (l.results || []).filter(function (r) { return !r.known; });
        h.push('<div class="wl-item">');
        h.push('<div class="wl-top"><b>' + Util.esc(l.name) + '</b>' +
          '<span class="pz-meta">' + l.count + ' 词' + (n ? ' · 已生成 ' + n + ' 条词条' : ' · 未生成词条') + '</span></div>');
        if (l.checkedAt) {
          h.push('<div class="wl-survey">词汇量调查：已掌握 ' + l.knownCount + ' · 未掌握 ' + l.unknownCount + '</div>');
          if (unknown.length) {
            h.push('<div class="wl-unknown">' + unknown.map(function (r) {
              return '<span class="wl-uw">' + Util.esc(r.word) + '</span>';
            }).join('') + '</div>');
          }
        }
        h.push('<div class="row-btns">');
        h.push(n ? '' : '<button class="btn btn-primary btn-xs" data-act="gen" data-lid="' + l.id + '">生成词条</button>');
        h.push(n ? '<button class="btn btn-primary btn-xs" data-act="recite" data-lid="' + l.id + '">开始背诵</button>' : '');
        h.push('<button class="btn btn-ghost btn-xs" data-act="survey" data-lid="' + l.id + '">调查词汇量</button>');
        if (unknown.length) h.push('<button class="btn btn-ghost btn-xs" data-act="markwords" data-lid="' + l.id + '">标记到语篇</button>');
        h.push('<button class="btn btn-ghost btn-xs" data-act="dellist" data-lid="' + l.id + '">删除</button>');
        h.push('</div></div>');
      });
      h.push('</div>');
    }
    h.push('</div>');

    if (words.length) {
      h.push('<div class="section"><div class="section-head"><h2>词条</h2><span class="muted">' + words.length + ' 条</span></div>');
      h.push('<div class="stack">');
      words.slice(0, 200).forEach(function (w) {
        h.push('<div class="word-row' + (w.status === 'known' ? ' known' : '') + '">' +
          '<div class="wr-main"><span class="wr-word">' + Util.esc(w.word) + '</span>' +
          (w.reading ? '<span class="wr-reading">' + Util.esc(w.reading) + '</span>' : '') +
          '<span class="wr-pos">' + Util.esc(w.pos || '') + (w.transitivity ? ' ' + Util.esc(w.transitivity) : '') + '</span></div>' +
          '<div class="wr-meaning">' + Util.esc(w.meaning || '') + '</div></div>');
      });
      h.push('</div></div>');
    }

    root.innerHTML = h.join('');
    root.addEventListener('click', function (e) {
      var node = e.target.closest('[data-act]');
      if (!node) return;
      var act = node.getAttribute('data-act');
      var lid = node.getAttribute('data-lid') || '';
      if (act === 'import') self.importList(root);
      else if (act === 'gen') self.genEntries(root, lid);
      else if (act === 'recite') self.startRecite(root, lid);
      else if (act === 'dellist') self.delList(root, lid);
      else if (act === 'survey') self.survey(root, lid);
      else if (act === 'markwords') self.markWords(root, lid);
      else if (act === 'backlib') {
        if (window.Views.library) window.Views.library.state.tab = 'cards';
        location.hash = '#/library';
      }
    });
  },

  importList: async function (root) {
    var res = await UI.formDialog({
      title: '导入词表',
      fields: [
        { key: 'name', label: '词表名称', type: 'text', required: true, placeholder: '如：新标日 第 3 课' },
        {
          key: 'subject', label: '学科', type: 'select',
          options: CONFIG.SUBJECTS.filter(function (s) { return s.beta !== false; })
            .map(function (s) { return { value: s.id, label: s.name }; })
        },
        {
          key: 'text', label: '单词表', type: 'textarea', rows: 10, required: true,
          placeholder: '每行一个词；也支持 Markdown 列表：\n- 売り上げる\n- 顧みる\n- 手続き',
          hint: '支持「单词(假名)」写法，会自动拆出读音；导入后点「生成词条」由 AI 补齐词性、及物性、释义与例句'
        }
      ],
      values: { subject: this.state.subject },
      submitText: '导入'
    });
    if (!res) return;
    try {
      var rec = await Store.importWordList(res.subject, res.name, res.text);
      UI.toast('已导入 ' + rec.count + ' 个词', 'info');
      this.state.subject = res.subject || this.state.subject;
      this.renderManage(root);
    } catch (err) {
      UI.toast(err.message || '导入失败', 'error');
    }
  },

  genEntries: async function (root, listId) {
    var l = UI.loading('AI 正在生成词条（词性/及物性/释义/例句）…');
    try {
      var words = await Store.generateWordEntries(this.state.subject, listId);
      l.close();
      UI.toast('生成 ' + words.length + ' 条词条', 'info');
      this.renderManage(root);
    } catch (err) {
      l.close();
      UI.toast(err.message || '生成失败', 'error');
    }
  },

  delList: async function (root, listId) {
    var ok = await UI.confirmDialog('删除这个词表及其全部词条？', '删除', true);
    if (!ok) return;
    await Store.deleteWordList(listId);
    UI.toast('已删除', 'info');
    this.renderManage(root);
  },

  /* 词汇量调查：判定哪些词已掌握、哪些没掌握 */
  survey: async function (root, listId) {
    var l = UI.loading('正在调查词汇量…');
    try {
      var rec = await Store.checkVocabulary(this.state.subject, listId);
      l.close();
      UI.toast('已掌握 ' + rec.knownCount + ' · 未掌握 ' + rec.unknownCount, 'info');
      this.renderManage(root);
    } catch (err) {
      l.close();
      UI.toast(err.message || '调查失败', 'error');
    }
  },

  /* 把未掌握的词在选中的语篇里标成即点区域 */
  markWords: async function (root, listId) {
    var list = await Store.getWordList(listId);
    var passages = await Store.listPassages({ subject: this.state.subject });
    if (!passages.length) { UI.toast('题库里还没有语篇，先导入一篇', 'error'); return; }
    var res = await UI.formDialog({
      title: '标记到哪篇语篇',
      fields: [{
        key: 'pid', label: '语篇', type: 'select',
        options: passages.map(function (p) { return { value: p.id, label: p.title }; })
      }],
      submitText: '标记'
    });
    if (!res) return;
    var l2 = UI.loading('正在标记…');
    try {
      var rec = await Store.markUnknownWords(res.pid, listId);
      l2.close();
      UI.toast('已标记 ' + rec.markCount + ' 个即点区域（未掌握的词）', 'info');
      this.renderManage(root);
    } catch (err) {
      l2.close();
      UI.toast(err.message || '标记失败', 'error');
    }
  },

  /* ---------- 背诵页：卡片流 ---------- */
  startRecite: async function (root, listId) {
    var self = this;
    var queue = await Store.dueWords(listId ? null : this.state.subject);
    if (listId) {
      var ws = await Store.listWords({ listId: listId });
      var dueIds = queue.map(function (w) { return w.id; });
      queue = ws.filter(function (w) { return dueIds.indexOf(w.id) >= 0; });
    }
    if (!queue.length) { UI.toast('没有待背的词', 'info'); return; }
    this.state.queue = queue;
    this.state.idx = 0;
    this.state.flipped = false;
    this.state.session = { done: 0, known: 0, forgot: 0 };
    this.state.mode = 'recite';
    await this.renderRecite(root);
  },

  renderRecite: async function (root) {
    var self = this;
    var q = this.state.queue;
    var total = q.length;
    var i = this.state.idx;
    var done = this.state.session.done;

    var h = [];
    h.push('<div class="page-head"><div><h1 class="page-title">背诵</h1>' +
      '<p class="page-sub">' + Math.min(i + 1, total) + ' / ' + total + ' · 本次已背 ' + done + ' 个</p></div>' +
      '<button class="btn btn-ghost btn-sm" data-act="exit">结束</button></div>');
    h.push('<div class="recite-bar"><div class="recite-fill" style="width:' + Math.round(done / total * 100) + '%"></div></div>');

    if (i >= total) {
      h.push('<div class="qz-card recite-card">');
      h.push('<div class="qz-sum-title">本次背完了</div>');
      h.push('<div class="qz-sum-sub">背了 ' + done + ' 个 · 记住 ' + this.state.session.known + ' 个 · 还需加强 ' + this.state.session.forgot + ' 个</div>');
      h.push('<div class="row-btns"><button class="btn btn-primary btn-sm" data-act="again">再来一组</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="exit">回到词表</button></div>');
      h.push('</div>');
      root.innerHTML = h.join('');
      this.bindRecite(root);
      return;
    }

    var w = q[i];
    h.push('<div class="qz-card recite-card' + (this.state.flipped ? ' flipped' : '') + '" id="reciteCard">');
    h.push('<div class="recite-word">' + Util.esc(w.word) + '</div>');
    if (w.reading) h.push('<div class="recite-reading">' + Util.esc(w.reading) + '</div>');
    if (!this.state.flipped) {
      h.push('<div class="recite-hint">先回想一下，再翻面</div>');
      h.push('<div class="row-btns"><button class="btn btn-primary btn-sm" data-act="flip">看释义</button></div>');
    } else {
      h.push('<div class="recite-meta">' +
        (w.pos ? '<span class="wr-pos">' + Util.esc(w.pos) + '</span>' : '') +
        (w.transitivity ? '<span class="wr-pos">' + Util.esc(w.transitivity) + '</span>' : '') + '</div>');
      h.push('<div class="recite-meaning">' + Util.esc(w.meaning || '') + '</div>');
      if (w.example) {
        h.push('<div class="recite-example"><div class="recite-ex-src">' + Util.esc(w.example) + '</div>' +
          (w.exampleZh ? '<div class="recite-ex-zh">' + Util.esc(w.exampleZh) + '</div>' : '') + '</div>');
      }
      h.push('<div class="recite-grades">' +
        '<button class="btn btn-ghost btn-sm" data-act="grade" data-g="1">不认识</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="grade" data-g="3">模糊</button>' +
        '<button class="btn btn-primary btn-sm" data-act="grade" data-g="4">认识</button></div>');
    }
    h.push('</div>');

    root.innerHTML = h.join('');
    this.bindRecite(root);
  },

  bindRecite: function (root) {
    var self = this;
    root.addEventListener('click', async function (e) {
      var node = e.target.closest('[data-act]');
      if (!node) return;
      var act = node.getAttribute('data-act');
      if (act === 'flip') {
        self.state.flipped = true;
        await self.renderRecite(root);
      } else if (act === 'grade') {
        var q = self.state.queue[self.state.idx];
        if (!q) return;
        var g = Number(node.getAttribute('data-g')) || 3;
        await Store.reviewWord(q.id, g);
        self.state.session.done++;
        if (g >= 4) self.state.session.known++; else self.state.session.forgot++;
        self.state.idx++;
        self.state.flipped = false;
        await self.renderRecite(root);
      } else if (act === 'exit') {
        self.state.mode = 'manage';
        self.state.queue = [];
        await self.renderManage(root);
      } else if (act === 'again') {
        self.state.idx = 0;
        self.state.flipped = false;
        self.state.session = { done: 0, known: 0, forgot: 0 };
        await self.renderRecite(root);
      }
    });
  }
};
