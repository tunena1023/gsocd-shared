const S = require('./supplies');
const C = require('./closets');
let ok = 0, bad = 0;
function assert(name, cond, d) { if (cond) { ok++; console.log('OK   - ' + name); } else { bad++; console.log('FAIL - ' + name + (d !== undefined ? '  -- ' + JSON.stringify(d) : '')); } }

assert('unidad de Janitorial lleva paquete', S.isKitOrder({ Division: 'Janitorial', OrderID: 'GS-1-0001', Status: 'Received' }));
assert('visita de recurrente no', !S.isKitOrder({ Division: 'Janitorial', OrderID: 'GS-1045-REC12' }));
assert('renovaciones y exteriores tambien (el kit sale de sus servicios)', S.isKitOrder({ Division: 'Renovations', OrderID: 'GS-1-0002' }) && S.isKitOrder({ Division: 'Exteriors', OrderID: 'GS-1-0003' }));
assert('cancelada no', !S.isKitOrder({ Division: 'Janitorial', OrderID: 'GS-1-3', Status: 'Cancelled' }));
assert('sin estado = To pack', S.kitStatusOf({}) === 'To pack');
const p1 = S.kitApply({}, 'Packed', 'bodega', '2026-10-20T20:00:00Z');
assert('bodega: To pack -> Packed con historial', p1 && p1.KitStatus === 'Packed' && S.parseLog(p1.KitLog).length === 1);
assert('no se salta: To pack -> In closet', S.kitApply({}, 'In closet', 'x') === null);
const p2 = S.kitApply(p1, 'In closet', 'sup', '2026-10-20T21:40:00Z');
const p3 = S.kitApply(Object.assign({}, p1, p2), 'Picked up', 'tech', '2026-10-21T13:06:00Z');
assert('supervisor y tecnico', p2.KitStatus === 'In closet' && p3.KitStatus === 'Picked up' && S.kitWhen(p3, 'In closet').by === 'sup');
assert('recogido ya no se mueve', S.kitApply(p3, 'Packed', 'x') === null);

const cat = { 'P-50': { ServiceName: 'Move-out cleaning', PackageItems: JSON.stringify([{ sku: 'D1' }, { sku: 'F1' }, { sku: 'O1' }]) },
  'D1': { ServiceName: 'Dusting', KitItems: JSON.stringify({ items: [{ item: 'Duster', qty: 1 }, { item: 'Rags', qty: 1 }] }) },
  'F1': { ServiceName: 'Floors', KitItems: JSON.stringify({ items: [{ item: 'Mop heads', qty: 1 }, { item: 'Rags', qty: 2 }] }) },
  'O1': { ServiceName: 'Oven cleaning', KitItems: JSON.stringify({ items: [{ item: 'Oven cleaner', qty: 1 }] }) },
  'C1': { ServiceName: 'Carpet cleaning', KitItems: JSON.stringify({ items: [] }) },
  'X1': { ServiceName: 'Window tracks' } };
const pk = { Bedrooms: '2', PackageContents: JSON.stringify({ 'P-50': [] }) };
const k = S.kitFor(pk, [{ ServiceName: 'Dusting', SubOption: 'D1' }, { ServiceName: 'Floors', SubOption: 'F1' }], cat);
assert('el kit es la suma de lo que lleva cada servicio seleccionado', k.name === 'Move-out 2 bed' && S.contentsText(k.contents) === 'Duster + 3 × Rags + Mop heads', k);
assert('sin limpiar el horno no va el quimico del horno', !/Oven/.test(S.contentsText(k.contents)));
assert('con el horno si va', /Oven cleaner/.test(S.contentsText(S.kitFor(pk, [{ ServiceName: 'Dusting', SubOption: 'D1' }, { ServiceName: 'Oven cleaning', SubOption: 'O1' }], cat).contents)));
assert('servicio sin nada configurado: aviso (contents not set)', S.kitFor({}, [{ ServiceName: 'Window tracks', SubOption: 'X1' }], cat).unset === true);
assert('servicio configurado como "nada" (maquina): sin kit', S.kitFor({}, [{ ServiceName: 'Carpet cleaning', SubOption: 'C1' }], cat).none === true);
assert('lee el formato viejo por recamaras', S.parseKitItems({ byBedrooms: { any: [{ item: 'Caddies', qty: 2 }] } }).items[0].qty === 2);
assert('etiqueta "Unit 211 – Azucena"', S.kitLabel({ UnitNumber: '211' }, ['Azucena Lopez']) === 'Unit 211 – Azucena');

