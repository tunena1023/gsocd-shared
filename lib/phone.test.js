/* node lib/phone.test.js -- lib/phone.js (CFO 21/10/2026). Servidor con Node solo; la pantalla en Chromium
   (playwright por NODE_PATH, como services-box.test.js): teclear letras y guiones, el 11 que ya no entra, pegar dos
   numeros, pegar "(515) 288-8309", 9 digitos, un telefono viejo con dos numeros. */
'use strict';
const path = require('path'), fs = require('fs');
const P = require('./phone');
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 400) : '')); } };

/* ---- servidor ---- */
check('10 digits -> ok, formatted', JSON.stringify(P.normalize('5152888309')) === JSON.stringify({ ok: true, value: '(515) 288-8309', error: '' }));
check('already formatted -> ok, same', P.normalize('(515) 288-8309').value === '(515) 288-8309' && P.normalize('515-288-8309').ok);
check('9 digits -> "Phone: 10 digits."', P.normalize('515288830').error === 'Phone: 10 digits.');
check('two numbers -> "Phone: 10 digits only." (never picks one)', P.normalize('Office: 515-346-6855 Cell: 515-554-5307').error === 'Phone: 10 digits only.' &&
  P.normalize('515-554-5307, 620-875-0785').error === 'Phone: 10 digits only.' && P.normalize('Office: 515-346-6855').error === 'Phone: 10 digits only.');
check('+1 / 11 digits / letters -> only', P.normalize('+1 515 288 8309').error === 'Phone: 10 digits only.' && P.normalize('15152888309').error === 'Phone: 10 digits only.' && P.normalize('515288830x').error === 'Phone: 10 digits only.');
check('empty: fine when optional, error when required', P.normalize('').ok && P.normalize('  ').value === '' && P.normalize('', { required: true }).error === 'Phone: 10 digits.');
check('format leaves a bad value as it is', P.format('Office: 515') === 'Office: 515' && P.format('5152888309') === '(515) 288-8309');

