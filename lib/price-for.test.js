/* Prueba de lib/price-for.js y lib/price-data.js (precios por cliente, CFO 15/11/2026). Sin SharePoint: numeros inventados.
   Correr: node lib/price-for.test.js */
'use strict';
const P = require('./price-for');
const priceData = require('./price-data');

let ok = 0, fail = 0;
const t = (name, cond, x) => { if (cond) { ok++; console.log('OK   - ' + name); } else { fail++; process.exitCode = 1; console.log('FAIL - ' + name + (x !== undefined ? '  -- ' + JSON.stringify(x).slice(0, 400) : '')); } };

const catalog = { '111-48': { price: 150, levelPrices: { 'Level 1': 150, 'Level 2': 165, 'Level 3': 180 }, division: 'Janitorial' },
  '222-10': { price: 500, levelPrices: null, division: 'Renovations' }, '333-10': { price: 90, levelPrices: null, division: 'Exteriors' } };
const standards = [
  { SKU: '111-48', OptionKey: '111-48|B · L2', Price: 221, EffectiveFrom: '2027-01-01' },
  { SKU: '111-48', OptionKey: '111-48|L1', Price: 177, EffectiveFrom: '2027-01-01' },
  { SKU: '222-10', OptionKey: '222-10|B · 1 coat', Price: 640, EffectiveFrom: '2027-01-01' },
  { SKU: '222-10', OptionKey: '222-10|B · 1 coat', Price: 700, EffectiveFrom: '2027-07-01' },
  { SKU: '333-10', OptionKey: '', Price: 150, EffectiveFrom: '2027-01-01', NewClientsOnly: false }
].map((f, i) => P.standardOf(f, 's' + i));
const old = P.clientOf({ ClientID: 'GS-1001', MasterClientID: 'GSM-7', Active: true }, '2025-03-10T15:00:00Z');
const fresh = P.clientOf({ ClientID: 'GS-2001', Active: true, ClientSince: '2027-02-01' });
const sp = (f, id) => P.specialOf(Object.assign({ TargetType: 'client', TargetID: 'GS-1001', Active: true, Status: 'active', ChangedAt: '2026-11-15T18:00:00Z' }, f), id);
const specials = [
  sp({ SKU: '111-48', OptionKey: '111-48|B · L2', Price: 120 }, 'c1'),
  sp({ SKU: '222-10', OptionKey: '222-10|B · 1 coat', Price: 900, Note: 'pays more than standard' }, 'c2'),
  sp({ TargetType: 'manager', TargetID: 'GSM-7', SKU: '111-48', OptionKey: '111-48|D · L2', Price: 200 }, 'm1'),
  sp({ TargetType: 'manager', TargetID: 'GSM-7', SKU: '111-48', OptionKey: '111-48|B · L2', Price: 130 }, 'm2'),
  sp({ TargetType: 'manager', TargetID: 'GSM-7', Division: 'Exteriors', Percent: 10 }, 'm3'),
  sp({ TargetID: 'GS-9999', SKU: '111-48', OptionKey: '111-48|B · L2', Price: 1 }, 'x1'),
  sp({ SKU: '111-48', OptionKey: '111-48|E · L1', Price: 99, Until: '2026-12-31' }, 'c3')
];
const ctx = (day, client, extra) => Object.assign({ day, client, specials, standards, catalog }, extra || {});
const B2 = { sku: '111-48', level: 'Level 2', bedrooms: 1, bathrooms: 1 };