const items = [S.itemOf({ id: '1', fields: { Title: 'Rags', ClosetKeep: 4, OnHand: 14 } }), S.itemOf({ id: '2', fields: { Title: 'Mop heads', ClosetKeep: 6 } })];
let cl = C.addCount('', { 'Rags': 1, 'Mop heads': 7 }, 'sup', S.lowIn({ 'Rags': 1, 'Mop heads': 7 }, items), '2026-10-16T15:00:00Z');
assert('conteo queda en el closet con su historial', cl.counts.length === 1 && /1 item low/.test(cl.log[0].what), cl.log);
const r = S.restockOf(cl, items);
assert('reponer: lo que quedo abajo del minimo', r.length === 1 && r[0].item === 'Rags' && r[0].need === 3, r);
cl = C.addSent(C.serialize(cl), { 'Rags': 3 }, 'bodega', '2026-10-17T15:00:00Z');
assert('ya mandado: nada hasta el proximo conteo', S.restockOf(cl, items).length === 0 && C.parse(C.serialize(cl)).sent.length === 1);
assert('sin conteo: null (Waiting)', S.restockOf(C.parse(''), items) === null);

const ragItem = S.itemOf({ id: '9', fields: { Title: 'Rags', Variants: 'Green, Blue,White\nOrange, green' } });
assert('los tipos vienen de SupplyItems.Variants (sin repetir)', S.variantsOf(ragItem).join() === 'Green,Blue,White,Orange' && S.variantsOf(items[1]) === null, ragItem.variants);
const cc = S.cleanVariants(ragItem, { Green: 2, Blue: '1', White: -3, Orange: 1.7, Pink: 9 });
assert('la suma de los tipos es el conteo del articulo', cc.total === 4 && cc.variants.White === 0 && !('Pink' in cc.variants), cc);
const withC = C.addCount('', { Rags: 4 }, 'sup', 0, '2026-10-20T00:00:00Z', { Rags: cc.variants });
assert('el conteo guarda el desglose por tipo', withC.counts[0].variants.Rags.Green === 2);
const eq = S.itemOf({ id: '20', fields: { Title: 'Vacuums', Category: 'Equipment' } });
assert('categoria del articulo (sin nada = Janitorial); en el closet va lo que se ocupe (equipo tambien)', eq.category === 'Equipment' && S.itemOf({ fields: { Title: 'X' } }).category === 'Janitorial' && S.inCloset(eq));
const ph = S.itemOf({ id: '30', fields: { Title: 'Comet', Code: 'J-007', Photo: 'img/supplies/comet.jpg', Cases: '4 boxes', Section: 'Cleaning chemicals', Supplier: 'Menards', Notes: 'Last restocked 6/16' } });
assert('ID, foto, cajas sin abrir y seccion del articulo', ph.code === 'J-007' && ph.photo === 'img/supplies/comet.jpg' && ph.cases === '4 boxes' && ph.section === 'Cleaning chemicals' && ph.supplier === 'Menards' && ph.notes === 'Last restocked 6/16');
assert('siguiente ID por pestaña, sin repetir', S.nextCode('Janitorial', [ph, { code: 'J-002' }, { code: 'R-040' }]) === 'J-008' && S.nextCode('Renovations', [ph]) === 'R-001' && S.nextCode('Equipment', []) === 'E-001');
console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
if (bad) process.exit(1);
