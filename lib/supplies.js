/* ============================================================
   lib/supplies.js -- paquetes (kits), articulos y conteos del closet
   (14/10/2026, dueño; plan docs/material-en-sitio de Admin, fases 2-4).
   MISMO archivo para Admin (Warehouse › Kits, Inventory, Reports) y Tech
   (el supervisor deja el paquete y cuenta su closet; el tecnico lo recoge).

   Donde vive cada cosa (columnas de SharePoint, lib/sp-columns de Admin):
   - Orders.KitStatus / KitLog: el paquete de cada orden y quien lo movio.
   - ServicesCatalog.KitItems: que lleva el kit por cada SERVICIO ({ items: [{item, qty}] });
     el kit de la orden es la suma de sus servicios. Se configura en Admin › Developer ({ none, byBedrooms: { '1': [{item, qty}], any: [...] } }).
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

/* Lo que lleva el kit por un servicio (ServicesCatalog.KitItems = { items: [{ item, qty }] }).
   Lee tambien el formato viejo ({ byBedrooms: { any | '2': [...] } }). */
function parseKitItems(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v || '{}'); } catch (e) { v = {}; } }
  v = v && typeof v === 'object' ? v : {};
  let list = Array.isArray(v.items) ? v.items : null;
  if (!list && v.byBedrooms) list = v.byBedrooms.any || v.byBedrooms[Object.keys(v.byBedrooms)[0]] || [];
  const items = (list || []).map(x => ({ item: str(x && x.item), qty: num(x && x.qty) })).filter(x => x.item && x.qty > 0);
  return { items };
}
const shortName = s => str(s).replace(/\s*cleaning\s*$/i, '') || str(s);
const { packageItemsOf } = require('./catalog-fields');
const isPackage = f => !!(f && packageItemsOf(f).length);
/* Los paquetes de la orden (para el nombre del kit): Orders.PackageContents o un servicio que es paquete. */
function packagesOf(order, services, catalogBySku) {
  const cat = catalogBySku || {};
  let snap = {};
  try { snap = JSON.parse((order && order.PackageContents) || '{}') || {}; } catch (e) { snap = {}; }
  const skus = Object.keys(snap).concat((services || []).map(s => str(s.SubOption)).filter(k => isPackage(cat[k])));
  return skus.filter((k, i) => k && skus.indexOf(k) === i).map(k => ({ sku: k, f: cat[k] || null, name: str(cat[k] && (cat[k].ServiceName || cat[k].Title)) || k }));
}
/* El kit de la orden (dueño 14/10: "los kits se deben armar segun los servicios seleccionados";
   ej. dusting -> plumero, floors -> mops). Es la suma de lo que lleva cada servicio que de
   verdad quedo en la orden (OrderServices; si no limpian electrodomesticos, no va el quimico
   de hornos). Lo que lleva cada servicio se configura en Admin › Developer. */
function kitFor(order, services, catalogBySku) {
  const cat = catalogBySku || {};
  const bed = str(order && order.Bedrooms);
  const list = (services || []).filter(s => s && str(s.ServiceName) && !isPackage(cat[str(s.SubOption)]));
  const pkgs = packagesOf(order, services, cat);
  const base = pkgs.length ? shortName(pkgs[0].name) : list.length === 1 ? shortName(list[0].ServiceName) : 'Unit';
  const name = base + (bed ? ' ' + bed + ' bed' : '');
  const sum = {}, order_ = [];
  let missing = 0;
  list.forEach(s => {
    const f = cat[str(s.SubOption)];
    const k = f && f.KitItems ? parseKitItems(f.KitItems) : null;
    if (!k) { missing++; return; }
    k.items.forEach(c => { if (!(c.item in sum)) { sum[c.item] = 0; order_.push(c.item); } sum[c.item] += c.qty; });
  });
  const contents = order_.map(i => ({ item: i, qty: sum[i] }));
  if (!list.length) return { name, none: true, noServices: true, contents: [] };
  return { name, contents, unset: !contents.length && missing > 0, missing, none: !contents.length && !missing };
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

/* ===== Tipos de un articulo (dueño 14/10): Rags por color (Green, Blue, White, Orange), Cleaner
   por producto (Bleach, Windex...). La lista se llena en Admin › Developer › Supply item types y
   vive en SupplyItems.Variants. Si un articulo tiene tipos, se despliega en el conteo y su
   conteo es la suma de sus tipos. ===== */
function parseVariants(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[,\n;]+/);
  const out = [];
  list.map(str).filter(Boolean).forEach(v => { if (!out.some(x => x.toLowerCase() === v.toLowerCase())) out.push(v.slice(0, 40)); });
  return out.slice(0, 20);
}
function variantsOf(item) { const v = item && Array.isArray(item.variants) ? item.variants : []; return v.length ? v : null; }
/* { Green: 2, ... } -> numeros validos de los tipos del articulo y su suma. */
function cleanVariants(item, values) {
  const v = variantsOf(item);
  if (!v || !values || typeof values !== 'object') return null;
  const out = {}; let total = 0;
  v.forEach(c => { const n = Math.max(0, Math.floor(num(values[c]))); out[c] = n; total += n; });
  return { variants: out, total };
}

/* ===== Articulos (lista SupplyItems) ===== */
function itemOf(row) {
  const f = (row && row.fields) || row || {};
  return { id: str(row && row.id), name: str(f.Title), unit: str(f.Unit), onHand: num(f.OnHand), keep: num(f.KeepAtLeast),
    closetKeep: num(f.ClosetKeep), active: f.Active !== false && f.Active !== 'false', moves: parseLog(f.Moves), variants: parseVariants(f.Variants) };
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
  itemOf, lastCount, restockOf, lowIn, packagesOf, isPackage, parseVariants, variantsOf, cleanVariants };
