/* ============================================================
   gsocd-shared / camera-queue
   Cola de fotos pendientes de subir -- para cuando no hay señal (el
   caso real que la origino: un tecnico en un edificio con punto
   muerto tomando varias fotos seguidas).

   Regla de oro, confirmada con el dueño: LAS FOTOS SIEMPRE SE DEBEN
   GUARDAR, no importa que. Por eso esto usa IndexedDB (no
   localStorage -- una foto en base64 pesa varios MB, localStorage
   tiene un limite total de ~5-10MB y se llenaria con pocas fotos) y
   guarda la foto completa ANTES de siquiera intentar subirla, no
   despues de que falle. Asi, aunque cierren la pestana a medio
   camino, nada se pierde.

   No sabe nada de endpoints ni de la forma del body -- cada pagina
   que use esto ya tiene su propio helper de API (GS.api en Tech,
   api() en Admin, GS.api en Orders), asi que la pagina misma decide
   que URL y que datos van en cada foto; esto solo la guarda, la
   reintenta, y avisa cuando cambia el estado.

   Uso:
     GSCameraQueue.init({
       dbName: 'gs-tech-camera-queue',      // unico por dominio/app
       uploadFn: async function (item) {     // item.endpoint, item.body
         return GS.api(item.endpoint, { body: item.body });
       },
       maxAttempts: 10,                      // default 10
       retryIntervalMs: 30000,               // default 30s
       onChange: function (pending) { ... }  // se llama cada vez que
                                              // cambia la cola (para
                                              // pintar el contador)
     });

     const id = await GSCameraQueue.enqueue({
       endpoint: '/upload-photo',
       body: { orderId, imageBase64, ... },
       meta: { orderId, thumbUrl }           // libre, solo para que la
                                              // pagina pinte la UI
     });

     const pending = await GSCameraQueue.getPending();
     // [{ id, endpoint, body, meta, attempts, failed, lastError, createdAt }]

     await GSCameraQueue.retryNow(id);        // un item a la fuerza
     await GSCameraQueue.retryAll();          // todos los que se pueda

   Un item con "failed: true" ya agoto sus intentos automaticos (10
   por default) -- se queda guardado igual (nunca se borra solo),
   nomas deja de reintentarse el solo hasta que alguien le de
   retryNow() a mano.
============================================================ */
(function () {
  'use strict';
  if (window.GSCameraQueue) return;

  var cfg = null;
  var dbPromise = null;
  var changeListeners = [];
  var retryTimer = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(cfg.dbName, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('items')) {
          db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(mode) {
    return openDB().then(function (db) {
      return db.transaction('items', mode).objectStore('items');
    });
  }

  function dbAdd(item) {
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.add(item);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function dbPut(item) {
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.put(item);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function dbDelete(id) {
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.delete(id);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function dbGetAll() {
    return tx('readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function notifyChange() {
    dbGetAll().then(function (pending) {
      changeListeners.forEach(function (fn) { try { fn(pending); } catch (e) {} });
      if (cfg.onChange) { try { cfg.onChange(pending); } catch (e) {} }
    }).catch(function () {});
  }

  /* Intenta subir UN item. Si sale bien, lo borra de la cola. Si
     falla, le suma un intento y guarda el error -- si ya llego al
     maximo, lo marca failed (deja de reintentarse solo). "force"
     (para retryNow) ignora el limite una vez, sin resetear el
     contador de intentos ya hechos. */
  function attemptUpload(item, force) {
    if (item.failed && !force) return Promise.resolve(false);
    return cfg.uploadFn(item).then(function () {
      return dbDelete(item.id).then(function () { return true; });
    }).catch(function (err) {
      item.attempts = (item.attempts || 0) + 1;
      item.lastError = (err && err.message) || String(err);
      item.failed = item.attempts >= (cfg.maxAttempts || 10);
      return dbPut(item).then(function () { return false; });
    });
  }

  function retryAll() {
    return dbGetAll().then(function (items) {
      var todo = items.filter(function (it) { return !it.failed; });
      if (!todo.length) return;
      return Promise.all(todo.map(function (it) { return attemptUpload(it, false); }))
        .then(notifyChange);
    });
  }

  window.GSCameraQueue = {
    init: function (config) {
      cfg = Object.assign({ maxAttempts: 10, retryIntervalMs: 30000 }, config);
      if (!cfg.dbName) throw new Error('GSCameraQueue.init needs dbName');
      if (!cfg.uploadFn) throw new Error('GSCameraQueue.init needs uploadFn');

      window.addEventListener('online', retryAll);
      if (retryTimer) clearInterval(retryTimer);
      retryTimer = setInterval(retryAll, cfg.retryIntervalMs);

      /* Al abrir la pagina (o reabrir la app despues de cerrada del
         todo), se intenta de una vez lo que haya quedado pendiente de
         una sesion anterior -- asi no espera hasta el proximo evento
         "online" o el proximo tick del temporizador. */
      retryAll();
      notifyChange();
    },

    enqueue: function (opts) {
      var item = {
        endpoint: opts.endpoint,
        body: opts.body,
        meta: opts.meta || {},
        attempts: 0,
        failed: false,
        lastError: null,
        createdAt: Date.now()
      };
      return dbAdd(item).then(function (id) {
        item.id = id;
        /* Intento inmediato -- si hay señal, sube al toque; si no,
           ya quedo guardada de todos modos (eso ya paso arriba, antes
           de este intento). */
        return attemptUpload(item, false).then(function () {
          notifyChange();
          return id;
        });
      });
    },

    getPending: function () { return dbGetAll(); },

    retryNow: function (id) {
      return dbGetAll().then(function (items) {
        var item = items.filter(function (it) { return it.id === id; })[0];
        if (!item) return false;
        return attemptUpload(item, true).then(function (ok) { notifyChange(); return ok; });
      });
    },

    retryAll: function () { return retryAll().then(function () { notifyChange(); }); },

    onChange: function (fn) { changeListeners.push(fn); }
  };
})();
