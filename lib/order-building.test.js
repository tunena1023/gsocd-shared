const B = require('./order-building');
let ok = 0, bad = 0;
function assert(name, cond) { if (cond) { ok++; console.log('OK   - ' + name); } else { bad++; console.log('FAIL - ' + name); } }

const client = { ClientID: 'GS-1019', Address: '1209 W 4th St', City: 'Des Moines', Zip: '50309' };
const addrs = [
  { id: '11', fields: { ClientID: 'GS-1019', Label: '1301 S 8th Ave E', BuildingNumber: '', Address: '1301 S 8th Ave E', City: 'Newton', Zip: '50208', Latitude: 41.7, Longitude: -93.0 } },
  { id: '12', fields: { ClientID: 'GS-1019', Label: 'Bldg C', BuildingNumber: 'C', Address: '1453 N 4th Ave E' } },
  { id: '13', fields: { ClientID: 'GS-1019', Label: 'Old', BuildingNumber: '9', Address: '9 Old Rd', Archived: true } },
  { id: '14', fields: { ClientID: 'GS-2000', BuildingNumber: '5', Address: '5 Other St' } }
];
const r1 = B.forOrder(client, addrs, '1301', '1209 W 4th St');
assert('# = numero de calle de un edificio -> su direccion', r1 && r1.addressId === '11' && r1.Address === '1301 S 8th Ave E' && r1.City === 'Newton' && r1.Zip === '50208' && r1.Latitude === 41.7);
const r2 = B.forOrder(client, addrs, 'C', '');
assert('# = Building # guardado; ciudad/zip del cliente si faltan', r2 && r2.addressId === '12' && r2.City === 'Des Moines' && r2.Zip === '50309' && r2.Latitude === null);
assert('"Bldg C" por etiqueta', (B.forOrder(client, addrs, 'Bldg C', '') || {}).addressId === '12');
assert('# de la principal -> nada', B.forOrder(client, addrs, '1209', '1209 W 4th St') === null);
assert('direccion escrita a mano -> nada', B.forOrder(client, addrs, '1301', '77 Custom Rd') === null);
assert('trae la direccion de otro edificio (unidad nueva de un PO) -> el del #', (B.forOrder(client, addrs, '1301', '1453 N 4th Ave E') || {}).addressId === '11');
assert('archivado no cuenta', B.forOrder(client, addrs, '9', '') === null);
assert('edificio de otro cliente no cuenta', B.forOrder(client, addrs, '5', '') === null);
assert('sin # -> nada', B.forOrder(client, addrs, '', '') === null);
const dup = addrs.concat([{ id: '15', fields: { ClientID: 'GS-1019', BuildingNumber: 'C', Address: '2000 Elm St' } }]);
assert('# en dos edificios distintos -> nada', B.forOrder(client, dup, 'C', '') === null);
const same = [{ id: '16', fields: { ClientID: 'GS-1019', BuildingNumber: '3', Address: '1209 W 4th St' } }];
assert('edificio con la misma calle que la principal -> nada', B.forOrder(client, same, '3', '') === null);
assert('ClientID con otra mayuscula', (B.forOrder({ ClientID: 'gs-1019', Address: '1209 W 4th St' }, addrs, '1301', '') || {}).addressId === '11');

console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
if (bad) process.exit(1);
