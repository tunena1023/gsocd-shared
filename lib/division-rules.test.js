const { resolveOrderDivision, divisionChangeNotes } = require('./division-rules');

const catalog = [
  { sku: '101-01', division: 'Janitorial' },
  { sku: '101-02', division: 'Janitorial' },
  { sku: '201-01', division: 'Renovations' },
  { sku: '301-01', division: 'Exteriors' },
];

function assert(name, cond) {
  if (cond) {
    console.log('OK   - ' + name);
  } else {
    console.error('FAIL - ' + name);
    process.exitCode = 1;
  }
}

// 1) Todos los servicios son de la misma division que la orden -> sin cambio
{
  const services = [
    { ServiceName: 'Restroom deep scrub', SubOption: '101-01' },
    { ServiceName: 'Move-In Cleaning', SubOption: '101-02' },
  ];
  const r = resolveOrderDivision('Janitorial', services, catalog);
  assert('mismas divisiones -> null', r === null);
}

// 2) Se agrega un servicio de otra division -> debe pasar a Mixed
{
  const services = [
    { ServiceName: 'Restroom deep scrub', SubOption: '101-01' },
    { ServiceName: 'Deck Staining', SubOption: '201-01' },
  ];
  const r = resolveOrderDivision('Janitorial', services, catalog);
  assert('division distinta -> Mixed', r && r.newDivision === 'Mixed');
  assert('previousDivision correcta', r && r.previousDivision === 'Janitorial');
  assert('causedBy trae el servicio correcto', r && r.causedBy.length === 1 && r.causedBy[0].serviceName === 'Deck Staining' && r.causedBy[0].division === 'Renovations');
  const notes = divisionChangeNotes(r);
  console.log('    notes: ' + notes);
  assert('notes trae el texto esperado', notes.indexOf('Janitorial') !== -1 && notes.indexOf('Mixed') !== -1 && notes.indexOf('Deck Staining') !== -1);
}

// 3) La orden ya es Mixed -> nunca cambia nada, aunque haya de varias divisiones
{
  const services = [
    { ServiceName: 'Restroom deep scrub', SubOption: '101-01' },
    { ServiceName: 'Deck Staining', SubOption: '201-01' },
    { ServiceName: 'Window Washing', SubOption: '301-01' },
  ];
  const r = resolveOrderDivision('Mixed', services, catalog);
  assert('orden ya Mixed -> null', r === null);
}

// 4) 2 servicios de la MISMA otra division -> solo un causedBy, no duplicado
{
  const services = [
    { ServiceName: 'Restroom deep scrub', SubOption: '101-01' },
    { ServiceName: 'Deck Staining', SubOption: '201-01' },
    { ServiceName: 'Deck Staining', SubOption: '201-01' }, // duplicado a proposito
  ];
  const r = resolveOrderDivision('Janitorial', services, catalog);
  assert('sin duplicados en causedBy', r && r.causedBy.length === 1);
}

// 5) SKU que no existe en el catalogo (servicio viejo/manual) -> se ignora, no truena
{
  const services = [
    { ServiceName: 'Servicio Viejo', SubOption: '999-99' },
  ];
  const r = resolveOrderDivision('Janitorial', services, catalog);
  assert('SKU sin match en catalogo -> null, sin error', r === null);
}

// 6) Sin servicios -> null
{
  const r = resolveOrderDivision('Janitorial', [], catalog);
  assert('sin servicios -> null', r === null);
}

// 7) Sin division actual (orden nueva sin division puesta) -> no debe tronar
{
  const services = [{ ServiceName: 'Deck Staining', SubOption: '201-01' }];
  const r = resolveOrderDivision('', services, catalog);
  assert('sin currentDivision -> null (no hay contra que comparar)', r === null);
}

// 8) Catalogo vacio/null -> no debe tronar
{
  const services = [{ ServiceName: 'Deck Staining', SubOption: '201-01' }];
  const r = resolveOrderDivision('Janitorial', services, null);
  assert('catalogo null -> null, sin error', r === null);
}

// 9) 3 divisiones distintas a la vez -> causedBy con las 2 ajenas
{
  const services = [
    { ServiceName: 'Restroom deep scrub', SubOption: '101-01' },
    { ServiceName: 'Deck Staining', SubOption: '201-01' },
    { ServiceName: 'Window Washing', SubOption: '301-01' },
  ];
  const r = resolveOrderDivision('Janitorial', services, catalog);
  assert('3 divisiones -> 2 causedBy (las ajenas, no la propia)', r && r.causedBy.length === 2);
}

console.log('\nListo.');
