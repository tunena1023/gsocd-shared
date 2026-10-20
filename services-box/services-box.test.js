/* node services-box/services-box.test.js -- GSServicesBox.editor en Chromium (20/10/2026).
   - Lo de antes: sin las opciones nuevas, el editor pinta EXACTAMENTE lo mismo que la version anterior (git HEAD~ o
     OLD_BOX=<archivo>): normal, con quitados, con lapiz de notas y con pencil:false.
   - Lo nuevo (Admin "Correct this visit", maqueta v4 de la CFO): reasonOnPencil (el quitado sale tachado con la nota
     cerrada y un ✎ que la abre), noteOpen / onNoteOpen (controlado) y noteExtraHtml (arriba de la nota del ✎).
   Necesita playwright (NODE_PATH) y Chromium (CHROMIUM o el de Playwright). */
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process');
const { chromium } = require('playwright');
const NEW = fs.readFileSync(path.join(__dirname, 'services-box.js'), 'utf8');
let OLD = '';
try { OLD = process.env.OLD_BOX ? fs.readFileSync(process.env.OLD_BOX, 'utf8') : cp.execSync('git show HEAD~:services-box/services-box.js', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }); } catch (e) { OLD = ''; }
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 400) : '')); } };
const CATALOG = [
  { sku: '111-10', serviceName: 'Common Area Vacuuming', division: 'Janitorial', category: 'Floors' },
  { sku: '111-12', serviceName: 'Trash Removal', division: 'Janitorial', category: 'Trash' },
  { sku: '111-14', serviceName: 'Carpet Spot Treatment', division: 'Janitorial', category: 'Floors' },
  { sku: '410-12', serviceName: 'Blinds', division: 'Renovations', category: 'Windows', requiresQuantity: true }
];
const SVC = [
  { ServiceName: 'Common Area Vacuuming', SubOption: '111-10', Level: 'Level 2' },
  { ServiceName: 'Trash Removal', SubOption: '111-12', Level: 'Level 1', removed: true, note: 'Dumpster blocked' },
  { ServiceName: 'Carpet Spot Treatment', SubOption: '111-14', Level: 'Level 1', removed: true }
];
const page = async (b, src) => {
  const p = await b.newPage();
  await p.setContent('<!doctype html><html><body><div id="a"></div><div id="b"></div><div id="c"></div><div id="d"></div></body></html>');
  await p.addScriptTag({ content: src });
  await p.evaluate(([c, s]) => { window.CAT = c; window.SVC = s; }, [CATALOG, SVC]);
  return p;
};
const OLD_CASES = async p => p.evaluate(() => {
  const S = () => JSON.parse(JSON.stringify(window.SVC));
  GSServicesBox.editor({ el: 'a', division: 'Janitorial', services: S(), catalog: CAT });
  GSServicesBox.editor({ el: 'b', division: 'Janitorial', services: S(), catalog: CAT, pencil: false, reasonPlaceholder: 'Why?', removedLabel: n => n ? 'not completed — note required' : 'not completed' });
  GSServicesBox.editor({ el: 'c', division: 'Janitorial', services: S(), catalog: CAT, pencil: false, serviceNotes: { list: [{ key: 'sku:111-10', name: 'Common Area Vacuuming', text: 'Lobby first', by: 'CFO', at: '2026-10-19T15:00:00Z' }], by: 'CFO' } });
  GSServicesBox.editor({ el: 'd', division: 'Janitorial', services: S(), catalog: CAT, reasonInline: false, rowExtraHtml: () => '<i>cam</i>' });
  return ['a', 'b', 'c', 'd'].map(id => document.getElementById(id).innerHTML);
});
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  if (OLD) {
    const po = await page(b, OLD), pn = await page(b, NEW);
    const [ho, hn] = [await OLD_CASES(po), await OLD_CASES(pn)];
    ['default', 'pencil:false', 'serviceNotes', 'reasonInline:false'].forEach((n, k) => check('sin opciones nuevas pinta igual que antes: ' + n, ho[k] === hn[k], { old: ho[k].length, now: hn[k].length }));
    await po.close(); await pn.close();
  } else console.log('SKIP - no hay version anterior para comparar');

  const p = await page(b, NEW);
  /* reasonOnPencil sin controlar: quitados tachados, nota cerrada, ✎ abre y cierra; noteExtraHtml arriba. */
  const r1 = await p.evaluate(() => {
    const el = document.getElementById('a'); el.innerHTML = '';
    GSServicesBox.editor({ el, division: 'Janitorial', services: JSON.parse(JSON.stringify(SVC)), catalog: CAT, pencil: false, reasonOnPencil: true,
      serviceNotes: { list: [], by: 'CFO' }, noteExtraHtml: (row, i) => '<div class="fq" data-i="' + i + '">Frequency of ' + row.name + '</div>' });
    const out = {};
    out.textareas = el.querySelectorAll('[data-act="why"]').length;
    out.wpens = el.querySelectorAll('[data-act="wpen"]').length;
    out.strike = [...el.querySelectorAll('.gs-svb-ed-row span[style*="line-through"]')].map(s => s.textContent);
    el.querySelector('[data-act="wpen"][data-i="1"]').click();
    out.afterOpen = { why: el.querySelectorAll('[data-act="why"]').length, whyVal: (el.querySelector('[data-act="why"][data-i="1"]') || {}).value, fq: (el.querySelector('.fq[data-i="1"]') || {}).textContent,
      on: el.querySelector('[data-act="wpen"][data-i="1"]').classList.contains('on'), focus: document.activeElement && document.activeElement.getAttribute('data-act') };
    el.querySelector('[data-act="wpen"][data-i="1"]').click();
    out.afterClose = el.querySelectorAll('[data-act="why"]').length;
    /* ✎ de un servicio hecho (notas): abre su caja con noteExtraHtml arriba. */
    el.querySelector('[data-act="sn"][data-i="0"]').click();
    out.sn = { snt: el.querySelectorAll('[data-act="snt"]').length, fq: (el.querySelector('.fq[data-i="0"]') || {}).textContent };
    /* × en uno hecho: queda quitado con su nota ABIERTA (para escribir por que). */
    el.querySelector('[data-act="snt"]').blur();
    el.querySelector('[data-act="x"][data-i="0"]').click();
    out.removedNow = { why0: !!el.querySelector('[data-act="why"][data-i="0"]'), why2: !!el.querySelector('[data-act="why"][data-i="2"]') };
    return out;
  });
  check('reasonOnPencil: ningun quitado trae su nota abierta al montar', r1.textareas === 0, r1);
  check('reasonOnPencil: cada quitado trae su ✎', r1.wpens === 2, r1);
  check('reasonOnPencil: quitados tachados', r1.strike.join('|') === 'Trash Removal|Carpet Spot Treatment', r1.strike);
  check('✎ del quitado abre SU nota con lo escrito y el foco', r1.afterOpen.why === 1 && r1.afterOpen.whyVal === 'Dumpster blocked' && r1.afterOpen.on && r1.afterOpen.focus === 'why', r1.afterOpen);
  check('noteExtraHtml arriba de la nota del quitado', r1.afterOpen.fq === 'Frequency of Trash Removal', r1.afterOpen);
  check('otro clic en el ✎ la cierra', r1.afterClose === 0, r1);
  check('✎ de un servicio hecho: su caja de nota con noteExtraHtml', r1.sn.snt === 1 && r1.sn.fq === 'Frequency of Common Area Vacuuming', r1.sn);
  check('× en uno hecho: su nota abre para escribir por que; las otras siguen cerradas', r1.removedNow.why0 && !r1.removedNow.why2, r1.removedNow);

  /* Controlado: noteOpen al montar y onNoteOpen avisa (no cambia solo). */
  const r2 = await p.evaluate(() => {
    const el = document.getElementById('b'); el.innerHTML = ''; const calls = [];
    const s = JSON.parse(JSON.stringify(SVC)); s[2].noteOpen = true;
    GSServicesBox.editor({ el, division: 'Janitorial', services: s, catalog: CAT, pencil: false, reasonOnPencil: true, onRemove: () => {}, onNoteOpen: (i, open, row) => calls.push([i, open, row.name]) });
    const open0 = [...el.querySelectorAll('[data-act="why"]')].map(t => t.getAttribute('data-i'));
    el.querySelector('[data-act="wpen"][data-i="1"]').click();
    return { open0, calls, after: [...el.querySelectorAll('[data-act="why"]')].map(t => t.getAttribute('data-i')) };
  });
  check('noteOpen: solo la que viene abierta sale abierta', r2.open0.join() === '2', r2);
  check('onNoteOpen: avisa (i, true, row) y no cambia solo', JSON.stringify(r2.calls) === JSON.stringify([[1, true, 'Trash Removal']]) && r2.after.join() === '2', r2);
  const r3 = await p.evaluate(() => {
    const el = document.getElementById('c'); el.innerHTML = '';
    GSServicesBox.editor({ el, division: 'Janitorial', services: JSON.parse(JSON.stringify(SVC)), catalog: CAT, pencil: false, countAll: true });
    const a = el.querySelector('[data-part="meta"]').textContent;
    el.innerHTML = ''; GSServicesBox.editor({ el, division: 'Janitorial', services: JSON.parse(JSON.stringify(SVC)), catalog: CAT, pencil: false });
    return [a, el.querySelector('[data-part="meta"]').textContent];
  });
  check('countAll: "3 services" (2 of them not done); without it "1 service" like before', r3[0] === '3 services' && r3[1] === '1 service', r3);

  /* Con el mouse de verdad (20/10/2026, QA de Admin): la nota del ✎ abierta se cierra con el blur del mousedown, pero el
     renglon se repinta despues del click: el clic en otro ✎, en un boton de noteExtraHtml o fuera del editor no se pierde,
     y lo escrito se guarda antes de ese click. */
  await p.evaluate(() => {
    const el = document.getElementById('d'); el.innerHTML = '';
    window.LOG = []; window.SAVED = [];
    document.body.insertAdjacentHTML('beforeend', '<button id="outside" onclick="LOG.push(\'outside:\' + SAVED.length)">Save</button>');
    const svc = [{ ServiceName: 'Common Area Vacuuming', SubOption: '111-10', Level: 'Level 2' }, { ServiceName: 'Trash Removal', SubOption: '111-12', Level: 'Level 1' }];
    GSServicesBox.editor({ el, division: 'Janitorial', services: svc, catalog: CAT, pencil: false, onRemove: () => {},
      serviceNotes: { list: [], by: 'CFO', onSave: (row, text) => { SAVED.push(row.name + ':' + text); return Promise.resolve(null); } },
      noteExtraHtml: (row, i) => '<button type="button" class="fqb" data-i="' + i + '" onclick="LOG.push(\'fq' + i + '\')">Monthly</button>' });
  });
  const D = '#d ';
  await p.click(D + '[data-act="sn"][data-i="0"]');
  const m1 = await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-act') + document.activeElement.getAttribute('data-i'));
  await p.click(D + '.fqb[data-i="0"]');
  const m2 = await p.evaluate(() => LOG.slice());
  await p.waitForTimeout(450); /* el clic en la frecuencia cerro la nota (aqui sin preventDefault); se vuelve a abrir */
  if (!(await p.$(D + '[data-act="snt"][data-i="0"]'))) await p.click(D + '[data-act="sn"][data-i="0"]');
  await p.type(D + '[data-act="snt"][data-i="0"]', 'Lobby first');
  await p.click(D + '[data-act="sn"][data-i="1"]'); await p.waitForTimeout(50);
  const m3 = await p.evaluate(() => ({ open: [...document.querySelectorAll('#d [data-act="snt"]')].map(t => t.getAttribute('data-i')), focus: document.activeElement && document.activeElement.getAttribute('data-act') + document.activeElement.getAttribute('data-i'), saved: SAVED.slice() }));
  await p.type(D + '[data-act="snt"][data-i="1"]', 'Bags in the closet');
  await p.click('#outside'); await p.waitForTimeout(50);
  const m4 = await p.evaluate(() => ({ log: LOG.slice(), saved: SAVED.slice(), open: document.querySelectorAll('#d [data-act="snt"]').length }));
  check('mouse: el ✎ abre su nota con el foco', m1 === 'snt0', m1);
  check('mouse: el clic en un boton de noteExtraHtml llega (no se pierde con el blur de la nota)', m2.indexOf('fq0') !== -1, m2);
  check('mouse: con una nota abierta, UN clic en otro ✎ abre esa (la primera se guarda y se cierra; el foco queda en la nueva)', m3.open.join() === '1' && m3.focus === 'snt1' && m3.saved.join('|') === 'Common Area Vacuuming:Lobby first', m3);
  check('mouse: con la nota abierta, el clic en un boton de afuera llega y la nota ya estaba guardada', m4.log.indexOf('outside:2') !== -1 && m4.saved.length === 2 && m4.open === 0, m4);
  /* compact (CFO 20/10): renglones mas bajos, L1-L3 y botones mas chicos; mismos datos y mismos botones. */
  const cm = await p.evaluate(() => {
    const mk = (id, compact) => { const el = document.getElementById(id); el.innerHTML = ''; el.style.width = '600px';
      GSServicesBox.editor({ el, division: 'Janitorial', services: JSON.parse(JSON.stringify(window.SVC)), catalog: CAT, pencil: false, reasonOnPencil: true, compact }); };
    mk('a', false); mk('b', true);
    const m = id => { const q = s => document.querySelector('#' + id + ' ' + s); const r = q('.gs-svb-ed-row'), lv = q('.gs-sp-lvl-btn');
      return { root: !!q('.gs-svb-ed-compact'), rowH: r.getBoundingClientRect().height, lvW: lv.getBoundingClientRect().width, lvH: lv.getBoundingClientRect().height,
        acts: [...document.querySelectorAll('#' + id + ' [data-act]')].map(e => e.getAttribute('data-act') + e.getAttribute('data-i')).join(),
        text: document.querySelector('#' + id + ' [data-part="list"]').innerText.replace(/\s+/g, ' ') }; };
    return { a: m('a'), b: m('b') };
  });
  check('compact: clase gs-svb-ed-compact solo con la opcion', !cm.a.root && cm.b.root, cm);
  check('compact: renglon mas bajo y L1-L3 mas chicos', cm.b.rowH < cm.a.rowH - 10 && cm.b.lvW < cm.a.lvW && cm.b.lvH < cm.a.lvH, cm);
  check('compact: mismos botones y mismo texto', cm.a.acts === cm.b.acts && cm.a.text === cm.b.text, cm);
  /* compact a lo angosto (CFO 20/10, sin zigzag): a 270px, con un nombre largo, la camarita del portal (svc-row-cam, 32px como
     Admin) y el flex-wrap que Admin le pone al renglon en el celular, los controles quedan en el MISMO renglon que el nombre en
     TODOS los servicios (antes: los cortos al lado y los largos abajo). */
  const nz = await p.evaluate(() => {
    if (!document.getElementById('nz-css')) { const st = document.createElement('style'); st.id = 'nz-css';
      st.textContent = '.svc-row-cam{flex-shrink:0;width:32px;height:32px;display:inline-flex}.gs-svb-ed-row > div:first-child{flex-wrap:wrap;gap:6px}.gs-svb-ed-row > div:first-child > span:first-child{white-space:normal}';
      document.head.appendChild(st); }
    const el = document.getElementById('b'); el.innerHTML = ''; el.style.width = '270px';
    const svc = [{ ServiceName: 'Vacuuming', SubOption: '111-10', Category: 'Commercial', Level: 'Level 2' }, { ServiceName: 'Dusting (surfaces, ledges & handrails)', SubOption: '111-22', Category: 'Commercial', Level: 'Level 1' },
      { ServiceName: 'Strip and wax', SubOption: '111-41', Category: 'Commercial', Level: 'Level 1' }, { ServiceName: 'Carpet Spot Treatment', SubOption: '111-14', Category: 'Commercial', Level: 'Level 2' }];
    GSServicesBox.editor({ el, division: 'Janitorial', services: svc, catalog: CAT, pencil: false, compact: true, serviceNotes: { list: [], by: 'x', onSave: () => Promise.resolve(null) },
      rowExtraHtml: () => '<button type="button" class="svc-row-cam" style="margin-right:10px">c</button>' });
    return [...el.querySelectorAll('.gs-svb-ed-line')].map(l => { const n = l.firstElementChild.getBoundingClientRect(), c = l.lastElementChild.getBoundingClientRect();
      return { sameRow: c.top < n.bottom - 2, right: Math.round(c.right), fits: c.right <= el.getBoundingClientRect().right + 1, noOverlap: n.right <= c.left + 1, lines: Math.round(n.height / parseFloat(getComputedStyle(l.firstElementChild).lineHeight || 16)), over: l.firstElementChild.scrollWidth > l.firstElementChild.clientWidth + 1 }; });
  });
  check('compact: a 270px los controles se quedan en el renglon del nombre en todos, sin encimarse (sin zigzag)', nz.length === 4 && nz.every(r => r.sameRow && r.fits && r.noOverlap && !r.over), nz);
  check('compact: a 270px los controles quedan alineados a la derecha, iguales en todos', new Set(nz.map(r => r.right)).size === 1, nz);
  check('compact: el nombre largo baja a 2 renglones en su lugar (los cortos en 1)', nz[0].lines === 1 && nz[2].lines === 1 && nz[1].lines >= 2, nz);
  await b.close();
  console.log('\n' + ok + ' ok, ' + bad + ' failed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
