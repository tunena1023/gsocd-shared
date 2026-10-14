const S = require('./supplies');
const C = require('./closets');
let ok = 0, bad = 0;
function assert(name, cond, d) { if (cond) { ok++; console.log('OK   - ' + name); } else { bad++; console.log('FAIL - ' + name + (d !== undefined ? '  -- ' + JSON.stringify(d) : '')); } }

assert('unidad de Janitorial lleva paquete', S.isKitOrder({ Division: 'Janitorial', OrderID: 'GS-1-0001', Status: 'Received' }));
assert('visita de recurrente no', !S.isKitOrder({ Division: 'Janitorial', OrderID: 'GS-1045-REC12' }));
assert('renovaciones no', !S.isKitOrder({ Division: 'Renovations', OrderID: 'GS-1-0002' }));
assert('cancelada no', !S.isKitOrder({ Division: 'Janitorial', OrderID: 'GS-1-3', Status: 'Cancelled' }));
assert('sin estado = To pack', S.kitStatusOf({}) === 'To pack');
const p1 = S.kitApply({}, 'Packed', 'bodega', '2026-10-20T20:00:00Z');
assert('bodega: To pack -> Packed con historial', p1 && p1.KitStatus === 'Packed' && S.parseLog(p1.KitLog).length === 1);
assert('no se salta: To pack -> In closet', S.kitApply({}, 'In closet', 'x') === null);
const p2 = S.kitApply(p1, 'In closet', 'sup', '2026-10-20T21:40:00Z');
const p3 = S.kitApply(Object.assign({}, p1, p2), 'Picked up', 'tech', '2026-10-21T13:06:00Z');
assert('supervisor y tecnico', p2.KitStatus === 'In closet' && p3.KitStatus === 'Picked up' && S.kitWhen(p3, 'In closet').by === 'sup');
assert('recogido ya no se mueve', S.kitApply(p3, 'Packed', 'x') === null);

const cat = { '111-50': { KitItems: JSON.stringify({ byBedrooms: { '2': [{ item: 'Caddies', qty: 1 }, { item: 'Rags', qty: 1 }, { item: 'Mop heads', qty: 1 }], any: [{ item: 'Caddies', qty: 1 }] } }) },
  '111-60': { KitItems: JSON.stringify({ none: true }) } };
const k = S.kitFor({ Bedrooms: '2' }, [{ ServiceName: 'Move-out cleaning', SubOption: '111-50' }], cat);
assert('paquete por servicio y recamaras', k.name === 'Move-out 2 bed' && S.contentsText(k.contents) === 'Caddies + Rags + Mop heads', k);
assert('si no hay de esas recamaras, el "any"', S.kitFor({ Bedrooms: '3' }, [{ ServiceName: 'Move-out cleaning', SubOption: '111-50' }], cat).contents.length === 1);
assert('sin paquete (maquina)', S.kitFor({}, [{ ServiceName: 'Carpet cleaning', SubOption: '111-60' }], cat).none === true);
assert('sin definir: nombre y aviso', S.kitFor({ Bedrooms: '1' }, [{ ServiceName: 'Move-in cleaning', SubOption: '9' }], cat).unset === true);
assert('etiqueta "Unit 211 – Azucena"', S.kitLabel({ UnitNumber: '211' }, ['Azucena Lopez']) === 'Unit 211 – Azucena');

const items = [S.itemOf({ id: '1', fields: { Title: 'Rags', ClosetKeep: 4, OnHand: 14 } }), S.itemOf({ id: '2', fields: { Title: 'Mop heads', ClosetKeep: 6 } })];
let cl = C.addCount('', { 'Rags': 1, 'Mop heads': 7 }, 'sup', S.lowIn({ 'Rags': 1, 'Mop heads': 7 }, items), '2026-10-16T15:00:00Z');
assert('conteo queda en el closet con su historial', cl.counts.length === 1 && /1 item low/.test(cl.log[0].what), cl.log);
const r = S.restockOf(cl, items);
assert('reponer: lo que quedo abajo del minimo', r.length === 1 && r[0].item === 'Rags' && r[0].need === 3, r);
cl = C.addSent(C.serialize(cl), { 'Rags': 3 }, 'bodega', '2026-10-17T15:00:00Z');
assert('ya mandado: nada hasta el proximo conteo', S.restockOf(cl, items).length === 0 && C.parse(C.serialize(cl)).sent.length === 1);
assert('sin conteo: null (Waiting)', S.restockOf(C.parse(''), items) === null);

assert('Rags se cuenta por color (Green, Blue, White, Orange)', S.variantsOf('Rags').join() === 'Green,Blue,White,Orange' && S.variantsOf('Mop heads') === null);
const cc = S.cleanColors('Rags', { Green: 2, Blue: '1', White: -3, Orange: 1.7, Pink: 9 });
assert('la suma de los colores es el conteo de Rags', cc.total === 4 && cc.colors.White === 0 && !('Pink' in cc.colors), cc);
const withC = C.addCount('', { Rags: 4 }, 'sup', 0, '2026-10-20T00:00:00Z', { Rags: cc.colors });
assert('el conteo guarda el desglose por color', withC.counts[0].colors.Rags.Green === 2);
console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
if (bad) process.exit(1);
