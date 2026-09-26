(function () {
  'use strict';

  if (window.GSActionRow) return;

  /* ================================================================
     GSActionRow -- UNA SOLA forma de acomodar las filas de botones de
     las tarjetas (ordenes, aprobaciones, recurrentes, templates...) en
     Admingsocd.com, ordersgsocd.com y tech.gsocd.com. 26/09/2026, pedido
     del dueño: "ese estilo lo deben de tener todos los botones de todas
     las tarjetas de todos los repos... para algo hay un shared".

     Como se usa: a la fila que ya existe (appr-bar, order-actions,
     action-row...) se le agrega la clase `gs-act-row`. No cambia el
     color ni la forma de los botones de cada portal, solo como se
     acomodan:
       - Escritorio: todos en una fila, del tamano de su texto, y si no
         caben pasan a la siguiente linea.
       - Telefono (<= 768px): de dos en dos, del mismo ancho, en vez de
         uno por renglon. Si la fila trae un solo boton, ocupa todo.

     Clases de apoyo (opcionales):
       gs-act-group  un <span> que junta varias cosas (ej. Upload + iconos):
                     en telefono sus hijos se acomodan como si fueran de
                     la fila.
       gs-act-full   ocupa el renglon completo en telefono (avisos, iconos,
                     links).
       gs-act-cell   algo chico que no es boton (ej. iconos de documentos):
                     en telefono, si le toca a la derecha de un boton usa ese
                     medio espacio; si le toca empezar renglon, toma el
                     renglon completo en una sola linea.
       gs-act-keep   boton que conserva su tamano (iconos, camara).
       gs-act-icon-first  fila de un icono + un boton (ej. camara + Mark
                     as Done): el icono chico y el boton con el resto.
     print-button (.print-wrap / .print-hint) ya se acomoda solo.
     En telefono el acomodo usa !important a proposito: cada portal tiene
     reglas propias mas especificas (ej. #panel-processing .order-actions,
     o style="display:flex" en linea) que si no le ganarian.

     API: GSActionRow.styleTag() -- se llama sola al cargar el archivo.
  ================================================================ */

  var STYLE_ID = 'gs-action-row-style';
  var CSS =
    '.gs-act-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}' +
    '.gs-act-row>button,.gs-act-row>.gs-act-group>button{width:auto;flex:0 0 auto}' +
    '.gs-act-group{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}' +
    '.gs-act-row.gs-act-icon-first{flex-wrap:nowrap}' +
    '.gs-act-row.gs-act-icon-first>button:not(.gs-act-keep){flex:1 1 auto}' +
    '@media (max-width:768px){' +
      '.gs-act-row{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px!important;width:100%;align-items:stretch!important}' +
      '.gs-act-row>*{min-width:0}' +
      '.gs-act-row button:not(.gs-act-keep){width:100%!important;margin:0!important;white-space:normal;padding-left:10px;padding-right:10px;flex:none}' +
      '.gs-act-row .gs-act-group,.gs-act-row .print-wrap{display:contents!important}' +
      '.gs-act-row .gs-act-full,.gs-act-row .print-hint,.gs-act-row>:not(button):not(.gs-act-group):not(.print-wrap):not(a):not(.gs-act-cell){grid-column:1/-1}' +
      '.gs-act-row>.gs-act-cell{display:flex!important;align-items:center;flex-wrap:nowrap;gap:6px}' +
      '.gs-act-row>.gs-act-cell:nth-child(odd of button,.print-wrap,.gs-act-group,.gs-act-cell){grid-column:1/-1}' +
      '.gs-act-row>:only-child{grid-column:1/-1}' +
      '.gs-act-row .gs-act-full{order:99}' +
      '.gs-act-row.gs-act-icon-first{display:flex!important}' +
      '.gs-act-row.gs-act-icon-first>button:not(.gs-act-keep){flex:1 1 auto;width:auto!important}' +
    '}';

  function styleTag() {
    if (document.getElementById(STYLE_ID)) return;
    var t = document.createElement('style');
    t.id = STYLE_ID;
    t.textContent = CSS;
    (document.head || document.documentElement).appendChild(t);
  }

  styleTag();
  window.GSActionRow = { styleTag: styleTag };
})();
