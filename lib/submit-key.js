/* ============================================================
   lib/submit-key.js -- una orden nunca se crea dos veces por un
   reintento (05/10/2026, dueño: "este comportamiento se repite en dos
   portales, deberia ir en shared"). Uso:
     const sk = require('gsocd-shared/lib/submit-key')(require('./lib/graph'));

   El 02/10 Create Order dio 500, se volvio a picar Submit y en un PO de
   varias unidades las primeras ya habian quedado: el reintento las
   duplicaba. Ahora la pantalla manda una llave (SubmitKey, ver el
   componente submit-key/ de este repo) y aqui:
     read(body)          -> la llave del envio ('' si no trae)
     unitKey(key, i)     -> llave de la unidad i de un PO (key#i)
     find(key)           -> la orden que ya tiene esa llave, o null
     findUnits(key, n)   -> [orden|null] por cada unidad de un PO
     createOrder(fields, key) -> crea el renglon de Orders con su llave; si
                            la escritura falla, revisa si de todos modos
                            quedo (respuesta cortada) y si no, una vez mas.
   Cada portal decide que contesta cuando la orden ya existia.

   Columna Orders.SubmitKey (texto, indexada): Admin › Developer ›
   SharePoint columns. Sin llave todo funciona como antes. Si la busqueda
   falla, se sigue como antes (crear), nunca se le tumba el envio.
   La usan: Admin submit-order.js; Orders submit-order.js y add-batch-unit.js.
============================================================ */
module.exports = function createSubmitKey(graph) {
  const { graphFetch, siteListPath, createListItem } = graph;
  const ORDERS = graph.ORDERS_LIST || 'Orders';
  const PREFER = { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function read(body) { return String((body && body.SubmitKey) || '').trim().slice(0, 120); }
  function unitKey(key, i) { return key ? key + '#' + i : ''; }

  async function find(key) {
    if (!key) return null;
    try {
      const filter = "fields/SubmitKey eq '" + String(key).replace(/'/g, "''") + "'";
      const data = await graphFetch(siteListPath(ORDERS) + '?$expand=fields&$top=5&$filter=' + encodeURIComponent(filter), PREFER);
      return ((data && data.value) || []).find(it => it.fields && it.fields.SubmitKey === key) || null;
    } catch (e) {
      console.error('submit-key: lookup failed (' + e.message + ') -- creating as before');
      return null;
    }
  }

  function findUnits(key, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(key ? find(unitKey(key, i)) : null);
    return Promise.all(out);
  }

  async function createOrder(fields, key) {
    const row = key ? Object.assign({}, fields, { SubmitKey: key }) : fields;
    try { return await createListItem(ORDERS, row); } catch (e1) {
      if (!key) throw e1; /* sin llave no se puede saber si quedo: como antes */
      const there = await find(key);
      if (there) return there;
      await wait(800);
      return createListItem(ORDERS, row);
    }
  }

  return { read, unitKey, find, findUnits, createOrder };
};
