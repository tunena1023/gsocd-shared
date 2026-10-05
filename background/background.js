/* ============================================================
   gsocd-shared / background -- GSBackground (05/10/2026, dueño): "nada
   deja al usuario esperando". Donde la app pueda tardar (SharePoint,
   QuickBooks, la señal), la accion se guarda en este navegador, la
   pantalla sigue al instante y la accion se manda sola, con reintentos,
   aunque se cierre la app. Misma idea que GSSubmitKey.queue (Create
   Order), pero para cualquier accion y sin esperar nada.

   La otra mitad es lib/action-key.js (servidor): cada accion lleva
   body.actionKey y la ruta no la repite si ya la hizo.

   Uso (una vez por pagina):
     GSBackground.init({
       send(entry)            -> Promise: la api del portal (el error trae .status)
       onDone(entry, result)  -> ya llego (refrescar en silencio)
       onFail(entry, error)   -> error de dato (400/403/404/409): no se reintenta
       onStuck(entry, error)  -> lleva 15 min sin salir (una vez por accion)
       onChange(list)         -> cambio la lista
     });
     GSBackground.run({ group, kind, label, path, body, meta, replace })
       group   -> lo que va en orden (normalmente el OrderID): las acciones de
                  un mismo group salen una tras otra, en el orden en que se
                  hicieron
       kind    -> que es (p. ej. 'unit-ready'); con replace:true, una accion
                  nueva del mismo group+kind que todavia no sale reemplaza a
                  la anterior (un switch que se prende y apaga: vale el ultimo)
       label   -> texto corto para el aviso ("Unit ready", "Inspection")
     Regresa la entrada al instante (no espera la respuesta).

   Aviso en pantalla: cualquier elemento con data-gs-bg="<group>" se llena
   solo con "Saving…" o "Not saved · Retry". GSBackground.styleTag() pone
   el estilo.

   Reintentos: 5 s, 10 s, 20 s, 30 s, 1 min, 2 min, 5 min (y despues cada
   5 min), y de inmediato al regresar la señal o la pantalla. Un error del
   sistema o de la señal (sin status, 5xx, 401, 408, 429) se reintenta; un
   error de dato se queda como "Not saved" con su mensaje y el boton Retry.
   Con varias pestañas, un candado evita que dos manden la misma.
============================================================ */
(function () {
  'use strict';
  if (window.GSBackground) return;

  var STORE = 'gs_background_v1';
  var STUCK_MS = 15 * 60000, LOCK_MS = 70000; /* Vercel corta a los 60 s */
  var WAITS = [5000, 10000, 20000, 30000, 60000, 120000, 300000];
  var hooks = {}, inited = false, timer = null, running = {}, mem = [];

  function newKey() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* abajo */ }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
  }
  var TAB = newKey();

  function load() { try { var a = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(a) ? a : mem.slice(); } catch (e) { return mem.slice(); } }
  function save(list) { mem = list.slice(); try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) { /* solo memoria */ } }
  function get(id) { return load().filter(function (x) { return x.id === id; })[0] || null; }
  function put(entry) { var l = load(), i = -1; l.forEach(function (x, j) { if (x.id === entry.id) i = j; }); if (i >= 0) l[i] = entry; else l.push(entry); save(l); }
  function del(id) { save(load().filter(function (x) { return x.id !== id; })); }

  function retryable(e) { var st = e && e.status; return !st || st >= 500 || st === 401 || st === 408 || st === 429; }
  function lockOk(x, now) { return !(x.lockUntil > now) || x.lockBy === TAB; }

  function changed() {
    paint();
    if (hooks.onChange) { try { hooks.onChange(load()); } catch (e) { /* sigue */ } }
  }

  /* La primera pendiente de cada group (las fallidas no detienen a las demas). */
  function heads(list) {
    var seenG = {}, out = [];
    list.slice().sort(function (a, b) { return a.at - b.at || (a.seq || 0) - (b.seq || 0); }).forEach(function (x) {
      if (x.status === 'failed') return;
      var g = x.group || x.id;
      if (seenG[g]) return;
      seenG[g] = true; out.push(x);
    });
    return out;
  }

  function attempt(id) {
    if (running[id]) return running[id];
    var x = get(id), now = Date.now();
    if (!x) return Promise.resolve(null);
    if (!lockOk(x, now)) return Promise.reject(Object.assign(new Error('locked'), { locked: true }));
    x.lockUntil = now + LOCK_MS; x.lockBy = TAB; x.tries = (x.tries || 0) + 1; x.lastTry = now;
    put(x);
    changed();
    var p;
    try { p = Promise.resolve(hooks.send(x)); } catch (e) { p = Promise.reject(e); }
    running[id] = p.then(function (res) {
      delete running[id];
      del(id);
      changed();
      if (hooks.onDone) { try { hooks.onDone(x, res); } catch (e) { /* sigue */ } }
      return res;
    }, function (err) {
      delete running[id];
      var cur = get(id);
      if (cur) {
        var n = Date.now();
        cur.lockUntil = 0; cur.lockBy = '';
        cur.lastError = String((err && err.message) || err || 'error').slice(0, 300);
        cur.lastStatus = (err && err.status) || 0;
        if (!retryable(err)) {
          cur.status = 'failed';
          put(cur);
          changed();
          if (hooks.onFail) { try { hooks.onFail(cur, err); } catch (e) { /* sigue */ } }
        } else if (cur.replace && load().some(function (y) { return y.id !== cur.id && String(y.group) === String(cur.group) && y.kind === cur.kind && y.at >= cur.at; })) {
          /* Ya hay un valor mas nuevo de lo mismo (replace): este ya no vale. */
          del(id);
          changed();
        } else {
          cur.nextAt = n + WAITS[Math.min((cur.tries || 1) - 1, WAITS.length - 1)];
          var stuck = !cur.stuckReported && n - cur.at >= STUCK_MS;
          if (stuck) cur.stuckReported = n;
          put(cur);
          changed();
          if (stuck && hooks.onStuck) { try { hooks.onStuck(cur, err); } catch (e) { /* sigue */ } }
        }
      }
      throw err;
    });
    return running[id];
  }

  function schedule() {
    clearTimeout(timer);
    if (!inited) return;
    var now = Date.now(), next = Infinity;
    heads(load()).forEach(function (x) {
      if (running[x.id]) return;
      next = Math.min(next, Math.max(x.nextAt || 0, x.lockUntil > now && x.lockBy !== TAB ? x.lockUntil : 0));
    });
    if (next === Infinity) return;
    timer = setTimeout(pump, Math.max(0, Math.min(next - now, 300000)));
  }
  function pump() {
    if (!inited || !hooks.send) return;
    var now = Date.now();
    heads(load()).forEach(function (x) {
      if (running[x.id] || (x.nextAt || 0) > now || !lockOk(x, now)) return;
      attempt(x.id).then(pump, function () { /* ya quedo programado */ }).then(schedule);
    });
    schedule();
  }
  function wake() { var l = load(); l.forEach(function (x) { if (x.status !== 'failed') x.nextAt = 0; }); save(l); pump(); }

  /* ===== Aviso en pantalla ===== */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function stateOf(group) {
    var l = load().filter(function (x) { return String(x.group) === String(group); });
    if (!l.length) return null;
    var failed = l.filter(function (x) { return x.status === 'failed'; });
    if (failed.length) return { failed: failed[0], pending: l.length - failed.length };
    var waiting = l.some(function (x) { return x.tries > 0 && x.lastError && !running[x.id]; });
    return { pending: l.length, waiting: waiting };
  }
  function pillHtml(group) {
    var s = stateOf(group);
    if (!s) return '';
    if (s.failed) {
      var f = s.failed;
      return '<span class="gs-bg-pill gs-bg-failed" role="status">Not saved' + (f.label ? ': ' + esc(f.label) : '') +
        (f.lastError ? ' <span class="gs-bg-why">' + esc(f.lastError) + '</span>' : '') +
        ' <button type="button" class="gs-bg-btn" data-gs-bg-retry="' + esc(f.id) + '">Retry</button>' +
        '<button type="button" class="gs-bg-btn gs-bg-x" data-gs-bg-discard="' + esc(f.id) + '" aria-label="Dismiss">×</button></span>';
    }
    return '<span class="gs-bg-pill' + (s.waiting ? ' gs-bg-wait' : '') + '" role="status"><span class="gs-bg-dot"></span>' +
      '<span>' + (s.waiting ? 'Waiting for signal · will send by itself' : 'Saving…') + '</span></span>';
  }
  function paint() {
    try {
      var els = document.querySelectorAll('[data-gs-bg]');
      for (var i = 0; i < els.length; i++) {
        /* Se compara con lo que se pinto la ultima vez, no con innerHTML:
           Tech traduce el aviso al español y no hay que volver a pintarlo. */
        var h = pillHtml(els[i].getAttribute('data-gs-bg'));
        if (els[i].__gsBg !== h) { els[i].__gsBg = h; els[i].innerHTML = h; }
      }
    } catch (e) { /* sin DOM */ }
  }
  function onClick(ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-gs-bg-retry],[data-gs-bg-discard]') : null;
    if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    if (t.hasAttribute('data-gs-bg-retry')) api.retry(t.getAttribute('data-gs-bg-retry'));
    else api.discard(t.getAttribute('data-gs-bg-discard'));
  }

  var seq = 0;
  var api = {
    init: function (h) {
      hooks = h || {};
      if (!inited) {
        inited = true;
        try { window.addEventListener('online', wake); } catch (e) { /* sin eventos */ }
        try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') wake(); }); } catch (e) { /* sin eventos */ }
        try { window.addEventListener('storage', function (ev) { if (ev.key === STORE) { paint(); schedule(); } }); } catch (e) { /* sin eventos */ }
        try { document.addEventListener('click', onClick, true); } catch (e) { /* sin DOM */ }
        /* Cuando una pantalla vuelve a pintar sus tarjetas, el aviso se
           vuelve a poner solo (si hay algo pendiente). */
        try {
          var pend = false;
          new MutationObserver(function () {
            if (pend || !load().length) return;
            pend = true;
            setTimeout(function () { pend = false; paint(); }, 0);
          }).observe(document.body || document.documentElement, { childList: true, subtree: true });
        } catch (e) { /* sin MutationObserver */ }
      }
      /* Un candado de una pestaña que se cerro a la mitad se suelta solo
         a los 70 s (LOCK_MS); lo de esta pestaña nueva arranca ya. */
      changed();
      pump();
    },
    run: function (o) {
      o = o || {};
      var id = newKey();
      var body = Object.assign({}, o.body || {}, { actionKey: id });
      var group = String(o.group || id);
      if (o.replace) {
        save(load().filter(function (x) {
          return !(String(x.group) === group && x.kind === o.kind && !running[x.id] && !(x.lockUntil > Date.now()));
        }));
      }
      var entry = { id: id, group: group, kind: o.kind || '', label: o.label || '', path: o.path, body: body, meta: o.meta || {},
        at: Date.now(), seq: ++seq, tries: 0, nextAt: 0, status: 'pending', replace: !!o.replace };
      put(entry);
      changed();
      pump();
      return entry;
    },
    list: function (group) { var l = load(); return group == null ? l : l.filter(function (x) { return String(x.group) === String(group); }); },
    pending: function (group) { return api.list(group).filter(function (x) { return x.status !== 'failed'; }); },
    retry: function (id) {
      var x = get(id);
      if (!x) return;
      x.status = 'pending'; x.nextAt = 0; x.lockUntil = 0; x.lockBy = '';
      put(x); changed(); pump();
    },
    discard: function (id) { del(id); changed(); schedule(); },
    paint: paint,
    pillHtml: pillHtml,
    retryable: retryable,
    styleTag: function () {
      if (document.getElementById('gs-bg-style')) return;
      var s = document.createElement('style');
      s.id = 'gs-bg-style';
      s.textContent =
        '.gs-bg-slot:empty{display:none}.gs-bg-slot{margin-top:6px}' +
        '.gs-bg-pill{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 11px/1.3 Inter,system-ui,sans-serif;letter-spacing:.02em;color:#8C6F2A;background:#FBF5E6;border:1px solid #E5D3A1;border-radius:3px;padding:3px 8px;text-transform:none}' +
        '.gs-bg-pill:not(.gs-bg-failed){flex-wrap:nowrap}.gs-bg-pill .gs-bg-dot{flex-shrink:0;width:7px;height:7px;border-radius:50%;background:#C9A84C;animation:gsBgPulse 1.1s ease-in-out infinite}' +
        '.gs-bg-wait{color:#6B6B6B;background:#F3F1EC;border-color:#E0D9CC}.gs-bg-wait .gs-bg-dot{background:#9A9A9A}' +
        '.gs-bg-failed{color:#B33A3A;background:#FFF5F5;border-color:#F0C9C9}' +
        '.gs-bg-why{font-weight:400;color:#7a3a3a}' +
        '.gs-bg-btn{all:unset;cursor:pointer;font-weight:700;text-decoration:underline;color:#B33A3A;padding:0 2px}' +
        '.gs-bg-x{text-decoration:none;font-size:14px;line-height:1;color:#9a5a5a}' +
        '@keyframes gsBgPulse{0%,100%{opacity:.35}50%{opacity:1}}';
      document.head.appendChild(s);
    },
    /* Solo para pruebas */
    _cfg: function (c) { if (c.waits) WAITS = c.waits; if (c.stuck != null) STUCK_MS = c.stuck; },
    _reset: function () { clearTimeout(timer); hooks = {}; running = {}; save([]); inited = false; }
  };
  window.GSBackground = api;
})();
