/* Prueba de GSSearch: node search/search.test.js */
'use strict';
const S = require('./search');
let ok = 0, fail = 0;
const check = (name, cond, extra) => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (cond || extra === undefined ? '' : '  ' + JSON.stringify(extra))); cond ? ok++ : fail++; };

const order = { OrderID: 'GS-1028-1249', ClientName: 'Meadow Vista Apartments', Address: '2600 26th Ave.', City: 'Des Moines', Zip: '50310',
  UnitNumber: '204', BuildingNumber: 'B', Supervisor: 'Fernanda Sordo', CustomerPO: 'PO-77812', Services: [{ name: 'Carpet Shampoo' }, { name: 'Paint touch-up' }],
  Notes: 'Gate code 4411', DueDate: '2026-11-19' };
const idx = S.indexer(o => [o.OrderID, o.ClientName, o.Address, o.City, o.Zip, o.UnitNumber, 'Building ' + o.BuildingNumber, o.Supervisor, o.CustomerPO,
  o.Services.map(s => s.name), o.Notes, S.dateText(o.DueDate)]);
const t = idx(order);
const hit = q => S.match(t, q);

/* Lo que pidio la CFO. */
['gs1028', 'GS-1028-1249', 'gs 1028 1249', '1249', 'meadow', 'MEADOW VISTA', 'vista meadow', '26th ave', '26th Ave.', 'fernanda 1249', '1249 fernanda',
  'sordo', 'des moines', 'desmoines', '50310', 'po77812', '77812', 'carpet shampoo', 'touch up', 'touchup', 'gate code', 'building b', 'unit 204'.split(' ')[1],
  '11/19/2026', '2026-11-19', 'nov 19', 'november 19', '11/19', '  meadow  ', 'Fernanda, 1249'].forEach(q => check('finds "' + q + '"', hit(q)));
['meadow 9999', 'fernando', 'gs1029', 'oak', '27th', 'nov 18', 'dec 19'].forEach(q => check('does not find "' + q + '"', !hit(q)));

/* Acentos, mayusculas y signos. */
check('accents: "garcia" finds "García"', S.has('garcia', 'José García'));
check('accents: "josé" finds "Jose"', S.has('josé', 'Jose Garcia'));
check('ñ: "pena" finds "Peña"', S.has('pena', 'Peña Lofts'));
check('phone: "555-1234" finds "(515) 555 1234"', S.has('555-1234', '(515) 555 1234'));
check('email: "ops@beaver" finds the email', S.has('ops@beaver', 'OPS@Beaver.test'));
check('a word does not join the end of one field with the start of the next', !S.has('vistades', 'Meadow Vista', 'Des Moines'));
check('empty or only symbols = everything', S.match(t, '') && S.match(t, ' - , ') && S.tokens('--').length === 0);
check('tokens: compact, no repeats, a word inside another is dropped', JSON.stringify(S.tokens('GS-1028 gs1028 10 1028')) === '["gs1028"]', S.tokens('GS-1028 gs1028 10 1028'));
check('null, undefined, booleans and deep objects are fine', S.has('x9', null, undefined, true, { a: { b: { c: ['X9'] } } }));
check('numbers are searchable', S.has('1249', 1249));

/* Fechas en dia de Iowa (una con hora UTC de la noche ya es el dia siguiente en UTC). */
check('dateText of a date with UTC time keeps the Iowa day', /2026-11-12/.test(S.dateText('2026-11-13T02:30:00Z')) && !/2026-11-13/.test(S.dateText('2026-11-13T02:30:00Z')), S.dateText('2026-11-13T02:30:00Z'));
check('dateText of bad input is empty', S.dateText('') === '' && S.dateText('not a date') === '' && S.dateText(null) === '');
check('11/12/26 short year', S.has('11/12/26', S.dateText('2026-11-12')));

/* El indice se arma una vez por renglon y solo cuando cambia. */
let builds = 0;
const idx2 = S.indexer(r => { builds++; return [r.name, r.status]; }, r => r.status);
const rows = Array.from({ length: 5000 }, (_, i) => ({ name: 'Client ' + i + (i === 4321 ? ' Meadow' : ''), status: 'Received' }));
let r1 = S.filter(rows, 'meadow', idx2), r2 = S.filter(rows, 'mead', idx2);
check('5000 rows: index built once per row for two searches', builds === 5000, builds);
check('...and finds the right one', r1.length === 1 && r2.length === 1 && r1[0] === rows[4321]);
rows[7].status = 'Completed';
S.filter(rows, 'client 7', idx2);
check('a row whose signature changes is rebuilt (only that one)', builds === 5001, builds);
check('the rebuilt row has the new text', S.match(idx2(rows[7]), 'completed'));
const fresh = rows.map(r => Object.assign({}, r));
S.filter(fresh, 'x', idx2);
check('new objects (fresh data) are indexed again', builds === 10001, builds);
check('empty search returns the same list without copying', S.filter(rows, '', idx2) === rows);
check('filter with a missing list returns []', Array.isArray(S.filter(null, 'a', idx2)) && S.filter(null, 'a', idx2).length === 0);
const t0 = Date.now();
for (let i = 0; i < 50; i++) S.filter(rows, 'client 49 meadow', idx2);
const ms = (Date.now() - t0) / 50;
check('a search over 5000 indexed rows takes under 10 ms (' + ms.toFixed(2) + ' ms)', ms < 10, ms);
let thrown = null;
try { S.indexer(() => { throw new Error('boom'); })({}); } catch (e) { thrown = e; }
check('an error in the row builder is not swallowed silently', thrown && thrown.message === 'boom');

/* Celular: 16 px en los cuadros de texto (iPhone no hace zoom); en escritorio no aplica. */
check('noZoom CSS only applies at <= 700 px', /^@media \(max-width: 700px\)/.test(S.NOZOOM_CSS) && /font-size: 16px !important/.test(S.NOZOOM_CSS));
check('noZoom CSS skips checkboxes, radios and buttons', /:not\(\[type=checkbox\]\)/.test(S.NOZOOM_CSS) && /:not\(\[type=radio\]\)/.test(S.NOZOOM_CSS) && /:not\(\[type=button\]\)/.test(S.NOZOOM_CSS));
check('noZoom without a DOM does nothing', (S.noZoom(), true));

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
