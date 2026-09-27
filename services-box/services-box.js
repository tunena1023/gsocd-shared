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

  styleTag();
  window.GSServicesBox = { html: html, buttonsHtml: buttonsHtml, cardHtml: cardHtml, listHtml: listHtml, toggle: toggle, styleTag: styleTag };
})();
