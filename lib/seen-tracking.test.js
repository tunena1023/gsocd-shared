const st = require('./seen-tracking');
let ok = 0, bad = 0;
function assert(name, cond) { if (cond) { ok++; console.log('OK   - ' + name); } else { bad++; console.log('FAIL - ' + name); } }
const o = { OrderID: 'GS-1-1', createdDateTime: '2026-10-01T10:00:00Z', lastModifiedDateTime: '2026-10-22T15:00:00Z' };
const hist = [
  { OrderID: 'GS-1-1', ChangeType: 'Created', FieldChanged: 'Status', ChangeDate: '2026-10-01T10:00:00Z', ChangedBy: 'c1' },
  { OrderID: 'GS-1-1', ChangeType: 'Completed', FieldChanged: 'Status', OldValue: 'Assigned', NewValue: 'Completed', ChangeDate: '2026-10-10T18:00:00Z', ChangedBy: 'cfo@gsocd.com' }
];
const seen = '2026-10-12T12:00:00Z';
// La falla (CFO 22/10): completada, ya abierta; algo interno la toco despues (Outlook, paquete...)
assert('regla de antes: brillaba por la escritura interna', st.isUnseen(seen, o.lastModifiedDateTime) === true);
assert('cliente: no brilla, no hay nada nuevo en su historial', st.isUnseenOrder(seen, hist, o, { mode: 'client' }) === false);
assert('Admin: no brilla', st.isUnseenOrder(seen, hist, o, { mode: 'staff' }) === false);
assert('Tech: no brilla', st.isUnseenOrder(seen, hist, o, { mode: 'tech' }) === false);
// Algo que si se ve, despues de abrirla
const note = hist.concat([{ OrderID: 'GS-1-1', ChangeType: 'Note', FieldChanged: 'Notes', Notes: 'Gate code changed', ChangeDate: '2026-10-20T15:00:00Z', ChangedBy: 'cfo@gsocd.com' }]);
assert('cambio visible despues de abrirla: brilla (Admin)', st.isUnseenOrder(seen, note, o, { mode: 'staff' }) === true);
// Nota interna: Admin la ve, el cliente no
const internal = hist.concat([{ OrderID: 'GS-1-1', ChangeType: 'Internal Note', FieldChanged: 'Internal Note', Notes: 'x', ChangeDate: '2026-10-20T15:00:00Z', ChangedBy: 'cfo@gsocd.com' }]);
assert('nota interna: Admin brilla', st.isUnseenOrder(seen, internal, o, { mode: 'staff' }) === true);
assert('nota interna: el cliente no', st.isUnseenOrder(seen, internal, o, { mode: 'client' }) === false);
// Ruido que nadie ve
const noise = hist.concat([{ OrderID: 'GS-1-1', ChangeType: 'Document Generated', FieldChanged: 'Document', ChangeDate: '2026-10-20T15:00:00Z' }]);
assert('Document Generated: nadie brilla', st.isUnseenOrder(seen, noise, o, { mode: 'staff' }) === false && st.isUnseenOrder(seen, noise, o, { mode: 'client' }) === false);
// Nunca abierta: brilla como antes
assert('nunca abierta: brilla', st.isUnseenOrder('', hist, o, { mode: 'client' }) === true);
assert('nunca abierta y sin fechas: no', st.isUnseenOrder('', [], {}, { mode: 'client' }) === false);
// Sin historial (fallo la lectura): la regla de antes
assert('historial null: regla de antes', st.isUnseenOrder(seen, null, o, { mode: 'client' }) === true);
// Historial vacio: cuenta la fecha de creacion
assert('historial vacio, creada antes de abrirla: no brilla', st.isUnseenOrder(seen, [], o, { mode: 'staff' }) === false);
// Items de Graph (con .fields) y desordenados
const graphRows = hist.slice().reverse().map(f => ({ fields: f }));
assert('items de Graph desordenados: igual', st.isUnseenOrder(seen, graphRows, o, { mode: 'client' }) === false);
assert('lastVisibleChange = el Completed', st.lastVisibleChange('GS-1-1', hist, { mode: 'client' }) === '2026-10-10T18:00:00.000Z');
// needsHistory: solo las abiertas y tocadas despues
assert('needsHistory: abierta y modificada despues', st.needsHistory(seen, o.lastModifiedDateTime) === true);
assert('needsHistory: nunca abierta no', st.needsHistory('', o.lastModifiedDateTime) === false);
assert('needsHistory: abierta despues del ultimo cambio no', st.needsHistory('2026-10-23T00:00:00Z', o.lastModifiedDateTime) === false);
console.log('\n' + ok + ' ok, ' + bad + ' FAIL'); process.exit(bad ? 1 : 0);
