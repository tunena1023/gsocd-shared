/* node date-time-picker/date-time-picker.test.js -- la hora guardada con AM/PM se lee bien (18/10/2026). */
'use strict';
const assert = require('assert');
const els = {};
global.window = global;
global.document = {
  getElementById: id => els[id] || null,
  createElement: () => ({ set textContent(v) {}, }),
  head: { appendChild: () => {} },
  addEventListener: () => {},
  querySelectorAll: () => [],
  dispatchEvent: () => {}
};
global.Event = function () {}; global.CustomEvent = function () {};
require('./date-time-picker.js');
const P = global.GSDateTimePicker;
const trig = html => (/id="gs-dtp-trigger-[^"]+"[^>]*>([^<]*)</.exec(html) || [])[1];
const pmOn = html => /class="active"[^>]*>PM</.test(html);
assert.strictEqual(trig(P.timeHtml('a', '18:00')), '6:00 PM');
assert.strictEqual(trig(P.timeHtml('b', '6:00 PM')), '6:00 PM', 'a time saved as "6:00 PM" shows PM');
assert.ok(pmOn(P.timeHtml('c', '6:00 PM')), 'the PM button is on');
assert.strictEqual(trig(P.timeHtml('d', '7:30 AM')), '7:30 AM');
assert.strictEqual(trig(P.timeHtml('e', '12:00 PM')), '12:00 PM');
assert.strictEqual(trig(P.timeHtml('f', '12:15 AM')), '12:15 AM');
assert.strictEqual(trig(P.timeHtml('g', '07:00')), '7:00 AM');
/* Tocar el reloj guarda en 24 h con la tarde bien. */
const hidden = { value: '6:00 PM', dispatchEvent: () => {} };
els.h = hidden; els['gs-dtp-trigger-h'] = { textContent: '' };
P.timeHtml('h', '6:00 PM'); P.syncTime('h');
P.setAmpm('h', 'PM', { parentElement: { querySelectorAll: () => [] }, classList: { add: () => {} } });
assert.strictEqual(hidden.value, '18:00', 'after touching the clock it is 18:00, not 06:00');
console.log('date-time-picker ok');
