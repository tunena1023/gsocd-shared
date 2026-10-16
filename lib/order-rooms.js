/* ============================================================
   lib/order-rooms.js -- recamaras y banos de una orden (16/10/2026).
   UNA sola pieza para Admin y Orders (submit-order, add-batch-unit):

     const rooms = require('gsocd-shared/lib/order-rooms');

   - Orders.Bedrooms/Bathrooms son columnas de NUMERO: con '' SharePoint
     contesta "One of the provided arguments is not acceptable" y la orden
     no se crea (orden de Equitable, Admin, 15/10/2026). roomNumber: vacio o
     texto -> null (la columna queda vacia); 1.5 se respeta.
   - Una orden de Recurring (areas comunes: pasillos, gimnasio del clubhouse)
     va sin recamaras ni banos (dueño 16/10/2026). roomsNone: la orden (o la
     primera unidad de un lote) va sin ellos -> agregarle una unidad tampoco
     los pide.
   En el navegador, lo mismo esta en GSOrderFormPremium (roomsNone,
   setRoomsHidden).
============================================================ */
'use strict';

function roomNumber(v) {
  const m = String(v == null ? '' : v).trim().match(/^(\d+(?:\.\d+)?)\b/);
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

function roomsNone(fields) {
  return !roomNumber(fields && fields.Bedrooms) && !roomNumber(fields && fields.Bathrooms);
}

module.exports = { roomNumber, roomsNone };
