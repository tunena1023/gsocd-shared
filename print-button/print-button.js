(function () {
  'use strict';

  if (window.GSPrintButton) return;

  /* ================================================================
     GSPrintButton -- UNA sola pieza para el boton "Print"/"Print PDF"
     de una orden, compartida por Admingsocd.com (staff) y
     ordersgsocd.com (cliente). Antes cada uno tenia su propia copia
     de esta logica (duplicada, no compartida) -- arreglar la regla en
     un lado y se le olvidaba al otro (reportado por el dueño,
     19/09/2026: "eso debe ser una funcion en shared para que todos
     impriman igual").

     REGLA (decidida con el dueño, 19/09/2026): el boton se habilita
     desde que la orden ya se asigno (Status !== 'Received') -- YA NO
     depende de que exista un archivo guardado en ese momento. El
     backend (get-order-document.js, en cada portal que lo tenga)
     genera uno sobre la marcha si hace falta -- no existe ninguno
     guardado, o la orden cambio despues del ultimo guardado -- asi
     que "todavia no hay archivo" ya no es razon para deshabilitar el
     boton. Si el estatus es Completed, pide el documento de
     completion (con fotos) en vez del documento normal de la orden.

     API PUBLICA:
       GSPrintButton.html(order, opts) -> string HTML de un boton
         completo, con su propio onclick ya resuelto (no necesita que
         el llamador conecte nada aparte).
         opts.label: texto del boton (default 'Print')
         opts.className: clase CSS del boton (default 'gs-ofp-btn-secondary')
         opts.storedDoc: { name } opcional -- si se tiene a la mano
           (ya se pidio antes), se usa para el title="Open X.pdf";
           si no se tiene, el title es generico, no afecta si el
           boton esta habilitado o no (eso ya no depende de esto).
         opts.disabledHint: texto del hint cuando esta deshabilitado
           (default 'Available once the order is approved')

       GSPrintButton.open(orderId, status) -- abre el documento
         correcto para esa orden (normal o completion, segun status).
         Se llama sola desde el onclick que ya trae el HTML de
         .html() -- normalmente no hace falta llamarla a mano, pero
         esta disponible por si algun boton propio del portal
         necesita el mismo comportamiento sin usar .html().
  ================================================================ */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function reachedAssignment(status) {
    return String(status || '') !== 'Received';
  }

  function kindFor(status) {
    return status === 'Completed' ? 'completion' : undefined;
  }

  function open(orderId, status) {
    var kind = kindFor(status);
    var url = '/api/get-order-document?orderId=' + encodeURIComponent(orderId)
      + (kind ? '&kind=' + encodeURIComponent(kind) : '');
    window.open(url, '_blank');
  }

  function html(order, opts) {
    opts = opts || {};
    order = order || {};
    var label = opts.label || 'Print';
    var cls = opts.className || 'gs-ofp-btn-secondary';
    var disabledHint = opts.disabledHint || 'Available once the order is approved';
    var orderId = order.OrderID || '';
    var status = order.Status || '';
    var storedDoc = opts.storedDoc || null;

    if (reachedAssignment(status)) {
      var title = storedDoc && storedDoc.name ? 'Open ' + esc(storedDoc.name) : 'Open the order document';
      return '<button type="button" class="' + escAttr(cls) + '" title="' + escAttr(title) + '" ' +
        'onclick="event.stopPropagation();GSPrintButton.open(\'' + escAttr(orderId) + '\',\'' + escAttr(status) + '\')">' +
        esc(label) + '</button>';
    }
    return '<span class="print-wrap">' +
      '<button type="button" class="' + escAttr(cls) + '" disabled title="' + escAttr(disabledHint) + '">' + esc(label) + '</button>' +
      '<span class="print-hint">' + esc(disabledHint) + '</span>' +
      '</span>';
  }

  window.GSPrintButton = { html: html, open: open };
})();
