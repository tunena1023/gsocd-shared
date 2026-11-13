/* Prueba de address.js: node address/address.test.js (sin dependencias; una ventana de mentiras para la liga). */
'use strict';
let ok = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { ok++; console.log('OK   - ' + name); } else { fail++; console.log('FAIL - ' + name + ' got ' + g + ' want ' + w); }
};

/* Ventana de mentiras: document.hidden, visibilitychange, location y window.open. */
const listeners = {};
const opened = [], navs = [];
const doc = {
  hidden: false,
  addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
  removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter(x => x !== f); },
  getElementById: () => null, createElement: () => ({}), head: { appendChild() {} }
};
const win = { location: {}, open: (u, t, f) => opened.push([u, t, f]) };
let blockNav = false;
Object.defineProperty(win.location, 'href', { set: v => { if (blockNav) throw new Error('blocked'); navs.push(v); }, get: () => '' });
global.document = doc; global.window = win;
const A = require('./address.js');
global.GSAddress = A;

/* Renglones */
const altoona = { Address: '2618 28th Ave SW', City: 'Altoona', Zip: '50009' };
eq('dos renglones', A.lines(altoona), ['2618 28th Ave SW', 'Altoona, IA 50009']);
eq('con suite', A.lines({ Address: '1000 Commerce Pkwy SW', Suite: 'Suite 201', City: 'Bondurant', Zip: '50035' }), ['1000 Commerce Pkwy SW, Suite 201', 'Bondurant, IA 50035']);
eq('sin zip: lo que haya', A.lines({ Address: '1405 SE First St', City: 'Des Moines' }), ['1405 SE First St', 'Des Moines, IA']);
eq('sin ciudad: lo que haya', A.lines({ Address: '1405 SE First St', Zip: '50315' }), ['1405 SE First St', 'IA 50315']);
eq('sin ciudad ni zip: solo la calle (sin "IA" suelto)', A.lines({ Address: '17 Cedar Point Rd' }), ['17 Cedar Point Rd']);
eq('sin calle: solo la ciudad', A.lines({ City: 'Newton', Zip: '50208' }), ['Newton, IA 50208']);
eq('nada', A.lines({}), []);
eq('null', A.lines(null), []);
eq('City "IA" (dato chueco) no se repite', A.lines({ Address: '7109 SE 5th St Des Moines', City: 'IA', Zip: '50315' }), ['7109 SE 5th St Des Moines', 'IA 50315']);
eq('estado que trae', A.lines({ Address: '1 Main St', City: 'Omaha', State: 'NE', Zip: '68102' }), ['1 Main St', 'Omaha, NE 68102']);
eq('minusculas (address/city/zip)', A.lines({ address: '500 Walnut St', city: 'Des Moines', zip: '50309' }), ['500 Walnut St', 'Des Moines, IA 50309']);
eq('espacios de mas', A.lines({ Address: '  88  Oakview Ct ', City: ' West Des Moines ', Zip: ' 50265' }), ['88 Oakview Ct', 'West Des Moines, IA 50265']);
eq('numeros como numero', A.lines({ Address: '1 Main St', City: 'Ames', Zip: 50014 }), ['1 Main St', 'Ames, IA 50014']);
eq('text en un renglon', A.text(altoona), '2618 28th Ave SW, Altoona, IA 50009');

