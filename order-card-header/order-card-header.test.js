/* Prueba de order-card-header.js: node order-card-header/order-card-header.test.js (sin dependencias). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let ok = 0, fail = 0;
const eq = (name, got, want) => { if (got === want) { ok++; console.log('OK   - ' + name); } else { fail++; console.log('FAIL - ' + name + '\n  got  ' + got + '\n  want ' + want); } };

/* Un document de mentiras: solo lo que usa el componente (escape con textContent -> innerHTML y el <style>). */
function load(src) {
  const styles = [];
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  const document = {
    getElementById: id => styles.find(s => s.id === id) || null,
    createElement: () => { const el = { id: '', _t: '' }; Object.defineProperty(el, 'textContent', { set: v => { el._t = String(v); }, get: () => el._t });
      Object.defineProperty(el, 'innerHTML', { get: () => el._t.replace(/[&<>]/g, c => MAP[c]) }); return el; },
    head: { appendChild: el => styles.push(el) }
  };
  const window = {};
  vm.runInNewContext(src, { window, document });
  return { H: window.GSOrderCardHeader, styles };
}
const { H, styles } = load(fs.readFileSync(path.join(__dirname, 'order-card-header.js'), 'utf8'));

const base = { name: 'Maple Ridge Apartments', orderId: 'GS-10482', division: 'Renovations', unitNumber: '214', bedrooms: '2', bathrooms: '1', supervisor: 'Laura Méndez' };
const before = '<div class="gs-ordhdr-top"><span class="gs-ordhdr-name">Maple Ridge Apartments</span></div>' +
  '<div class="gs-ordhdr-sub">GS-10482 · Renovations</div><div class="gs-ordhdr-sub">Unit 214 · 2bd/1ba</div><div class="gs-ordhdr-sub">Assigned: Laura Méndez</div>';
eq('sin opciones nuevas: igual que antes', H.html(base), before);
eq('extraLine igual que antes', H.html(Object.assign({ extraLine: 'Entry Sep 22' }, base)), before + '<div class="gs-ordhdr-sub">Entry Sep 22</div>');

/* La version de antes (v1.30.0, la que carga Tech hoy) da lo mismo sin las opciones nuevas. */
try {
  const old = require('child_process').execFileSync('git', ['-C', path.join(__dirname, '..'), 'show', 'v1.30.0:order-card-header/order-card-header.js'], { encoding: 'utf8' });
  const O = load(old).H;
  const cases = [base, Object.assign({ extraLine: 'Entry <x> & y' }, base), { orderId: 'GS-1' }, { name: 'A', completedDateText: 'Sep 19' }, {}];
  eq('mismo resultado que v1.30.0 en ' + cases.length + ' casos', cases.every(c => O.html(c) === H.html(c)), true);
} catch (e) { console.log('(sin git: se brinca la comparacion con v1.30.0)'); }

const full = H.html(Object.assign({ buildingNumber: '3', addressLines: ['2618 28th Ave SW', 'Altoona, IA 50009'], whenLine: 'Sep 26 · 8:00 AM – 12:00 PM' }, base));
eq('edificio, direccion en dos renglones y fecha', full,
  '<div class="gs-ordhdr-top"><span class="gs-ordhdr-name">Maple Ridge Apartments</span></div>' +
  '<div class="gs-ordhdr-sub">GS-10482 · Renovations</div><div class="gs-ordhdr-sub">Building 3 · Unit 214 · 2bd/1ba</div><div class="gs-ordhdr-sub">Assigned: Laura Méndez</div>' +
  '<div class="gs-ordhdr-addr">2618 28th Ave SW<br>Altoona, IA 50009</div><div class="gs-ordhdr-when">Sep 26 · 8:00 AM – 12:00 PM</div>');
eq('solo un renglon de direccion', H.html({ name: 'X', addressLines: ['17 Cedar Point Rd'] }),
  '<div class="gs-ordhdr-top"><span class="gs-ordhdr-name">X</span></div><div class="gs-ordhdr-addr">17 Cedar Point Rd</div>');
eq('direccion vacia: nada', H.html({ name: 'X', addressLines: [] }), '<div class="gs-ordhdr-top"><span class="gs-ordhdr-name">X</span></div>');
eq('direccion con renglones vacios', H.html({ name: 'X', addressLines: ['', 'Ames, IA'] }),
  '<div class="gs-ordhdr-top"><span class="gs-ordhdr-name">X</span></div><div class="gs-ordhdr-addr">Ames, IA</div>');
eq('escapa la direccion', H.html({ name: 'X', addressLines: ['<b>1 & 2</b>'] }),
  '<div class="gs-ordhdr-top"><span class="gs-ordhdr-name">X</span></div><div class="gs-ordhdr-addr">&lt;b&gt;1 &amp; 2&lt;/b&gt;</div>');
eq('edificio sin unidad', H.html({ name: 'X', buildingNumber: 'A' }), '<div class="gs-ordhdr-top"><span class="gs-ordhdr-name">X</span></div><div class="gs-ordhdr-sub">Building A</div>');
eq('un solo <style>', styles.length, 1);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
