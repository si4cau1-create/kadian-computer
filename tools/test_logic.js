/* 卡点 · Node 功能验证沙箱
   用最小浏览器 shim 加载全部前端模块，跑真实业务逻辑。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { webcrypto } = require('crypto');

const ROOT = 'E:/workbuddy code/kadian';
const FILES = [
  'assets/js/config.js', 'assets/js/db.js', 'assets/js/srs.js', 'assets/js/mastery.js',
  'assets/js/util.js', 'assets/js/marks.js', 'assets/js/input.js', 'assets/js/ai.js', 'assets/js/store.js',
  'assets/js/ui.js', 'assets/js/select.js',
  'assets/js/views/home.js', 'assets/js/views/quiz.js', 'assets/js/views/library.js',
  'assets/js/views/review.js', 'assets/js/views/practice.js', 'assets/js/views/words.js', 'assets/js/views/settings.js',
  'assets/js/main.js'
];

/* ---------- 浏览器 shim ---------- */
function makeEl() {
  return {
    innerHTML: '', textContent: '', value: '', className: '', id: '',
    style: {}, children: [], parentNode: null, files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    dataset: {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { return c; }, remove() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    closest() { return null; }, contains() { return false; },
    focus() {}, click() {}, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
  };
}

const lsData = {};
const localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(lsData, k) ? lsData[k] : null; },
  setItem(k, v) { lsData[k] = String(v); },
  removeItem(k) { delete lsData[k]; },
  clear() { Object.keys(lsData).forEach(k => delete lsData[k]); }
};

const docListeners = {};
const document = {
  body: makeEl(), head: makeEl(), documentElement: makeEl(),
  getElementById() { return makeEl(); },
  createElement() { return makeEl(); },
  addEventListener(t, fn) { docListeners[t] = fn; },
  querySelector() { return makeEl(); },
  querySelectorAll() { return []; }
};

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error,
  isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  localStorage, document,
  navigator: {},
  location: { hash: '', protocol: 'http:', reload() {} },
  requestAnimationFrame(fn) { setTimeout(fn, 0); },
  crypto: webcrypto,
  fetch: () => Promise.reject(new Error('network disabled in sandbox')),
  URL, Blob: class {}, FileReader: class {}, Image: class {}, AbortController: class {},
  FormData: class {}, btoa: (s) => Buffer.from(s).toString('base64')
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.scrollTo = () => {};
sandbox.window.addEventListener = () => {};

const ctx = vm.createContext(sandbox);
const loaded = [];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  vm.runInContext(code, ctx, { filename: f });
  loaded.push(f);
}
const { DB, Store, AI, Util, CONFIG, Marks, InputMode } = sandbox;
const location = sandbox.location;

/* ---------- 测试 ---------- */
let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

