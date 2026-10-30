/* Service Worker：离线可用（安装到主屏后没网也能打开） */
var CACHE = 'kadian-v3';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/config.js',
  './assets/js/db.js',
  './assets/js/srs.js',
  './assets/js/mastery.js',
  './assets/js/util.js',
  './assets/js/marks.js',
  './assets/js/input.js',
  './assets/js/ai.js',
  './assets/js/store.js',
  './assets/js/ui.js',
  './assets/js/select.js',
  './assets/js/views/home.js',
  './assets/js/views/quiz.js',
  './assets/js/views/library.js',
  './assets/js/views/review.js',
  './assets/js/views/practice.js',
  './assets/js/views/settings.js',
  './assets/js/main.js',
  './assets/vendor/katex/katex.min.css',
  './assets/vendor/katex/katex.min.js',
  './assets/vendor/katex/auto-render.min.js',
  /* 公式字体（woff2）：保证离线安装后数学公式仍能正常渲染 */
  './assets/vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  './assets/vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  './assets/vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  './assets/vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  './assets/vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  './assets/vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  './assets/vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  './assets/vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  './assets/vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  './assets/vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  './assets/vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  './assets/vendor/katex/fonts/KaTeX_Size4-Regular.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () { /* 单个资源失败不阻断安装 */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 模型 API 等外部请求不拦截

  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return hit || caches.match('./index.html');
      });
      return hit || net;
    })
  );
});
