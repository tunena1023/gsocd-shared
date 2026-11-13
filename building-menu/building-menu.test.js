/* node building-menu/building-menu.test.js -- las listas de Building # y de Address (Fernanda #20, CFO 12/11/2026). */
'use strict';
const assert = require('assert');
global.window = global;
require('./building-menu.js');
const M = global.GSBuildingMenu;
const blds = [
  { id: '1', label: 'Bldg 1725', buildingNumber: '1725', address: '1725 28th Ave SW', city: 'Altoona', zip: '50009' },
  { id: '2', label: 'Lobby', buildingNumber: '', address: '', city: '' },
  { id: '3', label: 'Old', buildingNumber: '9', address: '9 Old Rd', city: 'Altoona', archived: true },
  { id: '4', label: '', buildingNumber: '', address: '1649 26th Ave. SW', city: 'Altoona', zip: '50009' }
];
const b = M.buildingItems(blds);
assert.deepStrictEqual(b.map(x => x.value), ['1725', 'Lobby'], 'Building #: not archived, with # or name; value = # or name');
assert.strictEqual(b[0].addr, '1725 28th Ave SW, Altoona');
const client = { address: '1806 28th Ave SW', city: 'Altoona', zip: '50009', buildings: blds };
const a = M.addressItems(client);
assert.deepStrictEqual(a.map(x => x.value), ['1806 28th Ave SW, Altoona, 50009', '1725 28th Ave SW, Altoona, 50009', '1649 26th Ave. SW, Altoona, 50009'], 'Address: primary + buildings with an address, one line');
assert.deepStrictEqual(a.map(x => x.name), ['Primary address', 'Bldg 1725', '1649 26th Ave. SW'], 'name: label, or the street');
assert.strictEqual(a[1].num, '1725');
assert.deepStrictEqual(M.filter(a, '1725').map(x => x.name), ['Bldg 1725'], 'typing filters (number)');
assert.deepStrictEqual(M.filter(a, 'ALTOONA').length, 3, 'case does not matter');
assert.deepStrictEqual(M.filter(a, 'nowhere').length, 0);
assert.deepStrictEqual(M.filter(b, '').length, 2, 'empty = all');
assert.deepStrictEqual(M.addressItems({ address: '' }, []), [], 'no addresses: no list (the field stays a plain field)');
assert.doesNotThrow(() => M.attach({ isInput: () => '', items: () => [] }), 'attach without a document does nothing');
console.log('building-menu: all OK');
