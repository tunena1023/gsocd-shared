/* ============================================================
   gsocd-shared/lib/price-for.js -- EL precio de un servicio para UN cliente en UN dia de Iowa (CFO 15/11/2026).
   Sin lecturas: recibe los datos (lib/price-data.js los lee). Lo usan Orders (menu y submit-order) y Admin
   (submit-order y QuickBooks), asi el menu, la orden y QuickBooks dan el mismo numero.

   Decisiones de la CFO (15/11/2026):
   - Precios estandar nuevos desde el 01/01/2027 para clientes NUEVOS (lista StandardPrices, EffectiveFrom).
   - Los clientes de hoy se quedan con lo que pagan hoy (su precio especial, lista SpecialPrices) mientras sigan
     activos y paguen a tiempo. Si se pausa el servicio y luego se reanuda, se reanuda con el estandar.
   - La cotizacion de Marketing manda: el estimado lleva exactamente sus precios.

   Orden (el primero que aplica):
     a) quote            precio de la cotizacion (line.quotePrice), si la orden salio de una
     b) special-client   precio especial del cliente (TargetType client), activo y sin pasar su Until
     c) special-manager  precio especial de su administradora (Clients.MasterClientID), activo
     d) standard-<año>   el estandar vigente ese dia (EffectiveFrom <= dia; el mas nuevo).
                         Un renglon NewClientsOnly no aplica a un cliente de antes de esa fecha (grandfathered).
     e) catalog          el precio de hoy del catalogo (ServicesCatalog.Price, con su precio por nivel)
     none                sin precio en ningun lado (price null: nunca 0)

   Pausa (dato explicito, lo pone la oficina): Clients.PriceStatus 'Paused' o 'Restarted' + PriceStatusDate (dia de
   Iowa). Desde ese dia: los especiales guardados ese dia o antes ya no aplican (los suyos y los de su administradora) y
   el cliente deja de ser de antes (le toca el estandar). Un especial guardado DESPUES de ese dia si aplica (la oficina
   le dio un precio nuevo).
   Cliente con Active = No: sin especiales.

   Opcion de cada linea (llave "SKU|opcion", la del menu de servicios y de las listas): se busca de la mas exacta
   a la mas general: la opcion que trae la linea ("B · L2"), tamaño por recamaras/baños + nivel, tamaño, nivel, y
   el SKU solo. Tamaño por recamaras (las etiquetas de la lista): 0 = A (studio), 1 = B (1 bed / 1 bath),
   2 y 1 baño = C (2 bed / 1 bath), 2 y 2+ baños = D (2 bed / 2 bath), 3 = E (3 bed / 2 bath); 4+ o sin dato = sin tamaño.
   Un especial por division (Division + Percent, sin SKU) es el % menos sobre el estandar/catalogo de esa linea; va
   despues de los del SKU del mismo dueño.

   priceFor(line, ctx) -> { price, source, key, badge, base: { price, source }, specialId?, until?, how }
     line: { sku, option?, level?, division?, bedrooms?, bathrooms?, quotePrice? }
     ctx:  { day: 'YYYY-MM-DD' (Iowa), client: clientOf(fields), specials: [specialOf], standards: [standardOf],
             catalog: { [sku]: { price, levelPrices } } }
   Prueba: node lib/price-for.test.js
============================================================ */
'use strict';
const D = require('../dates/dates.js');

const ENDED = 'ended-paused';
/* Clientes de prueba (CFO 15/11/2026): GS-1012 ve y recibe el estandar nuevo desde ya, como cliente nuevo; los demas clientes no cambian. */
const PREVIEW_CLIENTS = ['gs-1012'];
const isPreview = c => !!(c && c.clientId && PREVIEW_CLIENTS.includes(String(c.clientId).toLowerCase()));
const PAUSE_STATES = ['paused', 'restarted'];
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
/* el precio por unidad de una cotizacion (linea / cantidad) va con 6 decimales: cantidad x precio = la linea al centavo */
const r6 = n => Math.round(Number(n) * 1e6) / 1e6;
const low = v => String(v == null ? '' : v).trim().toLowerCase();
const num = v => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
const truthy = v => v === true || v === 'true' || v === 1 || v === '1' || v === 'Yes';
const falsy = v => v === false || v === 'false' || v === 0 || v === '0' || v === 'No';
const dayOf = v => (v ? D.day(v) : '');

