/* AI 客户端：OpenAI 兼容接口（chat/completions），支持文本与视觉多模态
   - 全部配置只存在本机（localStorage / IndexedDB），key 不写死在代码里
   - base_url 可指向局域网转发脚本 tools/proxy.py 以绕过浏览器 CORS 限制 */
var AI = (function () {
  var cfgRef = { cfg: null };

  function cfg() { return cfgRef.cfg || {}; }
  function setCfg(c) { cfgRef.cfg = c || {}; }

  function isConfigured() {
    var c = cfg();
    return !!(c.baseUrl && c.apiKey && c.textModel);
  }
  function canVision() {
    var c = cfg();
    return !!(c.baseUrl && c.apiKey && c.visionModel);
  }

  function endpoint() {
    var b = (cfg().baseUrl || '').replace(/\/+$/, '');
    return b + '/chat/completions';
  }

  async function request(body, opts) {
    opts = opts || {};
    var c = cfg();
    if (!c.baseUrl) throw new Error('尚未配置 AI 服务：到「设置」填写 base_url');
    if (!c.apiKey) throw new Error('尚未配置 API Key：到「设置」填写');
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.apiKey };
    if (c.extraHeaders) {
      Object.keys(c.extraHeaders).forEach(function (k) {
        if (c.extraHeaders[k]) headers[k] = c.extraHeaders[k];
      });
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = opts.timeout || 180000;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeout);
    try {
      var res = await fetch(endpoint(), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      });
      var text = await res.text();
      if (!res.ok) {
        var msg = 'AI 请求失败（HTTP ' + res.status + '）';
        try {
          var j = JSON.parse(text);
          msg += '：' + ((j.error && j.error.message) || text).slice(0, 300);
        } catch (e) { msg += '：' + text.slice(0, 300); }
        if (res.status === 401) msg += ' — 可能是 API Key 不对或已过期';
        if (res.status === 404) msg += ' — 可能是 base_url 或模型名不对';
        if (res.status === 429) msg += ' — 触发限流或余额不足';
        throw new Error(msg);
      }
      var json = JSON.parse(text);
      var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (!content) throw new Error('AI 返回内容为空');
      return content;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('请求超时（' + Math.round(timeout / 1000) + ' 秒）');
      if (e instanceof TypeError) {
        throw new Error('网络请求失败：可能是浏览器跨域（CORS）被拦截。可在电脑上运行 tools/proxy.py，手机 base_url 填 http://电脑IP:8899/v1 走局域网转发。');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function chat(messages, opts) {
    opts = opts || {};
    var c = cfg();
    return request({
      model: opts.model || c.textModel,
      messages: messages,
      temperature: opts.temperature != null ? opts.temperature : (c.temperature != null ? c.temperature : 0.3),
      max_tokens: opts.maxTokens || c.maxTokens || 2000,
      stream: false
    }, opts);
  }

  function vision(prompt, imageDataUrl, opts) {
    opts = opts || {};
    var c = cfg();
    if (!c.visionModel) throw new Error('未配置视觉模型：DeepSeek 等纯文本模型无法读图，请到「设置」填一个视觉模型名（如 qwen-vl-plus、doubao-*-vision）');
    var content = [{ type: 'text', text: prompt }];
    if (imageDataUrl) content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
    return request({
      model: opts.model || c.visionModel,
      messages: [{ role: 'user', content: content }],
      temperature: opts.temperature != null ? opts.temperature : 0.3,
      max_tokens: opts.maxTokens || c.maxTokens || 2000,
      stream: false
    }, opts);
  }

  /* ---------- 提示词 ---------- */

  function pExplainSelection(subject, sel, context, question) {
    var s = CONFIG.subjectName(subject);
    return CONFIG.role(subject) +
      '\n\n学生在做' + s + '练习时卡住了。**只针对这一点讲解**，不要复述原文、不要讲无关内容。\n' +
      '\n【原文片段】\n' + (sel || '(未提供)') +
      (context ? '\n\n【上下文】\n' + context : '') +
      (question ? '\n\n【学生的问题】\n' + question : '') +
      '\n\n严格按以下结构输出（Markdown，300 字内）：\n' +
      '**一句话结论**：\n\n' +
      '**拆解**\n1. （成分/步骤逐条说明，公式用 LaTeX：行内 $...$，独立 $$...$$）\n2. （它在这个语境里起什么作用 / 为什么这一步成立）\n\n' +
      '**常见坑**：1-2 条\n\n' +
      '**同类提醒**：与它形近但不同的东西，一句话点明区别';
  }

  function pExplainWhole(subject) {
    var s = CONFIG.subjectName(subject);
    return CONFIG.role(subject) +
      '\n\n学生拍了一张' + s + '的题目/材料。请按以下结构讲，500 字内：\n' +
      '**题目在问什么**：一句话复述设问\n\n' +
      '**考点**：1-3 个具体知识点\n\n' +
      '**完整解答**：分步骤，每步写清依据，公式用 LaTeX，标出关键转折\n\n' +
      '**最容易卡住的点**：2-3 条，每条一句话说清"卡在哪、怎么想通"\n\n' +
      '**最小必要补充**：做这题前必须先知道的一个知识点或公式\n\n' +
      '如果图片模糊或不是题目，直接说明你看到了什么，并请对方重拍。';
  }

  function pOCR() {
    return '把图片里的内容尽可能忠实地转写为纯文本。要求：\n' +
      '1. 保持原有段落、题号与选项结构\n' +
      '2. 数学/物理公式用 LaTeX：行内 $...$，独立 $$...$$\n' +
      '3. 化学式用 \\mathrm{...} 形式\n' +
      '4. 日文保持日文原样，不要翻译\n' +
      '5. 图形无法用文字表达时用 [图：……] 简要描述\n' +
      '6. 只输出转写结果，不要任何解释与开场白';
  }

  function pPractice(subject, topic, weakCtx, count) {
    return CONFIG.role(subject) +
      '\n\n给学生出 ' + count + ' 道' + CONFIG.subjectName(subject) + '练习题，专门打他的薄弱点「' + topic + '」。\n' +
      (weakCtx ? '\n他的卡点记录（用来对准盲区）：\n' + weakCtx + '\n' : '') +
      '\n要求：\n' +
      '1. 难度对准"能独立做出但需要动脑"，不要送分题，也不要超纲竞赛题\n' +
      '2. 自编情境或改数据，禁止照抄常见教辅原题\n' +
      '3. 至少一半为客观题，其余为主观题\n' +
      '4. 每题 explanation 讲清关键步骤与易错点，公式用 LaTeX\n' +
      '5. 填空题答案用最简形式（如 "3" 而不是 "x=3"）\n\n' +
      '只输出 JSON 数组，不要任何其他文字。格式：\n' +
      '[{"type":"choice","stem":"题干","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A","explanation":"解析","difficulty":3},' +
      '{"type":"fill","stem":"题干","answer":"最简答案","explanation":"解析","difficulty":3},' +
      '{"type":"subjective","stem":"题干","answer":"参考要点","explanation":"解析","difficulty":3}]';
  }

  /* ---------- 做题（2.0 核心）提示词 ---------- */

  /* 出题：一段真实风格语篇 + 基于语篇的题目（语篇是「不会→了解」的载体） */
  function pQuiz(subject, count) {
    var s = CONFIG.subjectName(subject);
    return CONFIG.role(subject) +
      '\n\n请生成一组' + s + '练习题：一段真实风格的语篇 + 基于这段语篇的 ' + count + ' 道题。\n\n' +
      '要求：\n' +
      '1. 语篇用' + s + '原文书写，80-200 字/词，贴近真题阅读或真实生活材料（新闻、对话、短文皆可），自然嵌入 2-4 个值得学的语法点或词汇\n' +
      '2. 题目必须基于这段语篇作答：语境填空、语法/词义选择、理解判断混合，不考孤立记忆\n' +
      '3. 至少一半为可自动判分的客观题（choice/fill），其余为主观题\n' +
      '4. 每题解析要点明"考的是哪个点"，一句话即可\n' +
      '5. 难度对准高中课标（日语约 N3-N2，英语约高考），不送分也不超纲\n\n' +
      '只输出 JSON，不要任何其他文字。格式：\n' +
      '{"passage":"语篇原文","passageZh":"语篇的中文翻译或概要","source":"材料风格说明，如：高考英语阅读·说明文","questions":[' +
      '{"type":"choice","stem":"题干（涉及语篇内容）","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A","explanation":"解析","point":"考点，如：〜てしまう 的完结体"},' +
      '{"type":"fill","stem":"题干（用____标出空）","answer":"最简答案","explanation":"解析","point":"考点"},' +
      '{"type":"subjective","stem":"题干","answer":"参考要点","explanation":"解析","point":"考点"}]}';
  }

  /* 触点精讲：学生在语篇中选中一个不懂的片段，只讲这一段（快、准、就地）
     question：学生自己写的问题（有则优先回答，别自作主张换话题） */
  function pExplainPoint(subject, sel, passage, question) {
    return CONFIG.role(subject) +
      '\n\n学生在' + CONFIG.subjectName(subject) + '语篇中遇到了不懂的片段。**只针对这个片段讲解**，不要复述全文、不要讲无关内容。\n' +
      '\n【语篇】\n' + (passage || '(未提供)') +
      '\n\n【学生不懂的片段】\n' + sel +
      (question ? '\n\n【学生的问题】\n' + question + '\n（优先回答学生问到的这个点；若问题与片段无关，先回答问题，再顺带解释片段）' : '') +
      '\n\n严格只输出 JSON，不要任何其他文字：\n' +
      '{"point":"这个知识点的名称（如：词汇「顧みる」/ 语法「〜わけではない」）",' +
      '"meaning":"一句话释义（中文）",' +
      '"examples":[{"src":"例句原文（日文或英文）","zh":"例句中文翻译"}],' +
      '"usage":"用法/接续/搭配/使用限制，2-3 句",' +
      '"mistake":"最常见的一个误用，一句话",' +
      '"topic":"归类名，用于知识点聚合，如：日语·语法·否定"}\n' +
      '讲解务必简短——学生正在做题中，不要让他等。';
  }

  /* 没懂：换一种更简单的讲法 */
  function pExplainPointSimpler(subject, sel, passage, prev, question) {
    return pExplainPoint(subject, sel, passage, question) +
      '\n\n注意：上一次的讲解学生没懂（上次讲的是：' + (prev || '') + '）。' +
      '请换一种更简单的讲法：用最直白的话、生活化的类比，例句换成最简单的。';
  }

  /* 即点即学：题库语篇里预设好的即点区域被点击时用（比触点精讲更短，不带整篇语篇，省 token） */
  function pExplainMarked(subject, sel, passage) {
    return CONFIG.role(subject) +
      '\n\n学生在' + CONFIG.subjectName(subject) + '语篇中标出了一个要学的点。**只针对这个点讲解**，不要复述周围文本、不要讲无关内容。\n' +
      (passage ? '\n【语篇】\n' + passage + '\n' : '') +
      '\n【要学的点】\n' + sel +
      '\n\n严格只输出 JSON，不要任何其他文字：\n' +
      '{"point":"这个知识点的名称","meaning":"一句话释义（中文）",' +
      '"examples":[{"src":"例句原文（日文或英文）","zh":"例句中文翻译"}],' +
      '"usage":"用法/接续/搭配/使用限制，2-3 句","mistake":"最常见的一个误用，一句话",' +
      '"topic":"归类名，用于知识点聚合，如：日语·语法·否定"}';
  }

  /* 知识点一键识别：扫描语篇，把值得学的语法点/词汇用 |{|…|}| 框住后原样返回 *//* 基于用户导入的语篇出题（不出新语篇） */
  function pQuizFromPassage(subject, passage, count) {
    return CONFIG.role(subject) +
      '\n\n下面是一段' + CONFIG.subjectName(subject) + '语篇。请基于这段语篇出 ' + count + ' 道题。\n' +
      '\n【语篇】\n' + passage +
      '\n\n要求：\n' +
      '1. 题目必须基于这段语篇作答：语境填空、语法/词义选择、理解判断混合\n' +
      '2. 至少一半为可自动判分的客观题（choice/fill），其余为主观题\n' +
      '3. 每题解析要点明"考的是哪个点"，一句话即可\n' +
      '4. 难度对准高中课标（日语约 N3-N2，英语约高考）\n\n' +
      '只输出 JSON，不要任何其他文字。格式：\n' +
      '{"questions":[{"type":"choice","stem":"题干","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A","explanation":"解析","point":"考点"},' +
      '{"type":"fill","stem":"题干（用____标出空）","answer":"最简答案","explanation":"解析","point":"考点"},' +
      '{"type":"subjective","stem":"题干","answer":"参考要点","explanation":"解析","point":"考点"}]}';
  }

  /* ---------- 单词（背诵板块）提示词 ---------- */

  /* 词条生成：按用户约定的《日语单词背诵输出提示词》规则 */
  function pWordEntries(subject, words) {
    return '你是日语词汇编纂助手。请把给定的词表整理成结构化词条。\n' +
      '\n【词表】（共 ' + (words || []).length + ' 个）\n' + (words || []).map(function (w) { return w.word; }).join('\n') +
      '\n\n【输出】只输出 JSON，不要任何其他文字：\n' +
      '{"words":[{"word":"売り上げる","reading":"うりあげる","pos":"v2","transitivity":"vt",' +
      '"meaning":"售出","example":"この店は去年、物件を売り上げた。","exampleZh":"这家店去年把房子卖了。"}]}\n' +
      '\n【规则】\n' +
      '1. word 一律用**辞书形（原形）**，动词尤其如此\n' +
      '2. pos 只能用这些缩写：adj1（一类形容词）、adj2（二类形容词）、n（名词）、pron（代词）、' +
      'v1 / v2 / v3（各类动词）、adv（副词）、conj（接续词）、prep（助词）\n' +
      '3. transitivity 只对动词填：vt（他动词）/ vi（自动词）/ vt/vi（自他动词）；非动词填空字符串\n' +
      '4. meaning 用中文释义，最多 2 条；无歧义时只写 1 条；避免容易混淆的译法\n' +
      '5. reading 写平假名读音；example 给一个用上该词的短句（贴近常见用法），exampleZh 给中文翻译\n' +
      '6. 《新标日》等教材词汇须联网检索校验假名、词性、释义；无法确认的词直接跳过，不要瞎写\n' +
      '7. 词表里的每个词都要处理（除非按第 6 条跳过）';
  }

  /* 词汇量调查：判断用户对每个词是否已掌握 */
  function pVocabularyCheck(subject, words) {
    return '你是日语词汇量评估助手。判断下面每个词，对以日语为学习语言的用户而言是否属于「已掌握」。\n' +
      '\n【词表】（共 ' + (words || []).length + ' 个）\n' + (words || []).map(function (w) { return w.word; }).join('\n') +
      '\n\n【判断标准】\n' +
      '1. 「已掌握」= 能直接理解该词在句中的意思并顺畅读完（常见词、基础词、高频词）\n' +
      '2. 「未掌握」= 需要查词典才懂（生僻词、抽象名词、复杂动词、需辨析的近义词）\n' +
      '3. 严格按词表顺序输出，一个不漏、顺序不变\n' +
      '4. reason 用中文一句话说明为什么（≤20 字）\n\n' +
      '只输出 JSON，不要任何其他文字：\n' +
      '{"results":[{"word":"…","known":true,"reason":"…"}]}';
  }

  function extractJSON(text) {
    if (!text) throw new Error('模型没有返回内容');
    var t = String(text).trim();
    var m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) t = m[1].trim();
    /* 对象形态（如做题的 {passage, questions}）：首个 { 在首个 [ 之前时按对象整体解析 */
    var iObj = t.indexOf('{'), iArr = t.indexOf('[');
    if (iObj >= 0 && (iArr < 0 || iObj < iArr)) {
      var eObj = t.lastIndexOf('}');
      if (eObj > iObj) t = t.slice(iObj, eObj + 1);
      try {
        return JSON.parse(t);
      } catch (err) {
        try {
          return JSON.parse(t
            .replace(/,\s*([\]}])/g, '$1')
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'"));
        } catch (e2) {
          throw new Error('模型返回的内容不是合法 JSON，可重试或换用更强的模型');
        }
      }
    }
    var s = t.indexOf('['), e = t.lastIndexOf(']');
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
    try {
      return JSON.parse(t);
    } catch (err) {
      try {
        return JSON.parse(t
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'"));
      } catch (e2) {
        throw new Error('模型返回的题目不是合法 JSON，可重试或换用更强的模型');
      }
    }
  }

  function normalizeProblem(p, i, subject, topic) {
    var type = p && p.type ? String(p.type) : 'subjective';
    if (['choice', 'fill', 'subjective'].indexOf(type) < 0) type = 'subjective';
    return {
      id: uid(),
      type: type,
      stem: String((p && p.stem) || '').trim(),
      options: Array.isArray(p && p.options) ? p.options.map(String) : [],
      answer: p && p.answer != null ? String(p.answer) : '',
      explanation: String((p && p.explanation) || '').trim(),
      difficulty: p && p.difficulty != null ? Number(p.difficulty) : 3,
      subject: subject,
      topic: topic,
      status: 'pending',      // pending / done / skipped
      userAnswer: '',
      correct: null,
      createdAt: nowISO(),
      doneAt: ''
    };
  }

  /* 生成练习题（返回 problems 数组） */
  async function generatePractice(subject, topic, weakCtx, count) {
    count = count || 3;
    var raw = await chat([
      { role: 'user', content: pPractice(subject, topic, weakCtx, count) }
    ], { temperature: 0.6, maxTokens: 2400, timeout: 240000 });
    var arr = extractJSON(raw);
    if (!Array.isArray(arr) || !arr.length) throw new Error('模型没有生成题目');
    return arr.slice(0, count).map(function (p, i) {
      return normalizeProblem(p, i, subject, topic);
    });
  }

  /* ---------- 做题（2.0 核心）：语篇出题 + 触点精讲 ---------- */

  function normalizeQuiz(raw, subject) {
    var qs = Array.isArray(raw && raw.questions) ? raw.questions : [];
    var questions = qs.map(function (q) {
      var type = q && q.type ? String(q.type) : 'subjective';
      if (['choice', 'fill', 'subjective'].indexOf(type) < 0) type = 'subjective';
      if (type === 'choice' && (!Array.isArray(q.options) || q.options.length < 2)) type = 'subjective';
      return {
        type: type,
        stem: String((q && q.stem) || '').trim(),
        options: Array.isArray(q && q.options) ? q.options.map(String) : [],
        answer: q && q.answer != null ? String(q.answer) : '',
        explanation: String((q && q.explanation) || '').trim(),
        point: String((q && q.point) || '').trim()
      };
    }).filter(function (q) { return q.stem; });
    return {
      passage: String((raw && raw.passage) || '').trim(),
      passageZh: String((raw && raw.passageZh) || '').trim(),
      source: String((raw && raw.source) || '').trim(),
      questions: questions
    };
  }

  /* 生成一组做题（语篇 + 题目） */
  async function generateQuiz(subject, count) {
    count = count || 3;
    var raw = await chat([
      { role: 'user', content: pQuiz(subject, count) }
    ], { temperature: 0.5, maxTokens: 3000, timeout: 240000 });
    var quiz = normalizeQuiz(extractJSON(raw), subject);
    if (!quiz.passage) throw new Error('模型没有生成语篇，可重试');
    return quiz;
  }

  /* 讲解结果归一化（触点精讲与即点即学共用） */
  function normalizeExplain(j, sel) {
    return {
      point: String((j && j.point) || '').trim() || String(sel || '').slice(0, 40),
      meaning: String((j && j.meaning) || '').trim(),
      examples: Array.isArray(j && j.examples)
        ? j.examples.map(function (e) {
          return { src: String((e && e.src) || ''), zh: String((e && e.zh) || '') };
        }).filter(function (e) { return e.src; })
        : [],
      usage: String((j && j.usage) || '').trim(),
      mistake: String((j && j.mistake) || '').trim(),
      topic: String((j && j.topic) || '').trim()
    };
  }

  /* 触点精讲：返回结构化讲解（point/meaning/examples/usage/mistake/topic） */
  async function explainPoint(subject, sel, passage, opts) {
    opts = opts || {};
    var prompt = opts.simpler
      ? pExplainPointSimpler(subject, sel, passage, opts.prev, opts.question)
      : pExplainPoint(subject, sel, passage, opts.question);
    var raw = await chat([
      { role: 'user', content: prompt }
    ], { temperature: 0.2, maxTokens: 900, timeout: 120000 });
    return normalizeExplain(extractJSON(raw), sel);
  }

  /* 即点即学：题库预设的即点区域被点击 */
  async function explainMarked(subject, sel, passage) {
    var raw = await chat([
      { role: 'user', content: pExplainMarked(subject, sel, passage) }
    ], { temperature: 0.2, maxTokens: 900, timeout: 120000 });
    return normalizeExplain(extractJSON(raw), sel);
  }

  /* 知识点一键识别：返回带 |{|…|}| 标记的语篇 *//* 基于指定语篇出题 */
  async function generateQuizFromPassage(subject, passage, count) {
    count = count || 3;
    var raw = await chat([
      { role: 'user', content: pQuizFromPassage(subject, passage, count) }
    ], { temperature: 0.5, maxTokens: 2400, timeout: 240000 });
    var j = extractJSON(raw);
    var qs = Array.isArray(j && j.questions) ? j.questions : (Array.isArray(j) ? j : []);
    return {
      questions: qs.map(function (q) {
        var type = q && q.type ? String(q.type) : 'subjective';
        if (['choice', 'fill', 'subjective'].indexOf(type) < 0) type = 'subjective';
        if (type === 'choice' && (!Array.isArray(q.options) || q.options.length < 2)) type = 'subjective';
        return {
          type: type,
          stem: String((q && q.stem) || '').trim(),
          options: Array.isArray(q && q.options) ? q.options.map(String) : [],
          answer: q && q.answer != null ? String(q.answer) : '',
          explanation: String((q && q.explanation) || '').trim(),
          point: String((q && q.point) || '').trim()
        };
      }).filter(function (q) { return q.stem; })
    };
  }

  /* 词条生成：返回 [{word, reading, pos, transitivity, meaning, example, exampleZh}] */
  async function generateWordEntries(subject, words) {
    if (!words || !words.length) throw new Error('词表是空的');
    var raw = await chat([
      { role: 'user', content: pWordEntries(subject, words) }
    ], { temperature: 0.2, maxTokens: 6000, timeout: 300000 });
    var j = extractJSON(raw);
    var arr = Array.isArray(j && j.words) ? j.words : (Array.isArray(j) ? j : []);
    return arr.map(function (w) {
      return {
        word: String((w && w.word) || '').trim(),
        reading: String((w && w.reading) || '').trim(),
        pos: String((w && w.pos) || '').trim(),
        transitivity: String((w && w.transitivity) || '').trim(),
        meaning: String((w && w.meaning) || '').trim(),
        example: String((w && w.example) || '').trim(),
        exampleZh: String((w && w.exampleZh) || '').trim()
      };
    }).filter(function (w) { return w.word; });
  }

  /* 词汇量调查：返回 [{word, known, reason}] */
  async function checkVocabulary(subject, words) {
    if (!words || !words.length) throw new Error('词表是空的');
    var raw = await chat([
      { role: 'user', content: pVocabularyCheck(subject, words) }
    ], { temperature: 0.2, maxTokens: 4000, timeout: 240000 });
    var j = extractJSON(raw);
    var arr = Array.isArray(j && j.results) ? j.results : (Array.isArray(j) ? j : []);
    return arr.map(function (r) {
      return {
        word: String((r && r.word) || '').trim(),
        known: !!(r && r.known),
        reason: String((r && r.reason) || '').trim()
      };
    }).filter(function (r) { return r.word; });
  }

  /* 连通性自检 */
  async function testConnection() {
    var r = await chat([{ role: 'user', content: '回复两个字：正常' }], { temperature: 0, maxTokens: 16, timeout: 30000 });
    return String(r).trim();
  }

  return {
    setCfg: setCfg,
    cfg: cfg,
    isConfigured: isConfigured,
    canVision: canVision,
    chat: chat,
    vision: vision,
    generatePractice: generatePractice,
    generateQuiz: generateQuiz,
    generateQuizFromPassage: generateQuizFromPassage,
    generateWordEntries: generateWordEntries,
    checkVocabulary: checkVocabulary,
    explainPoint: explainPoint,
    explainMarked: explainMarked,
    extractJSON: extractJSON,
    testConnection: testConnection,
    prompts: {
      explainSelection: pExplainSelection,
      explainWhole: pExplainWhole,
      ocr: pOCR,
      practice: pPractice,
      quiz: pQuiz,
      quizFromPassage: pQuizFromPassage,
      wordEntries: pWordEntries,
      vocabularyCheck: pVocabularyCheck,
      explainPoint: pExplainPoint,
      explainMarked: pExplainMarked
    }
  };
})();
