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

  window.GSSubmitKey = { key: key, forget: forget, sendOnce: sendOnce, fingerprint: fingerprint };
})();