/* 0) descuento del cliente contra nuestra lista (CFO 17/11/2026) */
{
  const d1 = P.discountOf(120, 145); t('discountOf: paga menos = discount, $ y % (25, 17.2)', d1.state === 'discount' && d1.usd === 25 && d1.pct === 17.2, d1);
  const d2 = P.discountOf(285, 255); t('discountOf: paga mas = above (nunca se le enseña al cliente)', d2.state === 'above' && d2.usd === 30, d2);
  t('discountOf: igual = same; sin lista = none', P.discountOf(145, 145).state === 'same' && P.discountOf(145, null).state === 'none');
  t('priceFromDiscount: $25 menos de 145 = 120 exacto', P.priceFromDiscount(145, { usd: 25 }) === 120);
  t('priceFromDiscount: % redondea al centavo (17.2% de 145 = 120.06)', P.priceFromDiscount(145, { pct: 17.2 }) === 120.06);
  t('priceFromDiscount: nunca negativo', P.priceFromDiscount(100, { usd: 500 }) === 0);
  /* cliente de antes (grandfathered): su lista de comparacion es el estandar de esa opcion aunque no le aplique */
  const day = '2027-02-01';
  const r0 = P.priceFor({ sku: '111-48', option: 'B · L2' }, { day, client: old, specials, standards, catalog });
  t('especial trae standard (lista 221) y discount (101 = 45.7%) aunque el cliente sea de antes', r0.source === 'special-client' && r0.price === 120 && r0.standard.price === 221 && r0.discount.state === 'discount' && r0.discount.usd === 101 && r0.badge === true, r0);
  const r1 = P.priceFor({ sku: '222-10', option: 'B · 1 coat' }, { day, client: old, specials, standards, catalog });
  t('especial arriba de la lista: above y sin badge (no se tacha nada)', r1.price === 900 && r1.discount.state === 'above' && r1.badge === false, r1);
  /* si sube el estandar, el cliente paga lo mismo y su descuento crece */
  const r2b = P.priceFor({ sku: '222-10', option: 'B · 1 coat' }, { day: '2027-08-01', client: old, specials: [P.specialOf({ TargetType: 'client', TargetID: 'GS-1001', SKU: '222-10', OptionKey: '222-10|B · 1 coat', Price: 600, Active: true }, 'z')], standards, catalog });
  t('sube la lista (640 -> 700): el cliente sigue en 600, su descuento sube a 100', r2b.price === 600 && r2b.standard.price === 700 && r2b.discount.usd === 100, r2b);
}

/* 1) orden de precedencia */
let r = P.priceFor(Object.assign({ quotePrice: 333.333333 }, B2), ctx('2026-11-20', old));
t('a) la cotizacion manda sobre todo (precio por unidad con 6 decimales)', r.source === 'quote' && r.price === 333.333333, r);
r = P.priceFor(B2, ctx('2026-11-20', old));
t('b) especial del cliente antes que el de su administradora (120, no 130)', r.source === 'special-client' && r.price === 120 && r.specialId === 'c1' && r.badge === true, r);
r = P.priceFor({ sku: '111-48', level: 'Level 2', bedrooms: 2, bathrooms: 2 }, ctx('2026-11-20', old));
t('c) sin especial propio: el de la administradora (Master ID), 2 bed / 2 bath = D', r.source === 'special-manager' && r.price === 200 && r.key === '111-48|D · L2', r);
r = P.priceFor({ sku: '333-10', division: 'Exteriors' }, ctx('2026-11-20', old));
t('c) % de la administradora por division: 10% menos del catalogo (90 -> 81)', r.source === 'special-manager' && r.price === 81 && r.how === 'division 10%', r);
r = P.priceFor({ sku: '111-48', level: 'Level 3', bedrooms: 1, bathrooms: 1 }, ctx('2026-11-20', old));
t('e) antes del 2027 sin especial: el catalogo de hoy con su nivel (180)', r.source === 'catalog' && r.price === 180, r);
r = P.priceFor({ sku: '111-48', level: 'Level 2', bedrooms: 1, bathrooms: 1 }, ctx('2026-11-20', P.clientOf({ ClientID: 'GS-3000' })));
t('otro cliente sin especiales no ve los de GS-1001 (catalogo 165)', r.source === 'catalog' && r.price === 165, r);
r = P.priceFor({ sku: '999-99' }, ctx('2026-11-20', old));
t('sin precio en ningun lado: null (nunca 0)', r.price === null && r.source === 'none', r);
r = P.priceFor({ sku: '222-10', option: 'B · 1 coat' }, ctx('2026-11-20', old));
t('especial mas caro que el estandar: se cobra, sin badge', r.source === 'special-client' && r.price === 900 && r.badge === false, r);

/* 2) Until */
r = P.priceFor({ sku: '111-48', option: 'E · L1' }, ctx('2026-12-31', old));
t('Until: el ultimo dia todavia aplica', r.source === 'special-client' && r.price === 99, r);
r = P.priceFor({ sku: '111-48', option: 'E · L1', level: 'Level 1' }, ctx('2027-01-01', old));
t('Until: el dia siguiente ya no (cliente de antes: catalogo 150)', r.source === 'catalog' && r.price === 150 && r.grandfathered === true, r);
t('specialBlocked dice por que', P.specialBlocked(specials[6], old, '2027-01-01') === 'past its Until date');

