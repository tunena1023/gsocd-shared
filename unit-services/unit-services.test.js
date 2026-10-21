/* node unit-services/unit-services.test.js -- GSUnitServices en Chromium (21/10/2026).
   Common Areas sale en la barra en cualquier modo (CFO: "todos los servicios los pueda ver todo mundo"); el tipo de
   propiedad, la division y los paquetes siguen igual. Necesita playwright (NODE_PATH) y Chromium. */
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const SRC = fs.readFileSync(path.join(__dirname, 'unit-services.js'), 'utf8');
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 400) : '')); } };
const CAT = [
  { sku: '111-54', serviceName: 'Ozone Machine', division: 'Janitorial', propertyType: 'Commercial', category: 'Common Areas' },
  { sku: '111-14', serviceName: 'Lobby & reception', division: 'Janitorial', propertyType: 'Commercial', category: 'Common Areas' },
  { sku: '111-55', serviceName: 'Carpet Shampoo', division: 'Janitorial', propertyType: 'Commercial', category: 'Floors' },
  { sku: '111-48', serviceName: 'Move-In Cleaning', division: 'Janitorial', propertyType: 'Commercial', category: 'Package', packageItems: [{ sku: '111-55' }] },
  { sku: '110-58', serviceName: 'Ozone Machine', division: 'Janitorial', propertyType: 'Residential', category: 'Common Areas' },
  { sku: '222-44', serviceName: 'Ceiling Repair', division: 'Renovations', propertyType: 'Commercial', category: 'Common Areas' }
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const p = await b.newPage();
  await p.setContent('<!doctype html><html><body><div id="a"></div><div id="b"></div><div id="c"></div><div id="d"></div></body></html>');
  await p.addScriptTag({ content: SRC });
  const r = await p.evaluate(cat => {
    const type = (id, q) => { const i = document.querySelector('#' + id + ' .gs-us-search'); i.value = q; i.dispatchEvent(new Event('input')); return Array.from(document.querySelectorAll('#' + id + ' .gs-us-opt span')).map(x => x.textContent); };
    const out = {};
    /* Como Admin New contract: sin workMode (arranca en units). */
    const a = GSUnitServices.mount(document.getElementById('a'), { catalog: cat, division: 'Janitorial', crossDivision: false, propertyType: 'Commercial', onChange: () => {} });
    out.ozone = type('a', 'ozone'); out.lobby = type('a', 'lobby'); out.pkg = type('a', 'move-in'); out.reno = type('a', 'ceiling');
    document.querySelector('#a .gs-us-search').value = 'ozone'; document.querySelector('#a .gs-us-search').dispatchEvent(new Event('input'));
    document.querySelector('#a .gs-us-opt').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    out.items = a.getItems();
    out.again = type('a', 'ozone');
    /* En Recurring igual. */
    GSUnitServices.mount(document.getElementById('b'), { catalog: cat, division: 'Janitorial', propertyType: 'Commercial', workMode: 'recurring' });
    out.rec = type('b', 'ozone');
    /* Residential: el suyo. */
    GSUnitServices.mount(document.getElementById('c'), { catalog: cat, division: 'Janitorial', propertyType: 'Residential' });
    out.res = type('c', 'ozone');
    /* Mixed: todas las divisiones. */
    GSUnitServices.mount(document.getElementById('d'), { catalog: cat, division: 'Mixed', crossDivision: true, propertyType: 'Commercial' });
    out.mixed = type('d', 'ceiling');
    return out;
  }, CAT);
  check('Units (default) finds Ozone Machine (Common Areas)', r.ozone.length === 1 && r.ozone[0] === 'Ozone Machine', r);
  check('Units finds Lobby & reception', r.lobby.length === 1, r);
  check('Packages with contents still do not show', r.pkg.length === 0, r);
  check('Other divisions still do not show without Mixed', r.reno.length === 0, r);
  check('Picking it adds it once (no longer offered)', r.items.length === 1 && r.items[0].sku === '111-54' && r.again.length === 0, r);
  check('Recurring also finds it', r.rec.length === 1, r);
  check('Residential finds its own Ozone (110-58)', r.res.length === 1, r);
  check('Mixed finds Ceiling Repair (Renovations, Common Areas)', r.mixed.length === 1, r);
  await b.close();
  console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
