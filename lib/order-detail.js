/* ============================================================
   gsocd-shared/lib/order-detail.js -- el endpoint get-order-detail de
   Admin (la oficina) y de Orders (el cliente): TODO sobre una orden o un
   draft en una sola llamada. Antes eran dos archivos de ~280 renglones,
   ~107 iguales.
   - orderId con "-TEMP-" -> Drafts.
   - Orden normal -> Orders, OrderServices, OrderHistory y ServiceAssignments,
     filtrando por OrderID (lib/list-query fetchByField, escapado).

   Uso (get-order-detail.js del portal, una linea):
     module.exports = require('gsocd-shared/lib/order-detail')(require('./lib/graph'),
       () => require('./lib/list-query'), () => require('./lib/orderpdf'),
       { audience: 'office', crewNote: () => require('./lib/crew-note') });

   audience 'client' (Orders): LISTA CERRADA de lo que se le manda al
   cliente. Nunca: notas internas, notas por servicio, la razon de un
   Reschedule, lo "Office Change (Internal)", lo de la llave, ni las
   ordenes HiddenFromClient (404). Un campo nuevo para la oficina se agrega
   en OFFICE_FIELDS y NO le llega al cliente; uno para el cliente, en
   CLIENT_FIELDS.
============================================================ */
'use strict';

const { dedupe } = require('./history-dedupe');
const { internalInspection } = require('./recurring-published');

const yes = v => v === true || v === 'true';

/* Lo que ven los dos (oficina y cliente). */
function commonFields(f) {
  return {
    OrderID:         f.OrderID || f.Title || '',
    PackageContents: f.PackageContents || '',
    ClientID:        f.ClientID || '',
    BusinessName:    f.BusinessName || f.Title || '',
    Division:        f.Division || '',
    Status:          f.Status || 'Pending',
    DirtLevel:       f.DirtLevel || '',
    Services:        f.Services || '',
    DraftData:       f.DraftData || '',
    BuildingNumber:  f.BuildingNumber || '',
    UnitNumber:      f.UnitNumber || '',
    Bedrooms:        f.Bedrooms || '',
    Bathrooms:       f.Bathrooms || '',
    EntryDate:       f.EntryDate || '',
    DueDate:         f.DueDate || '',
    Address:         f.Address || '',
    Suite:           f.Suite || '',
    City:            f.City || '',
    Zip:             f.Zip || '',
    Contact:         f.Contact || '',
    Notes:           f.Notes || '',
    Supervisor:       f.Supervisor || '',
    ServiceWindow:    f.ServiceWindow || '',
    DispatchDate:     f.DispatchDate || '',
    InspectionDate:   f.InspectionDate || '',
    InspectionBy:     f.InspectionBy || '',
    InspectionWindow: f.InspectionWindow || '',
    InspectionDoneAt: f.InspectionDoneAt || '',
    DelayReasonType:  f.DelayReasonType || '',
    DelayReasonNotes: f.DelayReasonNotes || '',
    Archived:         yes(f.Archived),
    OrderNotificationsEnabled: f.OrderNotificationsEnabled || '',
    OrderNotifyConfirmations:  f.OrderNotifyConfirmations  || '',
    OrderNotifyChanges:        f.OrderNotifyChanges        || '',
    OrderNotifyUpdates:        f.OrderNotifyUpdates        || '',
    OrderContactId:            f.OrderContactId            || '',
    BatchId:    f.BatchId    || '',
    BuildingId: f.BuildingId || '',
    /* Renovations: aviso de materiales listos (MaterialsReadySeen: burbuja de Review; true en filas viejas sin la
       columna), hora de entrada y fecha esperada informativa. */
    ExpectedReadyDate: f.ExpectedReadyDate || '',
    MaterialsReady: yes(f.MaterialsReady),
    MaterialsReadySeen: f.MaterialsReadySeen === undefined ? true : yes(f.MaterialsReadySeen),
    EntryTime: f.EntryTime || '',
    AssignByService: yes(f.AssignByService)
  };
}

