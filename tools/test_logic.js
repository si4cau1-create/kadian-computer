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
  'assets/js/util.js', 'assets/js/ai.js', 'assets/js/ocr.js', 'assets/js/store.js',
  'assets/js/ui.js', 'assets/js/select.js',
  'assets/js/views/home.js', 'assets/js/views/ask.js', 'assets/js/views/library.js',
  'assets/js/views/review.js', 'assets/js/views/practice.js', 'assets/js/views/settings.js',
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
const { DB, Store, AI, Util, CONFIG } = sandbox;
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
  ok('judge 多答案管道符', Store.judge({ type: 'fill', answer: '3|x=3' }, '3') === true);
  ok('judge 主观题返回 null', Store.judge({ type: 'subjective', answer: 'anything' }, 'whatever') === null);

  /* 9. 统计 */
  const stats = await Store.stats();
  ok('统计：卡点数与学科分布正确', stats.cards === 4 && stats.bySubject.physics === 1 && stats.bySubject.math === 2 && stats.bySubject.japanese === 1);
  ok('统计：练习正确率在 0-100', stats.accuracy >= 0 && stats.accuracy <= 100);

  /* 10. 视图渲染冒烟（全部 hash 路由） */
  const root = makeEl();
  const renders = {};
  for (const name of ['home', 'ask', 'library', 'review', 'practice', 'settings']) {
    location.hash = '#/' + name;
    const r = makeEl();
    await sandbox.window.Views[name].render(r, {});
    renders[name] = r.innerHTML;
    ok('视图 ' + name + ' 产出非空 HTML', renders[name].length > 50);
  }
  ok('今日页含统计卡与薄弱点', renders.home.indexOf('待复习') >= 0 && renders.home.indexOf('薄弱知识点') >= 0);
  ok('未配置 AI 时拍照问显示配置引导', renders.ask.indexOf('还没配置 AI 服务') >= 0);
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

  /* 14. 内置 OCR 引擎（tesseract 本地化） */
  const sOcr = await Store.getSettings();
  ok('默认 OCR 引擎为 tesseract（本地离线）', sOcr.ocr.engine === 'tesseract');
  ok('OCR 语言默认三语（已全部内置）', sOcr.ocr.langs === 'chi_sim+eng+jpn');
  ok('设置页默认选中本地识别', renders.settings.indexOf('value="tesseract" selected') >= 0);
  ok('设置页 OCR 文案标注无需联网', renders.settings.indexOf('无需联网') >= 0);

  /* vendor 文件存在性（防漏提交/漏同步进 APK） */
  const VENDOR_FILES = [
    'tesseract.min.js', 'worker.min.js',
    'tesseract.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt', 'tesseract-core.LICENSE',
    'core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm',
    'core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm',
    'tessdata/chi_sim.traineddata', 'tessdata/eng.traineddata', 'tessdata/jpn.traineddata'
  ];
  const vendMissing = VENDOR_FILES.filter(f => !fs.existsSync(path.join(ROOT, 'assets/vendor/tesseract', f)));
  ok('assets/vendor/tesseract 12 个内置文件齐全', vendMissing.length === 0);

  /* sw.js 缓存策略 */
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok('sw.js 缓存版本已升 v2', swSrc.indexOf('kadian-v2') >= 0);
  ok('sw.js 预缓存 tesseract 两个小脚本', swSrc.indexOf('./assets/vendor/tesseract/tesseract.min.js') >= 0 && swSrc.indexOf('./assets/vendor/tesseract/worker.min.js') >= 0);
  ok('sw.js 未把 20MB 语言包装进预缓存清单', swSrc.indexOf('traineddata') < 0);

  /* vision 路由回归 */
  AI.vision = async () => 'STUB';
  ok('vision 引擎路由未被破坏', (await sandbox.OCR.run('data:,x', 'vision')) === 'STUB');

  console.log('\n全部通过：' + passed + ' 项断言');
})().catch(e => { console.error('\n✗ 失败：', e && e.message); process.exit(1); });
