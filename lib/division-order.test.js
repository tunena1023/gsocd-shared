/* node lib/division-order.test.js -- lib/division-order.js (CFO 16/11/2026): Renovations, Janitorial, Exteriors;
   sin match al final; dentro de cada division el orden de antes (llegada o Sequence). Caso real: GS-1065-1329
   (Centerville Senior Lofts, 24 servicios revueltos). */
'use strict';
const D = require('./division-order');
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 600) : '')); } };

const catalog = [
  { fields: { SKU: '111-13', Division: 'Janitorial' } }, { fields: { SKU: '111-58', Division: 'Janitorial' } },
  { fields: { SKU: '222-52', Division: 'Renovations' } }, { fields: { SKU: '111-55', Division: 'Janitorial' } },
  { fields: { SKU: '222-85', Division: 'Renovations' } }, { fields: { SKU: '333-10', Division: 'Exteriors' } },
  { fields: { SKU: '300-02', Division: 'Exteriors' } }, { fields: { SKU: '222-48', Division: 'Renovations' } }
];
const svc = (name, sku, extra) => Object.assign({ Category: 'Commercial', ServiceName: name, SubOption: sku }, extra || {});
const names = l => l.map(s => s.ServiceName).join(',');

check('rankOf', D.rankOf('Renovations') === 0 && D.rankOf('janitorial ') === 1 && D.rankOf('EXTERIORS') === 2 &&
  D.rankOf('Mixed') === 3 && D.rankOf('') === 3 && D.rankOf(null) === 3);

const mixed = [
  svc('Gutter', '333-10'), svc('Restroom', '111-13'), svc('Prime', '222-52'), svc('Old manual', 'X-1'),
  svc('Sweep', '111-58'), svc('Appliance removal', '222-85'), svc('Shampoo', '111-55'), svc('Power wash', '300-02')
];
check('sort: Renovations, Janitorial, Exteriors, then no match; arrival order inside each',
  names(D.sort(mixed, catalog)) === 'Prime,Appliance removal,Restroom,Sweep,Shampoo,Gutter,Power wash,Old manual', names(D.sort(mixed, catalog)));
check('sort does not change the input array', names(mixed) === 'Gutter,Restroom,Prime,Old manual,Sweep,Appliance removal,Shampoo,Power wash');

const lying = [svc('Restroom', '111-13', { Division: 'Renovations' }), svc('Prime', '222-52', { Division: 'Janitorial' })];
check('never trusts the Division written on the row', names(D.sort(lying, catalog)) === 'Prime,Restroom');

check('no catalog and no CatalogDivision: order unchanged', names(D.sort(mixed, null)) === names(mixed));

const tagged = D.tag(mixed.map(s => Object.assign({}, s)), catalog);
check('tag sets CatalogDivision ("" when no match)', tagged[0].CatalogDivision === 'Exteriors' && tagged[3].CatalogDivision === '' && tagged[2].CatalogDivision === 'Renovations');
check('browser sort with CatalogDivision only (no catalog)', names(D.sort(tagged)) === 'Prime,Appliance removal,Restroom,Sweep,Shampoo,Gutter,Power wash,Old manual');

const seq = { Restroom: 3, Sweep: 1, Shampoo: 2, Prime: 9, 'Appliance removal': 4 };
check('Sequence orders inside its own division only',
  names(D.sort(mixed, catalog, { seqOf: (s, i) => seq[s.ServiceName] != null ? seq[s.ServiceName] : i + 1 })) ===
  'Appliance removal,Prime,Sweep,Shampoo,Restroom,Gutter,Power wash,Old manual');

check('catalogMap accepts {sku,division}, {SKU,Division}, Map and plain object', (() => {
  const a = D.catalogMap([{ sku: '1', division: 'Exteriors' }, { SKU: '2', Division: 'Renovations' }]);
  const b = D.catalogMap(new Map([['1', { division: 'Exteriors' }], ['2', 'Renovations']]));
  const c = D.catalogMap({ 1: 'Exteriors', 2: { Division: 'Renovations' } });
  return [a, b, c].every(m => m['1'] === 'Exteriors' && m['2'] === 'Renovations');
})());

