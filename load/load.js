/* ============================================================
   gsocd-shared / load -- GSLoad (05/10/2026): al CARGAR tampoco
   se enseña error. "No debe de dar error, debe de decir nomas cargando y
   reintentarse en segundo plano, y una vez que ya esta la informacion,
   pues ya se carga." Es la otra mitad de GSBackground (que es para
   guardar): aqui se LEE.

   Uso:
     GSLoad.init({ onStuck(info, error), saved })   -- una vez por pagina
     const data = await GSLoad.get(key, fn, { label, slot, onUpdate, saved })
       key   -> que se carga (p. ej. '/quickbooks-missing'); dos cargas de la
                misma key a la vez son una sola (la ultima fn manda)
       fn    -> () => Promise con la api del portal (el error trae .status)
       label -> texto corto para el aviso a la oficina ("Missing in QB")
       slot  -> (opcional) una pantalla con filtro (fecha, mes, rango): una
                carga nueva del mismo slot con otra key cancela la vieja, que
                ya no se cumple nunca (asi no pinta encima de la nueva)

   Mientras la promesa no llega, la pantalla se queda en su "Loading…" de
   siempre. Un error del sistema o de la señal (sin status, 5xx, 401, 408,
   429) NO sale: se reintenta solo a los 2 s, 5 s, 10 s, 20 s, 30 s, 1 min,
   2 min, 5 min (y despues cada 5 min), y de inmediato al volver la señal o
   la pantalla. Cuando llega, la promesa se cumple y la pantalla se pinta.
   Solo un error de dato (400, 403, 404, 409: sin permiso, no conectado, no
   existe) rechaza la promesa, para que la pantalla lo diga.
   onStuck: lleva 15 min sin cargar (una vez por carga). Cuenta solo el
   tiempo con la pantalla a la vista y despierta (CFO 30/10/2026: una pestaña
   de Safari en segundo plano congelo la carga y al volver, 36-71 min despues,
   salio la alerta con tries=1): lo escondido o dormido no cuenta. Si la falla
   llega justo al despertar, primero se reintenta al momento sin contarla. Si
   en pantalla ya esta lo ultimo que se vio (o esta carga ya llego antes en
   esta pagina), no hay alerta: nadie esta esperando. info.kind = 'load' (el
   aviso dice "not loaded", no "not saved").

   TIEMPO LIMITE (CFO 30/10/2026): un intento que no contesta en timeoutMs
   (60 s; opts.timeoutMs por carga, 0 = sin limite) se corta y se reintenta
   solo, como una falla de señal. fn recibe { signal } (AbortSignal) por si
   el portal quiere cancelar el fetch; si no lo usa, la respuesta tardia se
   ignora. Solo LECTURAS: GSBackground (guardados) no tiene limite, porque un
   guardado cortado y reintentado puede duplicar.

   LO ULTIMO QUE SE VIO (CFO 22/10/2026: "se supone que deberia de mostrar lo
   ultimo que se vio y cargar en segundo plano ... en shared y parejo para
   todo"). Con GSLoad.init({ saved: { scope } }) cada carga que llega se
   guarda en este navegador (gsocd-shared saved-data, por persona: scope).
   Al ABRIR una pantalla, si el servidor tarda mas de fastMs (2 s) o falla,
   la promesa se cumple al momento con lo ultimo que se vio y la carga sigue
   por detras. Cuando llega lo nuevo:
     - opts.onUpdate(data) si la pantalla lo dio (se repinta ella sola), o
     - saved.onFresh({ key, label, data }) del portal (repinta la pantalla
       que esta abierta).
   Lo nuevo igual a lo guardado: no se hace nada (no se repinta). Distinto: onFresh se llama
   cuando la persona NO esta escribiendo (input, textarea, select) y la pantalla se ve; asi el
   repintado nunca le borra lo que lleva. La pantalla vuelve a pedir la misma carga y la recibe
   al momento (se queda guardada en memoria 2 min o hasta que se pide).
   Una carga que ya llego fresca en esta pagina (p. ej. despues de guardar)
   espera al servidor: nunca enseña algo mas viejo de lo que ya se ve.
   opts.saved === false: esa carga nunca usa lo guardado.
     saved: { scope | prefix, fastMs = 2000, maxAgeMs = 7 dias, onShowSaved(info), onFresh(info), onAllFresh() }
     (prefix: la llave completa por persona, p. ej. 'gs-admin-load|cfo@gsocd.com|', para que el Sign out del portal la borre)
   GSLoad.isSaved(data) -> true si data es lo guardado (no lo nuevo).
   GSLoad.clearSaved()  -> borra lo guardado de esta persona (Sign out).
============================================================ */
(function () {
  'use strict';
  if (window.GSLoad) return;

  var WAITS = [2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000];
  var STUCK_MS = 15 * 60000;
  var MEMO_MS = 120000;
  var TYPING_RETRY_MS = 2000;
  var TIMEOUT_MS = 60000;          /* QuickBooks llega a ~30 s y la galeria a ~22 s (p95) */
  var WAKE_GRACE_MS = 30000;       /* una falla en los 30 s despues de despertar: se reintenta ya */
  var BEAT_MS = 10000;             /* latido mientras hay cargas: detecta que la compu/pestaña durmio */
  var SLEEP_GAP_MS = 60000;        /* un latido que llega 60 s tarde = estuvo dormida */
  var hooks = {}, inited = false, jobs = {}, slots = {};
  var fresh = {};          /* key -> true: ya llego fresca en esta pagina */
  var memo = {};           /* key -> { at, data }: lo nuevo que llego despues de enseñar lo guardado */
  var savedObjs = (typeof WeakSet === 'function') ? new WeakSet() : null;
  var showing = {};        /* key -> true: en pantalla esta lo guardado de esta key */

  /* Reloj "a la vista y despierta": solo avanza con la pantalla visible y sin dormir. */
  var awake = { total: 0, last: Date.now(), on: true, beat: null }, lastWake = 0;
  function isHidden() { try { return !!document.hidden; } catch (e) { return false; } }
  function tick() {
    var t = Date.now(), d = t - awake.last;
    if (awake.on) {
      if (d > SLEEP_GAP_MS) { awake.total += Math.min(BEAT_MS, d); lastWake = t; }
      else if (d > 0) awake.total += d;
    }
    awake.last = t;
  }
  function awakeNow() { tick(); return awake.total; }
  function startBeat() {
    if (awake.beat) return;
    tick();
    awake.beat = setInterval(function () { tick(); if (!Object.keys(jobs).length) { clearInterval(awake.beat); awake.beat = null; } }, BEAT_MS);
  }
  function setVisible(v) {
    tick();
    if (v && !awake.on) lastWake = Date.now();
    awake.on = v;
  }
  function justWoke() { tick(); return lastWake && Date.now() - lastWake < WAKE_GRACE_MS; }

  function retryable(e) { var st = e && e.status; return !st || st >= 500 || st === 401 || st === 408 || st === 429; }

  function wakeAll() { Object.keys(jobs).forEach(function (k) { jobs[k].kick(); }); }

  function savedCfg() { return hooks.saved && (hooks.saved.scope || hooks.saved.prefix) && window.GSSaved ? hooks.saved : null; }
  /* prefix: el del portal, para que su Sign out de siempre lo borre (Admin: 'gs-admin-…'). */
  function savedPrefix(cfg) { return cfg.prefix != null ? String(cfg.prefix) : 'gs-load|' + cfg.scope + '|'; }
  function savedKey(key) { return savedPrefix(savedCfg()) + key; }
  function call(fn, a) { try { if (fn) fn(a); } catch (e) { /* la pantalla no tumba la carga */ } }
  function same(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } }
  /* Escribiendo o con la pantalla escondida: el repintado espera. */
  function busy() {
    try {
      if (document.hidden) return true;
      var el = document.activeElement;
      if (!el || el === document.body) return false;
      var tag = String(el.tagName || '').toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
    } catch (e) { return false; }
  }
  var freshQueue = {}, freshTimer = null;
  function flushFresh() {
    freshTimer = null;
    if (busy()) { freshTimer = setTimeout(flushFresh, TYPING_RETRY_MS); return; }
    var q = freshQueue; freshQueue = {};
    var cfg = savedCfg();
    Object.keys(q).forEach(function (k) { if (q[k].onUpdate) call(q[k].onUpdate, q[k].data); else call(cfg && cfg.onFresh, q[k].info); });
  }
  function queueFresh(key, item) {
    freshQueue[key] = item;
    if (!freshTimer) freshTimer = setTimeout(flushFresh, 50);
  }

  function get(key, fn, opts) {
    key = String(key);
    opts = opts || {};
    var m = memo[key];
    if (m && Date.now() - m.at < MEMO_MS) { delete memo[key]; return Promise.resolve(m.data); }
    var cur = jobs[key];
    if (cur) {
      cur.fn = fn;
      if (opts.onUpdate) cur.onUpdate = opts.onUpdate;
      cur.kick();
      return cur.promise;
    }
    if (opts.slot != null) {
      var old = jobs[slots[opts.slot]];
      if (old && old.key !== key) { old.cancelled = true; clearTimeout(old.timer); clearTimeout(old.fastTimer); clearTimeout(old.killTimer); delete jobs[old.key]; }
      slots[opts.slot] = key;
    }
    var cfg = opts.saved === false ? null : savedCfg();
    /* Solo al abrir: si esta key ya llego fresca en esta pagina, se espera al servidor. */
    var mayUseSaved = !!cfg && !fresh[key];
    var job = { key: key, fn: fn, label: opts.label || '', onUpdate: opts.onUpdate || null, tries: 0, at: Date.now(),
      stuck: false, timer: null, fastTimer: null, next: null, cancelled: false, settled: false, servedSaved: false,
      awakeAt: awakeNow(), seenBefore: !!fresh[key], wokeRetry: 0, run: 0, killTimer: null,
      timeoutMs: opts.timeoutMs != null ? Number(opts.timeoutMs) || 0 : TIMEOUT_MS };
    /* Reintentar ya (volvio la señal, la pantalla, u otra carga de lo mismo). */
    job.kick = function () {
      if (!job.timer) return;
      clearTimeout(job.timer); job.timer = null;
      var n = job.next; job.next = null; if (n) n();
    };
    job.promise = new Promise(function (resolve, reject) {
      /* Lo ultimo que se vio, si existe, cumple la promesa ya (una vez). */
      var triedSaved = false;
      function useSaved() {
        if (!mayUseSaved || triedSaved || job.settled || job.cancelled) return;
        triedSaved = true;
        window.GSSaved.read(savedKey(key), cfg.maxAgeMs || 7 * 86400000).then(function (row) {
          if (!row || job.settled || job.cancelled) return;
          job.settled = true; job.servedSaved = true; job.savedData = row.data;
          if (savedObjs && row.data && typeof row.data === 'object') savedObjs.add(row.data);
          showing[key] = true;
          call(cfg.onShowSaved, { key: key, label: job.label, at: row.at });
          resolve(row.data);
        }, function () { /* sin copia: sigue en Loading */ });
      }
      if (mayUseSaved) job.fastTimer = setTimeout(useSaved, cfg.fastMs == null ? 2000 : cfg.fastMs);

      function attempt() {
        var f = job.fn, run = ++job.run, ctrl = null;
        try { ctrl = typeof AbortController === 'function' ? new AbortController() : null; } catch (x) { ctrl = null; }
        var call1 = Promise.resolve().then(function () { return f({ signal: ctrl ? ctrl.signal : undefined }); });
        /* Tiempo limite: el intento que no contesta se da por fallado (sin status = se reintenta). */
        var raced = !job.timeoutMs ? call1 : Promise.race([call1, new Promise(function (_, rej) {
          job.killTimer = setTimeout(function () {
            try { if (ctrl) ctrl.abort(); } catch (x) { /* sigue */ }
            var te = new Error('No answer after ' + Math.round(job.timeoutMs / 1000) + ' s'); te.timeout = true; rej(te);
          }, job.timeoutMs);
        })]);
        raced.then(function (data) {
          clearTimeout(job.killTimer);
          if (job.cancelled || run !== job.run) return;
          clearTimeout(job.fastTimer);
          delete jobs[key];
          fresh[key] = true;
          if (cfg) window.GSSaved.save(savedKey(key), data).then(null, function () {});
          if (!job.settled) { job.settled = true; resolve(data); return; }
          /* Ya se enseño lo guardado: ahora lo nuevo (solo si cambio algo). */
          delete showing[key];
          if (!same(job.savedData, data)) {
            if (!job.onUpdate) memo[key] = { at: Date.now(), data: data };
            queueFresh(key, { onUpdate: job.onUpdate, data: data, info: { key: key, label: job.label, data: data } });
          }
          if (!Object.keys(showing).length) call(cfg && cfg.onAllFresh);
        }, function (e) {
          clearTimeout(job.killTimer);
          if (job.cancelled || run !== job.run) return;
          if (!(e && e.timeout) && !retryable(e)) {
            clearTimeout(job.fastTimer);
            delete jobs[key];
            if (!job.settled) { job.settled = true; reject(e); }
            else { delete showing[key]; if (!Object.keys(showing).length) call(cfg && cfg.onAllFresh); }
            return;
          }
          /* El servidor falla: no se espera a fastMs para enseñar lo guardado. */
          useSaved();
          /* Recien despierta (la falla suele ser del fetch que se congelo): se reintenta ya, sin contarla. */
          if (justWoke() && job.wokeRetry !== lastWake) {
            job.wokeRetry = lastWake;
            job.next = attempt;
            job.timer = setTimeout(function () { job.timer = null; job.next = null; attempt(); }, 300);
            return;
          }
          job.tries++;
          /* 15 min a la vista y despierta, y solo si la persona esta esperando (no ve nada de esto). */
          if (!job.stuck && awakeNow() - job.awakeAt >= STUCK_MS && !job.servedSaved && !job.seenBefore) {
            job.stuck = true;
            try { if (hooks.onStuck) hooks.onStuck({ key: key, label: job.label, at: job.at, tries: job.tries, kind: 'load' }, e); } catch (x) { /* sigue */ }
          }
          job.next = attempt;
          job.timer = setTimeout(function () { job.timer = null; job.next = null; attempt(); }, WAITS[Math.min(job.tries - 1, WAITS.length - 1)]);
        });
      }
      attempt();
    });
    jobs[key] = job;
    startBeat();
    return job.promise;
  }

  var api = {
    /* Se puede llamar mas de una vez (p. ej. saved al cargar la pagina y onStuck despues): se juntan. */
    init: function (h) {
      var prev = hooks.saved;
      hooks = Object.assign({}, hooks, h || {});
      /* saved se junta tambien (el prefix al cargar la pagina y onFresh despues). */
      /* Con sus getters (p. ej. prefix que depende de quien entro): no se copian como valor. */
      if (prev && h && h.saved) {
        var m = {};
        [prev, h.saved].forEach(function (o) { Object.keys(o).forEach(function (k) { Object.defineProperty(m, k, Object.assign(Object.getOwnPropertyDescriptor(o, k), { configurable: true })); }); });
        hooks.saved = m;
      }
      if (inited) return;
      inited = true;
      try { window.addEventListener('online', wakeAll); } catch (e) { /* sin eventos */ }
      try { document.addEventListener('visibilitychange', function () { var v = document.visibilityState === 'visible'; setVisible(v); if (v) wakeAll(); }); } catch (e) { /* sin eventos */ }
      /* Safari/iOS: la pagina vuelve del congelado (bfcache o pestaña dormida). */
      try { window.addEventListener('pageshow', function () { lastWake = Date.now(); wakeAll(); }); } catch (e) { /* sin eventos */ }
      try { document.addEventListener('resume', function () { lastWake = Date.now(); wakeAll(); }); } catch (e) { /* sin eventos */ }
      setVisible(!isHidden());
    },
    get: get,
    retryable: retryable,
    isSaved: function (data) { return !!(savedObjs && data && typeof data === 'object' && savedObjs.has(data)); },
    /* Cuantas pantallas enseñan lo guardado mientras llega lo nuevo. */
    showingSaved: function () { return Object.keys(showing).length; },
    clearSaved: function () {
      var cfg = savedCfg();
      fresh = {}; memo = {}; showing = {};
      return cfg ? window.GSSaved.clear(savedPrefix(cfg)) : Promise.resolve();
    },
    /* Cargas que siguen reintentando (para pruebas y para la consola). */
    pending: function () { return Object.keys(jobs).map(function (k) { return { key: k, label: jobs[k].label, tries: jobs[k].tries, at: jobs[k].at }; }); },
    wake: wakeAll,
    /* Solo para pruebas */
    _cfg: function (c) {
      if (c.waits) WAITS = c.waits; if (c.stuck != null) STUCK_MS = c.stuck; if (c.memo != null) MEMO_MS = c.memo; if (c.typingRetry != null) TYPING_RETRY_MS = c.typingRetry;
      if (c.timeout != null) TIMEOUT_MS = c.timeout; if (c.wakeGrace != null) WAKE_GRACE_MS = c.wakeGrace;
      if (c.beat != null) { BEAT_MS = c.beat; if (awake.beat) { clearInterval(awake.beat); awake.beat = null; } }
      if (c.sleepGap != null) SLEEP_GAP_MS = c.sleepGap;
    },
    _reset: function () {
      Object.keys(jobs).forEach(function (k) { clearTimeout(jobs[k].timer); clearTimeout(jobs[k].fastTimer); clearTimeout(jobs[k].killTimer); });
      if (awake.beat) clearInterval(awake.beat);
      awake = { total: 0, last: Date.now(), on: !isHidden(), beat: null }; lastWake = 0;
      jobs = {}; slots = {}; hooks = {}; fresh = {}; memo = {}; showing = {};
      clearTimeout(freshTimer); freshTimer = null; freshQueue = {};
    }
  };
  window.GSLoad = api;
})();
