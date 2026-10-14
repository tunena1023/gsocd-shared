/* ============================================================
   lib/closets.js -- el closet de material de cada edificio (14/10/2026,
   Warehouse; plan en Admin docs/material-en-sitio y HANDOFF "Operacion
   nueva"). Sin lista nueva: cada edificio ya existe (la direccion
   principal en Clients y los demas en ClientAddresses, igual que el
   selector de edificios de Recurring, donde la principal es 'main') y
   el closet va en una columna de texto `Closet` (JSON) de ese renglon.

   Llave de un edificio: '<ClientID>|main' o '<ClientID>|<id de ClientAddresses>'.
   Un edificio puede:
     - tener su closet (status Confirmed / Requested / To confirm),
     - usar el de otro edificio (uses = llave del otro; p. ej. los de
       Indigo en Newton usan uno solo),
     - no tener (status No closet).
   Los datos de quien tiene llave y del supervisor son ids de Techs.
   MISMO archivo para Admin (Warehouse) y Tech (la orden y el tab).
============================================================ */
'use strict';

const STATUSES = ['To confirm', 'Confirmed', 'Requested', 'No closet'];
const SIZES = ['Shelf / cabinet', 'Small room', 'Large room'];
const LOG_MAX = 40;
const COUNT_MAX = 26;

function truthy(v) { return v === true || v === 'true' || v === 1 || v === '1' || v === 'Yes'; }
function str(v) { return String(v == null ? '' : v).trim(); }
function ids(v) { return (Array.isArray(v) ? v : String(v || '').split(',')).map(str).filter(Boolean); }

/* Lo guardado (texto JSON o vacio) -> objeto con todo en su lugar. */
function parse(raw) {
  let c = {};
  if (raw && typeof raw === 'object') c = raw;
  else if (raw) { try { c = JSON.parse(raw); } catch (e) { c = {}; } }
  return {
    status: STATUSES.includes(c.status) ? c.status : 'To confirm',
    uses: str(c.uses),
    /* En que edificio del complejo esta (texto, como "Building 2"; plan PDF "Where is it"). */
    building: str(c.building),
    where: str(c.where),
    size: SIZES.includes(c.size) ? c.size : '',
    fitsUnits: !!c.fitsUnits,
    keys: ids(c.keys),
    afterHours: !!c.afterHours,
    weekends: !!c.weekends,
    contact: str(c.contact),
    supervisor: str(c.supervisor),
    notes: str(c.notes),
    lat: c.lat == null || c.lat === '' ? null : Number(c.lat),
    lon: c.lon == null || c.lon === '' ? null : Number(c.lon),
    updatedAt: str(c.updatedAt),
    updatedBy: str(c.updatedBy),
    log: Array.isArray(c.log) ? c.log.slice(-LOG_MAX) : [],
    /* Conteos del supervisor ({ at, by, items: { articulo: cantidad } }) y lo que bodega
       mando a este closet ({ at, by, items }); lib/supplies.js (plan fases 3-4). */
    counts: Array.isArray(c.counts) ? c.counts.slice(-COUNT_MAX) : [],
    sent: Array.isArray(c.sent) ? c.sent.slice(-COUNT_MAX) : [],
    /* Solicitudes de llave abiertas (key-request de Tech): las ve quien tiene
       llave en su tab Warehouse. Solo las de las ultimas 12 h. */
    open: Array.isArray(c.open) ? c.open.filter(r => r && r.requestId && Date.now() - new Date(r.at).getTime() < 12 * 3600000).slice(-10) : []
  };
}

/* Lo que manda la pantalla (patch) sobre lo que habia -> objeto nuevo +
   renglon de historial (quien y que cambio). Nunca borra el historial. */
const LABELS = { status: 'Status', uses: 'Uses closet of', building: 'Where', where: 'Where', size: 'Size', fitsUnits: 'Unit supplies fit',
  keys: 'Keys', afterHours: 'After hours', weekends: 'Weekends', contact: 'Property contact', supervisor: 'Supervisor',
  notes: 'Notes', lat: 'Location', lon: 'Location' };
