/* ============================================================
   lib/push.js -- notificaciones push (gratis, Web Push). Fabrica:
     const push = require('gsocd-shared/lib/push')(require('./graph'));
   Antes vivia solo en Admin (25/09/2026: avisos a los tecnicos). Desde
   27/09/2026 (dueño: "todo lo que sea gratis"; push para tecnicos Y
   clientes) esta aqui para que Orders tambien avise:
     - pushOrderDiff(antes, despues)  tecnicos: asignado / cambio /
       quitado / cancelado (igual que antes).
     - notifyTechs(orden, tipo, info) tecnicos: lo que hace el cliente
       con el lugar (listo, ya no, Yes/No del correo, ocupado).
     - pushClient({ order, recipient, category, title, body, url, tag })
       clientes: al celular de la PERSONA que recibe el correo de esa
       orden (PushSubscriptions.ClientID + ContactId), si no apago ese
       tipo de aviso en ese celular (MutedCategories).
   SMS: ver NOTES.md "Mensajes de texto (SMS) -- como conectarlo". No
   esta construido; seria otro canal junto a este.
   Nunca tumba nada: sin web-push, sin llaves VAPID o si falla un envio,
   se escribe en el log y sigue.
============================================================ */
/* Sin web-push instalado o sin llaves VAPID: no manda nada, nunca truena. */
let webpush = null;
try { webpush = require('web-push'); } catch (e) { webpush = null; }
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
let ENABLED = !!(webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
/* Llaves mal puestas (p. ej. valores de prueba): setVapidDetails lanza al
   cargar y tumbaria cualquier funcion que use notify. Asi solo se apaga
   el push y se avisa en el log. */
if (ENABLED) {
  try { webpush.setVapidDetails('mailto:orders@gsocd.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); }
  catch (e) { ENABLED = false; console.error('push: VAPID keys are not valid, push is off:', e.message); }
}
const TECHS_LIST = 'Techs', SCHEDULING_LIST = 'Scheduling', PUSH_SUBSCRIPTIONS_LIST = 'PushSubscriptions', SERVICE_ASSIGNMENTS_LIST = 'ServiceAssignments';

module.exports = function push(graph) {
const { graphFetch, siteListPath, deleteListItem } = graph;

const TIMEOUT_MS = 5000;
const low = s => String(s || '').trim().toLowerCase();
const names = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const withTimeout = (p, ms) => Promise.race([p, new Promise(res => setTimeout(res, ms))]);

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

/* ---------- textos ---------- */
function fmtDay(v, lang) {
  if (!v) return '';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/* kind: assigned | inspection | changed | removed | cancelled
   info: { date, window, what: [..], service } */
function message(kind, o, info, lang) {
  const es = lang === 'es';
  const id = o.OrderID || '';
  const unit = o.UnitNumber ? (es ? ' · Unidad ' : ' · Unit ') + o.UnitNumber : '';
  const place = (o.BusinessName || o.ClientID || '') + unit;
  const when = [fmtDay(info.date, lang), info.window || ''].filter(Boolean).join(' · ');
  const addr = o.Address || '';
  switch (kind) {
    case 'assigned':
      return {
        title: es ? 'Trabajo nuevo: ' + place : 'New job: ' + place,
        body: [when, addr, id].filter(Boolean).join('\n')
      };
    case 'inspection':
      return {
        title: es ? 'Inspección asignada: ' + place : 'Inspection assigned: ' + place,
        body: [when, addr, id].filter(Boolean).join('\n')
      };
    case 'changed': {
      const LBL = es
        ? { date: 'Fecha nueva', window: 'Horario nuevo', address: 'Dirección nueva', services: 'Cambiaron los servicios', inspection: 'Inspección cambiada' }
        : { date: 'New date', window: 'New time', address: 'New address', services: 'Services changed', inspection: 'Inspection changed' };
      const lines = (info.what || []).map(w =>
        w === 'date' ? LBL.date + ': ' + fmtDay(info.date, lang)
          : w === 'window' ? LBL.window + ': ' + (info.window || '')
            : w === 'address' ? LBL.address + ': ' + addr
              : LBL[w] || w);
      return {
        title: es ? 'Cambio en tu trabajo: ' + place : 'Job changed: ' + place,
        body: lines.concat([id]).filter(Boolean).join('\n')
      };
    }
    case 'removed':
      return {
        title: es ? 'Ya no tienes este trabajo: ' + place : 'Job removed: ' + place,
        body: [es ? 'La oficina te quitó de esta orden.' : 'The office took you off this order.', when, id].filter(Boolean).join('\n')
      };
    case 'cancelled':
      return {
        title: es ? 'Trabajo cancelado: ' + place : 'Job cancelled: ' + place,
        body: [es ? 'No vayas: la orden se canceló.' : 'Do not go: this order was cancelled.', when, id].filter(Boolean).join('\n')
      };
    default:
      return { title: 'GS Solutions', body: id };
  }
}

/* ---------- a quien ---------- */
function techKey(t) { return String(t.fields.PayrollID || '').trim() || ('tech:' + t.id); }
function fullName(t) { return low((t.fields.FirstName || '') + ' ' + (t.fields.LastName || '')); }

/* people: [{ name } | { payroll }] -> renglones de Techs (sin repetir) */
function resolveTechs(techs, people) {
  const out = new Map();
  people.forEach(p => {
    const hit = techs.find(t => {
      if (!t.fields) return false;
      if (p.payroll) return low(p.payroll) === low(t.fields.PayrollID) || low(p.payroll) === low('tech:' + t.id);
      return p.name && fullName(t) === low(p.name);
    });
    if (hit) out.set(hit.id, hit);
  });
  return [...out.values()];
}

async function sendTo(tech, kind, order, info) {
  const lang = low(tech.fields.Language) === 'es' ? 'es' : 'en';
  const role = String(tech.fields.Role || 'Employee');
  const msg = message(kind, order, info, lang);
  const payload = JSON.stringify(Object.assign(msg, {
    url: (role === 'Supervisor' || role === 'Developer') ? '/supervisor.html' : '/employee.html',
    /* Mismo tag por orden: varias pushes seguidas (p. ej. 3 servicios
       asignados uno por uno) se reemplazan en vez de amontonarse. */
    tag: (order.OrderID || 'gs') + '-' + kind
  }));
  const subs = await fetchAll(PUSH_SUBSCRIPTIONS_LIST, `fields/PayrollID eq '${techKey(tech).replace(/'/g, "''")}'`);
  await Promise.all(subs.map(row => sendOne(row, payload)));
  return subs.length;
}

/* sends: [{ people: [{name}|{payroll}], kind, info }] */
async function deliver(order, sends) {
  if (!ENABLED || !sends.length) return;
  try {
    const techs = await fetchAll(TECHS_LIST);
    const jobs = [];
    const done = new Set();
    sends.forEach(s => resolveTechs(techs, s.people).forEach(t => {
      const k = t.id + '|' + s.kind;
      if (done.has(k)) return;
      done.add(k);
      jobs.push(sendTo(t, s.kind, order, s.info || {}).then(n => console.log('push:', s.kind, order.OrderID, fullName(t), n + ' device(s)')));
    }));
    await withTimeout(Promise.allSettled(jobs), TIMEOUT_MS);
  } catch (e) {
    console.error('push: deliver failed', e.message);
  }
}

/* ---------- que cambio ---------- */
const INSP_STATUSES = ['Inspection'];

/* before/after: campos de la orden (after = before + patch).
   opts.saBefore/saAfter: nombres de ServiceAssignments (AssignByService).
   opts.servicesChanged: la lista de servicios cambio.
   opts.schedulingPayrolls: PayrollNumbers de Scheduling (primera asignacion). */
function planOrderDiff(before, after, opts) {
  opts = opts || {};
  const sends = [];
  const workBefore = new Set(names(before.Supervisor).concat(opts.saBefore || []).map(low));
  const workAfter = new Set(names(after.Supervisor).concat(opts.saAfter || []).map(low));
  const inspBefore = INSP_STATUSES.includes(before.Status) ? low(before.InspectionBy) : '';
  const inspAfter = INSP_STATUSES.includes(after.Status) ? low(after.InspectionBy) : '';
  const nameOf = new Map();
  names(before.Supervisor).concat(names(after.Supervisor), opts.saBefore || [], opts.saAfter || [], [before.InspectionBy || '', after.InspectionBy || ''])
    .forEach(n => { if (n) nameOf.set(low(n), n); });
  const P = arr => arr.filter(Boolean).map(n => ({ name: nameOf.get(n) || n }));
  const workInfo = o => ({ date: o.DispatchDate, window: o.ServiceWindow });
  const inspInfo = o => ({ date: o.InspectionDate, window: o.InspectionWindow });

  if (after.Status === 'Cancelled' && before.Status !== 'Cancelled') {
    sends.push({ people: P([...workBefore, inspBefore]), kind: 'cancelled', info: workInfo(before) });
    return sends;
  }

  /* Trabajo */
  const added = [...workAfter].filter(n => !workBefore.has(n));
  const removed = [...workBefore].filter(n => !workAfter.has(n));
  const stayed = [...workAfter].filter(n => workBefore.has(n));
  if (added.length) {
    const people = P(added).concat((opts.schedulingPayrolls || []).map(p => ({ payroll: p })));
    sends.push({ people, kind: 'assigned', info: workInfo(after) });
  }
  if (removed.length) sends.push({ people: P(removed), kind: 'removed', info: workInfo(before) });
  if (stayed.length) {
    const what = [];
    if (String(before.DispatchDate || '').slice(0, 10) !== String(after.DispatchDate || '').slice(0, 10) && after.DispatchDate) what.push('date');
    if (String(before.ServiceWindow || '') !== String(after.ServiceWindow || '') && after.ServiceWindow) what.push('window');
    if (String(before.Address || '') !== String(after.Address || '')) what.push('address');
    if (opts.servicesChanged) what.push('services');
    if (what.length) sends.push({ people: P(stayed), kind: 'changed', info: Object.assign(workInfo(after), { what }) });
  }

  /* Inspeccion */
  if (inspAfter && inspAfter !== inspBefore) sends.push({ people: P([inspAfter]), kind: 'inspection', info: inspInfo(after) });
  if (inspBefore && inspBefore !== inspAfter && !(after.Status === 'Inspected')) {
    sends.push({ people: P([inspBefore]), kind: 'removed', info: inspInfo(before) });
  }
  if (inspAfter && inspAfter === inspBefore) {
    const what = [];
    if (String(before.InspectionDate || '').slice(0, 10) !== String(after.InspectionDate || '').slice(0, 10)) what.push('date');
    if (String(before.InspectionWindow || '') !== String(after.InspectionWindow || '')) what.push('window');
    if (what.length) sends.push({ people: P([inspAfter]), kind: 'changed', info: Object.assign(inspInfo(after), { what: ['inspection'].concat(what) }) });
  }
  return sends;
}

async function pushOrderDiff(before, after, opts) {
  try {
    const order = Object.assign({}, before, after);
    await deliver(order, planOrderDiff(before, after, opts));
  } catch (e) {
    console.error('push: pushOrderDiff failed', e.message);
  }
}

/* PayrollNumbers de Scheduling de una orden (para la primera asignacion). */
async function schedulingPayrolls(orderId) {
  try {
    const rows = await fetchAll(SCHEDULING_LIST, `fields/OrderID eq '${String(orderId).replace(/'/g, "''")}'`);
    return [...new Set(rows.map(r => String((r.fields && r.fields.PayrollNumber) || '').trim()).filter(Boolean))];
  } catch (e) { return []; }
}

/* Nombres en ServiceAssignments de una orden (Assign by service). */
async function serviceAssignees(orderId) {
  try {
    const rows = await fetchAll(SERVICE_ASSIGNMENTS_LIST, `fields/OrderID eq '${String(orderId).replace(/'/g, "''")}'`);
    return [...new Set(rows.flatMap(r => names(r.fields && r.fields.AssignedTo)))];
  } catch (e) { return []; }
}


/* ---------- lo que hace el cliente con el lugar (27/09/2026) ---------- */
/* kind: ready | not-ready | visit-yes | visit-no | occupied */
function readinessMessage(kind, o, info, lang) {
  const es = lang === 'es';
  const unit = o.UnitNumber ? (es ? ' · Unidad ' : ' · Unit ') + o.UnitNumber : '';
  const place = (o.BusinessName || o.ClientID || '') + unit;
  const id = o.OrderID || '';
  const when = [fmtDay(info.date, lang), info.time || ''].filter(Boolean).join(' · ');
  const note = info.note ? '"' + info.note + '"' : '';
  switch (kind) {
    case 'ready': return { title: (es ? 'Lugar listo: ' : 'Site ready: ') + place, body: [when ? (es ? 'Listo desde ' : 'Ready from ') + when : '', id].filter(Boolean).join('\n') };
    case 'not-ready': return { title: (es ? 'Ya no está listo: ' : 'Site no longer ready: ') + place, body: [es ? 'El cliente quitó "listo". Espera a la oficina.' : 'The client turned off "ready". Wait for the office.', note, id].filter(Boolean).join('\n') };
    case 'visit-yes': return { title: (es ? 'Confirmado listo: ' : 'Confirmed ready: ') + place, body: [fmtDay(info.date, lang), id].filter(Boolean).join('\n') };
    case 'visit-no': return { title: (es ? 'El cliente dice que no está listo: ' : 'Client says not ready: ') + place, body: [fmtDay(info.date, lang), note, es ? 'La oficina te avisa.' : 'The office will let you know.', id].filter(Boolean).join('\n') };
    case 'occupied': return { title: (es ? 'Unidad ocupada: ' : 'Occupied unit: ') + place, body: [es ? 'El cliente dice que alguien vive ahí.' : 'The client says someone lives there.', id].filter(Boolean).join('\n') };
    default: return { title: 'GS Solutions', body: id };
  }
}
async function sendReadiness(tech, kind, order, info) {
  const lang = low(tech.fields.Language) === 'es' ? 'es' : 'en';
  const role = String(tech.fields.Role || 'Employee');
  const payload = JSON.stringify(Object.assign(readinessMessage(kind, order, info, lang), {
    url: (role === 'Supervisor' || role === 'Developer') ? '/supervisor.html' : '/employee.html',
    tag: (order.OrderID || 'gs') + '-site'
  }));
  const subs = await fetchAll(PUSH_SUBSCRIPTIONS_LIST, `fields/PayrollID eq '${techKey(tech).replace(/'/g, "''")}'`);
  await Promise.all(subs.map(row => sendOne(row, payload)));
  return subs.length;
}
/* Quien trabaja la orden: Supervisor (toda la orden), los de Assign by
   service que no han terminado, y el de la inspeccion si esta en eso. */
async function crewOf(order) {
  const people = names(order.Supervisor);
  try {
    const rows = await fetchAll(SERVICE_ASSIGNMENTS_LIST, `fields/OrderID eq '${String(order.OrderID || '').replace(/'/g, "''")}'`);
    rows.forEach(r => { const f = r.fields || {}; if (String(f.WorkStatus || '') !== 'Completed') people.push(...names(f.AssignedTo)); });
  } catch (e) { /* sin ServiceAssignments: solo Supervisor */ }
  if (order.Status === 'Inspection' && order.InspectionBy) people.push(order.InspectionBy);
  return [...new Set(people.map(low))].map(n => ({ name: n }));
}
async function notifyTechs(order, kind, info) {
  if (!ENABLED || !order || !order.OrderID) return;
  try {
    const [techs, people] = await Promise.all([fetchAll(TECHS_LIST), crewOf(order)]);
    const jobs = resolveTechs(techs, people).map(t =>
      sendReadiness(t, kind, order, info || {}).then(n => console.log('push:', kind, order.OrderID, fullName(t), n + ' device(s)')));
    await withTimeout(Promise.allSettled(jobs), TIMEOUT_MS);
  } catch (e) {
    console.error('push: notifyTechs failed', e.message);
  }
}

/* ---------- clientes (27/09/2026) ---------- */
async function sendOne(row, payload) {
  const f = row.fields || {};
  if (!f.Endpoint) return;
  try {
    await webpush.sendNotification({ endpoint: f.Endpoint, keys: { p256dh: f.P256dh, auth: f.Auth } }, payload, { TTL: 24 * 3600 });
  } catch (e) {
    if (e.statusCode === 410 || e.statusCode === 404) await deleteListItem(PUSH_SUBSCRIPTIONS_LIST, row.id).catch(() => {});
    else console.error('push: send failed', e.statusCode || '', e.message);
  }
}
/* recipient: el mismo que escogio el correo ({ contactId } -- un id de
   ClientContacts, o 'account' para el telefono/correo de la cuenta). */
async function pushClient(opts) {
  const o = (opts && opts.order) || {};
  const r = (opts && opts.recipient) || {};
  if (!ENABLED || !o.ClientID || !r.contactId) return 0;
  try {
    const rows = await fetchAll(PUSH_SUBSCRIPTIONS_LIST, `fields/ClientID eq '${String(o.ClientID).replace(/'/g, "''")}'`);
    const mine = rows.filter(row => {
      const f = row.fields || {};
      if (String(f.ContactId || '') !== String(r.contactId)) return false;
      const muted = String(f.MutedCategories || '').split(',').map(s => s.trim()).filter(Boolean);
      return !(opts.category && muted.includes(opts.category));
    });
    if (!mine.length) return 0;
    const payload = JSON.stringify({ title: opts.title || 'GS Solutions', body: opts.body || '', url: opts.url || '/customer.html', tag: opts.tag || ((o.OrderID || 'gs') + '-client') });
    await withTimeout(Promise.allSettled(mine.map(row => sendOne(row, payload))), TIMEOUT_MS);
    console.log('push: client', o.ClientID, r.contactId, mine.length + ' device(s)');
    return mine.length;
  } catch (e) {
    console.error('push: pushClient failed', e.message);
    return 0;
  }
}

return { ENABLED, pushOrderDiff, planOrderDiff, message, schedulingPayrolls, serviceAssignees, notifyTechs, readinessMessage, pushClient };
};

