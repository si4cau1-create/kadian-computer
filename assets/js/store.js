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
    study: {
      dailyPracticeCount: 0,   // 0 = 只手动出题
      subject: 'japanese',     // 做题默认学科（日语 / 英语为主）
      quizCount: 3             // 每次出题数量
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

  /* ---------- 题库语篇（passages） ---------- */
  async function listPassages(filter) {
    filter = filter || {};
    var all = await DB.all('passages');
    var out = all.filter(function (p) {
      if (filter.subject && filter.subject !== 'all' && p.subject !== filter.subject) return false;
      return true;
    });
    out.sort(function (a, b) {
      return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
    });
    return out;
  }
  async function getPassage(id) { return DB.get('passages', id); }
  async function savePassage(p) {
    var rec = Object.assign({}, p);
    if (!rec.id) { rec.id = uid(); rec.createdAt = nowISO(); }
    rec.updatedAt = nowISO();
    rec.subject = rec.subject || 'japanese';
    rec.title = rec.title || '未命名语篇';
    rec.source = rec.source || '';
    /* text 可带 |{|…|}| 标记；同时存纯文本与即点区域清单 */
    rec.text = String(rec.text || '');
    rec.format = rec.format === 'md' ? 'md' : 'text';   /* text=逐字原文 / md=Markdown 渲染 */
    rec.plain = Marks.strip(rec.text);
    rec.marks = Marks.list(rec.text);
    rec.markCount = rec.marks.length;
    await DB.put('passages', rec);
    return rec;
  }
  /* 识别知识点后回写标记文本 */
  async function updatePassageMarks(id, markedText) {
    var rec = await getPassage(id);
    if (!rec) throw new Error('语篇不存在');
    rec.text = String(markedText || rec.text);
    return await savePassage(rec);
  }
  async function deletePassage(id) { return DB.del('passages', id); }

  /* ---------- 精讲结果缓存：同一「学科 + 片段(+问题)」只问一次 API ---------- */
  function explainKey(subject, sel, question) {
    var k = (subject || 'other') + '::' + String(sel || '').trim();
    if (question) k += '::q:' + String(question).trim();
    return k;
  }
  async function getCachedExplain(subject, sel, question) {
    var rec = await DB.get('explains', explainKey(subject, sel, question));
    return rec && rec.exp ? rec.exp : null;
  }
  async function saveCachedExplain(subject, sel, exp, question) {
    if (!exp) return null;
    var rec = {
      id: explainKey(subject, sel, question),
      subject: subject || 'other',
      sel: String(sel || ''),
      question: String(question || ''),
      exp: exp,
      createdAt: nowISO()
    };
    await DB.put('explains', rec);
    return rec;
  }

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
      /* kind:'plain' 排除做题会话产生的题目（它们自带语篇，只在做题流里出现） */
      if (filter.kind === 'plain' && p.kind === 'quiz') return false;
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
      /* 界面回传的可能是完整选项文本（"A. 回顾、回首"），也可能是选项键（"A"）——两种都要能判 */
      var m = String(userAnswer).trim().match(/^[（(]?([A-Za-z])[)）.．、]?\s/);
      var uaKey = m ? m[1].toUpperCase() : ua.toUpperCase();
      return expected.some(function (e) {
        var en = normAnswer(e).toUpperCase();
        return en === uaKey || en === ua.toUpperCase();
      });
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

  /* ---------- 做题（2.0 核心）：API 出题 + 语篇触点精讲 + 一键入库 ---------- */

  /* 生成一组做题（语篇 + 题目），题目存入 problems（kind: 'quiz'） */
  async function generateQuiz(subject, count) {
    count = count || 3;
    var quiz = await AI.generateQuiz(subject, count);
    if (!quiz.questions.length) throw new Error('模型没有生成题目');
    var problems = quiz.questions.map(function (q) {
      return {
        id: uid(),
        kind: 'quiz',
        type: q.type,
        stem: String(q.stem || ''),
        options: Array.isArray(q.options) ? q.options.map(String) : [],
        answer: q.answer != null ? String(q.answer) : '',
        explanation: String(q.explanation || ''),
        point: String(q.point || ''),
        passage: quiz.passage || '',
        passageZh: quiz.passageZh || '',
        source: quiz.source || '',
        subject: subject,
        topic: String(q.point || '未分类'),
        status: 'pending',
        userAnswer: '',
        correct: null,
        createdAt: nowISO(),
        doneAt: ''
      };
    });
    await DB.bulkPut('problems', problems);
    return {
      passage: quiz.passage || '',
      passageZh: quiz.passageZh || '',
      source: quiz.source || '',
      problems: problems
    };
  }

  /* 基于题库里的一段语篇出题（不另造语篇） */
  async function generateQuizFromPassage(subject, passage, count) {
    count = count || 3;
    var plain = Marks.strip(String(passage || ''));
    if (!plain) throw new Error('语篇是空的');
    var quiz = await AI.generateQuizFromPassage(subject, plain, count);
    if (!quiz.questions.length) throw new Error('模型没有基于这段语篇出题');
    var problems = quiz.questions.map(function (q) {
      return {
        id: uid(),
        kind: 'quiz',
        type: q.type,
        stem: String(q.stem || ''),
        options: Array.isArray(q.options) ? q.options.map(String) : [],
        answer: q.answer != null ? String(q.answer) : '',
        explanation: String(q.explanation || ''),
        point: String(q.point || ''),
        passage: plain,
        passageZh: '',
        source: '题库语篇',
        subject: subject,
        topic: String(q.point || '未分类'),
        status: 'pending',
        userAnswer: '',
        correct: null,
        createdAt: nowISO(),
        doneAt: ''
      };
    });
    await DB.bulkPut('problems', problems);
    return { passage: plain, passageZh: '', source: '题库语篇', problems: problems };
  }

  /* API 一键识别知识点：返回带 |{|…|}| 标记的语篇 *//* 「学会了」一键入库：触点精讲结果 → 卡点（零填表， topic 由精讲结果带出） */
  async function savePointAsCard(subject, exp, sel, passage, source) {
    exp = exp || {};
    var answer = '**' + (exp.point || sel || '') + '**\n\n' +
      (exp.meaning ? exp.meaning + '\n\n' : '') +
      (exp.examples && exp.examples.length
        ? exp.examples.map(function (e) {
          return '- ' + e.src + (e.zh ? '　' + e.zh : '');
        }).join('\n') + '\n\n'
        : '') +
      (exp.usage ? '**用法**：' + exp.usage + '\n\n' : '') +
      (exp.mistake ? '**常见误用**：' + exp.mistake : '');
    var card = {
      subject: subject,
      topic: exp.topic || '未分类',
      question: exp.point || String(sel || '').slice(0, 60),
      context: String(passage || '').slice(0, 500),
      answer: answer,
      source: source || '做题 · 即时精讲'
    };
    return await saveStuck(card);
  }

  /* ---------- 单词（背诵板块） ---------- */

  /* 解析粘贴的词表：纯文本每行一个词，或 markdown 列表（- / * / 1. / 标题） */
  function parseWordList(text) {
    var out = [], seen = {};
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (line) {
      var s = String(line).trim();
      if (!s) return;
      s = s.replace(/^#{1,6}\s*/, '');          /* markdown 标题 */
      s = s.replace(/^[-*+]\s+/, '');            /* 无序列表 */
      s = s.replace(/^\d+[.)]\s+/, '');          /* 有序列表 */
      s = s.replace(/^[>*_]+\s*/, '');           /* 引用 */
      s = s.replace(/[*_`]/g, '').trim();
      if (!s) return;
      /* 「单词(假名)」形式直接拆出读音 */
      var m = s.match(/^([^\s(（,，、]+)\s*[（(]\s*([^)）]*)\s*[)）]/);
      var word = m ? m[1] : s.split(/[\s,，、;；]+/)[0];
      var reading = m ? m[2] : '';
      if (!word || seen[word]) return;
      seen[word] = 1;
      out.push({ word: word, reading: reading });
    });
    return out;
  }

  /* 导入词表 */
  async function importWordList(subject, name, text) {
    var items = parseWordList(text);
    if (!items.length) throw new Error('没解析出任何单词（每行一个词，或用 - 列表）');
    var rec = {
      id: uid(),
      subject: subject || 'japanese',
      name: name || ('词表 ' + todayStr()),
      items: items,
      count: items.length,
      createdAt: nowISO()
    };
    await DB.put('wordlists', rec);
    return rec;
  }
  async function listWordLists(filter) {
    filter = filter || {};
    var all = await DB.all('wordlists');
    var out = all.filter(function (l) {
      if (filter.subject && filter.subject !== 'all' && l.subject !== filter.subject) return false;
      return true;
    });
    out.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    return out;
  }
  async function getWordList(id) { return DB.get('wordlists', id); }

  /* 词汇量调查：判定词表里每个词是否已掌握，结果记在词表上 */
  async function checkVocabulary(subject, listId) {
    var list = await getWordList(listId);
    if (!list) throw new Error('词表不存在');
    var results = await AI.checkVocabulary(subject, list.items);
    list.results = results;
    list.knownCount = results.filter(function (r) { return r.known; }).length;
    list.unknownCount = results.length - list.knownCount;
    list.checkedAt = nowISO();
    await DB.put('wordlists', list);
    return list;
  }

  /* 把未掌握的词在语篇里补标成即点区域（保留用户已有的标记） */
  async function markUnknownWords(passageId, listId) {
    var p = await getPassage(passageId);
    var list = await getWordList(listId);
    if (!p) throw new Error('语篇不存在');
    if (!list) throw new Error('词表不存在');
    var unknown = (list.results || []).filter(function (r) { return !r.known; })
      .map(function (r) { return r.word; });
    if (!unknown.length) throw new Error('这个词表还没做词汇量调查，或没有未掌握的词');
    var marked = Marks.markIn(p.text, unknown);
    return await savePassage({
      id: p.id, createdAt: p.createdAt, subject: p.subject,
      title: p.title, source: p.source, format: p.format, text: marked
    });
  }
  async function deleteWordList(id) {
    var ws = await DB.all('words');
    for (var i = 0; i < ws.length; i++) if (ws[i].listId === id) await DB.del('words', ws[i].id);
    return DB.del('wordlists', id);
  }

  /* 生成词条并入库 */
  async function generateWordEntries(subject, listId) {
    var list = await getWordList(listId);
    if (!list) throw new Error('词表不存在');
    var entries = await AI.generateWordEntries(subject, list.items);
    if (!entries.length) throw new Error('模型没有返回词条');
    var words = entries.map(function (e) {
      return {
        id: uid(),
        word: e.word, reading: e.reading, pos: e.pos, transitivity: e.transitivity,
        meaning: e.meaning, example: e.example, exampleZh: e.exampleZh,
        subject: subject || list.subject,
        listId: listId,
        status: 'new',
        srs: SRS.newCard(),
        reviewCount: 0,
        createdAt: nowISO()
      };
    });
    await DB.bulkPut('words', words);
    return words;
  }

  async function listWords(filter) {
    filter = filter || {};
    var all = await DB.all('words');
    var out = all.filter(function (w) {
      if (filter.subject && filter.subject !== 'all' && w.subject !== filter.subject) return false;
      if (filter.listId && w.listId !== filter.listId) return false;
      if (filter.status && w.status !== filter.status) return false;
      return true;
    });
    out.sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); });
    return out;
  }
  async function deleteWord(id) { return DB.del('words', id); }

  /* 背一个词：复用 SM-2 排期 */
  async function reviewWord(id, quality) {
    var w = await DB.get('words', id);
    if (!w) throw new Error('词条不存在');
    w.srs = SRS.schedule(w.srs || SRS.newCard(), quality);
    w.reviewCount = (w.reviewCount || 0) + 1;
    w.status = (w.srs.reps >= 2 && quality >= 4) ? 'known' : 'learning';
    w.lastReview = todayStr();
    await DB.put('words', w);
    return w;
  }

  /* 待背队列：从没背过的 + 到期的 */
  async function dueWords(subject) {
    var all = await DB.all('words');
    var out = all.filter(function (w) {
      if (subject && subject !== 'all' && w.subject !== subject) return false;
      if (!w.srs || !w.srs.reps) return true;      /* 新词 */
      return SRS.isDue(w.srs);
    });
    /* 新词优先，其次按到期时间 */
    out.sort(function (a, b) {
      var na = a.srs && a.srs.reps ? 1 : 0, nb = b.srs && b.srs.reps ? 1 : 0;
      if (na !== nb) return na - nb;
      return String((a.srs && a.srs.due) || '').localeCompare(String((b.srs && b.srs.due) || ''));
    });
    return out;
  }

  async function wordStats(subject) {
    var all = await DB.all('words');
    var list = all.filter(function (w) {
      return !subject || subject === 'all' || w.subject === subject;
    });
    return {
      total: list.length,
      known: list.filter(function (w) { return w.status === 'known'; }).length,
      learning: list.filter(function (w) { return w.status === 'learning'; }).length,
      fresh: list.filter(function (w) { return !w.status || w.status === 'new'; }).length,
      due: (await dueWords(subject)).length
    };
  }

  /* ---------- 今日队列 ---------- */
  async function todayQueue() {
    var cards = await DB.all('stuckPoints');
    var due = SRS.dueCards(cards);
    var problems = await listProblems({ status: 'pending', kind: 'plain' });
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
    getPassage: getPassage,
    savePassage: savePassage,
    updatePassageMarks: updatePassageMarks,
    deletePassage: deletePassage,
    getCachedExplain: getCachedExplain,
    saveCachedExplain: saveCachedExplain,
    parseWordList: parseWordList,
    importWordList: importWordList,
    listWordLists: listWordLists,
    getWordList: getWordList,
    checkVocabulary: checkVocabulary,
    markUnknownWords: markUnknownWords,
    deleteWordList: deleteWordList,
    generateWordEntries: generateWordEntries,
    listWords: listWords,
    deleteWord: deleteWord,
    reviewWord: reviewWord,
    dueWords: dueWords,
    wordStats: wordStats,
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
    generateQuiz: generateQuiz,
    generateQuizFromPassage: generateQuizFromPassage,
    savePointAsCard: savePointAsCard,
    todayQueue: todayQueue,
    stats: stats,
    exportAll: exportAll,
    importAll: importAll
  };
})();