function apply(prev, patch, by, at) {
  const cur = parse(prev);
  const next = Object.assign({}, cur);
  const changed = [];
  Object.keys(LABELS).forEach(k => {
    if (!patch || patch[k] === undefined) return;
    let v = patch[k];
    if (k === 'keys') v = ids(v);
    else if (k === 'fitsUnits' || k === 'afterHours' || k === 'weekends') v = !!v;
    else if (k === 'lat' || k === 'lon') v = v == null || v === '' ? null : Number(v);
    else v = str(v);
    if (k === 'status' && !STATUSES.includes(v)) return;
    if (k === 'size' && v && !SIZES.includes(v)) return;
    if (JSON.stringify(cur[k]) === JSON.stringify(v)) return;
    next[k] = v;
    if (!changed.includes(LABELS[k])) changed.push(LABELS[k]);
  });
  if (!changed.length) return { closet: cur, changed };
  next.updatedAt = at || new Date().toISOString();
  next.updatedBy = str(by);
  const what = changed.includes('Status') ? (next.status === 'Confirmed' ? 'Confirmed' : 'Status: ' + next.status) : 'Updated ' + changed.join(', ');
  next.log = cur.log.concat([{ at: next.updatedAt, by: next.updatedBy, what }]).slice(-LOG_MAX);
  return { closet: next, changed };
}

function serialize(c) { return JSON.stringify(c); }

/* Conteo del supervisor y lo que mando bodega: quedan en el closet y en su historial. */
function cleanItems(items) {
  const out = {};
  Object.keys(items || {}).forEach(k => { const n = Number(items[k]); if (str(k) && isFinite(n) && n >= 0) out[str(k)] = n; });
  return out;
}
function addCount(prev, items, by, low, at, variants) {
  const cur = parse(prev);
  const when = at || new Date().toISOString();
  /* variants (opcional): { Rags: { Green: 2, Blue: 1, ... }, Cleaner: { Bleach: 1, ... } } -- el desglose por tipo. */
  const entry = { at: when, by: str(by), items: cleanItems(items) };
  if (variants && Object.keys(variants).length) entry.variants = variants;
  cur.counts = cur.counts.concat([entry]).slice(-COUNT_MAX);
  cur.log = cur.log.concat([{ at: when, by: str(by), what: 'Count saved' + (low ? ' (' + low + ' item' + (low === 1 ? '' : 's') + ' low)' : '') }]).slice(-LOG_MAX);
  return cur;
}
function addSent(prev, items, by, at) {
  const cur = parse(prev);
  const when = at || new Date().toISOString();
  const it = cleanItems(items);
  cur.sent = cur.sent.concat([{ at: when, by: str(by), items: it }]).slice(-COUNT_MAX);
  cur.log = cur.log.concat([{ at: when, by: str(by), what: 'Sent from the warehouse: ' + Object.keys(it).map(k => it[k] + ' ' + k).join(', ') }]).slice(-LOG_MAX);
  return cur;
}

/* Todos los edificios de un cliente: el principal (Clients) y los de
   ClientAddresses no archivados. client/addresses: fields de SharePoint
   (addresses con .id). */
function buildingsOf(client, addresses) {
  const c = client || {};
  const cid = str(c.ClientID);
  const out = [{
    key: cid + '|main', clientId: cid, addressId: 'main', main: true,
    label: 'Main address', buildingNumber: '',
    address: [c.Address, c.Suite].map(str).filter(Boolean).join(', '), city: str(c.City), zip: str(c.Zip),
    street: str(c.Address),
    closet: parse(c.Closet)
  }];
  (addresses || []).forEach(a => {
    const f = a.fields || a;
    if (truthy(f.Archived) || str(f.ClientID) !== cid) return;
    const id = str(a.id || f.id);
    out.push({
      key: cid + '|' + id, clientId: cid, addressId: id, main: false,
      label: str(f.Label || f.Title) || ('Building ' + str(f.BuildingNumber)), buildingNumber: str(f.BuildingNumber),
      address: [f.Address, f.Suite].map(str).filter(Boolean).join(', '), city: str(f.City), zip: str(f.Zip),
      street: str(f.Address),
      closet: parse(f.Closet)
    });
  });
  return out;
}

