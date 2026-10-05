/* ============================================================
   gsocd-shared / load -- GSLoad (05/10/2026, dueño): al CARGAR tampoco
   se enseña error. "No debe de dar error, debe de decir nomas cargando y
   reintentarse en segundo plano, y una vez que ya esta la informacion,
   pues ya se carga." Es la otra mitad de GSBackground (que es para
   guardar): aqui se LEE.

   Uso:
     GSLoad.init({ onStuck(info, error) })   -- una vez por pagina (opcional)
     const data = await GSLoad.get(key, fn, { label })
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
============================================================ */
(function () {
  'use strict';
  if (window.GSLoad) return;

  var WAITS = [2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000];
  var STUCK_MS = 15 * 60000;
  var hooks = {}, inited = false, jobs = {}, slots = {};

  function retryable(e) { var st = e && e.status; return !st || st >= 500 || st === 401 || st === 408 || st === 429; }

  function wakeAll() { Object.keys(jobs).forEach(function (k) { jobs[k].kick(); }); }

  function get(key, fn, opts) {
    key = String(key);
    opts = opts || {};
    var cur = jobs[key];
    if (cur) { cur.fn = fn; cur.kick(); return cur.promise; }
    if (opts.slot != null) {
      var old = jobs[slots[opts.slot]];
      if (old && old.key !== key) { old.cancelled = true; clearTimeout(old.timer); delete jobs[old.key]; }
      slots[opts.slot] = key;
    }
    var job = { key: key, fn: fn, label: opts.label || '', tries: 0, at: Date.now(), stuck: false, timer: null, next: null, cancelled: false };
    /* Reintentar ya (volvio la señal, la pantalla, u otra carga de lo mismo). */
    job.kick = function () {
      if (!job.timer) return;
      clearTimeout(job.timer); job.timer = null;
      var n = job.next; job.next = null; if (n) n();
    };
    job.promise = new Promise(function (resolve, reject) {
      function attempt() {
        var f = job.fn;
        Promise.resolve().then(function () { return f(); }).then(function (data) {
          if (job.cancelled) return;
          delete jobs[key];
          resolve(data);
        }, function (e) {
          if (job.cancelled) return;
          if (!retryable(e)) { delete jobs[key]; reject(e); return; }
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
    init: function (h) {
      hooks = h || {};
      if (inited) return;
      inited = true;
      try { window.addEventListener('online', wakeAll); } catch (e) { /* sin eventos */ }
      try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') wakeAll(); }); } catch (e) { /* sin eventos */ }
    },
    get: get,
    retryable: retryable,
    /* Cargas que siguen reintentando (para pruebas y para la consola). */
    pending: function () { return Object.keys(jobs).map(function (k) { return { key: k, label: jobs[k].label, tries: jobs[k].tries, at: jobs[k].at }; }); },
    wake: wakeAll,
    /* Solo para pruebas */
    _cfg: function (c) { if (c.waits) WAITS = c.waits; if (c.stuck != null) STUCK_MS = c.stuck; },
    _reset: function () { Object.keys(jobs).forEach(function (k) { clearTimeout(jobs[k].timer); }); jobs = {}; slots = {}; hooks = {}; }
  };
  window.GSLoad = api;
})();
