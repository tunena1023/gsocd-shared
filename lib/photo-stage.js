/* ============================================================
   gsocd-shared/lib/photo-stage.js -- foto de "antes" o de "despues"
   POR FECHA (dueño 13/10/2026: "debe ir por fecha... en la fecha de
   inspeccion o antes es antes y todo lo del dia del servicio o despues
   es despues").

   - Tomada ANTES del dia del servicio -> 'inspection' (antes).
   - Tomada el dia del servicio o despues -> 'work' (despues).
   - La orden todavia sin dia de servicio -> todo es antes (no se ha
     trabajado), salvo que ya este completada sin dia (no se puede saber:
     se usa el prefijo insp- como antes).

   El momento de la foto sale de su nombre (AAAA-MM-DD_HHMMSS en UTC: cuando
   se TOMO, aunque se haya subido despues por falta de señal) y se pasa al
   dia de Iowa; si el nombre no trae fecha, la de SharePoint (createdAt).
   Dia del servicio: Orders.DispatchDate; si no tiene (por servicio), el
   primer dia programado que mande quien llama (firstScheduled).
   'inspection'/'work' son los nombres que ya usan gallery-groups y el PDF.

   Con inspección (CFO 22/10): si la orden tiene "Inspection done" (InspectionDoneAt), antes = lo tomado hasta esa
   hora y después = lo demás; mientras la inspección sigue abierta (Status 'Inspection') todo es antes. Con los datos
   reales (83 órdenes cerradas al 22/10) esto no deja ningún caso dudoso; la regla por día fallaba cuando la inspección
   y el trabajo son el mismo día. Sin inspección sigue la regla por día.
   Cuándo se tomó: opts.takenAt (TakenAt de TechPhotoLog: la fecha del archivo de una foto subida del teléfono o de la
   computadora) manda sobre la hora del nombre, que en esas fotos es cuando se subió.
============================================================ */
'use strict';

const TZ = 'America/Chicago';

function chicagoDay(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
/* Dia de una columna de fecha de SharePoint ('YYYY-MM-DD...'). */
function dayOf(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

/* El momento en que se tomó: takenAt si viene; si no, la hora del nombre (UTC); si no, createdAt. */
function takenMoment(name, createdAt, takenAt) {
  const t = takenAt ? new Date(takenAt) : null;
  if (t && !isNaN(t.getTime())) return t;
  const m = /(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(String(name || ''));
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : (createdAt ? new Date(createdAt) : null);
  return d && !isNaN(d.getTime()) ? d : null;
}
function takenDay(name, createdAt, takenAt) {
  const d = takenMoment(name, createdAt, takenAt);
  return d ? chicagoDay(d) : '';
}

function serviceDay(order, firstScheduled) {
  return dayOf(order && order.DispatchDate) || dayOf(firstScheduled) || '';
}

/* opts: { createdAt, firstScheduled, takenAt } */
function stageOf(name, order, opts) {
  const o = order || {};
  const op = opts || {};
  const legacy = /^insp-/i.test(String(name || '')) ? 'inspection' : 'work';
  const done = o.InspectionDoneAt ? new Date(o.InspectionDoneAt) : null;
  if (done && !isNaN(done.getTime())) {
    const t = takenMoment(name, op.createdAt, op.takenAt);
    return t ? (t <= done ? 'inspection' : 'work') : legacy;
  }
  if (String(o.Status || '') === 'Inspection') return 'inspection';
  const sd = serviceDay(o, op.firstScheduled);
  if (!sd) return (String(o.Status || '') === 'Completed' || dayOf(o.CompletedDate)) ? legacy : 'inspection';
  const td = takenDay(name, op.createdAt, op.takenAt);
  if (!td) return legacy;
  return td < sd ? 'inspection' : 'work';
}

/* El primer dia (YYYY-MM-DD) de una lista de fechas; '' si no hay. */
function firstDay(values) {
  return (values || []).map(dayOf).filter(Boolean).sort()[0] || '';
}

/* { OrderID: primer dia programado } de Scheduling (AssignedDate) y
   ServiceAssignments (ScheduledDate), para ordenes por servicio que no
   tienen DispatchDate. lq = lib/list-query del portal. */
async function firstScheduledByOrder(lq, orderIds) {
  const ids = (orderIds || []).filter(Boolean);
  if (!ids.length) return {};
  const [sched, sa] = await Promise.all([
    lq.fetchByValues('Scheduling', 'OrderID', ids).catch(() => []),
    lq.fetchByValues('ServiceAssignments', 'OrderID', ids).catch(() => [])
  ]);
  const days = {};
  const add = (oid, d) => { if (oid && d) (days[oid] = days[oid] || []).push(d); };
  sched.forEach(r => add((r.fields || {}).OrderID, (r.fields || {}).AssignedDate));
  sa.forEach(r => add((r.fields || {}).OrderID, (r.fields || {}).ScheduledDate));
  const out = {};
  Object.keys(days).forEach(oid => { out[oid] = firstDay(days[oid]); });
  return out;
}

module.exports = { stageOf, takenDay, takenMoment, serviceDay, firstDay, dayOf, firstScheduledByOrder };
