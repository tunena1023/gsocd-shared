/* ============================================================
   gsocd-shared / services-box
   La caja de servicios de una orden o contrato, UNA sola para los
   portales (27/09/2026, dueño: "lo correcto es conectar este de
   recurring al mismo que en Admin en lugar de hacer parches").

   Sale tal cual de Admin (Active > "Services Requested"): caja con
   borde, encabezado con el titulo, botones Update / Cancel y
   "▼ N services" que abre y cierra la lista; adentro, una tarjeta por
   servicio (.sv-card: nombre, nivel en pastilla, datos, y a la derecha
   estatus / boton). El CSS de las tarjetas (.sv-*) se movio de
   admin.html a aqui sin cambiarle nada.

   Cada portal decide QUE hace Update (Admin edita directo; Orders manda
   la solicitud a revision) y que va en cada tarjeta. Esta pieza solo
   arma la caja y las tarjetas, igual en todos lados.

   API:
     GSServicesBox.html({ boxId, bodyId, countId, label, count, noun,
                          countExtraHtml, buttonsHtml, bodyHtml, open })
     GSServicesBox.buttonsHtml({ updateId, cancelId, onUpdate, onCancel })
     GSServicesBox.cardHtml({ eyebrow, nameHtml, lvTxt, metaBits, inclToggleHtml,
                              rightHtml, inclHtml, done })
     GSServicesBox.listHtml(cardsHtmlArray, emptyText)
     GSServicesBox.toggle(bodyId)
     GSServicesBox.editor({...})  -- el Update de Admin (ver abajo)
============================================================ */
(function () {
  'use strict';
  if (window.GSServicesBox) return;

  var STYLE_ID = 'gs-services-box-style';
  var CSS =
    /* la caja (antes estilos en linea + .hist-head/.hist-toggle/.hist-detail de Admin) */
    '.gs-svb{border:1px solid var(--border,#E0DDD6);border-radius:8px;overflow:hidden}' +
    '.gs-svb-head{display:flex;align-items:baseline;gap:8px;padding:10px 14px;background:var(--bg,var(--off,#F8F7F4));cursor:pointer;margin:0}' +
    '.gs-svb-title{flex:1;min-width:0;line-height:1.6}' +
    '.gs-svb-title .gs-svb-label{margin:0}' +
    '.gs-svb-actions{display:flex;align-items:center;gap:10px}' +
    '.gs-svb-actions .gs-svb-btn{width:auto;padding:4px 12px;font-size:12px}' +
    '.gs-svb-count{font-size:10px;color:var(--gold,#C9A84C);white-space:nowrap;flex-shrink:0}' +
    '.gs-svb-body{display:none;margin:0;border-radius:0;border-left:none;padding:0 14px;background:var(--bg,var(--off,#F8F7F4))}' +
    '.gs-svb-body.open{display:block}' +
    /* editor */
    '.gs-svb .gs-sp-lvl-group{display:flex;border:1px solid var(--border,#E0D9CC);border-radius:20px;overflow:hidden;flex-shrink:0}' +
    '.gs-svb .gs-sp-lvl-btn{width:34px;height:26px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:4px 8px;font-size:10.5px;font-weight:700;cursor:pointer;background:var(--white,#fff);color:var(--gray,#6B6B6B);border-right:1px solid var(--border,#E0D9CC)}' +
    '.gs-svb .gs-sp-lvl-btn:last-child{border-right:none}' +
    '.gs-svb .gs-sp-lvl-btn.active{background:var(--gold,#C9A84C);color:var(--black,#111)}' +
    '.gs-svb .gs-sp-lvl-btn:focus-visible{outline:2px solid var(--gold,#C9A84C);outline-offset:-2px}' +
    '.svc-remove-btn{background:none;border:none;color:var(--red,#c0392b);font-size:12px;cursor:pointer;padding:3px 6px}' + /* = admin.html */
    '.gs-svb-ed-tag{font-size:10.5px;color:var(--red,#c0392b);font-weight:700;text-transform:uppercase;letter-spacing:.04em}' +
    '.gs-svb-ed-row{border-bottom:1px solid var(--border,#E0DDD6)}' +
    '.gs-svb-ed-name[data-act]{cursor:pointer}' +
    '.svc-remove-btn.gs-svb-ed-pen{color:var(--gold-dk,#8C6F2A)}' +
    '.svc-remove-btn.gs-svb-ed-undo{color:var(--gray,#6B6B6B)}' +
    '.gs-svb-ed-removed{background:#FBEAEA;margin:0 -10px;padding:0 10px}' +
    '.gs-svb-ed-why{padding:0 0 10px}' +
    '.gs-svb-ed-why textarea{display:block;resize:vertical;min-height:40px}' +
    '.gs-svb-note{width:100%;box-sizing:border-box;border:1.5px solid var(--border,#E0DDD6);border-radius:5px;padding:7px 10px;font-size:12.5px;font-family:inherit;color:var(--black,#111);background:var(--bg,var(--off,#F8F7F4));outline:none}' +
    '.gs-svb-note:focus{border-color:var(--gold,#C9A84C);background:var(--white,#fff)}' +
    '.gs-svb-note::placeholder{color:#A9A49A}' +
    '.gs-svb-note.warn{border-color:var(--red,#c0392b)}' +
    '.gs-svb-ed-hit{all:unset;box-sizing:border-box;width:100%;padding:7px 10px;font-size:12.5px;border-radius:4px;cursor:pointer;display:flex;justify-content:space-between;gap:10px}' +
    '.gs-svb-ed-hit:hover,.gs-svb-ed-hit:focus-visible{background:var(--bg,var(--off,#F8F7F4))}' +
    '.gs-svb-ed-hit b{color:#27ae60;font-weight:700;font-size:11px;white-space:nowrap}' +
    '.gs-svb-editing .gs-svb-head{cursor:default}' +
    '.gs-svb-editing .gs-svb-body{padding:12px 14px}' +
    '.sv-list { display: flex; flex-direction: column; gap: 10px; padding: 12px 0; }' +
    '.sv-sec { border: 1px solid var(--border,#E0DDD6); border-radius: 10px; background: var(--white,#FFFFFF); overflow: hidden; }' +
    '.sv-sec + .sv-sec { margin-top: 8px; }' +
    '.sv-sec.open { border-color: #D8CBA4; }' +
    '.sv-sec-head { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 12px 14px; }' +
    '.sv-sec-headrow { display: flex; align-items: center; }' +
    '.last-change { font-size: 11px; line-height: 1.35; color: var(--gray,#6B6B6B); text-align: right; }' +
    '.last-change-at { display: block; color: var(--black,#111111); font-weight: 600; }' +
    '.sv-sec-headrow .sv-sec-head { flex: 1; min-width: 0; }' +
    '.sv-person-done { flex-shrink: 0; margin-right: 12px; }' +
    '.sv-sec-head:focus-visible { outline: 2px solid var(--gold,#C9A84C); outline-offset: -2px; border-radius: 10px; }' +
    '.sv-sec-head:hover .sv-sec-name { color: var(--gold-dk,#8C6F2A); }' +
    '.sv-sec-bar { width: 3px; align-self: stretch; border-radius: 2px; background: var(--gold,#C9A84C); flex: none; }' +
    '.sv-sec-txt { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }' +
    '.sv-sec-name { font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--black,#111111); transition: color .15s; }' +
    '.sv-sec-meta { font-size: 12px; color: var(--gray,#6B6B6B); }' +
    '.sv-sec-chev { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--bg,var(--off,#F8F7F4)); color: var(--gold-dk,#8C6F2A); transition: transform .2s, background .15s; }' +
    '.sv-sec-chev svg { width: 12px; height: 12px; }' +
    '.sv-sec.open .sv-sec-chev { transform: rotate(180deg); background: #F3ECD8; }' +
    '.sv-sec-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .22s ease; }' +
    '.sv-sec.open .sv-sec-wrap { grid-template-rows: 1fr; }' +
    '.sv-sec-wrap > div { overflow: hidden; }' +
    '.sv-sec-body { border-top: 1px solid var(--border,#E0DDD6); background: var(--bg,var(--off,#F8F7F4)); padding: 2px 12px 12px; }' +
    '.sv-sec-body .sv-list { padding: 10px 0 12px; }' +
    '.sv-sec-foot { display: flex; justify-content: flex-end; }' +
    '.sv-sec-total { font-size: 12px; color: var(--gray,#6B6B6B); margin: 0 2px 8px; }' +
    '.sv-sec-editing { font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--gold-dk,#8C6F2A); background: #F3ECD8; border-radius: 99px; padding: 2px 8px; }' +
    '.sv-sec-body.editing { background: var(--white,#FFFFFF); padding: 4px 14px 12px; }' +
    '@media (prefers-reduced-motion: reduce) { .sv-sec-wrap, .sv-sec-chev { transition: none; } }' +
    '.sv-card { border: 1px solid var(--border,#E0DDD6); border-radius: 10px; background: var(--white,#FFFFFF); padding: 14px 16px; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 4px 14px; }' +
    '.sv-card.done { background: #FAFCFA; border-color: #D5E6D9; }' +
    '.sv-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--gold,#C9A84C); }' +
    '.sv-name { font-size: 15px; font-weight: 600; margin-top: 3px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }' +
    '.sv-meta { font-size: 12px; color: var(--gray,#6B6B6B); margin-top: 3px; line-height: 1.5; }' +
    '.sv-sep { margin: 0 6px; color: #C9C3B6; }' +
    '.sv-lv { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 18px; padding: 0 6px; border-radius: 9px; font-size: 10px; font-weight: 700; color: var(--gold-dk,#8C6F2A); background: #F6EFD9; flex-shrink: 0; }' +
    '.sv-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }' +
    '.sv-st { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; white-space: nowrap; color: var(--gray,#6B6B6B); }' +
    '.sv-st i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }' +
    '.sv-st.assigned { color: #9A7B24; } .sv-st.waiting { color: #2E5FA3; } .sv-st.done { color: #3E7A4C; } .sv-st.needs { color: var(--red,#c0392b); }' +
    '.sv-act { font-family: inherit; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; border-radius: 6px; padding: 7px 12px; cursor: pointer; white-space: nowrap; background: var(--white,#FFFFFF); color: var(--gold-dk,#8C6F2A); border: 1.5px solid #D8C68F; }' +
    '.sv-act:hover { background: #FBF6E8; border-color: var(--gold,#C9A84C); }' +
    '.sv-act.blue { color: #2E5FA3; border-color: #AFC6EC; } .sv-act.blue:hover { background: #F2F6FC; }' +
    '.sv-done { font-size: 11px; font-weight: 700; color: #3E7A4C; white-space: nowrap; }' +
    '.sv-incl-toggle { font-family: inherit; font-size: 12px; color: var(--gold-dk,#8C6F2A); background: none; border: none; cursor: pointer; padding: 0; margin-top: 6px; display: inline-flex; align-items: center; gap: 4px; }' +
    '.sv-incl-toggle .car { display: inline-block; transition: transform .15s; }' +
    '.sv-incl-toggle.open .car { transform: rotate(90deg); }' +
    '.sv-incl { display: none; grid-column: 1 / -1; margin-top: 8px; padding-top: 10px; border-top: 1px dashed var(--border,#E0DDD6); grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px 18px; }' +
    '.sv-incl.open { display: grid; }' +
    '.sv-incl div { font-size: 12.5px; display: flex; justify-content: space-between; gap: 8px; }' +
    '.sv-list { gap: 6px; padding: 10px 0; }' +
    '.sv-card { padding: 9px 14px; align-items: center; }' +
    '.sv-eyebrow { display: none; }' +
    '.sv-main { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; min-width: 0; }' +
    '.sv-name { margin-top: 0; font-size: 14px; }' +
    '.sv-meta { margin-top: 0; }' +
    '.sv-incl-toggle { margin-top: 0; }' +
    '.sv-right { flex-direction: row; align-items: center; gap: 10px; }' +
    '@media (max-width: 560px) {' +
    '.sv-card { grid-template-columns: minmax(0,1fr); }' +
    '.sv-right { flex-direction: row; align-items: center; justify-content: space-between; margin-top: 8px; }' +
    '}';

  function styleTag() {
    if (document.getElementById(STYLE_ID)) return;
    var t = document.createElement('style');
    t.id = STYLE_ID;
    t.textContent = CSS;
    (document.head || document.documentElement).appendChild(t);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buttonsHtml(o) {
    o = o || {};
    return '<button type="button" class="gs-ofp-btn-secondary gs-svb-btn"' + (o.updateId ? ' id="' + esc(o.updateId) + '"' : '') +
        ' onclick="event.stopPropagation();' + esc(o.onUpdate || '') + '">Update</button>' +
      '<button type="button" class="gs-ofp-btn-secondary gs-svb-btn"' + (o.cancelId ? ' id="' + esc(o.cancelId) + '"' : '') +
        ' style="display:none" onclick="event.stopPropagation();' + esc(o.onCancel || '') + '">Cancel</button>';
  }

  function html(o) {
    styleTag();
    o = o || {};
    var n = Number(o.count) || 0;
    var noun = o.noun || 'service';
    return '<div class="gs-svb"' + (o.boxId ? ' id="' + esc(o.boxId) + '"' : '') + '>' +
      '<div class="gs-svb-head" onclick="GSServicesBox.toggle(\'' + esc(o.bodyId) + '\')">' +
        '<div class="gs-svb-title"><p class="detail-label gs-svb-label">' + esc(o.label || 'Services Requested') + '</p></div>' +
        '<div class="gs-svb-actions">' + (o.buttonsHtml || '') +
          '<span class="gs-svb-count"' + (o.countId ? ' id="' + esc(o.countId) + '"' : '') + '>&#9660; ' + n + ' ' + noun + (n === 1 ? '' : 's') + (o.countExtraHtml || '') + '</span>' +
        '</div>' +
      '</div>' +
      '<div id="' + esc(o.bodyId) + '" class="gs-svb-body' + (o.open ? ' open' : '') + '">' + (o.bodyHtml || '') + '</div>' +
    '</div>';
  }

  function cardHtml(c) {
    c = c || {};
    var bits = c.metaBits || [];
    return '<div class="sv-card' + (c.done ? ' done' : '') + '">' +
      '<div class="sv-main">' + (c.eyebrow != null ? '<div class="sv-eyebrow">' + esc(c.eyebrow) + '</div>' : '') +
      '<div class="sv-name">' + (c.nameHtml || '') + (c.lvTxt ? '<span class="sv-lv">' + esc(c.lvTxt) + '</span>' : '') + '</div>' +
      (bits.length ? '<div class="sv-meta">' + bits.join('<span class="sv-sep">\u00b7</span>') + '</div>' : '') +
      (c.inclToggleHtml || '') + '</div>' +
      (c.rightHtml ? '<div class="sv-right">' + c.rightHtml + '</div>' : '') +
      (c.inclHtml || '') +
    '</div>';
  }

  function listHtml(cards, emptyText) {
    styleTag();
    if (!cards || !cards.length) return '<p class="empty-note" style="padding:12px 0">' + esc(emptyText || 'No services.') + '</p>';
    return '<div class="sv-list">' + cards.join('') + '</div>';
  }

  function toggle(bodyId) {
    var el = document.getElementById(bodyId);
    if (el) el.classList.toggle('open');
  }


  /* ---------- editor (27/09/2026) ----------
     El editor de servicios de Admin (Approvals / Active): una tarjeta
     por division con "Editing", cada servicio con L1-L3 (Janitorial),
     su tiempo y la X; abajo "Search the catalog to add a service...",
     la caja de cambios ("No changes to services yet.") y "Estimated
     time". Mismo markup y clases que Admin (sv-sec, gs-sp-lvl-*,
     svc-remove-btn, est-time-box). Orders lo usa para pedir cambios de
     un contrato: quitar pide el por que y todo va a revision.
       var ed = GSServicesBox.editor({
         el, division: 'Janitorial',
         services: [{ServiceName, Category, SubOption, Level, Quantity}],
         catalog: [{serviceName, sku, category, division, requiresQuantity}],
         catalogFilter: function (c) { return true; },      // opcional
         minutesOf: function (sku, level, qty) { return n|null }, // opcional
         estimateHtml: function (rows) { return html },           // opcional
         diffHtml: function (baseNames, nowNames) { return html }, // opcional
         reasonRequired: true, onChange })
       ed.collect() -> { ok, added:[{serviceName, level, qty}],
                         removed:[{serviceName, note}], levels:[{serviceName, from, to}],
                         notes:[{serviceName, note}] }  // notas del lapiz
       ed.changed() */
  function fmtMin(m) { if (m == null) return ''; var h = Math.floor(m / 60), r = Math.round(m % 60); return h && r ? h + 'h ' + r + 'min' : h ? h + 'h' : r + 'min'; }
  function editor(o) {
    styleTag();
    o = o || {};
    var el = typeof o.el === 'string' ? document.getElementById(o.el) : o.el;
    if (!el) return null;
    var rows = (o.services || []).map(function (sv) {
      return { name: sv.ServiceName || '', cat: sv.Category || '', sku: sv.SubOption || '', level: sv.Level || '', level0: sv.Level || '', qty: sv.Quantity || '', existing: true, removed: false, reason: '' };
    });
    var query = '';
    var catalog = (o.catalog || []).filter(function (c) { return c && c.serviceName && (!o.catalogFilter || o.catalogFilter(c)); });
    function entry(name) { for (var i = 0; i < catalog.length; i++) if (catalog[i].serviceName === name) return catalog[i]; return null; }
    function skuOf(r) { var c = entry(r.name); return r.sku || (c && c.sku) || ''; }
    function isJan(r) { var c = entry(r.name); return String((c && c.division) || o.division || '').toLowerCase() === 'janitorial'; }
    function needsQty(r) { var c = entry(r.name); return !!(c && c.requiresQuantity); }
    function mins(r) { return o.minutesOf ? o.minutesOf(skuOf(r), r.level, r.qty) : null; }
    function live() { return rows.filter(function (r) { return !r.removed; }); }

    /* 27/09/2026 (dueno): renglon parejo -- nombre a la izquierda (si
       es largo se parte en dos lineas) y niveles/tiempo/boton siempre a
       la derecha en la misma linea, alineados en todos los renglones.
       Lapiz: abre la nota abajo del servicio (opcional) y en su lugar
       sale la X; la X lo quita (rosa, nota obligatoria, como "Selected
       for this order" de Admin). Tap en el nombre cierra la caja, borra
       la nota y regresa el lapiz. */
    function rowHtml(r, i) {
      /* Mismo renglon que renderApprSvcEditable de Admin: flex, nombre a
         la izquierda, controles a la derecha, sin anchos fijos. */
      var lv = isJan(r) && !r.removed ? '<div class="gs-sp-lvl-group" style="margin-right:14px">' + ['Level 1', 'Level 2', 'Level 3'].map(function (l, k) {
        return '<div class="gs-sp-lvl-btn' + (r.level === l ? ' active' : '') + '" role="button" tabindex="0" data-act="lv" data-i="' + i + '" data-v="' + l + '">L' + (k + 1) + '</div>';
      }).join('') + '</div>' : '';
      var qty = needsQty(r) && !r.removed ? '<span style="margin-right:14px"><span style="font-size:10px;color:var(--gray,#6B6B6B);text-transform:uppercase;margin-right:4px">Qty</span>' +
        '<input type="number" min="1" step="1" inputmode="numeric" data-act="qty" data-i="' + i + '" value="' + esc(r.qty) + '" style="width:48px;padding:5px 6px;border:1px solid var(--border,#E0DDD6);border-radius:4px;font-size:12px;text-align:center;font-family:inherit"></span>' : '';
      var m = r.removed ? null : mins(r);
      var needNote = r.removed && o.reasonRequired !== false;
      var time = m != null ? '<span style="color:var(--gold-dk,#8C6F2A);font-weight:600;margin-right:14px">' + esc(fmtMin(m)) + '</span>' : '';
      var btn = r.removed
        ? '<button type="button" class="svc-remove-btn gs-svb-ed-undo" data-act="x" data-i="' + i + '" title="Undo" aria-label="Undo remove ' + esc(r.name) + '">&#8635;</button>'
        : r.open
          ? '<button type="button" class="svc-remove-btn" data-act="x" data-i="' + i + '" title="Remove" aria-label="Remove ' + esc(r.name) + '">&#10005;</button>'
          : '<button type="button" class="svc-remove-btn gs-svb-ed-pen" data-act="pen" data-i="' + i + '" title="Add a note" aria-label="Add a note for ' + esc(r.name) + '">&#9998;</button>';
      var nameHtml = '<span' + (r.open && !r.removed ? ' class="gs-svb-ed-name" data-act="name" data-i="' + i + '" role="button" tabindex="0" title="Close the note"' : '') + '>' +
        '<span' + (r.removed ? ' style="text-decoration:line-through"' : '') + '>' + esc(r.name) + '</span>' +
        (r.removed ? '<br><span class="gs-svb-ed-tag">' + (needNote ? 'removed \u2014 note required' : 'removed') + '</span>' : '') + '</span>';
      var line = '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;font-size:13px">' + nameHtml +
        '<span style="display:flex;align-items:center">' + lv + qty + time + btn + '</span></div>';
      var why = r.open || r.removed
        ? '<div class="gs-svb-ed-why"><textarea rows="2" class="gs-svb-note' + (needNote && !String(r.reason || '').trim() ? ' warn' : '') + '" data-act="why" data-i="' + i + '" placeholder="' +
            (needNote ? 'Required \u2014 explain why you want to remove it' : 'Note for the office \u2014 optional') + '" aria-label="Note for ' + esc(r.name) + '">' + esc(r.reason) + '</textarea></div>' : '';
      return '<div class="gs-svb-ed-row' + (needNote ? ' gs-svb-ed-removed' : '') + '">' + line + why + '</div>';
    }

    function resultsHtml() {
      var q = query.trim().toLowerCase();
      if (!q) return '';
      var have = {}; rows.forEach(function (r) { have[r.name] = true; });
      var hits = catalog.filter(function (c) { return c.serviceName.toLowerCase().indexOf(q) !== -1 && !have[c.serviceName]; }).slice(0, 15);
      if (!hits.length) return '<div style="font-size:12px;color:#C9C5BA;font-style:italic;padding:4px 10px">No matches.</div>';
      return hits.map(function (c) {
        return '<button type="button" class="gs-svb-ed-hit" data-act="add" data-name="' + esc(c.serviceName) + '"><span>' + esc(c.serviceName) + '</span><b>+ add</b></button>';
      }).join('');
    }
    function names(list) { return list.map(function (r) { return r.name; }); }
    function diffPart() {
      var base = names(rows.filter(function (r) { return r.existing; }));
      return o.diffHtml ? o.diffHtml(base, names(live())) : '';
    }
    function estPart() { return o.estimateHtml ? o.estimateHtml(live().map(function (r) { return { SubOption: skuOf(r), Level: r.level, Quantity: r.qty, ServiceName: r.name }; })) : ''; }
    function metaText() {
      var l = live(), total = 0, any = false;
      l.forEach(function (r) { var m = mins(r); if (m != null) { total += m; any = true; } });
      return l.length + (l.length === 1 ? ' service' : ' services') + (any ? ' · ' + fmtMin(total) : '');
    }
    var chev = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    function listPart() {
      return (rows.length ? rows.map(rowHtml).join('') : '<p class="empty-note" style="padding:12px 0">No services.</p>') +
        '<div style="padding:12px 0 4px"><input type="text" data-act="q" placeholder="Search the catalog to add a service…" aria-label="Search the catalog to add a service" value="' + esc(query) + '" ' +
          'style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--border,#E0DDD6);border-radius:4px;font-size:13px;font-family:Inter,sans-serif;background:var(--white,#fff)">' +
          '<div class="gs-svb-ed-results" style="margin-top:8px">' + resultsHtml() + '</div></div>';
    }
    function render() {
      el.innerHTML = '<div class="sv-sec open">' +
        '<button type="button" class="sv-sec-head" aria-expanded="true" tabindex="-1"><span class="sv-sec-bar"></span><span class="sv-sec-txt"><span class="sv-sec-name">' + esc(o.division || 'Services') + '</span>' +
          '<span class="sv-sec-meta" data-part="meta">' + esc(metaText()) + '</span><span class="sv-sec-editing">Editing</span></span><span class="sv-sec-chev">' + chev + '</span></button>' +
        '<div class="sv-sec-wrap"><div><div class="sv-sec-body editing">' +
          '<div data-part="list">' + listPart() + '</div>' +
          '<div data-part="diff">' + diffPart() + '</div>' +
          '<div data-part="est">' + estPart() + '</div>' +
        '</div></div></div></div>';
    }
    function refresh(keepSearchFocus) {
      var list = el.querySelector('[data-part="list"]');
      if (!list) return render();
      list.innerHTML = listPart();
      el.querySelector('[data-part="diff"]').innerHTML = diffPart();
      el.querySelector('[data-part="est"]').innerHTML = estPart();
      el.querySelector('[data-part="meta"]').textContent = metaText();
      if (keepSearchFocus) { var qi = el.querySelector('[data-act="q"]'); if (qi) qi.focus(); }
    }
    function changedFn() { return rows.some(function (r) { return !r.existing || r.removed || (r.existing && r.level !== r.level0) || !!String(r.reason || '').trim(); }); }
    function fire() { if (typeof o.onChange === 'function') o.onChange(ctrl); }

    function act(b) {
      var a = b.getAttribute('data-act'), i = Number(b.getAttribute('data-i'));
      if (a === 'x') {
        var r = rows[i]; if (!r) return;
        if (r.existing) { r.removed = !r.removed; r.err = false; if (!r.removed) { r.open = false; r.reason = ''; } else r.open = true; } else rows.splice(i, 1);
        refresh(); fire();
      } else if (a === 'pen') {
        rows[i].open = true; refresh(); fire();
        var t = el.querySelector('[data-act="why"][data-i="' + i + '"]'); if (t) t.focus();
      } else if (a === 'name') {
        rows[i].open = false; rows[i].reason = ''; refresh(); fire();
      } else if (a === 'lv') {
        rows[i].level = b.getAttribute('data-v'); refresh(); fire();
      } else if (a === 'add') {
        var c = entry(b.getAttribute('data-name')); if (!c) return;
        rows.push({ name: c.serviceName, cat: c.category || '', sku: c.sku || '', level: String(c.division || '').toLowerCase() === 'janitorial' ? 'Level 1' : '', level0: '', qty: c.requiresQuantity ? 1 : '', existing: false, removed: false, reason: '' });
        query = ''; refresh(true); fire();
      }
    }
    el.addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (b && el.contains(b) && ['x', 'lv', 'add', 'pen', 'name'].indexOf(b.getAttribute('data-act')) !== -1) act(b); });
    el.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && /^(lv|name)$/.test(e.target.getAttribute('data-act') || '')) { e.preventDefault(); act(e.target); } });
    el.addEventListener('input', function (e) {
      var t = e.target, a = t.getAttribute && t.getAttribute('data-act'), i = Number(t.getAttribute('data-i'));
      if (a === 'q') { query = t.value; var box = el.querySelector('.gs-svb-ed-results'); if (box) box.innerHTML = resultsHtml(); }
      else if (a === 'why' && rows[i]) { rows[i].reason = t.value; if (rows[i].removed && o.reasonRequired !== false) t.classList.toggle('warn', !t.value.trim()); fire(); }
      else if (a === 'qty' && rows[i]) { var n = parseInt(t.value, 10); rows[i].qty = n > 0 ? n : ''; el.querySelector('[data-part="est"]').innerHTML = estPart(); el.querySelector('[data-part="meta"]').textContent = metaText(); fire(); }
    });

    var ctrl = {
      changed: changedFn,
      collect: function () {
        var ok = true;
        rows.forEach(function (r) { r.err = r.removed && o.reasonRequired !== false && !String(r.reason || '').trim(); if (r.err) ok = false; });
        if (!ok) refresh();
        return {
          ok: ok,
          added: rows.filter(function (r) { return !r.existing; }).map(function (r) { return { serviceName: r.name, level: r.level || '', qty: r.qty || '' }; }),
          removed: rows.filter(function (r) { return r.removed; }).map(function (r) { return { serviceName: r.name, note: String(r.reason || '').trim() }; }),
          levels: rows.filter(function (r) { return r.existing && !r.removed && r.level !== r.level0; }).map(function (r) { return { serviceName: r.name, from: r.level0, to: r.level }; }),
          notes: rows.filter(function (r) { return !r.removed && String(r.reason || '').trim(); }).map(function (r) { return { serviceName: r.name, note: String(r.reason).trim() }; })
        };
      }
    };
    render();
    return ctrl;
  }

  styleTag();
  window.GSServicesBox = { html: html, buttonsHtml: buttonsHtml, cardHtml: cardHtml, listHtml: listHtml, toggle: toggle, editor: editor, styleTag: styleTag };
})();
