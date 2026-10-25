/* OCR 双引擎
   1) tesseract —— 本地 wasm 识别（默认）：中/英/日三语已内置在 assets/vendor/tesseract，
      完全离线可用。印刷体可用；手写、模糊拍照较差；数学公式不识别（要转写公式请用云端引擎）。
   2) vision  —— 云端视觉模型转写（备选）：公式、日文、图表描述更准，需配置视觉模型。 */
var OCR = (function () {
  var VENDOR = 'assets/vendor/tesseract';
  var TESS_JS = VENDOR + '/tesseract.min.js';
  var WORKER_JS = VENDOR + '/worker.min.js';
  var CORE_DIR = VENDOR + '/core';        /* 目录形式：库按 SIMD 支持自动选 -simd-lstm / -lstm 核心 */
  var TESSDATA_DIR = VENDOR + '/tessdata';
  var BUNDLED = ['chi_sim', 'eng', 'jpn']; /* 已内置语言包 */
  var scriptPromise = null;

  function loadScript(src) {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(true); };
      s.onerror = function () { scriptPromise = null; reject(new Error('识别库加载失败：内置资源缺失')); };
      document.head.appendChild(s);
    });
    return scriptPromise;
  }

  async function viaTesseract(dataUrl, langs, onProgress) {
    if (!window.Tesseract) await loadScript(TESS_JS);
    var want = String(langs || 'chi_sim+eng+jpn').split('+').map(function (s) { return s.trim(); }).filter(Boolean);
    var allBundled = want.length > 0 && want.every(function (l) { return BUNDLED.indexOf(l) >= 0; });
    try {
      var res = await Tesseract.recognize(dataUrl, want.join('+'), {
        workerPath: WORKER_JS,
        corePath: CORE_DIR,
        langPath: allBundled ? TESSDATA_DIR : undefined, /* 未内置语言：不传 langPath，走库默认 CDN 联网下载 */
        gzip: !allBundled,               /* 内置语言包为解压后的 .traineddata 原始格式（APK 打包兼容）；远程语言包是 .gz */
        cacheMethod: 'none',      /* 本地文件场景不写 IndexedDB 缓存 */
        workerBlobURL: false,     /* worker 走同源 URL，保证 SW/APK 资产加载器能拦截其子请求 */
        logger: function (m) {
          if (!onProgress || !m) return;
          if (m.status === 'recognizing text') {
            onProgress(50 + Math.round((m.progress || 0) * 50));
          } else if (m.status === 'loading tesseract core' || m.status === 'loading language traineddata' || m.status === 'initializing api') {
            onProgress(Math.round((m.progress || 0) * 50));
          }
        }
      });
      return (res && res.data && res.data.text) || '';
    } catch (e) {
      var msg = String((e && e.message) || e || '');
      if (/webassembly|wasm|compile error/i.test(msg)) {
        throw new Error('本地识别引擎加载失败：当前设备的 WebView 过旧，不支持 WebAssembly。请更新 WebView，或在设置里改用「云端视觉模型」。');
      }
      throw e;
    }
  }

  async function viaVision(dataUrl) {
    return await AI.vision(AI.prompts.ocr(), dataUrl, { temperature: 0, maxTokens: 3200, timeout: 240000 });
  }

  async function run(dataUrl, engine, opts) {
    opts = opts || {};
    if (engine === 'tesseract') return await viaTesseract(dataUrl, opts.langs, opts.onProgress);
    return await viaVision(dataUrl);
  }

  return { run: run, viaVision: viaVision, viaTesseract: viaTesseract };
})();
