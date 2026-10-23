/* node templates/templates.test.js -- GSTemplates (paquetes = templates, CFO 22/10/2026). */
'use strict';
const T = require('./templates');
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 500) : '')); } };

const CAT = [
  { sku: '300-01', serviceName: 'Unit Turnover Package', division: 'Janitorial', propertyType: 'Commercial', category: 'Package',
    packageItems: [{ sku: '222-72', level: 'Level 1' }, { sku: '222-80', level: 'Level 2' }, { sku: '500-2', level: '' }] },
  { sku: '222-72', serviceName: 'Carpet Shampoo', division: 'Janitorial', propertyType: 'Commercial' },
  { sku: '222-80', serviceName: 'Window Cleaning', division: 'Janitorial', propertyType: 'Commercial' },
  { sku: '500-2', serviceName: 'Door painting', division: 'Renovations', propertyType: 'Commercial', requiresQuantity: true },
  { sku: '410-12', serviceName: 'Blinds', division: 'Renovations', propertyType: 'Commercial', requiresQuantity: true },
  { sku: '999-01', serviceName: 'Empty Package', division: 'Janitorial', propertyType: 'Commercial', category: 'Package', packageItems: [] }
];
const row = (sku, lvl, qty) => ({ SubOption: sku, Level: lvl || '', Quantity: qty || '' });

/* itemsOf: los paquetes se desarman, con sus niveles */
let it = T.itemsOf([row('300-01')], CAT);
check('A package saved in a template comes out as its services with the standard levels',
  JSON.stringify(it) === JSON.stringify([{ sku: '222-72', level: 'Level 1', qty: '' }, { sku: '222-80', level: 'Level 2', qty: '' }, { sku: '500-2', level: '', qty: '' }]), it);
it = T.itemsOf([row('300-01')], CAT, { '300-01': [{ sku: '222-72', level: 'Level 3' }] });
check('The level picked inside the package is kept (Carpet L3)', it[0].level === 'Level 3' && it[1].level === 'Level 2', it);
it = T.itemsOf([row('410-12', '', 3), row('222-72', 'Level 2')], CAT);
check('Quantities are kept (Blinds x3); no level on a non-Janitorial service', it[0].qty === 3 && it[0].level === '' && it[1].level === 'Level 2', it);
it = T.itemsOf([row('300-01'), row('222-72', 'Level 3')], CAT);
check('The same service in the package and loose stays once (no double billing)', it.filter(x => x.sku === '222-72').length === 1, it);
it = T.itemsOf([row('777-77', 'Level 2', '')], CAT);
check('A service no longer in the catalog is not lost', it.length === 1 && it[0].sku === '777-77', it);
it = T.itemsOf([row('999-01')], CAT);
check('A package with no contents stays as it is (nothing to expand)', it.length === 1 && it[0].sku === '999-01', it);
it = T.itemsOf([row('222-72', 'Level 9')], CAT);
check('A bad level becomes Level 1 on a Janitorial service', it[0].level === 'Level 1', it);

/* itemsFromPicker: lo que se ve en el picker */
const st = { selected: { Commercial: { 'Unit Turnover Package': '300-01', 'Blinds': '410-12' } }, levels: { 'Commercial|Unit Turnover Package': 'Level 2' },
  quantities: { 'Commercial|Blinds': 4 }, packageLevels: { '300-01': [{ sku: '222-72', level: 'Level 3' }, { sku: '222-80', level: 'Level 1' }, { sku: '500-2', level: '' }] } };
it = T.itemsFromPicker(st, CAT);
check('From the picker: package expanded with the levels picked inside, plus Blinds x4',
  JSON.stringify(it.map(x => x.sku + ':' + x.level + ':' + x.qty)) === JSON.stringify(['222-72:Level 3:', '222-80:Level 1:', '500-2::', '410-12::4']), it);

/* servicesOf + divisionFor */
const sv = T.servicesOf(it, CAT, { division: 'Janitorial' });
check('Services to save carry name, type and the real division of each service',
  sv[0].ServiceName === 'Carpet Shampoo' && sv[0].Division === 'Janitorial' && sv[2].Division === 'Renovations' && sv[3].Quantity === 4, sv);