/* Plataforma */
eq('iPhone', A.platform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)' }), 'ios');
eq('iPad que dice Mac (iPadOS)', A.platform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
eq('Mac de escritorio', A.platform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }), '');
eq('Android', A.platform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129 Mobile' }), 'android');
eq('Windows', A.platform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129' }), '');

/* Ligas */
const Q = '2618%2028th%20Ave%20SW%2C%20Altoona%2C%20IA%2050009';
eq('iPhone -> Apple Maps', A.mapHref(altoona, 'ios'), 'https://maps.apple.com/?q=' + Q);
eq('Android -> geo:', A.mapHref(altoona, 'android'), 'geo:0,0?q=' + Q);
eq('compu -> sin liga', A.mapHref(altoona, ''), '');
eq('sin direccion -> sin liga', A.mapHref({}, 'ios'), '');
eq('respaldo Google Maps', A.fallbackHref(altoona), 'https://www.google.com/maps/search/?api=1&query=' + Q);
eq('caracteres raros codificados', A.mapHref({ Address: '12 & 14 "A" St #3', City: 'Ames' }, 'android'), 'geo:0,0?q=12%20%26%2014%20%22A%22%20St%20%233%2C%20Ames%2C%20IA');

/* HTML */
eq('compu: texto, sin liga', A.html(altoona, { link: true, platform: '' }), '<span class="gs-address">2618 28th Ave SW<br>Altoona, IA 50009</span>');
eq('sin link: texto aunque sea celular', A.html(altoona, { platform: 'ios' }), '<span class="gs-address">2618 28th Ave SW<br>Altoona, IA 50009</span>');
eq('nada -> vacio', A.html({}, { link: true, platform: 'ios' }), '');
eq('escapa', A.html({ Address: '<b>1 "A" St</b>' }, { platform: '' }), '<span class="gs-address">&lt;b&gt;1 &quot;A&quot; St&lt;/b&gt;</span>');
const ios = A.html(altoona, { link: true, platform: 'ios', cls: 'x' });
eq('iPhone: liga Apple Maps en otra ventana', /^<a class="gs-address x gs-address-link" href="https:\/\/maps\.apple\.com\/\?q=[^"]+" data-fallback="[^"]+" target="_blank" rel="noopener" onclick="return GSAddress\.open\(event, this\)">2618 28th Ave SW<br>Altoona, IA 50009<\/a>$/.test(ios), true);
const andr = A.html(altoona, { link: true, platform: 'android' });
eq('Android: liga geo: en la misma ventana', /href="geo:0,0\?q=/.test(andr) && !/target=/.test(andr), true);

/* open(): la liga no abre la tarjeta; Android cae a Google Maps si nada lo abrio */
const anchor = href => { const at = { href, 'data-fallback': A.fallbackHref(altoona) }; return { getAttribute: k => at[k] }; };
const evt = () => { const e = { stopped: 0, prevented: 0 }; e.stopPropagation = () => e.stopped++; e.preventDefault = () => e.prevented++; return e; };
const realTimeout = global.setTimeout; let timers = [];
global.setTimeout = (fn, ms) => { timers.push([fn, ms]); return timers.length; };
const flush = () => { const t = timers; timers = []; t.forEach(([fn]) => fn()); };

let e = evt();
eq('iPhone: deja seguir la liga', A.open(e, anchor('https://maps.apple.com/?q=' + Q)), true);
eq('iPhone: no abre/cierra la tarjeta', [e.stopped, e.prevented], [1, 0]);

e = evt(); let a = anchor('geo:0,0?q=' + Q);
eq('Android: se queda en la pagina', A.open(e, a), false);
eq('Android: no abre/cierra la tarjeta', [e.stopped, e.prevented], [1, 1]);
eq('Android: manda geo:', navs.slice(-1), ['geo:0,0?q=' + Q]);
eq('Android: espera 1.5 s', timers.map(t => t[1]), [1500]);
eq('doble toque: una sola vez', [A.open(evt(), a), navs.length, timers.length], [false, 1, 1]);
flush();
eq('Android sin app de mapas: Google Maps en otra ventana', opened, [['https://www.google.com/maps/search/?api=1&query=' + Q, '_blank', 'noopener']]);
eq('se puede volver a tocar', (A.open(evt(), a), navs.length), 2);
/* Con app: la pagina se va al fondo -> no se abre Google Maps de mas. */
doc.hidden = true; (listeners.visibilitychange || []).forEach(f => f());
doc.hidden = false; flush();
eq('Android con app: no abre Google Maps de mas', opened.length, 1);
eq('ya no escucha visibilitychange', (listeners.visibilitychange || []).length, 0);
/* La app de mapas tarda y la pagina sigue oculta al final: tampoco. */
A.open(evt(), a); doc.hidden = true; flush(); doc.hidden = false;
eq('pagina oculta al final: no abre Google Maps', opened.length, 1);
/* location.href que truena (navegador raro): igual cae al respaldo. */
blockNav = true;
A.open(evt(), a); flush();
eq('geo: bloqueado: cae a Google Maps', opened.length, 2);
global.setTimeout = realTimeout;

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
