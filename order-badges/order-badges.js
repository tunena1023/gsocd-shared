(function () {
  'use strict';

  if (window.GSOrderBadges) return;

  /* ================================================================
     GSOrderBadges -- UNA SOLA pieza para los badges de "unidad
     ocupada" y "se necesita algo de la oficina", compartida por
     Admingsocd.com, tech.gsocd.com y ordersgsocd.com. Antes cada uno
     tenia su propia copia escrita a mano (mismo diseno aprobado,
     pegado por separado en 4 archivos) -- ya se habian desincronizado:
     el texto no coincidia entre Admin/Orders ("Occupied unit") y Tech
     ("Occupied"), y Orders nunca tuvo la nota completa de que se
     necesita -- el cliente veia el badge morado pero nunca el detalle.

     API PUBLICA:
       GSOrderBadges.occupied(o)      -> string HTML o '' (badge azul)
       GSOrderBadges.officeNeed(o)    -> string HTML o '' (badge morado)
       GSOrderBadges.officeNeedNote(o)-> string HTML o '' (texto completo)
     `o` es el objeto de la orden tal cual viene del backend -- solo
     necesita Division, UnitOccupied, NeedsOfficeAccess, OfficeNeedNotes.
  ================================================================ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function occupied(o) {
    const div = String((o && o.Division) || '').toLowerCase();
    if (div !== 'renovations' && div !== 'janitorial') return '';
    if (!o || !o.UnitOccupied) return '';
    return '<span class="gs-occupied-badge"><span class="gs-occupied-dot"></span>Occupied unit</span>';
  }

  /* Aplica a las 3 divisiones (Janitorial, Renovations, Exteriors) --
     el cliente puede marcarlo sin importar la division de la orden. */
  function officeNeed(o) {
    if (!o || !o.NeedsOfficeAccess) return '';
    return '<span class="gs-office-need-badge"><span class="gs-office-need-dot"></span>Office access needed</span>';
  }

  /* Texto completo de lo que el cliente escribio -- el badge de arriba
     solo avisa que hay algo, esto es el detalle real. `label` es
     opcional -- el texto correcto cambia segun quien lo lee: al staff
     le dice "Needed from the office" (viendo la nota de alguien mas),
     al cliente "What you told us you need" (leyendo su propia nota)
     se lee mas natural. */
  function officeNeedNote(o, label) {
    if (!o || !o.NeedsOfficeAccess || !o.OfficeNeedNotes) return '';
    return '<p class="gs-office-need-note"><b>' + esc(label || 'Needed from the office') + ':</b> ' + esc(o.OfficeNeedNotes) + '</p>';
  }

  /* "Now Open"/"Closed" -- confirmado con el usuario, Opcion 1 (misma
     linea que los demas badges). `o.NowOpenStatus` ya viene calculado
     del backend (admin-get-orders.js) como { open, text } o null si
     la orden no tiene un cliente/building valido para calcularlo. */
  function nowOpen(o) {
    const st = o && o.NowOpenStatus;
    if (!st) return '';
    const cls = st.open ? 'gs-now-open' : 'gs-now-closed';
    return '<span class="gs-now-badge ' + cls + '"><span class="gs-now-dot"></span>' + esc(st.text) + '</span>';
  }

  function styleTag() {
    if (document.getElementById('gs-badges-style')) return;
    const style = document.createElement('style');
    style.id = 'gs-badges-style';
    style.textContent =
      '.gs-occupied-badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;' +
      'letter-spacing:.03em;text-transform:uppercase;background:#E8F0FA;color:#2D5F8A;padding:3px 9px;border-radius:20px}' +
      '.gs-occupied-dot{width:6px;height:6px;border-radius:50%;background:#2D5F8A}' +
      '.gs-office-need-badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;' +
      'letter-spacing:.03em;text-transform:uppercase;background:#F0E8FA;color:#6B3FA0;padding:3px 9px;border-radius:20px}' +
      '.gs-office-need-dot{width:6px;height:6px;border-radius:50%;background:#6B3FA0}' +
      '.gs-office-need-note{font-size:12px;margin:10px 0;padding:10px 12px;background:#F0E8FA;border-radius:4px;' +
      'border-left:3px solid #6B3FA0}' +
      '.gs-office-need-note b{color:#6B3FA0}' +
      '.gs-now-badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;' +
      'padding:3px 10px;border-radius:20px;white-space:nowrap}' +
      '.gs-now-open{background:#E4F3E8;color:#1F7A3F}' +
      '.gs-now-closed{background:#FBEAEA;color:#A6362D}' +
      '.gs-now-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}';
    document.head.appendChild(style);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', styleTag);
  else styleTag();

  window.GSOrderBadges = { occupied: occupied, officeNeed: officeNeed, officeNeedNote: officeNeedNote, nowOpen: nowOpen };
})();
