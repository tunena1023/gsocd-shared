/* ============================================================
   lib/site-readiness.js -- "el lugar esta listo" (27/09/2026, dueño).
   UNA sola pieza para Orders y Admin, igual que lib/order-pdf.js:

     module.exports = require('gsocd-shared/lib/site-readiness')(require('./graph'), require('./notify'));

   Reglas que pidio el dueño:
   - El cliente marca el lugar como listo (switch Unit/Materials ready o
     "Yes" en la confirmacion del dia antes) -> correo a la oficina, siempre.
   - Apaga el switch: si llevaba MENOS de 24 h prendido fue por error (no
     pasa nada); si llevaba mas de 24 h y YA hay tecnico programado ->
     aviso en Review (Orders.ReadinessAlert) + correo a la oficina.
   - Su fecha de listo queda DESPUES del dia del tecnico -> aviso + correo.
   - Un dia habil antes de la visita (sabado, domingo y lunes -> el
     viernes) se le pregunta al cliente si el lugar esta listo. Toda orden
     con visita, de cualquier division, menos las visitas de contratos
     recurrentes. No se pregunta si ya marco listo con fecha igual o
     antes de la visita. "No" -> aviso + correo. Sin respuesta al
     mediodia -> aviso + correo.
   - Volver a prender el switch pide fecha y hora nuevas: al apagarlo se
     borran ExpectedReadyDate y EntryTime.

   Columnas en Orders (las creo el dueño, 27/09/2026): ReadySince,
   VisitCheckSentAt, VisitConfirmDate (solo fecha), VisitConfirmStatus
   (Pending | Yes | No | NoAnswer), VisitConfirmAt, VisitConfirmNote,
   ReadinessAlert (not-ready | late-ready | visit-no | no-answer),
   ReadinessAlertAt, ReadinessAlertNote.
============================================================ */
'use strict';

const TZ = 'America/Chicago';
const DAY_MS = 24 * 3600 * 1000;
const CLOSED = ['Completed', 'Cancelled', 'Incomplete'];