/* 3) fecha del estandar: antes y despues del 01/01/2027 */
r = P.priceFor({ sku: '111-48', level: 'Level 2', bedrooms: 1, bathrooms: 1 }, ctx('2026-12-31', fresh, { specials: [] }));
t('31/12/2026: el catalogo de hoy (165)', r.source === 'catalog' && r.price === 165, r);
r = P.priceFor({ sku: '111-48', level: 'Level 2', bedrooms: 1, bathrooms: 1 }, ctx('2027-02-01', fresh, { specials: [] }));
t('cliente nuevo desde el 01/01/2027: el estandar 2027 de su opcion (221)', r.source === 'standard-2027' && r.price === 221 && r.key === '111-48|B · L2', r);
r = P.priceFor({ sku: '111-48', level: 'Level 1' }, ctx('2027-02-01', fresh, { specials: [] }));
t('sin tamaño: la opcion por nivel (L1 = 177)', r.source === 'standard-2027' && r.price === 177, r);
r = P.priceFor({ sku: '222-10', option: '222-10|B · 1 coat' }, ctx('2027-03-01', fresh));
t('dos fechas: vale la mas nueva ya vigente (01/01 -> 640)', r.source === 'standard-2027' && r.price === 640, r);
r = P.priceFor({ sku: '222-10', option: '222-10|B · 1 coat' }, ctx('2027-07-01', fresh));
t('dos fechas: desde el 01/07 la nueva (700) para un cliente nuevo desde el 01/07', P.priceFor({ sku: '222-10', option: '222-10|B · 1 coat' }, ctx('2027-07-01', P.clientOf({ ClientID: 'GS-2002', ClientSince: '2027-07-01' }))).price === 700);
t('NewClientsOnly: el cliente de febrero se queda con la lista de enero (640)', r.price === 640 && r.source === 'standard-2027', r);
r = P.priceFor({ sku: '111-48', level: 'Level 2', bedrooms: 1, bathrooms: 1 }, ctx('2027-02-01', P.clientOf({ ClientID: 'GS-1050', ClientSince: '2026-05-01' }), { specials: [] }));
t('cliente de antes sin especial en 2027: se queda con el catalogo de hoy (NewClientsOnly)', r.source === 'catalog' && r.price === 165 && r.grandfathered === true, r);
r = P.priceFor({ sku: '333-10' }, ctx('2027-02-01', P.clientOf({ ClientID: 'GS-1050', ClientSince: '2026-05-01' }), { specials: [] }));
t('un renglon NewClientsOnly = No aplica a todos (150)', r.source === 'standard-2027' && r.price === 150, r);
r = P.priceFor({ sku: '111-48', level: 'Level 2', bedrooms: 1, bathrooms: 1 }, ctx('2027-02-01', P.clientOf({ ClientID: 'GS-1070', Active: true }), { specials: [] }));
t('REGLA FIRME: cliente existente sin fecha de alta en 2027: el estandar no le cambia el precio (catalogo, nunca standard)', r.source === 'catalog' && r.grandfathered === true, r);
{
  const gs12 = P.clientOf({ ClientID: 'GS-1012', Active: true }, '2026-09-28T15:00:00Z');
  const r12 = P.priceFor({ sku: '111-48', option: '111-48|B · L2' }, { day: '2026-11-20', client: gs12, specials, standards, catalog });
  t('GS-1012 (prueba): ve el estandar nuevo desde ya, aunque sea de 2026 y falten meses (221)', r12.source === 'standard-2027' && r12.price === 221, r12);
  const rO = P.priceFor({ sku: '111-48', option: '111-48|B \u00b7 L2' }, { day: '2026-11-20', client: P.clientOf({ ClientID: 'GS-1013', Active: true }, '2026-09-28T15:00:00Z'), specials, standards, catalog });
  t('otro cliente de 2026: sin cambio (catalogo, nunca el estandar de 2027)', rO.source === 'catalog' && rO.price === 150, rO);
  const r12b = P.priceFor({ sku: '222-10', option: '222-10|B \u00b7 1 coat' }, { day: '2026-11-20', client: gs12, specials, standards, catalog });
  t('GS-1012 con dos fechas: la mas nueva (700)', r12b.price === 700, r12b);
}

