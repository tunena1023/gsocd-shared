/* Prueba de lib/standard-times.js. Correr: node lib/standard-times.test.js */
'use strict';
const T = require('./standard-times');
let ok = 0, fail = 0;
const t = (name, cond, x) => { if (cond) { ok++; console.log('OK   - ' + name); } else { fail++; process.exitCode = 1; console.log('FAIL - ' + name + (x !== undefined ? '  -- ' + JSON.stringify(x).slice(0, 300) : '')); } };
t('hay 253 servicios con tiempos', T.entries().length === 253, T.entries().length);
t('Move-In, tamaño A, Level 1 = 120 min', T.minutesFor('111-48|A · L1') === 120);
t('Move-In, tamaño A, Level 3 = 210 min', T.minutesFor('111-48|A · L3') === 210);
t('pintura de paredes B, 2 capas sale de la lista', T.minutesFor('222-10|B · 2 coats') > T.minutesFor('222-10|B · 1 coat'));
t('opcion que no existe = null (no se inventa)', T.minutesFor('222-10|F · 1 coat') === null && T.minutesFor('999-1|A') === null);
t('lo cobrado por hora = null', T.minutesFor('111-86|A') === null && T.minutesFor('222-27|C') === null);
t('sin tiempo estandar (noStandardTime) = null', T.minutesFor('222-37|A') === null && T.minutesFor('333-16|B') === null);
t('llave rara = null', T.minutesFor('') === null && T.minutesFor('111-48') === null && T.minutesFor(null) === null);
const f = T.forKeys(['111-48|A · L1', '222-37|A']);
t('forKeys separa lo que tiene tiempo de lo que no', f.times['111-48|A · L1'] === 120 && f.missing.length === 1 && f.missing[0] === '222-37|A', f);
t('ninguna opcion tiene 0 ni negativo', T.entries().every(e => (e.options || []).every(o => o.minutes == null || Number(o.minutes) > 0)));
console.log(ok + ' OK, ' + fail + ' FAIL');
