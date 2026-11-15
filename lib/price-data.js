/* ============================================================
   gsocd-shared/lib/price-data.js -- lee lo que lib/price-for.js necesita para un cliente y un dia (CFO 15/11/2026):
   su renglon de Clients (administradora, pausa, desde cuando es cliente), sus precios especiales y los de su
   administradora (SpecialPrices, por TargetID: nunca los de otro cliente), la lista de estandares (StandardPrices)
   y el catalogo (ServicesCatalog, con el precio por nivel).

   Si una lectura falla a la mitad: se usa lo ultimo que este servidor leyo bien (stale) y nunca se inventa un 0.
   Si no hay nada leido antes, esa parte queda en failed y ctx.ok = false: quien llama no enseña precio (Orders) o
   no guarda precio (submit-order; Admin lo vuelve a calcular al mandar a QuickBooks) o no manda nada (QuickBooks).
   Una lista que todavia no existe (antes de cargarla) cuenta como vacia, no como falla.

   Uso: const PD = require('gsocd-shared/lib/price-data')(require('./graph'), { levelCfg?, effective? })
        const ctx = await PD.context(clientId, { day, clientRow?, catalogRows? | catalog? (mapa ya hecho: sku -> { price, levelPrices, division }) })
        PD.price(ctx, { sku, level, option?, bedrooms?, bathrooms?, quotePrice? })   -> lib/price-for priceFor
        PD.fieldsFor(ctx, service, rooms, quotePrice?)   -> lo que se guarda en OrderServices (UnitPrice, PriceSource)
        PD.forRequest(clientId, { day })  -> async (fields, rooms, quotePrice?) => fields + UnitPrice/PriceSource (submit-order)
   Prueba: node lib/price-data.test.js
============================================================ */
'use strict';
const P = require('./price-for');
const cf = require('./catalog-fields');
const D = require('../dates/dates.js');

const SPECIAL_LIST = 'SpecialPrices';
const STANDARD_LIST = 'StandardPrices';
/* Lo que se guarda en OrderServices.UnitPrice. El catalogo no: con el precio de hoy la orden sigue como antes y Admin
   lo calcula al mandarla a QuickBooks (con el switch de precio por nivel). */
const SAVED = s => s === 'quote' || /^special-/.test(s) || /^standard-/.test(s);
const isMissing = e => !!e && (Number(e.status) === 404 || /does not exist|itemNotFound|list .* not found/i.test(String(e.message || '')));

