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

module.exports = { isUnseen, unseenIds };
