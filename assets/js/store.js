/* 业务层：卡点 / 语篇 / 图片 / 练习题 / 掌握度 / 队列 / 导入导出 */
var Store = (function () {

  var DEFAULT_SETTINGS = {
    id: 'app',
    ai: {
      baseUrl: '',
      apiKey: '',
      textModel: '',
      visionModel: '',
      presetId: '',
      temperature: 0.3,
      maxTokens: 2000,
      extraHeaders: {}
    },
    ocr: { engine: 'tesseract', langs: 'chi_sim+eng+jpn' },
    study: {
      dailyPracticeCount: 0,   // 0 = 只手动出题
      subject: 'math'          // 出题默认学科
    },
    lastPracticeDate: '',
    practiceCountToday: 0
  };

  function mergeDeep(base, over) {
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!over || typeof over !== 'object') return out;
    Object.keys(over).forEach(function (k) {
      var b = base ? base[k] : undefined;
      var o = over[k];
      if (b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object' && !Array.isArray(o)) {
        out[k] = mergeDeep(b, o);
      } else if (o !== undefined) {
        out[k] = o;
      }
    });
    return out;
  }

  /* ---------- 设置 ---------- */
  async function getSettings() {
    var s = await DB.getSettings();
    var merged = mergeDeep(DEFAULT_SETTINGS, s);
    AI.setCfg(merged.ai || {});
    return merged;
  }
  async function saveSettings(patch) {
    var cur = await getSettings();
    var next = mergeDeep(cur, patch || {});
    await DB.saveSettings(next);
    AI.setCfg(next.ai || {});
    return next;
  }

  /* ---------- 卡点 ---------- */
  async function listStuck(f) {
    f = f || {};
    var all = await DB.all('stuckPoints');
    var q = (f.q || '').trim().toLowerCase();
    var out = all.filter(function (c) {
      if (f.subject && f.subject !== 'all' && c.subject !== f.subject) return false;
      if (f.topic && c.topic !== f.topic) return false;
      if (f.status && c.status !== f.status) return false;
      if (q) {
        var hay = [c.question, c.answer, c.context, c.source, c.topic].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    out.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    return out;
  }

  async function getStuck(id) { return DB.get('stuckPoints', id); }

  async function saveStuck(data) {
    var c = Object.assign({}, data);
    if (!c.id) {
      c.id = uid();
      c.createdAt = nowISO();
      c.srs = SRS.newCard();
      c.status = 'active';
      c.reviewCount = 0;
    }
    if (!c.srs) c.srs = SRS.newCard();
    if (!c.topic) c.topic = '未分类';
    await DB.put('stuckPoints', c);
    return c;
  }

  async function deleteStuck(id) {
    var imgs = await DB.all('images');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].ownerId === id) await DB.del('images', imgs[i].id);
    }
    return DB.del('stuckPoints', id);
  }

  /* 记录一次复习并重排下次 */
  async function reviewStuck(id, quality) {
    var c = await getStuck(id);
    if (!c) throw new Error('卡点不存在');
    c.srs = SRS.schedule(c.srs || SRS.newCard(), quality);
    c.reviewCount = (c.reviewCount || 0) + 1;
    c.lastReview = todayStr();
    await DB.put('stuckPoints', c);
    await DB.put('reviews', {
      id: uid(),
      spId: id,
      subject: c.subject,
      topic: c.topic,
      quality: quality,
      at: nowISO(),
      intervalAfter: c.srs.interval
    });
    return c;
  }

  /* ---------- 语篇 ---------- */
  async function listPassages() {
    var all = await DB.all('passages');
    all.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    return all;
  }
  async function savePassage(p) {
    if (!p.id) { p.id = uid(); p.createdAt = nowISO(); }
    await DB.put('passages', p);
    return p;
  }
  async function deletePassage(id) { return DB.del('passages', id); }

  /* ---------- 图片 ---------- */
  async function saveImage(dataUrl, meta) {
    var rec = {
      id: uid(),
      dataUrl: dataUrl,
      bytes: meta && meta.bytes ? meta.bytes : Math.round((dataUrl || '').length * 0.75),
      width: meta ? meta.width : 0,
      height: meta ? meta.height : 0,
      ownerId: (meta && meta.ownerId) || '',
      kind: (meta && meta.kind) || 'photo',
      createdAt: nowISO()
    };
    await DB.put('images', rec);
    return rec;
  }
  async function getImage(id) { return DB.get('images', id); }
  async function listImages() { return DB.all('images'); }
  async function deleteImage(id) { return DB.del('images', id); }

  /* ---------- 练习题 ---------- */
  async function listProblems(filter) {
    filter = filter || {};
    var all = await DB.all('problems');
    var out = all.filter(function (p) {
      if (filter.subject && filter.subject !== 'all' && p.subject !== filter.subject) return false;
      if (filter.status && p.status !== filter.status) return false;
      return true;
    });
    out.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    return out;
  }
  async function saveProblem(p) { await DB.put('problems', p); return p; }

  function normAnswer(s) {
    return String(s == null ? '' : s)
      .trim().toLowerCase()
      .replace(/\$|\\mathrm\{|\}|\\left|\\right|\\text\{/g, '')
      .replace(/\s+/g, '')
      .replace(/[，。；：、,.;:'"“”‘’!?！？]/g, '')
      .replace(/[（]/g, '(').replace(/[）]/g, ')')
      .replace(/[−–—]/g, '-')
      .replace(/。/g, '');
  }

  function judge(problem, userAnswer) {
    if (problem.type === 'subjective') return null;   // 主观题需自评
    var ua = normAnswer(userAnswer);
    var expected = String(problem.answer || '').split('|').map(function (s) { return s.trim(); });
    if (!ua) return false;
    if (problem.type === 'choice') {
      return expected.some(function (e) { return normAnswer(e).toUpperCase() === ua.toUpperCase(); });
    }
    return expected.some(function (e) {
      var en = normAnswer(e);
      if (!en) return false;
      return en === ua || ua.indexOf(en) >= 0 || en.indexOf(ua) >= 0;
    });
  }

  async function answerProblem(id, userAnswer, selfGrade) {
    var p = await DB.get('problems', id);
    if (!p) throw new Error('题目不存在');
    p.userAnswer = userAnswer || '';
    if (p.type === 'subjective') {
      p.correct = selfGrade === true ? true : (selfGrade === false ? false : null);
      if (selfGrade === 'half') p.correct = null;
    } else {
      p.correct = judge(p, p.userAnswer);
    }
    p.status = 'done';
    p.doneAt = nowISO();
    await DB.put('problems', p);
    return p;
  }

  /* ---------- 掌握度 ---------- */
  async function buildMastery() {
    var res = await Promise.all([DB.all('stuckPoints'), DB.all('problems'), DB.all('reviews')]);
    var cards = res[0], problems = res[1], reviews = res[2];
    var map = {};
    function slot(subject, topic) {
      var k = MASTERY.key(subject, topic);
      if (!map[k]) {
        map[k] = {
          id: k, subject: subject || 'other', topic: topic || '未分类',
          m: 0, seen: 0, correct: 0, total: 0, cards: 0, updated: todayStr()
        };
      }
      return map[k];
    }
    cards.forEach(function (c) { var e = slot(c.subject, c.topic); e.cards++; });

    var latest = {};
    reviews.forEach(function (r) {
      if (!latest[r.spId] || (r.at || '') > (latest[r.spId].at || '')) latest[r.spId] = r;
    });
    Object.keys(latest).forEach(function (spId) {
      var c = null;
      for (var i = 0; i < cards.length; i++) if (cards[i].id === spId) { c = cards[i]; break; }
      if (!c) return;
      var e = slot(c.subject, c.topic);
      MASTERY.apply(e, MASTERY.scoreFromGrade(latest[spId].quality), 0.38, todayStr());
    });

    problems.forEach(function (p) {
      if (p.status !== 'done' || p.correct == null) return;
      var e = slot(p.subject, p.topic);
      e.total++;
      if (p.correct) e.correct++;
      var s = MASTERY.scoreFromCorrect(e.correct / e.total, e.total);
      e.m = Math.max(0, Math.min(1, e.m + 0.5 * (s - e.m)));
      e.seen++;
    });

    Object.keys(map).forEach(function (k) {
      var e = map[k];
      if (e.seen === 0) e.m = Math.min(e.m, 0.15);
      e.updated = todayStr();
    });
    var list = Object.keys(map).map(function (k) { return map[k]; });
    await DB.bulkPut('mastery', list);
    return list;
  }

  async function weakTopics(subject) {
    var list = await buildMastery();
    return MASTERY.weakFirst(list.filter(function (e) {
      return (!subject || subject === 'all' || e.subject === subject) && e.m < 0.85;
    }));
  }

  /* 针对薄弱点出题 */
  async function generateForWeak(subject, count) {
    var weak = await weakTopics(subject);
    if (!weak.length) {
      throw new Error('还没有足够的卡点数据。先去「拍照问」记几条卡点，系统才知道该给你练什么。');
    }
    var target = weak[0];
    var cards = await DB.all('stuckPoints');
    var ctx = cards.filter(function (c) {
      return c.subject === target.subject && c.topic === target.topic;
    }).slice(0, 5).map(function (c) {
      return '- 卡点：' + c.question + '\n  我当时卡在：' + (c.context || '').slice(0, 80) +
        '\n  讲解要点：' + String(c.answer || '').slice(0, 120);
    }).join('\n');
    var problems = await AI.generatePractice(target.subject, target.topic, ctx, count || 3);
    problems.forEach(function (p) {
      p.id = uid();
      p.status = 'pending';
      p.createdAt = nowISO();
    });
    await DB.bulkPut('problems', problems);
    var s = await getSettings();
    if (s.lastPracticeDate !== todayStr()) {
      s.lastPracticeDate = todayStr();
      s.practiceCountToday = 0;
    }
    s.practiceCountToday = (s.practiceCountToday || 0) + problems.length;
    await DB.saveSettings(s);
    return { target: target, problems: problems };
  }

  /* 针对单个卡点出题（最精准的"就练我不会的那个点"） */
  async function generateForCard(cardId, count) {
    var c = await getStuck(cardId);
    if (!c) throw new Error('卡点不存在');
    var ctx = '- 具体卡点：' + c.question + '\n  原文语境：' + String(c.context || '').slice(0, 200) +
      '\n  已掌握的讲解要点：' + String(c.answer || '').slice(0, 200);
    var problems = await AI.generatePractice(c.subject, c.topic || '未分类', ctx, count || 2);
    problems.forEach(function (p) {
      p.id = uid();
      p.status = 'pending';
      p.createdAt = nowISO();
      p.fromCardId = c.id;
    });
    await DB.bulkPut('problems', problems);
    return { target: { subject: c.subject, topic: c.topic }, problems: problems };
  }

  /* 针对任意知识点出题（卡点库里有该知识点的卡点时带入上下文） */
  async function generateForTopic(subject, topic, count) {
    var cards = await DB.all('stuckPoints');
    var ctx = cards.filter(function (c) {
      return c.subject === subject && c.topic === topic;
    }).slice(0, 5).map(function (c) {
      return '- 卡点：' + c.question + '\n  我当时卡在：' + (c.context || '').slice(0, 80) +
        '\n  讲解要点：' + String(c.answer || '').slice(0, 120);
    }).join('\n');
    var problems = await AI.generatePractice(subject, topic || '未分类', ctx, count || 3);
    problems.forEach(function (p) {
      p.id = uid();
      p.status = 'pending';
      p.createdAt = nowISO();
    });
    await DB.bulkPut('problems', problems);
    return { target: { subject: subject, topic: topic }, problems: problems };
  }

  /* ---------- 今日队列 ---------- */
  async function todayQueue() {
    var cards = await DB.all('stuckPoints');
    var due = SRS.dueCards(cards);
    var problems = await listProblems({ status: 'pending' });
    return {
      dueCards: due,
      pendingProblems: problems,
      total: due.length + problems.length
    };
  }

  async function stats() {
    var cards = await DB.all('stuckPoints');
    var problems = await DB.all('problems');
    var reviews = await DB.all('reviews');
    var mastery = await buildMastery();
    var bySubject = {};
    cards.forEach(function (c) { bySubject[c.subject] = (bySubject[c.subject] || 0) + 1; });
    var doneProblems = problems.filter(function (p) { return p.status === 'done'; });
    var right = doneProblems.filter(function (p) { return p.correct === true; }).length;
    var weak = MASTERY.weakFirst(mastery).slice(0, 5);
    /* 连续学习天数 */
    var days = {};
    reviews.forEach(function (r) { days[String(r.at).slice(0, 10)] = 1; });
    problems.forEach(function (p) { if (p.doneAt) days[String(p.doneAt).slice(0, 10)] = 1; });
    var streak = 0, cur = todayStr();
    for (var i = 0; i < 400; i++) {
      if (days[cur]) { streak++; cur = addDays(cur, -1); }
      else break;
    }
    return {
      cards: cards.length,
      problems: problems.length,
      problemsDone: doneProblems.length,
      problemsRight: right,
      accuracy: doneProblems.length ? Math.round(right / doneProblems.length * 100) : 0,
      bySubject: bySubject,
      mastery: mastery,
      weak: weak,
      streak: streak,
      reviewCount: reviews.length
    };
  }

  /* ---------- 导入导出 ---------- */
  async function exportAll() {
    var data = { version: 1, exportedAt: nowISO(), stores: {} };
    for (var i = 0; i < DB.STORES.length; i++) {
      data.stores[DB.STORES[i]] = await DB.all(DB.STORES[i]);
    }
    return data;
  }

  async function importAll(data, mode) {
    if (!data || !data.stores) throw new Error('备份文件格式不对');
    for (var i = 0; i < DB.STORES.length; i++) {
      var name = DB.STORES[i];
      var list = data.stores[name];
      if (!Array.isArray(list)) continue;
      /* 合并导入不动本机设置（API Key 等），避免被备份覆盖或产生重复配置 */
      if (mode !== 'replace' && name === 'settings') continue;
      if (mode === 'replace') await DB.clear(name);
      var arr = mode === 'replace' ? list : list.map(function (o) {
        var c = Object.assign({}, o);
        c.id = uid();
        return c;
      });
      await DB.bulkPut(name, arr);
    }
    return true;
  }

  return {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    getSettings: getSettings,
    saveSettings: saveSettings,
    listStuck: listStuck,
    getStuck: getStuck,
    saveStuck: saveStuck,
    deleteStuck: deleteStuck,
    reviewStuck: reviewStuck,
    listPassages: listPassages,
    savePassage: savePassage,
    deletePassage: deletePassage,
    saveImage: saveImage,
    getImage: getImage,
    listImages: listImages,
    deleteImage: deleteImage,
    listProblems: listProblems,
    saveProblem: saveProblem,
    answerProblem: answerProblem,
    judge: judge,
    buildMastery: buildMastery,
    weakTopics: weakTopics,
    generateForWeak: generateForWeak,
    generateForCard: generateForCard,
    generateForTopic: generateForTopic,
    todayQueue: todayQueue,
    stats: stats,
    exportAll: exportAll,
    importAll: importAll
  };
})();