module.exports = function priceData(g, opts) {
  opts = opts || {};
  const lq = require('./list-query')(g);
  const last = { standards: null, catalog: null, specials: new Map(), clients: new Map() };

  async function read(name, slot, key, fn, out) {
    try {
      const v = await fn();
      if (key === null) last[slot] = v; else last[slot].set(key, v);
      return v;
    } catch (e) {
      if (isMissing(e)) { if (key === null) last[slot] = []; else last[slot].set(key, []); return []; }
      const prev = key === null ? last[slot] : last[slot].get(key);
      console.error('price-data: ' + name + ' not read (' + (e && e.message) + ')' + (prev ? ', using the last one read' : ''));
      if (prev) { out.stale.push(name); return prev; }
      out.failed.push(name);
      return null;
    }
  }

  function catalogMap(rows, cfg) {
    const out = {};
    (rows || []).forEach(it => {
      const f = (it && it.fields) || it || {};
      if (!f.SKU) return;
      const adj = cf.levelAdjustOf(f);
      const eff = opts.effective ? opts.effective(adj, cfg) : adj;
      out[String(f.SKU).trim()] = { price: f.Price == null || f.Price === '' ? null : Number(f.Price), levelPrices: cf.levelPricesFor(f.Price, eff), division: f.Division || '' };
    });
    return out;
  }

  async function context(clientId, o) {
    o = o || {};
    const out = { day: o.day || D.today(), client: null, specials: [], standards: [], catalog: {}, stale: [], failed: [], ok: true };
    const id = String(clientId || '').trim();
    let row = o.clientRow || null;
    if (!row && id) {
      const rows = await read('Clients', 'clients', id.toLowerCase(), async () => (await lq.fetchByField('Clients', 'ClientID', id, { fallback: true }))
        .filter(r => r.fields && String(r.fields.ClientID || '').trim().toLowerCase() === id.toLowerCase()), out);
      row = rows && rows[0] ? rows[0] : null;
    }
    const fields = row ? (row.fields || row) : (id ? { ClientID: id } : null);
    out.client = fields ? P.clientOf(fields, row && (row.createdDateTime || (row.fields && row.fields.Created))) : null;
    const ids = out.client ? [out.client.clientId, out.client.masterId].filter(Boolean) : [];
    const key = ids.map(x => x.toLowerCase()).sort().join('|');
    const [sp, st, cat, cfg] = await Promise.all([
      ids.length ? read(SPECIAL_LIST, 'specials', key, async () => {
        const want = new Set(ids.map(x => x.toLowerCase()));
        return (await lq.fetchByValues(SPECIAL_LIST, 'TargetID', ids)).filter(r => r.fields && want.has(String(r.fields.TargetID || '').trim().toLowerCase()));
      }, out) : [],
      read(STANDARD_LIST, 'standards', null, () => lq.fetchAll(STANDARD_LIST), out),
      o.catalog ? null : o.catalogRows ? o.catalogRows : read('ServicesCatalog', 'catalog', null, () => lq.fetchAll('ServicesCatalog'), out),
      opts.levelCfg ? Promise.resolve().then(opts.levelCfg).catch(() => null) : null
    ]);
    out.specials = (sp || []).map(r => P.specialOf(r.fields, r.id));
    out.standards = (st || []).map(r => P.standardOf(r.fields, r.id));
    out.catalog = o.catalog || catalogMap(cat || [], cfg);
    out.ok = !out.failed.length;
    return out;
  }

  function lineOf(ctx, s, rooms, quotePrice) {
    s = s || {};
    const sku = String(s.sku || s.SubOption || '').trim();
    const cat = (ctx && ctx.catalog && ctx.catalog[sku]) || {};
    return { sku, level: s.level || s.Level || '', option: s.option || s.OptionKey || '', division: s.division || s.Division || cat.division || '',
      bedrooms: rooms ? rooms.Bedrooms : null, bathrooms: rooms ? rooms.Bathrooms : null, quotePrice };
  }
  function price(ctx, s, rooms, quotePrice) { return P.priceFor(lineOf(ctx, s, rooms, quotePrice), ctx); }

  /* Lo que va en OrderServices. Sin datos completos (ctx.ok false) solo una cotizacion se guarda; lo demas se queda
     sin precio y Admin lo calcula al mandarlo a QuickBooks (nunca un precio a medias). */
  function fieldsFor(ctx, s, rooms, quotePrice) {
    const q = quotePrice === '' || quotePrice == null || !isFinite(Number(quotePrice)) ? null : Number(quotePrice);
    if (!ctx || (!ctx.ok && q == null)) return {};
    const r = price(ctx, s, rooms, q);
    if (SAVED(r.source) && r.price != null) return { UnitPrice: r.price, PriceSource: r.source };
    return { PriceSource: r.source };
  }

  /* Para un envio de orden: los datos se leen UNA vez (la primera vez que se necesitan) y cada renglon de OrderServices
     sale con su UnitPrice / PriceSource. Nunca tumba la orden: si algo falla, el renglon va sin precio (como antes). */
  function forRequest(clientId, o) {
    let p = null;
    const ctx = () => (p = p || context(clientId, o).catch(e => {
      console.error('price-data: prices for ' + clientId + ' not read (' + e.message + '); the services go without a price');
      return { ok: false, failed: ['all'], stale: [], specials: [], standards: [], catalog: {}, day: (o && o.day) || D.today() };
    }));
    return async (fields, rooms, quotePrice) => {
      const base = Object.assign({}, fields);
      delete base.UnitPrice; delete base.PriceSource;
      try { return Object.assign(base, fieldsFor(await ctx(), fields, rooms, quotePrice)); }
      catch (e) { console.error('price-data: price of ' + (fields && fields.SubOption) + ' not set (' + e.message + ')'); return base; }
    };
  }

  return { context, price, fieldsFor, forRequest, lineOf, catalogMap, SPECIAL_LIST, STANDARD_LIST, _last: last };
};
module.exports.SAVED = SAVED;
module.exports.isMissing = isMissing;
module.exports.SPECIAL_LIST = SPECIAL_LIST;
module.exports.STANDARD_LIST = STANDARD_LIST;
