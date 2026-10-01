/* Notas por servicio (dueño 01/10/2026): "un lapicito en cada servicio";
   las notas no se borran, van al historial aunque la orden no cambie de
   estatus, y solo las ve la oficina (Admin y Tech), nunca el cliente.

   Cada nota es UN renglon de OrderHistory, ChangeType 'Service Note':
     FieldChanged = nombre del servicio
     NewValue     = {"sku","name","text"}   (lo lee order-history serviceNotesOf)
     Notes        = "<servicio>: <texto>"   (lo que sale en el historial)
   order-history.js lo esconde en modo cliente (pantalla y PDFs) y el portal
   del cliente (Orders get-order-detail) no lo regresa.

   Lo usan Admin y Orders (npm) y Tech (copia igual en lib/service-notes.js). */

const MAX_NOTE = 1000;

function cleanNote(text) {
  return String(text == null ? '' : text).replace(/\r\n/g, '\n').trim().slice(0, MAX_NOTE);
}

/* Campos del renglon de historial. null si no hay texto. */
function historyFields(orderId, svc, text, actor, when) {
  const t = cleanNote(text);
  const name = String((svc && (svc.name || svc.ServiceName)) || '').trim();
  const sku = String((svc && (svc.sku || svc.SKU || svc.SubOption)) || '').trim();
  if (!orderId || !t || !name) return null;
  return {
    Title: String(orderId) + '-sn',
    OrderID: String(orderId),
    ChangeType: 'Service Note',
    FieldChanged: name.slice(0, 255),
    ChangedBy: String(actor || '').slice(0, 255),
    ChangeDate: when || new Date().toISOString(),
    Notes: (name + ': ' + t).slice(0, 2000),
    OldValue: '',
    NewValue: JSON.stringify({ sku: sku, name: name, text: t })
  };
}

/* Notas que trae cada servicio de un payload de Create Order
   (Services[i].Note). Regresa [{ sku, name, text }]. */
function notesFromServices(services) {
  const out = [];
  (Array.isArray(services) ? services : []).forEach(s => {
    if (!s) return;
    const text = cleanNote(s.Note || s.note);
    const name = String(s.ServiceName || s.name || '').trim();
    if (text && name) out.push({ sku: String(s.SKU || s.sku || s.SubOption || '').trim(), name: name, text: text });
  });
  return out;
}

/* Llave de un servicio para juntar sus notas: el SKU manda; sin SKU, el nombre.
   La misma llave usa services-box editor() (snKey). */
function noteKey(sku, name) {
  return sku ? 'sku:' + String(sku).trim().toUpperCase() : 'name:' + String(name || '').trim().toLowerCase();
}

/* Notas de una orden desde sus renglones de historial (fields). Las del
   cliente (ChangedBy = su ClientID) salen como 'Client'. Mas vieja primero.
   -> [{ key, sku, name, text, by, at }] */
function notesOf(historyRows, clientId) {
  const cid = String(clientId || '').trim().toLowerCase();
  const out = [];
  (historyRows || []).forEach(r => {
    const h = r && r.fields ? Object.assign({ Created: r.createdDateTime }, r.fields) : r;
    if (!h || h.ChangeType !== 'Service Note') return;
    let v = null; try { v = JSON.parse(h.NewValue || 'null'); } catch (e) {}
    if (!v || !cleanNote(v.text)) return;
    const by = String(h.ChangedBy || '');
    out.push({ key: noteKey(v.sku, v.name), sku: String(v.sku || ''), name: String(v.name || ''), text: cleanNote(v.text),
      by: cid && by.trim().toLowerCase() === cid ? 'Client' : by, at: String(h.ChangeDate || h.Created || '') });
  });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

module.exports = { MAX_NOTE, cleanNote, historyFields, notesFromServices, noteKey, notesOf };