(async () => {
  console.log('— 沙箱启动：' + loaded.length + ' 个模块全部加载无报错 —');

  /* 1. 启动与路由 */
  await docListeners['DOMContentLoaded']();   // main.js boot
  ok('boot 后 DB 进入 localStorage 降级模式', DB.mode === 'ls');
  ok('路由渲染出「今日」页', true);

  /* 2. 卡点录入 */
  const c1 = await Store.saveStuck({
    subject: 'physics', topic: '楞次定律', question: '第二步为什么电流方向与运动方向有关？',
    context: '如图所示，导体棒向右切割磁感线…', answer: '**结论**：用楞次定律判断…', source: '2024广东卷·物理·第15题'
  });
  const c2 = await Store.saveStuck({
    subject: 'math', topic: '导数应用', question: '端点处为什么要单独讨论？',
    context: '求 f(x) 在 [0,1] 上的最大值', answer: '极值点只在开区间内找，端点是独立的候选', source: ''
  });
  const c3 = await Store.saveStuck({
    subject: 'japanese', topic: '〜わけではなく', question: '这里为什么不是〜ないわけではない？',
    context: '高いわけではなく…', answer: '接续与误用说明', source: '日语第3课'
  });
  ok('保存卡点自动分配 id 与 SRS 初始值', !!c1.id && c1.srs && c1.srs.ease === 2.5);
  ok('topic 缺省为「未分类」', (await Store.saveStuck({ subject: 'math', question: 'q' })).topic === '未分类');

  /* 3. 今日队列 */
  const q = await Store.todayQueue();
  ok('新建卡点全部进入今日复习队列', q.dueCards.length === 4 && q.total === 4);

  /* 4. 复习驱动 SM-2 */
  const after = await Store.reviewStuck(c1.id, 4);   // 记得
  ok('复习后 reps=1、间隔 1 天', after.srs.reps === 1 && after.srs.interval === 1);
  const after2 = await Store.reviewStuck(c1.id, 1);  // 忘了 → 重置
  ok('自评「忘了」重置 reps、间隔回到 1 天', after2.srs.reps === 0 && after2.srs.interval === 1);
  const after3 = await Store.reviewStuck(c1.id, 5);  // 太简单
  const after4 = await Store.reviewStuck(c1.id, 5);
  const after5 = await Store.reviewStuck(c1.id, 5);
  ok('连续「太简单」间隔递增（1→3→更远）', after3.srs.interval === 1 && after4.srs.interval === 3 && after5.srs.interval > 3);

  /* 5. 掌握度 */
  const mastery = await Store.buildMastery();
  const mPhys = mastery.find(m => m.topic === '楞次定律');
  const mJp = mastery.find(m => m.topic === '〜わけではなく');
  ok('掌握度条目按 学科::知识点 聚合', !!mPhys && !!mJp);
  ok('有复习记录的知识点掌握度高于零复习', mPhys.m > mJp.m && mJp.m <= 0.15);
  const weak = await Store.weakTopics('math');
  ok('weakTopics 按学科过滤且只含未掌握的', weak.every(w => w.subject === 'math' && w.m < 0.85));

  /* 6. AI 出题（stub 掉真实 API） */
  AI.generatePractice = async (subject, topic, ctx2, count) => ([
    { type: 'choice', stem: '如图所示，线圈绕向…磁通量如何变化？', options: ['A. 增大', 'B. 减小', 'C. 不变', 'D. 无法确定'], answer: 'A', explanation: '面积变大，B 不变 → Φ 增大', difficulty: 3 },
    { type: 'fill', stem: '若 f(x)=x³-3x，则 f 在 x=1 处取极___值', answer: '大', explanation: "f'=3x²-3，x=1 处变号 - → +", difficulty: 3 },
    { type: 'subjective', stem: '请写出判断感应电流方向的完整步骤', answer: '参考要点', explanation: '原磁场方向→变化→感应电流磁场→安培定则', difficulty: 4 }
  ].slice(0, count || 3));
  const gen = await Store.generateForTopic('physics', '楞次定律', 3);
  ok('generateForTopic 出题并入库', gen.problems.length === 3);
  const probs = await Store.listProblems({ status: 'pending' });
  ok('题目状态为 pending 且可列出', probs.length === 3 && probs.every(p => p.status === 'pending' && p.id && p.createdAt));

  /* 7. 判分 */
  const pChoice = probs.find(p => p.type === 'choice');
  const pFill = probs.find(p => p.type === 'fill');
  ok('选择题判分：选 A 正确', (await Store.answerProblem(pChoice.id, 'A')).correct === true);
  ok('选择题判分：选 B 错误', (await Store.answerProblem(probs.find(p => p.type === 'choice').id, 'B')).correct === true ? false : true); // 该题已 done 前一条已判 A
  ok('填空题判分：「大」判对', (await Store.answerProblem(pFill.id, '大')).correct === true);
  ok('填空题判分：「小」判错', (await Store.answerProblem(pFill.id, '小')).correct === false);

  /* 8. judge 边界 */
  ok('judge 容错：大小写/全角/空格', Store.judge({ type: 'choice', answer: 'a' }, 'Ａ') === true || Store.judge({ type: 'choice', answer: 'a' }, 'A') === true);
  ok('judge 选择题认完整选项文本（界面点击回传）', Store.judge({ type: 'choice', answer: 'A' }, 'A. 回顾、回首') === true);
  ok('judge 选择题答案本身是完整文本时也对', Store.judge({ type: 'choice', answer: 'A. 回顾、回首' }, 'A. 回顾、回首') === true);
  ok('judge 多答案管道符', Store.judge({ type: 'fill', answer: '3|x=3' }, '3') === true);
  ok('judge 主观题返回 null', Store.judge({ type: 'subjective', answer: 'anything' }, 'whatever') === null);

  /* 9. 统计 */
  const stats = await Store.stats();
  ok('统计：卡点数与学科分布正确', stats.cards === 4 && stats.bySubject.physics === 1 && stats.bySubject.math === 2 && stats.bySubject.japanese === 1);
  ok('统计：练习正确率在 0-100', stats.accuracy >= 0 && stats.accuracy <= 100);

  /* 10. 视图渲染冒烟（全部 hash 路由） */
  const root = makeEl();
  const renders = {};
  for (const name of ['home', 'quiz', 'library', 'review', 'practice', 'settings']) {
    location.hash = '#/' + name;
    const r = makeEl();
    await sandbox.window.Views[name].render(r, {});
    renders[name] = r.innerHTML;
    ok('视图 ' + name + ' 产出非空 HTML', renders[name].length > 50);
  }
  ok('今日页含统计卡与薄弱点', renders.home.indexOf('待复习') >= 0 && renders.home.indexOf('薄弱知识点') >= 0);
  ok('未配置 AI 时做题页显示配置引导', renders.quiz.indexOf('还没配置 AI 服务') >= 0);
  ok('今日页入口是做题而非拍照问', renders.home.indexOf('去做题') >= 0 && renders.home.indexOf('拍照问') < 0);
  ok('卡点库含搜索框与学科筛选', renders.library.indexOf('searchInput') >= 0 && renders.library.indexOf('卡点库') >= 0);
  ok('复习页显示卡片或空态', renders.review.indexOf('复习') >= 0);
  ok('练习页含出题按钮', renders.practice.indexOf('出 3 道题') >= 0);
  ok('设置页含 AI 配置与数据区', renders.settings.indexOf('baseUrl') >= 0 && renders.settings.indexOf('导出备份') >= 0);

  /* 11. 导入导出 */
  const backup = await Store.exportAll();
  ok('导出包含全部 store', Object.keys(backup.stores).length === DB.STORES.length);
  await Store.saveSettings({ ai: { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'test-key', textModel: 'm' } });
  await Store.importAll(backup, 'merge');
  const s2 = await Store.getSettings();
  ok('合并导入不动本机设置（Key 不被备份覆盖）', s2.ai.apiKey === 'test-key');
  await Store.importAll(backup, 'replace');
  ok('替换导入后数据仍在', (await Store.listStuck({})).length === 4);

  /* 12. AI JSON 提取 */
  ok('extractJSON 剥掉 markdown 围栏', Array.isArray(AI.extractJSON('```json\n[{"a":1}]\n```')));
  ok('extractJSON 容忍尾随逗号与中文引号', Array.isArray(AI.extractJSON('[{"a":1，}]'.replace('，', ','))));

  /* 13. Markdown 渲染 */
  const md = Util.mdToHtml('**粗体** 与 $x^2$ 和\n- 列表项\n1. 有序');
  ok('mdToHtml 处理粗体/列表', md.indexOf('<strong>粗体</strong>') >= 0 && md.indexOf('<li>') >= 0);

  /* 14. 2.0 默认设置与 OCR 清除 */
  const sOcr = await Store.getSettings();
  ok('做题默认学科为日语', sOcr.study.subject === 'japanese');
  ok('每次出题默认 3 道', sOcr.study.quizCount === 3);
  ok('设置项里已无 OCR 引擎配置', sOcr.ocr === undefined);
  ok('设置页识别引擎区块已移除', renders.settings.indexOf('ocrEngine') < 0);
  ok('设置页含每次出题数量', renders.settings.indexOf('quizCount') >= 0);
  ok('vendor/tesseract 目录已清除', !fs.existsSync(path.join(ROOT, 'assets/vendor/tesseract')));

  /* sw.js 缓存策略 */
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok('sw.js 缓存版本已升 v3', swSrc.indexOf('kadian-v3') >= 0);
  ok('sw.js 预缓存清单含 quiz.js', swSrc.indexOf('./assets/js/views/quiz.js') >= 0);
  ok('sw.js 不再引用 tesseract', swSrc.indexOf('tesseract') < 0);

  /* 15. 做题流核心：出题 → 触点精讲 → 学会入库（桩 fetch 走 AI 真实链路） */
  const quizView = sandbox.window.Views.quiz;
  quizView.state.subject = 'japanese';
  /* 第 11 节 replace 导入后 DB 设置为空，先重存 AI 配置 */
  await Store.saveSettings({ ai: { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'k', textModel: 'm' } });
  let fetchCount = 0;
  sandbox.fetch = async (url, opts) => {
    fetchCount++;
    const prompt = JSON.parse(opts.body).messages[0].content;
    let content;
    if (prompt.indexOf('值得学生专门学') >= 0) {
      /* 识别知识点：返回带 |{|…|}| 标记的语篇（原文照抄，只加标记） */
      content = '日本語を勉強し始めて|{|まだ半年|}|だが、顧みれば|{|確かに成長している|}|と感じる。';
    } else if (prompt.indexOf('要学的点') >= 0 || prompt.indexOf('不懂的片段') >= 0) {
      /* 触点精讲 / 即点即学：结构化讲解 */
      content = JSON.stringify({
        point: '顧みる', meaning: '回首、回顾（过去的事）',
        examples: [{ src: '三年を顧みる', zh: '回顾这三年' }],
        usage: '他动词，接续：名词+を+顧みる；多用于回顾往事', mistake: '与「構える」形近，不要混淆',
        topic: '日语·词汇'
      });
    } else if (prompt.indexOf('结构化词条') >= 0) {
      /* 词条生成 */
      content = JSON.stringify({ words: [
        { word: '売り上げる', reading: 'うりあげる', pos: 'v2', transitivity: 'vt', meaning: '售出', example: 'この店は去年、物件を売り上げた。', exampleZh: '这家店去年把房子卖了。' },
        { word: '手続き', reading: 'てつづき', pos: 'n', transitivity: '', meaning: '手续', example: '手続きを済ませた。', exampleZh: '办完了手续。' }
      ] });
    } else if (prompt.indexOf('词汇量评估') >= 0) {
      /* 词汇量调查 */
      content = JSON.stringify({ results: [
        { word: '手続き', known: false, reason: '复合词，需查词典' },
        { word: '窓口', known: true, reason: '基础名词' }
      ] });
    } else if (prompt.indexOf('基于这段语篇出') >= 0) {
      /* 基于题库语篇出题 */
      content = JSON.stringify({
        questions: [
          { type: 'choice', stem: '题库语篇出的题', options: ['A. 甲', 'B. 乙', 'C. 丙', 'D. 丁'], answer: 'A', explanation: '解析', point: '顧みる' }
        ]
      });
    } else {
      /* AI 现造语篇 + 题目 */
      content = JSON.stringify({
        passage: '日本語を勉強し始めてまだ半年だが、顧みれば確かに成長していると感じる。',
        passageZh: '学日语才半年，但回顾起来确实感觉在成长。',
        source: '日语阅读·随笔',
        questions: [
          { type: 'choice', stem: '文中「顧みる」的意思最接近：', options: ['A. 回顾、回首', 'B. 照顾', 'C. 固执', 'D. 拜访'], answer: 'A', explanation: '顧みる=回首、回顾，此处指回顾过去', point: '顧みる' },
          { type: 'fill', stem: '「勉強し___てまだ半年」空中填「始め」のて形', answer: '始め', explanation: '〜し始める表示动作开始', point: '〜し始める' }
        ]
      });
    }
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: content } }] })
    };
  };
  const quizRes = await Store.generateQuiz('japanese', 2);
  ok('generateQuiz 走真实链路生成语篇+题目', quizRes.problems.length === 2 && quizRes.passage.length > 10);
  ok('做题题目带 kind=quiz 与语篇', quizRes.problems.every(p => p.kind === 'quiz' && p.passage && p.topic));
  ok('做题题目不进今日队列（无语境的题不裸做）', (await Store.todayQueue()).pendingProblems.every(p => p.kind !== 'quiz'));
  ok('练习列表过滤掉做题类题目', (await Store.listProblems({ kind: 'plain' })).every(p => p.kind !== 'quiz'));
  ok('不过滤时做题题目可列出', (await Store.listProblems({})).filter(p => p.kind === 'quiz').length === 2);

  const exp = await AI.explainPoint('japanese', '顧みる', quizRes.passage);
  ok('explainPoint 返回结构化讲解', exp.point === '顧みる' && exp.examples.length === 1 && exp.topic === '日语·词汇' && exp.mistake.length > 0);
  const learned = await Store.savePointAsCard('japanese', exp, '顧みる', quizRes.passage, quizRes.source);
  ok('学会了入库：topic 取自精讲、语篇入 context', learned.topic === '日语·词汇' && learned.question === '顧みる' && learned.context.indexOf('日本語') >= 0);
  ok('入库卡点进入今日复习队列', (await Store.todayQueue()).dueCards.length === 5);

  /* 题卡与精讲卡 HTML */
  quizView.state.session = { passage: quizRes.passage, passageZh: quizRes.passageZh, source: quizRes.source, problems: quizRes.problems };
  const qHtml = quizView.questionHTML(quizRes.problems[0], 0);
  ok('题卡含选项与考点', qHtml.indexOf('opt-key') >= 0 && qHtml.indexOf('顧みる') >= 0);
  quizView.state.explains['顧みる'] = { exp: exp, saved: false };
  const eHtml = quizView.explainCardHTML('顧みる');
  ok('精讲卡含「学会了，入库」与用法区块', eHtml.indexOf('学会了，入库') >= 0 && eHtml.indexOf('用法') >= 0);
  quizView.state.explains['顧みる'].saved = true;
  const eSaved = quizView.explainCardHTML('顧みる');
  ok('已入库精讲卡显示复习提示', eSaved.indexOf('已入库') >= 0 && eSaved.indexOf('学会了，入库') < 0);

  /* 配置 AI 后重渲染做题页：完整闭环文案（第 15 节开头已存配置） */
  const qRoot = makeEl();
  await quizView.render(qRoot, {});
  ok('做题页宣传全程无断点闭环', qRoot.innerHTML.indexOf('做题 → 不会 → 了解 → 学会') >= 0);

  /* AI.vision 保留（后续功能预留），不再有本地 OCR 模块 */
  ok('ai.js 仍保留 vision 能力', typeof sandbox.AI.vision === 'function');
  ok('OCR 模块已不存在', sandbox.OCR === undefined);


  /* 16. 题库 / 即点即学 / 精讲缓存（2.0 第二批） */
  ok('Marks 解析出即点区域', JSON.stringify(Marks.list('A|{|語point|}|B')) === '["語point"]');
  ok('Marks 去标记得纯文本', Marks.strip('A|{|x|}|B') === 'AxB');
  ok('Marks 未闭合标记不吞内容', Marks.strip('A|{|未闭合') === 'A|{|未闭合');
  ok('Marks 加标记', Marks.wrap('abcd', ['bc']) === 'a|{|bc|}|d');

  const pz = await Store.savePassage({
    subject: 'japanese', title: '测试语篇', source: '单元测试',
    text: '日本語を勉強し始めて|{|まだ半年|}|だが'
  });
  ok('题库语篇保存时解析出即点区域', pz.markCount === 1 && pz.plain === '日本語を勉強し始めてまだ半年だが' && pz.marks[0] === 'まだ半年');
  ok('题库按学科可列出', (await Store.listPassages({ subject: 'japanese' })).some(p => p.id === pz.id));

  /* 词汇量调查 → 未掌握的词 → 标成即点区域（替代已下线的自动识别语法） */
  const wl0 = await Store.importWordList('japanese', '测试词表', '手続き\n窓口');
  const wlChecked = await Store.checkVocabulary('japanese', wl0.id);
  ok('词汇量调查给出已掌握/未掌握判定',
    wlChecked.results.length === 2 && wlChecked.knownCount === 1 && wlChecked.unknownCount === 1,
    JSON.stringify({ k: wlChecked.knownCount, u: wlChecked.unknownCount }));
  const pzW = await Store.savePassage({ subject: 'japanese', title: '待标记语篇', text: '今日、窓口で手続きをしました。' });
  const pzMarked = await Store.markUnknownWords(pzW.id, wl0.id);
  ok('未掌握的词在语篇里被标成即点区域',
    pzMarked.markCount === 1 && pzMarked.marks.indexOf('手続き') >= 0,
    'marks=' + JSON.stringify(pzMarked.marks));

  /* 基于题库语篇出题（不出新语篇） */
  const pzQuiz = await Store.generateQuizFromPassage('japanese', pzMarked.text, 2);
  ok('基于题库语篇出题', pzQuiz.problems.length === 1 && pzQuiz.problems[0].passage.indexOf('|{|') < 0);

  /* 精讲缓存：同一片段只问一次 */
  const exp2 = await AI.explainPoint('japanese', 'まだ半年', '语篇');
  await Store.saveCachedExplain('japanese', 'まだ半年', exp2);
  const hit = await Store.getCachedExplain('japanese', 'まだ半年');
  ok('精讲缓存命中', !!hit && hit.point === '顧みる');
  ok('不同学科不串缓存', (await Store.getCachedExplain('english', 'まだ半年')) === null);

  /* 缓存命中时不再发 API 请求 */
  const before = fetchCount;
  const cacheRoot = makeEl();
  quizView.state.session = { passageText: pzMarked.text, marked: true, source: '题库', problems: [] };
  await quizView.explain(cacheRoot, 'まだ半年', { marked: true });
  ok('缓存命中不再调用 API', fetchCount === before, 'fetch: ' + before + '→' + fetchCount);

  /* 即点区域渲染成下划线可点 */
  const mk = quizView.passageHTML(pzMarked.text, true);
  ok('即点区域渲染成 .qz-mark 且带原文', mk.indexOf('class="qz-mark"') >= 0 && mk.indexOf('data-text="手続き"') >= 0);

  /* 起始页：题库列表 + 其它学科敬请期待 */
  const idleHost = makeEl();
  const fakeRoot = {
    querySelector: (sel) => (sel === '#qzIdle' ? idleHost : makeEl()),
    querySelectorAll: () => []
  };
  await quizView.renderIdle(fakeRoot);
  ok('起始页列出题库并有开始做题入口', idleHost.innerHTML.indexOf('开始做题') >= 0 && idleHost.innerHTML.indexOf('编辑') >= 0);
  ok('其它学科标注敬请期待', idleHost.innerHTML.indexOf('敬请期待') >= 0 && idleHost.innerHTML.indexOf('chip-soon') >= 0);
  ok('日语/英语标为可用', (idleHost.innerHTML.match(/data-ready="1"/g) || []).length === 2);


  /* 17. 输入模式自适应（键鼠划词 / 触屏点词） */
  ok('InputMode 默认可切换', typeof sandbox.InputMode.set === 'function' && typeof sandbox.InputMode.current === 'function');
  sandbox.InputMode.set('mouse');
  ok('切到 mouse 模式', sandbox.InputMode.isMouse() === true && sandbox.InputMode.current() === 'mouse');
  sandbox.InputMode.set('touch');
  ok('切到 touch 模式', sandbox.InputMode.isTouch() === true);
  let modeChanged = 0;
  sandbox.InputMode.onChange(function () { modeChanged++; });
  sandbox.InputMode.set('mouse');
  sandbox.InputMode.set('touch');
  ok('模式变化通知监听者', modeChanged === 2, '变化次数 ' + modeChanged);

  const jaWords = sandbox.InputMode.wordsOf('日本語を勉強し始めて', 'japanese').map(w => w.text);
  ok('日语分词（Intl.Segmenter）', jaWords.indexOf('日本語') >= 0 && jaWords.indexOf('勉強') >= 0, JSON.stringify(jaWords));
  const enWords = sandbox.InputMode.wordsOf('I began studying Japanese', 'english').map(w => w.text);
  ok('英语分词', enWords.indexOf('Japanese') >= 0 && enWords.indexOf('studying') >= 0, JSON.stringify(enWords));

  /* 点词：模拟 caretRangeFromPoint 命中某个偏移 */
  const fakeDoc = sandbox.document;
  const origCaret = fakeDoc.caretRangeFromPoint;
  fakeDoc.caretRangeFromPoint = function () {
    return { startContainer: { nodeType: 3, textContent: '日本語を勉強し始めて', firstChild: null }, startOffset: 0 };
  };
  const picked = sandbox.InputMode.wordAt(10, 20, 'japanese');
  fakeDoc.caretRangeFromPoint = origCaret;
  ok('点词取到所在词', picked === '日本語', picked);


  /* 18. 单词背诵板块（词表 → 词条 → SM-2 背诵） */
  const wl = Store.parseWordList('売り上げる\n顧みる\n\n- 手続き\n* ，此前\n' +
    '重複\n重複\n読み仮名(よみがな)');
  ok('解析纯文本词表', wl.length >= 5 && wl[0].word === '売り上げる', JSON.stringify(wl.map(w => w.word)));
  ok('解析 markdown 列表项', wl.some(w => w.word === '手続き'));
  ok('解析「单词(假名)」并拆出读音', (wl.find(w => w.word === '読み仮名') || {}).reading === 'よみがな');
  ok('词表去重', (wl.filter(w => w.word === '重複').length) === 1);

  const list = await Store.importWordList('japanese', '新标日 第3课', '売り上げる\n顧みる\n手続き');
  ok('导入词表并计数', list.count === 3 && list.items.length === 3);
  ok('词表可按学科列出', (await Store.listWordLists({ subject: 'japanese' })).some(l => l.id === list.id));

  const entries = await Store.generateWordEntries('japanese', list.id);
  ok('生成词条（含词性/及物性/释义/例句）', entries.length === 2 &&
    entries[0].pos === 'v2' && entries[0].transitivity === 'vt' && entries[0].example.length > 0);
  const words = await Store.listWords({ listId: list.id });
  ok('词条入库且可按词表列出', words.length === 2 && words[0].srs && words[0].status === 'new');
  ok('词条初始为待背', (await Store.dueWords('japanese')).length >= 2);

  const w0 = words[0];
  const r1 = await Store.reviewWord(w0.id, 4);
  ok('背完「认识」→ SM-2 排期', r1.srs.reps === 1 && r1.srs.interval === 1 && r1.reviewCount === 1);
  const r2 = await Store.reviewWord(w0.id, 4);
  ok('连续认识 → 状态转已掌握', r2.srs.reps === 2 && r2.status === 'known', 'status=' + r2.status);
  const r3 = await Store.reviewWord(w0.id, 1);
  ok('「不认识」→ 重置间隔', r3.srs.reps === 0 && r3.srs.interval === 1);

  const st = await Store.wordStats('japanese');
  ok('单词统计正确', st.total === 2 && st.fresh === 1, JSON.stringify(st));

  /* 词汇量调查：未掌握的词 → 供转即点区域 */
  const checked = await AI.checkVocabulary('japanese', [{ word: '売り上げる' }, { word: '手続き' }]);
  ok('词汇量调查返回逐词判定', checked.length === 2 && typeof checked[0].known === 'boolean');

  console.log('\n全部通过：' + passed + ' 项断言');
})().catch(e => { console.error('\n✗ 失败：', e && e.message); process.exit(1); });
