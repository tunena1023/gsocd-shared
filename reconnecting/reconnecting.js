(function (root) {
  'use strict';
  if (!root || root.GSReconnecting) return;
  /* ================================================================
     GSReconnecting -- el aviso chiquito "Reconnecting…" arriba (CFO
     12/11/2026, hibrido de "guardar en SQL primero"). UNA vez para los 3
     portales: se carga con un <script> y ya (no hay que llamar nada).

     Cada respuesta de /api del portal trae X-GS-Data (lib/vercel-adapter):
       sharepoint -> la base (Neon) no contesto y salio de SharePoint: se
                     enseña el aviso.
       down       -> tampoco Microsoft: aviso, y si trae X-GS-Replay: 1 el
                     guardado se queda en este telefono o computadora (cola
                     local, como la de la camara) y la pantalla sigue como
                     guardado (202 { ok, success, queued }). Sale solo, en
                     orden, cuando alguno de los dos vuelva.
       sql        -> todo bien: el aviso se quita solo (si no queda nada en
                     la cola).
     Sin X-GS-Data (switch de SQL primero apagado) no hace nada.
     Nada de explicaciones en pantalla: solo "Reconnecting…".
     Lo que se manda despues lleva X-GS-Replayed (la hora en que se hizo); si el
     servidor no lo acepta, el servidor avisa (aviso de errores) y aqui se
     guarda en gs_reconnect_failed_v1.
     Prueba: node reconnecting/reconnecting.test.js
  ================================================================ */
  var QKEY = 'gs_reconnect_queue_v1', FKEY = 'gs_reconnect_failed_v1', LKEY = 'gs_reconnect_lock';
  var cfg = { waits: [5000, 10000, 20000, 30000, 60000], giveUpMs: 24 * 3600 * 1000, lockMs: 70000 };
  var orig = typeof root.fetch === 'function' ? root.fetch.bind(root) : null;
  var st = { data: '', shown: false, sending: false, timer: null, tries: 0, mem: [], memFail: [] };
  var TAB = Math.random().toString(36).slice(2) + Date.now().toString(36);

  function load(k) { try { var a = JSON.parse(root.localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return k === QKEY ? st.mem.slice() : st.memFail.slice(); } }
  function save(k, a) { if (k === QKEY) st.mem = a.slice(); else st.memFail = a.slice(); try { root.localStorage.setItem(k, JSON.stringify(a)); } catch (e) { /* solo memoria */ } }
  function queue() { return load(QKEY); }

  /* ---- el aviso ---- */
  var CSS = '#gs-reconnecting{position:fixed;top:calc(6px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:2147483000;' +
    'pointer-events:none;display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 8px;border-radius:999px;background:rgba(31,41,55,.86);' +
    'color:#fff;font:600 12px/16px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.01em;box-shadow:0 1px 4px rgba(0,0,0,.18);' +
    'white-space:nowrap;opacity:0;transition:opacity .2s}' +
    '#gs-reconnecting.on{opacity:1}' +
    '#gs-reconnecting i{width:7px;height:7px;border-radius:50%;background:#fbbf24;animation:gsrc 1.2s ease-in-out infinite}' +
    '@keyframes gsrc{0%,100%{opacity:1}50%{opacity:.3}}@media (prefers-reduced-motion:reduce){#gs-reconnecting i{animation:none}}' +
    /* Telefono: una pestañita pegada arriba a la derecha (14 px de alto), arriba del nombre y del menu, sin taparlos. */
    '@media (max-width:600px){#gs-reconnecting{left:auto;right:8px;transform:none;top:env(safe-area-inset-top,0px);padding:2px 8px 2px 7px;border-radius:0 0 8px 8px;' +
    'font-size:10px;line-height:10px;gap:4px}#gs-reconnecting i{width:6px;height:6px}}' +
    '@media print{#gs-reconnecting{display:none}}';
  function el() {
    var d = root.document;
    if (!d || !d.body) return null;
    var e = d.getElementById('gs-reconnecting');
    if (e) return e;
    if (!d.getElementById('gs-reconnecting-css')) {
      var s = d.createElement('style'); s.id = 'gs-reconnecting-css'; s.textContent = CSS; (d.head || d.body).appendChild(s);
    }
    e = d.createElement('div');
    e.id = 'gs-reconnecting';
    e.setAttribute('role', 'status');
    e.setAttribute('aria-live', 'polite');
    e.innerHTML = '<i aria-hidden="true"></i><span>Reconnecting…</span>';
    d.body.appendChild(e);
    return e;
  }
  function show() {
    st.shown = true;
    var e = el();
    if (!e) { if (root.document && root.document.addEventListener) root.document.addEventListener('DOMContentLoaded', function () { if (st.shown) show(); }); return; }
    e.style.display = '';
    e.className = 'on';
  }
  function hide() {
    st.shown = false;
    var e = root.document && root.document.getElementById ? root.document.getElementById('gs-reconnecting') : null;
    if (e) { e.className = ''; e.style.display = 'none'; }
  }
  function seen(kind) {
    if (!kind) return;
    st.data = kind;
    if (kind === 'sharepoint' || kind === 'down') show();
    else if (kind === 'sql' && !queue().length) hide();
  }

  /* ---- /api del mismo portal ---- */
  function urlOf(input) { return typeof input === 'string' ? input : (input && input.url) || String(input || ''); }
  function isApi(input) {
    try { var u = new URL(urlOf(input), root.location.href); return u.origin === root.location.origin && u.pathname.indexOf('/api/') === 0; }
    catch (e) { return /^\/api\//.test(urlOf(input)); }
  }
  function plainHeaders(h) {
    var o = {};
    if (!h) return o;
    if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach(function (v, k) { o[k] = v; });
    else if (Array.isArray(h)) h.forEach(function (p) { o[p[0]] = p[1]; });
    else Object.keys(h).forEach(function (k) { o[k] = h[k]; });
    /* El token se pide nuevo al mandar (el de ahora vence en una hora). */
    Object.keys(o).forEach(function (k) { if (/^authorization$/i.test(k)) delete o[k]; });
    return o;
  }
  function header(res, k) { try { return (res && res.headers && res.headers.get && res.headers.get(k)) || ''; } catch (e) { return ''; } }

  function newId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function patched(input, init) {
    return orig(input, init).then(function (res) {
      if (!isApi(input)) return res;
      var kind = header(res, 'X-GS-Data');
      seen(kind);
      if (kind !== 'down' || header(res, 'X-GS-Replay') !== '1') return res;
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var body = init ? init.body : undefined;
      if (method === 'GET' || (body !== undefined && body !== null && typeof body !== 'string')) return res;
      var q = queue();
      q.push({ id: newId(), url: urlOf(input), method: method, headers: plainHeaders(init && init.headers), body: body === undefined ? null : body, at: Date.now() });
      save(QKEY, q);
      show();
      later(cfg.waits[0]);
      var Resp = root.Response;
      var txt = JSON.stringify({ ok: true, success: true, queued: true });
      return Resp ? new Resp(txt, { status: 202, headers: { 'Content-Type': 'application/json', 'X-GS-Queued': '1' } })
        : { ok: true, status: 202, headers: { get: function (k) { return /queued/i.test(k) ? '1' : ''; } }, json: function () { return Promise.resolve(JSON.parse(txt)); }, text: function () { return Promise.resolve(txt); } };
    });
  }

  /* ---- mandar lo guardado, en orden ---- */
  function lock() {
    try {
      var l = JSON.parse(root.localStorage.getItem(LKEY) || 'null');
      if (l && l.tab !== TAB && Date.now() - l.at < cfg.lockMs) return false;
      root.localStorage.setItem(LKEY, JSON.stringify({ tab: TAB, at: Date.now() }));
    } catch (e) { /* sin localStorage: una pestaña */ }
    return true;
  }
  function unlock() { try { var l = JSON.parse(root.localStorage.getItem(LKEY) || 'null'); if (l && l.tab === TAB) root.localStorage.removeItem(LKEY); } catch (e) { /* nada */ } }
  function later(ms) {
    if (st.timer) return;
    st.timer = setTimeout(function () { st.timer = null; flush(); }, ms);
  }
  function retryable(res) { return !res || res.status === 0 || res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500; }
  function flush() {
    if (st.sending || !orig) return Promise.resolve();
    if (!queue().length) { if (st.data === 'sql') hide(); return Promise.resolve(); }
    if (!lock()) { later(cfg.waits[cfg.waits.length - 1]); return Promise.resolve(); }
    st.sending = true;
    var step = function () {
      var q = queue();
      if (!q.length) return Promise.resolve('empty');
      var e = q[0];
      var headers = Object.assign({}, e.headers || {}, { 'X-GS-Replayed': new Date(e.at).toISOString() });
      var tok = root.GSAdminAuth && typeof root.GSAdminAuth.token === 'function' ? Promise.resolve(root.GSAdminAuth.token()).catch(function () { return ''; }) : Promise.resolve('');
      return tok.then(function (t) {
        if (t) headers.Authorization = 'Bearer ' + t;
        return orig(e.url, { method: e.method, headers: headers, body: e.body === null ? undefined : e.body, credentials: 'same-origin' }).catch(function () { return null; });
      }).then(function (res) {
        seen(header(res, 'X-GS-Data'));
        if (retryable(res) && Date.now() - e.at < cfg.giveUpMs) return 'wait';
        save(QKEY, queue().filter(function (x) { return x.id !== e.id; }));
        if (!res || !res.ok) {
          var f = load(FKEY); f.push({ id: e.id, url: e.url, method: e.method, at: e.at, status: res ? res.status : 0, when: Date.now() }); save(FKEY, f.slice(-50));
          try { console.error('Reconnecting: a save kept on this device was not accepted (' + (res ? res.status : 'no answer') + ') ' + e.method + ' ' + e.url); } catch (x) { /* nada */ }
        }
        try { root.dispatchEvent(new root.CustomEvent('gs-reconnect-sent', { detail: { url: e.url, ok: !!(res && res.ok), status: res ? res.status : 0 } })); } catch (x) { /* sin CustomEvent */ }
        st.tries = 0;
        return step();
      });
    };
    return step().then(function (r) {
      st.sending = false; unlock();
      if (r === 'wait') { later(cfg.waits[Math.min(st.tries++, cfg.waits.length - 1)]); show(); }
      else if (st.data !== 'sharepoint' && st.data !== 'down') hide();
    }, function () { st.sending = false; unlock(); later(cfg.waits[cfg.waits.length - 1]); });
  }

  if (orig) root.fetch = patched;
  if (root.addEventListener) {
    root.addEventListener('online', function () { flush(); });
    root.addEventListener('focus', function () { if (queue().length) flush(); });
  }
  if (root.document && root.document.addEventListener) root.document.addEventListener('visibilitychange', function () { if (root.document.visibilityState === 'visible' && queue().length) flush(); });
  if (queue().length) { show(); later(1000); }

  root.GSReconnecting = { show: show, hide: hide, queue: queue, failed: function () { return load(FKEY); }, flush: flush, state: function () { return { data: st.data, shown: st.shown }; },
    _cfg: function (o) { Object.keys(o || {}).forEach(function (k) { cfg[k] = o[k]; }); } };
})(typeof window !== 'undefined' ? window : this);
