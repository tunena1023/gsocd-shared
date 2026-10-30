/* ============================================================
   lib/recurring-published.js -- contratos recurrentes "no publicados".
   Antes eran 3 copias (Admin, Orders, Tech) que se portaban distinto
   cuando la lista de contratos no se podia leer: Admin ensenaba todas las
   visitas REC, Orders y Tech las escondian sin avisar. Ahora es una sola.

   RecurringServices.Published (Si/No). Vacio = publicado: los contratos
   viejos no cambian. Solo Published = No esconde. Mientras no esta
   publicado, el cliente no ve el contrato ni sus visitas REC, ningun
   tecnico las ve y no sale ningun correo de ese contrato.

   Uso desde un portal (una linea en lib/recurring-published.js):
     require('gsocd-shared/lib/recurring-published')(require('./graph'),
       () => require('./list-query'), { audience: 'office' | 'client' | 'tech' })

   audience:
     office (Admin)  -> si la lista de contratos no se puede leer, NO se
                        esconde nada (la oficina ve sus visitas) y se avisa
                        en el log. Las inspecciones internas si se ven.
     client (Orders) -> si no se puede leer, la carga FALLA con 503 (la
     tech   (Tech)      pantalla se queda con lo ultimo que vio y reintenta).
                        Nunca se esconde en silencio ni se ensena de mas.
                        client ademas esconde Orders.HiddenFromClient.

   isPublished(fields)            -> bool
   internalInspection(fields)     -> bool (Orders.HiddenFromClient)
   isContractPublished(id)        -> bool (no existe o no se pudo leer = false)
   contractState(id)              -> 'published' | 'unpublished' | 'error'
   contractIdOf(opts)             -> el contrato de un aviso al cliente
   forget(id?)                    -> borra el cache corto
   hiddenAll()                    -> { has, unpublished, known, ok } de todos
   hiddenForClient(clientId)      -> lo mismo, solo los contratos de ese cliente
   hiddenForClients(ids)          -> { <clientId en minusculas>: res } (cache 1 min)
   fromRows(rows, ok)             -> lo mismo que hiddenAll con renglones ya leidos
   hiddenOrder(hidden, fields)    -> la visita no debe salir
   ContractsUnavailable           -> el error (status 503) de client/tech
============================================================ */
'use strict';

const isPublished = f => !f || !(f.Published === false || f.Published === 'false' || f.Published === 0 || f.Published === 'No');

/* Orden escondida al cliente (inspeccion de un contrato sin publicar o interna mandada a un cliente). */
const internalInspection = f => !!f && [true, 'true', 1, '1', 'Yes'].includes(f.HiddenFromClient);

class ContractsUnavailable extends Error {
  constructor(cause) {
    super('Recurring contracts could not be read' + (cause && cause.message ? ': ' + cause.message : ''));
    this.name = 'ContractsUnavailable';
    this.status = 503;
    this.code = 'CONTRACTS_UNAVAILABLE';
  }
}

