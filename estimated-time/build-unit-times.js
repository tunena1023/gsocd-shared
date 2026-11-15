/* node estimated-time/build-unit-times.js <seed/standard-times.json de Marketing>
   Escribe el bloque DATA de estimated-time/unit-time.js con los tiempos por unidad del catalogo 111/222/333
   (CFO 15/11/2026). Fuera: los paquetes que cubren un bloque entero o van por numero de departamentos / tamano de
   oficina (dependen del edificio, no de la unidad); ahi siguen los minutos de Service Times. */
'use strict';
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('usage: node estimated-time/build-unit-times.js <standard-times.json>'); process.exit(1); }
const seed = JSON.parse(fs.readFileSync(src, 'utf8'));
const list = Array.isArray(seed) ? seed : (seed.entries || []);
const entries = {};
list.forEach(e => {
  if (!e || !e.sku || e.timeCoversWholeBlock) return;
  if (/apartment|office size|clubhouse/i.test(e.unit || '')) return;
  const o = (e.options || []).filter(x => Number(x.minutes) > 0).map(x => x.per ? [String(x.key), Number(x.minutes), x.per] : [String(x.key), Number(x.minutes)]);
  if (!o.length) return;
  entries[e.sku] = { n: e.name, u: e.unit || '', o };
  /* extra de un move-in / move-out (persianas, rieles, vidrio por dentro, CFO 15/11/2026 14:15): cuenta aparte del paquete */
  if (e.addOn) entries[e.sku].a = 1;
});
const DATA = { source: 'Marketing seed/standard-times.json (CFO 15/11/2026)', entries };
const file = path.join(__dirname, 'unit-time.js');
const js = fs.readFileSync(file, 'utf8');
const out = js.replace(/\/\*DATA\*\/[\s\S]*?\/\*END DATA\*\//, '/*DATA*/\n  var DATA = ' + JSON.stringify(DATA) + ';\n  /*END DATA*/');
fs.writeFileSync(file, out);
console.log(Object.keys(entries).length + ' services written to estimated-time/unit-time.js');
