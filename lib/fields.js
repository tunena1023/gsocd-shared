/* ============================================================
   lib/fields.js -- un dato por campo (CFO 21/10/2026: "QUE NO SE PUEDAN PONER DOS COSAS EN UN MISMO CAMPO NI EMAIL NI
   TELEFONO NI DIRECCIONES NI MAMADAS COMO &"). Como lib/phone.js: el mismo archivo en pantalla (window.GSFields, por
   jsDelivr) y en el servidor (require('gsocd-shared/lib/fields')). Cada funcion(v, opts) -> '' si esta bien, si no el
   mensaje. Nunca acomoda ni parte nada (eso lo PROPONE lib/split-fields.js y la oficina confirma).
   "&" si en nombre de negocio o edificio ("D&K Products"); no en persona, correo, telefono ni direccion (CFO 21/10).
   firstEmails / names: partes que se ven en el texto (para split-fields).
============================================================ */
(function (root) {
  'use strict';
  const s = v => String(v == null ? '' : v).trim();
  const EMAIL_RE = /^[^\s@,;&\/]+@[^\s@,;&\/]+\.[^\s@,;&\/]+$/;
  function email(v, o) {
    const t = s(v);
    if (!t) return o && o.required ? 'Email: required.' : '';
    if ((t.match(/@/g) || []).length > 1 || /[,;&\/]|\s(and|y)\s|\s/i.test(t)) return 'Email: one address only.';
    return EMAIL_RE.test(t) ? '' : 'Email: not a valid address.';
  }
  /* Una persona: letras, espacios, ' - . Sin numeros (telefonos), sin "&", "/", "+", ",", ";", " and ", " or ", " y ". */
  function personName(v, o) {
    const t = s(v);
    if (!t) return o && o.required ? 'Name: required.' : '';
    if (/\d/.test(t) || /[&\/+,;@]/.test(t) || /\s(and|or|y)\s/i.test(' ' + t + ' ')) return 'Name: one person only, no phone numbers.';
    /* "Sarah Krieger- Service Mgr": el puesto va en Role ("Mary-Jane" sin espacio si se puede). */
    if (/-\s|\s-/.test(t)) return 'Name: only the person (put the job in Role).';
    return '';
  }
  /* Nombre de negocio o edificio: "&" si (un negocio: "D&K Products"), pero sin telefonos, correos ni dos negocios con "/". */
  function businessName(v, o) {
    const t = s(v);
    if (!t) return o && o.required ? 'Name: required.' : '';
    if (/@/.test(t) || /\d{3}[\s.-]?\d{4}/.test(t) || /\s\/\s|;/.test(t)) return 'Name: one business only, no phone numbers or emails.';
    return '';
  }
  /* Una direccion: lo que separa dos (como Developer › Address check, lib/address-check.js). */
  function address(v, o) {
    const t = s(v);
    if (!t) return o && o.required ? 'Address: required.' : '';
    if (/[;&\/+]|\s(and|y)\s/i.test(t) || /\d+\s+\D+,\s*\d+\s+\D+/.test(t)) return 'Address: one address only. Add other buildings with + Add building.';
    return '';
  }
  /* Los correos que trae un texto (en orden). */
  function emailsIn(v) { return (String(v == null ? '' : v).match(/[^\s@,;&\/<>()]+@[^\s@,;&\/<>()]+\.[^\s@,;&\/<>()]+/g) || []); }
  const api = { email, personName, businessName, address, emailsIn, EMAIL_RE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GSFields = api;
})(typeof window !== 'undefined' ? window : null);
