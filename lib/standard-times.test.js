/* Prueba de lib/standard-times.js. Correr: node lib/standard-times.test.js */
'use strict';
const T = require('./standard-times');
let ok = 0, fail = 0;
const t = (name, cond, x) => { if (cond) { ok++; console.log('OK   - ' + name); } else { fail++; process.exitCode = 1; console.log('FAIL - ' + name + (x !== undefined ? '  -- ' + JSON.stringify(x).slice(0, 300) : '')); } };
t('hay 253 servicios con tiempos', T.entries().length === 253, T.entries().length);
t('Move-In, tamaño A, Level 1 = 120 min', T.minutesFor('111-48|A · L1') === 120);
t('Move-In, tamaño A, Level 3 = 210 min', T.minutesFor('111-48|A · L3') === 210);
t('pintura de paredes B, 2 capas sale de la lista', T.minutesFor('222-10|B · 2 coats') > T.minutesFor('222-10|B · 1 coat'));
t('opcion que no existe = null (no se inventa)', T.minutesFor('222-10|G · 1 coat') === null && T.minutesFor('999-1|A') === null);
t('lo cobrado por hora = null', T.minutesFor('111-86|A') === null && T.minutesFor('222-27|C') === null);
t('sin tiempo estandar (noStandardTime) = null', T.minutesFor('222-37|A') === null && T.minutesFor('333-16|B') === null);
t('llave rara = null', T.minutesFor('') === null && T.minutesFor('111-48') === null && T.minutesFor(null) === null);
const f = T.forKeys(['111-48|A · L1', '222-37|A']);
t('forKeys separa lo que tiene tiempo de lo que no', f.times['111-48|A · L1'] === 120 && f.missing.length === 1 && f.missing[0] === '222-37|A', f);
t('ninguna opcion tiene 0 ni negativo', T.entries().every(e => (e.options || []).every(o => o.minutes == null || Number(o.minutes) > 0)));
t('arriba de 1,250 sq ft (F, por 100 sq ft) = tamaño E ÷ 12.5, como Marketing', T.minutesFor('222-10|F · 1 coat') === 57.6 && T.minutesFor('222-10|F · 2 coats') === 90.2 && T.minutesFor('222-13|F · Primer + 2 coats') === 147.8 && T.minutesFor('222-19|F · 1 coat') === 28.3 && T.minutesFor('222-49|F') === 28 && T.minutesFor('222-90|F') === 130);
t('F solo para las 5 pinturas / zocalo / textura que Marketing escala; los demas siguen sin tiempo', T.minutesFor('222-91|F') === null && T.minutesFor('222-35|F · Renovation hours') === null && T.minutesFor('222-97|F') === null);
t('gabinetes Small / Mid / Big = los minutos de la opcion A (Marketing usa los mismos)', ['Small', 'Mid', 'Big'].every(z => T.minutesFor('222-97|A · ' + z) === T.minutesFor('222-97|A') && T.minutesFor('222-28|A · ' + z) === T.minutesFor('222-28|A')) && T.minutesFor('222-97|A · Huge') === null && T.minutesFor('222-97|A') === 375);
t('forKeys acepta las llaves derivadas', T.forKeys(['222-97|A · Mid', '222-10|F · 1 coat', '222-37|A']).missing.join() === '222-37|A');
t('techo: quitar textura = 1.3 min por sq ft y aplicar = 0.6 min por sq ft (CFO 16/11 23:26, ritmo de produccion; antes 2.4 / 1.2 sacados de un precio), igual en los dos mercados', ['A', 'B', 'C', 'D', 'E'].every((b, i) => ['222', '210'].every(m => T.minutesFor(m + '-90|' + b) === [780, 1040, 1300, 1625, 1625][i] && T.minutesFor(m + '-91|' + b) === [360, 480, 600, 750, 750][i])) && T.minutesFor('222-91|F') === null);
/* CFO 16/11/2026 23:26: los seis tiempos que no cuadraban con la industria */
t('limpieza touch-up tamaño C niveles 2 y 3 ya no copian al B (114 / 150), en los dos mercados', ['111-42', '110-40'].every(s => T.minutesFor(s + '|C · L2') === 114 && T.minutesFor(s + '|C · L3') === 150 && T.minutesFor(s + '|C · L2') > T.minutesFor(s + '|B · L2') && T.minutesFor(s + '|C · L3') < T.minutesFor(s + '|D · L3')));
t('zocalo pintado en su lugar ~60 pies lineales por hora: 160 / 200 / 250 / 300 / 350', ['222', '210'].every(m => ['A', 'B', 'C', 'D', 'E'].every((b, i) => T.minutesFor(m + '-49|' + b) === [160, 200, 250, 300, 350][i])));
t('horno 45 min y refri 30 min por dentro; persianas y rieles ~4 min por ventana (B nivel 1 = 17.5)', ['111-75', '110-29'].every(s => T.minutesFor(s + '|Oven') === 45 && T.minutesFor(s + '|Refrigerator') === 30) && ['111-76', '110-28', '111-79', '110-17'].every(s => T.minutesFor(s + '|B · L1') === 17.5 && T.minutesFor(s + '|E · L3') === 98.5));
t('paquete de oficina B y C a ~3,100-3,200 sq ft por hora (96 / 186); A igual (78)', ['111-60', '111-13', '111-12'].every(s => T.minutesFor(s + '|A') === 78 && T.minutesFor(s + '|B') === 96 && T.minutesFor(s + '|C') === 186));
t('piso duro quitar = 120 min por 100 sq ft (HomeAdvisor, 1-2 h con maquinaria), igual en los dos mercados', T.minutesFor('222-88|E') === 120 && T.minutesFor('210-88|E') === 120);
console.log(ok + ' OK, ' + fail + ' FAIL');
