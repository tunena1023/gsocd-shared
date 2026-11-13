(function (root) {
  'use strict';
  /* ================================================================
     GSSearch -- UNA sola busqueda para las barras de los 3 portales (CFO 12/11/2026: "debe de poderse buscar por
     numero de orden, por nombre, por apellido, por direccion, debe ser universal. Cualquier cosa que pudiera estar en
     esa pantalla se debe poder encontrar").

     - Sin mayusculas, acentos, guiones ni espacios: "gs1028", "GS-1028-1249" y "1249" encuentran GS-1028-1249;
       "26th ave" encuentra "2600 26th Ave."; "Garcia" encuentra "García".
     - Varias palabras en cualquier orden: "fernanda 1249" = las dos tienen que estar (en el mismo campo o en otro).
     - Un pedazo de palabra basta ("mead" encuentra Meadow Vista). Una palabra no se pega con el campo de al lado.

       GSSearch.norm(s)                -> texto compacto (minusculas, sin acentos, solo letras y numeros)
       GSSearch.tokens(q)              -> las palabras de la busqueda, compactas
       GSSearch.text(...valores)       -> el texto donde se busca (strings, numeros, arreglos y objetos, hasta 6 niveles)
       GSSearch.dateText(fecha)        -> una fecha como se ve: 2026-11-12, 11/12/2026, 11/12/26, nov 12 2026, november
       GSSearch.indexer(build, sig)    -> fn(renglon) con el texto ya armado: se arma UNA vez por renglon (mismo
                                          objeto) y solo se vuelve a armar si sig(renglon) cambia
       GSSearch.match(texto, q)        -> true si todas las palabras de q estan (q: string o tokens)
       GSSearch.filter(lista, q, idx)  -> los renglones que cumplen (q vacio = todos, sin copiar la lista)
       GSSearch.has(q, ...valores)     -> atajo sin indice para un renglon suelto
       GSSearch.noZoom()               -> en celular (<= 700 px) los cuadros de texto en 16 px: iPhone hace zoom al
                                          tocar uno mas chico (CFO 12/11). Una vez por pagina; en escritorio no cambia.
     Prueba: node search/search.test.js
  ================================================================ */
  var MARKS = /[̀-ͯ]/g, NOT_ALNUM;
  try { NOT_ALNUM = new RegExp('[^\\p{L}\\p{N}]+', 'gu'); } catch (e) { NOT_ALNUM = /[^a-z0-9À-ɏ]+/g; }
  function norm(s) {
    if (s == null || s === false || s === true) return '';
    var t = String(s).toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(MARKS, '');
    return t.replace(NOT_ALNUM, '');
  }
  /* La ultima busqueda queda partida: filtrar miles de renglones con la misma no la vuelve a partir. */
  var lastQ = null, lastT = null;
  function tokens(q) {
    if (Array.isArray(q)) return q;
    if (typeof q === 'string' && q === lastQ) return lastT;
    var t = splitQ(q);
    if (typeof q === 'string') { lastQ = q; lastT = t; }
    return t;
  }
  function splitQ(q) {
    var out = [], seen = {};
    String(q == null ? '' : q).split(/[\s,;]+/).forEach(function (w) {
      var t = norm(w);
      if (t && !seen[t]) { seen[t] = 1; out.push(t); }
    });
    /* Una palabra que ya esta dentro de otra no hace falta ("12 1249"). */
    return out.filter(function (t) { return !out.some(function (o) { return o !== t && o.indexOf(t) >= 0; }); });
  }
  function collect(v, out, depth) {
    if (v == null || v === false || v === true) return;
    if (typeof v === 'string' || typeof v === 'number') { var n = norm(v); if (n) out.push(n); return; }
    if (depth > 6 || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) collect(v[i], out, depth + 1); return; }
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) collect(v[k], out, depth + 1);
  }
  /* Los campos van separados por un espacio: una palabra nunca se arma con el final de uno y el principio de otro. */
  function text() { var out = []; collect(Array.prototype.slice.call(arguments), out, 0); return ' ' + out.join(' ') + ' '; }

  var MON = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* Dia de Iowa: una fecha sola (2026-11-12) se queda; una con hora se pasa a America/Chicago. */
  function iowaParts(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return { y: +m[1], mo: +m[2], d: +m[3] };
    var d = new Date(s);
    if (isNaN(d.getTime())) return null;
    try {
      var p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric' })
        .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      return { y: +p.year, mo: +p.month, d: +p.day };
    } catch (e) { return null; }
  }
  function dateText(v) {
    var p = iowaParts(v);
    if (!p || !p.y || !p.mo || !p.d) return '';
    var mn = MON[p.mo - 1] || '';
    return [p.y + '-' + pad(p.mo) + '-' + pad(p.d), p.mo + '/' + p.d + '/' + p.y, pad(p.mo) + '/' + pad(p.d) + '/' + p.y,
      p.mo + '/' + p.d + '/' + String(p.y).slice(2), mn.slice(0, 3) + ' ' + p.d + ' ' + p.y, mn + ' ' + p.d].join(' | ');
  }

  function indexer(build, sig) {
    var cache = typeof WeakMap === 'function' ? new WeakMap() : null;
    return function (row) {
      if (row == null || typeof row !== 'object' || !cache) return text(build(row));
      var s = sig ? String(sig(row)) : '';
      var c = cache.get(row);
      if (c && c.s === s) return c.t;
      var t = text(build(row));
      cache.set(row, { s: s, t: t });
      return t;
    };
  }
  function match(t, q) {
    var toks = tokens(q);
    for (var i = 0; i < toks.length; i++) if (String(t).indexOf(toks[i]) < 0) return false;
    return true;
  }
  function filter(list, q, idx) {
    var toks = tokens(q);
    if (!toks.length || !list) return list || [];
    return list.filter(function (r) { return match(idx(r), toks); });
  }
  function has(q) { return match(text(Array.prototype.slice.call(arguments, 1)), q); }

  var NOZOOM_CSS = '@media (max-width: 700px) { input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file])' +
    ':not([type=button]):not([type=submit]):not([type=reset]):not([type=color]):not([type=image]), select, textarea { font-size: 16px !important; } }';
  function noZoom() {
    if (typeof document === 'undefined' || document.getElementById('gs-search-nozoom')) return;
    var st = document.createElement('style');
    st.id = 'gs-search-nozoom';
    st.textContent = NOZOOM_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  var api = { norm: norm, tokens: tokens, text: text, dateText: dateText, indexer: indexer, match: match, filter: filter, has: has,
    noZoom: noZoom, NOZOOM_CSS: NOZOOM_CSS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && !root.GSSearch) root.GSSearch = api;
})(typeof window !== 'undefined' ? window : this);
