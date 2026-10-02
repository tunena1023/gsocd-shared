(function () {
  'use strict';

  if (window.GSOrderDetails) return;

  /* ================================================================
     GSOrderDetails -- "Order Details" de una orden en 3 grupos:
     When / Where / Who (02/10/2026, el dueño escogio la opcion A del mini
     https://claude.ai/artifact/6E5esaDHzPEhvkxo5dRjV7), y el dia asignado
     que enseña Tech en sus tarjetas. Una sola pieza para Admin, Orders y
     Tech (regla del dueño: nada de copias por portal).

     API PUBLICA:
       GSOrderDetails.shortWindow('8:00 AM - 11:00 AM') -> '8:00–11:00 AM'
       GSOrderDetails.assignedDayText(o, { weekday, assignments })
         -> 'Oct 2' / 'Oct 2 – Oct 3' / '' (sin dia). Assign by service: el
            dia (o rango) de sus servicios (assignments, o
            o.MyServiceAssignments); si no, DispatchDate.
       GSOrderDetails.html(o, opts) -> HTML del bloque. opts:
         assignments  [{ AssignedTo, ScheduledDate }] de la orden (por servicio)
         techs        [{ name, role, phone }] para saber quien es supervisor
                      y su telefono
         showWho      default true (false = solo When y Where)
         showPhones   default true
         poHtml       HTML propio para el valor de Customer PO (Admin lo
                      edita); si no, el texto de o.CustomerPO
         live         true = pone id="due-display-<orden>" y
                      id="window-display-<orden>" (Admin los cambia al editar)
       Who: en Inspection/Inspected "Inspecting: InspectionBy"; si no, el
       Supervisor (role 'Supervisor' en techs) y abajo Technician(s) (el resto
       de o.Supervisor -- que guarda a TODOS los asignados con coma -- y de
       assignments). Si solo van tecnicos, no hay renglon de Supervisor.
  ================================================================ */

  var INSPECTION = ['Inspection', 'Inspected'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var styled = false;
  function styleTag() {
    if (styled || typeof document === 'undefined') return;
    styled = true;
    var st = document.createElement('style');
    st.textContent =
      '.gs-od { display: grid; gap: 12px; margin-bottom: 14px; }' +
      '.gs-od-grp { display: grid; gap: 6px; padding-top: 12px; border-top: 1px solid var(--border, #E0DDD6); }' +
      '.gs-od-grp:first-child { border-top: 0; padding-top: 0; }' +
      '.gs-od-h { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--gold-dk, #8C6F2A); }' +
      '.gs-od-kv { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 6px 10px; align-items: baseline; }' +
      '.gs-od-k { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--gray, #6B6B6B); }' +
      '.gs-od-v { font-size: 14px; color: var(--black, #111111); min-width: 0; overflow-wrap: anywhere; }' +
      '.gs-od-v b { font-weight: 600; font-size: 13px; }' +
      '.gs-od-sub, .gs-od-muted { color: var(--gray, #6B6B6B); font-size: 13px; }' +
      '.gs-od-chip { display: inline-block; margin-left: 6px; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; background: #FBEAEA; color: #A33A2E; }' +
      '.gs-od-po .field-caption { display: none; }' +
      '.gs-od-v select { font: inherit; font-size: 13px; padding: 3px 6px; }';
    document.head.appendChild(st);
  }

  function shortWindow(w) {
    var m = String(w || '').match(/^\s*(\d{1,2}:\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)\s*$/i);
    if (!m) return String(w || '');
    var a = m[2].toUpperCase(), b = m[4].toUpperCase();
    return a === b ? m[1] + '–' + m[3] + ' ' + b : m[1] + ' ' + a + '–' + m[3] + ' ' + b;
  }

  function day(iso, weekday) {
    if (!iso) return '';
    var d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? iso + 'T12:00:00' : iso);
    if (isNaN(d.getTime())) return '';
    var f = { month: 'short', day: 'numeric' };
    if (weekday) f.weekday = 'short';
    return d.toLocaleDateString('en-US', f);
  }
  function fullDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function assignedDayText(o, opts) {
    o = o || {}; opts = opts || {};
    var list = opts.assignments || o.MyServiceAssignments || [];
    var seen = {}, days = [];
    if (o.AssignByService) list.forEach(function (a) {
      var d = String((a && a.ScheduledDate) || '').slice(0, 10);
      if (d && !seen[d]) { seen[d] = 1; days.push(d); }
    });
    days.sort();
    if (days.length) return day(days[0], opts.weekday) + (days.length > 1 ? ' – ' + day(days[days.length - 1], opts.weekday) : '');
    return day(o.DispatchDate, opts.weekday);
  }

  function splitNames(s) { return String(s || '').split(/\s*[,;]\s*/).map(function (n) { return n.trim(); }).filter(Boolean); }

  function people(o, opts) {
    var names = [];
    var add = function (n) { if (n && !names.some(function (x) { return x.toLowerCase() === n.toLowerCase(); })) names.push(n); };
    splitNames(o.Supervisor).forEach(add);
    (opts.assignments || []).forEach(function (a) { splitNames(a && a.AssignedTo).forEach(add); });
    var techs = opts.techs || [];
    var isSup = function (n) {
      return techs.some(function (t) { return String(t.name || '').trim().toLowerCase() === n.toLowerCase() && String(t.role || '').toLowerCase() === 'supervisor'; });
    };
    var sups = names.filter(isSup);
    return { sups: sups, techs: names.filter(function (n) { return sups.indexOf(n) === -1; }) };
  }

  function html(o, opts) {
    styleTag();
    o = o || {}; opts = opts || {};
    var id = esc(o.OrderID);
    var showPhones = opts.showPhones !== false;
    var phoneOf = function (n) {
      var t = (opts.techs || []).find(function (x) { return String(x.name || '').trim().toLowerCase() === String(n).trim().toLowerCase(); });
      return t && t.phone ? t.phone : '';
    };
    var person = function (n) { var ph = showPhones ? phoneOf(n) : ''; return esc(n) + (ph ? '<br><span class="gs-od-sub">' + esc(ph) + '</span>' : ''); };
    var kv = function (k, v) { return '<span class="gs-od-k">' + k + '</span><span class="gs-od-v">' + v + '</span>'; };
    var inInspection = INSPECTION.indexOf(o.Status) !== -1;
    var closed = o.Status === 'Completed' || o.Status === 'Cancelled';
    var win = '<span' + (opts.live ? ' id="window-display-' + id + '"' : '') + '>' + esc(shortWindow(o.ServiceWindow)) + '</span>';

    /* When */
    var when = [];
    if (inInspection || o.InspectionDate) {
      when.push(kv('Inspection', o.InspectionDate
        ? '<b>' + esc(day(o.InspectionDate, true)) + (o.InspectionWindow ? ' · ' + esc(shortWindow(o.InspectionWindow)) : '') + '</b>'
        : '—'));
    }
    var dayTxt = assignedDayText(o, { weekday: true, assignments: opts.assignments });
    if (o.RecurringServiceID) {
      when.push(kv('Scheduled', '<b>' + (esc(dayTxt) || '—') + (o.ServiceWindow ? ' · ' : '') + win + '</b>'));
    } else {
      if (dayTxt || o.ServiceWindow) when.push(kv('Scheduled', '<b>' + (esc(dayTxt) || '—') + (o.ServiceWindow ? ' · ' : '') + win + '</b>'));
      else if (!inInspection) when.push(kv('Scheduled', '<span class="gs-od-muted">Not scheduled yet</span>' + (opts.live ? ' <span id="window-display-' + id + '"></span>' : '')));
      when.push(kv('Entry', esc(fullDate(o.EntryDate))));
      var chip = '';
      if (!closed && o.DueDate) {
        var due = new Date(o.DueDate), today = new Date();
        due.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
        if (due.getTime() === today.getTime()) chip = ' <span class="gs-od-chip">Due today</span>';
        else if (due < today) chip = ' <span class="gs-od-chip">Overdue</span>';
      }
      when.push(kv('Due', '<span' + (opts.live ? ' id="due-display-' + id + '"' : '') + '>' + esc(fullDate(o.DueDate)) + '</span>' + chip));
    }

    /* Where */
    var unit = [o.BuildingNumber ? 'Bldg ' + esc(o.BuildingNumber) : '', o.UnitNumber ? 'Unit ' + esc(o.UnitNumber) : '',
      (o.Bedrooms || o.Bathrooms) ? esc(o.Bedrooms || '—') + 'bd/' + esc(o.Bathrooms || '—') + 'ba' : ''].filter(Boolean).join(' · ');
    var where = [kv('Unit', unit || '—')];
    var po = opts.poHtml != null ? opts.poHtml : (o.CustomerPO ? esc(o.CustomerPO) : '');
    if (po) where.push('<span class="gs-od-k">Customer PO</span><span class="gs-od-v gs-od-po">' + po + '</span>');

    var grp = function (title, items) { return '<div class="gs-od-grp"><div class="gs-od-h">' + title + '</div><div class="gs-od-kv">' + items.join('') + '</div></div>'; };
    var out = grp('When', when) + grp('Where', where);

    /* Who */
    if (opts.showWho !== false) {
      var who = [];
      if (inInspection) {
        who.push(kv('Inspecting', o.InspectionBy ? person(o.InspectionBy) : '<span class="gs-od-muted">Not assigned yet</span>'));
      } else {
        var p = people(o, opts);
        if (!p.sups.length && !p.techs.length) who.push(kv('Assigned', '<span class="gs-od-muted">Not assigned yet</span>'));
        if (p.sups.length) who.push(kv(p.sups.length > 1 ? 'Supervisors' : 'Supervisor', p.sups.map(person).join('<br>')));
        if (p.techs.length) who.push(kv(p.techs.length > 1 ? 'Technicians' : 'Technician', p.techs.map(person).join('<br>')));
      }
      out += grp('Who', who);
    }
    return '<div class="gs-od">' + out + '</div>';
  }

  window.GSOrderDetails = { html: html, assignedDayText: assignedDayText, shortWindow: shortWindow };
})();
