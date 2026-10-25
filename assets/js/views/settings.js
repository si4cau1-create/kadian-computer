/* 设置：AI 服务配置、OCR 引擎、数据备份与隐私说明 */
window.Views = window.Views || {};

window.Views.settings = {
  render: async function (root) {
    var self = this;
    var s = await Store.getSettings();
    var ai = s.ai || {};
    var images = await Store.listImages();
    var imgBytes = images.reduce(function (a, b) { return a + (b.bytes || 0); }, 0);

    var h = [];
    h.push('<div class="page-head"><h1 class="page-title">设置</h1></div>');

    /* --- AI --- */
    h.push('<div class="section"><div class="section-head"><h2>AI 服务</h2></div>');
    h.push('<div class="form">');
    h.push('<div class="form-row"><label class="form-label">服务商预设</label><select class="input" id="presetSel">');
    h.push('<option value="">自定义</option>');
    CONFIG.AI_PRESETS.forEach(function (p) {
      h.push('<option value="' + p.id + '"' + (ai.presetId === p.id ? ' selected' : '') + '>' + Util.esc(p.name) + '</option>');
    });
    h.push('</select><div class="form-hint" id="presetNote"></div></div>');

    h.push('<div class="form-row"><label class="form-label">base_url</label><input class="input" id="baseUrl" value="' + Util.escapeAttr(ai.baseUrl || '') + '" placeholder="https://api.deepseek.com/v1" /><div class="form-hint">OpenAI 兼容接口地址，末尾带 /v1</div></div>');
    h.push('<div class="form-row"><label class="form-label">API Key</label><input class="input" id="apiKey" type="password" value="' + Util.escapeAttr(ai.apiKey || '') + '" placeholder="sk-..." /><div class="form-hint">只保存在这台设备的浏览器里，不会上传到任何服务器</div></div>');
    h.push('<div class="form-row"><label class="form-label">文本模型</label><input class="input" id="textModel" value="' + Util.escapeAttr(ai.textModel || '') + '" placeholder="deepseek-chat" /></div>');
    h.push('<div class="form-row"><label class="form-label">视觉模型（读图用）</label><input class="input" id="visionModel" value="' + Util.escapeAttr(ai.visionModel || '') + '" placeholder="qwen-vl-plus" /><div class="form-hint">DeepSeek 不支持读图，拍照功能需要单独配一个视觉模型</div></div>');
    h.push('<div class="form-row"><label class="form-label">温度</label><input class="input" id="temperature" type="number" step="0.1" min="0" max="1" value="' + (ai.temperature != null ? ai.temperature : 0.3) + '" /></div>');
    h.push('</div>');
    h.push('<div class="row-btns"><button class="btn btn-primary" data-act="saveai">保存配置</button><button class="btn btn-ghost" data-act="test">测试连接</button></div>');
    h.push('</div>');

    /* --- 跨域提示 --- */
    h.push('<div class="notice notice-info"><div class="notice-title">手机直连被浏览器拦截？</div>' +
      '<p class="notice-text">部分服务商不允许浏览器直接调用（会报 CORS 错误）。这时在电脑上运行 <code>tools/proxy.py</code>，' +
      '手机把 base_url 改成 <code>http://电脑IP:8899/v1</code> 即可，图片和 Key 都只走你自己的局域网。</p></div>');

    /* --- OCR --- */
    h.push('<div class="section"><div class="section-head"><h2>识别引擎</h2></div>');
    h.push('<div class="form"><div class="form-row"><label class="form-label">拍照转文字用</label><select class="input" id="ocrEngine">');
    h.push('<option value="vision"' + (s.ocr.engine === 'vision' ? ' selected' : '') + '>云端视觉模型（推荐，公式与日文更准）</option>');
    h.push('<option value="tesseract"' + (s.ocr.engine === 'tesseract' ? ' selected' : '') + '>本地离线识别（内置中/英/日，无需联网）</option>');
    h.push('</select></div>');
    h.push('<div class="form-row"><label class="form-label">本地识别语言包</label><input class="input" id="ocrLangs" value="' + Util.escapeAttr(s.ocr.langs || 'chi_sim+eng+jpn') + '" placeholder="chi_sim+eng+jpn" /><div class="form-hint">chi_sim 中文 / eng 英文 / jpn 日文已内置；填写其他语言名时将联网下载对应语言包</div></div>');
    h.push('</div><div class="row-btns"><button class="btn btn-ghost" data-act="saveocr">保存</button></div></div>');

    /* --- 学习 --- */
    h.push('<div class="section"><div class="section-head"><h2>学习</h2></div>');
    h.push('<div class="form"><div class="form-row"><label class="form-label">默认学科</label><select class="input" id="defSubject">');
    CONFIG.SUBJECTS.forEach(function (sub) {
      h.push('<option value="' + sub.id + '"' + (s.study.subject === sub.id ? ' selected' : '') + '>' + sub.name + '</option>');
    });
    h.push('</select></div>');
    h.push('<div class="form-row"><label class="form-label">每日自动出题数量</label><input class="input" id="dailyCount" type="number" min="0" max="10" value="' + (s.study.dailyPracticeCount || 0) + '" /><div class="form-hint">0 表示只在你点击时出题（避免无谓消耗额度）</div></div>');
    h.push('</div><div class="row-btns"><button class="btn btn-ghost" data-act="savestudy">保存</button></div></div>');

    /* --- 数据 --- */
    h.push('<div class="section"><div class="section-head"><h2>数据</h2></div>');
    h.push('<div class="data-line"><span>存储方式</span><b>' + (DB.mode === 'idb' ? 'IndexedDB（可存图片）' : 'localStorage（降级模式，图片可能存不下）') + '</b></div>');
    h.push('<div class="data-line"><span>图片占用</span><b>' + images.length + ' 张 · ' + Util.fmtBytes(imgBytes) + '</b></div>');
    h.push('<div class="data-line"><span>数据位置</span><b>仅本机（' + (DB.mode === 'idb' ? 'IndexedDB' : 'localStorage') + '），不上传</b></div>');
    h.push('<div class="row-btns">');
    h.push('<button class="btn btn-ghost" data-act="export">导出备份</button>');
    h.push('<button class="btn btn-ghost" data-act="import">导入备份</button>');
    h.push('<button class="btn btn-danger" data-act="wipe">清空全部数据</button>');
    h.push('</div>');
    h.push('<p class="form-hint">换手机或清理浏览器数据前，记得先导出备份。</p>');
    h.push('</div>');

    /* --- 关于 --- */
    h.push('<div class="section"><div class="section-head"><h2>关于</h2></div>');
    h.push('<div class="about">');
    h.push('<p><b>卡点</b>：为「语境滚动 + 即时精讲」设计的本地学习工具。</p>');
    h.push('<p>核心循环：沉浸材料 → 撞上卡点 → 即时讲解 → 回填验证 → 间隔复习 → AI 出题练应用。</p>');
    h.push('<p class="muted">所有数据只存在本机；只有调用大模型时才会联网，图片直接发给你配置的服务商。</p>');
    h.push('</div></div>');

    root.innerHTML = h.join('');

    /* 预设联动 */
    var presetSel = root.querySelector('#presetSel');
    var note = root.querySelector('#presetNote');
    function fillPreset(id, apply) {
      var p = CONFIG.preset(id);
      if (!p) { note.textContent = ''; return; }
      note.textContent = p.note + (p.doc ? '　文档：' + p.doc : '');
      if (apply) {
        root.querySelector('#baseUrl').value = p.baseUrl;
        root.querySelector('#textModel').value = p.textModel;
        root.querySelector('#visionModel').value = p.visionModel;
      }
    }
    fillPreset(ai.presetId, false);
    presetSel.addEventListener('change', function () { fillPreset(presetSel.value, true); });

    root.addEventListener('click', function (e) {
      var node = e.target.closest('[data-act]');
      if (!node) return;
      var act = node.getAttribute('data-act');
      if (act === 'saveai') self.saveAI(root, presetSel.value);
      else if (act === 'test') self.testConn(root);
      else if (act === 'saveocr') self.saveOCR(root);
      else if (act === 'savestudy') self.saveStudy(root);
      else if (act === 'export') self.exportData();
      else if (act === 'import') self.importData(root);
      else if (act === 'wipe') self.wipe(root);
    });
  },

  saveAI: async function (root, presetId) {
    var ai = {
      presetId: presetId || '',
      baseUrl: root.querySelector('#baseUrl').value.trim(),
      apiKey: root.querySelector('#apiKey').value.trim(),
      textModel: root.querySelector('#textModel').value.trim(),
      visionModel: root.querySelector('#visionModel').value.trim(),
      temperature: Number(root.querySelector('#temperature').value) || 0.3,
      maxTokens: 2000
    };
    await Store.saveSettings({ ai: ai });
    UI.toast('已保存（只存在本机）', 'info');
  },

  testConn: async function (root) {
    var l = UI.loading('正在测试连接…');
    try {
      await this.saveAI(root, root.querySelector('#presetSel').value);
      var r = await AI.testConnection();
      l.close();
      UI.toast('连接正常：' + r.slice(0, 20), 'info');
    } catch (err) {
      l.close();
      UI.toast(err.message || '连接失败', 'error');
    }
  },

  saveOCR: async function (root) {
    await Store.saveSettings({
      ocr: {
        engine: root.querySelector('#ocrEngine').value,
        langs: root.querySelector('#ocrLangs').value.trim() || 'chi_sim+eng+jpn'
      }
    });
    UI.toast('已保存', 'info');
  },

  saveStudy: async function (root) {
    await Store.saveSettings({
      study: {
        subject: root.querySelector('#defSubject').value,
        dailyPracticeCount: Number(root.querySelector('#dailyCount').value) || 0
      }
    });
    UI.toast('已保存', 'info');
  },

  exportData: async function () {
    var data = await Store.exportAll();
    var name = 'kadian-backup-' + todayStr() + '.json';
    Util.download(name, JSON.stringify(data), 'application/json');
    UI.toast('已导出 ' + name, 'info');
  },

  importData: async function (root) {
    var self = this;
    /* APK 内：经系统文件选择器读取，base64 分片回传 JS */
    var ka = window.KadianAndroid;
    if (ka && typeof ka.readImport === 'function') {
      window.__kadianImportChunks = [];
      window.__kadianImport = function (chunk) { window.__kadianImportChunks.push(chunk); };
      window.__kadianImportDone = async function () {
        var b64 = window.__kadianImportChunks.join('');
        window.__kadianImportChunks = [];
        var text;
        try {
          var bin = atob(b64);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          text = new TextDecoder('utf-8').decode(arr);
        } catch (e) {
          UI.toast('导入失败：备份文件解析错误', 'error');
          return;
        }
        await self.doImport(text);
      };
      ka.readImport();
      return;
    }
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', function () {
      var f = input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = async function () {
        try {
          await self.doImport(reader.result);
        } catch (err) {
          UI.toast('导入失败：' + (err.message || '文件格式不对'), 'error');
        }
      };
      reader.onerror = function () { UI.toast('导入失败：无法读取文件', 'error'); };
      reader.readAsText(f);
    });
    input.click();
  },

  doImport: async function (text) {
    var data = JSON.parse(text);
    var cards = (data.stores && data.stores.stuckPoints) || [];
    var ok = await UI.confirmDialog(
      '备份含 ' + cards.length + ' 条卡点、' + (((data.stores || {}).problems) || []).length + ' 道题。\n点「确定」合并导入（保留现有数据），点「取消」不导入。',
      '合并导入');
    if (!ok) return;
    await Store.importAll(data, 'merge');
    UI.toast('导入完成', 'info');
    setTimeout(function () { location.reload(); }, 600);
  },

  wipe: async function (root) {
    var ok = await UI.confirmDialog('将删除本机全部卡点、语篇、图片、题目与复习记录，且无法撤销。建议先导出备份。', '确认清空', true);
    if (!ok) return;
    for (var i = 0; i < DB.STORES.length; i++) {
      if (DB.STORES[i] === 'settings') continue;
      await DB.clear(DB.STORES[i]);
    }
    UI.toast('已清空', 'info');
    setTimeout(function () { location.reload(); }, 500);
  }
};
