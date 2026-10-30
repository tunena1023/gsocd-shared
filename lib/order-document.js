/* ============================================================
   gsocd-shared/lib/order-document.js -- el endpoint get-order-document de
   Admin y Orders (antes ~100 renglones casi iguales en cada uno; el de
   Admin metia el OrderID en el filtro sin escapar).

   Uso (get-order-document.js del portal, una linea):
     module.exports = require('gsocd-shared/lib/order-document')(require('./lib/graph'),
       () => require('./lib/list-query'), () => require('./lib/orderpdf'));

   GET ?orderId=GS-6062-1010               -> PDF de la orden
   GET ?orderId=GS-6062-1010&kind=completion -> PDF de completado
   kind=request no se genera aqui (Review lo genera fresco: print-request-document).

   El PDF SIEMPRE se regenera y se guarda con la revision que le toque:
   comparar por fecha (lastModifiedDateTime contra la creacion del PDF)
   solo detecta si cambio la ORDEN, no si cambio el FORMATO del documento.
   Asi el cliente y la oficina ven siempre el mismo documento, completo.
   El costo: cada clic en Print crea una revision nueva en SharePoint.
   El candado de cada portal (sesion / dueño de la orden) va antes de esto.
============================================================ */
'use strict';

module.exports = function orderDocument(g, lqOf, pdfOf) {
  const lq = () => (typeof lqOf === 'function' ? lqOf() : lqOf);
  const pdf = () => (typeof pdfOf === 'function' ? pdfOf() : pdfOf);
  const byOrder = (list, orderId) => lq().fetchByField(list, 'OrderID', orderId, { fields: true });
  const byDate = (a, b) => new Date(a.ChangeDate || 0) - new Date(b.ChangeDate || 0);

  async function handler(event) {
    if (event.httpMethod !== 'GET') return g.jsonResponse(405, { error: 'Method not allowed' });
    const p = event.queryStringParameters || {};
    const orderId = String(p.orderId || '').trim();
    const kind = String(p.kind || '').trim();
    if (!orderId) return g.jsonResponse(400, { error: 'orderId is required' });
    if (kind === 'request') return g.jsonResponse(400, { error: 'kind=request is not generated here.' });

    try {
      const order = (await byOrder(g.ORDERS_LIST, orderId))[0];
      if (!order) return g.jsonResponse(404, { error: 'Order not found.' });
      const merged = Object.assign({}, order, { OrderID: orderId });
      const [services, history] = await Promise.all([byOrder(g.ORDER_SERVICES_LIST, orderId), byOrder(g.ORDER_HISTORY_LIST, orderId)]);
      history.sort(byDate);

      /* Las fotos las baja generateAndSaveCompletionPdf (no se bajan dos veces en el mismo clic). */
      const result = kind === 'completion'
        ? await pdf().generateAndSaveCompletionPdf({
          order: merged, services, history, photos: undefined,
          completedBy: order.Technician || order.Supervisor || '',
          completedAt: order.CompletedDate || new Date().toISOString()
        })
        : await pdf().generateAndSaveOrderPdf({ order: merged, services, history });

      if (!result.ok) return g.jsonResponse(500, { error: 'Could not generate the document: ' + result.error });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="' + result.fileName + '"',
          'Cache-Control': 'no-store'
        },
        body: result.buffer.toString('base64'),
        isBase64Encoded: true
      };
    } catch (err) {
      return g.jsonResponse(500, { error: err.message });
    }
  }

  return { handler };
};
