const { stageOf, takenDay } = require('./photo-stage');
let ok = 0, bad = 0;
function assert(name, cond) { if (cond) { ok++; console.log('OK   - ' + name); } else { bad++; console.log('FAIL - ' + name); } }
const order = { DispatchDate: '2026-10-20T05:00:00Z', Status: 'Assigned' };
// 2026-10-20 03:30 UTC = 19 oct 10:30 PM en Iowa -> antes
assert('noche anterior en Iowa (UTC ya es el 20) = antes', stageOf('2026-10-20_033000-abcd.jpg', order) === 'inspection');
assert('el dia del servicio = despues', stageOf('2026-10-20_150000-abcd.jpg', order) === 'work');
assert('despues del servicio = despues', stageOf('svc-Kitchen-2026-10-22_150000-abcd.jpg', order) === 'work');
assert('foto del cliente al pedir = antes', stageOf('client-2026-10-10_150000-abcd.jpg', order) === 'inspection');
assert('foto por servicio en la inspeccion (sin insp-) = antes', stageOf('svc-Paint-2026-10-15_150000-abcd.jpg', order) === 'inspection');
assert('foto de inspeccion subida tarde (sin insp-) pero tomada antes = antes', stageOf('2026-10-15_150000-abcd.jpg', order) === 'inspection');
assert('insp- tomada el dia del servicio = despues (manda la fecha)', stageOf('insp-2026-10-20_150000-abcd.jpg', order) === 'work');
assert('sin dia de servicio y no completada = antes', stageOf('2026-10-15_150000-abcd.jpg', { Status: 'Received' }) === 'inspection');
assert('sin dia de servicio pero completada = prefijo (no se sabe)', stageOf('2026-10-15_150000-abcd.jpg', { Status: 'Completed' }) === 'work' && stageOf('insp-2026-10-15_150000-abcd.jpg', { Status: 'Completed' }) === 'inspection');
assert('por servicio: primer dia programado', stageOf('2026-10-18_150000-abcd.jpg', { Status: 'Assigned' }, { firstScheduled: '2026-10-19' }) === 'inspection' && stageOf('2026-10-19_150000-abcd.jpg', { Status: 'Assigned' }, { firstScheduled: '2026-10-19' }) === 'work');
assert('nombre sin fecha: usa createdAt', stageOf('video.mp4', order, { createdAt: '2026-10-25T15:00:00Z' }) === 'work');
assert('takenDay en hora de Iowa', takenDay('2026-10-20_033000-x.jpg') === '2026-10-19');
const { firstScheduledByOrder } = require('./photo-stage');
const fakeLq = { fetchByValues: async (list) => list === 'Scheduling'
  ? [{ fields: { OrderID: 'A', AssignedDate: '2026-10-21T05:00:00Z' } }]
  : [{ fields: { OrderID: 'A', ScheduledDate: '2026-10-20' } }, { fields: { OrderID: 'B', ScheduledDate: '2026-10-22' } }] };
firstScheduledByOrder(fakeLq, ['A', 'B']).then(m => {
  assert('primer dia programado por orden', m.A === '2026-10-20' && m.B === '2026-10-22');
  console.log(ok + ' OK, ' + bad + ' FAIL');
  if (bad) process.exitCode = 1;
});
