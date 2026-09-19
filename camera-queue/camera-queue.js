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

     // Caso especial: una foto que SI se debe guardar de inmediato
     // pero todavia no se sabe a donde subirla (ej. foto tomada
     // mientras se crea una orden nueva, sin OrderID real todavia).
     const pendingId = await GSCameraQueue.enqueue({
       endpoint: '/upload-client-photo', body: { orderId: null, imageBase64 },
       notReady: true                        // no se toca sola hasta release()
     });
     // ... cuando ya se sepa el OrderID real:
     await GSCameraQueue.release(pendingId, { orderId: realOrderId });
     await GSCameraQueue.remove(pendingId);   // borrar sin subir (ej. se cancelo)

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
  /* BUG REAL reportado por el dueno (19/09/2026, confirmado en los 3
     repos): una foto salia duplicada -- el mismo item se subia 2
     veces. Causa real: enqueue() dispara un intento inmediato de
     subida, pero ese intento puede tardar (SharePoint via Graph no
     es instantaneo); mientras sigue en curso, el temporizador de
     retryAll() (cada retryIntervalMs) o el evento "online" pueden
     disparar OTRO intento para el MISMO item -- sigue en la cola
     (nadie lo borro todavia, eso solo pasa cuando el upload termina
     bien) asi que retryAll() lo vuelve a tomar. Los 2 intentos suben
     la foto en paralelo antes de que cualquiera alcance a borrarlo.
     Fix: un guard en memoria (uploadingIds), compartido por
     enqueue()/retryAll()/retryNow() dentro de la MISMA pagina --
     mientras un item ya se esta subiendo, cualquier otro intento
     para ese mismo id se ignora en vez de duplicar la subida. */
  var uploadingIds = {};

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
    if (uploadingIds[item.id]) return Promise.resolve(false); // ya se esta subiendo -- no dupliques
    uploadingIds[item.id] = true;
    return cfg.uploadFn(item).then(function () {
      delete uploadingIds[item.id];
      return dbDelete(item.id).then(function () { return true; });
    }).catch(function (err) {
      delete uploadingIds[item.id];
      item.attempts = (item.attempts || 0) + 1;
      item.lastError = (err && err.message) || String(err);
      item.failed = item.attempts >= (cfg.maxAttempts || 10);
      return dbPut(item).then(function () { return false; });
    });
  }

  function retryAll() {
    return dbGetAll().then(function (items) {
      var todo = items.filter(function (it) { return !it.failed && !it.notReady; });
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

    /* opts.notReady: true -- para cuando la foto SI se debe guardar
       de inmediato (regla de oro, sin excepcion) pero todavia no se
       sabe a donde subirla (ej. una foto tomada mientras se crea una
       orden nueva, que aun no tiene OrderID real). El item se guarda
       igual que cualquier otro, pero ni retryAll() ni el evento
       "online" ni el temporizador lo tocan solos -- se queda
       esperando hasta que alguien llame release() con el dato que
       faltaba. */
    enqueue: function (opts) {
      var item = {
        endpoint: opts.endpoint,
        body: opts.body,
        meta: opts.meta || {},
        attempts: 0,
        failed: false,
        notReady: !!opts.notReady,
        lastError: null,
        createdAt: Date.now()
      };
      return dbAdd(item).then(function (id) {
        item.id = id;
        if (item.notReady) { notifyChange(); return id; }
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

    /* Completa un item que se guardo con notReady:true, en cuanto se
       sepa el dato que faltaba (ej. el OrderID real ya existe) --
       mezcla bodyPatch encima del body que ya tenia, quita notReady,
       e intenta subir de inmediato (igual que un enqueue() normal). */
    release: function (id, bodyPatch) {
      return dbGetAll().then(function (items) {
        var item = items.filter(function (it) { return it.id === id; })[0];
        if (!item) return false;
        item.body = Object.assign({}, item.body, bodyPatch || {});
        item.notReady = false;
        return attemptUpload(item, false).then(function (ok) { notifyChange(); return ok; });
      });
    },

    remove: function (id) { return dbDelete(id).then(function () { notifyChange(); }); },

    onChange: function (fn) { changeListeners.push(fn); }
  };
})();