check('Janitorial + Renovations saves as Mixed', T.divisionFor(sv, 'Janitorial') === 'Mixed');
check('All Janitorial from the Janitorial tab stays Janitorial', T.divisionFor(sv.slice(0, 2), 'Janitorial') === 'Janitorial');
check('Only Renovations services from the Janitorial tab saves as Renovations', T.divisionFor([sv[3]], 'Janitorial') === 'Renovations');
check('From the Mixed tab it stays Mixed', T.divisionFor(sv.slice(0, 2), 'Mixed') === 'Mixed');

/* normalize + check */
let n = T.normalize([row('222-72', 'Level 2'), row('222-72', 'Level 3'), row(''), null, row('410-12', '', '-1')]);
check('Server keeps each service once, drops empty rows, cleans quantity', n.services.length === 2 && n.services[0].Level === 'Level 2' && n.services[1].Quantity === '', n);
n = T.normalize([]);
check('An empty package is not saved', !!n.error && !n.services.length, n);
check('check(): name required', T.check('  ', [row('222-72')]) === 'Give your package a name.');
check('check(): at least one service', T.check('A', []) === 'Add at least one service.');
check('check(): ok', T.check('A', [row('222-72')]) === '');

/* sameName */
const tpls = [{ id: '1', name: 'By George', clientId: 'BICI' }, { id: '2', name: 'Other', clientId: 'X' }];
check('Same name (any case) of my own template is found to update it', (T.sameName(tpls, 'by george', 'bici') || {}).id === '1');
check('Same name of another client is not mine', T.sameName(tpls, 'Other', 'BICI') === null);

/* forClient: propios + publicos, sin el publico que es igual al suyo */
const all = [
  { id: 'm1', name: 'My turnover', clientId: 'BICI', division: 'Janitorial', services: [row('300-01')], isPublic: false },
  { id: 'o1', name: 'Turnover (office)', clientId: 'OFFICE', services: [row('222-72', 'Level 1'), row('222-80', 'Level 2'), row('500-2')], isPublic: true },
  { id: 'o2', name: 'Deep clean', clientId: 'OFFICE', division: 'Janitorial', services: [row('222-72', 'Level 3')], isPublic: true },
  { id: 'o3', name: 'Private office', clientId: 'OFFICE', services: [row('222-72')], isPublic: false },
  { id: 'x1', name: 'Theirs', clientId: 'OTHER', services: [row('222-80')], isPublic: false }
];
const fc = T.forClient(all, 'bici', CAT);
check('A client sees their own and public ones, never another client\'s private or office private',
  fc.map(t => t.id).sort().join(',') === 'm1,o2', fc.map(t => t.id));
check('A public copy with exactly the same services as the creator\'s own is hidden for the creator', !fc.some(t => t.id === 'o1'));
check('Own = mine, public = shared', fc.find(t => t.id === 'm1').mine === true && fc.find(t => t.id === 'o2').shared === true);

/* toSets: tarjetas del picker */
const sets = T.toSets(fc, CAT, 'Janitorial');
check('My package cards come with the package expanded and the shared flag',
  sets.find(s => s.key === 'm1').items.length === 3 && sets.find(s => s.key === 'o2').shared === true, sets);
check('Cards filtered by tab; Mixed shows all', T.toSets([{ id: 'a', division: 'Renovations', services: [row('410-12', '', 2)] }], CAT, 'Janitorial').length === 0 &&
  T.toSets([{ id: 'a', division: 'Renovations', services: [row('410-12', '', 2)] }], CAT, 'Mixed')[0].items[0].qty === 2);

/* pickerStateOf: para Use / Edit */
const ps = T.pickerStateOf([row('300-01'), row('410-12', '', 2)], CAT);
check('Loading a template puts its services in the picker (package expanded, levels and quantities)',
  ps.selected.Commercial['Carpet Shampoo'] === '222-72' && ps.levels['Commercial|Window Cleaning'] === 'Level 2' && ps.quantities['Commercial|Blinds'] === 2 && !ps.selected.Commercial['Unit Turnover Package'], ps);

console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