module.exports = function recurringPublished(g, lqOf, opts) {
  const audience = (opts && opts.audience) || 'office';
  if (!['office', 'client', 'tech'].includes(audience)) throw new Error('recurring-published: unknown audience ' + audience);
  const strict = audience !== 'office';
  const lq = () => (typeof lqOf === 'function' ? lqOf() : lqOf);
  const listPath = () => g.siteListPath(g.RECURRING_SERVICES_LIST);

  const TTL = 60 * 1000;
  const cache = new Map();

  async function readContract(key) {
    const it = await g.graphFetch(listPath() + '/' + encodeURIComponent(key) + '?$expand=fields');
    const value = !!(it && it.fields) && isPublished(it.fields);
    cache.set(key, { at: Date.now(), value });
    return value;
  }

  /* Un contrato que ya no existe o que no se pudo leer cuenta como NO publicado: no sale nada al cliente. */
  async function isContractPublished(id) {
    const key = String(id || '').trim();
    if (!key) return true;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.value;
    try { return await readContract(key); } catch (e) { return false; }
  }

  /* Para quien necesita distinguir "no se pudo leer" de "sin publicar". Sin cache para 'error'. */
  async function contractState(id) {
    const key = String(id || '').trim();
    if (!key) return 'published';
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.value ? 'published' : 'unpublished';
    try { return (await readContract(key)) ? 'published' : 'unpublished'; } catch (e) {
      return /404|itemNotFound/i.test(String(e && e.message)) ? 'unpublished' : 'error';
    }
  }

  async function contractIdOf(o) {
    if (!o) return '';
    if (o.contractId) return String(o.contractId);
    if (o.order && o.order.RecurringServiceID) return String(o.order.RecurringServiceID);
    const orderId = String(o.orderId || (o.order && o.order.OrderID) || '');
    if (!/-REC\d+$/.test(orderId)) return '';
    try {
      const rows = await g.queryList(g.ORDERS_LIST, '$expand=fields&$filter=' + encodeURIComponent("fields/OrderID eq '" + orderId.replace(/'/g, "''") + "'"));
      const f = rows[0] && rows[0].fields;
      return f && f.RecurringServiceID ? String(f.RecurringServiceID) : '';
    } catch (e) { return ''; }
  }

  function forget(id) { if (id === undefined) cache.clear(); else cache.delete(String(id)); }

  function blank() {
    const unpublished = new Set(), known = new Set();
    return { has: id => unpublished.has(String(id)), unpublished, known, ok: true };
  }
  function add(res, it) {
    if (!it || !it.fields) return;
    res.known.add(String(it.id));
    if (!isPublished(it.fields)) res.unpublished.add(String(it.id));
  }
  function unreadable(res, e, where) {
    if (strict) throw new ContractsUnavailable(e);
    console.warn('recurring-published: ' + where + ' could not be read (' + (e && e.message) + ') -- nothing hidden');
    res.ok = false;
    return res;
  }

  function fromRows(rows, ok) {
    const res = blank();
    (rows || []).forEach(it => add(res, it));
    if (ok === false) return unreadable(res, new Error('read failed'), 'contracts');
    return res;
  }

  async function hiddenAll() {
    let rows;
    try { rows = await lq().fetchAllCached(g.RECURRING_SERVICES_LIST); } catch (e) { return unreadable(blank(), e, 'contracts'); }
    return fromRows(rows);
  }

  async function byClients(ids) {
    const map = {};
    ids.forEach(c => { map[c.toLowerCase()] = blank(); });
    let rows;
    try { rows = await lq().fetchByValues(g.RECURRING_SERVICES_LIST, 'ClientID', ids); } catch (e) {
      if (strict) throw new ContractsUnavailable(e);
      Object.values(map).forEach(r => unreadable(r, e, 'contracts of ' + ids.join(',')));
      return map;
    }
    rows.forEach(it => { const r = map[String((it.fields && it.fields.ClientID) || '').trim().toLowerCase()]; if (r) add(r, it); });
    manyCache.set(ids.map(c => c.toLowerCase()).sort().join('|'), { at: Date.now(), map });
    return map;
  }

  /* ClientID no esta indexado en RecurringServices: va con Prefer, como todo $filter. */
  async function hiddenForClient(clientId) {
    const cid = String(clientId || '').trim();
    const res = blank();
    if (!cid) return res;
    let url = listPath() + '?$expand=fields&$top=200&$filter=' + encodeURIComponent(`fields/ClientID eq '${cid.replace(/'/g, "''")}'`);
    try {
      while (url) {
        const data = await g.graphFetch(url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
        (data.value || []).forEach(it => add(res, it));
        url = data['@odata.nextLink'] || null;
      }
    } catch (e) { return unreadable(blank(), e, 'contracts of ' + cid); }
    return res;
  }

  /* Varias propiedades de una cuenta master en UNA consulta, con copia de 1 min. */
  const manyCache = new Map();
  async function hiddenForClients(clientIds) {
    const ids = [...new Set((clientIds || []).map(c => String(c || '').trim()).filter(Boolean))];
    const hit = manyCache.get(ids.map(c => c.toLowerCase()).sort().join('|'));
    if (hit && Date.now() - hit.at < TTL) return hit.map;
    return byClients(ids);
  }

  /* Se esconde: lo de un contrato sin publicar y, si no esta Completed, lo de un contrato que ya no
     existe (lo Completed de un contrato borrado si sale: trabajo hecho). Al cliente, ademas, lo
     HiddenFromClient. Con la lista sin leer (solo office) no se esconde nada mas que lo ya sabido. */
  function hiddenOrder(hidden, f) {
    if (audience === 'client' && internalInspection(f)) return true;
    if (!f || !f.RecurringServiceID) return false;
    if (!hidden) { if (strict) throw new ContractsUnavailable(); return false; }
    const id = String(f.RecurringServiceID);
    if (hidden.has(id)) return true;
    if (hidden.ok === false) { if (strict) throw new ContractsUnavailable(); return false; }
    if (f.Status === 'Completed') return false;
    return !!(hidden.known && !hidden.known.has(id));
  }

  return {
    audience, isPublished, internalInspection, isContractPublished, contractState, contractIdOf, forget,
    hiddenAll, hiddenForClient, hiddenForClients, fromRows, hiddenOrder, ContractsUnavailable
  };
};

module.exports.isPublished = isPublished;
module.exports.internalInspection = internalInspection;
module.exports.ContractsUnavailable = ContractsUnavailable;