function normOption(s) {
  return String(s == null ? '' : s).replace(/\s*[·•]\s*/g, ' · ').replace(/\s+/g, ' ').trim();
}
/* "SKU|opcion" -> [sku, opcion]; una opcion sola se queda igual. */
function splitKey(k) {
  const s = String(k == null ? '' : k);
  const i = s.indexOf('|');
  return i < 0 ? ['', normOption(s)] : [s.slice(0, i).trim(), normOption(s.slice(i + 1))];
}
function levelTag(level) {
  const m = String(level == null ? '' : level).match(/(\d)/);
  return m && Number(m[1]) >= 1 && Number(m[1]) <= 3 ? 'L' + m[1] : '';
}
function bandFromRooms(bedrooms, bathrooms) {
  const bed = num(bedrooms), bath = num(bathrooms);
  if (bed == null) return '';
  if (bed === 0) return 'A';
  if (bed === 1) return 'B';
  if (bed === 2) return bath != null && bath >= 2 ? 'D' : 'C';
  if (bed === 3) return 'E';
  return '';
}
/* Opciones a buscar, de la mas exacta a la mas general ('' = el SKU solo). */
function candidates(line) {
  const out = [];
  const add = (k, how) => { k = normOption(k); if (!out.some(x => low(x.option) === low(k))) out.push({ option: k, how }); };
  const own = normOption(line.option ? splitKey(line.option)[1] : '');
  const lv = levelTag(line.level);
  const band = bandFromRooms(line.bedrooms, line.bathrooms);
  if (own) add(own, 'option');
  if (band && lv) add(band + ' · ' + lv, 'size from rooms + level');
  if (band) add(band, 'size from rooms');
  if (lv) add(lv, 'level');
  add('', 'service');
  return out;
}

/* ---- renglones de las listas (fields de SharePoint / Neon) -> forma fija ---- */
function specialOf(f, id) {
  f = f || {};
  const [ks, ko] = splitKey(f.OptionKey || '');
  const type = low(f.TargetType) === 'manager' || low(f.TargetType) === 'master' ? 'manager' : 'client';
  return {
    id: String(id != null ? id : (f.id || '')), targetType: type, targetId: String(f.TargetID || '').trim(),
    sku: String(f.SKU || ks || '').trim(), option: ko, division: String(f.Division || '').trim(),
    percent: num(f.Percent), price: num(f.Price), until: dayOf(f.Until), note: String(f.Note || ''),
    active: !falsy(f.Active), status: low(f.Status) || 'active', changedBy: String(f.ChangedBy || ''), changedDay: dayOf(f.ChangedAt)
  };
}
function standardOf(f, id) {
  f = f || {};
  const [ks, ko] = splitKey(f.OptionKey || '');
  return {
    id: String(id != null ? id : (f.id || '')), sku: String(f.SKU || ks || '').trim(), option: ko, price: num(f.Price),
    effectiveFrom: dayOf(f.EffectiveFrom), newClientsOnly: f.NewClientsOnly === undefined || f.NewClientsOnly === null || f.NewClientsOnly === '' ? true : truthy(f.NewClientsOnly)
  };
}
/* Clients (renglon) -> lo que importa para el precio. since = ClientSince, si no el dia en que se creo el renglon. */
function clientOf(f, created) {
  f = f || {};
  const st = low(f.PriceStatus);
  return {
    clientId: String(f.ClientID || '').trim(), masterId: String(f.MasterClientID || '').trim(),
    active: f.Active === undefined || f.Active === null || f.Active === '' ? true : truthy(f.Active),
    since: dayOf(f.ClientSince) || dayOf(created || f.Created),
    priceStatus: PAUSE_STATES.includes(st) ? st : '', priceStatusDate: dayOf(f.PriceStatusDate)
  };
}
/* Hasta cuando el cliente ve precios en Orders (Clients.ShowPrices + ShowPricesUntil, dia de Iowa incluido). */
function showsPrices(f, day) {
  f = f || {};
  if (!truthy(f.ShowPrices)) return false;
  const until = dayOf(f.ShowPricesUntil);
  return !until || String(day || D.today()) <= until;
}

/* La pausa de la oficina aplica ese dia? */
function pausedBy(client, day) {
  return !!(client && client.priceStatus && client.priceStatusDate && client.priceStatusDate <= day);
}
/* Por que un especial no aplica ese dia ('' = si aplica). */
function specialBlocked(s, client, day) {
  if (!s) return 'none';
  if (s.status === ENDED) return 'ended (service paused)';
  if (!s.active) return 'not active';
  if (s.until && day > s.until) return 'past its Until date';
  if (client && client.active === false) return 'client not active';
  if (pausedBy(client, day) && (!s.changedDay || s.changedDay <= client.priceStatusDate)) return 'service paused on ' + client.priceStatusDate;
  return '';
}

