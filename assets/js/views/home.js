/* 今日：待复习队列、待做新题、薄弱点、统计 */
window.Views = window.Views || {};

window.Views.home = {
  render: async function (root) {
    var q = await Store.todayQueue();
    var stats = await Store.stats();

    var h = [];
    h.push('<div class="page-head">');
    h.push('<div><h1 class="page-title">今日</h1><p class="page-sub">' +
      new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) +
      ' · 连续 ' + stats.streak + ' 天</p></div>');
    h.push('<button class="btn btn-primary btn-sm" id="btnAskNow">拍照问</button>');
    h.push('</div>');

    /* 统计卡 */
    h.push('<div class="stat-row">');
    h.push(statCard('待复习', q.dueCards.length, '点开即可复习', 'accent'));
    h.push(statCard('待做新题', q.pendingProblems.length, 'AI 按薄弱点出的题', 'blue'));
    h.push(statCard('卡点总数', stats.cards, '累计 ' + stats.reviewCount + ' 次复习', 'plain'));
    h.push(statCard('练习正确率', stats.accuracy + '%', stats.problemsDone + ' 题已作答', stats.accuracy >= 70 ? 'good' : 'warn'));
    h.push('</div>');

    /* 今日队列 */
    h.push('<div class="section">');
    h.push('<div class="section-head"><h2>今日队列</h2><span class="muted">' + q.total + ' 项</span></div>');
    if (!q.total) {
      h.push(UI.empty('今天没有待办', '去「拍照问」记一条卡点，或点下面出几道题'));
    } else {
      h.push('<div class="stack">');
      if (q.dueCards.length) {
        h.push('<button class="qcard qcard-review" data-act="review">');
        h.push('<div class="qcard-icon"></div><div class="qcard-main"><div class="qcard-title">复习 ' + q.dueCards.length + ' 个卡点</div>' +
          '<div class="qcard-sub">先看语境与提问，回忆后再翻讲解</div></div><div class="qcard-go">›</div></button>');
      }
      if (q.pendingProblems.length) {
        h.push('<button class="qcard qcard-problem" data-act="practice">');
        h.push('<div class="qcard-icon"></div><div class="qcard-main"><div class="qcard-title">做 ' + q.pendingProblems.length + ' 道新题</div>' +
          '<div class="qcard-sub">针对你的薄弱点现编的题</div></div><div class="qcard-go">›</div></button>');
      }
      h.push('</div>');
    }
    h.push('</div>');

    /* 薄弱点 */
    h.push('<div class="section">');
    h.push('<div class="section-head"><h2>薄弱知识点</h2><span class="muted">按掌握度排序</span></div>');
    if (!stats.weak.length) {
      h.push(UI.empty('还没有掌握度数据', '记录卡点并复习一次后，这里会显示你的薄弱点'));
    } else {
      h.push('<div class="stack">');
      stats.weak.forEach(function (m) {
        var lv = MASTERY.level(m.m);
        h.push('<div class="mastery-card" data-topic="' + Util.esc(m.topic) + '" data-subject="' + Util.esc(m.subject) + '">');
        h.push('<div class="mc-top"><div class="mc-name">' + UI.subjectTag(m.subject) + '<span class="mc-topic">' + Util.esc(m.topic) + '</span></div>' +
          '<div class="mc-level" style="color:' + lv.color + '">' + lv.label + '</div></div>');
        h.push(UI.masteryBar(m.m));
        h.push('<div class="mc-bottom"><span class="muted">' + m.cards + ' 个卡点 · ' + m.total + ' 道练习</span>' +
          '<button class="btn btn-ghost btn-xs" data-act="gen" data-topic="' + Util.esc(m.topic) + '" data-subject="' + Util.esc(m.subject) + '">针对这个出题</button></div>');
        h.push('</div>');
      });
      h.push('</div>');
    }
    h.push('</div>');

    /* 快捷入口 */
    h.push('<div class="section">');
    h.push('<div class="section-head"><h2>快捷入口</h2></div>');
    h.push('<div class="quick-grid">');
    h.push('<button class="quick" data-act="photo"><span class="quick-t">拍照问</span><span class="quick-s">拍下纸质题，直接要讲解</span></button>');
    h.push('<button class="quick" data-act="text"><span class="quick-t">文本精讲</span><span class="quick-s">划选一句话，逐句问</span></button>');
    h.push('<button class="quick" data-act="note"><span class="quick-t">记卡点</span><span class="quick-s">手动录入一个卡住的点</span></button>');
    h.push('<button class="quick" data-act="genweak"><span class="quick-t">出 3 道题</span><span class="quick-s">按最薄弱的点出题</span></button>');
    h.push('</div></div>');

    root.innerHTML = h.join('');

    /* 事件 */
    var photoBtn = root.querySelector('#btnAskNow');
    if (photoBtn) photoBtn.addEventListener('click', function () { location.hash = '#/ask?mode=photo'; });

    root.querySelectorAll('[data-act]').forEach(function (node) {
      var act = node.getAttribute('data-act');
      node.addEventListener('click', async function (e) {
        if (act === 'gen') e.stopPropagation();
        if (act === 'photo') { location.hash = '#/ask?mode=photo'; }
        else if (act === 'text') { location.hash = '#/ask?mode=text'; }
        else if (act === 'note') { location.hash = '#/library?new=1'; }
        else if (act === 'review') { location.hash = '#/review'; }
        else if (act === 'practice') { location.hash = '#/practice'; }
        else if (act === 'genweak' || act === 'gen') {
          /* genweak 不带 data-subject → 全局最薄弱；gen 指定了学科+知识点 */
          var subject = node.getAttribute('data-subject') || null;
          var topic = node.getAttribute('data-topic') || '';
          var l = UI.loading('AI 正在按你的薄弱点出题…');
          try {
            var res = topic
              ? await Store.generateForCard(await firstCardIdOf(subject, topic), 3)
              : await Store.generateForWeak(subject, 3);
            l.close();
            UI.toast('出了 ' + res.problems.length + ' 道题：' + res.target.topic, 'info');
            location.hash = '#/practice';
          } catch (err) {
            l.close();
            UI.toast(err.message || '出题失败', 'error');
          }
        }
      });
    });
  }
};

function statCard(label, value, sub, kind) {
  return '<div class="stat-card stat-' + (kind || 'plain') + '"><div class="stat-label">' + Util.esc(label) +
    '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + Util.esc(sub) + '</div></div>';
}

async function firstCardIdOf(subject, topic) {
  var cards = await Store.listStuck({ subject: subject });
  for (var i = 0; i < cards.length; i++) {
    if (cards[i].topic === topic) return cards[i].id;
  }
  throw new Error('该知识点下没有卡点');
}
