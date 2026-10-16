const R = require('./order-rooms');
let ok = 0, bad = 0;
function assert(name, cond) { if (cond) { ok++; console.log('OK   - ' + name); } else { bad++; console.log('FAIL - ' + name); } }

assert('vacio -> null (columna de numero vacia)', R.roomNumber('') === null && R.roomNumber(null) === null && R.roomNumber(undefined) === null);
assert('numero como texto -> numero', R.roomNumber('2') === 2 && R.roomNumber(' 3 ') === 3);
assert('1.5 banos se respeta', R.roomNumber('1.5') === 1.5);
assert('0 o texto -> null', R.roomNumber('0') === null && R.roomNumber('n/a') === null);
assert('numero ya numero', R.roomNumber(2) === 2);
assert('sin recamaras ni banos -> roomsNone', R.roomsNone({ Bedrooms: null, Bathrooms: '' }) && R.roomsNone({}) && R.roomsNone(null));
assert('con recamaras -> no', !R.roomsNone({ Bedrooms: 2, Bathrooms: null }) && !R.roomsNone({ Bedrooms: '', Bathrooms: '1' }));

console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
if (bad) process.exit(1);
