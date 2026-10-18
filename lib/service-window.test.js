/* Visitas recurrentes con solo la hora de inicio (dueña 18/10/2026: sin hora de salida; ServiceWindow = "6:00 PM").
   Lo que lee ServiceWindow la entiende y la ensena como inicio; un rango ("8:00 AM - 11:00 AM") se queda igual.
   Uso: node lib/service-window.test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let fails = 0;
function assert(name, cond, info) { if (cond) console.log('OK   - ' + name); else { fails++; console.log('FAIL - ' + name, info !== undefined ? JSON.stringify(info) : ''); } }

/* Tarjetas (order-details): "Starts 6:00 PM"; el rango igual que antes. */
const sb = { document: { head: { appendChild() {} }, createElement: () => ({}), getElementById: () => null } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'order-details', 'order-details.js'), 'utf8'), sb);
const sw = sb.GSOrderDetails.shortWindow;
assert('order-details: one time -> "Starts 6:00 PM"', sw('6:00 PM') === 'Starts 6:00 PM', sw('6:00 PM'));
assert('order-details: lower case pm too', sw('7:30 am') === 'Starts 7:30 AM', sw('7:30 am'));
assert('order-details: a range stays a range', sw('8:00 AM - 11:00 AM') === '8:00–11:00 AM' && sw('11:00 AM - 2:00 PM') === '11:00 AM–2:00 PM', [sw('8:00 AM - 11:00 AM'), sw('11:00 AM - 2:00 PM')]);
assert('order-details: empty stays empty', sw('') === '' && sw(null) === '');
const card = sb.GSOrderDetails.html({ OrderID: 'GS-1-REC1', Status: 'Recurring Scheduled', DispatchDate: '2026-10-20T12:00:00Z', ServiceWindow: '6:00 PM', Supervisor: 'Ana Lopez' }, {});
assert('order-details: the card says Starts 6:00 PM', /Starts 6:00 PM/.test(card), card.slice(0, 400));

/* Board y llegadas (schedule-entries): el inicio es la hora; sin hora de salida en el texto. */
const E = require('./schedule-entries');
const t1 = E.windowTimes('6:00 PM'), t2 = E.windowTimes('8:00 AM - 11:00 AM');
assert('schedule-entries: one time -> start 18:00, no end', t1.start === '18:00' && t1.end === '', t1);
assert('schedule-entries: a range keeps both ends', t2.start === '08:00' && t2.end === '11:00', t2);

/* Las entradas del dia: una visita recurrente con solo la hora no inventa salida; una orden normal se queda igual. */
const svc = { Category: 'Janitorial', ServiceName: 'Dusting', SubOption: 'J-1', Level: 'Level 1', Quantity: '' };
const built = E.build({
  orders: [
    { OrderID: 'C1-REC9', ClientID: 'C1', Status: 'Recurring Scheduled', RecurringServiceID: '12', DispatchDate: '2026-10-20T12:00:00Z', ServiceWindow: '6:00 PM', Supervisor: 'Ana Lopez', ServicesDetailed: [svc] },
    { OrderID: 'N1', ClientID: 'C1', Status: 'Assigned', DispatchDate: '2026-10-20T12:00:00Z', ServiceWindow: '8:00 AM - 11:00 AM', Supervisor: 'Leo Diaz', ServicesDetailed: [svc] }
  ], from: '2026-10-20', to: '2026-10-20', today: '2026-10-19', timesBySku: { 'J-1': { Level1Minutes: 30 } }
});
const list = Array.isArray(built) ? built : (built.entries || []);
const rec = list.find(e => e.orderId === 'C1-REC9'), n1 = list.find(e => e.orderId === 'N1');
assert('schedule-entries: recurring visit at 6:00 PM -> start 18:00, no end', rec && rec.start === '18:00' && rec.end === '' && rec.window === '6:00 PM', rec && { s: rec.start, e: rec.end, w: rec.window });
assert('schedule-entries: a normal order with a range does not change', n1 && n1.start === '08:00' && n1.end === '11:00', n1 && { s: n1.start, e: n1.end });

/* Correos: "Start time" / "starts 6:00 PM"; el rango sigue siendo "Arrival window". */
const N = require('./notify');
const o = { OrderID: 'GS-1-REC1', DispatchDate: '2026-10-20T12:00:00Z', ServiceWindow: '6:00 PM', Address: '1 Main', City: 'Dallas' };
const s1 = N.CLIENT_TEMPLATES.scheduled({ order: o });
assert('Scheduled email: subject "…, starts 6:00 PM"', /, starts 6:00 PM$/.test(s1.subject), s1.subject);
assert('Scheduled email: row "Start time"', /Start time/.test(s1.html) && !/Arrival window/.test(s1.html));
const s2 = N.CLIENT_TEMPLATES.scheduled({ order: Object.assign({}, o, { ServiceWindow: '8:00 AM - 11:00 AM' }) });
assert('Scheduled email with a range: unchanged ("Arrival window", ", 8:00 AM - 11:00 AM")', /, 8:00 AM - 11:00 AM$/.test(s2.subject) && /Arrival window/.test(s2.html), s2.subject);
const v1 = N.CLIENT_TEMPLATES['visit-check']({ order: o, visitDate: '2026-10-20' });
assert('Is the site ready? email: "…, starts 6:00 PM" and "Start time"', /, starts 6:00 PM$/.test(v1.subject) && /Start time/.test(v1.html), v1.subject);

/* PDF: el renglon dice "Start Time" con una hora sola (se lee del codigo: armar el PDF necesita pdfkit). */
const pdfSrc = fs.readFileSync(path.join(__dirname, 'order-pdf.js'), 'utf8');
assert('order-pdf: one time is labeled Start Time', /'Start Time' : 'Service Window'/.test(pdfSrc));

console.log(fails ? '\n' + fails + ' FAIL' : '\nall OK');
process.exit(fails ? 1 : 0);
