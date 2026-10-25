/* 拍照问：图片整题讲解 / OCR 转文本后划选精讲 / 粘贴文本精讲 */
window.Views = window.Views || {};

window.Views.ask = {
  state: { mode: 'photo', subject: 'math', image: null, text: '', result: null, source: '' },

  render: async function (root, params) {
    var s = this.state;
    if (params && params.mode) s.mode = params.mode;
    if (params && params.subject) s.subject = params.subject;

    if (!AI.isConfigured()) {
      root.innerHTML = '<div class="page-head"><h1 class="page-title">拍照问</h1></div>' +
        '<div class="notice notice-warn"><div class="notice-title">还没配置 AI 服务</div>' +
        '<p class="notice-text">讲解需要一个大模型。到「设置」填 base_url、API Key 和模型名即可，配置只存在你本机。</p>' +
        '<button class="btn btn-primary" data-act="tosettings">去配置</button></div>';
      root.querySelector('[data-act="tosettings"]').addEventListener('click', function () { location.hash = '#/settings'; });
      return;
    }

    var h = [];
    h.push('<div class="page-head"><h1 class="page-title">拍照问</h1>');
    h.push('<div class="seg" id="modeSeg">');
    h.push('<button class="seg-btn' + (s.mode === 'photo' ? ' on' : '') + '" data-mode="photo">图片</button>');
    h.push('<button class="seg-btn' + (s.mode === 'text' ? ' on' : '') + '" data-mode="text">文本</button>');
    h.push('</div></div>');

    h.push('<div class="subject-pick" id="subjPick">');
    CONFIG.SUBJECTS.forEach(function (sub) {
      h.push('<button class="chip' + (s.subject === sub.id ? ' on' : '') + '" data-subj="' + sub.id + '" style="--c:' + sub.color + '">' + sub.name + '</button>');
    });
    h.push('</div>');

    if (s.mode === 'photo') {
      h.push(this.photoHTML());
    } else {
      h.push(this.textHTML());
    }
    if (s.result) h.push(this.resultHTML());

    root.innerHTML = h.join('');
    this.bind(root);
  },

  photoHTML: function () {
    var s = this.state;
    var h = [];
    if (!s.image) {
      h.push('<div class="upload-zone" id="uploadZone">');
      h.push('<div class="upload-icon"></div>');
      h.push('<p class="upload-title">拍下纸质题目，或从相册选图</p>');
      h.push('<p class="upload-sub">图片只会发给你配置的大模型，不经过任何第三方服务器</p>');
      h.push('<div class="upload-btns">');
      h.push('<button class="btn btn-primary" data-act="camera">拍照</button>');
      h.push('<button class="btn btn-ghost" data-act="pickfile">从相册选</button>');
      h.push('</div></div>');
    } else {
      h.push('<div class="img-preview"><img src="' + s.image.dataUrl + '" alt="题目照片" />');
      h.push('<div class="img-meta">' + s.image.width + '×' + s.image.height + ' · ' + Util.fmtBytes(s.image.bytes) + '</div></div>');
      h.push('<div class="act-grid">');
      h.push('<button class="act-btn" data-act="whole"><span class="act-t">整题讲解</span><span class="act-s">模型直接看图，标出最容易卡的点</span></button>');
      h.push('<button class="act-btn" data-act="totxt"><span class="act-t">转成文本再问</span><span class="act-s">识别成文字后，可划选某一句精讲</span></button>');
      h.push('<button class="act-btn" data-act="replace"><span class="act-t">换一张</span><span class="act-s">重新拍照或选图</span></button>');
      h.push('</div>');
    }
    return h.join('');
  },

  textHTML: function () {
    var s = this.state;
    var h = [];
    if (!s.text) {
      h.push('<div class="upload-zone" id="uploadZone">');
      h.push('<div class="upload-icon upload-icon-text"></div>');
      h.push('<p class="upload-title">粘贴一段原文</p>');
      h.push('<p class="upload-sub">课文、真题阅读、句子都行。粘贴后划选任意一句即可提问</p>');
      h.push('<div class="upload-btns"><button class="btn btn-primary" data-act="paste">粘贴文本</button></div></div>');
    } else {
      h.push('<div class="text-panel" id="textPanel">');
      h.push('<div class="text-head"><span>划选任意一句提问</span><button class="btn btn-ghost btn-xs" data-act="replaceText">换一段</button></div>');
      h.push('<div class="text-body" id="textBody">' + Util.esc(s.text) + '</div></div>');
    }
    return h.join('');
  },

  resultHTML: function () {
    var s = this.state;
    var h = [];
    h.push('<div class="section"><div class="section-head"><h2>讲解</h2><span class="muted">' + (s.result.kind === 'whole' ? '整题' : '精讲') + '</span></div>');
    h.push('<div class="answer-card" id="answerCard">' + Util.esc(s.result.content) + '</div>');
    h.push('<div class="row-btns">');
    h.push('<button class="btn btn-primary" data-act="save">存为卡点</button>');
    h.push('<button class="btn btn-ghost" data-act="again">换种讲法</button>');
    h.push('<button class="btn btn-ghost" data-act="copy">复制</button>');
    h.push('</div></div>');
    return h.join('');
  },

  bind: function (root) {
    var self = this;
    var s = this.state;

    root.querySelectorAll('#modeSeg .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        s.mode = b.getAttribute('data-mode');
        s.result = null;
        self.render(root);
      });
    });
    root.querySelectorAll('#subjPick .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        s.subject = b.getAttribute('data-subj');
        root.querySelectorAll('#subjPick .chip').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
    });

    /* 文件选择器只创建一次，避免每次渲染泄漏 DOM 与监听 */
    if (!s.camInput) {
      var ci = document.createElement('input');
      ci.type = 'file';
      ci.accept = 'image/*';
      ci.setAttribute('capture', 'environment');
      var fi = document.createElement('input');
      fi.type = 'file';
      fi.accept = 'image/*';
      ci.addEventListener('change', function () { if (ci.files[0]) self.loadImage(ci.files[0], root); ci.value = ''; });
      fi.addEventListener('change', function () { if (fi.files[0]) self.loadImage(fi.files[0], root); fi.value = ''; });
      document.body.appendChild(ci);
      document.body.appendChild(fi);
      s.camInput = ci;
      s.fileInput = fi;
    }
    var camInput = s.camInput;
    var fileInput = s.fileInput;

    root.addEventListener('click', function (e) {
      var node = e.target.closest('[data-act]');
      if (!node) return;
      var act = node.getAttribute('data-act');
      if (act === 'camera') camInput.click();
      else if (act === 'pickfile') fileInput.click();
      else if (act === 'replace') { s.image = null; s.result = null; self.render(root); }
      else if (act === 'replaceText') { s.text = ''; s.result = null; self.render(root); }
      else if (act === 'paste') self.pasteText(root);
      else if (act === 'whole') self.askWhole(root);
      else if (act === 'totxt') self.toText(root);
      else if (act === 'save') self.saveAsCard(root);
      else if (act === 'again') self.askAgain(root);
      else if (act === 'copy') {
        Util.copyText(s.result.content).then(function () { UI.toast('已复制', 'info'); })
          .catch(function () { UI.toast('复制失败，请长按选择文本', 'error'); });
      }
    });

    if (s.text) {
      var body = root.querySelector('#textBody');
      if (body) {
        Select.enable(body, function (sel, ctx) { self.askSelection(sel, ctx, root); }, '提问');
      }
    }
    if (s.result) Util.renderInto(root.querySelector('#answerCard'), s.result.content);
  },

  loadImage: async function (file, root) {
    var self = this;
    var l = UI.loading('正在处理图片…');
    try {
      var img = await Util.compressImage(file, 1600, 0.82);
      l.close();
      self.state.image = img;
      self.state.result = null;
      self.render(root);
    } catch (err) {
      l.close();
      UI.toast(err.message || '图片处理失败', 'error');
    }
  },

  pasteText: async function (root) {
    var self = this;
    var text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      var res = await UI.formDialog({
        title: '粘贴原文',
        fields: [{ key: 'text', label: '原文', type: 'textarea', rows: 8, required: true }],
        submitText: '确定'
      });
      if (!res) return;
      text = res.text;
    }
    if (!text || !text.trim()) { UI.toast('剪贴板是空的', 'error'); return; }
    self.state.text = text;
    self.state.result = null;
    self.render(root);
  },

  askWhole: async function (root) {
    var self = this;
    var s = this.state;
    if (!AI.canVision()) {
      UI.toast('当前没有配置视觉模型。DeepSeek 等纯文本模型无法读图，请到设置里填一个视觉模型名。', 'error');
      return;
    }
    var l = UI.loading('模型正在看图并讲解…');
    try {
      var content = await AI.vision(AI.prompts.explainWhole(s.subject), s.image.dataUrl, { timeout: 240000 });
      l.close();
      s.result = { kind: 'whole', content: content, sel: '', ctx: '' };
      self.render(root);
    } catch (err) {
      l.close();
      UI.toast(err.message || '讲解失败', 'error');
    }
  },

  toText: async function (root) {
    var self = this;
    var s = this.state;
    var st = await Store.getSettings();
    var l = UI.loading('正在识别文字…');
    try {
      var text = await OCR.run(s.image.dataUrl, st.ocr.engine, {
        langs: st.ocr.langs,
        onProgress: function (p) { l.update('本地识别中 ' + p + '%'); }
      });
      l.close();
      if (!text || !text.trim()) { UI.toast('没有识别到文字，可改用「整题讲解」', 'error'); return; }
      s.text = text;
      s.result = null;
      self.render(root);
      UI.toast('识别完成，划选任意一句提问', 'info');
    } catch (err) {
      l.close();
      UI.toast(err.message || '识别失败', 'error');
    }
  },

  askSelection: async function (sel, ctx, root) {
    var self = this;
    var s = this.state;
    var res = await UI.formDialog({
      title: '就这一句提问',
      fields: [{
        key: 'q', label: '你想问什么（可留空）', type: 'textarea', rows: 2,
        placeholder: '例：这里的「〜很简单」为什么用过去形？我不明白这里的用法'
      }],
      submitText: '讲解',
      values: { q: '' }
    });
    if (res === null) return;
    var l = UI.loading('正在讲解…');
    try {
      var content = await AI.chat([
        { role: 'user', content: AI.prompts.explainSelection(s.subject, sel, ctx, res.q) }
      ], { temperature: 0.3, maxTokens: 1600 });
      l.close();
      s.result = { kind: 'selection', content: content, sel: sel, ctx: ctx, question: res.q };
      self.render(root);
      setTimeout(function () {
        var card = root.querySelector('#answerCard');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } catch (err) {
      l.close();
      UI.toast(err.message || '讲解失败', 'error');
    }
  },

  askAgain: async function (root) {
    var self = this;
    var s = this.state;
    if (!s.result) return;
    var l = UI.loading('换一种讲法…');
    try {
      var content;
      if (s.result.kind === 'whole') {
        content = await AI.vision(AI.prompts.explainWhole(s.subject) + '\n\n注意：请换一种讲法，侧重常见误区和直觉理解。', s.image.dataUrl, { temperature: 0.5 });
      } else {
        content = await AI.chat([
          { role: 'user', content: AI.prompts.explainSelection(s.subject, s.result.sel, s.result.ctx, s.result.question) + '\n\n请换一种讲法：更简短、更口语化，并给一个同类例句。' }
        ], { temperature: 0.6, maxTokens: 1200 });
      }
      l.close();
      s.result.content = content;
      self.render(root);
    } catch (err) {
      l.close();
      UI.toast(err.message || '失败', 'error');
    }
  },

  saveAsCard: async function (root) {
    var self = this;
    var s = this.state;
    var topics = await existingTopics(s.subject);
    var isSel = s.result.kind === 'selection';
    var res = await UI.formDialog({
      title: '存为卡点',
      fields: [
        { key: 'topic', label: '知识点', type: 'text', required: true, placeholder: '如：电磁感应中的楞次定律', datalist: 'topicList', hint: '相同知识点的卡点会聚合在一起，掌握度按知识点统计' },
        { key: 'question', label: '卡在哪', type: 'textarea', rows: 2, required: true },
        { key: 'context', label: '语境 / 题目片段', type: 'textarea', rows: 3 },
        { key: 'answer', label: '讲解 / 答案', type: 'textarea', rows: 4 },
        { key: 'source', label: '来源', type: 'text', placeholder: '如：2024全国甲卷·物理·第12题' }
      ],
      values: {
        question: isSel ? (s.result.question || s.result.sel.slice(0, 60)) : '',
        context: isSel ? s.result.sel : (s.result.ctx || ''),
        answer: s.result.content
      },
      datalistId: 'topicList',
      datalistHTML: topics.map(function (t) { return '<option value="' + Util.esc(t) + '">'; }).join(''),
      submitText: '存入卡点库'
    });
    if (!res) return;
    try {
      var card = {
        subject: s.subject,
        topic: res.topic,
        question: res.question,
        context: res.context,
        answer: res.answer,
        source: res.source,
        hasImage: !!s.image
      };
      if (s.image) {
        var img = await Store.saveImage(s.image.dataUrl, { kind: 'photo', bytes: s.image.bytes, width: s.image.width, height: s.image.height });
        card.imageId = img.id;
      }
      await Store.saveStuck(card);
      UI.toast('已存入卡点库，明天开始按遗忘曲线复习', 'info');
      s.result = null;
      self.render(root);
    } catch (err) {
      UI.toast(err.message || '保存失败', 'error');
    }
  }
};

async function existingTopics(subject) {
  var cards = await Store.listStuck({ subject: subject });
  var set = {};
  cards.forEach(function (c) { if (c.topic) set[c.topic] = 1; });
  return Object.keys(set).sort();
}
