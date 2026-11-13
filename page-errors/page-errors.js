/* ============================================================
   gsocd-shared / page-errors -- errores de JavaScript del telefono o la
   computadora al log de Vercel (CFO 12/11/2026: "igual que el que ya
   tiene Admin", para Tech). El usuario no ve nada (sin barra roja, a
   menos que la pagina pida bar: true). Lo mismo que el bloque de
   admin.html / page-errors.js de Admin, en una pieza para quien la use.

   Se carga lo mas arriba posible (antes que los demas scripts) para que
   tambien cuenten los errores de esos. Mientras no se llame init() solo
   guarda (maximo 20) y no manda nada: sin init es inofensiva.

     GSPageErrors.init({
       endpoint: 'https://admin.gsocd.com/api/client-error',  // a donde va
       portal: 'Tech',                // sale en el log
       who: function () { return 'Ana Lopez (T-12)'; },        // quien, al momento de mandar
       bar: false,                    // barra roja (solo pruebas)
       repeatHours: 6,                // el mismo error, una vez cada 6 h por telefono
       maxPerHour: 20                 // tope por telefono (cuida el costo)
     });
     GSPageErrors.report('queue', 'Video upload failed: ...');   // errores que la pagina ya atrapo

   Que manda (texto plano, sin preflight; sendBeacon si se puede):
     { kind, message, file, line, col, stack, screen, portal, who, ua }
   Sin red, sin almacenamiento o sin endpoint: no truena.
   Prueba: node page-errors/page-errors.test.js
============================================================ */
(function (root) {
  'use strict';
  if (root.GSPageErrors) return;

  var cfg = null;
  var early = [];            /* lo que paso antes de init() */
  var sentPage = {};         /* llave -> true, esta carga de pagina */
  var sentCount = 0;
  var MAX_PAGE = 20;
  var LS_KEY = 'gs_page_errors_sent';

  function cut(v, n) { return String(v == null ? '' : v).slice(0, n); }
  function now() { return Date.now(); }

  /* Lo ya mandado en este telefono: { keys: {llave: ms}, hour: [ms...] }. */
  function readSent() {
    try { var x = JSON.parse(root.localStorage.getItem(LS_KEY) || 'null'); return x && typeof x === 'object' ? { keys: x.keys || {}, hour: x.hour || [] } : { keys: {}, hour: [] }; }
    catch (e) { return { keys: {}, hour: [] }; }
  }
  function writeSent(s) {
    try { root.localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { /* sin almacenamiento: solo el tope por pagina */ }
  }

  /* true = si se manda (y queda anotado). */
  function allow(key) {
    if (sentPage[key] || sentCount >= MAX_PAGE) return false;
    var t = now(), s = readSent();
    var keep = (cfg.repeatHours == null ? 6 : cfg.repeatHours) * 36e5;
    Object.keys(s.keys).forEach(function (k) { if (t - s.keys[k] > keep) delete s.keys[k]; });
    s.hour = s.hour.filter(function (x) { return t - x < 36e5; });
    if (s.keys[key]) { sentPage[key] = true; return false; }
    if (s.hour.length >= (cfg.maxPerHour || 20)) return false;
    var names = Object.keys(s.keys);
    if (names.length > 60) names.sort(function (a, b) { return s.keys[a] - s.keys[b]; }).slice(0, names.length - 60).forEach(function (k) { delete s.keys[k]; });
    s.keys[key] = t;
    s.hour.push(t);
    writeSent(s);
    sentPage[key] = true;
    sentCount++;
    return true;
  }

  function showBar(e) {
    try {
      var el = root.document.createElement('div');
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#B33A3A;color:#fff;font-family:monospace;' +
        'font-size:12px;padding:12px 16px;white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(0,0,0,.3)';
      el.textContent = 'JS error: ' + e.message + '\n' + (e.file || '') + ':' + e.line + ':' + e.col + '\n(toca aqui para cerrar)';
      el.onclick = function () { el.remove(); };
      root.document.body.appendChild(el);
    } catch (x) { /* sin DOM todavia */ }
  }

  function send(e) {
    var who = '';
    try { who = cfg.who ? String(cfg.who() || '') : ''; } catch (x) { who = ''; }
    var body = JSON.stringify({
      kind: cut(e.kind, 20), message: cut(e.message, 500), file: cut(e.file, 200), line: Number(e.line) || 0, col: Number(e.col) || 0,
      stack: cut(e.stack, 1500), screen: cut((root.location && (root.location.pathname + root.location.hash)) || '', 200),
      portal: cut(cfg.portal, 20), who: cut(who, 120), ua: cut(root.navigator && root.navigator.userAgent, 200)
    });
    try {
      var nav = root.navigator;
      if (nav && typeof nav.sendBeacon === 'function' && root.Blob && nav.sendBeacon(cfg.endpoint, new root.Blob([body], { type: 'text/plain' }))) return;
    } catch (x) { /* sigue con fetch */ }
    try {
      if (typeof root.fetch === 'function') {
        root.fetch(cfg.endpoint, { method: 'POST', mode: 'no-cors', keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain' }, body: body })
          .catch(function () {});
      }
    } catch (x) { /* nunca truena */ }
  }

  function handle(e) {
    if (!e || !e.message) return;
    /* Los de scripts de otro dominio llegan sin nada ("Script error."): no sirven y gastan. */
    if (/^Script error\.?$/i.test(String(e.message)) && !e.file) return;
    if (/ResizeObserver loop/i.test(String(e.message))) return;
    if (!cfg) { if (early.length < MAX_PAGE) early.push(e); return; }
    if (!cfg.endpoint) return;
    var key = e.kind + '|' + String(e.message).replace(/\d+/g, '#').slice(0, 200) + '|' + (e.file || '') + ':' + (e.line || 0);
    if (!allow(key)) return;
    if (cfg.bar && e.kind === 'error') showBar(e);
    send(e);
  }

  function report(kind, message, extra) {
    try {
      extra = extra || {};
      handle({ kind: String(kind || 'error'), message: String((message && message.message) || message || ''), file: extra.file || '', line: extra.line || 0,
        col: extra.col || 0, stack: extra.stack || (message && message.stack) || '' });
    } catch (x) { /* nunca truena */ }
  }

  if (root.addEventListener) {
    root.addEventListener('error', function (ev) {
      /* Una imagen o script que no cargo tambien dispara 'error' (sin message): no cuenta. */
      if (!ev || !ev.message) return;
      handle({ kind: 'error', message: ev.message, file: ev.filename || '', line: ev.lineno || 0, col: ev.colno || 0, stack: (ev.error && ev.error.stack) || '' });
    });
    root.addEventListener('unhandledrejection', function (ev) {
      var r = ev && ev.reason;
      /* Un fetch que se corto por la señal no es un error de la pagina. */
      if (r && r.name === 'AbortError') return;
      handle({ kind: 'promise', message: 'Unhandled promise: ' + ((r && r.message) || String(r)), file: '', line: 0, col: 0, stack: (r && r.stack) || '' });
    });
  }

  root.GSPageErrors = {
    init: function (o) {
      cfg = Object.assign({}, o || {});
      var list = early; early = [];
      list.forEach(handle);
    },
    report: report,
    _reset: function () { cfg = null; early = []; sentPage = {}; sentCount = 0; }
  };
})(typeof window !== 'undefined' ? window : this);
