/* ============================================================
   lib/supplies.js -- paquetes (kits), articulos y conteos del closet
   (14/10/2026, dueño; plan docs/material-en-sitio de Admin, fases 2-4).
   MISMO archivo para Admin (Warehouse › Kits, Inventory, Reports) y Tech
   (el supervisor deja el paquete y cuenta su closet; el tecnico lo recoge).

   Donde vive cada cosa (columnas de SharePoint, lib/sp-columns de Admin):
   - Orders.KitStatus / KitLog: el paquete de cada orden y quien lo movio.
   - ServicesCatalog.KitItems: que lleva el paquete de ese servicio, por
     numero de recamaras ({ none, byBedrooms: { '1': [{item, qty}], any: [...] } }).
   - Lista SupplyItems: los articulos (Title = nombre, Unit, OnHand,
     KeepAtLeast = minimo en bodega, ClosetKeep = minimo en cada closet).
   - Closet (JSON, lib/closets.js): counts (conteos del supervisor) y sent
     (lo que bodega mando a ese closet).
============================================================ */
'use strict';

const KIT_STATUSES = ['To pack', 'Packed', 'In closet', 'Picked up'];
const str = v => String(v == null ? '' : v).trim();
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

/* Que ordenes llevan paquete: unidades de Janitorial (o Mixed), no las
   visitas de recurrentes (esas usan lo que hay en el closet). */
function isKitOrder(f) {
  const o = f || {};
  if (!/^(Janitorial|Mixed)$/i.test(str(o.Division))) return false;
  if (str(o.RecurringServiceID) || /-REC\d+/i.test(str(o.OrderID))) return false;
  return !/^(Cancelled|Canceled|Rejected|Draft)$/i.test(str(o.Status));
}
function kitStatusOf(f) { return KIT_STATUSES.includes(str(f && f.KitStatus)) ? str(f.KitStatus) : 'To pack'; }
function parseLog(raw) {
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

/* Quien puede mover el paquete a que estado:
   bodega: To pack <-> Packed; supervisor: Packed -> In closet;
   tecnico: Packed / In closet -> Picked up. */
const MOVES = { 'To pack': ['Packed'], 'Packed': ['To pack', 'In closet', 'Picked up'], 'In closet': ['Picked up', 'Packed'], 'Picked up': [] };
function kitApply(f, next, by, at) {
  const cur = kitStatusOf(f);
  if (!KIT_STATUSES.includes(next) || !(MOVES[cur] || []).includes(next)) return null;
  const when = at || new Date().toISOString();
  return { KitStatus: next, KitLog: JSON.stringify(parseLog(f && f.KitLog).concat([{ at: when, by: str(by), status: next }]).slice(-20)) };
}
/* Cuando paso a ese estado (para "Picked up 8:06 AM" / "left 3:40 PM"). */
function kitWhen(f, status) {
  const l = parseLog(f && f.KitLog).filter(x => x.status === status);
  return l.length ? l[l.length - 1] : null;
}

/* Lo que lleva el paquete de un servicio (ServicesCatalog.KitItems). */
function parseKitItems(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v || '{}'); } catch (e) { v = {}; } }
  v = v && typeof v === 'object' ? v : {};
  const by = {};
  Object.keys(v.byBedrooms || {}).forEach(k => {
    const list = (Array.isArray(v.byBedrooms[k]) ? v.byBedrooms[k] : []).map(x => ({ item: str(x && x.item), qty: num(x && x.qty) })).filter(x => x.item && x.qty > 0);
    if (list.length) by[str(k)] = list;
  });
  return { none: !!v.none, byBedrooms: by };
}
const shortName = s => str(s).replace(/\s*cleaning\s*$/i, '') || str(s);
/* services: renglones de OrderServices (fields) de la orden; catalogBySku: SKU -> fields de ServicesCatalog. */
function kitFor(order, services, catalogBySku) {
  const bed = str(order && order.Bedrooms);
  const list = (services || []).filter(s => s && str(s.ServiceName));
  for (const s of list) {
    const cat = (catalogBySku || {})[str(s.SubOption)] || null;
    if (!cat || !cat.KitItems) continue;
    const k = parseKitItems(cat.KitItems);
    if (k.none) return { name: shortName(s.ServiceName), none: true, contents: [], sku: str(s.SubOption) };
    const contents = k.byBedrooms[bed] || k.byBedrooms.any || null;
    if (contents) return { name: shortName(s.ServiceName) + (bed ? ' ' + bed + ' bed' : ''), contents, sku: str(s.SubOption) };
  }
  const first = list[0];
  return { name: first ? shortName(first.ServiceName) + (bed ? ' ' + bed + ' bed' : '') : 'Kit', contents: [], unset: true, sku: first ? str(first.SubOption) : '' };
}
function contentsText(contents) {
  return (contents || []).map(c => (c.qty === 1 ? '' : c.qty + ' × ') + c.item).join(' + ');
}
/* "Unit 211 – Azucena" (unidad y persona). */
function kitLabel(f, people) {
  const o = f || {};
  const who = (people || []).map(p => str(p).split(/\s+/)[0]).filter(Boolean);
  return (str(o.UnitNumber) ? 'Unit ' + str(o.UnitNumber) : str(o.BusinessName) || str(o.OrderID)) + (who.length ? ' – ' + who.join(', ') : '');
}

/* ===== Articulos (lista SupplyItems) ===== */
function itemOf(row) {
  const f = (row && row.fields) || row || {};
  return { id: str(row && row.id), name: str(f.Title), unit: str(f.Unit), onHand: num(f.OnHand), keep: num(f.KeepAtLeast),
    closetKeep: num(f.ClosetKeep), active: f.Active !== false && f.Active !== 'false', moves: parseLog(f.Moves) };
}

/* ===== Conteo del closet y lo que hay que reponer ===== */
function lastCount(closet) { const l = (closet && closet.counts) || []; return l.length ? l[l.length - 1] : null; }
/* Lo que el closet necesita segun su ultimo conteo (si ya se mando despues de ese conteo, nada). */
function restockOf(closet, items) {
  const cnt = lastCount(closet);
  if (!cnt) return null;
  const sent = ((closet && closet.sent) || []).filter(s => s.at > cnt.at);
  if (sent.length) return [];
  return (items || []).filter(i => i.active && i.closetKeep > 0 && i.name in (cnt.items || {}) && num(cnt.items[i.name]) < i.closetKeep)
    .map(i => ({ item: i.name, unit: i.unit, have: num(cnt.items[i.name]), need: i.closetKeep - num(cnt.items[i.name]) }));
}
function lowIn(countItems, items) {
  return (items || []).filter(i => i.active && i.closetKeep > 0 && i.name in (countItems || {}) && num(countItems[i.name]) < i.closetKeep).length;
}

module.exports = { KIT_STATUSES, isKitOrder, kitStatusOf, kitApply, kitWhen, parseLog, parseKitItems, kitFor, contentsText, kitLabel, shortName,
  itemOf, lastCount, restockOf, lowIn };
