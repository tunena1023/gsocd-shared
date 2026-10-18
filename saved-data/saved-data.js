/* ============================================================
   gsocd-shared / saved-data  (17/10/2026)
   Lo ultimo que se cargo, guardado en este navegador o telefono, para
   enseñarlo al instante al entrar o cuando no hay señal. Antes cada portal
   tenia lo suyo: Orders y Tech una copia casi igual (GS.offline en su
   shared.js, con localStorage, que se llena rapido) y Admin otra distinta.
   Dueño 17/10: "lo compartido va en gsocd-shared, sin copias".

   Guarda en IndexedDB (cabe mucho mas que localStorage); si el navegador
   no lo deja (modo privado viejo), en localStorage; si tampoco, no guarda
   y todo sigue igual. Nunca truena.

     GSSaved.save(key, data)            -> Promise<true si quedo guardado>
     GSSaved.read(key, maxAgeMs)        -> Promise<{ at, data } | null>
     GSSaved.clear(prefix)              -> Promise  (borra las llaves que empiezan asi)
     GSSaved.bar.show(text) / .hide()   -> aviso abajo ("Offline. Showing…")
============================================================ */
(function () {
  'use strict';
  if (window.GSSaved) return;

  var DB = 'gs-saved', ST = 'kv', dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (resolve) {
      try {
        var req = indexedDB.open(DB, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(ST); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbP;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      if (!d) return { noDb: true };
      return new Promise(function (resolve) {
        try {
          var t = d.transaction(ST, mode), r = fn(t.objectStore(ST));
          t.oncomplete = function () { resolve({ value: r && 'result' in r ? r.result : undefined }); };
          t.onerror = t.onabort = function () { dbP = null; resolve({ failed: true }); };
        } catch (e) { dbP = null; resolve({ failed: true }); }
      });
    });
  }
  var LS = 'gs_saved:';

  /* -> Promise<true si quedo guardado>. Si IndexedDB falla (Safari "connection to IndexedDB lost" en una app abierta
     varios dias, 18/10/2026), se guarda en localStorage y la proxima vez se vuelve a abrir IndexedDB (dbP = null). */
  function save(key, data) {
    var row = { at: Date.now(), data: data };
    return tx('readwrite', function (s) { return s.put(row, key); }).then(function (r) {
      if (!r.noDb && !r.failed) { try { localStorage.removeItem(LS + key); } catch (e) {} return true; }
      try { localStorage.setItem(LS + key, JSON.stringify(row)); return true; } catch (e) { return false; /* lleno: sin copia */ }
    });
  }
  /* La mas nueva de las dos (IndexedDB o la de respaldo en localStorage). */
  function read(key, maxAge) {
    return tx('readonly', function (s) { return s.get(key); }).then(function (r) {
      var v = r.value, l = null;
      try { l = JSON.parse(localStorage.getItem(LS + key) || 'null'); } catch (e) { l = null; }
      if (l && (!v || (l.at || 0) > (v.at || 0))) v = l;
      return v && v.data !== undefined && (!maxAge || Date.now() - v.at < maxAge) ? v : null;
    });
  }
  function clear(prefix) {
    prefix = String(prefix || '');
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(LS + prefix) === 0) localStorage.removeItem(k); }); } catch (e) {}
    return tx('readwrite', function (s) {
      return prefix ? s.delete(IDBKeyRange.bound(prefix, prefix + '￿')) : s.clear();
    }).then(function () {});
  }

  var bar = {
    show: function (text) {
      var el = document.getElementById('gs-offline-bar');
      if (!el) {
        if (!document.body) return;
        el = document.createElement('div');
        el.id = 'gs-offline-bar';
        el.setAttribute('role', 'status');
        el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#111;color:#fff;font:13px/1.35 system-ui,sans-serif;padding:10px 14px calc(10px + env(safe-area-inset-bottom));text-align:center';
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.style.display = '';
      document.body.style.paddingBottom = (el.offsetHeight + 8) + 'px';
    },
    hide: function () {
      var el = document.getElementById('gs-offline-bar');
      if (el && el.style.display !== 'none') { el.style.display = 'none'; document.body.style.paddingBottom = ''; }
    }
  };

  window.GSSaved = { save: save, read: read, clear: clear, bar: bar };
})();
