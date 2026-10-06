/* gsocd-shared (06/10/2026): antes era una copia identica en Admin, Orders y
   Tech; ahora vive aqui y cada portal la carga desde su lib/ con una linea
   (los portales fijan gsocd-shared por SHA en package.json). */
/* ============================================================
   lib/with-action-key.js -- segundo plano, fases 2 a 4 (05/10/2026,
   dueño: "hazlo todo en preview"). Envuelve una ruta que trabaja sobre
   UNA orden (body.orderId) para que un reintento de GSBackground nunca
   haga algo dos veces: si la orden ya tiene esa body.actionKey en
   Orders.ActionKeys, contesta "listo" sin repetir nada; si la ruta
   termina bien (200), guarda la llave en la orden.

   Es lo mismo que admin-update-order hace a mano (gsocd-shared
   lib/action-key), sin tocar cada salida de la ruta. Sin actionKey (las
   llamadas de siempre) la ruta corre igual que antes. Si algo de esto
   falla, nunca truena la accion real.

   Uso:  exports.handler = withActionKey(async (event) => { ... });
============================================================ */
const actionKey = require('./action-key');

/* Uso desde un portal (graph y list-query se piden hasta que se usan: las
   pruebas cambian lib/graph antes de cargar la ruta):
     require('gsocd-shared/lib/with-action-key')(() => require('./graph'), () => require('./list-query')) */
module.exports = (getGraph, getLq) => function withActionKey(handler) {
  return async (event) => {
    let body = {};
    try { body = JSON.parse((event && event.body) || '{}'); } catch (e) { /* la ruta contesta */ }
    const key = actionKey.clean(body.actionKey);
    /* Una orden (orderId) o varias (orders[] de QuickBooks, orderIds[]). */
    const ids = [...new Set([body.orderId].concat((body.orders || []).map(o => o && (o.OrderID || o.orderId)), body.orderIds || [])
      .map(x => String(x || '').trim()).filter(Boolean))];
    if (!key || !ids.length) return handler(event);
    const { ORDERS_LIST, updateListItemByItemId, jsonResponse } = getGraph();
    const lq = getLq();
    const find = async () => ((await lq.fetchByValues(ORDERS_LIST, 'OrderID', ids)) || []).filter(it => it.fields && ids.includes(it.fields.OrderID));
    try {
      /* La llave es de UNA accion: si cualquiera de sus ordenes ya la tiene, ya se hizo. */
      if ((await find()).some(it => actionKey.seen(it.fields, key))) return jsonResponse(200, actionKey.duplicate());
    } catch (e) { /* sin poder revisar, se hace como siempre */ }
    const res = await handler(event);
    if (res && res.statusCode === 200) {
      try {
        for (const item of await find()) await actionKey.stamp(p => updateListItemByItemId(ORDERS_LIST, item.id, p), item.fields, key);
      } catch (e) { console.error('with-action-key: could not save the key:', e.message); }
    }
    return res;
  };
};
