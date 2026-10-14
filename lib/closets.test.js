const C = require('./closets');
let ok = 0, bad = 0;
function assert(name, cond) { if (cond) { ok++; console.log('OK   - ' + name); } else { bad++; console.log('FAIL - ' + name); } }

assert('vacio = To confirm', C.parse('').status === 'To confirm' && C.parse(null).keys.length === 0);
assert('JSON roto = To confirm', C.parse('{x').status === 'To confirm');
assert('status raro se ignora', C.parse({ status: 'Maybe' }).status === 'To confirm');

const r1 = C.apply('', { status: 'Confirmed', where: 'Basement B-04', keys: '13, 21' }, 'tony@gsocd.com', '2026-10-14T15:00:00Z');
assert('apply guarda y registra', r1.closet.status === 'Confirmed' && r1.closet.keys.join() === '13,21' && r1.closet.log.length === 1 && r1.closet.log[0].what === 'Confirmed');
const r2 = C.apply(C.serialize(r1.closet), { where: 'Basement B-04' }, 'x');
assert('sin cambios no escribe historial', r2.changed.length === 0 && r2.closet.log.length === 1);
const r3 = C.apply(C.serialize(r1.closet), { notes: 'Ask front desk', status: 'Bogus' }, 'y', '2026-10-15T15:00:00Z');
assert('cambio de notas, status invalido ignorado', r3.closet.status === 'Confirmed' && r3.closet.log[1].what === 'Updated Notes');

const client = { ClientID: 'GS-1043', Address: '15400 Boston Pkwy', City: 'Urbandale', Closet: C.serialize(r1.closet) };
const addrs = [
  { id: '7', fields: { ClientID: 'GS-1043', Label: '15310', BuildingNumber: '', Address: '15310 Boston Pkwy', Closet: JSON.stringify({ uses: 'GS-1043|main' }) } },
  { id: '8', fields: { ClientID: 'GS-1043', Label: 'Bldg 3', BuildingNumber: '3', Address: '15400 Boston Pkwy' } },
  { id: '9', fields: { ClientID: 'GS-1043', Label: 'Old', Address: 'x', Archived: true } }
];
const b = C.buildingsOf(client, addrs);
assert('principal + 2 edificios (sin archivado)', b.length === 3 && b[0].key === 'GS-1043|main' && b[1].key === 'GS-1043|7');
assert('orden en 15310 -> edificio 7', C.buildingForOrder({ Address: '15310 Boston Pkwy' }, b).key === 'GS-1043|7');
assert('orden 15400 bldg 3 -> edificio 8', C.buildingForOrder({ Address: '15400 Boston Pkwy', BuildingNumber: '3' }, b).key === 'GS-1043|8');
assert('orden sin calle conocida -> principal', C.buildingForOrder({ Address: '1 Other St' }, b).key === 'GS-1043|main');
assert('solo # de edificio -> ese edificio', C.buildingForOrder({ Address: '', BuildingNumber: '3' }, b).key === 'GS-1043|8');

const map = {}; b.forEach(x => { map[x.key] = x; });
const res = C.resolve(map['GS-1043|7'], k => map[k] || null);
assert('usa el closet de otro edificio', res.shared && res.via.key === 'GS-1043|main' && res.closet.where === 'Basement B-04');
const loopA = { key: 'A', closet: C.parse({ uses: 'B' }) }, loopB = { key: 'B', closet: C.parse({ uses: 'A' }) };
const rl = C.resolve(loopA, k => ({ A: loopA, B: loopB })[k]);
assert('ciclo no se queda pegado', rl && (rl.via.key === 'B' || rl.via.key === 'A'));

const t = C.forTech(res, id => ({ 13: 'Laura Mendez', 21: 'Sofia Ruiz' })[id] || '', id => 'Stonegate');
assert('forTech con nombres', t.has && t.keys.length === 2 && t.keys[0].name === 'Laura Mendez' && t.place === 'Stonegate' && t.shared);
const none = C.forTech({ building: map['GS-1043|8'], via: map['GS-1043|8'], closet: C.parse({ status: 'No closet' }), shared: false });
assert('No closet -> has false', none.has === false);
assert('carpeta de fotos', C.photoFolder('GS-1043|7') === 'Warehouse/Closets/GS-1043/7' && C.photoFolder('GS-1043|main') === 'Warehouse/Closets/GS-1043/main');

console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