function catalogPrice(entry, level) {
  if (!entry) return null;
  const lp = entry.levelPrices;
  if (lp && level && lp[level] != null && isFinite(Number(lp[level]))) return Number(lp[level]);
  return num(entry.price);
}
function levelName(level) { const t = levelTag(level); return t ? 'Level ' + t.slice(1) : ''; }

/* Lo que pagaria sin especial: el estandar vigente o el catalogo. */
function baseFor(line, ctx, cands) {
  const day = ctx.day;
  const client = ctx.client || null;
  const sku = String(line.sku || '').trim();
  const preview = isPreview(client);
  const rows = (ctx.standards || []).filter(s => s.sku === sku && s.price != null && s.effectiveFrom && (preview || s.effectiveFrom <= day));
  /* NewClientsOnly: un cliente de antes de esa fecha (y sin pausa) no la toma; se queda con la lista que tenia (o el catalogo). */
  const eligible = s => preview || !(s.newClientsOnly && client && client.since && client.since < s.effectiveFrom && !pausedBy(client, day));
  let grand = false;
  for (const c of cands) {
    const same = rows.filter(s => low(s.option) === low(c.option));
    if (!same.length) continue;
    const hit = same.filter(eligible).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
    if (!hit) { grand = true; continue; }
    return { price: r2(hit.price), source: 'standard-' + hit.effectiveFrom.slice(0, 4), key: sku + (c.option ? '|' + c.option : ''), how: c.how, standardId: hit.id };
  }
  const cp = catalogPrice((ctx.catalog || {})[sku], levelName(line.level));
  if (cp == null) return { price: null, source: 'none', key: sku, how: '' };
  return { price: r2(cp), source: 'catalog', key: sku, how: 'catalog', grandfathered: grand || undefined };
}

function priceFor(line, ctx) {
  line = line || {}; ctx = ctx || {};
  const day = ctx.day || D.today();
  const c2 = Object.assign({}, ctx, { day });
  const sku = String(line.sku || '').trim();
  const cands = candidates(line);
  const base = baseFor(line, c2, cands);
  const q = num(line.quotePrice);
  if (q != null && q >= 0) return { price: r6(q), source: 'quote', key: sku, badge: false, base, how: 'quote' };
  const client = c2.client || null;
  const owners = client ? [['client', client.clientId], ['manager', client.masterId]] : [];
  for (const [type, id] of owners) {
    if (!id) continue;
    const mine = (c2.specials || []).filter(s => s.targetType === type && s.targetId.toLowerCase() === id.toLowerCase() && !specialBlocked(s, client, day));
    for (const c of cands) {
      const s = mine.find(x => x.sku === sku && x.price != null && low(x.option) === low(c.option));
      if (s) return out(s, r2(s.price), type, c.how);
    }
    const div = String(line.division || '').trim();
    const d = div && base.price != null ? mine.find(x => !x.sku && x.percent != null && x.percent > 0 && x.percent <= 100 && low(x.division) === low(div)) : null;
    if (d) return out(d, r2(base.price * (1 - d.percent / 100)), type, 'division ' + d.percent + '%');
  }
  return { price: base.price, source: base.source, key: base.key, badge: false, base, how: base.how, grandfathered: base.grandfathered };

  function out(s, price, type, how) {
    return { price, source: 'special-' + type, key: sku + (s.option ? '|' + s.option : ''), badge: base.price == null || price < base.price,
      base, specialId: s.id, until: s.until || undefined, how };
  }
}

/* Los especiales de un cliente que la oficina termina al reanudar despues de una pausa (lo que se escribe en
   SpecialPrices: Status ended-paused, Active No). Solo los del cliente; los de la administradora siguen para las
   demas propiedades (para esta ya no aplican por PriceStatus). */
function endOnRestart(specials, clientId, by, at) {
  return (specials || []).filter(s => s.targetType === 'client' && s.targetId.toLowerCase() === String(clientId || '').toLowerCase() && s.status !== ENDED)
    .map(s => ({ id: s.id, fields: { Status: ENDED, Active: false, ChangedBy: String(by || ''), ChangedAt: at || new Date().toISOString() } }));
}

module.exports = { PREVIEW_CLIENTS, isPreview, priceFor, specialOf, standardOf, clientOf, showsPrices, specialBlocked, candidates, bandFromRooms, levelTag, normOption, splitKey,
  endOnRestart, ENDED, r2, r6 };