/* 4) pausa -> estandar */
const paused = P.clientOf({ ClientID: 'GS-1001', MasterClientID: 'GSM-7', PriceStatus: 'Restarted', PriceStatusDate: '2027-03-01' }, '2025-03-10T15:00:00Z');
r = P.priceFor(B2, ctx('2027-02-28', paused));
t('antes del dia de la pausa: su especial (120)', r.source === 'special-client' && r.price === 120, r);
r = P.priceFor(B2, ctx('2027-03-01', paused));
t('reanudado: ni su especial ni el de la administradora; el estandar 2027 (221)', r.source === 'standard-2027' && r.price === 221, r);
const newDeal = specials.concat([sp({ SKU: '111-48', OptionKey: '111-48|B · L2', Price: 205, ChangedAt: '2027-03-05T16:00:00Z' }, 'c9')]);
r = P.priceFor(B2, ctx('2027-03-06', paused, { specials: newDeal }));
t('un especial nuevo guardado despues de reanudar si aplica (205)', r.source === 'special-client' && r.price === 205 && r.specialId === 'c9', r);
r = P.priceFor(B2, ctx('2027-03-06', paused, { specials: specials.concat([sp({ SKU: '111-48', OptionKey: '111-48|B · L2', Price: 99, ChangedAt: '2027-03-01T22:00:00Z' }, 'c8')]) }));
t('un especial guardado el mismo dia de la pausa tampoco aplica (desde el dia siguiente si)', r.source === 'standard-2027' && r.price === 221, r);
r = P.priceFor(B2, ctx('2026-11-20', P.clientOf({ ClientID: 'GS-1001', Active: false })));
t('cliente inactivo: sin especiales', r.source === 'catalog', r);
r = P.priceFor(B2, ctx('2026-11-20', old, { specials: specials.map(s => (s.id === 'c1' ? Object.assign({}, s, { status: P.ENDED }) : s)) }));
t('especial ended-paused no aplica (pasa al de la administradora 130)', r.source === 'special-manager' && r.price === 130, r);
const ends = P.endOnRestart(specials, 'GS-1001', 'cfo@gsocd.com', '2027-03-01T15:00:00Z');
t('al reanudar se terminan solo los del cliente (3), Status ended-paused, Active No', ends.length === 3 && ends.every(e => e.fields.Status === 'ended-paused' && e.fields.Active === false), ends);

/* 5) ShowPrices + ShowPricesUntil */
t('ShowPrices apagado: no', P.showsPrices({ ShowPrices: false }, '2026-11-20') === false);
t('ShowPrices sin Until: si', P.showsPrices({ ShowPrices: true }, '2026-11-20') === true);
t('ShowPricesUntil: el dia incluido si, el siguiente no', P.showsPrices({ ShowPrices: true, ShowPricesUntil: '2026-11-20' }, '2026-11-20') === true && P.showsPrices({ ShowPrices: 'Yes', ShowPricesUntil: '2026-11-20' }, '2026-11-21') === false);
t('tamaño por recamaras', ['A', 'B', 'C', 'D', 'E', ''].join() === [[0, 1], [1, 1], [2, 1], [2, 2], [3, 2], [4, 3]].map(x => P.bandFromRooms(x[0], x[1])).join());

