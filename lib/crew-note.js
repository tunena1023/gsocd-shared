/* ============================================================
   lib/crew-note.js -- "Send to <empleado>" de la nota interna (05/10/2026,
   dueño: "un botoncito para que los supervisores o admin puedan enviar esas
   notas al empleado asignado a ese servicio"; "solo a la persona asignada,
   no se escoge a nadie").
     const crewNote = require('gsocd-shared/lib/crew-note')(require('./graph'), push);
   - recipients(order, exclude)  nombres de los EMPLEADOS asignados (Role
     Employee en Techs): los de Orders.Supervisor y los de Assign by service
     que no han terminado. Sin el que manda.
   - send({ item, actor })  manda la nota GUARDADA (Orders.InternalNotes):
     renglon de OrderHistory 'Internal Note' con FieldChanged 'Sent'
     (OldValue = a quien, NewValue = el texto) y push a sus celulares.
     Al ser 'Internal Note', el cliente nunca lo ve (order-history,
     get-order-detail de Orders) y el empleado tampoco en su historial.
   - lastSent(history, name)  el ultimo envio (a ese nombre si se da):
     { text, by, at, to: [..] } o null. El empleado ve ESA version en su
     tarjeta, no la que la oficina sigue escribiendo.
   push es opcional: sin el (o sin llaves VAPID) solo se guarda el envio.
============================================================ */
const TECHS_LIST = 'Techs', SERVICE_ASSIGNMENTS_LIST = 'ServiceAssignments', ORDER_HISTORY_LIST = 'OrderHistory';
const low = s => String(s || '').trim().toLowerCase();
const names = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const q = s => String(s || '').replace(/'/g, "''");

function lastSent(history, name) {
  const who = low(name);
  const rows = (history || []).map(h => (h && h.fields) ? h.fields : h).filter(h => h
    && String(h.ChangeType || '') === 'Internal Note' && String(h.FieldChanged || '') === 'Sent'
    && (!who || names(h.OldValue).map(low).indexOf(who) !== -1))
    .sort((a, b) => String(b.ChangeDate || '').localeCompare(String(a.ChangeDate || '')));
  const h = rows[0];
  return h ? { text: String(h.NewValue || ''), by: String(h.ChangedBy || ''), at: String(h.ChangeDate || ''), to: names(h.OldValue) } : null;
}

module.exports = function crewNote(graph, push) {
  const { graphFetch, siteListPath, createListItem } = graph;

  async function fetchAll(listName, filter) {
    let url = siteListPath(listName) + '?$expand=fields&$top=500' + (filter ? '&$filter=' + encodeURIComponent(filter) : '');
    const out = [];
    while (url) {
      const data = await graphFetch(url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
      out.push(...(data.value || []));
      url = data['@odata.nextLink'] || null;
    }
    return out;
  }

  /* opts.techs / opts.assignments: renglones ya leidos (para no volver a leer). */
  async function recipients(order, exclude, opts) {
    const o = opts || {};
    const people = names(order.Supervisor);
    const sa = o.assignments || await fetchAll(SERVICE_ASSIGNMENTS_LIST, `fields/OrderID eq '${q(order.OrderID || order.Title)}'`).catch(() => []);
    sa.forEach(r => { const f = r.fields || r; if (String(f.OrderID || '') === String(order.OrderID || order.Title) && String(f.WorkStatus || '') !== 'Completed') people.push(...names(f.AssignedTo)); });
    const techs = o.techs || await fetchAll(TECHS_LIST);
    const ex = low(exclude);
    const out = [];
    const seen = new Set();
    people.forEach(n => {
      const k = low(n);
      if (!k || k === ex || seen.has(k)) return;
      seen.add(k);
      const t = techs.find(t => t.fields && low((t.fields.FirstName || '') + ' ' + (t.fields.LastName || '')) === k);
      if (t && String(t.fields.Role || 'Employee') === 'Employee') out.push(n);
    });
    return out;
  }

  async function send(opts) {
    const item = opts.item, f = (item && item.fields) || {};
    const orderId = String(f.OrderID || f.Title || '');
    const text = String(f.InternalNotes || '').trim();
    if (!text) return { ok: false, status: 400, error: 'Write the note first.' };
    const to = await recipients(f, opts.actor);
    if (!to.length) return { ok: false, status: 400, error: 'No employee is assigned to this order yet.' };
    const at = new Date().toISOString();
    await createListItem(ORDER_HISTORY_LIST, {
      Title: orderId + '-note-sent-' + Date.now(), OrderID: orderId, ChangeType: 'Internal Note', FieldChanged: 'Sent',
      ChangedBy: String(opts.actor || 'Office'), ChangeDate: at, Notes: '', OldValue: to.join(', '), NewValue: text
    });
    if (push && push.pushCrewNote) await push.pushCrewNote(f, to, { text, by: opts.actor });
    return { ok: true, sentTo: to, at, text };
  }

  return { recipients, send, lastSent };
};
module.exports.lastSent = lastSent;
