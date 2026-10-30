/* Prueba de dates.js: node dates/dates.test.js (corre con cualquier TZ del sistema). */
'use strict';
const D = require('./dates.js');
let ok = 0, fail = 0;
const eq = (name, got, want) => { if (got === want) { ok++; console.log('OK   - ' + name); } else { fail++; console.log('FAIL - ' + name + ' got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); } };

eq('fecha sola se queda en su dia', D.day('2026-10-01'), '2026-10-01');
eq('medianoche UTC = dia escrito (no un dia antes)', D.day('2026-10-01T00:00:00Z'), '2026-10-01');
eq('medianoche UTC con milisegundos', D.day('2026-10-01T00:00:00.000Z'), '2026-10-01');
eq('due date 23:59:59 de Iowa (05Z del dia siguiente) = su dia en Iowa', D.day('2026-10-02T04:59:59Z'), '2026-10-01');
eq('hora sin zona = dia escrito', D.day('2026-10-01T22:00:00'), '2026-10-01');
eq('07:00Z de SharePoint (Pacifico) = mismo dia', D.day('2026-10-01T07:00:00Z'), '2026-10-01');
eq('hora con offset', D.day('2026-10-01T23:30:00-05:00'), '2026-10-01');
eq('Date', D.day(new Date('2026-03-08T12:00:00Z')), '2026-03-08');
eq('vacio', D.day(''), '');
eq('null', D.day(null), '');
eq('basura', D.day('hola'), '');

eq('fmtDate fecha sola', D.fmtDate('2026-10-01'), 'Oct 1, 2026');
eq('fmtDate medianoche UTC (el error de un dia antes)', D.fmtDate('2026-10-01T00:00:00Z'), 'Oct 1, 2026');
eq('fmtDate due date', D.fmtDate('2026-10-02T04:59:59Z'), 'Oct 1, 2026');
eq('fmtDate sin año', D.fmtDate('2026-10-01', { year: false }), 'Oct 1');
eq('fmtDate con dia de la semana', D.fmtDate('2026-10-01', { year: false, weekday: true }), 'Thu, Oct 1');
eq('fmtDate vacio = —', D.fmtDate(''), '—');
eq('fmtDate vacio con empty', D.fmtDate(null, { empty: '' }), '');
eq('fmtDate basura no se tira: sale tal cual', D.fmtDate('TBD'), 'TBD');
eq('fmtDate cambio de horario (DST)', D.fmtDate('2026-11-01T00:00:00Z'), 'Nov 1, 2026');

eq('fmtDateTime en hora de Iowa (CDT)', D.fmtDateTime('2026-10-01T20:05:00Z'), 'Oct 1, 3:05 PM');
eq('fmtDateTime en hora de Iowa (CST)', D.fmtDateTime('2026-12-01T20:05:00Z'), 'Dec 1, 2:05 PM');
eq('fmtDateTime noche: el dia es el de Iowa', D.fmtDateTime('2026-10-02T03:00:00Z'), 'Oct 1, 10:00 PM');
eq('fmtDateTime fecha sola: sin hora y sin un dia antes', D.fmtDateTime('2026-10-01'), 'Oct 1');
eq('fmtDateTime vacio', D.fmtDateTime(''), '—');
eq('fmtDateTime basura', D.fmtDateTime('x'), '—');

eq('today es YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(D.today()), true);

/* En el navegador queda en window.GSDates */
global.window = {};
delete require.cache[require.resolve('./dates.js')];
require('./dates.js');
eq('window.GSDates', typeof window.GSDates.fmtDate, 'function');

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
