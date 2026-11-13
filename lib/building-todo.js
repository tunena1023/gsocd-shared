/* ============================================================
   gsocd-shared / lib/building-todo.js -- una orden con una direccion que no es la principal del cliente ni la de
   ninguno de sus edificios: la app la agrega sola como edificio "por completar" (ClientAddresses.NeedsInfo = la
   orden), con la direccion tal cual. La orden NO cambia. Clients lo pide (redondito, el cliente brilla) y ahi se
   completa o se archiva (CFO 12/11/2026, Fernanda #20).

   Misma calle, ciudad y zip (5) = el mismo (la suite no cuenta: es la unidad; "Ave." = "Ave"); si uno no trae ciudad o zip,
   eso no se compara. Un edificio archivado con esa direccion cuenta como que ya esta (archivar = "no aplica"). Las visitas
   de Recurring no cuentan (salen de su edificio).
   La direccion de la orden puede ser texto libre (el Edit de la orden: Address en un solo campo, sin City/Zip): se separa
   con lib/address-city (calle, ciudad, zip) y el texto tal cual va en NeedsInfo: "<orden> | <texto>".

   todoFor(client, addresses, order)  -> los campos del edificio nuevo, o null
   ensure(g, orderOrId)               -> { created, id } | { skipped }   (g: lib/graph del portal)
   afterSubmit(g, response)           -> ensure de cada orden de una respuesta 200 de submit-order (nunca truena)
   sweep(g, opts)                     -> las ordenes abiertas: { checked, created: [{ orderId, id, address }] }
   Dos guardados a la vez con la misma direccion: se queda el de id mas chico y el otro se borra.
============================================================ */
'use strict';

