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
  /* v1.71.0: categoryStyle 'soft' redondea las categorias; sin la opcion, igual. */
  const cs = await p2.evaluate(() => {
    GSServicePicker.mount('s1', 'a', { catalog: CAT, division: 'Janitorial', mode: 'levels', crossDivision: true, groupByCategory: true, categoryStyle: 'soft' });
    GSServicePicker.mount('s2', 'b', { catalog: CAT, division: 'Janitorial', mode: 'levels', crossDivision: true, groupByCategory: true, categoryStyle: 'other' });
    const r = el => getComputedStyle(document.getElementById(el).querySelector('.gs-sp-cat-group')).borderTopLeftRadius;
    return { soft: r('a'), plain: r('b'), cls: document.getElementById('b').querySelector('.gs-sp-accordion').className };
  });
  check('v1.71.0: categoryStyle soft rounds the categories; any other value stays as before', cs.soft === '8px' && cs.plain === '4px' && cs.cls === 'gs-sp-accordion', cs);

  /* ---- v1.72.0 (CFO 22/10): paquetes = templates ---- */
  const PK = CATALOG.concat([{ sku: 'P-1', serviceName: 'Unit Turnover Package', division: 'Janitorial', propertyType: 'Commercial', category: 'Package',
    packageItems: [{ sku: '111-10', level: 'Level 1' }, { sku: '111-12', level: 'Level 2' }, { sku: '410-12', level: '' }] }]);
  const v72 = await p2.evaluate(pk => {
    const out = {}, g = id => document.getElementById(id);
    const units = { catalog: pk, division: 'Janitorial', mode: 'levels', crossDivision: true, groupByCategory: true, workToggle: true, workMode: 'units', showPackages: true };
    /* 1. Template: Edit sin Apply; Save Template (commitEdit) guarda lo que se ve. */
    let tchg = 0;
    const t = GSServicePicker.mount('t72', 'a', Object.assign({ place: 'template', onChange: () => tchg++ }, units));
    g('a').querySelector('.gs-sp-area-head[data-pkg="P-1"]').click();
    g('a').querySelector('[data-pkg-cedit="P-1"]').click();
    out.noApply = !/Apply to this template/.test(g('a').textContent) && !g('a').querySelector('[data-uedit-save]') && /Save Template/.test(g('a').textContent);
    g('a').querySelector('[data-uedit-rm="0"]').click();                          // quita Common Area Vacuuming
    g('a').querySelector('[data-uedit-lv="Level 3"][data-uedit-i="0"]').click();  // Trash L3
    const qi = g('a').querySelector('[data-uedit-qty="1"]'); qi.value = '4'; qi.dispatchEvent(new Event('input'));
    out.hasOpen = t.hasOpenEdit();
    out.commit = t.commitEdit();
    const s1 = t.getState();
    out.tSel = s1.selected.Commercial; out.tLv = s1.levels; out.tQty = s1.quantities; out.tChg = tchg;
    /* 2. Template: cambiar de tarjeta con el Edit abierto se queda con lo editado (no se pierde). */
    const t2 = GSServicePicker.mount('t72b', 'b', Object.assign({ place: 'template', usualSets: [{ key: 'u1', name: 'Usual order', division: 'Janitorial', items: [{ sku: '111-14', level: 'Level 1' }] }] }, units));
    g('b').querySelector('.gs-sp-area-head[data-pkg="P-1"]').click();
    g('b').querySelector('[data-pkg-cedit="P-1"]').click();
    g('b').querySelector('[data-uedit-rm="2"]').click();                          // quita Blinds
    g('b').querySelector('.gs-sp-area-head[data-usual="usual:u1"]').click();      // otra tarjeta
    const s2 = t2.getState().selected.Commercial;
    out.kept = s2 && !s2['Unit Turnover Package'] && s2['Trash Removal'] === '111-12' && !s2['Blinds'];
    /* 3. New Order: Save my package manda nivel y cantidad, y la orden se queda con lo editado. */
    const saves = [];
    const n = GSServicePicker.mount('n72', 'c', Object.assign({ place: 'new-order', usualEdit: { onSave: (name, items, source, tid) => { saves.push({ name, items, source, tid }); return Promise.resolve(); } } }, units));
    g('c').querySelector('.gs-sp-area-head[data-pkg="P-1"]').click();
    g('c').querySelector('[data-pkg-cedit="P-1"]').click();
    g('c').querySelector('[data-uedit-rm="0"]').click();
    const nm = g('c').querySelector('[data-uedit-name]'); nm.value = 'By George'; nm.dispatchEvent(new Event('input'));
    g('c').querySelector('[data-uedit-save]').click();
    out.saves = saves;
    out.nApi = n;
    return new Promise(res => setTimeout(() => {
      out.nSel = n.getState().selected.Commercial;
      /* 4. My package propio trae Edit (con su nombre e id); uno compartido dice Shared y no se edita. */
      const saves2 = [];
      const m = GSServicePicker.mount('m72', 'd', Object.assign({ usualEdit: { onSave: (name, items, source, tid) => { saves2.push({ name, source, tid, items }); return Promise.resolve(); } },
        savedSets: [{ key: '7', name: 'By George', division: 'Janitorial', items: [{ sku: '111-12', level: 'Level 3' }, { sku: '410-12', qty: 2 }] },
                    { key: '9', name: 'Office deep clean', division: 'Janitorial', shared: true, items: [{ sku: '111-14', level: 'Level 2' }] }] }, units));
      out.sharedTag = /Shared/.test(g('d').querySelector('.gs-sp-area-head[data-usual="saved:9"]').textContent) && /My package/.test(g('d').querySelector('.gs-sp-area-head[data-usual="saved:7"]').textContent);
      g('d').querySelector('.gs-sp-area-head[data-usual="saved:9"]').click();
      out.sharedNoEdit = !g('d').querySelector('[data-uedit-open="saved:9"]');
      g('d').querySelector('.gs-sp-area-head[data-usual="saved:7"]').click();
      out.qtyFromSet = m.getQuantities()['Commercial|Blinds'] === 2;
      g('d').querySelector('[data-uedit-open="saved:7"]').click();
      out.nameKept = g('d').querySelector('[data-uedit-name]').value === 'By George';
      g('d').querySelector('[data-uedit-rm="1"]').click();                        // quita Blinds
      g('d').querySelector('[data-uedit-save]').click();
      setTimeout(() => {
        out.saves2 = saves2;
        out.mSel = m.getState().selected.Commercial;
        /* 5. Admin Create Order: packageEdit.resetOnly -> el Edit es el del portal, sin "Save for <cliente>". */
        GSServicePicker.mount('a72', 'e', Object.assign({ usualEdit: { onSave: () => Promise.resolve() }, packageEdit: { resetOnly: true, clientName: 'BICI', customSkus: { 'P-1': true }, onReset() {} } }, units));
        g('e').querySelector('.gs-sp-area-head[data-pkg="P-1"]').click();
        out.adminEdit = !!g('e').querySelector('[data-pkg-cedit="P-1"]') && !g('e').querySelector('[data-pedit-open]') && /Reset to standard/.test(g('e').textContent);
        g('e').querySelector('[data-pkg-cedit="P-1"]').click();
        out.adminSaveMine = /Save my package/.test(g('e').textContent) && !/Save for/.test(g('e').textContent);
        res(out);
      }, 30);
    }, 30));
  }, PK);
  check('v1.72.0: in a template the package Edit has no Apply button (Save Template saves it)', v72.noApply, v72);
  check('v1.72.0: commitEdit() puts what is shown into the template: package out, its services in, with level and quantity',
    v72.hasOpen && v72.commit === '' && !v72.tSel['Unit Turnover Package'] && !v72.tSel['Common Area Vacuuming'] && v72.tSel['Trash Removal'] === '111-12' &&
    v72.tLv['Commercial|Trash Removal'] === 'Level 3' && v72.tQty['Commercial|Blinds'] === 4 && v72.tChg > 0, v72);
  check('v1.72.0: in a template, switching cards with an Edit open keeps the changes', v72.kept, v72);
  check('v1.72.0: Save my package sends name, items with level/qty, source and no id for a new one',
    v72.saves.length === 1 && v72.saves[0].name === 'By George' && v72.saves[0].source === 'package' && v72.saves[0].tid === '' &&
    v72.saves[0].items.map(x => x.sku).join() === '111-12,410-12' && v72.saves[0].items[1].qty === 1, v72.saves);
  check('v1.72.0: after Save my package the order has what was saved (not the whole package)',
    v72.nSel && !v72.nSel['Unit Turnover Package'] && !v72.nSel['Common Area Vacuuming'] && v72.nSel['Trash Removal'] === '111-12', v72.nSel);
  check('v1.72.0: shared packages say Shared and have no Edit; own ones say My package', v72.sharedTag && v72.sharedNoEdit, v72);
  check('v1.72.0: a My package with quantities puts them in the order (Blinds x2)', v72.qtyFromSet, v72);
  check('v1.72.0: editing my own My package keeps its name and saves with its id (updates it)',
    v72.nameKept && v72.saves2.length === 1 && v72.saves2[0].tid === '7' && v72.saves2[0].source === 'saved', v72.saves2);
  check('v1.72.0: what was removed in the edit leaves the order', v72.mSel && !v72.mSel['Blinds'] && v72.mSel['Trash Removal'] === '111-12', v72.mSel);
  check('v1.72.0: Admin Create Order (resetOnly) edits like the portal: Save my package, keeps Reset to standard', v72.adminEdit && v72.adminSaveMine, v72);
  await p2.close();
  await b.close();
  console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
