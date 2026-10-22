/* ============================================================
   gsocd-shared/lib/seen-tracking.js
   Logica compartida de BACKEND (Node, no navegador) -- mismo criterio
   que lib/division-rules.js: funcion pura, SIN tocar SharePoint/Graph
   aqui adentro. Cada repo (Admin, Orders, Tech) sigue haciendo sus
   propias consultas/escrituras a la lista OrderSeenBy con lo que ya
   tiene en su propio lib/graph.js -- esto solo decide.

   Por que existe: el "destello" de gsocd-shared/live-refresh se apaga
   solo a los ~900ms, pensado para que quien hizo el cambio vea que
   su propia pantalla se actualizo. Pero con varios usuarios viendo
   Admin a la vez (Developer, Approvals, Active/Scheduling), hace
   falta algo que se quede marcado hasta que CADA usuario, por su
   cuenta, abra esa orden -- no que se apague con el tiempo.
   Confirmado con el dueño, 21/09/2026.

   Lista SharePoint (/sites/Onlineorders): OrderSeenBy
     OrderID   -- una linea de texto
     ViewerId  -- una linea de texto (el email en Admin/Tech, el
                  ClientID en Orders -- mismo campo para los 3, es
                  solo un identificador)
     SeenAt    -- fecha y hora

   Regla: una orden esta "sin ver" para un viewer si nunca la ha
   visto, o si la ultima vez que la vio es ANTERIOR a la ultima
   modificacion real de la orden. Un renglon en OrderSeenBy solo se
   escribe cuando alguien de verdad ABRE una orden -- no cada vez que
   algo cambia (evitaria escribir un renglon por usuario en cada
   cambio, sin necesidad).
============================================================ */

/* seenAt: ISO string o null/undefined (nunca la ha visto).
   lastModifiedDateTime: ISO string de la orden (o cualquier otra
   entidad -- tambien sirve para contratos recurrentes, etc.). */
function isUnseen(seenAt, lastModifiedDateTime) {
  if (!lastModifiedDateTime) return false; // sin fecha real que comparar, no se marca
  if (!seenAt) return true;
  const seenMs = new Date(seenAt).getTime();
  const modMs = new Date(lastModifiedDateTime).getTime();
  if (isNaN(seenMs) || isNaN(modMs)) return false; // fecha invalida, no se arriesga a marcar mal
  return seenMs < modMs;
}

/* entities: array de objetos con al menos {id, lastModifiedDateTime}
   (el nombre del campo id lo decide idField, por default 'OrderID').
   seenMap: { [id]: seenAtISOString }, lo que el backend ya consulto
   de OrderSeenBy para ESE viewer (filtrado por ViewerId).

   Regresa un Set con los ids que estan sin ver -- mas facil de
   consultar (unseenSet.has(id)) que filtrar un array cada vez. */
function unseenIds(entities, seenMap, idField) {
  const field = idField || 'OrderID';
  const out = new Set();
  (entities || []).forEach(function (e) {
    const id = e && e[field];
    if (id && isUnseen((seenMap || {})[id], e.lastModifiedDateTime)) out.add(id);
  });
  return out;
}

/* ---------- Brillo por historial (CFO 22/10/2026) ----------
   El brillo de las ordenes ya no se compara con lastModifiedDateTime de SharePoint: ese cambia
   con CUALQUIER escritura a la orden, aunque sea interna y nadie la vea (OutlookEvents cada
   5 min, PackageContents, correcciones de recurrentes, notificaciones del cliente...). Por eso
   las completadas volvian a brillar y, en otro dispositivo, brillaba lo que ya se habia abierto.
   Ahora: brilla si en el historial que ESA persona ve (gsocd-shared order-history, modo
   'client' | 'tech' | 'staff') hay algo despues de la ultima vez que la abrio. Nunca abierta =
   brilla, igual que antes. Sin historial a la mano (fallo la lectura): la regla de antes. */
let orderHistory = null;
function historyLib() { return orderHistory || (orderHistory = require('../order-history/order-history.js')); }

/* rows: renglones de OrderHistory de UNA orden (los fields, o los items de Graph con .fields).
   opts: lo de GSOrderHistory.entries (mode, showInternal...). Regresa la fecha ISO mas nueva
   de lo que esa persona ve, o '' si no ve nada. */
function lastVisibleChange(orderId, rows, opts) {
  const list = (rows || []).map(r => (r && r.fields) ? Object.assign({}, r.fields, { ChangeDate: r.fields.ChangeDate || r.createdDateTime }) : r).filter(Boolean)
    .slice().sort((a, b) => String(a.ChangeDate || '').localeCompare(String(b.ChangeDate || '')));
  if (!list.length) return '';
  let best = '';
  historyLib().entries(orderId, list, opts || {}).forEach(e => {
    const t = new Date(e.date).getTime();
    if (!isNaN(t) && (!best || t > new Date(best).getTime())) best = new Date(t).toISOString();
  });
  return best;
}

/* La orden brilla para este viewer?
   seenAt: su ultima vez abierta (OrderSeenBy) o vacio.
   rows: su historial (array; [] = sin historial) o null = no se pudo leer -> regla de antes.
   o: { createdDateTime, lastModifiedDateTime } de la orden. */
function isUnseenOrder(seenAt, rows, o, opts) {
  if (!seenAt) return isUnseen(null, o && (o.lastModifiedDateTime || o.createdDateTime));
  if (rows == null) return isUnseen(seenAt, o && o.lastModifiedDateTime);
  const when = lastVisibleChange(o && (o.OrderID || o.Title), rows, opts) || (o && o.createdDateTime) || '';
  return isUnseen(seenAt, when);
}

/* Las que hay que revisar con el historial: abiertas alguna vez y con lastModified despues
   (sin eso, ni con la regla de antes brillaban; asi no se lee historial de mas). */
function needsHistory(seenAt, lastModifiedDateTime) {
  return !!seenAt && isUnseen(seenAt, lastModifiedDateTime);
}

module.exports = { isUnseen, unseenIds, lastVisibleChange, isUnseenOrder, needsHistory };
