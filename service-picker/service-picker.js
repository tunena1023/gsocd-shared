(function () {
  'use strict';

  if (window.GSServicePicker) return;

  var instances = {};

  function styleTag() {
    if (document.getElementById('gs-sp-style')) return;
    var style = document.createElement('style');
    style.id = 'gs-sp-style';
    style.textContent =
      '.gs-sp-res-wrap{display:flex;align-items:center;gap:8px;margin:16px 0}' +
      '.gs-sp-res-label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gray,#6B6B6B)}' +
      '.gs-sp-toggle{position:relative;display:inline-block;width:40px;height:22px;vertical-align:middle;cursor:pointer}' +
      '.gs-sp-toggle input{opacity:0;width:0;height:0}' +
      '.gs-sp-toggle-track{position:absolute;inset:0;background:var(--border,#E0D9CC);border-radius:22px;transition:background .2s}' +
      '.gs-sp-toggle-track::before{content:"";position:absolute;height:18px;width:18px;left:2px;top:2px;background:var(--white,#fff);border-radius:50%;transition:transform .2s;box-shadow:0 1px 2px rgba(0,0,0,.25)}' +
      '.gs-sp-toggle input:checked+.gs-sp-toggle-track{background:var(--gold,#C9A84C)}' +
      '.gs-sp-toggle input:checked+.gs-sp-toggle-track::before{transform:translateX(18px)}' +
      '.gs-sp-toolbar-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap}' +
      '.gs-sp-search{flex:1;min-width:140px;max-width:none;padding:9px 12px;border:1px solid var(--border,#E0D9CC);border-radius:3px;font-size:13px;font-family:inherit}' +
      '.gs-sp-selall{display:flex;align-items:center;gap:10px;flex-shrink:0}' +
      '.gs-sp-selall-label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gray,#6B6B6B)}' +
      '.gs-sp-lvl3{position:relative;display:flex;width:180px;height:34px;background:var(--border,#E0D9CC);border-radius:17px;padding:3px;flex-shrink:0}' +
      '.gs-sp-lvl3-thumb{position:absolute;top:3px;left:3px;width:calc(33.333% - 2px);height:calc(100% - 6px);background:var(--gold,#C9A84C);border-radius:14px;transition:transform .25s cubic-bezier(.4,0,.2,1),opacity .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);opacity:0}' +
      '.gs-sp-lvl3-opt{position:relative;flex:1;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--gray,#6B6B6B);cursor:pointer;z-index:1;transition:color .25s}' +
      '.gs-sp-lvl3-opt.active{color:var(--black,#111)}' +
      '.gs-sp-chip-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}' +
      '.gs-sp-chip-btn{border:1px solid var(--border,#E0D9CC);background:var(--white,#fff);padding:10px 12px;font-size:12px;text-align:left;cursor:pointer;border-radius:2px;font-family:inherit;color:var(--black,#111)}' +
      '.gs-sp-chip-btn.active{background:var(--gold,#C9A84C);border-color:var(--gold,#C9A84C);font-weight:700}' +
      '.gs-sp-row-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}' +
      '.gs-sp-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 10px;border:1px solid var(--border,#E0D9CC);border-radius:3px;background:var(--white,#fff);transition:border-color .15s,background .15s}' +
      '.gs-sp-row.selected{border-color:var(--gold,#C9A84C);background:#FEFBF3}' +
      '.gs-sp-row-name{font-size:12px}' +
      '.gs-sp-lvl-group{display:flex;border:1px solid var(--border,#E0D9CC);border-radius:20px;overflow:hidden;flex-shrink:0}' +
      '.gs-sp-lvl-btn{width:34px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;cursor:pointer;background:var(--white,#fff);color:var(--gray,#6B6B6B);border-right:1px solid var(--border,#E0D9CC)}' +
      '.gs-sp-lvl-btn:last-child{border-right:none}' +
      '.gs-sp-lvl-btn.active{background:var(--gold,#C9A84C);color:var(--black,#111)}' +
      '.gs-sp-lvl-btn:hover:not(.active){background:var(--off,#F7F6F3)}' +
      '.gs-sp-empty{color:var(--gray,#6B6B6B);font-size:13px}' +
      /* Cantidad -- servicios marcados en el catalogo (Developer >
         Catalog, casilla "Requires quantity") como puertas, ventanas,
         persianas, etc. que no son un simple si/no sino "cuantas".
         Mismo layout de fila que Janitorial (gs-sp-row), en vez de
         los botones de nivel va un numero. */
      '.gs-sp-qty-input{width:52px;padding:6px 8px;border:1px solid var(--border,#E0D9CC);border-radius:4px;font-size:13px;font-family:inherit;text-align:center}' +
      '.gs-sp-qty-input:focus{outline:none;border-color:var(--gold,#C9A84C)}' +
      '.gs-sp-qty-label{font-size:10px;color:var(--gray,#6B6B6B);text-transform:uppercase;letter-spacing:.04em;margin-right:6px}' +
      '@media (max-width:900px){.gs-sp-chip-grid,.gs-sp-row-grid{grid-template-columns:1fr 1fr}}' +
      '@media (max-width:640px){.gs-sp-chip-grid,.gs-sp-row-grid{grid-template-columns:1fr}}' +
      /* Acordeon por categoria -- confirmado con el usuario: sin
         categorias no tiene caso, y su catalogo (importado de
         QuickBooks) no traia ese campo, asi que ahora se mantiene a
         mano (Developer > Catalog). Servicios sin categoria caen en
         "Uncategorized", nunca se pierden. */
      '.gs-sp-cat-group{border:1px solid var(--border,#E0D9CC);margin-bottom:8px;border-radius:4px;overflow:hidden}' +
      '.gs-sp-cat-header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;cursor:pointer;background:#F7F6F3}' +
      '.gs-sp-cat-header.has-selected{background:#FEFBF3}' +
      '.gs-sp-cat-header.open{background:#EDE7D8}' +
      '.gs-sp-cat-name{font-size:13px;font-weight:600}' +
      '.gs-sp-cat-count{font-size:10px;color:var(--gold-dk,#8C6F2A);font-weight:700;background:#F0E4C4;padding:2px 8px;border-radius:10px;margin-left:8px}' +
      '.gs-sp-cat-arrow{font-size:11px;color:var(--gray,#6B6B6B);transition:transform .2s;flex-shrink:0}' +
      '.gs-sp-cat-arrow.open{transform:rotate(90deg)}' +
      '.gs-sp-cat-body{display:none;padding:8px 12px 12px;border-top:1px solid var(--border,#E0D9CC)}' +
      '.gs-sp-cat-body.open{display:block}' +
      '.gs-sp-cat-body .gs-sp-chip-grid,.gs-sp-cat-body .gs-sp-row-grid{grid-template-columns:1fr}' +
      /* El contenedor de las cajas de categoria (no lo de adentro de
         cada una, eso ya tenia su propio grid arriba) -- 2 columnas
         en desktop, 1 en mobile. Faltaba esta regla, la clase se
         ponia en JS pero nunca tuvo CSS -- por eso siempre se veia
         apilado en 1 sola columna sin importar el ancho. */
      '.gs-sp-accordion{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}' +
      /* v1.51.0: toggle Recurring / Units + tarjetas por area */
      '.gs-sp-toggles{display:flex;flex-wrap:wrap;gap:4px 28px}' +
      '.gs-sp-area-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}' +
      '.gs-sp-area-card{border:1px solid var(--border,#E0D9CC);background:var(--white,#fff);transition:border-color .15s ease,box-shadow .15s ease}' +
      '.gs-sp-area-card:hover{border-color:#D8CBA6;box-shadow:0 2px 8px rgba(0,0,0,.05)}' +
      '.gs-sp-area-card.open{grid-column:1/-1;border-color:var(--gold,#C9A84C)}' +
      '.gs-sp-area-card.match{border-color:var(--gold,#C9A84C)}' +
      '.gs-sp-area-head{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;cursor:pointer}' +
      '.gs-sp-area-name{font-size:13px;font-weight:700}' +
      '.gs-sp-area-prev{font-size:11px;color:var(--gray,#6B6B6B);margin-top:3px;line-height:1.4}' +
      '.gs-sp-area-count{margin-left:auto;font-size:10px;color:var(--gold-dk,#8C6F2A);font-weight:700;background:#F0E4C4;padding:2px 8px;border-radius:10px;white-space:nowrap}' +
      '.gs-sp-area-tag{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--gold-dk,#8C6F2A);margin-left:8px}' +
      '.gs-sp-area-sel{font-size:10px;color:#3E7A4C;font-weight:700;margin-left:6px}' +
      '.gs-sp-area-body{border-top:1px solid var(--border,#E0D9CC);padding:10px 12px 12px}' +
      '.gs-sp-area-body .gs-sp-row-grid,.gs-sp-area-body .gs-sp-chip-grid{grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}' +
      '.gs-sp-others{display:inline-block;margin:12px 0 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-dk,#8C6F2A);cursor:pointer}' +
      '.gs-sp-others-box{margin-top:6px}' +
      /* v1.52.0: paquetes como plantilla (modo Units) */
      '.gs-sp-sec-title{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gray,#6B6B6B);margin:14px 0 8px}' +
      '.gs-sp-sec-title:first-child{margin-top:0}' +
      '.gs-sp-area-card.used{border-color:#3E7A4C;background:#F6FAF6}' +
      '.gs-sp-otherdiv{font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#E8F0FA;color:#2D5F8A;padding:2px 7px;border-radius:10px;white-space:nowrap}' +
      '.gs-sp-usebtn{padding:6px 14px;min-width:70px;text-align:center;white-space:nowrap}' +
      '.gs-sp-inchip{font-size:11.5px;padding:5px 12px;flex-shrink:0}' +
      '.gs-sp-res-wrap.gs-sp-locked{opacity:.4;cursor:not-allowed}' +
      '.gs-sp-res-wrap.gs-sp-locked .gs-sp-toggle{pointer-events:none}' +
      '.gs-sp-pkgs-split{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:12px;align-items:start}' +
      '.gs-sp-pkgs-side{display:flex;flex-direction:column;gap:10px}' +
      '.gs-sp-pkgs-main>.gs-sp-area-card,.gs-sp-pkgs-side>.gs-sp-area-card{grid-column:auto!important;margin:0}' +
      '@media (max-width:760px){.gs-sp-pkgs-split{grid-template-columns:1fr}}' +
      '.gs-sp-usual-tag.saved{background:#E6F2EF;color:#2F6F62}' +
      '.gs-sp-usual-name{margin-top:12px}' +
      '.gs-sp-usual-name label{display:block;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gray,#6B6B6B);margin-bottom:6px}' +
      '.gs-sp-usual-name input{width:100%;box-sizing:border-box;border:1.5px solid var(--border,#E0D9CC);border-radius:8px;padding:10px 12px;font-size:13.5px;font-family:inherit;outline:none}' +
      '.gs-sp-usual-name input:focus{border-color:var(--gold,#C9A84C)}' +
      '.gs-sp-usual-tag{display:inline-flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#F0E8FA;color:#6B3FA0;padding:3px 9px;border-radius:20px;white-space:nowrap;margin-left:auto;flex-shrink:0}' +
      '.gs-sp-pkg-use{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gray,#6B6B6B);margin:0 0 6px}' +
      '.gs-sp-pkg-lines{margin-top:10px;border-top:1px dashed var(--border,#E0D9CC);padding-top:6px}' +
      '.gs-sp-pkg-line{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:6px 0;border-bottom:1px dashed var(--border,#E0D9CC)}' +
      '.gs-sp-pkg-line:last-child{border-bottom:none}' +
      /* v1.57.0 -- Edit de paquete por cliente (solo si packageEdit) */
      '.gs-sp-pkg-edit{margin-left:auto;font-family:inherit;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--black,#111);background:var(--white,#fff);border:1.5px solid var(--border,#E0D9CC);border-radius:6px;padding:5px 12px;cursor:pointer}' +
      '.gs-sp-pkg-edit:hover{border-color:var(--gold,#C9A84C)}' +
      '.gs-sp-pkg-edit + .gs-sp-area-count{margin-left:0}' +
      '.gs-sp-pkg-cust{display:inline-block;font-size:10px;font-weight:700;color:#3E7A4C;background:#EAF3EC;padding:2px 8px;border-radius:10px;margin-left:6px;vertical-align:2px}' +
      '.gs-sp-pkg-reset{display:table;font-size:11px;color:var(--gold-dk,#8C6F2A);text-decoration:underline;cursor:pointer;margin-top:4px}' +
      '.gs-sp-area-card.custom{border-color:#9CC7A6}' +
      '.gs-sp-pkg-eline{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;padding:7px 0;border-bottom:1px dashed var(--border,#E0D9CC)}' +
      '.gs-sp-pkg-eline .gs-sp-lvl-group{flex-shrink:0}' +
      '.gs-sp-pkg-eright{display:flex;align-items:center;gap:8px;flex-shrink:0}' +
      '.gs-sp-pkg-rm{background:none;border:none;color:var(--gray,#6B6B6B);font-size:16px;line-height:1;cursor:pointer;padding:2px 4px}' +
      '.gs-sp-pkg-rm:hover{color:#c0392b}' +
      '.gs-sp-pkg-add{display:flex;gap:8px;margin-top:10px}' +
      '.gs-sp-pkg-search{display:flex;align-items:center;gap:8px;margin-top:12px;padding:0 12px;border:1.5px solid #E6D3A0;border-radius:8px;background:#FFFDF7;transition:border-color .2s,box-shadow .2s}' +
      '.gs-sp-pkg-search:focus-within{border-color:var(--gold,#C9A84C);box-shadow:0 0 0 3px rgba(201,168,76,.15)}' +
      '.gs-sp-pkg-search svg{width:16px;height:16px;color:var(--gold-dk,#8C6F2A);flex-shrink:0}' +
      '.gs-sp-pkg-search input{flex:1;min-width:0;border:none;outline:none;background:transparent;padding:11px 0;font-size:13.5px;font-family:inherit;color:var(--black,#111)}' +
      '.gs-sp-pkg-search input::placeholder{color:#A89A78}' +
      '.gs-sp-pkg-results{display:none;margin-top:6px;border:1px solid #EFE6CF;border-radius:8px;background:var(--white,#fff);overflow:hidden}' +
      '.gs-sp-pkg-hit{display:flex;align-items:center;gap:10px;padding:9px 12px;font-size:13px;cursor:pointer;border-top:1px solid #F4EFE3}' +
      '.gs-sp-pkg-hit:first-child{border-top:none}' +
      '.gs-sp-pkg-hit:hover{background:#FBF6E8}' +
      '.gs-sp-pkg-hit .cat{font-size:11px;color:var(--gray,#6B6B6B)}' +
      '.gs-sp-pkg-hit .add{margin-left:auto;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gold-dk,#8C6F2A)}' +
      '.gs-sp-pkg-nohit{padding:10px 12px;font-size:12.5px;color:var(--gray,#6B6B6B)}' +
      '.gs-sp-pkg-add select{flex:1;min-width:0;padding:8px 10px;border:1px solid var(--border,#E0D9CC);border-radius:3px;font-size:13px;font-family:inherit;background:var(--white,#fff)}' +
      '.gs-sp-pkg-add button,.gs-sp-pkg-foot button{font-family:inherit;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:6px;padding:8px 14px;cursor:pointer}' +
      '.gs-sp-pkg-add button{background:var(--white,#fff);border:1.5px solid var(--border,#E0D9CC)}' +
      '.gs-sp-pkg-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap}' +
      '.gs-sp-pkg-cancel{background:var(--white,#fff);border:1.5px solid var(--border,#E0D9CC);color:var(--black,#111)}' +
      '.gs-sp-pkg-save{background:linear-gradient(155deg,#EAD9A0 0%,#C9A84C 45%,#8C6F2A 100%);border:none;color:#171310}' +
      '.gs-sp-pkg-save:disabled{opacity:.5;cursor:not-allowed}' +
      '.gs-sp-pkg-note{font-size:11px;color:var(--gray,#6B6B6B);margin-top:8px}' +
      '@media (max-width:420px){.gs-sp-pkg-eline{flex-wrap:wrap}.gs-sp-pkg-eright{margin-left:auto}}' +
      '.gs-sp-pkg-line .lv{color:var(--gold-dk,#8C6F2A);font-weight:700;font-size:11px;white-space:nowrap}' +
      '.gs-sp-pkg-cols2,.gs-sp-pkg-cols3{display:grid;column-gap:28px;align-items:start}' +
      '.gs-sp-pkg-cols2{grid-template-columns:repeat(2,minmax(0,1fr))}' +
      '.gs-sp-pkg-cols3{grid-template-columns:repeat(3,minmax(0,1fr))}' +
      '.gs-sp-pkg-cols2 .gs-sp-pkg-line,.gs-sp-pkg-cols3 .gs-sp-pkg-line{align-items:center;border-bottom:1px dashed var(--border,#E0D9CC)}' +
      '.gs-sp-pkg-lname{min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
      '.gs-sp-pkg-ilv{flex-shrink:0}' +
      '.gs-sp-pkg-ilv .gs-sp-lvl-btn{padding:4px 8px;font-size:10.5px}' +
      '.gs-sp-pkg-lines.off .gs-sp-pkg-ilv{opacity:.35;pointer-events:none}' +
      '@media (max-width:1100px){.gs-sp-pkg-cols3{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
      '@media (max-width:700px){.gs-sp-pkg-cols2,.gs-sp-pkg-cols3{grid-template-columns:1fr}}' +
      '.gs-sp-price{display:inline-block;margin-left:8px;font-size:11px;font-weight:700;color:var(--gold-dk,#8C6F2A);background:#FBF7EC;border:1px solid rgba(201,168,76,.35);padding:1px 7px;border-radius:10px;white-space:nowrap;vertical-align:1px}' +
      '.gs-sp-price.inc{color:#3E7A4C;background:#F1F7F2;border-color:#CFE3D3}' +
      '.gs-sp-inpkg{font-size:10px;font-weight:700;color:#3E7A4C;margin-left:6px;text-transform:uppercase;letter-spacing:.04em}' +
      '@media (max-width:640px){.gs-sp-accordion{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function svcKey(propertyType, name) { return propertyType + '|' + name; }

  function fireChange(pickerId) {
    var inst = instances[pickerId];
    if (inst.onChange) inst.onChange(inst.selected, inst.svcLevel, inst.propertyType, inst.svcQty);
    document.dispatchEvent(new CustomEvent('gs-services-changed', {
      detail: { pickerId: pickerId, selected: inst.selected, svcLevel: inst.svcLevel, propertyType: inst.propertyType, svcQty: inst.svcQty }
    }));
  }


  function visibleList(inst) {
    var q = inst.searchEl ? (inst.searchEl.value || '').trim().toLowerCase() : '';
    var list = inst.catalog.filter(function (s) {
      var divMatch = inst.crossDivision || s.division.toLowerCase() === inst.division.toLowerCase();
      return divMatch && s.propertyType === inst.propertyType;
    });
    if (inst.filterMode === 'selected-plus-search') {
      var selectedNames = Object.keys(inst.selected[inst.propertyType] || {});
      list = list.filter(function (s) {
        return selectedNames.indexOf(s.serviceName) !== -1 || (q && s.serviceName.toLowerCase().indexOf(q) !== -1);
      });
    } else if (q) {
      list = list.filter(function (s) { return s.serviceName.toLowerCase().indexOf(q) !== -1; });
    }
    list.sort(function (a, b) { return a.serviceName.localeCompare(b.serviceName); });
    return list;
  }

  /* Janitorial es la unica division con niveles (L1/L2/L3) de verdad
     -- las demas siempre fueron un simple toggle. Antes esto se
     decidia por el modo GLOBAL del picker (inst.mode), asumiendo que
     TODO lo que se muestra es de una sola division a la vez. Con
     crossDivision (Admin ya lo usaba; Orders lo suma para su pestana
     "Mixed") un mismo picker puede mostrar Janitorial MEZCLADO con
     otras divisiones -- se decide por cada servicio individual segun
     SU PROPIA division, para que Janitorial siempre tenga sus
     niveles sin importar que mas se este mostrando junto. */
  function isLeveledItem(s) {
    return String(s.division || '').toLowerCase() === 'janitorial';
  }

  /* Servicio marcado en el catalogo como "pide cantidad" -- puertas,
     ventanas, persianas, etc. Se decide por servicio individual
     (igual que isLeveledItem), asi que puede convivir con toggles y
     niveles en el mismo picker sin problema. */
  function isQuantityItem(s) {
    return !!s.requiresQuantity;
  }

  /* v1.50.0: nombre con su descripcion en tooltip (gsocd-shared/
     service-tooltip), si esa pieza esta cargada y el servicio trae
     description. Sin ella, el nombre sale igual que siempre. */
  function nameWithTip(s) {
    var text = escapeHtml(s.serviceName);
    return (window.GSServiceTooltip && s.description) ? window.GSServiceTooltip.nameHtml(s.sku, text) : text;
  }

  /* v1.55.0 -- precios (solo si showPrices: el dueño decide por cliente,
     apagado por default). s.price = precio de QuickBooks (Level 1);
     s.levelPrices = { 'Level 1': x, 'Level 2': y, 'Level 3': z } cuando
     el servicio tiene ajuste por nivel (Service Times). Se muestra el
     precio del nivel elegido, o el de Level 1 si no hay nivel. */
  function priceHtml(inst, s) {
    if (!inst.showPrices) return '';
    var lv = inst.svcLevel[svcKey(s.propertyType, s.serviceName)] || 'Level 1';
    var p = s.levelPrices && s.levelPrices[lv] != null ? s.levelPrices[lv] : s.price;
    if (p == null || p === '' || isNaN(Number(p))) return '';
    var n = Number(p);
    return '<span class="gs-sp-price">$' + (n % 1 ? n.toFixed(2) : String(n)) + '</span>';
  }
  function itemHtml(inst, s) {
    if (isLeveledItem(s)) {
      var sel = String((inst.selected[inst.propertyType] || {})[s.serviceName]) === String(s.sku);
      var lvl = sel ? inst.svcLevel[svcKey(inst.propertyType, s.serviceName)] : null;
      var levels = ['Level 1', 'Level 2', 'Level 3'];
      var btns = levels.map(function (l, i) {
        return '<div class="gs-sp-lvl-btn' + (lvl === l ? ' active' : '') + '" data-sku="' + escapeAttr(s.sku) + '" data-level="' + l + '">L' + (i + 1) + '</div>';
      }).join('');
      return '<div class="gs-sp-row' + (lvl ? ' selected' : '') + '">' +
        '<span class="gs-sp-row-name">' + nameWithTip(s) + priceHtml(inst, s) + '</span>' +
        '<div class="gs-sp-lvl-group">' + btns + '</div></div>';
    }
    if (isQuantityItem(s)) {
      var qsel = String((inst.selected[inst.propertyType] || {})[s.serviceName]) === String(s.sku);
      var qty = qsel ? (inst.svcQty[svcKey(inst.propertyType, s.serviceName)] || '') : '';
      return '<div class="gs-sp-row' + (qsel ? ' selected' : '') + '">' +
        '<span class="gs-sp-row-name">' + nameWithTip(s) + priceHtml(inst, s) + '</span>' +
        '<span><span class="gs-sp-qty-label">Qty</span>' +
        '<input type="number" class="gs-sp-qty-input" min="1" step="1" inputmode="numeric" ' +
        'data-sku="' + escapeAttr(s.sku) + '" value="' + escapeAttr(qty) + '"></span></div>';
    }
    var active = String((inst.selected[inst.propertyType] || {})[s.serviceName]) === String(s.sku);
    return '<button type="button" class="gs-sp-chip-btn' + (active ? ' active' : '') + '" data-sku="' + escapeAttr(s.sku) + '">' + nameWithTip(s) + priceHtml(inst, s) + '</button>';
  }

  function bindItemEvents(inst, pickerId, scopeEl) {
    /* Se enganchan los 3 tipos de evento siempre, sin importar
       inst.mode -- una pantalla mezclada puede tener botones de
       nivel, chips de toggle, y campos de cantidad al mismo tiempo. */
    Array.prototype.forEach.call(scopeEl.querySelectorAll('.gs-sp-lvl-btn[data-sku]'), function (btn) {
      btn.addEventListener('click', function () { pickLevel(pickerId, btn.dataset.sku, btn.dataset.level); });
    });
    Array.prototype.forEach.call(scopeEl.querySelectorAll('.gs-sp-chip-btn'), function (btn) {
      btn.addEventListener('click', function () { toggleChip(pickerId, btn.dataset.sku); });
    });
    Array.prototype.forEach.call(scopeEl.querySelectorAll('.gs-sp-qty-input'), function (input) {
      /* 'input' (cada tecla) solo actualiza el estado y avisa a quien
         este escuchando -- NUNCA renderGrid aqui, o el campo se
         recrea en cada tecla y el cursor/foco se pierde a media
         escritura. 'change' (al salir del campo) si hace un render
         completo, para limpiar el valor mostrado y actualizar el
         contador de la categoria y el resaltado de "seleccionado". */
      input.addEventListener('input', function () { setQuantity(pickerId, input.dataset.sku, input.value, false); });
      input.addEventListener('change', function () { setQuantity(pickerId, input.dataset.sku, input.value, true); });
      input.addEventListener('click', function (e) { e.stopPropagation(); });
    });
  }

  function isSelected(inst, s) {
    return String((inst.selected[inst.propertyType] || {})[s.serviceName]) === String(s.sku);
  }

  /* Acordeon por categoria -- confirmado con el usuario: sin
     categorias reales de su catalogo (viene de QuickBooks, sin ese
     campo), se mantiene a mano desde Developer. Servicios sin
     categoria asignada todavia caen en "Uncategorized" al final, sin
     perderse. Buscar abre solo las categorias con resultados (mismo
     criterio ya aprobado en el mini). */
  function renderGroupedGrid(pickerId, inst, list, targetEl) {
    var grid = targetEl || inst.gridEl;
    var q = inst.searchEl ? (inst.searchEl.value || '').trim().toLowerCase() : '';
    var groups = {};
    var order = [];
    list.forEach(function (s) {
      var cat = s.category || 'Uncategorized';
      if (!groups[cat]) { groups[cat] = []; order.push(cat); }
      groups[cat].push(s);
    });
    order.sort(function (a, b) {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });

    grid.className = 'gs-sp-accordion';
    grid.innerHTML = order.map(function (cat, i) {
      var items = groups[cat];
      var count = items.filter(function (s) { return isSelected(inst, s); }).length;
      var isOpen = q ? true : !!inst.openCats[cat];
      var gridClass = inst.mode === 'levels' ? 'gs-sp-row-grid' : 'gs-sp-chip-grid';
      return '<div class="gs-sp-cat-group">' +
        '<div class="gs-sp-cat-header' + (count ? ' has-selected' : '') + (isOpen ? ' open' : '') + '" data-cat="' + escapeAttr(cat) + '">' +
        '<span class="gs-sp-cat-name">' + escapeHtml(cat) + (count ? '<span class="gs-sp-cat-count">' + count + '</span>' : '') + '</span>' +
        '<span class="gs-sp-cat-arrow' + (isOpen ? ' open' : '') + '">\u25B8</span>' +
        '</div>' +
        '<div class="gs-sp-cat-body' + (isOpen ? ' open' : '') + '"><div class="' + gridClass + '">' +
        items.map(function (s) { return itemHtml(inst, s); }).join('') +
        '</div></div></div>';
    }).join('');

    Array.prototype.forEach.call(grid.querySelectorAll('.gs-sp-cat-header'), function (header) {
      header.addEventListener('click', function () {
        var cat = header.dataset.cat;
        var wasOpen = !!inst.openCats[cat];
        /* Solo una categoria abierta a la vez: se cierran todas y,
           si la que tocaste no estaba ya abierta, se abre nada mas
           esa. Si ya estaba abierta, clic la cierra y no abre otra. */
        inst.openCats = {};
        if (!wasOpen) inst.openCats[cat] = true;
        renderGrid(pickerId);
      });
    });
    bindItemEvents(inst, pickerId, grid);
  }

  /* v1.51.0 -- Recurring: Common Areas en tarjetas por AREA (donde se
     hace el trabajo), no una lista interminable. Cada servicio trae
     s.areas (lista, un servicio puede estar en varias tarjetas). La
     tarjeta de placeArea (el lugar que se esta editando) se abre sola
     y va primero. Los servicios de Common Areas sin area marcada caen
     en "More common areas". Lo demas (Floors, Kitchen & Bathrooms...)
     queda a un clic en "+ Other services". Pedido y aprobado con mini
     por el dueño (23/09/2026). */
  var DEFAULT_AREAS = ['Restrooms & Locker Rooms', 'Hallways & Floors', 'Lobby & Entry', 'Elevators & Stairs', 'Trash',
    'Kitchen & Breakroom', 'Offices & Meeting Rooms', 'Amenities', 'Exterior'];
  function renderAreaCards(pickerId, inst, list) {
    var grid = inst.gridEl;
    var names = (inst.areaNames || DEFAULT_AREAS).slice();
    var byArea = {};
    names.forEach(function (a) { byArea[a] = []; });
    var untagged = [];
    list.forEach(function (s) {
      var areas = Array.isArray(s.areas) ? s.areas : [];
      var placed = false;
      areas.forEach(function (a) { if (byArea[a]) { byArea[a].push(s); placed = true; } });
      if (!placed && (s.category || '') === 'Common Areas') untagged.push(s);
    });
    if (untagged.length) { names.push('More common areas'); byArea['More common areas'] = untagged; }
    names = names.filter(function (a) { return byArea[a].length; });
    if (inst.placeArea && byArea[inst.placeArea]) {
      names.sort(function (a, b) { return a === inst.placeArea ? -1 : b === inst.placeArea ? 1 : 0; });
      /* La tarjeta del lugar que se edita se abre sola (sin seleccionar nada). */
      if (!inst.areasTouched) { inst.openUsual = {}; inst.openUsual['area:' + inst.placeArea] = true; }
    }
    /* v1.67.0 (24/09/2026, el dueño: "en Recurring no se pueden seleccionar
       las areas... se deben poder seleccionar como paquetes: si hago clic en
       Hallways & Floors se selecciona todo lo que este ahi"): cada area es un
       SET como el usual -- abrirla selecciona todos sus servicios (Level 1
       los que tienen nivel), "Use these services" pone un nivel a todos y
       picar el marcado los quita; cada servicio se cambia solo. Una sola
       abierta, a la izquierda; las demas a la derecha. */
    var bySku = {}; inst.catalog.forEach(function (c) { bySku[String(c.sku)] = c; });
    var isPkg = function (c) { return (Array.isArray(c.packageItems) && c.packageItems.length) || /^packages?$/i.test(String(c.category || '')); };
    inst.areaSets = names.map(function (a) {
      return { kind: 'area', key: 'area:' + a, name: a, match: a === inst.placeArea, items: byArea[a].map(function (sv) { return { sku: String(sv.sku), level: 'Level 1' }; }) };
    });
    var cards = inst.areaSets.map(function (u) { return setCardHtml(inst, u, bySku, isPkg); }).join('');
    var others = list.filter(function (s) { var c = s.category || ''; return c !== 'Common Areas' && c !== 'Package' && c !== 'Packages'; });
    grid.className = '';
    grid.innerHTML = splitCardsHtml(cards, 'gs-sp-areas-' + pickerId) +
      (others.length ? '<span class="gs-sp-others" data-others="1">' + (inst.showOthers ? '\u2212 Hide other services' : '+ Other services (floors, kitchen & bathrooms, windows\u2026)') + '</span>' +
        '<div class="gs-sp-others-box" id="gs-sp-others-' + pickerId + '"></div>' : '');
    Array.prototype.forEach.call(grid.querySelectorAll('.gs-sp-area-head[data-usual]'), function (h) {
      h.addEventListener('click', function () { inst.areasTouched = true; }, true);
    });
    bindSetCards(pickerId, inst, grid);
    var oth = grid.querySelector('.gs-sp-others');
    if (oth) oth.addEventListener('click', function () { inst.showOthers = !inst.showOthers; renderGrid(pickerId); });
    bindItemEvents(inst, pickerId, document.getElementById('gs-sp-areas-' + pickerId));
    if (inst.showOthers && others.length) renderGroupedGrid(pickerId, inst, others, document.getElementById('gs-sp-others-' + pickerId));
  }

  /* v1.52.0 -- Units: los paquetes (servicios con s.packageItems) salen
     arriba como PLANTILLA: tarjeta con lo que incluye; elegir el nivel
     del paquete = usarlo. La orden guarda solo la linea del paquete (lo
     que se factura); el checklist se arma al mostrarlo. Los servicios
     que ya vienen en un paquete en uso se marcan "In package" en las
     categorias de abajo. Pedido y aprobado con mini por el dueño. */
  /* v1.61.0: helpers del "Usual order" (servicios sueltos). */
  function allSets(inst) {
    return (inst.savedSets || []).map(function (u) { return { kind: 'saved', key: 'saved:' + u.key, name: u.name, items: u.items || [], raw: u }; })
      .concat((inst.usualHidden ? [] : (inst.usualSets || [])).map(function (u) { return { kind: 'usual', key: 'usual:' + u.key, name: u.name, items: u.items || [], raw: u }; }))
      .concat(inst.areaSets || []);
  }
  function usualItems(inst, key) {
    var u = allSets(inst).find(function (x) { return String(x.key) === String(key); });
    if (!u) return [];
    return (u.items || []).map(function (x) { var s = inst.catalog.find(function (c) { return String(c.sku) === String(x.sku); }); return s ? { s: s, level: x.level || 'Level 1', qty: x.qty } : null; })
      .filter(function (x) { return x && x.s.propertyType === inst.propertyType && !(Array.isArray(x.s.packageItems) && x.s.packageItems.length) &&
        (inst.crossDivision || !inst.division || String(x.s.division || '').toLowerCase() === String(inst.division).toLowerCase()); });
  }
  /* level: null = cada uno en su nivel del set; 'Level N' = todos a ese;
     false = quitarlos todos. */
  function setUsual(inst, its, level) {
    if (!inst.selected[inst.propertyType]) inst.selected[inst.propertyType] = {};
    its.forEach(function (x) {
      var k = svcKey(inst.propertyType, x.s.serviceName);
      if (level === false) { delete inst.selected[inst.propertyType][x.s.serviceName]; delete inst.svcLevel[k]; return; }
      inst.selected[inst.propertyType][x.s.serviceName] = x.s.sku;
      if (isLeveledItem(x.s)) inst.svcLevel[k] = level || x.level;
      if (isQuantityItem(x.s)) inst.svcQty[k] = inst.svcQty[k] || parseInt(x.qty, 10) || 1;
    });
    if (!Object.keys(inst.selected[inst.propertyType]).length) delete inst.selected[inst.propertyType];
  }
  function packagesInUse(inst) {
    return inst.catalog.filter(function (s) { return ((Array.isArray(s.packageItems) && s.packageItems.length) || /^packages?$/i.test(String(s.category || ''))) && isSelected(inst, s); });
  }
  function renderUnits(pickerId, inst, list) {
    var grid = inst.gridEl;
    var bySku = {};
    inst.catalog.forEach(function (s) { bySku[String(s.sku)] = s; });
    /* v1.56.0: TODO paquete sale como tarjeta (categoria Package o con
       contenido), aunque todavia no tenga definido que incluye. */
    var isPkg = function (s) { return (Array.isArray(s.packageItems) && s.packageItems.length) || /^packages?$/i.test(String(s.category || '')); };
    var pkgs = list.filter(isPkg);
    var pkgSkus = {};
    pkgs.forEach(function (p) { pkgSkus[String(p.sku)] = true; });
    var included = {};
    packagesInUse(inst).forEach(function (p) { (p.packageItems || []).forEach(function (x) { included[String(x.sku)] = true; }); });
    /* v1.57.0 -- Edit por cliente (solo Admin pasa packageEdit). El
       paquete abierto trae "Edit": agregar/quitar servicios y cambiarles
       el nivel. Al guardar (Save for <cliente>) quien monta el picker lo
       guarda en ClientPackages y regresa el catalogo con los
       packageItems de ESE cliente (setCatalog). La etiqueta Custom sale
       solo cuando ya se guardo (packageEdit.customSkus), nunca mientras
       se edita. Cancel tira el borrador. */
    var pe = inst.packageEdit;
    var LEVELS = ['Level 1', 'Level 2', 'Level 3'];
    var cards = pkgs.map(function (p) {
      var open = !!inst.openPkgs[p.sku], used = isSelected(inst, p);
      var editing = !!(pe && open && inst.pkgDraft && inst.pkgDraft.sku === String(p.sku));
      /* v1.62.0 (24/09/2026, el dueño: "falto el boton de Edit en los
         packages, deben funcionar mas o menos igual"): en el portal (hay
         usualEdit y NO packageEdit de Admin) cualquier paquete trae Edit:
         el cliente lo ajusta y lo guarda con nombre como "My package". El
         paquete original no cambia. */
      var cEdit = !pe && inst.usualEdit;
      var cEditing = !!(cEdit && open && inst.usualDraft && inst.usualDraft.key === 'pkg:' + p.sku);
      var isCustom = !!(pe && pe.customSkus && pe.customSkus[String(p.sku)]);
      var items = editing ? inst.pkgDraft.items : (Array.isArray(p.packageItems) ? p.packageItems : []);
      var names = items.map(function (x) { var s = bySku[String(x.sku)]; return s ? s.serviceName : ''; }).filter(Boolean);
      var body = '';
      if (cEditing) {
        body = setEditBodyHtml(inst, bySku, isPkg);
      } else if (open && editing) {
        var inPkg = {}; items.forEach(function (x) { inPkg[String(x.sku)] = true; });
        /* v1.63.0: la busqueda del Edit de Admin tambien trae todas las
           divisiones (el dueño: "tanto en el portal como en Admin"). */
        var pool = inst.catalog.filter(function (s) {
          return !isPkg(s) && !inPkg[String(s.sku)] && s.propertyType === inst.propertyType;
        }).sort(function (a, b) { return String(a.serviceName).localeCompare(String(b.serviceName)); });
        inst.pkgPool = pool;
        body = '<div class="gs-sp-area-body"><div class="gs-sp-pkg-lines">' + items.map(function (x, i) {
            var s = bySku[String(x.sku)]; if (!s) return '';
            var odA = inst.pkgDivision && String(s.division || '').toLowerCase() !== String(inst.pkgDivision).toLowerCase();
            return '<div class="gs-sp-pkg-eline"><span>' + nameWithTip(s) + (odA ? ' <span class="gs-sp-otherdiv">' + escapeHtml(s.division || '') + '</span>' : '') + '</span><span class="gs-sp-pkg-eright">' +
              (isLeveledItem(s) ? '<span class="gs-sp-lvl-group">' + LEVELS.map(function (l, k) { return '<div class="gs-sp-lvl-btn' + (x.level === l ? ' active' : '') + '" data-pedit-i="' + i + '" data-pedit-lv="' + l + '">L' + (k + 1) + '</div>'; }).join('') + '</span>' : '') +
              '<button type="button" class="gs-sp-pkg-rm" data-pedit-rm="' + i + '" title="Remove">\u2715</button></span></div>';
          }).join('') + (items.length ? '' : '<p class="gs-sp-pkg-note">No services in this package yet.</p>') + '</div>' +
          /* v1.60.0 (24/09/2026, pedido del dueño): en vez del <select>,
             una barra de busqueda con contorno dorado suave; escribir
             muestra los servicios que se pueden agregar y un clic lo mete
             al paquete (en L1). */
          '<div class="gs-sp-pkg-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
          '<input type="text" data-pedit-q placeholder="Start your search here\u2026" autocomplete="off"></div>' +
          '<div class="gs-sp-pkg-results" data-pedit-results></div>' +
          '<div class="gs-sp-pkg-foot"><button type="button" class="gs-sp-pkg-cancel" data-pedit-cancel>Cancel</button>' +
          '<button type="button" class="gs-sp-pkg-save" data-pedit-save' + (inst.pkgSaving ? ' disabled' : '') + '>' + (inst.pkgSaving ? 'Saving\u2026' : 'Save for ' + escapeHtml(pe.clientId)) + '</button></div>' +
          '<p class="gs-sp-pkg-note">Only ' + escapeHtml(pe.clientId) + ' gets this version. Orders already created keep what they had.</p></div>';
      } else if (open) {
        /* v1.59.0 (24/09/2026, pedido del dueño): lo que incluye el
           paquete en 2 columnas (3 si son muchos), y cada servicio con su
           propio L1/L2/L3. El nivel de "Use this package" pone TODOS en
           ese nivel; despues se puede cambiar uno por uno (mix & match).
           Antes de escoger el nivel del paquete los de adentro se ven
           apagados. getPackageLevels() regresa lo escogido. */
        var real = items.filter(function (x) { return bySku[String(x.sku)]; });
        var cols = real.length > 8 ? 3 : 2;
        var ov = inst.pkgItemLevels[String(p.sku)] || {};
        var perItem = inst.packageItemLevels !== false;
        body = '<div class="gs-sp-area-body"><p class="gs-sp-pkg-use">Use this package</p><div class="' + (inst.mode === 'levels' ? 'gs-sp-row-grid' : 'gs-sp-chip-grid') + '">' + itemHtml(inst, p) + '</div>' +
          '<div class="gs-sp-pkg-lines gs-sp-pkg-cols' + cols + (used ? '' : ' off') + '">' + real.map(function (x) {
            var s = bySku[String(x.sku)];
            var lv = ov[String(x.sku)] || x.level || '';
            return '<div class="gs-sp-pkg-line"><span class="gs-sp-pkg-lname">' + nameWithTip(s) + (inst.showPrices ? '<span class="gs-sp-price inc">Included</span>' : '') + '</span>' +
              (perItem ? '<span class="gs-sp-lvl-group gs-sp-pkg-ilv">' + LEVELS.map(function (l, k) {
                return '<div class="gs-sp-lvl-btn' + (used && lv === l ? ' active' : '') + '" data-pkgitem="' + escapeAttr(p.sku) + '" data-isku="' + escapeAttr(x.sku) + '" data-ilevel="' + l + '">L' + (k + 1) + '</div>';
              }).join('') + '</span>' : '<span class="lv">' + escapeHtml(String(lv).replace('Level ', 'L')) + '</span>') + '</div>';
          }).join('') + '</div>' +
          (used || !perItem ? '' : '<p class="gs-sp-pkg-note">Pick the package level first; then you can change any service.</p>') + '</div>';
      }
      return '<div class="gs-sp-area-card' + (open ? ' open' : '') + (used && !cEditing ? ' used' : '') + (isCustom ? ' custom' : '') + '">' +
        '<div class="gs-sp-area-head" data-pkg="' + escapeAttr(p.sku) + '"><div><div class="gs-sp-area-name">' + nameWithTip(p) + priceHtml(inst, p) +
        (used ? '<span class="gs-sp-area-sel">In use</span>' : '') +
        (isCustom ? '<span class="gs-sp-pkg-cust">Custom for ' + escapeHtml(pe.clientId) + '</span>' : '') + '</div>' +
        '<div class="gs-sp-area-prev">' + (names.length ? 'Includes ' + names.length + (names.length === 1 ? ' service' : ' services') +
        (open ? '' : ': ' + escapeHtml(names.slice(0, 3).join(', ')) + (names.length > 3 ? '\u2026' : '')) : 'Contents not set yet') +
        (isCustom && open && !editing ? '<span class="gs-sp-pkg-reset" data-pedit-reset="' + escapeAttr(p.sku) + '">Reset to standard</span>' : '') + '</div></div>' +
        (pe && open && !editing ? '<button type="button" class="gs-sp-pkg-edit" data-pedit-open="' + escapeAttr(p.sku) + '">Edit</button>' : '') +
        (cEdit && open && !cEditing ? '<button type="button" class="gs-sp-pkg-edit" data-pkg-cedit="' + escapeAttr(p.sku) + '">Edit</button>' : '') +
        '<span class="gs-sp-area-count">Package</span></div>' +
        body + '</div>';
    }).join('');
    /* v1.61.0 (24/09/2026, pedido del dueño): "Usual order" -- el set de
       servicios que ESTE cliente ha pedido 10 veces seguidas. Se ve como
       un paquete normal pero con su burbuja "Most used"; NO es un
       paquete de verdad: usarlo selecciona esos servicios SUELTOS con su
       nivel (se cobran servicio por servicio como siempre). Abrirlo lo
       selecciona; el selector de arriba pone todos en un nivel y picar el
       nivel activo los quita; cada servicio se cambia solo. Viene de quien
       monta el picker: usualSets [{key, name, division, items:[{sku, level}]}]. */
    var usualCards = allSets(inst).filter(function (u) { return u.kind !== 'area'; }).map(function (u) { return setCardHtml(inst, u, bySku, isPkg); }).join('');
    var rest = list.filter(function (s) { return !pkgSkus[String(s.sku)]; });
    grid.className = '';
    var hasTop = pkgs.length || usualCards;
    /* v1.64.0 (24/09/2026, el dueño: "que siempre nomas haya uno abierto y
       los otros se cierren, y el abierto siempre a la izquierda y los otros
       a la derecha"): con una tarjeta abierta (paquete, usual o My
       package) se parte en dos -- la abierta a la izquierda (2/3) y las
       demas cerradas en una columna a la derecha (1/3), en su mismo
       orden. En celular la abierta arriba y las demas abajo. */
    var pkgsInner = splitCardsHtml(usualCards + cards, 'gs-sp-pkgs-' + pickerId);
    grid.innerHTML = (hasTop ? '<p class="gs-sp-sec-title">Packages</p>' + pkgsInner +
      '<p class="gs-sp-sec-title">Or pick services by room</p>' : '') + '<div id="gs-sp-rooms-' + pickerId + '"></div>';
    Array.prototype.forEach.call(grid.querySelectorAll('.gs-sp-area-head[data-pkg]'), function (h) {
      h.addEventListener('click', function (e) {
        if (e.target.closest('[data-pedit-open],[data-pedit-reset],[data-pkg-cedit],[data-uedit-name],[data-uedit-q]')) return;
        var k = h.dataset.pkg; var willOpen = !inst.openPkgs[k];
        /* v1.64.0: solo UNA abierta -- abrir esta cierra todas las demas
           (paquetes, usual y My package) y tira sus borradores de Edit. */
        if (willOpen) {
          inst.openPkgs = {}; inst.openUsual = {};
          if (inst.pkgDraft && inst.pkgDraft.sku !== String(k)) inst.pkgDraft = null;
          if (inst.usualDraft && inst.usualDraft.key !== 'pkg:' + k) inst.usualDraft = null;
        }
        inst.openPkgs[k] = willOpen;
        if (!inst.openPkgs[k] && inst.usualDraft && inst.usualDraft.key === 'pkg:' + k) inst.usualDraft = null;
        if (!inst.openPkgs[k] && inst.pkgDraft && inst.pkgDraft.sku === String(k)) inst.pkgDraft = null;
        /* v1.60.0 (24/09/2026, el dueño: "el paquete se debe seleccionar
           automatico cuando se abre, algo asi como los servicios
           sueltos"): abrir un paquete que no esta en uso lo SELECCIONA,
           con cada servicio en su nivel estandar (el que trae el
           paquete) y el paquete en el nivel que mas se repite adentro.
           Cerrar la tarjeta no lo quita (igual que un servicio suelto);
           se quita picando otra vez su nivel en "Use this package". Solo
           donde se guarda el nivel por servicio (packageItemLevels). */
        var pkgSvc = inst.catalog.find(function (s) { return String(s.sku) === String(k); });
        if (inst.openPkgs[k] && pkgSvc && inst.packageItemLevels !== false && !isSelected(inst, pkgSvc)) {
          var its = Array.isArray(pkgSvc.packageItems) ? pkgSvc.packageItems : [];
          var cnt = {}, best = 'Level 1', bestN = 0;
          its.forEach(function (x) { if (/^Level [123]$/.test(x.level || '')) { cnt[x.level] = (cnt[x.level] || 0) + 1; if (cnt[x.level] > bestN) { bestN = cnt[x.level]; best = x.level; } } });
          if (!inst.selected[inst.propertyType]) inst.selected[inst.propertyType] = {};
          inst.selected[inst.propertyType][pkgSvc.serviceName] = pkgSvc.sku;
          inst.svcLevel[svcKey(inst.propertyType, pkgSvc.serviceName)] = best;
          var m = {}; its.forEach(function (x) { m[String(x.sku)] = /^Level [123]$/.test(x.level || '') ? x.level : best; });
          inst.pkgItemLevels[String(k)] = m;
          renderGrid(pickerId);
          fireChange(pickerId);
          return;
        }
        renderGrid(pickerId);
      });
    });
    bindSetCards(pickerId, inst, grid);
    Array.prototype.forEach.call(grid.querySelectorAll('[data-pkg-cedit]'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var sku = String(b.dataset.pkgCedit);
        var p = inst.catalog.find(function (c) { return String(c.sku) === sku; });
        var ov = inst.pkgItemLevels[sku] || {};
        inst.usualDraft = { key: 'pkg:' + sku, source: 'package', name: '', items: ((p && p.packageItems) || []).map(function (x) {
          var s2 = inst.catalog.find(function (c) { return String(c.sku) === String(x.sku); });
          return { sku: String(x.sku), level: s2 && isLeveledItem(s2) ? (ov[String(x.sku)] || x.level || 'Level 1') : '' }; }) };
        renderGrid(pickerId);
      });
    });
    bindUsualEdit(pickerId, inst, grid);
    var pk = document.getElementById('gs-sp-pkgs-' + pickerId);
    if (pk) bindItemEvents(inst, pickerId, pk);
    if (pk) Array.prototype.forEach.call(pk.querySelectorAll('[data-pkgitem]'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var pkgSku = String(b.dataset.pkgitem);
        var p = inst.catalog.find(function (s) { return String(s.sku) === pkgSku; });
        if (!p || !isSelected(inst, p) || inst.packageItemLevels === false) return;
        (inst.pkgItemLevels[pkgSku] = inst.pkgItemLevels[pkgSku] || {})[String(b.dataset.isku)] = b.dataset.ilevel;
        renderGrid(pickerId);
        fireChange(pickerId);
      });
    });
    if (pk && pe) bindPkgEdit(pickerId, inst, pk);
    var rooms = document.getElementById('gs-sp-rooms-' + pickerId);
    if (rest.length) renderGroupedGrid(pickerId, inst, rest, rooms);
    Array.prototype.forEach.call(rooms.querySelectorAll('[data-sku]'), function (b) {
      if (!included[String(b.dataset.sku)]) return;
      var row = b.closest('.gs-sp-row') || b;
      var name = row.querySelector('.gs-sp-row-name') || row;
      if (!name.querySelector('.gs-sp-inpkg')) name.insertAdjacentHTML('beforeend', '<span class="gs-sp-inpkg">In package</span>');
    });
  }

  /* v1.63.0 (24/09/2026, el dueño: "si el usuario selecciona un mix se va
     a Mixed inmediatamente"): al agregar en un Edit un servicio de OTRA
     division, el picker pasa en ese momento a Mixed (division 'Mixed',
     cruza divisiones, modo con niveles) SIN perder lo escogido ni el
     borrador, y avisa a quien lo monta (onGoMixed) para que cambie su
     pestaña de division y su estado a Mixed. */
  function goMixedIfNeeded(pickerId, inst, svc) {
    if (!svc || !inst.division || String(inst.division) === 'Mixed') return;
    if (String(svc.division || '').toLowerCase() === String(inst.division).toLowerCase()) return;
    if (!inst.pkgDivision) inst.pkgDivision = inst.division;
    inst.division = 'Mixed';
    inst.crossDivision = true;
    inst.mode = 'levels';
    if (inst.onGoMixed) { try { inst.onGoMixed(); } catch (e) { /* nada */ } }
  }

  /* v1.67.0: tarjeta de un SET de servicios sueltos -- usual ("Most used"),
     My package y, desde v1.67.0, las AREAS de Recurring. Mismo
     comportamiento: abrirla selecciona todo, "Use these services" pone un
     nivel a todos (picar el marcado quita todo) y cada servicio se cambia
     solo. */
  function setCardHtml(inst, u, bySku, isPkg) {
      var its = (u.items || []).map(function (x) { var s = bySku[String(x.sku)]; return s ? { s: s, level: x.level || 'Level 1', qty: x.qty } : null; })
        .filter(function (x) { return x && x.s.propertyType === inst.propertyType && !isPkg(x.s) &&
          (inst.crossDivision || !inst.division || String(x.s.division || '').toLowerCase() === String(inst.division).toLowerCase()); });
      if (!its.length) return '';
      var LEVELS = ['Level 1', 'Level 2', 'Level 3'];
      var key = String(u.key);
      var open = !!inst.openUsual[key];
      var sel = its.filter(function (x) { return isSelected(inst, x.s); });
      var used = sel.length === its.length;
      var lvOf = function (x) { return isSelected(inst, x.s) ? inst.svcLevel[svcKey(inst.propertyType, x.s.serviceName)] : null; };
      /* Arriba se marca el nivel que mas se repite (como el nivel de un
         paquete): picarlo quita todo, igual que en los paquetes. */
      var allLv = null;
      if (used) { var cnt = {}, bn = 0; its.forEach(function (x) { var l = isLeveledItem(x.s) ? lvOf(x) : null; if (l) { cnt[l] = (cnt[l] || 0) + 1; if (cnt[l] > bn) { bn = cnt[l]; allLv = l; } } }); }
      var anyLv = its.some(function (x) { return isLeveledItem(x.s); });
      var body = '';
      var ue = inst.usualEdit, uEditing = !!(ue && open && inst.usualDraft && inst.usualDraft.key === key);
      if (uEditing) {
        body = setEditBodyHtml(inst, bySku, isPkg);
      } else if (open) {
        var cols = its.length > 8 ? 3 : 2;
        body = '<div class="gs-sp-area-body"><p class="gs-sp-pkg-use">Use these services</p>' +
          /* v1.62.0: sin servicios con nivel (Renovations, Exteriors) el
             selector de arriba es un solo boton "Use" que se prende/apaga. */
          '<div class="gs-sp-row-grid"><div class="gs-sp-row' + (used ? ' selected' : '') + '"><span class="gs-sp-row-name">' + escapeHtml(u.name || 'Usual order') + '</span><div class="gs-sp-lvl-group">' +
          (anyLv ? LEVELS.map(function (l, k) { return '<div class="gs-sp-lvl-btn' + (allLv === l ? ' active' : '') + '" data-usual-all="' + escapeAttr(key) + '" data-level="' + l + '">L' + (k + 1) + '</div>'; }).join('')
            : '<div class="gs-sp-lvl-btn gs-sp-usebtn' + (used ? ' active' : '') + '" data-usual-all="' + escapeAttr(key) + '" data-level="">' + (used ? '\u2713 In use' : 'Use') + '</div>') +
          '</div></div></div>' +
          '<div class="gs-sp-pkg-lines gs-sp-pkg-cols' + cols + '">' + its.map(function (x) {
            var lv = lvOf(x);
            var ctl;
            if (isQuantityItem(x.s)) {
              var qv = isSelected(inst, x.s) ? (inst.svcQty[svcKey(inst.propertyType, x.s.serviceName)] || '') : '';
              ctl = '<span><span class="gs-sp-qty-label">Qty</span><input type="number" class="gs-sp-qty-input" min="1" step="1" inputmode="numeric" data-sku="' + escapeAttr(x.s.sku) + '" value="' + escapeAttr(qv) + '"></span>';
            } else if (isLeveledItem(x.s)) {
              ctl = '<span class="gs-sp-lvl-group gs-sp-pkg-ilv">' + LEVELS.map(function (l, k) { return '<div class="gs-sp-lvl-btn' + (lv === l ? ' active' : '') + '" data-sku="' + escapeAttr(x.s.sku) + '" data-level="' + l + '">L' + (k + 1) + '</div>'; }).join('') + '</span>';
            } else {
              var on = isSelected(inst, x.s);
              ctl = '<button type="button" class="gs-sp-chip-btn gs-sp-inchip' + (on ? ' active' : '') + '" data-sku="' + escapeAttr(x.s.sku) + '">' + (on ? '\u2713 In order' : 'Add') + '</button>';
            }
            return '<div class="gs-sp-pkg-line"><span class="gs-sp-pkg-lname">' + nameWithTip(x.s) + priceHtml(inst, x.s) + '</span>' + ctl + '</div>';
          }).join('') + '</div>' +
          (sel.length && !used ? '<p class="gs-sp-pkg-note">' + sel.length + ' of ' + its.length + ' in your order.</p>' : '') + '</div>';
      }
      return '<div class="gs-sp-area-card gs-sp-usual' + (open ? ' open' : '') + (used && !uEditing ? ' used' : '') + (u.match ? ' match' : '') + '">' +
        '<div class="gs-sp-area-head" data-usual="' + escapeAttr(key) + '"><div><div class="gs-sp-area-name">' + escapeHtml(u.name || 'Usual order') +
        (u.match ? '<span class="gs-sp-area-tag">This place</span>' : '') +
        (used ? '<span class="gs-sp-area-sel">In use</span>' : (sel.length ? '<span class="gs-sp-area-sel">' + sel.length + ' picked</span>' : '')) + '</div>' +
        '<div class="gs-sp-area-prev">' + its.length + (its.length === 1 ? ' service' : ' services') + (open ? '' : ': ' + escapeHtml(its.slice(0, 3).map(function (x) { return x.s.serviceName; }).join(', ')) + (its.length > 3 ? '\u2026' : '')) + '</div></div>' +
        (ue && u.kind === 'usual' && open && !uEditing ? '<button type="button" class="gs-sp-pkg-edit" data-uedit-open="' + escapeAttr(key) + '">Edit</button>' : '') +
        (u.kind === 'saved' ? '<span class="gs-sp-usual-tag saved">My package</span>' : u.kind === 'area' ? '<span class="gs-sp-area-count">' + its.length + '</span>' : '<span class="gs-sp-usual-tag">Most used</span>') + '</div>' + body + '</div>';
  }

  /* v1.64.0: con una tarjeta abierta se parte en dos -- la abierta a la
     izquierda (2/3) y las demas cerradas a la derecha (1/3). v1.67.0: helper
     para paquetes y para las areas de Recurring. */
  function splitCardsHtml(html, id) {
    var tmpBox = document.createElement('div'); tmpBox.innerHTML = html;
    var openCard = Array.prototype.find.call(tmpBox.children, function (c) { return c.classList.contains('open'); });
    if (!openCard) return '<div class="gs-sp-area-grid" id="' + id + '">' + html + '</div>';
    var others = Array.prototype.filter.call(tmpBox.children, function (c) { return c !== openCard; }).map(function (c) { return c.outerHTML; }).join('');
    return '<div class="gs-sp-pkgs-split" id="' + id + '"><div class="gs-sp-pkgs-main">' + openCard.outerHTML + '</div>' +
      (others ? '<div class="gs-sp-pkgs-side">' + others + '</div>' : '') + '</div>';
  }
  /* Eventos de las tarjetas de set (usual / My package / areas). */
  function bindSetCards(pickerId, inst, grid) {
    Array.prototype.forEach.call(grid.querySelectorAll('.gs-sp-area-head[data-usual]'), function (h) {
      h.addEventListener('click', function (e) {
        if (e.target.closest('[data-uedit-open]')) return;
        var k = String(h.dataset.usual); var willOpenU = !inst.openUsual[k];
        if (willOpenU) {
          inst.openPkgs = {}; inst.openUsual = {}; inst.pkgDraft = null;
          if (inst.usualDraft && inst.usualDraft.key !== k) inst.usualDraft = null;
        }
        inst.openUsual[k] = willOpenU;
        if (!inst.openUsual[k] && inst.usualDraft && inst.usualDraft.key === k) inst.usualDraft = null;
        if (inst.openUsual[k]) {
          var its = usualItems(inst, k);
          if (its.length && !its.every(function (x) { return isSelected(inst, x.s); })) { setUsual(inst, its, null); renderGrid(pickerId); fireChange(pickerId); return; }
        }
        renderGrid(pickerId);
      });
    });
    Array.prototype.forEach.call(grid.querySelectorAll('[data-usual-all]'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var its = usualItems(inst, String(b.dataset.usualAll));
        if (b.classList.contains('active')) setUsual(inst, its, false);
        else setUsual(inst, its, b.dataset.level || null);
        renderGrid(pickerId); fireChange(pickerId);
      });
    });
  }

  /* v1.62.0: cuerpo del Edit (del usual y, en el portal, de cualquier
     paquete): quitar, nivel (solo servicios con nivel), agregar con la
     barra de busqueda, nombre y "Save my package". */
  function setEditBodyHtml(inst, bySku, isPkg) {
    var dItems = inst.usualDraft.items;
    var inDraft = {}; dItems.forEach(function (x) { inDraft[String(x.sku)] = true; });
    /* v1.63.0 (24/09/2026, el dueño: "si estoy en Janitorial y a mi
       recurrente le quiero meter un servicio de otra division... si, eso
       quiero"): en el Edit del CLIENTE la busqueda trae servicios de
       TODAS las divisiones; los de otra division salen con su division.
       Quien monta el picker decide en onSave si el paquete queda Mixed. */
    inst.pkgPool = inst.catalog.filter(function (s) {
      return !isPkg(s) && !inDraft[String(s.sku)] && s.propertyType === inst.propertyType;
    }).sort(function (a, b) { return String(a.serviceName).localeCompare(String(b.serviceName)); });
    var LV = ['Level 1', 'Level 2', 'Level 3'];
    return '<div class="gs-sp-area-body"><div class="gs-sp-pkg-lines">' + dItems.map(function (x, i) {
        var s2 = bySku[String(x.sku)]; if (!s2) return '';
        var baseDiv = inst.pkgDivision || inst.division;
        var od = baseDiv && baseDiv !== 'Mixed' && String(s2.division || '').toLowerCase() !== String(baseDiv).toLowerCase();
        return '<div class="gs-sp-pkg-eline"><span>' + nameWithTip(s2) + (od ? ' <span class="gs-sp-otherdiv">' + escapeHtml(s2.division || '') + '</span>' : '') + '</span><span class="gs-sp-pkg-eright">' +
          (isLeveledItem(s2) ? '<span class="gs-sp-lvl-group">' + LV.map(function (l, k) { return '<div class="gs-sp-lvl-btn' + (x.level === l ? ' active' : '') + '" data-uedit-i="' + i + '" data-uedit-lv="' + l + '">L' + (k + 1) + '</div>'; }).join('') + '</span>' : '') +
          '<button type="button" class="gs-sp-pkg-rm" data-uedit-rm="' + i + '" title="Remove">\u2715</button></span></div>';
      }).join('') + (dItems.length ? '' : '<p class="gs-sp-pkg-note">No services yet.</p>') + '</div>' +
      '<div class="gs-sp-pkg-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input type="text" data-uedit-q placeholder="Start your search here\u2026" autocomplete="off"></div>' +
      '<div class="gs-sp-pkg-results" data-uedit-results></div>' +
      /* v1.68.0: en un template (place 'template') no se pide nombre -- los
         cambios se aplican a ESE template; en los demas lugares se guarda
         con nombre como "My package". Lo decide la pieza compartida. */
      (inst.usualEdit && inst.usualEdit.applyHere
        ? '<p class="gs-sp-pkg-note">The package becomes separate services in this template, with your changes.</p>'
        : '<div class="gs-sp-usual-name"><label>Name your package</label><input type="text" data-uedit-name maxlength="60" placeholder="e.g. Weekly unit turnover" value="' + escapeAttr(inst.usualDraft.name || '') + '"></div>') +
      '<div class="gs-sp-pkg-foot"><button type="button" class="gs-sp-pkg-cancel" data-uedit-cancel>Cancel</button>' +
      '<button type="button" class="gs-sp-pkg-save" data-uedit-save' + (inst.usualSaving ? ' disabled' : '') + '>' + (inst.usualSaving ? 'Saving\u2026' : (inst.usualEdit && inst.usualEdit.applyHere ? 'Apply to this template' : 'Save my package')) + '</button></div>' +
      '<p class="gs-sp-pkg-note" data-uedit-err></p></div>';
  }

  /* v1.61.0 -- eventos del Edit del "Usual order". Borrador en
     inst.usualDraft; nada se guarda hasta "Save my package", que llama a
     usualEdit.onSave(name, items) (quien monta el picker lo guarda y
     regresa los sets nuevos con setSavedSets / setUsualSets). */
  function bindUsualEdit(pickerId, inst, scope) {
    var ue = inst.usualEdit; if (!ue) return;
    function q(sel) { return scope.querySelectorAll(sel); }
    Array.prototype.forEach.call(q('[data-uedit-open]'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var k = String(b.dataset.ueditOpen);
        var its = usualItems(inst, k);
        inst.usualDraft = { key: k, source: 'usual', name: '', items: its.map(function (x) {
          var cur = isSelected(inst, x.s) ? inst.svcLevel[svcKey(inst.propertyType, x.s.serviceName)] : null;
          return { sku: String(x.s.sku), level: isLeveledItem(x.s) ? (cur || x.level || 'Level 1') : '' }; }) };
        renderGrid(pickerId);
      });
    });
    Array.prototype.forEach.call(q('[data-uedit-lv]'), function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); inst.usualDraft.items[+b.dataset.ueditI].level = b.dataset.ueditLv; keepName(); renderGrid(pickerId); });
    });
    Array.prototype.forEach.call(q('[data-uedit-rm]'), function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); inst.usualDraft.items.splice(+b.dataset.ueditRm, 1); keepName(); renderGrid(pickerId); });
    });
    function keepName() { var n = scope.querySelector('[data-uedit-name]'); if (n && inst.usualDraft) inst.usualDraft.name = n.value; }
    Array.prototype.forEach.call(q('[data-uedit-name]'), function (n) { n.addEventListener('input', function () { if (inst.usualDraft) inst.usualDraft.name = n.value; }); n.addEventListener('click', function (e) { e.stopPropagation(); }); });
    Array.prototype.forEach.call(q('[data-uedit-q]'), function (input) {
      var box = scope.querySelector('[data-uedit-results]');
      input.addEventListener('click', function (e) { e.stopPropagation(); });
      function show() {
        var t = input.value.trim().toLowerCase();
        if (!t) { box.innerHTML = ''; box.style.display = 'none'; return; }
        var hits = (inst.pkgPool || []).filter(function (s) { return String(s.serviceName).toLowerCase().indexOf(t) > -1 || String(s.category || '').toLowerCase().indexOf(t) > -1; }).slice(0, 8);
        box.style.display = 'block';
        box.innerHTML = hits.length ? hits.map(function (s) {
          var other = inst.division && String(s.division || '').toLowerCase() !== String(inst.division).toLowerCase();
          return '<div class="gs-sp-pkg-hit" data-uedit-hit="' + escapeAttr(s.sku) + '"><span>' + escapeHtml(s.serviceName) + '</span>' + (s.category ? '<span class="cat">' + escapeHtml(s.category) + '</span>' : '') +
            (other ? '<span class="gs-sp-otherdiv">' + escapeHtml(s.division || '') + '</span>' : '') + '<span class="add">+ Add</span></div>';
        }).join('') : '<div class="gs-sp-pkg-nohit">No services match \u201c' + escapeHtml(input.value.trim()) + '\u201d.</div>';
      }
      input.addEventListener('input', show);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { var first = box.querySelector('[data-uedit-hit]'); if (first) { e.preventDefault(); first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } }
        if (e.key === 'Escape') { input.value = ''; show(); }
      });
      box.addEventListener('mousedown', function (e) {
        var h = e.target.closest('[data-uedit-hit]'); if (!h) return;
        e.preventDefault(); e.stopPropagation();
        keepName();
        var hs = inst.catalog.find(function (c) { return String(c.sku) === String(h.dataset.ueditHit); });
        inst.usualDraft.items.push({ sku: String(h.dataset.ueditHit), level: hs && isLeveledItem(hs) ? 'Level 1' : '' });
        goMixedIfNeeded(pickerId, inst, hs);
        renderGrid(pickerId);
        var again = document.querySelector('#gs-sp-pkgs-' + pickerId + ' [data-uedit-q]'); if (again) again.focus();
      });
    });
    Array.prototype.forEach.call(q('[data-uedit-cancel]'), function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); inst.usualDraft = null; renderGrid(pickerId); });
    });
    Array.prototype.forEach.call(q('[data-uedit-save]'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        keepName();
        var d = inst.usualDraft, err = scope.querySelector('[data-uedit-err]');
        if (ue.applyHere) {
          /* v1.68.0 -- template: el paquete se cambia por SUS servicios
             (con lo editado) como servicios sueltos del template. Nada va
             al servidor aqui; se guarda con el "Save Template" de siempre. */
          if (!d.items.length) { if (err) err.textContent = 'Add at least one service.'; return; }
          var pt = inst.propertyType;
          if (!inst.selected[pt]) inst.selected[pt] = {};
          if (d.source === 'package') {
            var pkSku = String(d.key).replace(/^pkg:/, '');
            var pk = inst.catalog.find(function (c) { return String(c.sku) === pkSku; });
            if (pk) { delete inst.selected[pt][pk.serviceName]; delete inst.svcLevel[svcKey(pt, pk.serviceName)]; }
            delete inst.pkgItemLevels[pkSku];
            inst.openPkgs = {};
          }
          d.items.forEach(function (x) {
            var sv = inst.catalog.find(function (c) { return String(c.sku) === String(x.sku); });
            if (!sv) return;
            var k2 = svcKey(pt, sv.serviceName);
            inst.selected[pt][sv.serviceName] = sv.sku;
            if (isLeveledItem(sv)) inst.svcLevel[k2] = x.level || 'Level 1';
            if (isQuantityItem(sv) && !inst.svcQty[k2]) inst.svcQty[k2] = 1;
          });
          inst.usualDraft = null;
          renderGrid(pickerId);
          fireChange(pickerId);
          return;
        }
        if (!d.name || !d.name.trim()) { if (err) err.textContent = 'Give your package a name.'; var n = scope.querySelector('[data-uedit-name]'); if (n) n.focus(); return; }
        if (!d.items.length) { if (err) err.textContent = 'Add at least one service.'; return; }
        if (!ue.onSave || inst.usualSaving) return;
        inst.usualSaving = true; renderGrid(pickerId);
        Promise.resolve(ue.onSave(d.name.trim(), d.items.slice(), d.source || 'usual')).then(function () { inst.usualDraft = null; })
          .catch(function () { /* quien monta avisa el error; el borrador se queda */ })
          .then(function () { inst.usualSaving = false; renderGrid(pickerId); });
      });
    });
  }

  /* v1.57.0 -- eventos del Edit de paquete. El borrador vive en
     inst.pkgDraft (una copia): nada se guarda hasta Save. */
  function bindPkgEdit(pickerId, inst, scope) {
    var pe = inst.packageEdit;
    var bySku = {}; inst.catalog.forEach(function (s) { bySku[String(s.sku)] = s; });
    function q(sel) { return scope.querySelectorAll(sel); }
    Array.prototype.forEach.call(q('[data-pedit-open]'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var p = bySku[String(b.dataset.peditOpen)];
        inst.pkgDraft = { sku: String(b.dataset.peditOpen), items: ((p && p.packageItems) || []).map(function (x) { return { sku: String(x.sku), level: x.level || 'Level 1' }; }) };
        renderGrid(pickerId);
      });
    });
    Array.prototype.forEach.call(q('[data-pedit-lv]'), function (b) {
      b.addEventListener('click', function () { inst.pkgDraft.items[+b.dataset.peditI].level = b.dataset.peditLv; renderGrid(pickerId); });
    });
    Array.prototype.forEach.call(q('[data-pedit-rm]'), function (b) {
      b.addEventListener('click', function () { inst.pkgDraft.items.splice(+b.dataset.peditRm, 1); renderGrid(pickerId); });
    });
    Array.prototype.forEach.call(q('[data-pedit-q]'), function (input) {
      var box = scope.querySelector('[data-pedit-results]');
      function show() {
        var t = input.value.trim().toLowerCase();
        if (!t) { box.innerHTML = ''; box.style.display = 'none'; return; }
        var hits = (inst.pkgPool || []).filter(function (s) { return String(s.serviceName).toLowerCase().indexOf(t) > -1 || String(s.category || '').toLowerCase().indexOf(t) > -1 || String(s.sku).indexOf(t) > -1; }).slice(0, 8);
        box.style.display = 'block';
        box.innerHTML = hits.length ? hits.map(function (s) {
          var other = inst.division && String(s.division || '').toLowerCase() !== String(inst.division).toLowerCase();
          return '<div class="gs-sp-pkg-hit" data-pedit-hit="' + escapeAttr(s.sku) + '"><span>' + escapeHtml(s.serviceName) + '</span>' + (s.category ? '<span class="cat">' + escapeHtml(s.category) + '</span>' : '') +
            (other ? '<span class="gs-sp-otherdiv">' + escapeHtml(s.division || '') + '</span>' : '') + '<span class="add">+ Add</span></div>';
        }).join('') : '<div class="gs-sp-pkg-nohit">No services match \u201c' + escapeHtml(input.value.trim()) + '\u201d.</div>';
      }
      input.addEventListener('input', show);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { var first = box.querySelector('[data-pedit-hit]'); if (first) { e.preventDefault(); first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } }
        if (e.key === 'Escape') { input.value = ''; show(); }
      });
      box.addEventListener('mousedown', function (e) {
        var h = e.target.closest('[data-pedit-hit]'); if (!h) return;
        e.preventDefault();
        var hsA = inst.catalog.find(function (c) { return String(c.sku) === String(h.dataset.peditHit); });
        inst.pkgDraft.items.push({ sku: String(h.dataset.peditHit), level: hsA && isLeveledItem(hsA) ? 'Level 1' : '' });
        goMixedIfNeeded(pickerId, inst, hsA);
        renderGrid(pickerId);
        var again = document.querySelector('#gs-sp-pkgs-' + pickerId + ' [data-pedit-q]'); if (again) again.focus();
      });
    });
    Array.prototype.forEach.call(q('[data-pedit-cancel]'), function (b) {
      b.addEventListener('click', function () { inst.pkgDraft = null; renderGrid(pickerId); });
    });
    Array.prototype.forEach.call(q('[data-pedit-save]'), function (b) {
      b.addEventListener('click', function () {
        if (!pe.onSave || inst.pkgSaving) return;
        var d = inst.pkgDraft; inst.pkgSaving = true; renderGrid(pickerId);
        Promise.resolve(pe.onSave(d.sku, d.items.slice())).then(function () { inst.pkgDraft = null; })
          .catch(function () { /* quien monta avisa el error; el borrador se queda */ })
          .then(function () { inst.pkgSaving = false; renderGrid(pickerId); });
      });
    });
    Array.prototype.forEach.call(q('[data-pedit-reset]'), function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); if (pe.onReset) Promise.resolve(pe.onReset(String(b.dataset.peditReset))).then(function () { renderGrid(pickerId); }); });
    });
  }

  function renderGrid(pickerId) {
    var inst = instances[pickerId];
    var grid = inst.gridEl;
    var list = visibleList(inst);
    /* v1.66.0 (24/09/2026, el dueño: "los servicios de Common Areas que no se
       muestren en Unit"): en Units (donde hay switch o paquetes) no salen
       los de la categoria Common Areas -- ni en las tarjetas por cuarto ni
       al buscar. Siguen en Recurring. */
    if (inst.workMode === 'units' && (inst.workToggle || inst.showPackages)) {
      list = list.filter(function (s) { return String(s.category || '') !== 'Common Areas'; });
    }

    if (!list.length) {
      grid.className = '';
      var emptyMsg = (inst.filterMode === 'selected-plus-search' && !(inst.searchEl && inst.searchEl.value.trim()))
        ? 'Type to search services\u2026'
        : 'No services match.';
      grid.innerHTML = '<p class="gs-sp-empty">' + emptyMsg + '</p>';
      return;
    }

    var q = inst.searchEl ? (inst.searchEl.value || '').trim() : '';
    if (inst.groupByCategory && inst.workMode === 'recurring' && !q && inst.filterMode === 'all') {
      renderAreaCards(pickerId, inst, list);
      return;
    }
    if (inst.groupByCategory && (inst.workToggle || inst.showPackages) && inst.workMode === 'units' && !q && inst.filterMode === 'all') {
      renderUnits(pickerId, inst, list);
      return;
    }
    if (inst.groupByCategory) {
      renderGroupedGrid(pickerId, inst, list);
      return;
    }

    if (inst.mode === 'levels') {
      grid.className = 'gs-sp-row-grid';
      grid.innerHTML = list.map(function (s) { return itemHtml(inst, s); }).join('');
    } else {
      grid.className = 'gs-sp-chip-grid';
      grid.innerHTML = list.map(function (s) { return itemHtml(inst, s); }).join('');
    }
    bindItemEvents(inst, pickerId, grid);
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  function toggleChip(pickerId, sku) {
    var inst = instances[pickerId];
    var svc = inst.catalog.find(function (s) { return String(s.sku) === String(sku); });
    if (!svc) return;
    if (!inst.selected[inst.propertyType]) inst.selected[inst.propertyType] = {};
    if (String(inst.selected[inst.propertyType][svc.serviceName]) === String(sku)) {
      delete inst.selected[inst.propertyType][svc.serviceName];
      if (!Object.keys(inst.selected[inst.propertyType]).length) delete inst.selected[inst.propertyType];
    } else {
      inst.selected[inst.propertyType][svc.serviceName] = sku;
    }
    renderGrid(pickerId);
    fireChange(pickerId);
  }

  function pickLevel(pickerId, sku, level) {
    var inst = instances[pickerId];
    var svc = inst.catalog.find(function (s) { return String(s.sku) === String(sku); });
    if (!svc) return;
    var k = svcKey(inst.propertyType, svc.serviceName);
    if (!inst.selected[inst.propertyType]) inst.selected[inst.propertyType] = {};
    var already = String(inst.selected[inst.propertyType][svc.serviceName]) === String(sku) && inst.svcLevel[k] === level;
    if (already) {
      delete inst.selected[inst.propertyType][svc.serviceName];
      if (!Object.keys(inst.selected[inst.propertyType]).length) delete inst.selected[inst.propertyType];
      delete inst.svcLevel[k];
    } else {
      inst.selected[inst.propertyType][svc.serviceName] = sku;
      inst.svcLevel[k] = level;
    }
    /* v1.59.0: nivel de un paquete = todos sus servicios a ese nivel. */
    if (Array.isArray(svc.packageItems) && svc.packageItems.length) {
      if (already) delete inst.pkgItemLevels[String(sku)];
      else {
        var m = {}; svc.packageItems.forEach(function (x) { m[String(x.sku)] = level; });
        inst.pkgItemLevels[String(sku)] = m;
      }
    }
    renderGrid(pickerId);
    fireChange(pickerId);
  }

  /* rerender=false en cada tecla (evita perder el foco, ver
     bindItemEvents); rerender=true al salir del campo (change), para
     limpiar el valor mostrado (numeros invalidos, negativos, etc.)
     y refrescar el resaltado/contador. Cantidad vacia o menor a 1
     deselecciona el servicio, igual que des-marcar un chip. */
  function setQuantity(pickerId, sku, rawValue, rerender) {
    var inst = instances[pickerId];
    var svc = inst.catalog.find(function (s) { return String(s.sku) === String(sku); });
    if (!svc) return;
    var k = svcKey(inst.propertyType, svc.serviceName);
    if (!inst.selected[inst.propertyType]) inst.selected[inst.propertyType] = {};
    var n = parseInt(rawValue, 10);
    if (!n || n < 1) {
      delete inst.selected[inst.propertyType][svc.serviceName];
      if (!Object.keys(inst.selected[inst.propertyType]).length) delete inst.selected[inst.propertyType];
      delete inst.svcQty[k];
    } else {
      inst.selected[inst.propertyType][svc.serviceName] = sku;
      inst.svcQty[k] = n;
    }
    if (rerender) renderGrid(pickerId);
    fireChange(pickerId);
  }

  function selectAllLevel(pickerId, level, idx) {
    var inst = instances[pickerId];
    /* Los de cantidad (puertas, ventanas, etc.) se excluyen -- no
       tiene sentido "seleccionar todos con Level 2", necesitan que
       alguien ponga un numero de verdad, uno por uno. */
    var visible = visibleList(inst).filter(function (s) { return !isQuantityItem(s); });
    if (!inst.selected[inst.propertyType]) inst.selected[inst.propertyType] = {};

    if (inst.selAllActive === idx) {
      visible.forEach(function (s) {
        delete inst.selected[inst.propertyType][s.serviceName];
        delete inst.svcLevel[svcKey(inst.propertyType, s.serviceName)];
      });
      inst.selAllActive = null;
      if (inst.selAllThumbEl) inst.selAllThumbEl.style.opacity = '0';
    } else {
      visible.forEach(function (s) {
        inst.selected[inst.propertyType][s.serviceName] = s.sku;
        inst.svcLevel[svcKey(inst.propertyType, s.serviceName)] = level;
      });
      inst.selAllActive = idx;
      if (inst.selAllThumbEl) {
        inst.selAllThumbEl.style.opacity = '1';
        inst.selAllThumbEl.style.transform = 'translateX(' + (idx * 100) + '%)';
      }
    }
    if (inst.selAllOptsEl) {
      Array.prototype.forEach.call(inst.selAllOptsEl.querySelectorAll('.gs-sp-lvl3-opt'), function (el, i) {
        el.classList.toggle('active', i === inst.selAllActive);
      });
    }
    renderGrid(pickerId);
    fireChange(pickerId);
  }

  /* v1.65.0 (24/09/2026, el dueño: "una notificacion bonita, del estilo
     de la pagina, no esa cosa fea"): aviso propio en vez de confirm() del
     navegador. Tarjeta blanca con titulo, texto y dos botones (dorado =
     aceptar, blanco = quedarse). Esc o picar afuera = quedarse. Promesa
     con true/false. */
  function gsPickerConfirm(o) {
    return new Promise(function (resolve) {
      if (!document.getElementById('gs-sp-confirm-css')) {
        var st = document.createElement('style'); st.id = 'gs-sp-confirm-css';
        st.textContent =
          '.gs-sp-cf-back{position:fixed;inset:0;z-index:100000;background:rgba(17,17,17,.45);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .18s}' +
          '.gs-sp-cf-back.in{opacity:1}' +
          '.gs-sp-cf{width:min(420px,100%);background:#fff;border-radius:14px;border-top:4px solid #C9A84C;box-shadow:0 18px 50px rgba(0,0,0,.25);padding:22px 22px 18px;font-family:Inter,-apple-system,sans-serif;transform:translateY(8px) scale(.98);transition:transform .2s}' +
          '.gs-sp-cf-back.in .gs-sp-cf{transform:none}' +
          '.gs-sp-cf-ic{width:38px;height:38px;border-radius:50%;background:#FBF3DC;color:#8C6F2A;display:flex;align-items:center;justify-content:center;margin-bottom:12px}' +
          '.gs-sp-cf-ic svg{width:20px;height:20px}' +
          '.gs-sp-cf h3{margin:0 0 6px;font-size:17px;font-weight:700;color:#111}' +
          '.gs-sp-cf p{margin:0 0 18px;font-size:13.5px;line-height:1.5;color:#555}' +
          '.gs-sp-cf-btns{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}' +
          '.gs-sp-cf-btns button{font-family:Inter,sans-serif;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:7px;padding:12px 18px;cursor:pointer}' +
          '.gs-sp-cf-no{background:#fff;border:1.5px solid #E0D9CC;color:#111}' +
          '.gs-sp-cf-no:hover{border-color:#C9A84C}' +
          '.gs-sp-cf-yes{border:none;color:#171310;background:linear-gradient(155deg,#EAD9A0 0%,#C9A84C 45%,#8C6F2A 100%);box-shadow:0 1px 2px rgba(0,0,0,.2),0 6px 14px rgba(140,111,42,.35),inset 0 1px 0 rgba(255,255,255,.45)}' +
          '@media (max-width:480px){.gs-sp-cf-btns button{flex:1 1 100%}}';
        document.head.appendChild(st);
      }
      var back = document.createElement('div'); back.className = 'gs-sp-cf-back';
      back.innerHTML = '<div class="gs-sp-cf" role="dialog" aria-modal="true"><div class="gs-sp-cf-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg></div>' +
        '<h3>' + escapeHtml(o.title || 'Are you sure?') + '</h3><p>' + escapeHtml(o.text || '') + '</p>' +
        '<div class="gs-sp-cf-btns"><button type="button" class="gs-sp-cf-no">' + escapeHtml(o.cancel || 'Cancel') + '</button><button type="button" class="gs-sp-cf-yes">' + escapeHtml(o.ok || 'OK') + '</button></div></div>';
      document.body.appendChild(back);
      requestAnimationFrame(function () { back.classList.add('in'); });
      var done = false;
      function close(v) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey);
        back.classList.remove('in'); setTimeout(function () { back.remove(); }, 180);
        resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); }
      document.addEventListener('keydown', onKey);
      back.addEventListener('click', function (e) { if (e.target === back) close(false); });
      back.querySelector('.gs-sp-cf-no').addEventListener('click', function () { close(false); });
      back.querySelector('.gs-sp-cf-yes').addEventListener('click', function () { close(true); });
      setTimeout(function () { var b = back.querySelector('.gs-sp-cf-yes'); if (b) b.focus(); }, 50);
    });
  }

  function mount(pickerId, container, options) {
    styleTag();
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return null;

    var inst = {
      catalog: options.catalog || [],
      division: options.division || '',
      propertyType: options.propertyType || 'Commercial',
      mode: options.mode || 'toggle',
      filterMode: options.filterMode || 'all',
      crossDivision: !!options.crossDivision,
      showPropertyToggle: options.showPropertyToggle !== false,
      showSelectAll: !!options.showSelectAll,
      groupByCategory: !!options.groupByCategory,
      openCats: {},
      /* v1.51.0 -- toggle Recurring / Units (solo si workToggle) */
      workToggle: !!options.workToggle,
      /* v1.54.0: paquetes como plantilla SIN el toggle (clientes que no
         ven la opcion Recurring en el portal). */
      showPackages: !!options.showPackages,
      showPrices: !!options.showPrices,
      workMode: options.workMode === 'recurring' ? 'recurring' : 'units',
      areaNames: options.areaNames || null,
      placeArea: options.placeArea || '',
      openAreas: {},
      areasTouched: false,
      showOthers: false,
      onWorkModeChange: options.onWorkModeChange || null,
      packageItemLevels: options.packageItemLevels !== false, usualSets: options.usualSets || [], savedSets: options.savedSets || [], usualEdit: options.usualEdit || (options.place === 'template' ? { applyHere: true } : null), place: options.place || '', onGoMixed: options.onGoMixed || null, pkgDivision: null, openUsual: {}, openPkgs: {}, pkgItemLevels: (function (m) { var o = {}; Object.keys(m || {}).forEach(function (k) { var x = {}; (m[k] || []).forEach(function (i) { if (i && i.sku && i.level) x[String(i.sku)] = i.level; }); o[String(k)] = x; }); return o; })(options.initialPackageLevels),
      /* v1.57.0: { clientId, customSkus: {sku:true}, onSave(sku, items), onReset(sku) } -- solo Admin */
      packageEdit: options.packageEdit || null,
      pkgDraft: null,
      pkgSaving: false,
      selected: options.initialSelected || {},
      svcLevel: options.initialLevels || {},
      svcQty: options.initialQuantities || {},
      selAllActive: null,
      onChange: options.onChange || null
    };
    instances[pickerId] = inst;
    if (window.GSServiceTooltip) window.GSServiceTooltip.register(inst.catalog);

    var html = '<div class="gs-sp-toggles">';
    if (inst.workToggle) {
      html +=
        '<div class="gs-sp-res-wrap">' +
        '<span class="gs-sp-res-label">Recurring</span>' +
        '<label class="gs-sp-toggle">' +
        '<input type="checkbox" id="gs-sp-worktoggle-' + pickerId + '"' + (inst.workMode === 'units' ? ' checked' : '') + '>' +
        '<span class="gs-sp-toggle-track"></span></label>' +
        '<span class="gs-sp-res-label">Units</span></div>';
    }
    if (inst.showPropertyToggle) {
      html +=
        '<div class="gs-sp-res-wrap">' +
        '<span class="gs-sp-res-label">Commercial</span>' +
        '<label class="gs-sp-toggle">' +
        '<input type="checkbox" id="gs-sp-restoggle-' + pickerId + '"' + (inst.propertyType === 'Residential' ? ' checked' : '') + '>' +
        '<span class="gs-sp-toggle-track"></span></label>' +
        '<span class="gs-sp-res-label">Residential</span></div>';
    }
    html += '</div>';
    html +=
      '<div class="gs-sp-toolbar-row">' +
      '<input type="text" class="gs-sp-search" id="gs-sp-search-' + pickerId + '" placeholder="Search services\u2026">';
    if (inst.showSelectAll) {
      html +=
        '<div class="gs-sp-selall">' +
        '<span class="gs-sp-selall-label">Select all</span>' +
        '<div class="gs-sp-lvl3" id="gs-sp-selalltoggle-' + pickerId + '">' +
        '<div class="gs-sp-lvl3-thumb" id="gs-sp-selallthumb-' + pickerId + '"></div>' +
        '<div class="gs-sp-lvl3-opt" data-idx="0">L1</div>' +
        '<div class="gs-sp-lvl3-opt" data-idx="1">L2</div>' +
        '<div class="gs-sp-lvl3-opt" data-idx="2">L3</div>' +
        '</div></div>';
    }
    html += '</div><div id="gs-sp-grid-' + pickerId + '"></div>';

    container.innerHTML = html;

    inst.searchEl = document.getElementById('gs-sp-search-' + pickerId);
    inst.gridEl = document.getElementById('gs-sp-grid-' + pickerId);
    inst.selAllThumbEl = document.getElementById('gs-sp-selallthumb-' + pickerId);
    inst.selAllOptsEl = document.getElementById('gs-sp-selalltoggle-' + pickerId);

    inst.searchEl.addEventListener('input', function () { renderGrid(pickerId); });

    var workEl = document.getElementById('gs-sp-worktoggle-' + pickerId);
    /* v1.67.0 (24/09/2026, el dueño: "si esta en Residential se desactiva
       la opcion de mover el switch a Recurring; si esta en Commercial se mueve
       normal"). Recurring = areas comunes (Commercial). Para que nunca quede
       Recurring + Residential, mientras se esta en Recurring el switch de
       Residential tambien queda apagado. Nada se esconde ni se cambia solo:
       solo se desactiva el switch que no aplica. */
    function syncModeUI() {
      var rt = document.getElementById('gs-sp-restoggle-' + pickerId);
      var lockRec = inst.propertyType === 'Residential';
      /* Si por alguna razon arranca en Recurring + Residential, el switch de
         Residential se deja libre para poder regresar a Commercial (si no, se
         quedaria atorado con los dos apagados). */
      var lockRes = inst.workMode === 'recurring' && !!inst.workToggle && inst.propertyType !== 'Residential';
      if (workEl) {
        workEl.disabled = lockRec;
        var ww = workEl.closest('.gs-sp-res-wrap');
        if (ww) { ww.classList.toggle('gs-sp-locked', lockRec); ww.title = lockRec ? 'Recurring is for common areas (Commercial). Switch to Commercial to use it.' : ''; }
      }
      if (rt) {
        rt.disabled = lockRes;
        var rw = rt.closest('.gs-sp-res-wrap');
        if (rw) { rw.classList.toggle('gs-sp-locked', lockRes); rw.title = lockRes ? 'Recurring is Commercial only.' : ''; }
      }
    }
    if (workEl) {
      workEl.addEventListener('change', function () {
        var next = workEl.checked ? 'units' : 'recurring';
        /* v1.65.0 (24/09/2026, el dueño: "los recurrentes y los units no se
           deberian poder mezclar... hacer esa pregunta de que va a cambiar
           y que los quite si se cambian"): si ya hay algo escogido, se
           pregunta antes de cambiar; si dice que si, se quita TODO lo
           escogido (servicios, niveles, cantidades, niveles de paquete,
           tarjetas abiertas y borradores de Edit) y arranca limpio; si no,
           el switch regresa y no cambia nada. */
        var hasSel = Object.keys(inst.selected || {}).some(function (pt) { return Object.keys(inst.selected[pt] || {}).length; });
        if (hasSel && next !== inst.workMode) {
          var fromTxt = inst.workMode === 'units' ? 'Units' : 'Recurring', toTxt = next === 'units' ? 'Units' : 'Recurring';
          /* Mientras se decide, el switch se queda donde estaba. */
          workEl.checked = inst.workMode === 'units';
          gsPickerConfirm({
            title: 'Switch to ' + toTxt + '?',
            text: 'The services you picked in ' + fromTxt + ' will be removed. Recurring and Units can\'t be mixed in the same order.',
            ok: 'Switch & clear', cancel: 'Keep ' + fromTxt
          }).then(function (yes) {
            if (!yes) return;
            inst.selected = {}; inst.svcLevel = {}; inst.svcQty = {}; inst.pkgItemLevels = {};
            inst.openPkgs = {}; inst.openUsual = {}; inst.pkgDraft = null; inst.usualDraft = null;
            inst.workMode = next;
            workEl.checked = next === 'units';
            syncModeUI();
            renderGrid(pickerId);
            fireChange(pickerId);
            if (inst.onWorkModeChange) inst.onWorkModeChange(inst.workMode);
          });
          return;
        }
        inst.workMode = next;
        syncModeUI();
        renderGrid(pickerId);
        if (inst.onWorkModeChange) inst.onWorkModeChange(inst.workMode);
      });
    }
    var toggleEl = document.getElementById('gs-sp-restoggle-' + pickerId);
    if (toggleEl) {
      toggleEl.addEventListener('change', function () {
        inst.propertyType = toggleEl.checked ? 'Residential' : 'Commercial';
        syncModeUI();
        renderGrid(pickerId);
        fireChange(pickerId);
      });
    }

    if (inst.selAllOptsEl) {
      var levelNames = ['Level 1', 'Level 2', 'Level 3'];
      Array.prototype.forEach.call(inst.selAllOptsEl.querySelectorAll('.gs-sp-lvl3-opt'), function (el, i) {
        el.addEventListener('click', function () { selectAllLevel(pickerId, levelNames[i], i); });
      });
    }

    syncModeUI();
    renderGrid(pickerId);

    return {
      getSelected: function () { return inst.selected; },
      /* v1.59.0: por cada paquete EN USO, la lista de lo que incluye con
         el nivel escogido para ESTA orden: { pkgSku: [{sku, level}] }. */
      getPackageLevels: function () {
        var out = {};
        packagesInUse(inst).forEach(function (p) {
          var ov = inst.pkgItemLevels[String(p.sku)] || {};
          out[String(p.sku)] = (p.packageItems || []).map(function (x) { return { sku: String(x.sku), level: ov[String(x.sku)] || x.level || '' }; });
        });
        return out;
      },
      setPackageLevels: function (m) {
        inst.pkgItemLevels = {};
        Object.keys(m || {}).forEach(function (k) { var o = {}; (m[k] || []).forEach(function (x) { if (x && x.sku && x.level) o[String(x.sku)] = x.level; }); inst.pkgItemLevels[String(k)] = o; });
        renderGrid(pickerId);
      },
      getLevels: function () { return inst.svcLevel; },
      getQuantities: function () { return inst.svcQty; },
      getPropertyType: function () { return inst.propertyType; },
      setSelected: function (selected, levels, quantities, packageLevels) {
        inst.selected = selected || {};
        if (packageLevels !== undefined) { inst.pkgItemLevels = {}; Object.keys(packageLevels || {}).forEach(function (k) { var o = {}; (packageLevels[k] || []).forEach(function (x) { if (x && x.sku && x.level) o[String(x.sku)] = x.level; }); inst.pkgItemLevels[String(k)] = o; }); }
        inst.svcLevel = levels || {};
        inst.svcQty = quantities || {};
        renderGrid(pickerId);
      },
      setDivision: function (division) { inst.division = division; renderGrid(pickerId); },
      setShowPrices: function (on) { inst.showPrices = !!on; renderGrid(pickerId); },
      setWorkMode: function (m) { inst.workMode = m === 'recurring' ? 'recurring' : 'units'; if (workEl) workEl.checked = inst.workMode === 'units'; syncModeUI(); renderGrid(pickerId); },
      setPlaceArea: function (a) { inst.placeArea = a || ''; inst.areasTouched = false; renderGrid(pickerId); },
      setPropertyType: function (type) {
        inst.propertyType = type;
        if (toggleEl) toggleEl.checked = type === 'Residential';
        syncModeUI();
        renderGrid(pickerId);
      },
      setPackageEdit: function (pe) { inst.packageEdit = pe || null; renderGrid(pickerId); },
      setUsualSets: function (u) { inst.usualSets = u || []; renderGrid(pickerId); },
      setSavedSets: function (u) { inst.savedSets = u || []; renderGrid(pickerId); },
      setCatalog: function (catalog) { inst.catalog = catalog; if (window.GSServiceTooltip) window.GSServiceTooltip.register(catalog); renderGrid(pickerId); },
      destroy: function () { delete instances[pickerId]; container.innerHTML = ''; }
    };
  }

  window.GSServicePicker = { mount: mount };
})();
