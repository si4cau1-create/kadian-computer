/* SM-2 间隔重复调度（Anki 同款算法）+ 复习队列 */
var SRS = (function () {
  var GRADES = [
    { key: 'forgot', label: '忘了', q: 1, hint: '明天再来' },
    { key: 'hard', label: '有点难', q: 3, hint: '缩短间隔' },
    { key: 'good', label: '记得', q: 4, hint: '正常推进' },
    { key: 'easy', label: '太简单', q: 5, hint: '拉长间隔' }
  ];

  function today() { return todayStr(); }

  function newCard() {
    return { ease: 2.5, interval: 0, reps: 0, due: today(), lastReview: '' };
  }

  /* quality: 1 忘了 / 3 有点难 / 4 记得 / 5 太简单 */
  function schedule(card, quality) {
    card = card || {};
    var ease = card.ease || 2.5;
    var interval = card.interval || 0;
    var reps = card.reps || 0;
    var d;

    if (quality < 3) {
      reps = 0;
      interval = 1;
    } else {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 3;
      else interval = Math.round(interval * ease);
      reps++;
    }
    d = 5 - quality;
    ease = ease + (0.1 - d * (0.08 + d * 0.02));
    ease = Math.max(1.3, Math.min(2.8, ease));

    card.ease = Math.round(ease * 1000) / 1000;
    card.interval = interval;
    card.reps = reps;
    card.due = addDays(today(), interval);
    card.lastReview = today();
    return card;
  }

  function isDue(card) {
    return !card.due || card.due <= today();
  }

  /* 预估下次复习日期（用于卡片展示） */
  function preview(card) {
    var d = card || newCard();
    if (!d.reps) return '今天';
    if (d.reps === 1) return '1 天后';
    if (d.reps === 2) return '3 天后';
    return Math.round(d.interval * d.ease) + ' 天后';
  }

  function dueCards(cards) {
    return (cards || []).filter(function (c) {
      return c.status !== 'archived' && isDue(c);
    });
  }

  function bySubject(cards, subject) {
    return (cards || []).filter(function (c) { return c.subject === subject; });
  }

  return {
    GRADES: GRADES,
    newCard: newCard,
    schedule: schedule,
    isDue: isDue,
    preview: preview,
    dueCards: dueCards,
    bySubject: bySubject
  };
})();
