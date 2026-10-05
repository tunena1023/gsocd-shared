/* ============================================================
   gsocd-shared / submit-key -- la llave que evita crear una orden dos
   veces (05/10/2026). La otra mitad vive en lib/submit-key.js (servidor).

   Cada envio que crea una orden lleva SubmitKey. La llave va amarrada al
   CONTENIDO del formulario: si se vuelve a mandar lo mismo (reintento,
   doble Submit, despues de recargar), sale la misma llave y el servidor
   regresa la orden que ya existia. Si se cambio algo, es otra llave y
   otra orden: nunca se le regresa al usuario una orden vieja en vez de
   la nueva. Se guarda en este navegador (localStorage) hasta 3 dias.

   Uso:
     body.SubmitKey = GSSubmitKey.key('create-order', body);
     const res = await GSSubmitKey.sendOnce(body.SubmitKey, () => api(...));
     GSSubmitKey.forget('create-order');   // al salir bien o al cancelar

   sendOnce: mientras un envio con esa llave sigue en camino (o
   reintentando en segundo plano), otro igual se rechaza con un error:
   dos a la vez podrian crear dos ordenes.

   COLA (05/10/2026, dueño: "el cliente no debe ver un error; eso se tiene
   que reintentar en segundo plano"). Igual que la cola de fotos de Tech:
     GSSubmitKey.queue.init({ send, onDone, onChange, onStuck });
       send(entry)            -> Promise con la respuesta (el portal llama a
                                 su api; el error trae .status)
       onDone(entry, result)  -> llego despues de pasar a segundo plano
       onChange(list)         -> cambio la lista (pintar las "Sending")
       onStuck(entry, error)  -> lleva 15 min sin salir (una vez por envio)
     const out = await GSSubmitKey.queue.start({ slot, path, body, meta });
       out.result  -> salio en menos de 10 s: como siempre
       out.queued  -> sigue en segundo plano; onDone avisa cuando llegue
       throw       -> error que el usuario SI tiene que corregir (400/403/
                      404/409: un dato que falta, etc.); nada se guarda
   El envio se guarda en este navegador ANTES de mandarse: si se cierra la
   app o se va la señal, se retoma solo al volver a abrir el portal. Se
   reintenta con esperas que crecen (5 s ... 5 min), y de inmediato al
   regresar la señal o la pantalla. Con varias pestanas abiertas, un
   candado evita que dos manden el mismo envio a la vez. La llave
   (SubmitKey) garantiza que ningun reintento duplique.
   Usado en: Admin (Create Order, Add Unit) y Orders (New Order, Add Unit).
============================================================ */
(function () {
  'use strict';
  if (window.GSSubmitKey) return;
  var STORE = 'gs_submit_keys_v1';
  var MAX_MS = 3 * 24 * 3600 * 1000;
  var mem = {};
  var sending = {};

  /* Lo que identifica el contenido: todo menos la llave y el OrderID (el
     borrador autoguardado puede aparecer entre un intento y otro). */
  function fingerprint(body) {
    var c = {};
    Object.keys(body || {}).forEach(function (k) { if (k !== 'SubmitKey' && k !== 'OrderID') c[k] = body[k]; });
    var s = JSON.stringify(c), h1 = 0x811c9dc5, h2 = 5381;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
      h2 = (Math.imul(h2, 33) + ch) >>> 0;
    }
    return h1.toString(36) + '.' + h2.toString(36) + '.' + s.length;
  }
  function newKey() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* abajo */ }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
  }
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } }
  function save(all) { try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { /* solo memoria */ } }

  function key(slot, body) {
    var fp = fingerprint(body), now = Date.now(), all = load();
    var e = all[slot] || mem[slot];
    if (!e || e.fp !== fp || !(now - e.at < MAX_MS)) e = { key: newKey(), fp: fp, at: now };
    mem[slot] = e; all[slot] = e;
    Object.keys(all).forEach(function (s) { if (!(now - all[s].at < MAX_MS)) delete all[s]; });
    save(all);
    return e.key;
  }
  function forget(slot) {
    delete mem[slot];
    var all = load();
    if (all[slot]) { delete all[slot]; save(all); }
  }
  function sendOnce(k, fn) {
    if (k && sending[k]) return Promise.reject(new Error('This is still being saved, wait a moment.'));
    if (k) sending[k] = true;
    var p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (v) { if (k) delete sending[k]; return v; }, function (e) { if (k) delete sending[k]; throw e; });
  }

  /* ===== Cola ===== */
  var QSTORE = 'gs_send_queue_v1';
  var BUDGET_MS = 10000, STUCK_MS = 15 * 60000, LOCK_MS = 70000; /* Vercel corta a los 60 s */
  var WAITS = [5000, 10000, 20000, 30000, 60000, 120000, 300000];
  var TAB = newKey();
  var hooks = {}, timer = null, inited = false, running = {};

  function qload() { try { var a = JSON.parse(localStorage.getItem(QSTORE) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return memQ.slice(); } }
  var memQ = [];
  function qsave(list) { memQ = list.slice(); try { localStorage.setItem(QSTORE, JSON.stringify(list)); } catch (e) { /* solo memoria */ } }
  function qget(id) { return qload().filter(function (x) { return x.id === id; })[0] || null; }
  function qput(entry) { var l = qload().filter(function (x) { return x.id !== entry.id; }); l.push(entry); qsave(l); }
  function qdel(id) { qsave(qload().filter(function (x) { return x.id !== id; })); }
  function changed() { if (hooks.onChange) { try { hooks.onChange(qload()); } catch (e) { /* sigue */ } } }

  /* Falla del sistema o de la señal (se reintenta) vs. algo que el usuario
     tiene que corregir. Mismo criterio que retryableError de Admin. */
  function retryable(e) { var st = e && e.status; return !st || st >= 500 || st === 401 || st === 408 || st === 429; }

  function lockOk(entry, now) { return !(entry.lockUntil > now) || entry.lockBy === TAB; }

  /* Un intento. Regresa la respuesta o lanza el error. */
  function attempt(id) {
    if (running[id]) return running[id];
    var entry = qget(id), now = Date.now();
    if (!entry) return Promise.resolve(null);
    if (!lockOk(entry, now)) return Promise.reject(Object.assign(new Error('locked'), { locked: true }));
    entry.lockUntil = now + LOCK_MS; entry.lockBy = TAB; entry.tries = (entry.tries || 0) + 1; entry.lastTry = now;
    qput(entry);
    var p;
    try { p = Promise.resolve(hooks.send(entry)); } catch (e) { p = Promise.reject(e); }
    running[id] = p.then(function (res) {
      delete running[id];
      qdel(id);
      var k = load()[entry.slot];
      if (k && k.key === entry.id) forget(entry.slot);
      changed();
      return res;
    }, function (err) {
      delete running[id];
      var cur = qget(id);
      if (cur) {
        var n = Date.now();
        cur.lockUntil = 0; cur.lockBy = '';
        cur.lastError = String((err && err.message) || err || 'error').slice(0, 300);
        cur.lastStatus = (err && err.status) || 0;
        cur.nextAt = n + WAITS[Math.min((cur.tries || 1) - 1, WAITS.length - 1)];
        /* Un error de dato en los primeros 10 s lo ve el usuario (start lo
           rechaza y lo quita de la cola): no es "atorado". */
        var stuck = !cur.stuckReported && (n - cur.at >= STUCK_MS || (!retryable(err) && n >= cur.at + BUDGET_MS));
        if (stuck) cur.stuckReported = n;
        qput(cur);
        if (stuck && hooks.onStuck) { try { hooks.onStuck(cur, err); } catch (e) { /* sigue */ } }
        changed();
      }
      throw err;
    });
    return running[id];
  }

  function schedule() {
    clearTimeout(timer);
    if (!inited) return;
    var list = qload(), now = Date.now(), next = Infinity;
    list.forEach(function (x) { if (!running[x.id]) next = Math.min(next, Math.max(x.nextAt || 0, x.lockUntil > now && x.lockBy !== TAB ? x.lockUntil : 0)); });
    if (next === Infinity) return;
    timer = setTimeout(pump, Math.max(0, Math.min(next - now, 300000)));
  }
  function pump() {
    var now = Date.now();
    qload().forEach(function (x) {
      if (running[x.id] || (x.nextAt || 0) > now || !lockOk(x, now)) return;
      attempt(x.id).then(function (res) {
        if (res !== null && hooks.onDone) { try { hooks.onDone(x, res); } catch (e) { /* sigue */ } }
      }, function () { /* ya quedo programado */ }).then(schedule);
    });
    schedule();
  }
  function wake() { var l = qload(); l.forEach(function (x) { x.nextAt = 0; }); qsave(l); pump(); }

  var queue = {
    init: function (h) {
      hooks = h || {};
      if (!inited) {
        inited = true;
        try { window.addEventListener('online', wake); } catch (e) { /* sin eventos */ }
        try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') wake(); }); } catch (e) { /* sin eventos */ }
        try { window.addEventListener('storage', function (ev) { if (ev.key === QSTORE) { changed(); schedule(); } }); } catch (e) { /* sin eventos */ }
      }
      changed();
      pump();
    },
    list: function () { return qload(); },
    start: function (o) {
      var body = o.body || {};
      if (!body.SubmitKey) body.SubmitKey = key(o.slot, body);
      var id = body.SubmitKey;
      if (qget(id)) { pump(); return Promise.resolve({ queued: true, already: true }); }
      var entry = { id: id, slot: o.slot, path: o.path, body: body, meta: o.meta || {}, at: Date.now(), tries: 0, nextAt: 0 };
      qput(entry);
      changed();
      return new Promise(function (resolve, reject) {
        var settled = false;
        var t = setTimeout(function () { if (!settled) { settled = true; resolve({ queued: true }); } }, BUDGET_MS);
        attempt(id).then(function (res) {
          clearTimeout(t);
          if (!settled) { settled = true; resolve({ result: res }); return; }
          if (hooks.onDone) { try { hooks.onDone(entry, res); } catch (e) { /* sigue */ } }
        }, function (err) {
          clearTimeout(t);
          if (!retryable(err)) {
            if (!settled) { settled = true; qdel(id); changed(); reject(err); return; }
          } else if (!settled) { settled = true; resolve({ queued: true }); }
        }).then(schedule);
      });
    },
    /* Solo para pruebas: tiempos cortos. */
    _cfg: function (c) { if (c.budget != null) BUDGET_MS = c.budget; if (c.waits) WAITS = c.waits; if (c.stuck != null) STUCK_MS = c.stuck; },
    _reset: function () { clearTimeout(timer); hooks = {}; running = {}; qsave([]); }
  };

  window.GSSubmitKey = { key: key, forget: forget, sendOnce: sendOnce, fingerprint: fingerprint, queue: queue, retryable: retryable };
})();
