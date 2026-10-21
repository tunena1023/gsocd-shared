/* ============================================================
   lib/phone.js -- el campo de telefono de los 3 portales (CFO 21/10/2026:
   "en el campo del telefono que solo se pueda agregar especificamente un
   numero de telefono, que no acepte ni un caracter mas... ni guiones ni
   nada y el app lo acomoda en formato telefono"; "no es de que no entre,
   es que no debe dejar escribir mas").

   Un solo archivo para el navegador (window.GSPhone, por jsDelivr) y para
   el servidor (require('gsocd-shared/lib/phone')), asi pantalla y servidor
   revisan lo mismo.

   Pantalla -- GSPhone.attach(input) (o el atributo data-gs-phone en el
   input: se engancha solo, aunque se pinte despues):
   - Solo se escriben digitos; cualquier otra tecla no escribe nada. Al
     llegar a 10 ya no se escribe mas (como maxlength).
   - Pegar es igual que teclear: entran los digitos, hasta 10; lo demas no.
   - Con 10 digitos (o al salir del campo) se pone como (515) 288-8309.
   - Un telefono viejo que no cumple NO se cambia solo. 21/10/2026 (CFO): ya
     no impide guardar lo demas: sale en AMBAR ("Old phone, kept as is...") y
     check() lo deja pasar mientras no se toque (el servidor solo revisa el
     telefono cuando cambia). Si se cambia, lo nuevo si tiene que cumplir
     (rojo). Se arregla aqui o en Admin › Developer › Fields with two things.
     check(input, { strict: true }) si lo bloquea: para lo que va a otro lado
     (QuickBooks no acepta un telefono con dos numeros).
   - Se puede borrar, pero al viejo no se le agrega nada hasta que quede limpio.
   - GSPhone.check(input, { required, strict }) antes de guardar: '' si esta
     bien (o es el viejo sin tocar); si no, el mensaje (en rojo junto al campo).
   Servidor -- normalize(value, { required }) -> { ok, value, error }:
   10 digitos = ok y value en formato; si no, error (la ruta contesta 400).
   Nunca escoge ni recorta un numero.
============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.GSPhone = api; api.autoAttach(); }
})(this, function () {
  'use strict';
  const MAX = 10;
  const MSG_SHORT = 'Phone: 10 digits.';
  const MSG_ONLY = 'Phone: 10 digits only.';
  const MSG_OLD = 'Old phone, kept as is. Type it again to fix it, or use Developer › Fields with two things.';
  const digits = v => String(v == null ? '' : v).replace(/\D/g, '');
  /* Solo digitos y lo que pone el formato: lo demas (letras, "Office:", una coma) no es un telefono. */
  const clean = v => !/[^\d\s().-]/.test(String(v == null ? '' : v));
  function format(v) {
    const d = digits(v);
    return d.length === MAX ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : String(v == null ? '' : v);
  }
  /* '' = bien. Vacio solo es error si es obligatorio. */
  function problem(v, opts) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return opts && opts.required ? MSG_SHORT : '';
    const d = digits(s);
    if (!clean(s) || d.length > MAX) return MSG_ONLY;
    return d.length < MAX ? MSG_SHORT : '';
  }
  function normalize(v, opts) {
    const s = String(v == null ? '' : v).trim();
    const error = problem(s, opts);
    if (error) return { ok: false, value: s, error };
    return { ok: true, value: s ? format(s) : '', error: '' };
  }

  /* ---------------- pantalla ---------------- */
  const CSS = '.gs-phone-bad{border-color:#A6362D!important;box-shadow:0 0 0 1px #A6362D!important}' +
    '.gs-phone-msg{color:#A6362D;font-size:12px;margin-top:4px;display:block}' +
    '.gs-phone-old{border-color:#C88A12!important;box-shadow:0 0 0 1px #C88A12!important}.gs-phone-msg.gs-phone-msg-old{color:#8A5A00}';
  function style() {
    if (typeof document === 'undefined' || document.getElementById('gs-phone-css')) return;
    const st = document.createElement('style'); st.id = 'gs-phone-css'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  /* El mensaje va debajo del campo (fuera del envoltorio del icono, si lo hay: data-gs-phone-wrap). Cada campo el suyo. */
  function msgEl(input, create) {
    if (input.__gsPhoneMsg || !create) return input.__gsPhoneMsg || null;
    const el = document.createElement('span'); el.className = 'gs-phone-msg'; el.setAttribute('role', 'alert');
    const wrap = input.closest('[data-gs-phone-wrap]');
    if (wrap) wrap.insertAdjacentElement('afterend', el); else input.insertAdjacentElement('afterend', el);
    input.__gsPhoneMsg = el;
    return el;
  }
  /* old = ambar (el viejo sin tocar: aviso, no error). */
  function show(input, text, old) {
    input.classList.toggle('gs-phone-bad', !!text && !old);
    input.classList.toggle('gs-phone-old', !!text && !!old);
    if (text && !old) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    const el = msgEl(input, !!text);
    if (el) { el.textContent = text || ''; el.style.display = text ? '' : 'none'; el.classList.toggle('gs-phone-msg-old', !!old); }
  }
  /* El valor viejo que no cumple, tal cual estaba al abrir (undefined = no habia). */
  const untouchedOld = input => input.__gsPhoneOrig !== undefined && input.value === input.__gsPhoneOrig;
  /* Digitos que quedan fuera de lo seleccionado (lo seleccionado se reemplaza). */
  function room(input) {
    const v = input.value, a = input.selectionStart == null ? v.length : input.selectionStart, b = input.selectionEnd == null ? v.length : input.selectionEnd;
    return { before: v.slice(0, a), after: v.slice(b), left: MAX - digits(v.slice(0, a) + v.slice(b)).length };
  }
  const legacy = input => input.dataset.gsPhoneLegacy === '1';
  /* Despues de cada cambio: si ya esta limpio, se queda en digitos (o con formato a los 10). */
  function settle(input, final) {
    const v = input.value;
    if (untouchedOld(input)) { show(input, MSG_OLD, true); return; }
    if (legacy(input)) {
      if (!clean(v) || digits(v).length > MAX) { show(input, MSG_ONLY); return; }
      delete input.dataset.gsPhoneLegacy;
    }
    const d = digits(v).slice(0, MAX);
    const next = d.length === MAX ? format(d) : d;
    if (next !== v) {
      input.value = next;
      if (document.activeElement === input && input.setSelectionRange) try { input.setSelectionRange(next.length, next.length); } catch (e) { /* type=tel sin seleccion */ }
    }
    if (d.length === MAX || !d.length) show(input, '');
    else if (final) show(input, MSG_SHORT);
    else if (input.classList.contains('gs-phone-bad')) show(input, MSG_SHORT);
  }
  function insert(input, text) {
    if (legacy(input) && !(input.selectionStart === 0 && input.selectionEnd === input.value.length)) return; /* al viejo no se le agrega nada */
    if (legacy(input)) delete input.dataset.gsPhoneLegacy;
    const r = room(input);
    const add = digits(text).slice(0, Math.max(0, r.left));
    const raw = digits(r.before) + add + digits(r.after);
    input.value = raw;
    const pos = digits(r.before).length + add.length;
    if (input.setSelectionRange) try { input.setSelectionRange(pos, pos); } catch (e) { /* type=tel */ }
    settle(input, false);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function attach(input) {
    if (!input || input.__gsPhone) return input;
    input.__gsPhone = true;
    style();
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', input.getAttribute('autocomplete') || 'tel-national');
    if (!input.getAttribute('placeholder')) input.setAttribute('placeholder', '(515) 288-8309');
    const v = input.value;
    if (v && problem(v)) { if (!clean(v) || digits(v).length > MAX) input.dataset.gsPhoneLegacy = '1'; input.__gsPhoneOrig = v; show(input, MSG_OLD, true); }
    else if (v) input.value = format(v);
    input.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key == null || e.key.length !== 1) return;
      e.preventDefault();
      if (/\d/.test(e.key)) insert(input, e.key);
    });
    input.addEventListener('beforeinput', e => {
      const t = e.inputType || '';
      if (!/^insert/.test(t)) return;
      if (t === 'insertFromPaste' || t === 'insertFromDrop') return; /* paste/drop abajo */
      e.preventDefault();
      const data = e.data != null ? e.data : (e.dataTransfer ? e.dataTransfer.getData('text') : '');
      if (data) insert(input, data);
    });
    input.addEventListener('paste', e => {
      e.preventDefault();
      const cd = e.clipboardData || (typeof window !== 'undefined' && window.clipboardData);
      insert(input, cd ? cd.getData('text') : '');
    });
    input.addEventListener('drop', e => { e.preventDefault(); insert(input, e.dataTransfer ? e.dataTransfer.getData('text') : ''); });
    /* Teclados que no avisan antes (algunos Android): se limpia despues, igual que teclear. */
    input.addEventListener('input', () => {
      if (legacy(input)) { settle(input, false); return; }
      const v2 = input.value;
      if (!clean(v2) || digits(v2).length > MAX || (digits(v2).length < MAX && v2 !== digits(v2))) settle(input, false);
      else if (digits(v2).length === MAX && v2 !== format(v2)) settle(input, false);
    });
    input.addEventListener('blur', () => settle(input, true));
    return input;
  }
  /* Antes de guardar. */
  function check(input, opts) {
    if (!input) return '';
    if (untouchedOld(input) && !(opts && opts.strict)) { show(input, MSG_OLD, true); return ''; }
    const p = problem(input.value, opts);
    show(input, p);
    if (!p && input.value.trim()) input.value = format(input.value);
    return p;
  }
  let observing = false;
  function autoAttach() {
    if (typeof document === 'undefined' || observing) return;
    observing = true;
    const scan = n => { if (n.matches && n.matches('input[data-gs-phone]')) attach(n); if (n.querySelectorAll) n.querySelectorAll('input[data-gs-phone]').forEach(attach); };
    const start = () => {
      scan(document);
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(scan))).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }

  return { MAX, MSG_SHORT, MSG_ONLY, MSG_OLD, digits, format, problem, normalize, attach, check, autoAttach };
});
