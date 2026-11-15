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
const items = ['111-13', '111-23', '111-25', '111-81', '111-51', '111-57', '111-58', '111-59'].map(sku => ({ sku, level: 'Level 1' }));
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

/* ---- per technician (CFO 15/11/2026): only what is assigned to each one, today and after today ---- */
const T0 = '2026-11-16', T1 = '2026-11-17';
const order = { Bedrooms: '2', Bathrooms: '1', PackageContents: { '111-48': items } };
const job = svcs.map(s => Object.assign({ Category: 'Move-in', Division: 'Janitorial' }, s))
  .concat([{ Category: 'Paint', ServiceName: 'Wall painting', SubOption: '222-10', Division: 'Renovations' }, { Category: 'Paint', ServiceName: 'Door painting', SubOption: '222-11', Quantity: '9', Division: 'Renovations' }]);
const X_MOVEIN = opt('111-48', 'C · L1'), X_WALLS = opt('222-10', 'C · 1 coat'), X_DOORS = 9 * opt('222-11', 'B');
const pp = (r, who) => r.people.find(p => p.who === who) || { today: 0, remaining: 0 };
/* by service: Ana does the move-in today, Luis walls today and doors tomorrow */
const asg = svcs.map(s => ({ Category: 'Move-in', ServiceName: s.ServiceName, AssignedTo: 'Ana Ruiz', ScheduledDate: T0, WorkStatus: 'Not Started' }))
  .concat([{ Category: 'Paint', ServiceName: 'Wall painting', AssignedTo: 'Luis Diaz', ScheduledDate: T0 }, { Category: 'Paint', ServiceName: 'Door painting', AssignedTo: 'Luis Diaz', ScheduledDate: T1 }]);
let sp = U.techSplit(job, order, { today: T0, perTask, assignments: asg });
check('per tech: Ana sees only the move-in (today), not the whole order', sp.mode === 'assigned' && Math.abs(pp(sp, 'Ana Ruiz').today - X_MOVEIN) <= 1 && pp(sp, 'Ana Ruiz').remaining === 0, sp);
check('today vs remaining: Luis walls today, doors after today', pp(sp, 'Luis Diaz').today === X_WALLS && pp(sp, 'Luis Diaz').remaining === X_DOORS, sp);
check('each range = X to X x 1.15', sp.people.every(p => p.todayTo === Math.round(p.today * 1.15) && p.remainingTo === Math.round(p.remaining * 1.15)));
check('nobody sees the order total', sp.people.every(p => p.today + p.remaining < X_MOVEIN + X_WALLS + X_DOORS));
/* returning tech on day 2: the walls were done yesterday, today is the doors */
const day2 = asg.map(a => a.ServiceName === 'Wall painting' ? Object.assign({}, a, { WorkStatus: 'Completed' }) : a);
sp = U.techSplit(job, order, { today: T1, perTask, assignments: day2 });
check('returning tech on day 2: done work counts nowhere, today = the doors', pp(sp, 'Luis Diaz').today === X_DOORS && pp(sp, 'Luis Diaz').remaining === 0, sp);
check('day 2: Ana\'s unfinished move-in from yesterday is still remaining (not today)', Math.abs(pp(sp, 'Ana Ruiz').remaining - X_MOVEIN) <= 1 && pp(sp, 'Ana Ruiz').today === 0, sp);
/* 2-person crew on one service row: split between them */
sp = U.techSplit(job, order, { today: T0, perTask, assignments: [{ Category: 'Paint', ServiceName: 'Wall painting', AssignedTo: 'Ana Ruiz, Luis Diaz', ScheduledDate: T0 }] });
check('2-person crew on a service: half each', pp(sp, 'Ana Ruiz').today === Math.round(X_WALLS / 2) && pp(sp, 'Luis Diaz').today === Math.round(X_WALLS / 2), sp);
/* whole order (Scheduling): 2 people today, 1 of them back tomorrow -> 3 person-days of the per-day share */
const total = X_MOVEIN + X_WALLS + X_DOORS;
sp = U.techSplit(job, order, { today: T0, perTask, scheduling: [{ who: 'P1', date: T0 }, { who: 'P2', date: T0 }, { who: 'P1', date: T1 + 'T00:00:00Z' }] });
check('whole order, 2-person crew: today half of a day each (share mode)', sp.mode === 'share' && Math.abs(pp(sp, 'P1').today - total / 2 / 2) <= 1 && Math.abs(pp(sp, 'P2').today - total / 2 / 2) <= 1, sp);
check('whole order, returning tech: P1 has day 2 after today, P2 nothing more', Math.abs(pp(sp, 'P1').remaining - total / 2) <= 1 && pp(sp, 'P2').remaining === 0, sp);
sp = U.techSplit(job, order, { today: T1, perTask, scheduling: [{ who: 'P1', date: T0 }, { who: 'P2', date: T0 }, { who: 'P1', date: T1 }] });
check('whole order on day 2: past days count nowhere, P1 today = the second day', Math.abs(pp(sp, 'P1').today - total / 2) <= 1 && !sp.people.some(p => p.who === 'P2'), sp);
sp = U.techSplit(job, order, { today: T0, perTask, scheduling: [{ who: 'J1', date: T0, division: 'Janitorial' }, { who: 'R1', date: T0, division: 'Renovations' }] });
check('mixed order by division: the cleaner gets the cleaning, the painter the painting', Math.abs(pp(sp, 'J1').today - X_MOVEIN) <= 1 && pp(sp, 'R1').today === X_WALLS + X_DOORS, sp);
check('package minutes spread over its tasks add up to the package', Math.abs(U.techSplit(job.slice(0, 8), order, { today: T0, perTask, assignments: asg.slice(0, 8) }).people[0].today - X_MOVEIN) <= 1);
check('dayOf: date, midnight UTC and a time of day in Iowa', U.dayOf('2026-11-16') === '2026-11-16' && U.dayOf('2026-11-16T00:00:00Z') === '2026-11-16' && U.dayOf('2026-11-17T03:00:00Z') === '2026-11-16');
check('nothing assigned: no mode, nobody', U.techSplit(job, order, { today: T0 }).mode === '' && U.techSplit(job, order, { today: T0 }).people.length === 0);

