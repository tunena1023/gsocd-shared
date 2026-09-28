const E = require('./schedule-entries');
let fails = 0;
function assert(name, cond, info) { if (cond) console.log('OK   - ' + name); else { fails++; console.log('FAIL - ' + name, info !== undefined ? JSON.stringify(info) : ''); } }

const times = { 'J-1': { Level1Minutes: 30, Level2Minutes: 45 }, 'J-2': { Level1Minutes: 20 }, 'R-1': { Level1Minutes: 120 } };
const svc = (n, sku, lv, extra) => Object.assign({ Category: 'Janitorial', ServiceName: n, SubOption: sku, Level: lv || 'Level 1', Quantity: '' }, extra || {});
const orders = [
  { OrderID: 'A', ClientID: 'C1', BusinessName: 'Senior Lofts', Status: 'Assigned', Division: 'Mixed', BuildingNumber: '1521', UnitNumber: '501',
    Address: '1 Main', City: 'Dallas', Supervisor: 'Josafat Gamez, Luis Cruz', DispatchDate: '2026-09-28T12:00:00Z', ServiceWindow: '5:00 AM - 8:00 AM',
    ServicesDetailed: [svc('Dusting', 'J-1', 'Level 2'), svc('Vacuuming', 'J-2'), svc('Wall painting', 'R-1', '', { Category: 'Commercial' }), svc('Gone', 'J-2', '', { NotCompleted: true })] },
  { OrderID: 'B', ClientID: 'C1', Status: 'Received', AssignByService: true, DispatchDate: '', ServicesDetailed: [svc('Dusting', 'J-1'), svc('Vacuuming', 'J-2')] },
  { OrderID: 'C', ClientID: 'C1', Status: 'Cancelled', Supervisor: 'X', DispatchDate: '2026-09-28T12:00:00Z' },
  { OrderID: 'D', ClientID: 'C1', Status: 'Inspection', InspectionDate: '2026-09-29T15:00:00Z', InspectionWindow: '2:00 PM - 5:00 PM', InspectionBy: 'Rita Moreno', ServicesDetailed: [svc('Dusting', 'J-1')] },
  { OrderID: 'C1-REC5', ClientID: 'C1', Status: 'Recurring Scheduled', RecurringServiceID: '12', DispatchDate: '2026-09-30T12:00:00Z', ServiceWindow: '9:00 AM - 11:00 AM', Supervisor: 'Ana Lopez', ServicesDetailed: [svc('Dusting', 'J-1')] },
  { OrderID: 'E', ClientID: 'C1', Status: 'Assigned', Archived: true, Supervisor: 'X', DispatchDate: '2026-09-28T12:00:00Z' }
];
const sas = [
  { OrderID: 'A', Category: 'Commercial', ServiceName: 'Wall painting', AssignedTo: 'Rita Moreno', ScheduledDate: '2026-09-28', WorkStatus: 'Not Started' },
  { OrderID: 'B', Category: 'Janitorial', ServiceName: 'Dusting', AssignedTo: 'Leo Diaz', ScheduledDate: '2026-09-29', WorkStatus: 'Completed' },
  { OrderID: 'B', Category: 'Janitorial', ServiceName: 'Vacuuming', AssignedTo: 'Leo Diaz, Ana Lopez', ScheduledDate: '2026-09-30', WorkStatus: 'Not Started' }
];
const contracts = [{ id: '12', clientId: 'C1', buildingNumber: '1600', division: 'Janitorial', services: [svc('Dusting', 'J-1')], daysOfWeek: 'Mon,Wed', time: '9:00', totalHours: 4, expirationDate: '2026-10-05', people: ['Ana Lopez'] }];
const recurringDates = (c, from, to) => ['2026-09-28', '2026-09-30', '2026-10-05', '2026-10-07'];
const list = E.build({ from: '2026-09-28', to: '2026-10-10', today: '2026-09-27', orders, serviceAssignments: sas, contracts, recurringDates,
  clientsById: { C1: { name: 'Senior Lofts', address: '9 Office Rd' } }, timesBySku: times });
const byKey = k => list.find(e => e.key === k);

const a = byKey('order:A');
assert('Whole order: crew, window, start/end from the window', a && a.people.join() === 'Josafat Gamez,Luis Cruz' && a.start === '05:00' && a.end === '08:00' && a.date === '2026-09-28', a);
assert('Whole order: services minus the one assigned apart and minus NotCompleted', a && a.services.map(s => s.name).join() === 'Dusting,Vacuuming', a && a.services);
assert('Whole order: minutes with levels (45 + 20)', a && a.minutes === 65, a && a.minutes);
assert('Whole order: address, unit, building', a && a.address === '1 Main, Dallas' && a.unit === '501' && a.building === '1521');
const ra = byKey('service:A:Rita Moreno:2026-09-28');
assert('Service assigned apart on a whole order: its own entry for Rita, same window', ra && ra.services[0].name === 'Wall painting' && ra.start === '05:00' && ra.kind === 'service', ra);
assert('By service: one entry per person(s) and day', byKey('service:B:Leo Diaz:2026-09-29') && byKey('service:B:Leo Diaz, Ana Lopez:2026-09-30'));
assert('By service: all rows completed -> Completed', byKey('service:B:Leo Diaz:2026-09-29').status === 'Completed');
assert('By service: no window -> start from nothing, no invented time', byKey('service:B:Leo Diaz, Ana Lopez:2026-09-30').start === '');
assert('Cancelled and archived orders are left out', !list.some(e => e.orderId === 'C' || e.orderId === 'E'));
const d = byKey('inspection:D');
assert('Inspection: supervisor, day and window', d && d.people[0] === 'Rita Moreno' && d.start === '14:00' && d.end === '17:00' && d.date === '2026-09-29', d);
assert('Generated recurring visit shows as recurring with its crew', byKey('order:C1-REC5') && byKey('order:C1-REC5').kind === 'recurring' && byKey('order:C1-REC5').people[0] === 'Ana Lopez');
assert('Contract: no projected visit on a day that already has its REC order', !byKey('recurring:12:2026-09-30'));
assert('Contract: projected visits up to its end date only', byKey('recurring:12:2026-09-28') && byKey('recurring:12:2026-10-05') && !byKey('recurring:12:2026-10-07'));
const p = byKey('recurring:12:2026-09-28');
assert('Projected visit: planned, time, people, minutes from services', p && p.planned === true && p.start === '09:00' && p.end === '09:30' && p.people[0] === 'Ana Lopez' && p.minutes === 30, p);
const keys = list.map(e => e.date + ' ' + (e.start || '99'));
assert('Sorted by day, then start time', keys.every((k, i) => i === 0 || keys[i - 1] <= k), keys);
assert('windowTimes / to24', E.windowTimes('11:00 AM - 2:00 PM').start === '11:00' && E.windowTimes('11:00 AM - 2:00 PM').end === '14:00' && E.to24('12:30 AM') === '00:30');
assert('dayOf uses Chicago (late UTC is still the same local day)', E.dayOf('2026-09-29T03:00:00Z') === '2026-09-28');
const past = E.build({ from: '2026-09-20', to: '2026-09-30', today: '2026-09-27', contracts, recurringDates: () => ['2026-09-21', '2026-09-28'] });
assert('Contract: no projected visits before today', !past.some(e => e.date === '2026-09-21') && past.some(e => e.date === '2026-09-28'), past.map(e => e.date));
if (fails) { console.log(fails + ' FAIL'); process.exit(1); } else console.log('all OK');
