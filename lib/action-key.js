/* ============================================================
   gsocd-shared/lib/action-key.js -- que un reintento en segundo plano
   nunca haga algo dos veces (05/10/2026, dueño: "nada deja al usuario
   esperando"). La otra mitad es background/background.js (navegador).

   Cada accion que manda GSBackground trae body.actionKey (una llave al
   azar por accion). La orden guarda las ultimas llaves que ya se
   hicieron en Orders.ActionKeys (texto JSON). Si llega otra vez la misma
   llave (la primera si se guardo pero la respuesta no llego), la ruta
   contesta "listo" sin repetir nada: ni otro renglon de historial, ni
   otro correo, ni un "already completed" que la cola tomaria por error.

   Uso en una ruta que trabaja sobre una orden (f = fields de Orders):
     const ak = require('gsocd-shared/lib/action-key');
     if (ak.seen(f, body.actionKey)) return jsonResponse(200, ak.duplicate());
     ... la accion de siempre ...
     await ak.stamp(patch => updateListItemByItemId(ORDERS_LIST, item.id, patch), f, body.actionKey);

   Si la columna Orders.ActionKeys todavia no existe, stamp falla en
   silencio y todo funciona como antes (sin esta proteccion). Nunca
   truena la accion real.
============================================================ */
'use strict';

const MAX = 30;

function keysOf(f) {
  try {
    const a = JSON.parse(String((f && f.ActionKeys) || '[]'));
    return Array.isArray(a) ? a.map(String) : [];
  } catch (e) { return []; }
}

function clean(key) {
  const k = String(key || '').trim();
  return /^[A-Za-z0-9._-]{8,80}$/.test(k) ? k : '';
}

function seen(f, key) {
  const k = clean(key);
  return !!k && keysOf(f).includes(k);
}

function duplicate() { return { success: true, duplicate: true }; }

/* update(patch) -> Promise: el PATCH de esa misma orden. */
async function stamp(update, f, key) {
  const k = clean(key);
  if (!k || typeof update !== 'function') return false;
  const list = keysOf(f).filter(x => x !== k);
  list.push(k);
  try {
    await update({ ActionKeys: JSON.stringify(list.slice(-MAX)) });
    if (f) f.ActionKeys = JSON.stringify(list.slice(-MAX));
    return true;
  } catch (e) {
    console.error('action-key: could not save the key (is Orders.ActionKeys created?):', e.message);
    return false;
  }
}

module.exports = { seen, stamp, duplicate, keysOf, clean, MAX };
