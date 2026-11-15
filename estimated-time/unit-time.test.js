/* node estimated-time/unit-time.test.js -- estimated-time/unit-time.js (CFO 15/11/2026): tiempos por unidad del catalogo
   en lugar de la suma por tarea, el rango del tecnico (X a X x 1.15) y lo que no tiene tiempo por unidad. */
'use strict';
const U = require('./unit-time');
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 400) : '')); } };
const opt = (sku, key) => U.entry(sku).o.find(r => r[0] === key)[1];

/* rango */
check('MARGIN is 15 %', U.MARGIN === 0.15);
[150, 200, 37, 480, 1].forEach(x => check('range ' + x + ' -> from X to round(X x 1.15)', U.range(x).from === x && U.range(x).to === Math.round(x * 1.15)));
check('fmtRange 150 -> "2h 30min – 2h 53min"', U.fmtRange(150) === '2h 30min – 2h 53min', U.fmtRange(150));

/* bandas */
check('bands by bed / bath', U.bandOf('0', '1') === 'A' && U.bandOf('1', '1') === 'B' && U.bandOf('2', '1') === 'C' && U.bandOf('2', '2') === 'D' && U.bandOf('3', '2') === 'E' && U.bandOf('4', '2.5') === 'E' && U.bandOf(null, null) === null);

/* el catalogo trae 111-85 y 111-86 */
check('111-85 Detail and 111-86 Water extraction are in the catalog times', U.isUnitSku('111-85') && U.hasSku('111-86') && opt('111-86', 'A') === 60);
check('building packages are not unit times (111-37 common areas, 111-13 office restroom)', !U.hasSku('111-37') && !U.hasSku('111-13'));

/* paquete por unidad: las tareas del paquete no suman, cuenta el tiempo por unidad */
const items = ['111-13', '111-23', '111-25', '111-36', '111-51', '111-57', '111-58', '111-59'].map(sku => ({ sku, level: 'Level 1' }));
const svcs = items.map(i => ({ ServiceName: i.sku, SubOption: i.sku, Level: 'Level 1' }));
const perTask = () => 30;   // lo de Clara: 8 tareas x 30 = 240 si se sumaran
const r = U.orderMinutes(svcs, { Bedrooms: '2', Bathrooms: '1', PackageContents: JSON.stringify({ '111-48': items }) }, { perTask });
check('move-in 2 bed / 1 bath L1 = the catalog C · L1, not the sum of the tasks', r && r.totalMinutes === opt('111-48', 'C · L1') && r.lines.length === 1, r);
check('expected range of the order = X to X x 1.15', r.toMinutes === Math.round(r.totalMinutes * 1.15));
const r2 = U.orderMinutes(svcs.map((s, i) => Object.assign({}, s, { Level: i < 5 ? 'Level 2' : 'Level 1' })), { Bedrooms: '2', Bathrooms: '2', PackageContents: { '111-50': items } }, { perTask });
check('package level = the level most of its tasks have (move-out D · L2)', r2.totalMinutes === opt('111-50', 'D · L2'), r2);
const r3 = U.orderMinutes(svcs.slice(0, 4), { Bedrooms: '1', Bathrooms: '1', PackageContents: { '111-48': items } }, { perTask });
check('a person with half of the package tasks gets half of the package', r3.totalMinutes === Math.round(opt('111-48', 'B · L1') / 2), r3);
const r4 = U.orderMinutes(svcs, { PackageContents: { '111-48': items } }, { perTask });
check('no size on the order: 1 bed (B) assumed and said', r4.totalMinutes === opt('111-48', 'B · L1') && r4.bandAssumed === true, r4);
check('the package SKU itself on a line (no snapshot) also takes the unit time', U.orderMinutes([{ SubOption: '111-50', Level: 'Level 3' }], { Bedrooms: '3', Bathrooms: '2' }).totalMinutes === opt('111-50', 'E · L3'));

/* renovaciones por unidad y por pieza; lo demas, Service Times */
const ren = U.orderMinutes([{ SubOption: '222-10' }, { SubOption: '222-11', Quantity: '9' }, { SubOption: '111-14', Level: 'Level 1' }], { Bedrooms: '2', Bathrooms: '1' }, { perTask: s => (s === '111-14' ? 65 : null) });
check('walls by unit size + 9 doors both sides + a task with no catalog time from Service Times', ren.totalMinutes === opt('222-10', 'C · 1 coat') + 9 * opt('222-11', 'B') + 65, ren);
check('a line with no time anywhere is counted as unknown, not as 0', U.orderMinutes([{ SubOption: '999-1' }, { SubOption: '222-10' }], { Bedrooms: '1' }).unknown === 1);
check('nothing known -> null (no "0min")', U.orderMinutes([{ SubOption: '999-1' }], {}) === null);
check('not completed lines do not count', U.orderMinutes([{ SubOption: '222-10', NotCompleted: true }], { Bedrooms: '1' }) === null);
check('per 1,000 sq ft with no quantity = the whole unit', U.lineMinutes('111-53', '', '', { band: 'C' }).minutes === Math.round(opt('111-53', 'A') * 900 / 1000));
check('coveredSkus: the tasks a unit package already covers', JSON.stringify(Object.keys(U.coveredSkus(svcs, { PackageContents: { '111-48': items } })).sort()) === JSON.stringify(items.map(i => i.sku).sort()));
check('a cleaning task in an order with no bed / bath (common areas) keeps its Service Times minutes', U.orderMinutes([{ SubOption: '111-51', Level: 'Level 1' }], {}, { perTask: () => 35 }).totalMinutes === 35);
check('the same task in a unit order takes the catalog (whole unit)', U.orderMinutes([{ SubOption: '111-51', Level: 'Level 1' }], { Bedrooms: '2', Bathrooms: '1' }, { perTask: () => 35 }).totalMinutes === Math.round(opt('111-51', 'A') * 900 / 1000));
console.log('\nunit-time: ' + ok + ' OK, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