/* Solo la oficina. */
function officeFields(f) {
  return {
    RecurringServiceID: f.RecurringServiceID || '',     // su contrato de origen (Approvals)
    InspectionNotes:  f.InspectionNotes || '',
    InspectionContractID: f.InspectionContractID || '', // inspeccion de un contrato (lib/contract-inspection)
    HiddenFromClient: f.HiddenFromClient === true || f.HiddenFromClient === 'true' || f.HiddenFromClient === 'Yes',
    Technician:       f.Technician || '',
    InternalNotes:    f.InternalNotes || '',            // notas para supervisores: nunca al cliente
    TechMarkedComplete: yes(f.TechMarkedComplete),
    CompletedDate:    f.CompletedDate || ''
  };
}

/* Solo el cliente (la oficina los ve en su propia pantalla). */
function clientFields(f) {
  return {
    CustomerPO:        f.CustomerPO || '',
    NeedsOfficeAccess: yes(f.NeedsOfficeAccess),
    OfficeNeedNotes:   f.OfficeNeedNotes || '',
    VisitConfirmStatus: f.VisitConfirmStatus || '',     // confirmacion del dia antes
    VisitConfirmDate:   f.VisitConfirmDate || '',
    UnitOccupied:      yes(f.UnitOccupied)
  };
}

/* Historial que el cliente nunca recibe (ni en la respuesta). */
function clientMaySee(f) {
  return f.ChangeType !== 'Service Note' && f.ChangeType !== 'Internal Note' && f.ChangeType !== 'Rescheduled' &&
    f.FieldChanged !== 'Office Change (Internal)' &&
    !/^Key (Request|Answer|Escalated)$/.test(String(f.ChangeType || ''));
}

