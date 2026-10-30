/* Prueba de escape.js: node escape/escape.test.js */
'use strict';
const E = require('./escape.js');
let ok = 0, fail = 0;
const eq = (name, got, want) => { if (got === want) { ok++; console.log('OK   - ' + name); } else { fail++; console.log('FAIL - ' + name + ' got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); } };

eq('esc < > &', E.esc('<b>A & B</b>'), '&lt;b&gt;A &amp; B&lt;/b&gt;');
eq('esc comillas dobles (cortaban value="...")', E.esc('12" baseboard'), '12&quot; baseboard');
eq('esc comilla simple', E.esc("O'Brien"), 'O&#39;Brien');
eq('esc null', E.esc(null), '');
eq('esc undefined', E.esc(undefined), '');
eq('esc 0 se ve', E.esc(0), '0');
eq('esc false no sale como "false" (cond && texto)', E.esc(false), '');
eq('escAttr = esc', E.escAttr('a"b\'c'), 'a&quot;b&#39;c');
eq('jsStr comilla simple', E.jsStr("O'Brien"), "O\\'Brien");
eq('jsStr comilla doble y salto', E.jsStr('12"\nx'), '12\\x22\\nx');
eq('jsStr < > &', E.jsStr('<a&b>'), '\\x3ca\\x26b\\x3e');
eq('jsStr null', E.jsStr(null), '');

/* Dentro de un atributo el valor regresa igual (con un parser de HTML de verdad si hay jsdom). */
try {
  const { JSDOM } = require('jsdom');
  const doc = new JSDOM('').window.document;
  const div = doc.createElement('div');
  const v = 'Unit "A" & O\'Brien <3>';
  div.innerHTML = '<input value="' + E.escAttr(v) + '" title=\'' + E.escAttr(v) + '\'>';
  eq('atributo con comillas dobles regresa igual', div.firstChild.value, v);
  eq('atributo con comillas simples regresa igual', div.firstChild.title, v);
} catch (e) { console.log('(sin jsdom: npm i --no-save jsdom para la prueba del atributo)'); }

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
