/* ============================================================
   order-summary.js -- el "Order Summary" de lo que se esta pidiendo
   (07/10/2026, dueño: el rectangulo de la derecha que ve el cliente en
   Orders, tambien en Create Order de Admin). Un solo lugar para los dos:
   - Orders (customer.html, barra de la derecha)
   - Admin (Create Order, a la derecha de los servicios)

   Un paquete se desglosa en SUS servicios (24/09/2026, dueño: "debe mostrar
   la suma de los servicios"); la X de uno de ellos quita el paquete y deja
   los demas como servicios sueltos con su mismo nivel.

   GSOrderSummary.lines({ selected, levels, quantities, packageLevels, catalog })
     -> [{ propType, svc, sku, lvl, qty, pkgOf?, pkgSku? }]
   GSOrderSummary.html(lines, { emptyText, timeLabel: line => '1h 30min' | '',
                                rightHtml: line => '', footerHtml: '' })
   GSOrderSummary.remove(state, btn)  -- state = { selected, levels, quantities,
     packageLevels, catalog }; btn = el boton .gs-osum-remove picado. Cambia
     state en su lugar y regresa { svc, pkgName? } para el aviso.
   Las X llevan la clase gs-osum-remove (quien lo usa escucha el click).
============================================================ */
(function () {
  'use strict';
  if (window.GSOrderSummary) return;

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function key(p, n) { return p + '|' + n; }
  function bySku(catalog, sku) { return (catalog || []).find(function (c) { return String(c.sku) === String(sku); }); }

  function styleTag() {
    if (document.getElementById('gs-osum-style')) return;
    var st = document.createElement('style');
    st.id = 'gs-osum-style';
    st.textContent =
      '.gs-osum-item{font-size:12px;color:var(--gray,#6B6B6B);padding:6px 0;border-bottom:1px solid var(--border,#E0D9CC);display:flex;align-items:center;gap:8px}' +
      '.gs-osum-item:last-child{border-bottom:none}' +
      '.gs-osum-name{color:var(--black,#111);font-weight:500}' +
      '.gs-osum-empty{font-size:12px;color:#bbb;font-style:italic;margin:0}' +
      '.gs-osum-remove{background:none;border:none;color:var(--gray,#6B6B6B);cursor:pointer;font-size:12px;line-height:1;padding:2px;flex-shrink:0;margin:0;transition:color .15s,transform .15s}' +
      '.gs-osum-remove:hover{color:#B33A3A;transform:scale(1.2)}' +
      '.gs-osum-time{font-size:11px}';
    document.head.appendChild(st);
  }

  function lines(o) {
    o = o || {};
    var out = [];
    var sel = o.selected || {}, lv = o.levels || {}, qt = o.quantities || {}, pk = o.packageLevels || {};
    Object.keys(sel).forEach(function (pt) {
      Object.keys(sel[pt] || {}).forEach(function (svc) {
        var sku = sel[pt][svc];
        var cat = bySku(o.catalog, sku);
        var items = cat && Array.isArray(cat.packageItems) && cat.packageItems.length ? (pk[String(sku)] || cat.packageItems) : null;
        if (items) {
          items.forEach(function (x) {
            var it = bySku(o.catalog, x.sku);
            if (it) out.push({ propType: pt, svc: it.serviceName, sku: String(x.sku), lvl: x.level || '', qty: '', pkgOf: svc, pkgSku: String(sku) });
          });
        } else out.push({ propType: pt, svc: svc, sku: String(sku), lvl: lv[key(pt, svc)] || '', qty: qt[key(pt, svc)] || '' });
      });
    });
    return out;
  }

  function html(list, o) {
    styleTag();
    o = o || {};
    if (!list || !list.length) return '<p class="gs-osum-empty">' + esc(o.emptyText || 'No services selected yet') + '</p>';
    return list.map(function (l) {
      var t = o.timeLabel ? o.timeLabel(l) : '';
      return '<div class="gs-osum-item">' +
        /* La X ANTES del nombre (dueño 24/09/2026: para no picarla sin querer). */
        '<button type="button" class="gs-osum-remove" data-proptype="' + esc(l.propType) + '" data-svc="' + esc(l.svc) + '"' +
          (l.pkgOf ? ' data-pkg="' + esc(l.pkgOf) + '" data-pkgsku="' + esc(l.pkgSku) + '"' : '') + ' title="Remove service">✕</button>' +
        '<div style="min-width:0;flex:1"><span class="gs-osum-name">' + esc(l.svc) + '</span>' +
          (l.lvl ? '<br><span>' + esc(l.lvl) + '</span>' : '') +
          (l.qty ? '<br><span>Qty: ' + esc(l.qty) + '</span>' : '') +
          (t ? '<br><span class="gs-est-time-inline gs-osum-time">' + esc(t) + '</span>' : '') + '</div>' +
        (o.rightHtml ? o.rightHtml(l) : '') +
      '</div>';
    }).join('') + (o.footerHtml || '');
  }

  function remove(state, btn) {
    var d = btn.dataset, pt = d.proptype, svc = d.svc;
    var sel = state.selected, lv = state.levels, qt = state.quantities, pk = state.packageLevels || {};
    if (d.pkg) {
      var cat = bySku(state.catalog, d.pkgsku);
      var items = pk[d.pkgsku] || (cat && cat.packageItems) || [];
      if (sel[pt]) { delete sel[pt][d.pkg]; delete lv[key(pt, d.pkg)]; }
      delete pk[d.pkgsku];
      items.forEach(function (x) {
        var it = bySku(state.catalog, x.sku);
        if (!it || it.serviceName === svc) return;
        if (!sel[pt]) sel[pt] = {};
        sel[pt][it.serviceName] = it.sku;
        if (x.level) lv[key(pt, it.serviceName)] = x.level;
      });
      if (sel[pt] && !Object.keys(sel[pt]).length) delete sel[pt];
      return { svc: svc, pkgName: d.pkg };
    }
    if (sel[pt]) {
      delete sel[pt][svc]; delete lv[key(pt, svc)]; delete qt[key(pt, svc)];
      if (!Object.keys(sel[pt]).length) delete sel[pt];
    }
    return { svc: svc };
  }

  window.GSOrderSummary = { lines: lines, html: html, remove: remove, styleTag: styleTag };
})();
