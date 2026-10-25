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

  function extractJSON(text) {
    if (!text) throw new Error('模型没有返回内容');
    var t = String(text).trim();
    var m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) t = m[1].trim();
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
    extractJSON: extractJSON,
    testConnection: testConnection,
    prompts: {
      explainSelection: pExplainSelection,
      explainWhole: pExplainWhole,
      ocr: pOCR,
      practice: pPractice
    }
  };
})();
