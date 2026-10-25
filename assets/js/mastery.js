/* 知识点掌握度模型
   掌握度 m ∈ [0,1]，越低越薄弱，被优先出题、优先推送。
   信号源：
   - 卡点存在      → 初始视为薄弱
   - 复习自评      → 主更新源（自评 忘了/难/记得/简单）
   - AI 练习正确率 → 权威更新源（做出来才算真会）
   - 时间衰减      → 长期不练缓慢回落，防止"学会了"的错觉 */
var MASTERY = (function () {
  var ALPHA = 0.38;
  var DECAY_PER_DAY = 0.97;
  var GRADE_SCORE = { 1: 0.15, 3: 0.5, 4: 0.8, 5: 1.0 };

  function key(subject, topic) {
    return (subject || 'other') + '::' + (topic || '未分类');
  }

  function blank(subject, topic) {
    return {
      id: key(subject, topic),
      subject: subject || 'other',
      topic: topic || '未分类',
      m: 0,          // 掌握度
      seen: 0,       // 被评测次数
      correct: 0,    // 练习正确数
      total: 0,      // 练习总题数
      cards: 0,      // 关联卡点数
      updated: ''
    };
  }

  function blankFor(subject, topic) { return blank(subject, topic); }

  function ensure(list, subject, topic) {
    var k = key(subject, topic);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === k) return list[i];
    }
    var e = blank(subject, topic);
    list.push(e);
    return e;
  }

  function apply(entry, score, weight, at) {
    at = at || todayStr();
    if (entry.seen === 0) entry.m = 0.15;   // 新知识点默认很薄弱
    var alpha = weight || ALPHA;
    entry.m = entry.m + alpha * (score - entry.m);
    entry.m = Math.max(0, Math.min(1, entry.m));
    entry.seen++;
    entry.updated = at;
    return entry;
  }

  function decay(entry, at) {
    at = at || todayStr();
    if (!entry.updated) { entry.updated = at; return entry; }
    var days = daysBetween(entry.updated, at);
    if (days > 0) {
      entry.m = entry.m * Math.pow(DECAY_PER_DAY, days);
      entry.updated = at;
    }
    return entry;
  }

  function scoreFromGrade(q) {
    return GRADE_SCORE[q] != null ? GRADE_SCORE[q] : 0.5;
  }

  /* 少量题目时向 0.5 收缩，避免一道题定生死 */
  function scoreFromCorrect(ratio, total) {
    var conf = total >= 3 ? 1 : total / 3;
    return 0.5 + (ratio - 0.5) * conf;
  }

  function weakFirst(list) {
    return (list || []).slice().sort(function (a, b) {
      if (a.m !== b.m) return a.m - b.m;
      return (b.cards || 0) - (a.cards || 0);
    });
  }

  function level(m) {
    if (m < 0.25) return { label: '陌生', color: '#A32D2D' };
    if (m < 0.5) return { label: '模糊', color: '#BA7517' };
    if (m < 0.75) return { label: '基本会', color: '#185FA5' };
    return { label: '熟练', color: '#3B6D11' };
  }

  return {
    key: key,
    blank: blankFor,
    ensure: ensure,
    apply: apply,
    decay: decay,
    scoreFromGrade: scoreFromGrade,
    scoreFromCorrect: scoreFromCorrect,
    weakFirst: weakFirst,
    level: level
  };
})();