/* 'YYYY-MM-DD' del dia en Iowa (la oficina) para una fecha/hora. */
function chicagoDay(v) {
  const d = v instanceof Date ? v : new Date(v || Date.now());
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
/* Dia de una columna de fecha de SharePoint ('YYYY-MM-DD', 'YYYY-MM-DDT12:00:00Z',
   o solo-fecha que Graph regresa como 'YYYY-MM-DDT05:00:00Z'). */
function dayOf(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(day) { return new Date(day + 'T12:00:00Z').getUTCDay(); } // 0 domingo .. 6 sabado

/* Que visitas se le preguntan HOY: lunes a jueves -> manana; viernes ->
   sabado, domingo y lunes; sabado y domingo -> nada (ya se pregunto el viernes). */
function targetDaysFor(today) {
  const w = weekday(today);
  if (w >= 1 && w <= 4) return [addDays(today, 1)];
  if (w === 5) return [addDays(today, 1), addDays(today, 2), addDays(today, 3)];
  return [];
}

function isRecurringVisit(f) {
  return !!String(f.RecurringServiceID || '').trim() || /-REC\d+$/i.test(String(f.OrderID || f.Title || ''));
}
function truthy(v) { return v === true || v === 'true'; }

module.exports = function siteReadiness(graph, notify) {
  /* Push a la cuadrilla (27/09/2026): lo que hace el cliente con el lugar. */
  const push = require('./push')(graph);
  const tech = (f, kind, info) => push.notifyTechs(Object.assign({}, f, { OrderID: f.OrderID || f.Title }), kind, info).catch(() => {});
  const {
    ORDERS_LIST, ORDER_HISTORY_LIST, CLIENTS_LIST, SERVICE_ASSIGNMENTS_LIST,
    graphFetch, siteListPath, createListItem, updateListItemByItemId
  } = graph;

  async function fetchWhere(listName, filter) {
    let url = siteListPath(listName) + '?$expand=fields&$top=500' + (filter ? '&$filter=' + encodeURIComponent(filter) : '');
    const out = [];
    while (url) {
      const data = await graphFetch(url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
      out.push(...(data.value || []));
      url = data['@odata.nextLink'] || null;
    }
    return out.filter(it => it.fields);
  }
  const q = s => String(s).replace(/'/g, "''");

  async function assignmentsOf(orderId) {
    if (!SERVICE_ASSIGNMENTS_LIST || !orderId) return [];
    try { return (await fetchWhere(SERVICE_ASSIGNMENTS_LIST, `fields/OrderID eq '${q(orderId)}'`)).map(it => it.fields); }
    catch (e) { return []; }
  }

  /* Dias de visita de una orden: DispatchDate (toda la orden) y, por
     servicio, los ScheduledDate que falten por completar. */
  function visitDays(f, assignments) {
    const days = new Set();
    const d = dayOf(f.DispatchDate);
    if (d && String(f.Supervisor || '').trim()) days.add(d);
    (assignments || []).forEach(a => {
      const sd = dayOf(a.ScheduledDate);
      if (sd && String(a.AssignedTo || '').trim() && String(a.WorkStatus || '') !== 'Completed') days.add(sd);
    });
    return [...days].sort();
  }
  /* La proxima visita (hoy o despues), o '' si no hay tecnico programado. */
  async function nextVisitDay(f, today) {
    const days = visitDays(f, f.AssignByService === true || f.AssignByService === 'true' ? await assignmentsOf(f.OrderID || f.Title) : []);
    return days.find(x => x >= (today || chicagoDay())) || '';
  }

  async function clientContact(clientId) {
    try {
      const rows = await fetchWhere(CLIENTS_LIST, `fields/ClientID eq '${q(clientId)}'`);
      const c = rows[0] ? rows[0].fields : {};
      return [c.ClientName || '', c.Phone || ''].filter(Boolean).join(' · ');
    } catch (e) { return ''; }
  }

  async function history(orderId, row) {
    try {
      await createListItem(ORDER_HISTORY_LIST, Object.assign({ Title: orderId + '-readiness', OrderID: orderId, ChangeDate: new Date().toISOString() }, row));
    } catch (e) { /* el historial nunca bloquea */ }
  }

  function office(order, kind, extra) {
    if (!notify || !notify.notifyOffice) return Promise.resolve(null);
    return notify.notifyOffice(graph, Object.assign({ event: 'site-readiness', kind, order }, extra || {}));
  }

  /* Campos que se limpian cuando la visita cambia (se reprograma o se
     quita el tecnico): empieza un ciclo nuevo de confirmacion. */
  const RESET_VISIT = {
    VisitCheckSentAt: null, VisitConfirmDate: null, VisitConfirmStatus: null,
    VisitConfirmAt: null, VisitConfirmNote: null,
    ReadinessAlert: null, ReadinessAlertAt: null, ReadinessAlertNote: null
  };

  /* ---------- Switch prendido (Orders set-materials-ready) ----------
     f = campos de la orden YA con ExpectedReadyDate/EntryTime nuevos.
     Regresa el patch extra para la orden; manda los correos. */
  async function onReadyOn(f, opts) {
    const o = opts || {};
    const now = o.now || new Date().toISOString();
    const orderId = f.OrderID || f.Title;
    const patch = {};
    if (!o.wasReady || !f.ReadySince) patch.ReadySince = now;
    const readyDay = dayOf(f.ExpectedReadyDate);
    const visit = await nextVisitDay(f, chicagoDay(now));
    const late = !!(visit && readyDay && readyDay > visit);
    const contact = await clientContact(f.ClientID);
    const mail = { visitDate: visit || '', readyDate: readyDay || '', readyTime: fmt12(f.EntryTime), contact };
    if (late) {
      if (f.ReadinessAlert !== 'late-ready') {
        Object.assign(patch, { ReadinessAlert: 'late-ready', ReadinessAlertAt: now, ReadinessAlertNote: null });
        await office(f, 'late-ready', mail);
      }
    } else {
      /* Ya no llega tarde (movio la fecha antes): se quita ese aviso. */
      if (f.ReadinessAlert === 'late-ready') Object.assign(patch, { ReadinessAlert: null, ReadinessAlertAt: null, ReadinessAlertNote: null });
      /* "Siempre que el cliente marque el lugar listo se avisa": al
         prenderlo. Re-guardar fecha/hora con el switch ya prendido no
         vuelve a mandar correo. */
      if (!o.wasReady) {
        await office(f, 'ready', mail);
        await tech(f, 'ready', { date: readyDay, time: fmt12(f.EntryTime) });
      }
      /* Listo para la visita que se le pregunto: cuenta como "Yes". */
      if (f.VisitConfirmStatus === 'Pending' && dayOf(f.VisitConfirmDate) && readyDay && readyDay <= dayOf(f.VisitConfirmDate)) {
        Object.assign(patch, { VisitConfirmStatus: 'Yes', VisitConfirmAt: now });
        if (f.ReadinessAlert === 'no-answer') Object.assign(patch, { ReadinessAlert: null, ReadinessAlertAt: null, ReadinessAlertNote: null });
      }
    }
    return patch;
  }

  /* ---------- Lista desde que se crea (05/10/2026) ----------
     Un cliente pidio poder marcar "Unit ready" (o "Materials ready") al
     crear la orden, no despues. src = { ready, date 'YYYY-MM-DD', time
     'HH:MM', occupied }. Solo Janitorial y Renovations (como el switch de
     Processing). La fecha de listo es tambien la Entry date (la pantalla
     las amarra). Regresa los campos para el renglon nuevo de Orders. */
  function readyFieldsAtCreate(src, division) {
    const div = String(division || '').toLowerCase();
    if (div !== 'janitorial' && div !== 'renovations') return {};
    const s = src || {};
    const out = {};
    if (s.occupied === true || s.occupied === 'true') out.UnitOccupied = true;
    const date = dayOf(s.date), time = /^\d{1,2}:\d{2}$/.test(String(s.time || '')) ? String(s.time) : '';
    if ((s.ready === true || s.ready === 'true') && date && time) {
      Object.assign(out, { MaterialsReady: true, MaterialsReadySeen: false, ExpectedReadyDate: date, EntryTime: time });
    }
    return out;
  }
  /* Ya creada la orden con esos campos: el mismo historial y los mismos
     avisos que cuando el cliente prende el switch en Processing. */
  async function onCreatedReady(itemId, f, actor) {
    if (!(f.MaterialsReady === true)) return {};
    const orderId = f.OrderID || f.Title;
    const now = new Date().toISOString();
    await createListItem(ORDER_HISTORY_LIST, { Title: orderId + '-ready', OrderID: orderId, ChangeType: 'Materials Ready', ChangedBy: actor, ChangeDate: now, Notes: '', NewValue: f.EntryTime || '' });
    await createListItem(ORDER_HISTORY_LIST, { Title: orderId + '-readydate', OrderID: orderId, ChangeType: 'Expected Ready Date', ChangedBy: actor, ChangeDate: now, Notes: '', NewValue: dayOf(f.ExpectedReadyDate) });
    const patch = await onReadyOn(f, { wasReady: false, now });
    if (Object.keys(patch).length && itemId) await updateListItemByItemId(ORDERS_LIST, itemId, patch);
    return patch;
  }

  /* ---------- Switch apagado ---------- */
  async function onReadyOff(f, opts) {
    const o = opts || {};
    const now = o.now || new Date().toISOString();
    /* Fecha y hora nuevas la proxima vez que lo prenda. */
    const patch = { ExpectedReadyDate: null, EntryTime: null, ReadySince: null };
    /* La cuadrilla siempre se entera (aunque para la oficina, dentro de
       24 h, sea un error sin alerta). */
    if (f.ReadySince || f.MaterialsReady) await tech(f, 'not-ready', { note: o.note || '' });
    const since = f.ReadySince ? new Date(f.ReadySince).getTime() : NaN;
    const heldOver24h = !isNaN(since) && (new Date(now).getTime() - since) >= DAY_MS;
    if (!heldOver24h) return { patch, alerted: false };
    const visit = await nextVisitDay(f, chicagoDay(now));
    if (!visit) return { patch, alerted: false };
    Object.assign(patch, { ReadinessAlert: 'not-ready', ReadinessAlertAt: now, ReadinessAlertNote: o.note || null });
    await office(f, 'not-ready', { visitDate: visit, note: o.note || '', contact: await clientContact(f.ClientID) });
    return { patch, alerted: true };
  }

  /* ---------- Respuesta del dia antes (Orders confirm-visit) ---------- */
  async function answerVisit(f, opts) {
    const o = opts || {};
    const now = o.now || new Date().toISOString();
    const visit = dayOf(f.VisitConfirmDate);
    const contact = await clientContact(f.ClientID);
    if (o.ready) {
      const patch = { VisitConfirmStatus: 'Yes', VisitConfirmAt: now, VisitConfirmNote: null };
      if (f.ReadinessAlert === 'no-answer' || f.ReadinessAlert === 'visit-no') Object.assign(patch, { ReadinessAlert: null, ReadinessAlertAt: null, ReadinessAlertNote: null });
      await office(f, 'ready', { visitDate: visit, contact, via: 'visit' });
      await tech(f, 'visit-yes', { date: visit });
      await history(f.OrderID || f.Title, { ChangeType: 'Site Ready Confirmed', ChangedBy: f.ClientID || '', NewValue: visit });
      return patch;
    }
    const note = String(o.note || '').trim();
    const patch = { VisitConfirmStatus: 'No', VisitConfirmAt: now, VisitConfirmNote: note, ReadinessAlert: 'visit-no', ReadinessAlertAt: now, ReadinessAlertNote: note };
    await office(f, 'visit-no', { visitDate: visit, note, contact });
    await tech(f, 'visit-no', { date: visit, note });
    await history(f.OrderID || f.Title, { ChangeType: 'Site Not Ready Reported', ChangedBy: f.ClientID || '', Notes: note, NewValue: visit });
    return patch;
  }

  /* ---------- Cron de la manana: correo del dia antes ---------- */
  async function morning(opts) {
    const now = (opts && opts.now) || new Date().toISOString();
    const today = chicagoDay(now);
    const targets = targetDaysFor(today);
    const out = { today, targets, sent: [], skipped: [] };
    if (!targets.length) return out;
    /* Solo las abiertas (29/09/2026, dueño: "en lugar de leer todo..."): las
       completadas crecen sin parar y nunca reciben este correo. Status esta
       indexada; CLOSED se sigue revisando abajo. */
    const rows = await fetchWhere(ORDERS_LIST, "fields/Status ne 'Completed'");
    for (const it of rows) {
      const f = it.fields;
      const orderId = f.OrderID || f.Title;
      if (!orderId || CLOSED.includes(String(f.Status || '')) || isRecurringVisit(f)) continue;
      const assigns = truthy(f.AssignByService) ? await assignmentsOf(orderId) : [];
      const visit = visitDays(f, assigns).find(d => targets.includes(d));
      if (!visit) continue;
      if (dayOf(f.VisitConfirmDate) === visit && f.VisitCheckSentAt) { out.skipped.push({ orderId, why: 'already asked' }); continue; }
      const readyDay = dayOf(f.ExpectedReadyDate);
      if (truthy(f.MaterialsReady) && readyDay && readyDay <= visit) { out.skipped.push({ orderId, why: 'already ready' }); continue; }
      const res = notify && notify.notifyClient
        ? await notify.notifyClient(graph, { event: 'visit-check', order: Object.assign({}, f, { OrderID: orderId }), visitDate: visit })
        : null;
      await updateListItemByItemId(ORDERS_LIST, it.id, {
        VisitCheckSentAt: now, VisitConfirmDate: visit, VisitConfirmStatus: 'Pending', VisitConfirmAt: null, VisitConfirmNote: null
      });
      out.sent.push({ orderId, visit, mail: res && (res.sent ? 'sent' : (res.skipped || res.error || '')) });
    }
    return out;
  }

  /* ---------- Cron del mediodia: quien no contesto ---------- */
  async function noon(opts) {
    const now = (opts && opts.now) || new Date().toISOString();
    const today = chicagoDay(now);
    const out = { today, flagged: [] };
    const rows = await fetchWhere(ORDERS_LIST, "fields/VisitConfirmStatus eq 'Pending'");
    for (const it of rows) {
      const f = it.fields;
      const orderId = f.OrderID || f.Title;
      if (CLOSED.includes(String(f.Status || ''))) continue;
      if (chicagoDay(f.VisitCheckSentAt) !== today) continue; // solo lo que se pregunto hoy
      const visit = dayOf(f.VisitConfirmDate);
      if (!visit || visit < today) continue;
      const patch = { VisitConfirmStatus: 'NoAnswer' };
      if (!f.ReadinessAlert) Object.assign(patch, { ReadinessAlert: 'no-answer', ReadinessAlertAt: now, ReadinessAlertNote: null });
      await updateListItemByItemId(ORDERS_LIST, it.id, patch);
      await office(Object.assign({}, f, { OrderID: orderId }), 'no-answer', { visitDate: visit, contact: await clientContact(f.ClientID) });
      out.flagged.push(orderId);
    }
    return out;
  }

  /* Orders save-unit-occupied: el cliente dice que alguien vive ahi. */
  async function onOccupied(f) { await tech(f, 'occupied', {}); }

  return {
    onOccupied,
    chicagoDay, dayOf, targetDaysFor, visitDays, nextVisitDay,
    RESET_VISIT, onReadyOn, onReadyOff, readyFieldsAtCreate, onCreatedReady, answerVisit, morning, noon
  };
};

function fmt12(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Number(m[1]);
  return ((h % 12) || 12) + ':' + m[2] + ' ' + (h >= 12 ? 'PM' : 'AM');
}
module.exports.chicagoDay = chicagoDay;
module.exports.targetDaysFor = targetDaysFor;
