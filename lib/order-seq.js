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

  /* OrderID de las ordenes creadas desde `iso` (Created indexada en Orders,
     dueño 29/09/2026). */
  async function idsCreatedSince(iso) {
    const filter = encodeURIComponent(`fields/Created ge '${iso}'`);
    const rows = await pages(siteListPath(ORDERS) + '?$expand=fields($select=OrderID,Title)&$top=500&$filter=' + filter);
    return rows.map(it => it.fields && (it.fields.OrderID || it.fields.Title));
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
    else {
      /* Contador atrasado (02/10/2026, dueño: "arregla el contador"): si alguna
         orden se numero sin pasar por aqui (el codigo viejo de produccion, una
         ruta que se olvido del contador), el renglon se queda atras y se
         repetirian numeros. Antes de usarlo se revisan las ordenes creadas
         desde la ultima vez que se escribio (10 min de colchon) y se toma el
         mayor. Asi se corrige solo, sin borrar nada a mano. */
      const since = row.lastModifiedDateTime || row.fields.Modified;
      const t = since ? new Date(since).getTime() : NaN;
      if (!isNaN(t)) {
        const fresh = nextFromIds(await idsCreatedSince(new Date(t - 10 * 60000).toISOString()))[kind];
        if (fresh > start) start = fresh;
      }
    }
    let cur = start;
    /* Version del renglon que se leyo (05/10/2026): el guardado solo entra si
       nadie lo cambio desde entonces (If-Match). Asi dos ordenes al mismo
       tiempo nunca se quedan con el mismo numero. */
    const etag = row && (row['@odata.etag'] || row.eTag || '');
    return {
      next() { return cur++; },
      async commit() {
        if (row && cur === start && start === parseInt(row.fields.Value, 10)) return;
        const Value = String(cur);
        if (row && etag) {
          await graphFetch(siteListPath(SETTINGS) + '/' + encodeURIComponent(row.id) + '/fields', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify({ Value })
          });
        } else if (row) await updateListItemByItemId(SETTINGS, row.id, { Value });
        else await createListItem(SETTINGS, { Title: key, Key: key, Value });
      }
    };
  }

  /* Otro guardado gano la carrera (SharePoint: "The resource has changed
     since the caller last read it; usually an eTag mismatch"). */
  function isConflict(e) {
    return /etag|resource has changed|412|409|conflict|resourceModified/i.test(String((e && e.message) || e || ''));
  }

  /* Aparta n numeros seguidos y los guarda de una vez; regresa el primero.
     Si otra orden guardo el contador al mismo tiempo (05/10/2026, el 500 de
     las 11:26), se vuelve a leer y se toman los siguientes libres: nunca se
     repite un numero y la orden no truena. Hasta 6 intentos. */
  async function reserve(kind, n) {
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const c = await open(kind);
      const first = c.next();
      for (let i = 1; i < (n || 1); i++) c.next();
      try {
        await c.commit();
        return first;
      } catch (e) {
        if (!isConflict(e)) throw e;
        lastErr = e;
        await new Promise(r => setTimeout(r, 80 + Math.floor(Math.random() * 220) * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  return { open, reserve, nextFromIds, scan, idsCreatedSince, isConflict };
};
