/* ============================================================
   gsocd-shared/templates/templates.js -- paquetes y templates son LO MISMO
   (CFO 22/10/2026: "si se guarda un template sale como paquete y si se edita
   un paquete se guarda como template"; "debe funcionar igual en todas partes,
   debe ser una pieza compartida").

   Un template ("My package") es una FOTO: la lista de servicios sueltos con su
   nivel y su cantidad, tal como quedo al guardarlo. Si trae un paquete del
   catalogo, se guarda desarmado en sus servicios (con el nivel escogido de cada
   uno), asi que:
     - lo que se guarda es lo que se ve (Save = lo que antes hacia Apply);
     - se guardan los niveles de adentro del paquete y las cantidades;
     - el mismo template da la misma orden desde Templates o desde My package;
     - si alguien cambia el paquete en Developer, los templates ya guardados no
       cambian.
   Los templates viejos que guardaron el SKU del paquete se desarman al leerlos
   (itemsOf), sin tocar SharePoint.

   La usan el portal del cliente (New Order y Templates) y Admin (Create Order
   y Developer › Templates), en el navegador (window.GSTemplates) y en el
   servidor (require('gsocd-shared/templates/templates')). Funciones puras, sin
   llamadas al servidor.

   Formas:
     servicio guardado  { Category, ServiceName, SubOption, Division, Level, Quantity }
     item               { sku, level, qty }
     catalogo           [{ sku, serviceName, division, propertyType, packageItems:[{sku, level}], requiresQuantity }]
============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GSTemplates = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LEVELS = ['Level 1', 'Level 2', 'Level 3'];
  var str = function (v) { return String(v == null ? '' : v).trim(); };
  var low = function (v) { return str(v).toLowerCase(); };

  function bySkuOf(catalog) {
    var m = {};
    (catalog || []).forEach(function (s) { if (s && s.sku != null) m[str(s.sku)] = s; });
    return m;
  }
  function isPackage(s) { return !!(s && Array.isArray(s.packageItems) && s.packageItems.length); }
  /* Mismo criterio que el picker: nivel solo en Janitorial; cantidad si el catalogo lo pide. */
  function hasLevel(s) { return low(s && s.division) === 'janitorial'; }
  function hasQty(s) { return !!(s && s.requiresQuantity); }
  function cleanLevel(l) { return LEVELS.indexOf(str(l)) > -1 ? str(l) : ''; }
  function cleanQty(q) { var n = parseInt(q, 10); return n > 0 ? n : ''; }

  /* Lista de items de un template guardado. Un paquete del catalogo se desarma
     en sus servicios (con los niveles de packageLevels[sku] si los hay, o el
     estandar del paquete). Un servicio repetido se queda una vez (el primero).
     Lo que no esta en el catalogo se queda como esta (no se pierde). */
  function itemsOf(services, catalog, packageLevels) {
    var cat = bySkuOf(catalog), out = [], seen = {};
    var push = function (sku, level, qty) {
      sku = str(sku); if (!sku || seen[sku]) return;
      seen[sku] = true;
      var s = cat[sku];
      out.push({ sku: sku, level: s ? (hasLevel(s) ? cleanLevel(level) || 'Level 1' : '') : cleanLevel(level), qty: (!s || hasQty(s)) ? cleanQty(qty) : '' });
    };
    (services || []).forEach(function (x) {
      if (!x) return;
      var sku = str(x.SubOption != null ? x.SubOption : x.sku);
      var p = cat[sku];
      if (isPackage(p)) {
        var ov = {};
        ((packageLevels || {})[sku] || []).forEach(function (i) { if (i && i.sku) ov[str(i.sku)] = i.level; });
        p.packageItems.forEach(function (i) { push(i.sku, ov[str(i.sku)] || i.level, ''); });
        return;
      }
      push(sku, x.Level != null ? x.Level : x.level, x.Quantity != null ? x.Quantity : x.qty);
    });
    return out;
  }

  /* Items -> servicios para guardar (con nombre, tipo y division del catalogo). */
  function servicesOf(items, catalog, opts) {
    var cat = bySkuOf(catalog), o = opts || {};
    return (items || []).map(function (x) {
      var sku = str(x && x.sku), s = cat[sku] || {};
      if (!sku) return null;
      return {
        Category: s.propertyType || o.propertyType || 'Commercial',
        ServiceName: s.serviceName || str(x.name) || sku,
        SubOption: sku,
        Division: s.division || o.division || '',
        Level: cleanLevel(x.level),
        Quantity: cleanQty(x.qty)
      };
    }).filter(Boolean);
  }

  /* Lo escogido en el picker (getState() o selected/levels/quantities/packageLevels)
     -> items, con los paquetes desarmados. */
  function itemsFromPicker(state, catalog) {
    var st = state || {}, rows = [];
    var sel = st.selected || {}, lv = st.levels || {}, qt = st.quantities || {};
    Object.keys(sel).forEach(function (pt) {
      Object.keys(sel[pt] || {}).forEach(function (name) {
        var k = pt + '|' + name;
        rows.push({ SubOption: sel[pt][name], Level: lv[k] || '', Quantity: qt[k] || '' });
      });
    });
    return itemsOf(rows, catalog, st.packageLevels || {});
  }

  /* Division con la que se guarda: la de la pestaña si todo es de ahi; si los
     servicios son de una sola division distinta, esa; si son de varias, Mixed. */
  function divisionFor(services, currentDiv) {
    var divs = [];
    (services || []).forEach(function (x) { var d = str(x && x.Division); if (d && divs.indexOf(d) < 0) divs.push(d); });
    if (!divs.length) return currentDiv || '';
    if (divs.length > 1) return 'Mixed';
    if (currentDiv === 'Mixed') return 'Mixed';
    return divs[0];
  }

  /* Lo que el servidor guarda: sin renglones vacios ni repetidos, niveles y
     cantidades validos. Regresa { services, error }. */
  function normalize(services) {
    var seen = {}, out = [];
    (Array.isArray(services) ? services : []).forEach(function (x) {
      if (!x) return;
      var sku = str(x.SubOption);
      if (!sku || seen[sku]) return;
      seen[sku] = true;
      out.push({ Category: str(x.Category) || 'Commercial', ServiceName: str(x.ServiceName) || sku, SubOption: sku,
        Division: str(x.Division), Level: cleanLevel(x.Level), Quantity: cleanQty(x.Quantity) });
    });
    return { services: out, error: out.length ? '' : 'Add at least one service.' };
  }

  /* Que pedir antes de guardar. '' = todo bien. */
  function check(name, services) {
    if (!str(name)) return 'Give your package a name.';
    if (!normalize(services).services.length) return 'Add at least one service.';
    return '';
  }

  /* Firma de los servicios (para saber si dos templates traen lo mismo). */
  function signature(services, catalog) {
    return itemsOf(services, catalog).map(function (x) { return x.sku + '/' + x.level + '/' + x.qty; }).sort().join('|');
  }

  /* El template propio con ese nombre (sin importar mayusculas), para
     actualizarlo en vez de crear otro igual. */
  function sameName(templates, name, clientId) {
    var n = low(name), c = low(clientId);
    return (templates || []).find(function (t) { return t && low(t.name) === n && (c ? low(t.clientId) === c : t.mine); }) || null;
  }

  /* Templates que ve un cliente: los suyos y los publicos. Un publico que trae
     exactamente lo mismo que uno de los suyos no sale (CFO 22/10: "al que lo
     creo solo le aparece si los servicios cambiaron"). */
  function forClient(templates, clientId, catalog) {
    var c = low(clientId);
    var mine = (templates || []).filter(function (t) { return t && low(t.clientId) === c; });
    var sigs = {};
    mine.forEach(function (t) { sigs[signature(t.services, catalog)] = true; });
    var pub = (templates || []).filter(function (t) { return t && low(t.clientId) !== c && t.isPublic && !sigs[signature(t.services, catalog)]; });
    return mine.map(function (t) { return Object.assign({}, t, { mine: true, shared: false }); })
      .concat(pub.map(function (t) { return Object.assign({}, t, { mine: false, shared: true }); }))
      .sort(function (a, b) { return str(a.name).localeCompare(str(b.name)); });
  }

  /* Templates -> tarjetas del picker (savedSets). division: solo los de esa
     pestaña (Mixed = todos). */
  function toSets(templates, catalog, division) {
    return (templates || []).filter(function (t) { return t && (!division || division === 'Mixed' || t.division === division); })
      .map(function (t) {
        return { key: str(t.id), name: t.name || 'Package', division: t.division || '', shared: !!t.shared, mine: t.mine !== false && !t.shared,
          items: itemsOf(t.services, catalog).map(function (x) { var o = { sku: x.sku, level: x.level }; if (x.qty) o.qty = x.qty; return o; }) };
      })
      .filter(function (t) { return t.items.length; });
  }

  /* Para cargar un template en un picker: { selected, levels, quantities, propertyType }. */
  function pickerStateOf(services, catalog) {
    var cat = bySkuOf(catalog), st = { selected: {}, levels: {}, quantities: {}, propertyType: '' , unknown: [] };
    itemsOf(services, catalog).forEach(function (x) {
      var s = cat[x.sku];
      if (!s) { st.unknown.push(x.sku); return; }
      var pt = s.propertyType || 'Commercial';
      if (!st.propertyType) st.propertyType = pt;
      (st.selected[pt] = st.selected[pt] || {})[s.serviceName] = s.sku;
      if (x.level) st.levels[pt + '|' + s.serviceName] = x.level;
      if (x.qty) st.quantities[pt + '|' + s.serviceName] = x.qty;
    });
    if (!st.propertyType) st.propertyType = 'Commercial';
    return st;
  }

  return {
    itemsOf: itemsOf, servicesOf: servicesOf, itemsFromPicker: itemsFromPicker, divisionFor: divisionFor,
    normalize: normalize, check: check, signature: signature, sameName: sameName, forClient: forClient,
    toSets: toSets, pickerStateOf: pickerStateOf, LEVELS: LEVELS
  };
});