const rows = [
  { Category: 'Commercial', ServiceName: 'Restroom', Sequence: 1 }, { Category: 'Commercial', ServiceName: 'Prime', Sequence: 2 },
  { Category: 'Commercial', ServiceName: 'Gutter', Sequence: 3 }, { Category: 'Commercial', ServiceName: 'Appliance removal', Sequence: 4 },
  { Category: 'Commercial', ServiceName: 'Ghost', Sequence: 0 }
];
check('sortAssignments: by the division of their service, then Sequence; unknown service last',
  D.sortAssignments(rows, mixed, catalog).map(r => r.ServiceName).join(',') === 'Prime,Appliance removal,Restroom,Gutter,Ghost');

const sq = D.sequence(mixed, [{ fields: { Category: 'Commercial', ServiceName: 'Shampoo', Sequence: 1 } }], catalog);
check('sequence: 1..N in division order (stored Sequence wins inside its division)',
  JSON.stringify(sq) === JSON.stringify({ 'Commercial|Prime': 1, 'Commercial|Appliance removal': 2, 'Commercial|Shampoo': 3,
    'Commercial|Restroom': 4, 'Commercial|Sweep': 5, 'Commercial|Gutter': 6, 'Commercial|Power wash': 7, 'Commercial|Old manual': 8 }), sq);

/* GS-1065-1329, Centerville Senior Lofts (16/11/2026, solo lectura): como llegan de la base. */
const realCat = { '111-13': 'Janitorial', '111-58': 'Janitorial', '111-81': 'Janitorial', '111-51': 'Janitorial', '111-71': 'Janitorial',
  '111-57': 'Janitorial', '222-52': 'Renovations', '111-55': 'Janitorial', '111-36': 'Janitorial', '222-85': 'Renovations',
  '111-78': 'Janitorial', '111-23': 'Janitorial', '111-59': 'Janitorial', '111-25': 'Janitorial', '222-41': 'Renovations',
  '111-77': 'Janitorial', '111-73': 'Janitorial', '111-79': 'Janitorial', '111-80': 'Janitorial', '111-76': 'Janitorial',
  '222-48': 'Renovations', '222-27': 'Renovations', '222-62': 'Renovations', '222-84': 'Renovations' };
const real = Object.keys(realCat).map(k => svc(k, k));
const sorted = D.sort(real, realCat);
const divs = sorted.map(s => realCat[s.SubOption]);
check('GS-1065-1329: 7 Renovations first, then 17 Janitorial, nothing mixed',
  divs.slice(0, 7).every(d => d === 'Renovations') && divs.slice(7).every(d => d === 'Janitorial') && sorted.length === 24, divs);
check('GS-1065-1329: Renovations keep their arrival order',
  sorted.slice(0, 7).map(s => s.SubOption).join(',') === '222-52,222-85,222-41,222-48,222-27,222-62,222-84', sorted.slice(0, 7).map(s => s.SubOption));

check('opts.divisionOf replaces the catalog lookup', names(D.sort(mixed, null, { divisionOf: s => s.ServiceName === 'Gutter' ? 'Renovations' : '' })).startsWith('Gutter,Restroom'));

(async () => {
  let calls = 0, fail = false;
  const load = D.loader(async () => { calls++; if (fail) throw new Error('down'); return catalog; }, 1000);
  const a = await load(), b = await load();
  fail = true;
  const L2 = D.loader(async () => { throw new Error('down'); });
  check('loader: one read, then its own memory; failure -> last good map or null', calls === 1 && a === b && a['222-52'] === 'Renovations' && (await L2()) === null);
  check('empty and null inputs', D.sort(null).length === 0 && D.sortAssignments(null, null).length === 0 && JSON.stringify(D.sequence([], [])) === '{}');

  console.log('\n' + ok + ' ok, ' + bad + ' failed');
  process.exit(bad ? 1 : 0);
})();