module.exports = function orderDetail(g, lqOf, pdfOf, opts) {
  opts = opts || {};
  const client = opts.audience === 'client';
  if (!['office', 'client'].includes(opts.audience)) throw new Error('order-detail: audience must be office or client');
  const lq = () => (typeof lqOf === 'function' ? lqOf() : lqOf);
  const pdf = () => (typeof pdfOf === 'function' ? pdfOf() : pdfOf);
  const byOrder = (list, id) => lq().fetchByField(list, 'OrderID', id);
  const notMine = (f, clientId) => clientId && String(f.ClientID || '').trim().toLowerCase() !== String(clientId).trim().toLowerCase();

  function draftResponse(draftRows, clientId) {
    const draftItem = draftRows.find(it => it.fields && !it.fields.ServiceName);
    if (!draftItem) return g.jsonResponse(404, { error: 'Draft not found.' });
    if (notMine(draftItem.fields, clientId)) return g.jsonResponse(403, { error: 'This draft does not belong to you.' });
    const f = draftItem.fields;
    const order = {
      id:              draftItem.id,
      createdDateTime: draftItem.createdDateTime || f.DraftDate || '',
      OrderID:         f.OrderID || f.Title || '',
      ClientID:        f.ClientID || '',
      BusinessName:    f.BusinessName || f.Title || '',
      Division:        f.Division || '',
      Status:          'Incomplete',
      DirtLevel:       f.DirtLevel || '',
      Services:        '',
      DraftData:       '',
      BuildingNumber:  f.BuildingNumber || '',
      UnitNumber:      f.UnitNumber || '',
      Bedrooms:        f.Bedrooms || '',
      Bathrooms:       f.Bathrooms || '',
      EntryDate:       f.EntryDate || '',
      DueDate:         f.DueDate || '',
      Address:         f.Address || '',
      Suite:           f.Suite || '',
      City:            f.City || '',
      Zip:             f.Zip || '',
      Contact:         f.Contact || '',
      Notes:           f.Notes || '',
      ServiceWindow:    f.ServiceWindow || '',
      DelayReasonType:  f.DelayReasonType || '',
      DelayReasonNotes: f.DelayReasonNotes || ''
    };
    if (client) Object.assign(order, {
      CustomerPO: f.CustomerPO || '', NeedsOfficeAccess: yes(f.NeedsOfficeAccess), OfficeNeedNotes: f.OfficeNeedNotes || '',
      UnitsData: f.UnitsData || ''
    });
    const services = draftRows
      .filter(it => it.fields && it.fields.ServiceName)
      .map(it => Object.assign({
        Category:    it.fields.Category    || '',
        ServiceName: it.fields.ServiceName || '',
        SubOption:   it.fields.SubOption   || '',
        Division:    it.fields.Division    || order.Division
      }, client ? { Level: it.fields.Level || '', Quantity: it.fields.Quantity || '' } : {}));
    return g.jsonResponse(200, { order, services, history: [] });
  }

  async function docOf(order, kind) {
    try {
      const found = await pdf().latestOrderPdf(order, kind);
      return found ? { name: found.name, revision: found.revision, webUrl: found.webUrl, driveItemId: found.id } : null;
    } catch (e) { return null; }
  }

  /* Who de "Order Details" para el cliente: nombres de quien inspecciona y de quien esta asignado, con su rol; el
     telefono SOLO de los supervisores (el de un tecnico nunca sale de aqui). */
  async function crewOf(order, serviceAssignments) {
    try {
      const names = [];
      const add = n => { n = String(n || '').trim(); if (n && !names.some(x => x.toLowerCase() === n.toLowerCase())) names.push(n); };
      String(order.Supervisor || '').split(/\s*[,;]\s*/).forEach(add);
      add(order.InspectionBy);
      serviceAssignments.forEach(a => String(a.AssignedTo || '').split(/\s*[,;]\s*/).forEach(add));
      if (!names.length) return [];
      const techs = await lq().fetchAllCached(g.TECHS_LIST || 'Techs');
      return names.map(name => {
        const t = techs.find(it => it.fields && (String(it.fields.FirstName || '').trim() + ' ' + String(it.fields.LastName || '').trim()).trim().toLowerCase() === name.toLowerCase());
        const role = t ? String(t.fields.Role || '') : '';
        return { name, role, phone: role === 'Supervisor' ? String((t && t.fields.Phone) || '') : '' };
      });
    } catch (e) { return []; }
  }

  async function handler(event) {
    if (event.httpMethod !== 'POST') return g.jsonResponse(405, { error: 'Method not allowed' });
    try {
      const body = JSON.parse(event.body || '{}');
      if (!body.orderId) return g.jsonResponse(400, { error: 'orderId is required' });
      const wanted = String(body.orderId);

      if (wanted.includes('-TEMP-')) return draftResponse(await byOrder(g.DRAFTS_LIST, wanted), body.clientId);

      const [orderRows, svcRows, histRows] = await Promise.all([
        byOrder(g.ORDERS_LIST, wanted),
        byOrder(g.ORDER_SERVICES_LIST, wanted),
        /* Repetidos (mismo cambio, misma persona, en menos de 60 s) se ensenan una vez (lib/history-dedupe). */
        byOrder(g.ORDER_HISTORY_LIST, wanted).then(dedupe)
      ]);
      /* "Assign by service" APARTE y no fatal: si falla (lista/columna nueva), la orden se ve sin su estatus por
         servicio, no deja de verse. */
      let assignmentRows = [];
      try { assignmentRows = await byOrder(g.SERVICE_ASSIGNMENTS_LIST, wanted); } catch (e) {
        console.error('get-order-detail: ServiceAssignments read failed (not fatal):', e && e.message);
      }

      const orderItem = orderRows.find(it => it.fields);
      if (!orderItem) return g.jsonResponse(404, { error: 'Order not found.' });
      if (client && internalInspection(orderItem.fields)) return g.jsonResponse(404, { error: 'Order not found.' });
      if (notMine(orderItem.fields, body.clientId)) return g.jsonResponse(403, { error: 'This order does not belong to you.' });

      const f = orderItem.fields;
      const order = Object.assign({ id: orderItem.id, createdDateTime: orderItem.createdDateTime || '' },
        commonFields(f), client ? clientFields(f) : officeFields(f));

      const services = svcRows.filter(it => it.fields).map(it => ({
        Category:    it.fields.Category    || '',
        ServiceName: it.fields.ServiceName || '',
        SubOption:   it.fields.SubOption   || '',
        Division:    it.fields.Division    || order.Division,
        Level:       it.fields.Level       || '',
        Quantity:    it.fields.Quantity    || '',
        /* Servicio no realizado + motivo */
        NotCompleted:       it.fields.NotCompleted === true || String(it.fields.NotCompleted) === 'true',
        NotCompletedReason: it.fields.NotCompletedReason || ''
      }));

      const history = histRows
        .filter(it => it.fields && (!client || clientMaySee(it.fields)))
        .sort((a, b) => String(a.createdDateTime || '').localeCompare(String(b.createdDateTime || '')))
        .map(it => ({
          Title:      it.fields.Title      || '',
          ChangeType: it.fields.ChangeType || '',
          ChangedBy:  it.fields.ChangedBy  || '',
          ChangeDate: it.fields.ChangeDate || it.createdDateTime || '',
          Notes:      it.fields.Notes      || '',
          FieldChanged: it.fields.FieldChanged || '',
          OldValue:   it.fields.OldValue   || '',
          NewValue:   it.fields.NewValue   || ''
        }));

      /* Solo para saber si el boton de Print va habilitado (el PDF se genera en get-order-document). Sin PDF, la
         orden todavia no ha sido aprobada. */
      const document = await docOf(order);

      if (client) {
        const serviceAssignments = assignmentRows.filter(it => it.fields).map(it => ({
          Category: it.fields.Category || '', ServiceName: it.fields.ServiceName || '',
          AssignedTo: it.fields.AssignedTo || '', ScheduledDate: it.fields.ScheduledDate || '',
          WorkStatus: it.fields.WorkStatus || 'Not Started'
        }));
        const crew = await crewOf(order, serviceAssignments);
        return g.jsonResponse(200, { order, services, history, document, serviceAssignments, crew });
      }

      /* Documento de completado (con fotos): solo si ya esta Completed. */
      const completionDocument = order.Status === 'Completed' ? await docOf(order, 'completion') : null;
      /* Mismo mapeo que get-service-assignments.js, para que Active pinte el estatus por servicio sin pedirlo aparte. */
      const serviceAssignments = assignmentRows.filter(it => it.fields).map(it => ({
        itemId: it.id,
        Category: it.fields.Category || '',
        ServiceName: it.fields.ServiceName || '',
        Sequence: it.fields.Sequence != null ? Number(it.fields.Sequence) : null,
        AssignedTo: it.fields.AssignedTo || '',
        ScheduledDate: it.fields.ScheduledDate || '',
        WorkStatus: it.fields.WorkStatus || 'Not Started',
        CompletedDate: it.fields.CompletedDate || '',
        /* Completado POR PERSONA: nombres, mismo formato que AssignedTo */
        DoneBy: it.fields.DoneBy || '', ConfirmedFor: it.fields.ConfirmedFor || ''
      })).sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));

      /* "Send to <empleado>" de la nota interna: a quien le llega y cuando se mando la ultima vez. */
      let crewNote = null;
      if (order.Supervisor && opts.crewNote) {
        try {
          const cn = opts.crewNote();
          crewNote = { to: await cn.recipients(order, '', { assignments: assignmentRows }), last: cn.lastSent(history) };
        } catch (e) { crewNote = null; }
      }
      return g.jsonResponse(200, { order, services, history, document, completionDocument, serviceAssignments, crewNote });
    } catch (err) {
      return g.jsonResponse(500, { error: err.message });
    }
  }

  return { handler, clientMaySee };
};