/* El edificio de una orden: mismo criterio que los correos (notify
   matchAddress): misma calle y, si los dos lo tienen, mismo #; si no
   cuadra con ninguno, el principal. */
const norm = s => str(s).toLowerCase().replace(/[^a-z0-9]/g, '');
function buildingForOrder(order, buildings) {
  const o = order || {};
  const list = buildings || [];
  const street = norm(o.Address);
  const bldg = norm(o.BuildingNumber);
  const extra = list.filter(b => !b.main);
  const same = street ? extra.filter(b => norm(b.street) === street) : [];
  if (same.length) {
    if (bldg) { const exact = same.find(b => norm(b.buildingNumber) === bldg); if (exact) return exact; }
    return same.find(b => !norm(b.buildingNumber)) || same[0];
  }
  /* Sin calle igual: por # de edificio (las ordenes viejas solo traen "Building 3"). */
  if (bldg) { const byNum = extra.find(b => norm(b.buildingNumber) === bldg); if (byNum) return byNum; }
  return list.find(b => b.main) || null;
}

/* Sigue "usa el closet de" (hasta 3 saltos, sin ciclos). lookup(key) ->
   edificio o null. Regresa { building, closet, via } donde via es el
   edificio que tiene el closet de verdad. */
/* Un closet por complejo (plan PDF, dueño 14/10): un edificio que nunca se
   lleno (sin guardar y sin "usa") usa el del complejo (el principal). */
function resolve(building, lookup) {
  if (!building) return null;
  let cur = building, seen = new Set([building.key]);
  if (!cur.main && !cur.closet.uses && !cur.closet.updatedAt) {
    const main = lookup(cur.clientId + '|main');
    if (main) { cur = main; seen.add(main.key); }
  }
  for (let i = 0; i < 3 && cur.closet.uses; i++) {
    const nxt = lookup(cur.closet.uses);
    if (!nxt || seen.has(nxt.key)) break;
    seen.add(nxt.key);
    cur = nxt;
  }
  return { building, via: cur, closet: cur.closet, shared: cur.key !== building.key };
}

/* Para el tecnico: lo minimo, con nombres en vez de ids. techName(id) -> nombre. */
function forTech(res, techName, clientName) {
  if (!res) return null;
  const c = res.closet;
  const has = c.status !== 'No closet';
  return {
    key: res.via.key, buildingKey: res.building.key,
    status: c.status, has,
    place: (clientName ? clientName(res.via.clientId) : res.via.clientId) + (res.via.main ? '' : ' · ' + res.via.label),
    shared: res.shared,
    where: [c.building, c.where].filter(Boolean).join(', '), size: c.size, afterHours: c.afterHours, weekends: c.weekends,
    contact: c.contact, notes: c.notes,
    keys: c.keys.map(id => ({ id, name: techName ? techName(id) : id })).filter(k => k.name),
    open: c.open,
    supervisor: c.supervisor ? { id: c.supervisor, name: techName ? techName(c.supervisor) : c.supervisor } : null
  };
}

/* Carpeta de las fotos del closet (misma unidad de SharePoint que TechPhotos). */
function photoFolder(key) {
  const [cid, id] = String(key || '').split('|');
  return 'Warehouse/Closets/' + str(cid).replace(/[^A-Za-z0-9-]/g, '') + '/' + (str(id).replace(/[^A-Za-z0-9-]/g, '') || 'main');
}

module.exports = { STATUSES, SIZES, parse, apply, serialize, addCount, addSent, buildingsOf, buildingForOrder, resolve, forTech, photoFolder };