/* ---- pantalla ---- */
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = null; }
(async () => {
  if (!chromium) { check('playwright available (NODE_PATH) for the screen tests', false); return done(); }
  const exe = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined);
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  const p = await b.newPage();
  await p.setContent('<!doctype html><html><body><div class="w"><input id="a" data-gs-phone></div><input id="old" value="Office: 515-346-6855 Cell: 515-554-5307"><div id="later"></div><input id="other"></body></html>');
  await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'phone.js'), 'utf8') });
  const val = id => p.$eval('#' + id, el => el.value);
  const msg = id => p.$eval('#' + id, el => { const m = el.__gsPhoneMsg; return m && m.style.display !== 'none' ? m.textContent : ''; });
  const paste = (id, text) => p.$eval('#' + id, (el, t) => { el.focus(); const dt = new DataTransfer(); dt.setData('text', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, text);
  const clear = id => p.$eval('#' + id, el => { el.value = ''; delete el.dataset.gsPhoneLegacy; });

  await p.click('#a'); await p.keyboard.type('a5b1-5 (2)8x8.8 309');
  check('typing letters, dashes, spaces, parentheses: only the digits are written, formatted at 10', await val('a') === '(515) 288-8309', await val('a'));
  await p.keyboard.type('77');
  check('the 11th digit is not written', await val('a') === '(515) 288-8309', await val('a'));
  check('no message for typing past 10', await msg('a') === '');
  await clear('a'); await paste('a', 'Office: 515-346-6855 Cell: 515-554-5307');
  check('paste two numbers: digits go in up to 10, the rest is not written', await val('a') === '(515) 346-6855', await val('a'));
  await clear('a'); await paste('a', '(515) 288-8309');
  check('paste "(515) 288-8309": (515) 288-8309', await val('a') === '(515) 288-8309', await val('a'));
  await clear('a'); await p.click('#a'); await p.keyboard.type('515288830'); await p.click('#other');
  check('9 digits, leave the field: red "Phone: 10 digits."', await msg('a') === 'Phone: 10 digits.' && await p.$eval('#a', el => el.classList.contains('gs-phone-bad')), await msg('a'));
  check('...and check() before saving says the same', await p.evaluate(() => GSPhone.check(document.getElementById('a'), { required: true })) === 'Phone: 10 digits.');
  await p.click('#a'); await p.keyboard.press('End'); await p.keyboard.type('9');
  check('...one more digit: formatted and the red goes away', await val('a') === '(515) 288-8309' && await msg('a') === '' && await p.evaluate(() => GSPhone.check(document.getElementById('a'))) === '');
  await p.click('#a'); await p.keyboard.press('Backspace');
  check('backspace on a formatted phone: back to digits (9)', await val('a') === '515288830', await val('a'));

  /* Telefono viejo con dos numeros: no se cambia solo. */
  await p.evaluate(() => GSPhone.attach(document.getElementById('old')));
  check('an old phone with two numbers is NOT changed when the field opens', await val('old') === 'Office: 515-346-6855 Cell: 515-554-5307');
  /* 21/10/2026 (CFO): el viejo ya no impide guardar lo demas: ambar, y check() lo deja pasar mientras no se toque. */
  check('...it shows in AMBER "Old phone, kept as is…" (not red)', /^Old phone, kept as is/.test(await msg('old')) && await p.$eval('#old', el => el.classList.contains('gs-phone-old') && !el.classList.contains('gs-phone-bad')), await msg('old'));
  check('...check() lets the rest save while it is not touched', await p.evaluate(() => GSPhone.check(document.getElementById('old'))) === '' && await val('old') === 'Office: 515-346-6855 Cell: 515-554-5307');
  check('...check({ strict: true }) still blocks it (e.g. it goes to QuickBooks)', await p.evaluate(() => GSPhone.check(document.getElementById('old'), { strict: true })) === 'Phone: 10 digits only.');
  await p.click('#old'); await p.keyboard.press('End'); await p.keyboard.type('5');
  check('...nothing can be added to it', await val('old') === 'Office: 515-346-6855 Cell: 515-554-5307', await val('old'));
  await p.click('#old'); await p.keyboard.press('End'); await p.keyboard.press('Backspace');
  check('...once it is changed and still not one phone: red, and check() blocks it', await msg('old') === 'Phone: 10 digits only.' && await p.evaluate(() => GSPhone.check(document.getElementById('old'))) === 'Phone: 10 digits only.', await msg('old'));
  await p.click('#old', { clickCount: 3 }); await p.keyboard.type('5155546');
  check('...select all and type: it is replaced by the digits typed', await val('old') === '5155546' && await p.$eval('#old', el => !el.dataset.gsPhoneLegacy), await val('old'));
  await p.$eval('#old', el => { el.value = 'Cell: 515-554-5307'; el.dataset.gsPhoneLegacy = '1'; });
  await p.click('#old'); await p.keyboard.press('Home'); for (let i = 0; i < 6; i++) await p.keyboard.press('Delete');
  check('...deleting "Cell: " leaves a clean number: formatted, no red', await val('old') === '(515) 554-5307' && await msg('old') === '', [await val('old'), await msg('old')]);

  /* data-gs-phone en algo que se pinta despues. */
  await p.$eval('#later', el => { el.innerHTML = '<input id="dyn" data-gs-phone>'; });
  await p.waitForTimeout(30);
  await p.click('#dyn'); await p.keyboard.type('515-288-8309 ext 4');
  check('an input painted later with data-gs-phone works the same', await val('dyn') === '(515) 288-8309', await val('dyn'));
  const ph = await p.$eval('#dyn', el => [el.getAttribute('inputmode'), el.getAttribute('placeholder')]);
  check('numeric keyboard on phones and a (515) 288-8309 hint', ph[0] === 'numeric' && ph[1] === '(515) 288-8309', ph);
  await b.close();
  done();
})().catch(e => { console.error(e); bad++; done(); });
function done() { console.log('\n' + ok + ' OK, ' + bad + ' FAIL'); process.exitCode = bad ? 1 : 0; }
