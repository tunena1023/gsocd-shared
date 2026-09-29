/* ============================================================
   lib/order-seq.js -- el siguiente numero de orden SIN leer toda la
   lista Orders (29/09/2026, dueño: "en lugar de leer todo se lea por
   fecha y cliente"). Uso: require('gsocd-shared/lib/order-seq')(graph)

   Los numeros son GLOBALES (todos los clientes comparten el contador):
     suffix -- GS-1053-1005 (arranca en 1001)
     po     -- ...-PO5000 de un pedido de varias unidades (arranca en 5000)
     rec    -- GS-1046-REC23 de una visita recurrente (arranca en 1)
   Antes cada orden nueva (y el cron de recurrentes) leia la lista
   completa para sacar el mayor; con miles de ordenes eso se vuelve lento
   y llega al limite de 60 s. Ahora el siguiente numero vive en Settings
   (Key seq_suffix / seq_po / seq_rec). Solo la PRIMERA vez (sin renglon)
   se calcula leyendo el OrderID de toda la lista, y se guarda.

   Admin y Orders usan esta misma pieza, sobre el mismo SharePoint, asi
   que comparten el contador. Toda ruta que cree ordenes tiene que pasar
   por aqui; si alguna no lo hiciera, el contador se quedaria atras.
============================================================ */
module.exports = function createOrderSeq(graph) {
  const { graphFetch, siteListPath, createListItem, updateListItemByItemId } = graph;
  const SETTINGS = graph.SETTINGS_LIST || 'Settings';
  const ORDERS = graph.ORDERS_LIST || 'Orders';
  const PREFER = { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } };

  async function pages(url) {
    const out = [];
    while (url) {
      const data = await graphFetch(url, PREFER);
      out.push(...(data.value || []));
      url = data['@odata.nextLink'] || null;
    }
    return out;
  }

  /* Mismas reglas que nextGlobalSuffix / nextGlobalPO / nextRecId. */
  function nextFromIds(ids) {
    let suffix = 0, po = 0, rec = 0;
    (ids || []).forEach(raw => {
      const id = String(raw || '');
      if (!id || id.includes('-TEMP-')) return;
      const r = /-REC(\d+)$/i.exec(id);
      if (r) { rec = Math.max(rec, parseInt(r[1], 10)); return; }
      const p = /-PO(\d+)$/.exec(id);
      if (p) po = Math.max(po, parseInt(p[1], 10));
      const parts = id.split('-');
      const last = parts[parts.length - 1];
      const s = parseInt(/^PO\d+$/.test(last) ? parts[parts.length - 2] : last, 10);
      if (!isNaN(s)) suffix = Math.max(suffix, s);
    });
    return { suffix: suffix ? suffix + 1 : 1001, po: po ? po + 1 : 5000, rec: rec + 1 };
  }

  async function scan() {
    const rows = await pages(siteListPath(ORDERS) + '?$expand=fields($select=OrderID,Title)&$top=500');
    return nextFromIds(rows.map(it => it.fields && (it.fields.OrderID || it.fields.Title)));
  }

  async function settingsRow(key) {
    const rows = await pages(siteListPath(SETTINGS) + '?$expand=fields&$top=200');
    return rows.find(it => it.fields && String(it.fields.Key || '') === key) || null;
  }

  /* Abre un contador: next() da numeros seguidos; commit() guarda el
     siguiente libre. Para muchas ordenes en una sola corrida (cron). */
  async function open(kind) {
    if (!['suffix', 'po', 'rec'].includes(kind)) throw new Error('Unknown counter: ' + kind);
    const key = 'seq_' + kind;
    const row = await settingsRow(key);
    let start = row ? parseInt(row.fields.Value, 10) : NaN;
    if (!(start > 0)) start = (await scan())[kind];
    let cur = start;
    return {
      next() { return cur++; },
      async commit() {
        if (row && cur === start) return;
        const Value = String(cur);
        if (row) await updateListItemByItemId(SETTINGS, row.id, { Value });
        else await createListItem(SETTINGS, { Title: key, Key: key, Value });
      }
    };
  }

  /* Aparta n numeros seguidos y los guarda de una vez; regresa el primero. */
  async function reserve(kind, n) {
    const c = await open(kind);
    const first = c.next();
    for (let i = 1; i < (n || 1); i++) c.next();
    await c.commit();
    return first;
  }

  return { open, reserve, nextFromIds, scan };
};
