(function (root) {
  'use strict';
  /* ================================================================
     GSEscape -- UN solo esc/escAttr/jsStr para los 3 portales. Antes habia
     12 copias con dos comportamientos: la que escapaba con el DOM
     (textContent -> innerHTML) NO escapa comillas, y se usaba dentro de
     atributos (value="...", title="..."): un nombre con " cortaba el
     atributo. Esta escapa siempre & < > " '.

       GSEscape.esc(s)     -> texto seguro para HTML y para atributos
                              (null/undefined/false -> '', 0 -> '0')
       GSEscape.escAttr(s) -> lo mismo (se queda el nombre por costumbre)
       GSEscape.jsStr(s)   -> para un string de JS entre comillas simples
                              dentro de onclick="fn('...')"
     Prueba: node escape/escape.test.js
  ================================================================ */
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return s == null || s === false ? '' : String(s).replace(/[&<>"']/g, function (c) { return MAP[c]; }); }
  function escAttr(s) { return esc(s); }
  function jsStr(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\x22')
      .replace(/&/g, '\\x26').replace(/</g, '\\x3c').replace(/>/g, '\\x3e').replace(/\r?\n/g, '\\n');
  }
  var api = { esc: esc, escAttr: escAttr, jsStr: jsStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && !root.GSEscape) root.GSEscape = api;
})(typeof window !== 'undefined' ? window : this);
