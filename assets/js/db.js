/* 数据层：IndexedDB 优先，localStorage 自动降级
   存储：stuckPoints 卡点 / passages 题库语篇 / images 图片 / problems AI练习题
        reviews 复习记录 / mastery 知识点掌握度 / explains 精讲结果缓存 / settings 配置
   所有数据只存在本机（手机或电脑），不上传服务器。 */
var DB = (function () {
  var DB_NAME = 'kadian';
  var DB_VER = 2;
  var STORES = ['stuckPoints', 'passages', 'images', 'problems', 'reviews', 'mastery', 'explains', 'settings'];
  var db = null;
  var mode = 'idb';

  function openIDB() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in self)) return reject(new Error('IndexedDB unavailable'));
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        STORES.forEach(function (s) {
          if (d.objectStoreNames.contains(s)) return;
          var os = d.createObjectStore(s, { keyPath: 'id' });
          if (s === 'stuckPoints') {
            os.createIndex('subject', 'subject');
            os.createIndex('topic', 'topic');
            os.createIndex('due', 'due');
          } else if (s === 'problems') {
            os.createIndex('subject', 'subject');
            os.createIndex('status', 'status');
          } else if (s === 'reviews') {
            os.createIndex('spId', 'spId');
          }
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function lsKey(store) { return 'kadian::' + store; }

  function lsAll(store) {
    try { return JSON.parse(localStorage.getItem(lsKey(store)) || '[]'); }
    catch (e) { return []; }
  }
  function lsWrite(store, arr) {
    try { localStorage.setItem(lsKey(store), JSON.stringify(arr)); return true; }
    catch (e) { console.warn('localStorage write failed', e); return false; }
  }

  function tx(store, writable) {
    return db.transaction(store, writable ? 'readwrite' : 'readonly').objectStore(store);
  }

  function req2promise(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  var API = {
    STORES: STORES,
    get mode() { return mode; },

    init: function () {
      return openIDB().then(function (d) {
        db = d; mode = 'idb'; return 'idb';
      }).catch(function (err) {
        console.warn('fallback to localStorage:', err && err.message);
        mode = 'ls'; return 'ls';
      });
    },

    put: function (store, obj) {
      if (!obj.id) obj.id = uid();
      if (mode === 'idb') {
        return req2promise(tx(store, true).put(obj)).then(function () { return obj; });
      }
      var arr = lsAll(store);
      var i = arr.findIndex(function (x) { return x.id === obj.id; });
      if (i >= 0) arr[i] = obj; else arr.push(obj);
      lsWrite(store, arr);
      return Promise.resolve(obj);
    },

    bulkPut: function (store, list) {
      if (mode === 'idb') {
        var t = db.transaction(store, 'readwrite');
        var os = t.objectStore(store);
        list.forEach(function (o) { if (!o.id) o.id = uid(); os.put(o); });
        return new Promise(function (resolve, reject) {
          t.oncomplete = function () { resolve(list); };
          t.onerror = function () { reject(t.error); };
        });
      }
      var arr = lsAll(store);
      list.forEach(function (o) {
        if (!o.id) o.id = uid();
        var i = arr.findIndex(function (x) { return x.id === o.id; });
        if (i >= 0) arr[i] = o; else arr.push(o);
      });
      lsWrite(store, arr);
      return Promise.resolve(list);
    },

    get: function (store, id) {
      if (mode === 'idb') return req2promise(tx(store, false).get(id));
      return Promise.resolve(lsAll(store).find(function (x) { return x.id === id; }) || null);
    },

    all: function (store) {
      if (mode === 'idb') return req2promise(tx(store, false).getAll());
      return Promise.resolve(lsAll(store));
    },

    del: function (store, id) {
      if (mode === 'idb') {
        return req2promise(tx(store, true).delete(id)).then(function () { return true; });
      }
      var arr = lsAll(store).filter(function (x) { return x.id !== id; });
      lsWrite(store, arr);
      return Promise.resolve(true);
    },

    clear: function (store) {
      if (mode === 'idb') return req2promise(tx(store, true).clear());
      lsWrite(store, []);
      return Promise.resolve(true);
    },

    /* 设置是单例文档，key 固定 'app' */
    getSettings: function () {
      return API.get('settings', 'app').then(function (s) { return s || { id: 'app' }; });
    },
    saveSettings: function (s) {
      s.id = 'app';
      return API.put('settings', s);
    }
  };

  return API;
})();

function uid() {
  if (self.crypto && self.crypto.randomUUID) return self.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function nowISO() { return new Date().toISOString(); }

function todayStr(d) {
  d = d || new Date();
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function addDays(dateStr, n) {
  var d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

function daysBetween(a, b) {
  var d1 = new Date(a + 'T12:00:00'), d2 = new Date(b + 'T12:00:00');
  return Math.round((d2 - d1) / 86400000);
}