/* ---- sold like the local market (CFO 15/11/2026 14:15): blinds, window tracks and inside glass are add-ons, not in the package ---- */
{ const withAdd = items.concat([{ sku: '111-76', level: 'Level 1' }, { sku: '111-79', level: 'Level 1' }, { sku: '111-36', level: 'Level 1' }]);
  const sv = withAdd.map(i => ({ ServiceName: i.sku, SubOption: i.sku, Level: 'Level 1' }));
  const o = { Bedrooms: '2', Bathrooms: '2', PackageContents: { '111-48': withAdd } };
  const r = U.orderMinutes(sv, o, { perTask });
  const want = opt('111-48', 'D · L1') + Math.round(opt('111-76', 'D · L1')) + Math.round(opt('111-79', 'D · L1')) + Math.round(opt('111-36', 'D · L1'));
  check('an old move-in that lists blinds, tracks and windows: base package + each add-on on its own', r.totalMinutes === want && r.lines.length === 4, r);
  check('the base alone (no add-on lines on the order) is only the package', U.orderMinutes(sv.slice(0, 8), o, { perTask }).totalMinutes === opt('111-48', 'D · L1'));
  check('add-ons are not "covered" by the package and are not unit packages', !U.coveredSkus(sv, o)['111-76'] && U.isAddOn('111-36') && !U.isUnitSku('111-36') && U.isUnitSku('111-48'));
  check('window cleaning in an order with no bed / bath (common areas) keeps Service Times', U.orderMinutes([{ SubOption: '111-36', Level: 'Level 1' }], {}, { perTask: () => 15 }).totalMinutes === 15); }
/* ---- size scales from 1,250 sq ft (CFO 15/11/2026 14:16): minutes = size E x sq ft / 1,250 when the order has the sq ft ---- */
{ const E1 = opt('111-48', 'E · L1'), mi = (sq, bd, ba) => U.orderMinutes([{ SubOption: '111-48', Level: 'Level 1' }], { Bedrooms: bd, Bathrooms: ba, UnitSqft: sq }).totalMinutes;
  check('1,250 sq ft: the size band (2 bed / 2 bath = D)', mi(1250, '2', '2') === opt('111-48', 'D · L1'));
  check('1,251 sq ft: E x 1,251 / 1,250', mi(1251, '3', '2') === Math.round(E1 * 1251 / 1250));
  check('1,600 sq ft: E x 1.28 (no longer flat at E)', mi(1600, '3', '2') === Math.round(E1 * 1.28) && mi(1600, '3', '2') > E1);
  check('1,601 sq ft: no jump from 1,600', mi(1601, '3', '2') - mi(1600, '3', '2') <= 1);
  check('2,000 sq ft: E x 1.6', mi(2000, '4', '2') === Math.round(E1 * 1.6));
  check('only bedrooms / bathrooms, no sq ft: the size band stays (3 bed = E, flat)', U.orderMinutes([{ SubOption: '111-48', Level: 'Level 1' }], { Bedrooms: '3', Bathrooms: '2' }).totalMinutes === E1);
  check('move-out, Detail add-on and residential twins scale too', U.lineMinutes('111-50', 'Level 2', 1, { band: 'E', sqft: 2000 }).minutes === Math.round(opt('111-50', 'E · L2') * 1.6) &&
    U.lineMinutes('111-85', 'Level 1', 1, { band: 'E', sqft: 2000 }).minutes === Math.round(opt('111-85', 'E · L1') * 1.6) && U.lineMinutes('110-10', 'Level 1', 1, { band: 'E', sqft: 2000 }).minutes === Math.round(E1 * 1.6));
  check('paint by unit size does not scale by this rule', U.lineMinutes('222-10', '', 1, { band: 'E', sqft: 2000 }).minutes === opt('222-10', 'E · 1 coat')); }
console.log('\nunit-time: ' + ok + ' OK, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
