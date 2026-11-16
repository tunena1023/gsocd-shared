/* ============================================================
   lib/division-order.js -- los servicios de una orden en orden de division (CFO 16/11/2026: "todas las ordenes
   sin excepcion se organicen, primero renovaciones, despues limpieza y al final exteriores").

   Primero Renovations, luego Janitorial, al final Exteriors; un servicio cuyo SKU no esta en el catalogo va al
   final. La division sale SIEMPRE del catalogo por SKU (SubOption), nunca del campo Division del renglon (mismo
   criterio que lib/division-rules.js). Dentro de cada division se queda el orden que ya traian (llegada o el
   Sequence de ServiceAssignments): el acomodo a mano sigue sirviendo, pero solo dentro de su division.

   Se aplica al LEER (servidor y pantallas), asi cubre todas las ordenes que ya existen sin mover datos.
   Servidor y navegador (CDN): require('gsocd-shared/lib/division-order') o window.GSDivisionOrder.

     rankOf(division)                 0 Renovations, 1 Janitorial, 2 Exteriors, 3 cualquier otra / sin division
     catalogMap(catalog)              { sku: division } desde renglones del catalogo (fields.SKU/Division,
                                      {sku, division}, {SKU, Division}), un Map o un objeto sku -> division
     divisionOf(service, map)         division real del servicio ('' si no hay match); sin map usa
                                      service.CatalogDivision (lo pone tag() en el servidor)
     tag(services, catalog)           pone CatalogDivision a cada servicio (mismo arreglo) y lo regresa
     sort(services, catalog, opts)    copia ordenada y estable; opts.seqOf(s, i) = numero dentro de la division
                                      (sin numero, el lugar de llegada); opts.divisionOf(s) en vez del catalogo
     sortAssignments(rows, services, catalog)
                                      renglones de ServiceAssignments (Category|ServiceName, sin SKU) por la
                                      division de su servicio y luego Sequence
     loader(fetchRows, ms)            servidor: lee el catalogo con su propia memoria y regresa el mapa (o null)
     sequence(services, assignments, catalog)
                                      { 'Category|ServiceName': n } 1..N ya en orden de division (para guardar)
============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GSDivisionOrder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIVISIONS = ['Renovations', 'Janitorial', 'Exteriors'];
  const low = v => String(v == null ? '' : v).trim().toLowerCase();
  const RANK = {};
  DIVISIONS.forEach((d, i) => { RANK[low(d)] = i; });

  function rankOf(division) {
    const r = RANK[low(division)];
    return r == null ? DIVISIONS.length : r;
  }

  const skuOf = s => String((s && (s.SubOption != null ? s.SubOption : s.subOption != null ? s.subOption
    : s.sku != null ? s.sku : s.SKU)) || '').trim();
  const keyOf = s => String((s && (s.Category != null ? s.Category : s.category)) || '') + '|' +
    String((s && (s.ServiceName != null ? s.ServiceName : s.serviceName)) || '');

  function catalogMap(catalog) {
    if (!catalog) return null;
    if (catalog.__divisionMap) return catalog;
    const out = Object.create(null);
    Object.defineProperty(out, '__divisionMap', { value: true });
    const put = (sku, div) => { sku = String(sku == null ? '' : sku).trim(); div = String(div == null ? '' : div).trim(); if (sku && div && !out[sku]) out[sku] = div; };
    if (typeof Map !== 'undefined' && catalog instanceof Map) {
      catalog.forEach((v, k) => put(k, v && typeof v === 'object' ? (v.division != null ? v.division : v.Division) : v));
    } else if (Array.isArray(catalog)) {
      catalog.forEach(c => {
        if (!c) return;
        const f = c.fields || c;
        put(f.SKU != null ? f.SKU : f.sku, f.Division != null ? f.Division : f.division);
      });
    } else if (typeof catalog === 'object') {
      Object.keys(catalog).forEach(k => { const v = catalog[k]; put(k, v && typeof v === 'object' ? (v.division != null ? v.division : v.Division) : v); });
    }
    return out;
  }

  function divisionOf(service, map) {
    const m = catalogMap(map);
    if (m) { const d = m[skuOf(service)]; if (d) return d; }
    return String((service && service.CatalogDivision) || '');
  }

  function tag(services, catalog) {
    const m = catalogMap(catalog);
    (services || []).forEach(s => { if (s && typeof s === 'object') s.CatalogDivision = m ? (m[skuOf(s)] || '') : (s.CatalogDivision || ''); });
    return services;
  }

  const num = v => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);

  function sortBy(list, rankFn, seqFn) {
    return (list || []).map((s, i) => {
      const seq = num(seqFn ? seqFn(s, i) : null);
      return { s, i, r: rankFn(s), q: seq == null ? i + 1 : seq };
    }).sort((a, b) => a.r - b.r || a.q - b.q || a.i - b.i).map(x => x.s);
  }

  function sort(services, catalog, opts) {
    const m = catalogMap(catalog);
    const seqOf = opts && opts.seqOf;
    const dv = opts && opts.divisionOf;
    return sortBy(services, s => rankOf(dv ? dv(s) : divisionOf(s, m)), seqOf);
  }

  function sortAssignments(rows, services, catalog) {
    const m = catalogMap(catalog);
    const divByKey = {};
    const posByKey = {};
    (services || []).forEach((s, i) => { const k = keyOf(s); if (!(k in divByKey)) { divByKey[k] = divisionOf(s, m); posByKey[k] = i; } });
    return sortBy(rows, a => rankOf(divByKey[keyOf(a)]), (a, i) => {
      const q = num(a && a.Sequence);
      if (q != null) return q;
      const p = posByKey[keyOf(a)];
      return p == null ? 1e6 + i : p + 1;
    });
  }

  function sequence(services, assignments, catalog) {
    const seqByKey = {};
    (assignments || []).forEach(a => { const f = (a && a.fields) || a; const q = num(f && f.Sequence); if (q != null) seqByKey[keyOf(f)] = q; });
    const out = {};
    sort(services, catalog, { seqOf: (s, i) => seqByKey[keyOf(s)] != null ? seqByKey[keyOf(s)] : i + 1 })
      .forEach((s, i) => { const k = keyOf(s); if (!(k in out)) out[k] = Object.keys(out).length + 1; });
    return out;
  }

  /* Servidor: loader(fetchRows, ms) -> async () => map | null, con su PROPIA memoria (60 s por defecto), para no
     calentar la de list-query (fetchAllCached) que otras pantallas leen recien cambiada. Si la lectura falla: null
     (los servicios se quedan como vienen). */
  function loader(fetchRows, ms) {
    let at = 0, hit = null;
    const ttl = ms == null ? 60 * 1000 : ms;
    return async function () {
      if (hit && Date.now() - at < ttl) return hit;
      try { hit = catalogMap(await fetchRows()); at = Date.now(); return hit; } catch (e) { return hit; }
    };
  }

  return { DIVISIONS, rankOf, catalogMap, divisionOf, tag, sort, sortAssignments, sequence, keyOf, skuOf, loader };
});