const str = v => String(v == null ? '' : v).trim();
const norm = s => str(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const truthy = v => v === true || v === 'true' || v === 1 || v === '1' || v === 'Yes';
const fieldsOf = a => (a && a.fields) || a || {};
const idOf = a => str(a && (a.id != null ? a.id : fieldsOf(a).id));
const key = f => [norm(f.Address), norm(f.City), norm(f.Zip).slice(0, 5)].join('|');
/* La direccion de una orden en partes: sus campos, o el texto libre separado (sin inventar lo que no trae). */
function partsOf(o) {
  if (str(o.City) || str(o.Zip)) return { Address: str(o.Address), Suite: str(o.Suite), City: str(o.City), Zip: str(o.Zip), text: '' };
  const t = str(o.Address);
  const sp = require('./address-city').splitInline(t);
  return sp ? { Address: sp.address, Suite: str(o.Suite), City: sp.city || '', Zip: sp.zip || '', text: t } : { Address: t, Suite: str(o.Suite), City: '', Zip: '', text: t };
}
/* Misma calle; ciudad y zip solo si los dos los traen. */
function same(a, b) {
  if (!norm(a.Address) || norm(a.Address) !== norm(b.Address)) return false;
  if (norm(a.City) && norm(b.City) && norm(a.City) !== norm(b.City)) return false;
  const za = norm(a.Zip).slice(0, 5), zb = norm(b.Zip).slice(0, 5);
  return !(za && zb && za !== zb);
}
const orderOf = needs => str(needs).split(' | ')[0];
const CLOSED = ['Completed', 'Cancelled'];

function isOpen(o) { return !CLOSED.includes(str(o.Status)) && !truthy(o.Archived); }

function todoFor(client, addresses, order) {
  const c = fieldsOf(client), o = fieldsOf(order);
  const cid = norm(o.ClientID);
  if (!cid || norm(c.ClientID) !== cid) return null;
  if (str(o.RecurringServiceID)) return null;
  if (!str(o.Address)) return null;
  const p = partsOf(o);
  if (str(c.Address) && same(p, c)) return null;
  if ((addresses || []).some(a => norm(fieldsOf(a).ClientID) === cid && same(p, fieldsOf(a)))) return null;
  const needs = (str(o.OrderID) + (p.text ? ' | ' + p.text : '')).slice(0, 255);
  const f = { Title: p.Address.slice(0, 255), ClientID: str(c.ClientID), Label: p.Address.slice(0, 255), BuildingNumber: '', Address: p.Address, Suite: p.Suite,
    City: p.City, Zip: p.Zip, ContactId: '', OfficeHours: '', Archived: false, NeedsInfo: needs };
  if (o.Latitude != null && o.Latitude !== '' && o.Longitude != null && o.Longitude !== '') { f.Latitude = Number(o.Latitude); f.Longitude = Number(o.Longitude); }
  return f;
}

/* Despues de crear: los de la misma direccion que nacieron por una orden; el de id mas chico se queda. */
function settle(rows, mineId, f) {
  const dupes = (rows || []).filter(a => !truthy(fieldsOf(a).Archived) && str(fieldsOf(a).NeedsInfo) && same(fieldsOf(a), f))
    .sort((a, b) => Number(idOf(a)) - Number(idOf(b)));
  const keep = dupes.length ? idOf(dupes[0]) : str(mineId);
  return { keep, drop: keep !== str(mineId) ? str(mineId) : null };
}

async function ensure(g, orderOrId, cache) {
  const lq = require('./list-query')(g);
  let o = typeof orderOrId === 'object' ? fieldsOf(orderOrId) : null;
  if (!o) {
    const rows = await lq.fetchByField(g.ORDERS_LIST, 'OrderID', str(orderOrId));
    o = fieldsOf(rows.find(it => it.fields) || null);
    if (!o || !o.OrderID) return { skipped: 'order not found' };
  }
  const cid = str(o.ClientID);
  const client = cache && cache.clients ? cache.clients.find(c => norm(fieldsOf(c).ClientID) === norm(cid))
    : (await lq.fetchByField(g.CLIENTS_LIST, 'ClientID', cid)).find(it => it.fields && norm(it.fields.ClientID) === norm(cid));
  if (!client) return { skipped: 'client not found' };
  const addrs = cache && cache.addresses ? cache.addresses : await lq.fetchByField(g.CLIENT_ADDRESSES_LIST, 'ClientID', cid);
  const f = todoFor(client, addrs, o);
  if (!f) return { skipped: 'known address' };
  const made = await g.createListItem(g.CLIENT_ADDRESSES_LIST, f);
  if (cache && cache.addresses) cache.addresses.push({ id: idOf(made), fields: f });
  const again = await lq.fetchByField(g.CLIENT_ADDRESSES_LIST, 'ClientID', cid).catch(() => []);
  const st = settle(again.concat(again.some(a => idOf(a) === idOf(made)) ? [] : [made]), idOf(made), f);
  if (st.drop) {
    await g.deleteListItem(g.CLIENT_ADDRESSES_LIST, st.drop).catch(e => console.error('building-todo: duplicate building ' + st.drop + ' not deleted: ' + e.message));
    return { created: false, id: st.keep, orderId: str(o.OrderID) };
  }
  return { created: true, id: st.keep, orderId: str(o.OrderID), address: [f.Address, f.City, f.Zip].filter(Boolean).join(', ') };
}

/* Lo que contesto submit-order: una orden (orderId), un lote (orderIds) o una unidad agregada. */
async function afterSubmit(g, response) {
  try {
    if (!response || Number(response.statusCode) !== 200) return [];
    let b = {}; try { b = JSON.parse(response.body || '{}'); } catch (e) { return []; }
    const ids = [].concat(b.orderIds || [], b.orderId ? [b.orderId] : []).map(str).filter(Boolean);
    const out = [];
    for (const id of ids.filter((x, i, a) => a.indexOf(x) === i)) {
      try { out.push(await ensure(g, id)); }
      catch (e) { console.error('building-todo: ' + id + ' not checked (the nightly sweep tries again): ' + e.message); }
    }
    return out;
  } catch (e) { console.error('building-todo: ' + e.message); return []; }
}

async function sweep(g, opts) {
  opts = opts || {};
  const lq = require('./list-query')(g);
  const deadline = opts.deadline || Infinity;
  const [orders, clients, addresses] = await Promise.all([lq.fetchAll(g.ORDERS_LIST), lq.fetchAll(g.CLIENTS_LIST), lq.fetchAll(g.CLIENT_ADDRESSES_LIST)]);
  const open = orders.map(fieldsOf).filter(o => o.OrderID && isOpen(o) && !str(o.RecurringServiceID) && str(o.Address));
  const out = { checked: 0, created: [], notDone: 0 };
  for (const o of open) {
    if (Date.now() > deadline) { out.notDone++; continue; }
    out.checked++;
    try { const r = await ensure(g, o, { clients, addresses }); if (r.created) out.created.push(r); }
    catch (e) { console.error('building-todo sweep: ' + o.OrderID + ': ' + e.message); }
  }
  return out;
}

module.exports = { todoFor, settle, ensure, afterSubmit, sweep, isOpen, key, partsOf, same, orderOf };
