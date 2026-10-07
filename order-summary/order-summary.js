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

   Varias unidades (07/10/2026, dueño: "el summary y abajo cada unidad ... al
   hacer clic en la unidad, el desplegable con los servicios ... solo los que
   cambian de unidad a unidad"):
   GSOrderSummary.unitsHtml(units, orderLines, { timeOf: lines => '2h' | '' })
     units = [{ label: '101', lines: [...] | null }]  (null = los de la orden)
   Cada unidad es un desplegable con SOLO lo distinto a la orden (+ agregado,
   - quitado, ~ nivel/cantidad). El tiempo sale solo si timeOf regresa algo
   (el switch de tiempo del cliente); si no, el renglon se ve igual sin el.
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
      '.gs-osum-time{font-size:11px}' +
      '.gs-osum-units{margin-top:16px;border-top:1px solid var(--border,#E0D9CC);padding-top:10px}' +
      '.gs-osum-units-h{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gray,#6B6B6B);font-weight:700;margin:0 0 6px}' +
      '.gs-osum-unit{border-bottom:1px solid var(--border,#E0D9CC)}' +
      '.gs-osum-unit:last-child{border-bottom:none}' +
      '.gs-osum-unit>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;padding:7px 0;font-size:12px}' +
      '.gs-osum-unit>summary::-webkit-details-marker{display:none}' +
      '.gs-osum-unit>summary:before{content:"\\25B8";font-size:9px;color:var(--gray,#6B6B6B);transition:transform .15s}' +
      '.gs-osum-unit[open]>summary:before{transform:rotate(90deg)}' +
      '.gs-osum-unit-n{color:var(--black,#111);font-weight:600}' +
      '.gs-osum-tag{font-size:10px;padding:1px 7px;border-radius:9px;background:#F0E4C4;color:var(--gold-dk,#8C6F2A);font-weight:700}' +
      '.gs-osum-tag.same{background:var(--off,#F7F6F3);color:var(--gray,#6B6B6B);font-weight:500}' +
      '.gs-osum-unit-t{margin-left:auto;font-size:11px;color:var(--gray,#6B6B6B);white-space:nowrap}' +
      '.gs-osum-d{font-size:12px;padding:3px 0 3px 17px;color:var(--black,#111)}' +
      '.gs-osum-d b{display:inline-block;width:14px;color:var(--gray,#6B6B6B)}' +
      '.gs-osum-d.add b{color:#2E7D4F}.gs-osum-d.del{color:var(--gray,#6B6B6B);text-decoration:line-through}.gs-osum-d.del b{color:#B33A3A}' +
      '.gs-osum-d span{color:var(--gray,#6B6B6B)}' +
      '.gs-osum-unit-body{padding-bottom:8px}';
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

  function detailOf(l) { return [l.lvl || '', l.qty ? 'Qty ' + l.qty : ''].filter(Boolean).join(' · '); }

  /* Lo distinto de una unidad contra la orden (por SKU). */
  function diff(orderLines, unitLines) {
    var o = {}, u = {}, out = [];
    (orderLines || []).forEach(function (l) { o[l.sku] = l; });
    (unitLines || []).forEach(function (l) { u[l.sku] = l; });
    (unitLines || []).forEach(function (l) {
      var b = o[l.sku];
      if (!b) out.push({ kind: 'add', l: l });
      else if (detailOf(b) !== detailOf(l)) out.push({ kind: 'chg', l: l, before: b });
    });
    (orderLines || []).forEach(function (l) { if (!u[l.sku]) out.push({ kind: 'del', l: l }); });
    return out;
  }

  function unitsHtml(units, orderLines, o) {
    styleTag();
    o = o || {};
    if (!units || units.length < 2) return '';
    return '<div class="gs-osum-units"><p class="gs-osum-units-h">Units (' + units.length + ')</p>' +
      units.map(function (u) {
        var own = Array.isArray(u.lines);
        var d = own ? diff(orderLines, u.lines) : [];
        var t = o.timeOf ? o.timeOf(own ? u.lines : orderLines) : '';
        var adds = d.filter(function (x) { return x.kind === 'add'; }).length;
        var dels = d.filter(function (x) { return x.kind === 'del'; }).length;
        var chgs = d.filter(function (x) { return x.kind === 'chg'; }).length;
        var tag = d.length
          ? '<span class="gs-osum-tag">' + [adds ? '+' + adds : '', dels ? '\u2212' + dels : '', chgs ? '~' + chgs : ''].filter(Boolean).join(' ') + '</span>'
          : '<span class="gs-osum-tag same">Same</span>';
        var body = d.length
          ? d.map(function (x) {
              if (x.kind === 'add') return '<div class="gs-osum-d add"><b>+</b>' + esc(x.l.svc) + (detailOf(x.l) ? ' <span>' + esc(detailOf(x.l)) + '</span>' : '') + '</div>';
              if (x.kind === 'del') return '<div class="gs-osum-d del"><b>\u2212</b>' + esc(x.l.svc) + '</div>';
              return '<div class="gs-osum-d chg"><b>~</b>' + esc(x.l.svc) + ' <span>' + esc(detailOf(x.before) || '\u2014') + ' \u2192 ' + esc(detailOf(x.l) || '\u2014') + '</span></div>';
            }).join('')
          : '<div class="gs-osum-d"><span>Same as the order.</span></div>';
        return '<details class="gs-osum-unit"' + (u.open ? ' open' : '') + ' data-unit="' + esc(u.key || u.label) + '"><summary>' +
          '<span class="gs-osum-unit-n">' + esc(u.label || '\u2014') + '</span>' + tag +
          '<span class="gs-osum-unit-t">' + esc(t || '') + '</span></summary>' +
          '<div class="gs-osum-unit-body">' + body + '</div></details>';
      }).join('') + '</div>';
  }

  window.GSOrderSummary = { lines: lines, html: html, remove: remove, unitsHtml: unitsHtml, diff: diff, styleTag: styleTag };
})();
