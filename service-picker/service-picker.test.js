/* node service-picker/service-picker.test.js -- GSServicePicker en Chromium (19/10/2026, v1.67.0; 21/10 v1.68.0).
   - Lo de antes: sin las opciones nuevas, el picker pinta EXACTAMENTE lo mismo que la version anterior (git HEAD~ o
     OLD_PICKER=<archivo>), en modo niveles, chips, cantidad, con notas y con 'selected-plus-search'.
   - Lo nuevo (Admin "Correct this visit"): allowOff / offList, people, tagOf y keepSelected.
   Necesita playwright (NODE_PATH) y Chromium (CHROMIUM o el de Playwright). */
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process');
const { chromium } = require('playwright');
const NEW = fs.readFileSync(path.join(__dirname, 'service-picker.js'), 'utf8');
let OLD = '';
try { OLD = process.env.OLD_PICKER ? fs.readFileSync(process.env.OLD_PICKER, 'utf8') : cp.execSync('git show HEAD~:service-picker/service-picker.js', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }); } catch (e) { OLD = ''; }
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 400) : '')); } };

const CATALOG = [
  { sku: '111-10', serviceName: 'Common Area Vacuuming', division: 'Janitorial', propertyType: 'Commercial', category: 'Floors' },
  { sku: '111-12', serviceName: 'Trash Removal', division: 'Janitorial', propertyType: 'Commercial', category: 'Trash' },
  { sku: '111-14', serviceName: 'Carpet Spot Treatment', division: 'Janitorial', propertyType: 'Commercial', category: 'Floors' },
  { sku: '410-01', serviceName: 'Paint Door', division: 'Renovations', propertyType: 'Commercial', category: 'Paint' },
  { sku: '410-12', serviceName: 'Blinds', division: 'Renovations', propertyType: 'Commercial', category: 'Windows', requiresQuantity: true }
];
const page = async (b, src) => {
  const p = await b.newPage();
  await p.setContent('<!doctype html><html><body><div id="a"></div><div id="b"></div><div id="c"></div><div id="d"></div><div id="e"></div></body></html>');
  await p.addScriptTag({ content: src });
  await p.evaluate(c => { window.CAT = c; }, CATALOG);
  return p;
};
/* Las mismas pantallas que ya usan los portales, sin opciones nuevas. */
const OLD_CASES = async p => p.evaluate(() => {
  const sel = { Commercial: { 'Common Area Vacuuming': '111-10', 'Blinds': '410-12' } };
  GSServicePicker.mount('a', 'a', { catalog: CAT, division: 'Janitorial', mode: 'levels', crossDivision: true, initialSelected: JSON.parse(JSON.stringify(sel)), initialLevels: { 'Commercial|Common Area Vacuuming': 'Level 2' }, initialQuantities: { 'Commercial|Blinds': 3 } });
  GSServicePicker.mount('b', 'b', { catalog: CAT, division: 'Renovations', mode: 'toggle', initialSelected: { Commercial: { 'Paint Door': '410-01' } } });
  GSServicePicker.mount('c', 'c', { catalog: CAT, division: 'Janitorial', mode: 'levels', serviceNotes: true, initialSelected: JSON.parse(JSON.stringify(sel)), initialLevels: { 'Commercial|Common Area Vacuuming': 'Level 1' } });
  GSServicePicker.mount('d', 'd', { catalog: CAT, division: 'Janitorial', mode: 'levels', filterMode: 'selected-plus-search', initialSelected: JSON.parse(JSON.stringify(sel)), initialLevels: { 'Commercial|Common Area Vacuuming': 'Level 3' } });
  GSServicePicker.mount('e', 'e', { catalog: CAT, division: 'Janitorial', mode: 'levels', groupByCategory: true });
  return ['a', 'b', 'c', 'd', 'e'].map(id => document.getElementById(id).innerHTML);
});

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  /* ---- Lo de antes queda igual ---- */
  if (OLD) {
    const po = await page(b, OLD), pn = await page(b, NEW);
    const [ho, hn] = [await OLD_CASES(po), await OLD_CASES(pn)];
    ['levels + quantity', 'toggle chips', 'with notes', 'selected-plus-search', 'grouped by category'].forEach((n, i) => check('Same HTML as before without the new options: ' + n, ho[i] === hn[i], { old: ho[i].length, new: hn[i].length }));
    /* Y se comporta igual: picar el nivel activo lo quita, picar otro lo cambia. */
    const act = async p => p.evaluate(() => {
      const h = GSServicePicker.mount('z', 'a', { catalog: CAT, division: 'Janitorial', mode: 'levels', initialSelected: { Commercial: { 'Trash Removal': '111-12' } }, initialLevels: { 'Commercial|Trash Removal': 'Level 1' } });
      document.querySelector('#a .gs-sp-lvl-btn[data-sku="111-12"][data-level="Level 1"]').click();
      const gone = !(h.getSelected().Commercial || {})['Trash Removal'];
      document.querySelector('#a .gs-sp-lvl-btn[data-sku="111-10"][data-level="Level 3"]').click();
      return { gone, picked: (h.getSelected().Commercial || {})['Common Area Vacuuming'], lvl: h.getLevels()['Commercial|Common Area Vacuuming'] };
    });
    const [ao, an] = [await act(po), await act(pn)];
    check('Same behavior: active level click removes, another level picks', JSON.stringify(ao) === JSON.stringify(an) && an.gone && an.picked === '111-10' && an.lvl === 'Level 3', { ao, an });
    await po.close(); await pn.close();
  } else console.log('(no previous version found: set OLD_PICKER to compare)');

  /* ---- Lo nuevo ---- */
  const p = await page(b, NEW);
  const r = await p.evaluate(() => {
    const out = {}, changes = [];
    const h = GSServicePicker.mount('v', 'a', { catalog: CAT, division: 'Janitorial', mode: 'levels', filterMode: 'selected-plus-search',
      initialSelected: { Commercial: { 'Common Area Vacuuming': '111-10', 'Trash Removal': '111-12' } },
      initialLevels: { 'Commercial|Common Area Vacuuming': 'Level 2', 'Commercial|Trash Removal': 'Level 1' },
      allowOff: true, offList: { '111-12': true }, keepSelected: { '111-10': true, '111-12': true },
      people: { choices: [{ id: '4101', name: 'Maria Santos' }, { id: '4102', name: 'Carlos Mendez' }], bySku: { '111-10': ['4101'] } },
      tagOf: s => s.sku === '111-14' ? 'Extra' : '', onChange: () => changes.push(1) });
    const g = () => document.getElementById('a');
    out.rows = g().querySelectorAll('.gs-sp-cell').length;
    out.offShown = !!g().querySelector('.gs-sp-cell.gs-sp-off [data-off-sku="111-12"]') && /Not done this visit/.test(g().textContent);
    out.offStart = JSON.stringify(h.getOff());
    out.chip = /Maria Santos/.test(g().querySelector('.gs-sp-pp').textContent);
    /* Not done en el que estaba hecho, y Undo en el otro */
    g().querySelector('[data-off-sku="111-10"]').click();
    g().querySelector('[data-off-sku="111-12"]').click();
    out.offAfter = JSON.stringify(h.getOff());
    g().querySelector('[data-off-sku="111-10"]').click();
    /* Quitar y agregar persona */
    g().querySelector('[data-pp-del="111-10"]').click();
    const s1 = g().querySelector('[data-pp-add="111-10"]'); s1.value = '4102'; s1.dispatchEvent(new Event('change'));
    const s2 = g().querySelector('[data-pp-add="111-12"]'); s2.value = '4101'; s2.dispatchEvent(new Event('change'));
    out.people = JSON.stringify(h.getPeople());
    /* keepSelected: picar su nivel activo no lo quita; otro nivel si cambia */
    g().querySelector('.gs-sp-lvl-btn[data-sku="111-10"][data-level="Level 2"]').click();
    out.kept = (h.getSelected().Commercial || {})['Common Area Vacuuming'] === '111-10';
    g().querySelector('.gs-sp-lvl-btn[data-sku="111-10"][data-level="Level 3"]').click();
    out.lvl = h.getLevels()['Commercial|Common Area Vacuuming'];
    /* Agregar un extra buscandolo: sale con su etiqueta y se puede quitar (no esta en keepSelected) */
    const q = document.getElementById('gs-sp-search-v'); q.value = 'carpet'; q.dispatchEvent(new Event('input'));
    g().querySelector('.gs-sp-lvl-btn[data-sku="111-14"][data-level="Level 1"]').click();
    q.value = ''; q.dispatchEvent(new Event('input'));
    out.extra = (h.getSelected().Commercial || {})['Carpet Spot Treatment'] === '111-14' && /Extra/.test(g().textContent);
    g().querySelector('.gs-sp-lvl-btn[data-sku="111-14"][data-level="Level 1"]').click();
    out.extraGone = !(h.getSelected().Commercial || {})['Carpet Spot Treatment'];
    out.changes = changes.length;
    return out;
  });
  check('New: every selected service shows its row with the extras (2 rows)', r.rows === 2, r);
  check('New: offList shows "Not done this visit" and stays selected', r.offShown && r.offStart === '{"111-12":true}', r);
  check('New: "Mark not done" / "Undo" toggle and getOff()', r.offAfter === '{"111-10":true}', r);
  check('New: people chips, remove and "+ person…" add, getPeople()', r.chip && r.people === '{"111-10":["4102"],"111-12":["4101"]}', r);
  check('New: keepSelected cannot be removed by clicking its level; another level still changes it', r.kept && r.lvl === 'Level 3', r);
  check('New: an extra picked from the search shows its tag and can be taken off', r.extra && r.extraGone, r);
  check('New: onChange fires on each change', r.changes >= 8, r.changes);

  /* ---- v1.68.0 (21/10/2026): Common Areas tambien en Units, al final y cerrada; "Also in" se apaga con otherTypeSearch ---- */
  const CA = [
    { sku: '111-54', serviceName: 'Ozone Machine', division: 'Janitorial', propertyType: 'Commercial', category: 'Common Areas', areas: ['Lobby & Entry'] },
    { sku: '111-14b', serviceName: 'Lobby & reception', division: 'Janitorial', propertyType: 'Commercial', category: 'Common Areas', areas: ['Lobby & Entry'] },
    { sku: '111-55', serviceName: 'Carpet Shampoo', division: 'Janitorial', propertyType: 'Commercial', category: 'Floors' },
    { sku: '111-13', serviceName: 'Restroom cleaning', division: 'Janitorial', propertyType: 'Commercial', category: 'Kitchen & Bathrooms' },
    { sku: '111-84', serviceName: 'Pet hair removal', division: 'Janitorial', propertyType: 'Commercial', category: '' },
    { sku: '111-48', serviceName: 'Move-In Cleaning', division: 'Janitorial', propertyType: 'Commercial', category: 'Package', packageItems: [{ sku: '111-55' }] },
    { sku: '110-58', serviceName: 'Ozone Machine', division: 'Janitorial', propertyType: 'Residential', category: 'Common Areas' }
  ];
  const p2 = await page(b, NEW);
  const u = await p2.evaluate(ca => {
    const out = {};
    const g = id => document.getElementById(id);
    /* Units como Orders / Create Order: switch Recurring/Units y paquetes. */
    GSServicePicker.mount('u', 'a', { catalog: ca, division: 'Janitorial', mode: 'levels', groupByCategory: true, workToggle: true, workMode: 'units', showPackages: true });
    const heads = Array.from(g('a').querySelectorAll('.gs-sp-cat-header')).map(h => h.dataset.cat);
    out.heads = heads;
    const caHead = g('a').querySelector('.gs-sp-cat-header[data-cat="Common Areas"]');
    out.caClosed = !!caHead && !caHead.classList.contains('open') && !caHead.nextElementSibling.classList.contains('open');
    out.ozoneInCA = !!caHead && !!caHead.nextElementSibling.querySelector('[data-sku="111-54"]');
    if (caHead) caHead.click();
    const caHead2 = g('a').querySelector('.gs-sp-cat-header[data-cat="Common Areas"]');
    out.opens = !!caHead2 && caHead2.classList.contains('open');
    const q = g('gs-sp-search-u'); q.value = 'ozone'; q.dispatchEvent(new Event('input'));
    out.searchFinds = !!g('a').querySelector('[data-sku="111-54"]');
    /* Por defecto (sin la opcion) "Also in Residential" sigue como antes. */
    out.otherDefault = !!g('a').querySelector('.gs-sp-other');
    /* Recurring: Common Areas en tarjetas por area y Residential bloqueado, sin cambio. */
    GSServicePicker.mount('r', 'b', { catalog: ca, division: 'Janitorial', mode: 'levels', groupByCategory: true, workToggle: true, workMode: 'recurring' });
    out.recCard = !!g('b').querySelector('.gs-sp-area-head') && /Lobby/.test(g('b').textContent) && /Ozone Machine/.test(g('b').textContent);
    out.recNoPkg = !/Move-In Cleaning/.test(g('b').textContent);
    /* otherTypeSearch: false apaga "Also in". */
    GSServicePicker.mount('o', 'c', { catalog: ca, division: 'Janitorial', mode: 'levels', groupByCategory: true, workToggle: true, workMode: 'units', showPackages: true, otherTypeSearch: false });
    const q2 = g('gs-sp-search-o'); q2.value = 'ozone'; q2.dispatchEvent(new Event('input'));
    out.otherOff = !g('c').querySelector('.gs-sp-other') && !/Also in/.test(g('c').textContent);
    out.stillFinds = !!g('c').querySelector('[data-sku="111-54"]');
    /* Residential en Units: su Ozone tambien sale (antes no salia en ningun picker). */
    GSServicePicker.mount('rr', 'd', { catalog: ca, division: 'Janitorial', mode: 'levels', groupByCategory: true, workToggle: true, workMode: 'units', showPackages: true, propertyType: 'Residential', otherTypeSearch: false });
    out.resOzone = !!g('d').querySelector('[data-sku="110-58"]');
    return out;
  }, CA);
  check('v1.68.0: Units shows Common Areas as the LAST category', u.heads[u.heads.length - 1] === 'Common Areas' && u.heads.indexOf('Uncategorized') === u.heads.length - 2, u.heads);
  check('v1.68.0: Common Areas starts closed, has Ozone Machine, and opens on click', u.caClosed && u.ozoneInCA && u.opens, u);
  check('v1.68.0: searching "ozone" in Units finds Ozone Machine', u.searchFinds, u);
  check('v1.68.0: without otherTypeSearch, "Also in" stays as before', u.otherDefault, u);
  check('v1.68.0: otherTypeSearch:false hides "Also in" and the search still finds it', u.otherOff && u.stillFinds, u);
  check('v1.68.0: Recurring unchanged (area cards, no packages)', u.recCard && u.recNoPkg, u);
  check('v1.68.0: Residential Common Areas (Ozone 110-58) shows in Units', u.resOzone, u);
  /* v1.69.0: categoryColumns: 1 = categorias en una columna; sin la opcion, igual (el HTML de antes ya se compara arriba). */
  const cc = await p2.evaluate(() => {
    const g = id => document.getElementById(id), out = {};
    document.body.style.width = '1200px';
    GSServicePicker.mount('c1', 'a', { catalog: CAT, division: 'Janitorial', mode: 'levels', crossDivision: true, groupByCategory: true, categoryColumns: 1 });
    GSServicePicker.mount('c2', 'b', { catalog: CAT, division: 'Janitorial', mode: 'levels', crossDivision: true, groupByCategory: true });
    GSServicePicker.mount('c3', 'c', { catalog: CAT, division: 'Janitorial', mode: 'levels', crossDivision: true, groupByCategory: true, categoryColumns: 3 });
    const cols = el => getComputedStyle(el.querySelector('.gs-sp-accordion')).gridTemplateColumns.split(' ').length;
    out.one = cols(g('a')); out.two = cols(g('b')); out.other = cols(g('c'));
    out.cls2 = g('b').querySelector('.gs-sp-accordion').className;
    return out;
  });
  check('v1.69.0: categoryColumns:1 puts the categories in one column', cc.one === 1, cc);
  /* v1.70.0: el editor de paquete por cliente dice el nombre, nunca el clientId. */
  const pe = await p2.evaluate(() => {
    const cat = CAT.concat([{ sku: 'P-1', serviceName: 'Move-In Cleaning', division: 'Janitorial', propertyType: 'Commercial', category: 'Package', packageItems: [{ sku: '111-10', level: 'Level 1' }] }]);
    const run = (el, pe) => {
      GSServicePicker.mount('pe' + el, el, { catalog: cat, division: 'Janitorial', mode: 'levels', groupByCategory: true, workToggle: true, workMode: 'units', showPackages: true, packageEdit: pe });
      const g = document.getElementById(el);
      const head = g.querySelector('.gs-sp-area-head[data-pkg="P-1"]'); if (head) head.click();
      const ed = g.querySelector('[data-pedit-open="P-1"]'); if (ed) ed.click();
      return g.textContent;
    };
    return { named: run('d', { clientId: 'GS-1001', clientName: 'Maple Court Apartments', customSkus: { 'P-1': true }, onSave() {}, onReset() {} }),
      noname: run('e', { clientId: 'GS-1001', customSkus: { 'P-1': true }, onSave() {}, onReset() {} }) };
  });
  check('v1.70.0: the client package editor says the client name, never the id', /Custom for Maple Court Apartments/.test(pe.named) && /Only Maple Court Apartments gets this version/.test(pe.named) && /Save for Maple Court Apartments/.test(pe.named) && !/GS-1001/.test(pe.named) && !/GS-1001/.test(pe.noname) && /this client/.test(pe.noname), { named: pe.named.slice(0, 300), noname: pe.noname.slice(0, 300) });
  check('v1.69.0: without it (or any other value) 2 columns as before, same class', cc.two === 2 && cc.other === 2 && cc.cls2 === 'gs-sp-accordion', cc);
  await p2.close();
  await b.close();
  console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
