/* node report-table/report-table.test.js -- lo puro de GSReportTable (21/10/2026): filtros, orden, grupos, totales y el Excel. */
'use strict';
const assert = require('assert');
require('./report-table.js');
const R = globalThis.GSReportTable;
const def = { name: 'Hours by person', cols: [['week', 'Week'], ['person', 'Person'], ['hours', 'Hours', 'num'], ['min', 'Min', 'num', 1], ['qty', 'Qty', 'num', 'q'], ['day', 'Day', 'date']],
  def: ['week', 'person', 'hours'], filters: ['person'], date: 'day', group: ['person', 'week'] };
const rows = [
  { week: 'Week of Oct 4', _week: '2026-10-04', person: 'Ana', hours: 40.04, min: 2, qty: 3, item: 'Rags', day: '2026-10-05' },
  { week: 'Week of Oct 11', _week: '2026-10-11', person: 'Ana', hours: 12, min: 2, qty: 1, item: 'Rags', day: '2026-10-12' },
  { week: 'Week of Sep 27', _week: '2026-09-27', person: 'Luis', hours: 50, min: 2, qty: 4, item: 'Bags', day: '2026-09-28' }
];
const st = (o) => Object.assign({ cols: def.def.slice(), filters: {}, group: '', sort: null }, o);
/* Sin grupo: un solo grupo con todo, en el orden de llegada. */
assert.deepStrictEqual(R.view(def, rows, st()).map(g => g.rows.length), [3]);
/* Ordenar por número y por la fecha real de detrás (_week), no por el texto "Week of ...". */
assert.deepStrictEqual(R.view(def, rows, st({ sort: { k: 'hours', d: -1 } }))[0].rows.map(r => r.hours), [50, 40.04, 12]);
assert.deepStrictEqual(R.view(def, rows, st({ sort: { k: 'week', d: 1 } }))[0].rows.map(r => r._week), ['2026-09-27', '2026-10-04', '2026-10-11'], 'weeks sort by date, not by text');
/* Grupos por fecha: el más nuevo arriba; por texto: alfabético. */
assert.deepStrictEqual(R.view(def, rows, st({ group: 'week' })).map(g => g.name), ['Week of Oct 11', 'Week of Oct 4', 'Week of Sep 27']);
assert.deepStrictEqual(R.view(def, rows, st({ group: 'person' })).map(g => g.name), ['Ana', 'Luis']);
/* Filtros: por valor y por fechas. */
assert.strictEqual(R.view(def, rows, st({ filters: { person: 'Luis' } }))[0].rows.length, 1);
assert.strictEqual(R.view(def, rows, st({ filters: { from: '2026-10-01', to: '2026-10-06' } }))[0].rows.length, 1);
/* Totales: se suman los números; "1" nunca; "q" solo de un mismo artículo. */
assert.strictEqual(R.total(def, rows, 'hours'), 102);
assert.strictEqual(R.total(def, rows, 'min'), '');
assert.strictEqual(R.total(def, rows, 'qty'), '', 'rags plus bags are not added');
assert.strictEqual(R.total(def, rows.slice(0, 2), 'qty'), 4);
assert.strictEqual(R.total(def, rows, 'person'), '');
assert.strictEqual(R.total(def, [], 'hours'), '');
/* El Excel: la columna del grupo primero, números como número, el Total al final y qué columnas son fecha. */
const sh = R.sheet(def, rows, st({ group: 'person', cols: ['week', 'hours', 'day'] }));
assert.deepStrictEqual(sh.rows[0], ['Person', 'Week', 'Hours', 'Day']);
assert.strictEqual(sh.rows.length, 5);
assert.strictEqual(typeof sh.rows[1][2], 'number');
assert.deepStrictEqual(sh.rows[4].slice(0, 3), ['Total · 3', '', 102]);
assert.deepStrictEqual(sh.dates, [3]);
/* Formato: fechas cortas en inglés y números a un decimal. */
assert.strictEqual(R.fmt('2026-10-05', 'date'), 'Oct 5');
assert.strictEqual(R.fmt(40.04, 'num'), '40');
assert.strictEqual(R.fmt(1234.56, 'num'), '1,234.6');
assert.strictEqual(R.fmt('', 'num'), '');
/* Un renglón vacío o raro no truena. */
assert.deepStrictEqual(R.view(def, [{}], st({ group: 'person' })).map(g => g.name), ['—']);
console.log('report-table ok');