/* 6) price-data: lecturas, fallas a la mitad, otros clientes */
(async () => {
  const rows = {
    Clients: [{ id: '1', createdDateTime: '2025-01-01T00:00:00Z', fields: { ClientID: 'GS-1001', MasterClientID: 'GSM-7' } }, { id: '2', fields: { ClientID: 'GS-9999' } }],
    SpecialPrices: [{ id: '10', fields: { TargetType: 'client', TargetID: 'GS-1001', SKU: '111-48', OptionKey: '111-48|B · L2', Price: 120, Active: true } },
      { id: '11', fields: { TargetType: 'client', TargetID: 'GS-9999', SKU: '111-48', OptionKey: '111-48|B · L2', Price: 1, Active: true } },
      { id: '12', fields: { TargetType: 'manager', TargetID: 'GSM-7', SKU: '222-10', Price: 400, Active: true } }],
    StandardPrices: [{ id: '20', fields: { SKU: '111-48', OptionKey: '111-48|B · L2', Price: 221, EffectiveFrom: '2027-01-01' } }],
    ServicesCatalog: [{ id: '30', fields: { SKU: '111-48', Price: 150, Division: 'Janitorial', Level2Price: 10, Level2Mode: 'Percent' } }, { id: '31', fields: { SKU: '222-10', Price: 500 } }]
  };
  const down = new Set(), missing = new Set(); const urls = [];
  const g = { siteListPath: n => '/L/' + n + '/items', graphFetch: async url => {
    urls.push(url);
    const m = /^\/L\/([^/?]+)\/items/.exec(url); const n = m[1];
    if (missing.has(n)) throw Object.assign(new Error("List '" + n + "' does not exist. [sql]"), { status: 404 });
    if (down.has(n)) throw Object.assign(new Error('503 Service Unavailable'), { status: 503 });
    let v = rows[n] || [];
    const f = /\$filter=([^&]+)/.exec(url);
    if (f) { const want = [...decodeURIComponent(f[1]).matchAll(/fields\/(\w+) eq '([^']*)'/g)]; if (want.length) v = v.filter(it => want.some(w => String(it.fields[w[1]]) === w[2])); }
    return { value: v };
  } };
  const PD = priceData(g);
  let c = await PD.context('GS-1001', { day: '2026-11-20' });
  t('price-data: lee solo los especiales del cliente y de su administradora', c.ok && c.specials.map(s => s.id).sort().join() === '10,12' && !c.specials.some(s => s.targetId === 'GS-9999'), c.specials);
  t('price-data: pide SpecialPrices por TargetID (no la lista entera)', urls.some(u => /SpecialPrices.*TargetID/.test(decodeURIComponent(u))) && !urls.some(u => /SpecialPrices\/items\?\$expand=fields&\$top=500$/.test(u)), urls);
  t('price-data: especial del cliente -> se guarda UnitPrice', JSON.stringify(PD.fieldsFor(c, { SubOption: '111-48', Level: 'Level 2' }, { Bedrooms: 1, Bathrooms: 1 })) === '{"UnitPrice":120,"PriceSource":"special-client"}');
  t('price-data: catalogo -> solo PriceSource (Admin lo calcula como hoy)', JSON.stringify(PD.fieldsFor(c, { SubOption: '111-48', Level: 'Level 2' }, { Bedrooms: 3, Bathrooms: 2 })) === '{"PriceSource":"catalog"}');
  t('price-data: precio por nivel del catalogo (150 + 10% = 165)', PD.price(c, { SubOption: '111-48', Level: 'Level 2' }).price === 165);
  t('price-data: cotizacion se guarda tal cual', JSON.stringify(PD.fieldsFor(c, { SubOption: '222-10' }, null, 433.333333)) === '{"UnitPrice":433.333333,"PriceSource":"quote"}');

  down.add('SpecialPrices');
  c = await PD.context('GS-1001', { day: '2026-11-20' });
  t('falla a la mitad (SpecialPrices) con lectura anterior: usa la ultima (stale), mismo precio', c.ok && c.stale.includes('SpecialPrices') && PD.price(c, { SubOption: '111-48', Level: 'Level 2' }, { Bedrooms: 1, Bathrooms: 1 }).price === 120, c.stale);
  const PD2 = priceData(g);
  c = await PD2.context('GS-1001', { day: '2026-11-20' });
  t('falla sin lectura anterior: ok = false, no se guarda precio (nunca 0)', !c.ok && c.failed.includes('SpecialPrices') && JSON.stringify(PD2.fieldsFor(c, { SubOption: '111-48', Level: 'Level 2' }, { Bedrooms: 1, Bathrooms: 1 })) === '{}', c);
  t('falla sin lectura anterior: una cotizacion si se guarda', PD2.fieldsFor(c, { SubOption: '222-10' }, null, 75).UnitPrice === 75);
  down.clear(); missing.add('SpecialPrices'); missing.add('StandardPrices');
  const PD3 = priceData(g);
  c = await PD3.context('GS-1001', { day: '2027-02-01' });
  t('listas que todavia no existen = vacias (no es falla): todo como hoy', c.ok && !c.specials.length && !c.standards.length && PD3.price(c, { SubOption: '111-48', Level: 'Level 1' }).source === 'catalog', c);
  missing.clear(); down.add('StandardPrices'); down.add('ServicesCatalog');
  c = await PD.context('GS-1001', { day: '2026-11-21' });
  t('dos lecturas caidas con lectura anterior: las dos stale, ok', c.ok && c.stale.includes('StandardPrices') && c.stale.includes('ServicesCatalog'), c.stale);
  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
})();
