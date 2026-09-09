(function () {
  'use strict';

  if (window.GSOrderHistory) return;

  /* ================================================================
     GSOrderHistory -- UNA SOLA pieza para armar el historial de una
     orden, compartida por Admingsocd.com (staff), tech.gsocd.com
     (staff) y ordersgsocd.com (cliente). Antes cada uno tenia su
     propia version, escrita por separado, con reglas distintas de
     que se agrupa, que se etiqueta, y que se esconde -- por eso el
     mismo evento se veia distinto (o de plano no se veia) segun
     donde se mirara.

     REGLA DE ORO, pedida explicitamente por el usuario: el historial
     siempre es acumulativo y completo. Ninguna pestana ni contexto
     debe recortarlo ni esconder eventos por su cuenta -- "si esta en
     Review, el historial con los reviews; si pasa de nuevo a Active,
     igual se tienen que ver los reviews". Quien llama a esta pieza
     SIEMPRE le manda el arreglo de historial COMPLETO tal cual vino
     del backend -- esta pieza nunca lo trunca por fecha ni por
     contexto, solo agrupa/etiqueta/filtra por MODO (staff vs client).

     API PUBLICA:
       GSOrderHistory.html(orderId, history, opts) -> string HTML
         opts.mode: 'staff' (todo, Admin/Tech) | 'client' (filtrado,
           Orders) -- default 'staff'.
       GSOrderHistory.toggleDetail(id) -- toggle del detalle expandible,
         referenciado desde el HTML generado via onclick.
  ================================================================ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* --- Etiquetas legibles por ChangeType. Misma etiqueta para todos
     los modos -- lo que cambia entre staff/client es que se ve o no,
     nunca como se llama lo que si se ve. --- */
  var LABELS = {
    'Created':                  'Order created',
    'Order Assigned':           'Assigned',
    'Order Approved':           'Marked as seen',
    'Document Generated':       'Order document sent',
    'Document Failed':          'Order document failed',
    'Tech Marked Complete':     'Tech marked their work done',
    'Change Requested':         'Change requested',
    'Change Reassigned':        'Change approved',
    'Change Rejected':          'Change not approved',
    'Sent to Scheduling':       'Rescheduling in progress',
    'Change Request Cancelled': 'Change request withdrawn',
    'Cancellation Requested':   'Cancellation requested',
    'Cancellation Approved':    'Order cancelled',
    'Cancellation Rejected':    'Cancellation not approved',
    'Reactivation Requested':   'Reactivation requested',
    'Order Reactivated':        'Order reactivated',
    'Completed':                'Completed',
    'Dates Confirmed':          'Schedule confirmed',
    'Reschedule Requested':     'New dates requested',
    'Expected Ready Date':      'Ready Date & Time',
    'Archived':                 'Archived'
  };
  function labelFor(ct) { return LABELS[String(ct || '')] || String(ct || 'Update'); }

  /* --- Tipos "de decision" -- cuando uno de estos aparece justo
     despues de un renglon de detalle (Dates Confirmed) del mismo
     actor y en la misma tanda, se fusionan en una sola burbuja. --- */
  var DECISION_TYPES = [
    'Change Reassigned', 'Change Rejected', 'Sent to Scheduling',
    'Cancellation Approved', 'Cancellation Rejected', 'Order Reactivated'
  ];

  /* --- Ruido puramente operativo -- nunca aporta nada a "que paso
     con la orden", en ningun modo. --- */
  var ALWAYS_HIDDEN_TYPES = ['Document Generated', 'Document Failed', 'Archived'];

  /* --- Ademas de lo anterior, esto se esconde SOLO del cliente --
     mismas reglas que ya existian en tracking.html, mas Office
     Change (Internal) que ya cubre las notas de oficina. --- */
  function isHiddenFromClient(h) {
    var fc = String(h.FieldChanged || '');
    if (fc === 'Office Change (Internal)') return true;
    if (fc === 'Supervisor') return true;
    if (fc === 'Inspection Date') return true;
    if (fc === 'Delay Reason' || fc === 'Delay Reason Notes') return true;
    return false;
  }

  function noteFor(h) {
    if (!h.Notes) return '';
    if (h.Notes.indexOf('SERVICES:') === 0) return '';
    if (h.Notes === 'Submitted from draft.') return '';
    /* Nota automatica generica de aprobar/rechazar/marcar visto: el
       nombre ya esta en el encabezado, repetirlo aqui no aporta nada.
       Si alguien escribio una nota personalizada, esa SI se conserva
       (no calzara con este patron). */
    if (/^Approved by .+\.$/.test(h.Notes)) return '';
    if (/^Marked as seen by .+\.$/.test(h.Notes)) return '';
    if (/^Rejected by .+?\.( Previous services were restored\.)?$/.test(h.Notes)) return '';
    return h.Notes;
  }

  function parseServicesPayload(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    var body = raw.indexOf('SERVICES:') === 0 ? raw.slice('SERVICES:'.length) : raw;
    if (body.charAt(0) !== '[' && body.charAt(0) !== '{') return null;
    try {
      var obj = JSON.parse(body);
      if (Array.isArray(obj)) return { services: obj, dirtLevel: '' };
      if (obj && Array.isArray(obj.services)) return obj;
      return null;
    } catch (e) { return null; }
  }

  function parseDatesPayload(value) {
    var raw = String(value == null ? '' : value).trim();
    if (raw.charAt(0) !== '{') return null;
    try {
      var obj = JSON.parse(raw);
      if (obj && (obj.entryDate || obj.dueDate || obj.serviceWindow)) return obj;
      return null;
    } catch (e) { return null; }
  }

  function svcSubLabel(s) {
    return s.SubOption || s.Level || '';
  }

  function changeLine(icon, label, oldVal, newVal) {
    if (oldVal === newVal) return icon + ' ' + esc(label) + ': ' + esc(oldVal || '—');
    return icon + ' ' + esc(label) + ': ' + esc(oldVal || '(none)') + ' → ' + esc(newVal || '(none)');
  }
  function addedLine(label, extra) { return '➕ ' + esc(label) + (extra ? ' — ' + esc(extra) : ''); }
  function removedLine(label, extra) { return '➖ ' + esc(label) + (extra ? ' — ' + esc(extra) : ''); }

  /* --- Detalle expandible de un evento: compara antes/despues segun
     lo que traiga OldValue/NewValue. Misma logica sin importar el
     modo -- si algo no debe verse del cliente, se filtra el EVENTO
     completo antes de llegar aqui, no el detalle a medias. --- */
  function detailLinesFor(h) {
    var oldPay = parseServicesPayload(h.OldValue);
    var newPay = parseServicesPayload(h.NewValue);
    var oldSvcs = oldPay ? oldPay.services : null;
    var newSvcs = newPay ? newPay.services : null;
    var oldDates = parseDatesPayload(h.OldValue);
    var newDates = parseDatesPayload(h.NewValue);
    var lines = [];

    if (h.ChangeType === 'Created') {
      if (newPay) {
        if (newPay.entryDate) lines.push('📅 Entry: ' + esc(newPay.entryDate));
        if (newPay.dueDate) lines.push('📅 Due: ' + esc(newPay.dueDate));
        if (newPay.serviceWindow) lines.push('🕐 Window: ' + esc(newPay.serviceWindow));
      }
      (newSvcs || []).forEach(function (s) {
        lines.push('• ' + esc(s.Category || '') + ': ' + esc(s.ServiceName || '') + (svcSubLabel(s) ? ' — ' + esc(svcSubLabel(s)) : ''));
      });
      return lines;
    }

    if (h.ChangeType === 'Order Assigned') {
      var a = null;
      try { a = JSON.parse(h.NewValue || '{}'); } catch (e) {}
      if (a) {
        if (a.supervisor) lines.push(changeLine('👤', 'Supervisor', a.supervisor, a.supervisor));
        if (a.dispatchDate) lines.push(changeLine('📅', 'Date', fmtDate(a.dispatchDate), fmtDate(a.dispatchDate)));
        if (a.serviceWindow) lines.push(changeLine('🕐', 'Window', a.serviceWindow, a.serviceWindow));
      }
      return lines;
    }

    if (oldDates || newDates) {
      var od = oldDates || {}, nd = newDates || {};
      if ((od.entryDate || '') !== (nd.entryDate || '') || (nd.entryDate && !od.entryDate))
        lines.push(changeLine('📅', 'Entry', od.entryDate ? fmtDate(od.entryDate) : '', nd.entryDate ? fmtDate(nd.entryDate) : ''));
      if ((od.dueDate || '') !== (nd.dueDate || '') || (nd.dueDate && !od.dueDate))
        lines.push(changeLine('📅', 'Due', od.dueDate ? fmtDate(od.dueDate) : '', nd.dueDate ? fmtDate(nd.dueDate) : ''));
      if ((od.serviceWindow || '') !== (nd.serviceWindow || '') || (nd.serviceWindow && !od.serviceWindow))
        lines.push(changeLine('🕐', 'Window', od.serviceWindow || '', nd.serviceWindow || ''));
      return lines;
    }

    if (Array.isArray(oldSvcs) && Array.isArray(newSvcs)) {
      var isNC = function (s) { return s.NotCompleted === true || String(s.NotCompleted) === 'true'; };
      var keyOf = function (s) { return (s.Category || '') + '|' + (s.ServiceName || ''); };
      var oldMap = {}; oldSvcs.forEach(function (s) { oldMap[keyOf(s)] = s; });
      var newMap = {}; newSvcs.forEach(function (s) { newMap[keyOf(s)] = s; });
      newSvcs.forEach(function (s) {
        var k = keyOf(s), prev = oldMap[k], label = svcSubLabel(s);
        if (!prev) { lines.push(addedLine(s.ServiceName || '', label)); return; }
        var prevLabel = svcSubLabel(prev);
        if (prevLabel !== label) lines.push(changeLine('🔄', s.ServiceName || '', prevLabel || '(none)', label || '(none)'));
        if (isNC(prev) !== isNC(s)) {
          lines.push(changeLine(isNC(s) ? '⚠️' : '✅', s.ServiceName || '', isNC(s) ? 'Completed' : 'Not completed', isNC(s) ? 'Not completed' : 'Completed'));
          if (isNC(s) && s.NotCompletedReason) lines.push('&nbsp;&nbsp;Reason: ' + esc(s.NotCompletedReason));
        }
      });
      oldSvcs.forEach(function (s) {
        var k = keyOf(s);
        if (!newMap[k]) lines.push(removedLine(s.ServiceName || '', svcSubLabel(s)));
      });
      var dOld = (oldPay && oldPay.dirtLevel) || '', dNew = (newPay && newPay.dirtLevel) || '';
      if (dOld !== dNew && (dOld || dNew)) lines.push(changeLine('🧹', 'Condition', dOld, dNew));
      return lines;
    }

    if (h.FieldChanged && h.FieldChanged !== 'Status' && (h.OldValue || h.NewValue)) {
      lines.push(changeLine('🔄', h.FieldChanged, h.OldValue || '', h.NewValue || ''));
    }
    return lines;
  }

  var GROUP_WINDOW_MS = 60000;

  /* --- Pasada 1: agrupar renglones consecutivos de 'Dates Confirmed'
     (mismo actor, cerca en tiempo) en una sola tanda. --- */
  function groupDatesConfirmed(rows) {
    var out = [];
    rows.forEach(function (h) {
      var last = out[out.length - 1];
      var groupable = String(h.ChangeType || '') === 'Dates Confirmed';
      var matchesLast = last && groupable &&
        String(last.rep.ChangeType || '') === 'Dates Confirmed' &&
        String(last.rep.ChangedBy || '') === String(h.ChangedBy || '') &&
        Math.abs(new Date(h.ChangeDate) - new Date(last.rep.ChangeDate)) < GROUP_WINDOW_MS;
      if (matchesLast) { last.rows.push(h); }
      else { out.push({ rep: h, rows: [h] }); }
    });
    return out;
  }

  /* --- Pasada 2: una tanda de 'Dates Confirmed' seguida de cerca por
     un evento de decision (mismo actor) se fusiona en una sola
     burbuja -- se usa la decision como encabezado (mas claro),
     conservando el detalle de fechas. --- */
  function mergeDecisionWithDetail(groups) {
    var out = [];
    groups.forEach(function (g) {
      var prev = out[out.length - 1];
      var type = String(g.rep.ChangeType || '');
      var isDecision = DECISION_TYPES.indexOf(type) !== -1;
      var prevIsDates = prev && String(prev.rep.ChangeType || '') === 'Dates Confirmed';
      var sameActor = prev && String(prev.rep.ChangedBy || '') === String(g.rep.ChangedBy || '');
      var closeInTime = prev && Math.abs(new Date(g.rep.ChangeDate) - new Date(prev.rep.ChangeDate)) < GROUP_WINDOW_MS;
      if (isDecision && prevIsDates && sameActor && closeInTime) {
        prev.rep = g.rep;
        prev.rows = prev.rows.concat(g.rows);
      } else {
        out.push(g);
      }
    });
    return out;
  }

  /* --- Pasada 3: 'Change Requested' seguido de inmediato por
     'Reschedule Requested' (mismo actor) es UNA sola accion -- se usa
     Reschedule Requested como representante, conservando la nota
     original. --- */
  function mergeRescheduleRequest(groups) {
    var out = [];
    groups.forEach(function (g) {
      var prev = out[out.length - 1];
      var isReschedule = String(g.rep.ChangeType || '') === 'Reschedule Requested';
      var prevIsChangeReq = prev && String(prev.rep.ChangeType || '') === 'Change Requested';
      var sameActor = prev && String(prev.rep.ChangedBy || '') === String(g.rep.ChangedBy || '');
      var closeInTime = prev && Math.abs(new Date(g.rep.ChangeDate) - new Date(prev.rep.ChangeDate)) < GROUP_WINDOW_MS;
      if (isReschedule && prevIsChangeReq && sameActor && closeInTime) {
        var carried = noteFor(prev.rep);
        prev.rep = Object.assign({}, g.rep, { MergedNotes: carried });
        prev.rows = prev.rows.concat(g.rows);
      } else {
        out.push(g);
      }
    });
    return out;
  }

  /* --- API PUBLICA --- */
  function historyHtml(orderId, history, opts) {
    opts = opts || {};
    var mode = opts.mode === 'client' ? 'client' : 'staff';
    var idPrefix = 'goh-' + String(orderId || '').replace(/[^a-z0-9]/gi, '_') + '-' + mode;

    var rows = (history || []).filter(function (h) {
      if (ALWAYS_HIDDEN_TYPES.indexOf(String(h.ChangeType || '')) !== -1) return false;
      if (mode === 'client' && isHiddenFromClient(h)) return false;
      return true;
    });

    if (!rows.length) return '<p class="empty-note">No history.</p>';

    var groups = groupDatesConfirmed(rows);
    groups = mergeDecisionWithDetail(groups);
    groups = mergeRescheduleRequest(groups);

    return groups.map(function (g, idx) {
      var h = g.rep;
      var lines = g.rows.reduce(function (acc, row) { return acc.concat(detailLinesFor(row)); }, []);
      /* No repetir la misma linea "antes -> despues" dos veces seguidas
         (la decision fusionada trae su propio detalle que puede calzar
         con el de la solicitud justo anterior). */
      if (idx > 0) {
        var prevLines = groups[idx - 1]._renderedLines || [];
        var prevSet = {};
        prevLines.forEach(function (l) { prevSet[l] = true; });
        lines = lines.filter(function (l) { return !prevSet[l]; });
      }
      g._renderedLines = lines;
      var hasDetail = lines.length > 0;
      var noteTxt = h.MergedNotes || noteFor(h);
      var detailId = idPrefix + '-' + idx;
      return '<div class="goh-item' + (hasDetail ? ' has-detail' : '') + '"' +
        (hasDetail ? ' onclick="GSOrderHistory.toggleDetail(\'' + detailId + '\')"' : '') + '>' +
        '<div class="goh-head">' +
          '<div class="goh-head-main">' +
            '<span class="goh-date">' + esc(fmtDateTime(h.ChangeDate)) + '</span>' +
            '<span class="goh-rev">' + esc(orderId || '') + '</span> — ' +
            '<span class="goh-type">' + esc(labelFor(h.ChangeType)) + '</span>' +
            (h.ChangedBy ? '<span class="goh-by">by ' + esc(h.ChangedBy) + '</span>' : '') +
          '</div>' +
          (hasDetail ? '<span class="goh-toggle">&#9660; details</span>' : '') +
        '</div>' +
        (noteTxt ? '<div class="goh-note">' + esc(noteTxt) + '</div>' : '') +
        (hasDetail ? '<div id="' + detailId + '" class="goh-detail">' + lines.map(function (l) { return '<div class="goh-detail-line">' + l + '</div>'; }).join('') + '</div>' : '') +
      '</div>';
    }).join('');
  }

  function toggleDetail(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('open');
  }

  function styleTag() {
    if (document.getElementById('gs-goh-style')) return;
    var style = document.createElement('style');
    style.id = 'gs-goh-style';
    style.textContent =
      '.goh-item{padding:14px 0;border-bottom:1px solid var(--border,#E0DDD6);font-size:13px}' +
      '.goh-item:last-child{border-bottom:none}' +
      '.goh-date{color:var(--gray,#6B6B6B);font-size:12px;margin-right:12px}' +
      '.goh-type{font-weight:600}' +
      '.goh-rev{color:var(--gold-dk,#8C6F2A);font-weight:600}' +
      '.goh-by{color:var(--gray,#6B6B6B);font-size:12px;margin-left:8px}' +
      '.goh-item.has-detail{cursor:pointer}' +
      '.goh-head{display:flex;align-items:baseline;gap:8px}' +
      '.goh-head-main{flex:1;min-width:0;line-height:1.6}' +
      '.goh-toggle{font-size:10px;color:var(--gold-dk,#8C6F2A);white-space:nowrap;flex-shrink:0}' +
      '.goh-note{font-size:12px;color:var(--gray,#6B6B6B);margin-top:5px;line-height:1.5}' +
      '.goh-detail{display:none;margin-top:10px;padding:12px 14px;background:var(--bg,#F8F7F4);border-radius:4px;border-left:3px solid var(--gold,#C9A84C)}' +
      '.goh-detail.open{display:block}' +
      '.goh-detail-line{font-size:12px;margin:5px 0;line-height:1.5}';
    document.head.appendChild(style);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', styleTag);
  else styleTag();

  window.GSOrderHistory = {
    html: historyHtml,
    toggleDetail: toggleDetail
  };
})();
