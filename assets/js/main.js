/* 路由与启动 */
(function () {
  var ROUTES = {
    '#/home': 'home',
    '#/quiz': 'quiz',
    '#/library': 'library',
    '#/review': 'review',
    '#/practice': 'practice',
    '#/words': 'words',
    '#/settings': 'settings'
  };

  var TABS = [
    { hash: '#/home', name: 'home', label: '今日', icon: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z' },
    { hash: '#/quiz', name: 'quiz', label: '做题', icon: 'M3 17.2V21h3.8L18.5 9.3l-3.8-3.8L3 17.2zM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.8-1.8z' },
    { hash: '#/library', name: 'library', label: '卡点', icon: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6' },
    { hash: '#/practice', name: 'practice', label: '练习', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 12l2.5 2.5 4.5-5' },
    { hash: '#/settings', name: 'settings', label: '设置', icon: 'M4 7h16M4 12h16M4 17h16M9 7a1.5 1.5 0 1 0 0-.01M15 12a1.5 1.5 0 1 0 0-.01M8 17a1.5 1.5 0 1 0 0-.01' }
  ];

  function tabHTML(t) {
    return '<button class="tab" data-hash="' + t.hash + '">' +
      '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + t.icon + '"/></svg>' +
      '<span class="tab-label">' + t.label + '</span></button>';
  }

  function setActiveTab(path) {
    document.querySelectorAll('#tabbar .tab').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-hash') === path);
    });
  }

  function parseHash() {
    var raw = location.hash || '#/home';
    var idx = raw.indexOf('?');
    var path = idx >= 0 ? raw.slice(0, idx) : raw;
    var qs = idx >= 0 ? raw.slice(idx + 1) : '';
    var params = {};
    qs.split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return { path: path, params: params };
  }

  var lastPath = null;
  async function route() {
    var r = parseHash();
    var name = ROUTES[r.path] || 'home';
    var view = document.getElementById('view');
    setActiveTab(r.path);
    view.innerHTML = '';
    window.scrollTo(0, 0);
    try {
      var v = window.Views[name] || window.Views.home;
      await v.render(view, r.params);
    } catch (e) {
      console.error(e);
      view.innerHTML = '<div class="notice notice-warn"><div class="notice-title">页面出错了</div><p class="notice-text">' +
        Util.esc(e && e.message ? e.message : String(e)) + '</p></div>';
    }
  }

  async function boot() {
    await DB.init();
    await Store.getSettings();

    /* 输入模式：键鼠 → 划词提问；触屏 → 点词即讲（插上键鼠自动切换） */
    InputMode.init();
    InputMode.onChange(function () {
      var q = window.Views && window.Views.quiz;
      if (q && q.refreshTip) q.refreshTip(document.getElementById('view'));
    });

    var bar = document.getElementById('tabbar');
    bar.innerHTML = TABS.map(tabHTML).join('');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('.tab');
      if (!b) return;
      var h = b.getAttribute('data-hash');
      if (h === location.hash) route();
      else location.hash = h;
    });

    window.addEventListener('hashchange', route);
    await route();

    /* APK 内由本地 assets 提供服务，无需 Service Worker；浏览器/PWA 正常注册 */
    var inApk = /KadianAndroid/.test(navigator.userAgent || '');
    if ('serviceWorker' in navigator && location.protocol !== 'file:' && !inApk) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW 注册失败', e); });
    }

    /* 首次使用引导 */
    var s = await Store.getSettings();
    if (!s.ai.baseUrl) {
      setTimeout(function () {
        UI.modal({
          title: '三步开始用',
          body: '<div class="onboard">' +
            '<div class="ob-step"><b>1</b><div>到「设置」填一个 base_url、API Key 和模型名。DeepSeek 最便宜，国内直连。</div></div>' +
            '<div class="ob-step"><b>2</b><div>到「做题」：AI 按日语/英语出题，语篇里遇到不会的，点开就是讲解——不用跳出去查。</div></div>' +
            '<div class="ob-step"><b>3</b><div>听懂了点「学会」，卡点自动入库，之后按遗忘曲线找你复习。</div></div>' +
            '<p class="muted small">所有数据只存在这台设备上。</p></div>',
          actions: [{ label: '去设置', kind: 'btn-primary', onClick: function () { location.hash = '#/settings'; } }]
        });
      }, 500);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
