/* ============================================================
   gsocd-shared / order-card-header
   Bloque de encabezado para una tarjeta de orden CERRADA -- el
   mismo look en Admin, Tech y Orders, en cualquier tab (Approvals,
   Review, Active, History, Schedule, Processing, etc.).

   Nace del rediseño de Gallery (19/09/2026, aprobado con mini
   interactivo) -- el dueño pidio que ese mismo formato se volviera
   la pieza compartida para TODA tarjeta de orden cerrada en los 3
   portales, no solo Gallery. gallery-groups.js consume este
   componente en vez de tener su propia copia (ver su NOTES.md).

   Solo cubre el bloque de INFORMACION (nombre + renglones de
   detalle) -- el contenedor de la tarjeta (fondo, borde, click para
   abrir/navegar) se queda tal cual lo tenga cada lugar que lo usa;
   este componente no asume que la tarjeta se abre en acordeon (eso
   es especifico de Gallery).

   Uso:
     <div id="hdr"></div>
     <script>
       document.getElementById('hdr').innerHTML = GSOrderCardHeader.html({
         name: 'Southridge Senior Lofts',   // arriba, en negritas --
                                             // normalmente el cliente;
                                             // si no aplica, usar el
                                             // numero de orden
         orderId: 'GS-1001-1014',
         division: 'Janitorial',
         unitNumber: '65',
         bedrooms: '2',
         bathrooms: '1',
         supervisor: 'John Doe',
         completedDateText: 'Sep 19, 2026'  // YA formateado para
                                             // mostrar -- este
                                             // componente no formatea
                                             // fechas, cada llamador
                                             // ya tiene su propio
                                             // fmtDate()
       }, {
         trailingHtml: '<span>...</span>'   // opcional -- lo que sea
                                             // que vaya a la derecha
                                             // del nombre (badge de
                                             // conteo, flechita, etc.)
       });
     </script>

   Renglones (cada uno se arma solo con lo que venga -- nada de
   separadores huerfanos si falta un dato):
     1) Order # · Division
     2) Unit # · Nbd/Mba          (formato calcado de
                                    ordersgsocd.com/customer.html
                                    orderSummaryLine(), a proposito --
                                    es el formato que ya se usaba en
                                    Processing y el dueño pidio
                                    igualarlo en todos lados)
     3) Assigned · Completed
============================================================ */
(function () {
  'use strict';
  if (window.GSOrderCardHeader) return;

  var STYLE_ID = 'gs-order-card-header-style';
  function styleTag() {
    if (document.getElementById(STYLE_ID)) return;
    var tag = document.createElement('style');
    tag.id = STYLE_ID;
    tag.textContent =
      '.gs-ordhdr-top { display: flex; align-items: center; gap: 12px; min-width: 0; }' +
      '.gs-ordhdr-name { font-weight: 700; font-size: 14px; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex-shrink: 1; }' +
      '.gs-ordhdr-trailing { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-shrink: 0; }' +
      '.gs-ordhdr-sub { font-size: 11px; color: #6B6B6B; margin-top: 5px; }';
    document.head.appendChild(tag);
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function html(o, opts) {
    styleTag();
    o = o || {};
    opts = opts || {};

    var name = o.name || o.orderId || '';
    var top = '<div class="gs-ordhdr-top"><span class="gs-ordhdr-name">' + esc(name) + '</span>' +
      (opts.trailingHtml ? '<span class="gs-ordhdr-trailing">' + opts.trailingHtml + '</span>' : '') +
      '</div>';

    var l1 = [];
    if (o.orderId) l1.push(o.orderId);
    if (o.division) l1.push(o.division);

    var l2 = [];
    if (o.unitNumber) l2.push('Unit ' + o.unitNumber);
    if (o.bedrooms || o.bathrooms) l2.push((o.bedrooms || '—') + 'bd/' + (o.bathrooms || '—') + 'ba');

    var l3 = [];
    if (o.supervisor) l3.push('Assigned: ' + o.supervisor);
    if (o.completedDateText) l3.push('Completed: ' + o.completedDateText);

    var subLines = [l1, l2, l3]
      .filter(function (l) { return l.length; })
      .map(function (l) { return '<div class="gs-ordhdr-sub">' + esc(l.join(' · ')) + '</div>'; })
      .join('');

    /* extraLine: texto libre YA FORMATEADO, para lo que un tab
       necesite y no encaje en Order/Division, Unit/bd-ba o
       Assigned/Completed -- ej. Approvals quiere "submitted <fecha>"
       (la orden todavia no tiene supervisor ni fecha de completado).
       Se agrega como renglon aparte, siempre al final. */
    if (o.extraLine) subLines += '<div class="gs-ordhdr-sub">' + esc(o.extraLine) + '</div>';

    return top + subLines;
  }

  window.GSOrderCardHeader = { html: html };
})();
