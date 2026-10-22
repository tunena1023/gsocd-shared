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
   onStuck: lleva 15 min sin cargar (una vez por carga).

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
  var MEMO_MS = 30000;
  var hooks = {}, inited = false, jobs = {}, slots = {};
  var fresh = {};          /* key -> true: ya llego fresca en esta pagina */
  var memo = {};           /* key -> { at, data }: lo nuevo que llego despues de enseñar lo guardado */
  var savedObjs = (typeof WeakSet === 'function') ? new WeakSet() : null;
  var showing = {};        /* key -> true: en pantalla esta lo guardado de esta key */

  function retryable(e) { var st = e && e.status; return !st || st >= 500 || st === 401 || st === 408 || st === 429; }

  function wakeAll() { Object.keys(jobs).forEach(function (k) { jobs[k].kick(); }); }

  function savedCfg() { return hooks.saved && (hooks.saved.scope || hooks.saved.prefix) && window.GSSaved ? hooks.saved : null; }
  /* prefix: el del portal, para que su Sign out de siempre lo borre (Admin: 'gs-admin-…'). */
  function savedPrefix(cfg) { return cfg.prefix != null ? String(cfg.prefix) : 'gs-load|' + cfg.scope + '|'; }
  function savedKey(key) { return savedPrefix(savedCfg()) + key; }
  function call(fn, a) { try { if (fn) fn(a); } catch (e) { /* la pantalla no tumba la carga */ } }

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
      if (old && old.key !== key) { old.cancelled = true; clearTimeout(old.timer); clearTimeout(old.fastTimer); delete jobs[old.key]; }
      slots[opts.slot] = key;
    }
    var cfg = opts.saved === false ? null : savedCfg();
    /* Solo al abrir: si esta key ya llego fresca en esta pagina, se espera al servidor. */
    var mayUseSaved = !!cfg && !fresh[key];
    var job = { key: key, fn: fn, label: opts.label || '', onUpdate: opts.onUpdate || null, tries: 0, at: Date.now(),
      stuck: false, timer: null, fastTimer: null, next: null, cancelled: false, settled: false, servedSaved: false };
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
          job.settled = true; job.servedSaved = true;
          if (savedObjs && row.data && typeof row.data === 'object') savedObjs.add(row.data);
          showing[key] = true;
          call(cfg.onShowSaved, { key: key, label: job.label, at: row.at });
          resolve(row.data);
        }, function () { /* sin copia: sigue en Loading */ });
      }
      if (mayUseSaved) job.fastTimer = setTimeout(useSaved, cfg.fastMs == null ? 2000 : cfg.fastMs);

      function attempt() {
        var f = job.fn;
        Promise.resolve().then(function () { return f(); }).then(function (data) {
          if (job.cancelled) return;
          clearTimeout(job.fastTimer);
          delete jobs[key];
          fresh[key] = true;
          if (cfg) window.GSSaved.save(savedKey(key), data).then(null, function () {});
          if (!job.settled) { job.settled = true; resolve(data); return; }
          /* Ya se enseño lo guardado: ahora lo nuevo. */
          delete showing[key];
          if (job.onUpdate) call(job.onUpdate, data);
          else { memo[key] = { at: Date.now(), data: data }; call(cfg && cfg.onFresh, { key: key, label: job.label, data: data }); }
          if (!Object.keys(showing).length) call(cfg && cfg.onAllFresh);
        }, function (e) {
          if (job.cancelled) return;
          if (!retryable(e)) {
            clearTimeout(job.fastTimer);
            delete jobs[key];
            if (!job.settled) { job.settled = true; reject(e); }
            else { delete showing[key]; if (!Object.keys(showing).length) call(cfg && cfg.onAllFresh); }
            return;
          }
          /* El servidor falla: no se espera a fastMs para enseñar lo guardado. */
          useSaved();
          job.tries++;
          if (!job.stuck && Date.now() - job.at >= STUCK_MS) {
            job.stuck = true;
            try { if (hooks.onStuck) hooks.onStuck({ key: key, label: job.label, at: job.at, tries: job.tries }, e); } catch (x) { /* sigue */ }
          }
          job.next = attempt;
          job.timer = setTimeout(function () { job.timer = null; job.next = null; attempt(); }, WAITS[Math.min(job.tries - 1, WAITS.length - 1)]);
        });
      }
      attempt();
    });
    jobs[key] = job;
    return job.promise;
  }

  var api = {
    /* Se puede llamar mas de una vez (p. ej. saved al cargar la pagina y onStuck despues): se juntan. */
    init: function (h) {
      hooks = Object.assign({}, hooks, h || {});
      if (inited) return;
      inited = true;
      try { window.addEventListener('online', wakeAll); } catch (e) { /* sin eventos */ }
      try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') wakeAll(); }); } catch (e) { /* sin eventos */ }
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
    _cfg: function (c) { if (c.waits) WAITS = c.waits; if (c.stuck != null) STUCK_MS = c.stuck; if (c.memo != null) MEMO_MS = c.memo; },
    _reset: function () {
      Object.keys(jobs).forEach(function (k) { clearTimeout(jobs[k].timer); clearTimeout(jobs[k].fastTimer); });
      jobs = {}; slots = {}; hooks = {}; fresh = {}; memo = {}; showing = {};
    }
  };
  window.GSLoad = api;
})();
