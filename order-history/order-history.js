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
         opts.mode: 'staff' (todo, Admin) | 'tech' (Tech: todo menos lo
           interno de oficina) | 'client' (filtrado, Orders) -- default
           'staff'. Cada portal ve SU version de la misma informacion
           (pedido del dueño, 26/09/2026).
         opts.clientId + opts.clientName: si ChangedBy es el ClientID
           de la orden (lo que guarda Orders), se muestra el nombre.
         opts.actorName(changedBy): igual, pero decide quien llama
           (Admin tiene la lista de clientes). Devuelve '' para dejarlo.
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
  /* '06:00' (24h, como lo guarda EntryTime) -> '6:00 AM'. */
  function fmtTime24(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    if (!m) return String(t || '');
    var h = parseInt(m[1], 10), min = m[2];
    var period = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + min + ' ' + period;
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
    'Services Change Requested':'Services change requested',
    'Service Change Requested': 'Service change requested',
    'Service Change Resolved':  'Service change resolved',
    'Services Updated':         'Services updated',
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
    'Archived':                 'Archived',
    /* "Assign by service" (Admin > Scheduling/Active, 21/09/2026) --
       una orden puede asignarse servicio por servicio en vez de como
       un solo bloque. El evento generico de categoria va aqui; el
       servicio especifico + quien + cuando va en Notes o en
       NewValue, segun el caso (ver detailLinesFor mas abajo). */
    'Service Scheduled':          'Service scheduled',
    'Order Moved To Active':      'Order moved to Active',
    'Service Marked Done By Tech':'Service marked done by tech',
    'Service Completed':          'Service completed',
    /* v1.58.0 -- recurrentes: la oficina cierra TODO lo de una persona
       de un jalon (Admin > Active, boton por persona). */
    'Work Completed':             'Work completed',
    'Service Now Active':         'Service now active',
    'Service Needs Scheduling':   'Needs scheduling',
    'Service Order Changed':      'Service order changed',
    'Service Added':              'Service added to order',
    'Service Removed':            'Service removed from order',
    /* Inspeccion (25/09/2026): la oficina manda "Inspection first", el
       supervisor va a ver, y luego la orden sigue a Scheduling. */
    'Inspection':                 'Inspection scheduled',
    'Inspected':                  'Inspection done',
    'Received':                   'Ready to schedule',
    /* 27/09/2026 (dueño): salian con el nombre interno tal cual. */
    'Order Details Set':          'Order updated',
    'Division Changed':           'Division changed',
    'Scheduling':                 'Sent back to Scheduling',
    'Occupied Unit Reported':     'Occupied unit reported',
    'Materials Ready':            'Marked as ready',
    'Materials Ready Cancelled':  'Ready cancelled',
    'Materials Ready Seen':       'Ready seen by office',
    'Reopened by Tech':           'Reopened by tech',
    'Change Approved':            'Change approved',
    'Site Ready Confirmed':       'Site ready confirmed',
    'Site Not Ready Reported':    'Site not ready reported',
    'Readiness Alert Resolved':   'Readiness alert resolved',
    'Client Data Updated':        'Client info updated',
    'Technician Unavailable':     'Technician unavailable',
    'Extra Requested':            'Extra requested',
    'Request Cancelled by Client':'Request cancelled by client',
    'Requested Dates Withdrawn':  'Requested dates withdrawn',
    'Requested Dates Rejected':   'Requested dates not approved',
    'Cancellation Reversed':      'Cancellation reversed'
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
  var ALWAYS_HIDDEN_TYPES = ['Document Generated', 'Document Failed', 'Archived',
    /* Fila resumen de lote (submit-order.js, Flujo D) -- nunca tuvo
       etiqueta ni detalle propio en este archivo, se veia vacia/
       redundante junto a "Order created", que ya trae Entry/Due/
       servicios. BUG REAL reportado por el dueno con captura real,
       18/09/2026. */
    'Batch Created'];

  /* --- Ademas de lo anterior, esto se esconde SOLO del cliente --
     mismas reglas que ya existian en tracking.html, mas Office
     Change (Internal) que ya cubre las notas de oficina. --- */
  function isHiddenFromClient(h) {
    var fc = String(h.FieldChanged || '');
    if (fc === 'Office Change (Internal)') return true;
    if (fc === 'Supervisor') return true;
    if (fc === 'Inspection Date') return true;
    if (fc === 'Delay Reason' || fc === 'Delay Reason Notes') return true;
    /* A peticion del dueño (20/09/2026, con captura real): 'Order
       Approved' ("Marked as seen") es el momento en que la oficina
       confirma internamente que YA VIO una orden que se autoasigno
       sola (desde Scheduling) -- le importa a oficina (staff mode
       sigue mostrandolo tal cual, esto NO toca esa vista), pero para
       el cliente no aporta nada nuevo: FieldChanged siempre es
       'Status' (admin-approve-order.js), y los cambios de Status
       nunca generan una linea de detalle propia (ver mas abajo,
       "nunca se imprime: el evento... ya va en su propia columna").
       Ademas 'Order Assigned' ("Assigned") ya se creo justo antes, en
       la MISMA accion real de oficina, y ese SI le dice al cliente lo
       unico que importa (quien y cuando) -- 'Marked as seen' se
       queda como un renglon vacio pegado justo despues, repitiendo lo
       mismo sin decir nada nuevo. */
    if (String(h.ChangeType || '') === 'Order Approved') return true;
    /* "Assign by service" -- pasos internos/mecanicos del modelo por
       servicio (el tecnico ya dijo "ya acabe" pero oficina todavia no
       lo confirma, el sistema avanzando solo al siguiente servicio,
       reordenar la cola, o el aviso interno de "hace falta
       programar"). No le agregan nada nuevo al cliente que 'Service
       Scheduled'/'Service Completed' no le digan ya. A peticion
       explicita del dueño: "el cliente solo ve asignaciones y
       servicios completados". OJO: esto deja 'Service Marked Done By
       Tech' oculto del cliente, a diferencia de como 'Tech Marked
       Complete' (el evento de todo-el-pedido de hoy) se comporta hoy
       -- ese NO esta oculto. Confirmar con el dueño si quiere igualar
       ese comportamiento tambien para el caso de todo-el-pedido. */
    var perServiceHiddenTypes = ['Order Moved To Active', 'Service Marked Done By Tech',
      'Service Now Active', 'Service Needs Scheduling', 'Service Order Changed'];
    if (perServiceHiddenTypes.indexOf(String(h.ChangeType || '')) !== -1) return true;
    return false;
  }

  /* --- Modo 'tech' (26/09/2026, pedido del dueño: "a excepcion de
     eventos internos, todo lo que tenga informacion debe ser visible"):
     el tecnico ve todo lo del cliente y de campo, incluidas las
     solicitudes pendientes, pero no los movimientos internos de
     oficina (cambio interno y su decision, 'Marked as seen'). --- */
  function isHiddenFromTech(h) {
    if (String(h.FieldChanged || '') === 'Office Change (Internal)') return true;
    if (String(h.ChangeType || '') === 'Order Approved') return true;
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

  /* BUG REAL encontrado y arreglado (20/09/2026, reportado por el
     dueño con una orden real): mostraba SubOption tal cual, ANTES
     que nada -- para el catalogo nuevo (basado en SKU), eso imprimia
     el SKU crudo directo (ej. "110-38") en el historial de las 3
     apps, incluido el lado del cliente (Orders). Nunca revisaba
     Quantity tampoco. Mismo criterio correcto que ya usan
     customer.html/tracking.html (su propio svcSubLabel, definido por
     separado ahi) -- isSkuFormat primero, y solo entonces Level o
     Quantity; el texto crudo de SubOption solo se muestra para
     ordenes viejas de antes del catalogo SKU (formato legado, texto
     libre real, no un codigo interno). */
  function isSkuFormat(sub) { return /^\d{3}-\d+$/.test(String(sub || '')); }
  function svcSubLabel(s) {
    if (isSkuFormat(s.SubOption)) return s.Level || (s.Quantity ? 'Qty: ' + s.Quantity : '');
    return s.SubOption || '';
  }

  /* Suma de minutos de un arreglo de servicios contra un catalogo de
     tiempos (SKU -> {division, level1, level2, level3}) -- mismo
     criterio que admin.html (Janitorial usa level2/level3 segun el
     Level del servicio, todo lo demas usa level1). Opcional: solo
     quien tiene el catalogo (hoy, Admin) ve esta linea -- Orders/Tech
     llaman a este componente igual que siempre, sin nada nuevo. */
  function catalogGet(catalog, sku) {
    if (!catalog) return null;
    return catalog.get ? catalog.get(String(sku || '').trim()) : catalog[String(sku || '').trim()];
  }
  function calcMinutesForCatalog(services, catalog) {
    if (!catalog) return null;
    var total = 0, any = false;
    (services || []).forEach(function (s) {
      var svc = catalogGet(catalog, s.SubOption);
      if (!svc) return;
      var minutes;
      if (svc.division === 'Janitorial' && s.Level === 'Level 2') minutes = svc.level2;
      else if (svc.division === 'Janitorial' && s.Level === 'Level 3') minutes = svc.level3;
      else minutes = svc.level1;
      if (minutes == null) return;
      any = true;
      total += minutes;
    });
    return any ? total : null;
  }
  function fmtMins(m) {
    var h = Math.floor(m / 60), mm = m % 60;
    if (h && mm) return h + 'h ' + mm + 'min';
    if (h) return h + 'h';
    return mm + 'min';
  }

  /* Clasifica que tan grande es un cambio de servicios, comparando
     por Category|ServiceName (mismo criterio que ya usa detailLinesFor
     mas abajo para el diff visual del historial):
       'none'          -- identicos, nada cambio
       'level-only'    -- mismos servicios (nada agregado/quitado),
                          solo cambio Level en alguno
       'added-removed' -- se agrego o quito al menos un servicio
     Agregado 20/09/2026 para que Admin pueda distinguir "Approve"
     (nomas nivel, se aplica directo) de "Reassign" (servicio nuevo de
     verdad, la oficina lo confirma a proposito) en la tarjeta de
     cambio sugerido por un supervisor. */
  function servicesDiffKind(oldSvcs, newSvcs) {
    var keyOf = function (s) { return (s.Category || '') + '|' + (s.ServiceName || ''); };
    var oldMap = {}; (oldSvcs || []).forEach(function (s) { oldMap[keyOf(s)] = s; });
    var newMap = {}; (newSvcs || []).forEach(function (s) { newMap[keyOf(s)] = s; });
    var oldKeys = Object.keys(oldMap), newKeys = Object.keys(newMap);
    for (var i = 0; i < newKeys.length; i++) { if (!oldMap[newKeys[i]]) return 'added-removed'; }
    for (var j = 0; j < oldKeys.length; j++) { if (!newMap[oldKeys[j]]) return 'added-removed'; }
    var levelChanged = false;
    newKeys.forEach(function (k) {
      if ((oldMap[k].Level || '') !== (newMap[k].Level || '')) levelChanged = true;
    });
    return levelChanged ? 'level-only' : 'none';
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
  /* Inspeccion: NewValue trae JSON { inspectionBy, inspectionDate,
     inspectionWindow, inspectionDoneAt, crew, services? }. Nunca se
     imprime crudo. La gente propuesta (crew) es interna: no sale en
     modo cliente. */
  function isInspectionRow(h) {
    var ct = String(h.ChangeType || ''), fc = String(h.FieldChanged || '');
    return ct === 'Inspection' || ct === 'Inspected' || fc === 'Inspection' || fc === 'Inspection Update';
  }
  function inspectionLines(h, mode) {
    var v = null;
    try { v = JSON.parse(String(h.NewValue || '').replace(/^SERVICES:/, '') || 'null'); } catch (e) { v = null; }
    var out = [];
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    if (v.inspectionDate) out.push('📅 Inspection: ' + esc(fmtDate(v.inspectionDate)) + (v.inspectionWindow ? ' · ' + esc(v.inspectionWindow) : ''));
    if (v.inspectionBy) out.push('👤 Supervisor: ' + esc(v.inspectionBy));
    if (v.inspectionDoneAt) out.push('✅ Done: ' + esc(fmtDateTime(v.inspectionDoneAt)));
    if (mode !== 'client' && Array.isArray(v.crew) && v.crew.length) out.push('👷 Suggested crew: ' + v.crew.map(esc).join(', '));
    return out;
  }

  /* --- Cambio pedido por la oficina (admin-update-order.js, modo
     solicitud): OldValue/NewValue traen, ademas de los servicios,
     fields:{entryDate, dueDate, serviceWindow, dispatchDate,
     inspectionDate, supervisor, notes, delayReasonType,
     delayReasonNotes}. BUG REAL (26/09/2026, reportado por el dueño:
     "se ve el cambio pero no se ve que cosa fue"): esto nunca se leia,
     un cambio de fechas o notas salia como "Change requested" vacio.
     Al cliente solo le llegan fechas y horario, mismo criterio que
     admin-update-order.js usa para decidir si el cambio es interno. --- */
  var REQUEST_FIELDS = [
    ['entryDate', '📅', 'Entry', 'date', true],
    ['dispatchDate', '📅', 'Scheduled', 'date', true],
    ['dueDate', '📅', 'Due', 'date', true],
    ['serviceWindow', '🕐', 'Window', 'text', true],
    ['inspectionDate', '🔍', 'Inspection', 'date', false],
    ['supervisor', '👤', 'Supervisor', 'text', false],
    ['notes', '📝', 'Notes', 'text', false],
    ['delayReasonType', '⏳', 'Delay reason', 'text', false],
    ['delayReasonNotes', '⏳', 'Delay notes', 'text', false]
  ];
  function requestFieldLines(oldF, newF, mode) {
    var out = [];
    if (!oldF || !newF || typeof oldF !== 'object' || typeof newF !== 'object') return out;
    REQUEST_FIELDS.forEach(function (d) {
      if (mode === 'client' && !d[4]) return;
      var o = oldF[d[0]] == null ? '' : String(oldF[d[0]]);
      var n = newF[d[0]] == null ? '' : String(newF[d[0]]);
      if (d[3] === 'date') { o = o ? fmtDate(o) : ''; n = n ? fmtDate(n) : ''; }
      if (o !== n) out.push(changeLine(d[1], d[2], o, n));
    });
    return out;
  }

  /* 'Service Change Requested' (Orders, submit-order.js, cliente edita
     una orden ya programada): un renglon por servicio, FieldChanged =
     'Add' | 'Modify' | 'Remove', NewValue = {category, serviceName,
     detail} (detail = el servicio, o {old, new} en Modify). Antes salia
     "Add: (none) → {json crudo}". */
  function serviceChangeRequestLines(h) {
    var v = null; try { v = JSON.parse(h.NewValue || 'null'); } catch (e) {}
    if (!v || !v.serviceName) return [];
    var sub = String(h.FieldChanged || ''), d = v.detail || {};
    if (sub === 'Add') return [addedLine(v.serviceName, svcSubLabel(d))];
    if (sub === 'Remove') return [removedLine(v.serviceName, svcSubLabel(d))];
    var o = d.old || {}, n = d.new || {};
    var ol = svcSubLabel(o) || o.Level || '', nl = svcSubLabel(n) || n.Level || '';
    return [changeLine('🔄', v.serviceName, ol || '(none)', nl || '(none)')];
  }

  function detailLinesFor(h, catalog, mode) {
    var inspRow = isInspectionRow(h);
    var oldPay = parseServicesPayload(h.OldValue);
    var newPay = parseServicesPayload(h.NewValue);
    var oldSvcs = oldPay ? oldPay.services : null;
    var newSvcs = newPay ? newPay.services : null;
    var oldDates = parseDatesPayload(h.OldValue);
    var newDates = parseDatesPayload(h.NewValue);
    var lines = inspRow ? inspectionLines(h, mode) : [];

    if (h.ChangeType === 'Service Change Requested') return lines.concat(serviceChangeRequestLines(h));

    /* Solo trae la lista nueva (sin antes contra que comparar):
       - 'Services Updated' del cliente (submit-order.js): cambios de
         nivel/cantidad aplicados directo, NewValue {services:[...]}.
       - 'Services Change Requested' (request-change.js): OldValue es el
         texto de Orders.Services, no una lista; NewValue {services,
         removedNotes}. Antes salia el JSON crudo. */
    if (Array.isArray(newSvcs) && !Array.isArray(oldSvcs) &&
        (h.ChangeType === 'Services Updated' || h.ChangeType === 'Services Change Requested')) {
      var isReq = h.ChangeType === 'Services Change Requested';
      newSvcs.forEach(function (s) {
        var lbl = svcSubLabel(s);
        lines.push(isReq ? '• ' + esc(s.ServiceName || '') + (lbl ? ' — ' + esc(lbl) : '')
                         : '🔄 ' + esc(s.ServiceName || '') + (lbl ? ': ' + esc(lbl) : ''));
      });
      (newPay.removedNotes || []).forEach(function (r) {
        if (r && r.serviceName) lines.push(removedLine(r.serviceName, r.note || ''));
      });
      return lines;
    }

    if (h.ChangeType === 'Created') {
      if (newPay) {
        if (newPay.entryDate) lines.push('📅 Entry: ' + esc(fmtDate(newPay.entryDate)));
        if (newPay.dueDate) lines.push('📅 Due: ' + esc(fmtDate(newPay.dueDate)));
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

    /* Division Mixed automatica (gsocd-shared v1.35.0+, division-rules.js
       del lado backend): antes del detalle propio, Notes traia la
       explicacion en una frase completa ("Division changed from X to
       Mixed because of: ..."), que se veia repetida/de mas junto al
       renglon 'Division: X → Y' de aqui abajo (mismo patron generico
       de FieldChanged/OldValue/NewValue que usa cualquier otro campo).
       BUG REAL reportado por el dueño con captura real, 20/09/2026:
       ahora Notes se manda vacio y el servicio (o servicios) que causo
       el cambio va en el MISMO detalle, con el mismo formato ➕ que ya
       usa el resto del historial para servicios agregados -- NewValue
       trae {division, causedBy:[{serviceName,division},...]} en vez de
       solo el nombre de la division nueva. */
    /* A peticion del dueño (20/09/2026, con captura real): se veia
       como texto suelto ("Expected ready date set to 2026-09-21.
       Ready for entry at 06:00.") en vez de una caja con icono como
       el resto del historial. save-expected-ready-date.js/
       set-materials-ready.js ahora mandan NewValue con el dato real
       (la fecha o la hora, sin envolver en una oracion) -- aqui se
       formatea bonito. Si NewValue viene vacio (rows viejos, de antes
       de este cambio, o la fecha se borro/la orden se apago), no pasa
       nada -- Notes se sigue viendo tal cual como fallback (ver
       noteFor), nunca se pierde informacion de un renglon viejo. */
    if (h.ChangeType === 'Expected Ready Date') {
      if (h.NewValue) lines.push('📅 Ready date: ' + esc(fmtDate(h.NewValue)));
      return lines;
    }
    if (h.ChangeType === 'Materials Ready') {
      if (h.NewValue) lines.push('🕐 Ready for entry at: ' + esc(fmtTime24(h.NewValue)));
      return lines;
    }

    if (h.ChangeType === 'Division Changed') {
      var dc = null;
      try { dc = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      var newDivisionVal = (dc && dc.division) || h.NewValue || '';
      lines.push(changeLine('🔀', 'Division', h.OldValue || '', newDivisionVal));
      var causedBy = (dc && Array.isArray(dc.causedBy)) ? dc.causedBy : [];
      causedBy.forEach(function (s) {
        lines.push(addedLine(s.serviceName || '', s.division || ''));
      });
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
      lines = lines.concat(requestFieldLines(oldPay.fields, newPay.fields, mode));
      var isNC = function (s) { return s.NotCompleted === true || String(s.NotCompleted) === 'true'; };
      var keyOf = function (s) { return (s.Category || '') + '|' + (s.ServiceName || ''); };
      var oldMap = {}; oldSvcs.forEach(function (s) { oldMap[keyOf(s)] = s; });
      var newMap = {}; newSvcs.forEach(function (s) { newMap[keyOf(s)] = s; });
      newSvcs.forEach(function (s) {
        var k = keyOf(s), prev = oldMap[k], label = svcSubLabel(s);
        if (!prev) { lines.push(addedLine(s.ServiceName || '', label)); return; }
        var prevLabel = svcSubLabel(prev);
        var labelLine = prevLabel !== label ? changeLine('🔄', s.ServiceName || '', prevLabel || '(none)', label || '(none)') : '';
        if (labelLine) lines.push(labelLine);
        /* svcSubLabel() no sirve para esto: en Janitorial el SubOption
           (sku) es siempre el mismo sin importar el nivel -- ese
           "||" tapaba cualquier cambio de Level, porque SubOption
           (con valor) siempre gana. Se compara Level aparte, igual de
           explicito que NotCompleted abajo. */
        /* Si el SKU ya dijo el cambio de nivel arriba (svcSubLabel
           devuelve Level), no se repite -- salia 2 veces igual. */
        var levelLine = (prev.Level || '') !== (s.Level || '') ? changeLine('🔄', s.ServiceName || '', prev.Level || '(none)', s.Level || '(none)') : '';
        if (levelLine && levelLine !== labelLine) lines.push(levelLine);
        if (isNC(prev) !== isNC(s)) {
          lines.push(changeLine(isNC(s) ? '⚠️' : '✅', s.ServiceName || '', isNC(s) ? 'Completed' : 'Not completed', isNC(s) ? 'Not completed' : 'Completed'));
          if (isNC(s) && s.NotCompletedReason) lines.push('&nbsp;&nbsp;Reason: ' + esc(s.NotCompletedReason));
        } else if (isNC(s) && (prev.NotCompletedReason || '') !== (s.NotCompletedReason || '')) {
          lines.push(changeLine('🔄', 'Reason (' + (s.ServiceName || '') + ')', prev.NotCompletedReason || '(empty)', s.NotCompletedReason || '(empty)'));
        }
      });
      oldSvcs.forEach(function (s) {
        var k = keyOf(s);
        if (!newMap[k]) lines.push(removedLine(s.ServiceName || '', svcSubLabel(s)));
      });
      var dOld = (oldPay && oldPay.dirtLevel) || '', dNew = (newPay && newPay.dirtLevel) || '';
      if (dOld !== dNew && (dOld || dNew)) lines.push(changeLine('🧹', 'Condition', dOld, dNew));
      var oldMins = calcMinutesForCatalog(oldSvcs, catalog);
      var newMins = calcMinutesForCatalog(newSvcs, catalog);
      if (oldMins != null && newMins != null && oldMins !== newMins) {
        var delta = newMins - oldMins;
        lines.push('🕐 Estimated time: ' + fmtMins(oldMins) + ' → ' + fmtMins(newMins) +
          ' (' + (delta > 0 ? '+' : '-') + fmtMins(Math.abs(delta)) + ')');
      }
      return lines;
    }

    /* "Assign by service" -- mismo patron que el resto del archivo:
       NewValue trae el dato estructurado (JSON), aqui se convierte en
       lineas con icono para la caja de detalle expandible. */
    if (h.ChangeType === 'Service Scheduled' && h._svcBatch) {
      /* Toda la tanda de programacion (juntada en mergeServiceScheduled):
         un bloque por persona y fecha, con sus servicios abajo. */
      h._svcBatch.groups.forEach(function (g) {
        lines.push('👤 ' + esc(g.assigned) + (g.date ? ' · 📅 ' + esc(fmtDate(g.date)) : ''));
        g.services.forEach(function (n) { lines.push('• ' + esc(n)); });
      });
      return lines;
    }
    if (h.ChangeType === 'Service Scheduled') {
      var ss = null; try { ss = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      if (ss) {
        /* BUG REAL encontrado (21/09/2026, reportado por el dueño --
           "en fechas y horas nunca debe aparecer UTC"): ss.date se
           mostraba tal cual llega del backend (YYYY-MM-DD crudo),
           sin pasar por fmtDate() como SI hace el resto del archivo
           en cualquier otro changeLine('📅', ...).

           SEGUNDO BUG REAL, tambien reportado en vivo ("se ven
           repetidos los iconos"): en el tracker del cliente, varios
           servicios distintos terminan fusionados en un solo punto
           (ver tracking.html, "Assigned") -- ahi, la linea de fecha
           generica ('📅 Date: ...') se repite identica para cada
           servicio, sin decir de CUAL es, aunque la de arriba (👤)
           si trae el nombre. Se ve como el mismo icono duplicado.
           Ahora el nombre del servicio va en las 2 lineas, no solo
           en la primera -- cada linea se entiende por su cuenta,
           sin depender de la de arriba. */
        lines.push(changeLine('👤', ss.serviceName, ss.assigned, ss.assigned));
        lines.push(changeLine('📅', ss.serviceName + ' date', fmtDate(ss.date), fmtDate(ss.date)));
      }
      return lines;
    }
    if (h.ChangeType === 'Service Marked Done By Tech') {
      var sm = null; try { sm = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      if (sm) lines.push('🕐 ' + esc(sm.serviceName) + ' — waiting on office to confirm');
      return lines;
    }
    /* v1.58.0 (24/09/2026, pedido del dueño): cuando la oficina marca
       completado a una PERSONA en una recurrente, el historial dice
       quien termino y la lista de lo que hizo, agrupada por lugar.
       NewValue: { person, items:[{place, service, level}], finishedText,
       confirmedNote }. Tambien entiende el formato del primer dia
       ('Service Completed' con services:["Lugar · Servicio"]). */
    function workLines(person, items, finished, note) {
      var out = [];
      out.push('👤 <b>' + esc(person) + '</b> finished their work' + (finished ? ' — ' + esc(fmtDateTime(finished)) : ''));
      if (note) out.push('✅ ' + esc(note));
      var byPlace = [], idx = {};
      (items || []).forEach(function (it) {
        var k = it.place || '';
        if (!(k in idx)) { idx[k] = byPlace.length; byPlace.push({ place: k, svcs: [] }); }
        byPlace[idx[k]].svcs.push(esc(it.service) + (it.level ? ' <span style="color:#8C6F2A;font-weight:700;font-size:10px">' + esc(String(it.level).replace('Level ', 'L')) + '</span>' : ''));
      });
      byPlace.forEach(function (g) { out.push('📍 ' + (g.place ? '<b>' + esc(g.place) + '</b>: ' : '') + g.svcs.join(', ')); });
      return out;
    }
    if (h.ChangeType === 'Work Completed') {
      var wc = null; try { wc = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      /* Varias personas en UN solo evento (el dueño: "en un mismo evento,
         pero si por separado"): { people:[{person, items, confirmedNote}],
         finishedText } -- una seccion por persona, separadas. */
      if (wc && Array.isArray(wc.people)) {
        wc.people.forEach(function (pp, i) {
          if (i > 0) lines.push('<span style="display:block;border-top:1px dashed #E0DDD6;margin:4px 0"></span>');
          lines = lines.concat(workLines(pp.person, pp.items, i === 0 ? wc.finishedText : '', pp.confirmedNote || wc.confirmedNote));
        });
        return lines;
      }
      if (wc) return workLines(wc.person, wc.items, wc.finishedText, wc.confirmedNote);
      return lines;
    }
    if (h.ChangeType === 'Service Completed') {
      var sc = null; try { sc = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      if (sc && Array.isArray(sc.services) && sc.completedBy && !sc.serviceName.indexOf('All of ')) {
        return workLines(sc.completedBy, sc.services.map(function (t) {
          var parts = String(t).split(' · '); return parts.length > 1 ? { place: parts[0], service: parts.slice(1).join(' · ') } : { place: '', service: t };
        }), sc.finishedText, sc.confirmedNote);
      }
      if (sc) {
        /* BUG REAL: sc.finishedText es el ISOString crudo que manda
           complete-service-assignment.js (con hora Y "Z" de UTC) --
           nunca se le aplicaba fmtDateTime(), se imprimia tal cual.
           Mismo arreglo de "que servicio es" que Service Scheduled
           arriba -- el nombre va en cada linea, no solo en la primera. */
        lines.push(changeLine('👤', sc.serviceName + ' — Completed by', sc.completedBy, sc.completedBy));
        lines.push('📅 ' + esc(sc.serviceName) + ' finished: ' + esc(fmtDateTime(sc.finishedText)));
        if (sc.confirmedNote) lines.push('✅ ' + esc(sc.confirmedNote));
      }
      return lines;
    }
    if (h.ChangeType === 'Service Now Active') {
      var sn = null; try { sn = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      /* BUG REAL: sn.date crudo, y ademas construido como una sola
         oracion de texto plano en vez de usar changeLine() como el
         resto del archivo -- mismo "sin diseno" que senalo el dueño. */
      if (sn) lines.push(changeLine('✅', sn.serviceName + ' — already scheduled', sn.assigned + ', ' + fmtDate(sn.date), sn.assigned + ', ' + fmtDate(sn.date)));
      return lines;
    }
    if (h.ChangeType === 'Service Needs Scheduling') {
      var sq = null; try { sq = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      if (sq) lines.push('📋 ' + esc(sq.serviceName) + ' needs to be scheduled before work can continue');
      return lines;
    }
    if (h.ChangeType === 'Service Order Changed') {
      var so = null; try { so = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      (so && so.order || []).forEach(function (name, i) { lines.push('🔀 ' + (i + 1) + '. ' + esc(name)); });
      return lines;
    }
    if (h.ChangeType === 'Service Added') {
      var sa = null; try { sa = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      if (sa) lines.push(addedLine(sa.serviceName, 'needs scheduling like any other service'));
      return lines;
    }
    if (h.ChangeType === 'Service Removed') {
      var sr = null; try { sr = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      if (sr) lines.push(removedLine(sr.serviceName, 'approved by office, was not completed'));
      return lines;
    }
    if (h.ChangeType === 'Service Change Resolved') {
      var scr = svcNameOf(h);
      if (scr) lines.push('✅ ' + esc(scr));
      return lines;
    }
    if (h.ChangeType === 'Completed' && h.FieldChanged === 'PerServiceRecap') {
      var rc = null; try { rc = JSON.parse(h.NewValue || 'null'); } catch (e) {}
      (rc && rc.recap || []).forEach(function (r) { lines.push('✅ ' + esc(r.serviceName) + ' — ' + esc(r.completedBy)); });
      return lines;
    }

    /* BUG REAL arreglado (20/09/2026, reportado por el dueño): esto
       mostraba el nombre interno crudo del campo y los booleanos tal
       cual ("🔄 TechMarkedComplete: false → true") para
       submit-employee-complete.js (Tech), un renglon tecnico feo
       encima de su propia Notes en prosa ("Andres marked their work
       as done...") que ya explica todo bien por su cuenta. Mismo
       criterio que 'Status' (excluido de esta linea generica porque
       el ChangeType/Notes ya lo cubren) -- 'TechMarkedComplete' se
       agrega a la misma exclusion. */
    /* NewValue igual al ChangeType = solo repite el estatus nuevo (ej.
       'Unit not ready' de Tech: FieldChanged 'Delay Reason', Old/New =
       estatus). Salia "Delay Reason: Assigned → Change Requested"; el
       motivo real ya va en Notes. 'Office Change (Internal)' es la
       marca de la decision sobre un cambio interno (Old/New = estatus),
       no un campo: salia "Office Change (Internal): Change Requested →
       Assigned". */
    if (!inspRow && h.FieldChanged && h.FieldChanged !== 'Status' && h.FieldChanged !== 'TechMarkedComplete' && h.FieldChanged !== 'Office Change (Internal)' && (h.OldValue || h.NewValue) &&
        String(h.NewValue || '') !== String(h.ChangeType || '')) {
      lines.push(changeLine('🔄', h.FieldChanged, h.OldValue || '', h.NewValue || ''));
    }
    return lines;
  }

  var GROUP_WINDOW_MS = 60000;

  /* --- Pasada 0 (25/09/2026, pedido del dueño): "Assign by service"
     guarda un renglon 'Service Scheduled' por servicio, mas un
     'Order Moved To Active' con el primero. Para el dueño programar
     la orden es UN solo evento ("el primero es solo un evento"), aunque
     se haya repartido entre varias personas y dias: todos los
     'Service Scheduled' seguidos del mismo quien (sin mas de 30 min
     entre uno y otro, sin otro evento en medio) se juntan en UN
     renglon, con el detalle por persona y fecha adentro. El 'Order
     Moved To Active' de esa misma tanda se absorbe (ya no sale aparte).
     Los completados ('Service Completed') siguen saliendo cada uno por
     su lado. --- */
  var SVC_BATCH_GAP_MS = 30 * 60000;
  var SVC_BATCH_ABSORB = ['Order Moved To Active'];
  var SVC_BATCH_PASSTHRU = ['Service Now Active', 'Service Needs Scheduling'];
  function svcSchedOf(h) {
    if (String(h.ChangeType || '') !== 'Service Scheduled') return null;
    try { var v = JSON.parse(h.NewValue || 'null'); return v && v.serviceName ? v : null; } catch (e) { return null; }
  }
  function tOf(h) { return new Date(h.ChangeDate).getTime(); }
  function mergeServiceScheduled(rows) {
    var out = [], used = {};
    for (var i = 0; i < rows.length; i++) {
      if (used[i]) continue;
      var h = rows[i], v = svcSchedOf(h);
      var absorbable = SVC_BATCH_ABSORB.indexOf(String(h.ChangeType || '')) !== -1;
      if (!v && !absorbable) { out.push(h); continue; }
      var by = String(h.ChangedBy || ''), tLast = tOf(h);
      var sched = v ? [{ h: h, v: v }] : [], after = [], took = [];
      for (var j = i + 1; j < rows.length; j++) {
        if (used[j]) continue;
        var r = rows[j], type = String(r.ChangeType || '');
        if (Math.abs(tOf(r) - tLast) > SVC_BATCH_GAP_MS) break;
        var w = svcSchedOf(r);
        if (w && String(r.ChangedBy || '') === by) { sched.push({ h: r, v: w }); took.push(j); tLast = tOf(r); continue; }
        if (SVC_BATCH_ABSORB.indexOf(type) !== -1) { took.push(j); tLast = tOf(r); continue; }
        if (!w && SVC_BATCH_PASSTHRU.indexOf(type) !== -1) { after.push(r); took.push(j); continue; }
        break;
      }
      if (!sched.length) { out.push(h); continue; }
      took.forEach(function (k) { used[k] = true; });
      sched.sort(function (a, b) { return tOf(a.h) - tOf(b.h); });
      /* Mismo servicio programado 2 veces en la misma tanda: vale el ultimo. */
      var last = {};
      sched.forEach(function (s) { last[s.v.serviceName] = s.v; });
      var groups = [], byKey = {}, people = {}, total = 0;
      sched.forEach(function (s) {
        var fin = last[s.v.serviceName];
        if (fin !== s.v) return;
        var key = String(fin.assigned) + '|' + String(fin.date);
        if (!byKey[key]) { byKey[key] = { assigned: fin.assigned, date: fin.date, services: [] }; groups.push(byKey[key]); }
        byKey[key].services.push(fin.serviceName);
        people[String(fin.assigned)] = true;
        total++;
      });
      var first = sched[0].h, nPeople = Object.keys(people).length;
      if (total === 1) {
        out.push(sched.filter(function (s) { return last[s.v.serviceName] === s.v; })[0].h);
      } else {
        out.push(Object.assign({}, first, {
          _svcBatch: { groups: groups },
          _label: nPeople === 1
            ? 'Scheduled for ' + groups[0].assigned + ' · ' + total + ' services'
            : 'Services scheduled · ' + total + ' services · ' + nPeople + ' people'
        }));
      }
      after.forEach(function (r) { out.push(r); });
    }
    return out;
  }

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
  /* 26/09/2026: lo mismo para los renglones de servicios de la misma
     solicitud del cliente ('Services Change Requested' de
     request-change.js, y los 'Service Change Requested' de
     submit-order.js, uno por servicio) -- todo sale en UNA burbuja
     con fechas y servicios adentro. Si hubo servicios, la etiqueta es
     "Change requested" (no solo "New dates requested"). */
  var REQUEST_PARTS = ['Reschedule Requested', 'Services Change Requested', 'Service Change Requested'];
  function mergeRescheduleRequest(groups) {
    var out = [];
    groups.forEach(function (g) {
      var prev = out[out.length - 1];
      var type = String(g.rep.ChangeType || '');
      var isPart = REQUEST_PARTS.indexOf(type) !== -1;
      var prevType = prev ? String((prev._origType || prev.rep.ChangeType) || '') : '';
      var prevIsReq = prev && (prevType === 'Change Requested' || REQUEST_PARTS.indexOf(prevType) !== -1);
      var sameActor = prev && String(prev.rep.ChangedBy || '') === String(g.rep.ChangedBy || '');
      var closeInTime = prev && Math.abs(new Date(g.rep.ChangeDate) - new Date(prev.rep.ChangeDate)) < GROUP_WINDOW_MS;
      if (isPart && prevIsReq && sameActor && closeInTime) {
        if (!prev._origType) prev._origType = prevType;
        var carried = prev.rep.MergedNotes != null ? prev.rep.MergedNotes : noteFor(prev.rep);
        var hasServices = prev._hasServices || type !== 'Reschedule Requested';
        prev._hasServices = hasServices;
        if (type === 'Reschedule Requested' && !hasServices) {
          prev.rep = Object.assign({}, g.rep, { MergedNotes: carried });
        } else {
          prev.rep = Object.assign({}, prev.rep, { MergedNotes: carried,
            _label: (prev._origType === 'Service Change Requested') ? labelFor('Service Change Requested') : 'Change requested' });
        }
        prev.rows = prev.rows.concat(g.rows);
      } else {
        out.push(g);
      }
    });
    return out;
  }

  /* --- Pasada 4 (a peticion del dueño, 20/09/2026, con captura
     real): 'Expected Ready Date' y 'Materials Ready' son 2 llamadas
     SEPARADAS al backend (fecha y hora se escogen por separado en el
     picker del cliente -- ver save-expected-ready-date.js y
     set-materials-ready.js), pero para el cliente es UNA sola accion
     ("ya estoy listo, aqui esta cuando"). Se fusionan si son
     consecutivas, mismo actor, cerca en tiempo -- en CUALQUIER orden
     (el cliente puede elegir fecha o hora primero, no hay un orden
     fijo). A diferencia de mergeRescheduleRequest (que descarta la
     nota del evento que se fusiona), aqui las 2 notas se conservan
     juntas -- las 2 traen informacion real y distinta (la fecha Y la
     hora), perder cualquiera de las 2 dejaria al lector sin la mitad
     de lo que paso. Se usa 'Materials Ready' como representante (el
     hito mas definitivo), sin importar cual de las 2 llego primero. */
  function mergeMaterialsReadyWithDate(groups) {
    var out = [];
    groups.forEach(function (g) {
      var prev = out[out.length - 1];
      var type = String(g.rep.ChangeType || '');
      var prevType = prev && String(prev.rep.ChangeType || '');
      var isPair = (type === 'Materials Ready' && prevType === 'Expected Ready Date') ||
        (type === 'Expected Ready Date' && prevType === 'Materials Ready');
      var sameActor = prev && String(prev.rep.ChangedBy || '') === String(g.rep.ChangedBy || '');
      var closeInTime = prev && Math.abs(new Date(g.rep.ChangeDate) - new Date(prev.rep.ChangeDate)) < GROUP_WINDOW_MS;
      if (isPair && sameActor && closeInTime) {
        var earlier = new Date(prev.rep.ChangeDate) <= new Date(g.rep.ChangeDate) ? prev.rep : g.rep;
        var later = earlier === prev.rep ? g.rep : prev.rep;
        var combinedNotes = [noteFor(earlier), noteFor(later)].filter(Boolean).join(' ');
        /* El representante final SIEMPRE es el renglon 'Materials
           Ready' de los 2 (sin importar si quedo en prev o en g). */
        var rep = (prevType === 'Materials Ready') ? prev.rep : g.rep;
        prev.rep = Object.assign({}, rep, { MergedNotes: combinedNotes });
        prev.rows = prev.rows.concat(g.rows);
      } else {
        out.push(g);
      }
    });
    return out;
  }

  /* --- Reglas del cliente que dependen de lo que paso antes/despues
     (27/09/2026, dueño, punto por punto):
       1. Sugerencia del supervisor ('Supervisor Update'): oculta.
       2. La decision de la oficina sobre algo que el cliente no vio
          (sugerencia del supervisor, "no esta listo" de la cuadrilla,
          cambio interno): oculta. Si no, veia "Change approved" de
          algo que nunca le salio.
       3. 'Tech Marked Complete': oculta hasta que la oficina marca la
          orden Completed.
       4. 'Reopened by Tech': interno.
       5. 'Division Changed': interno.
       6. Mandar a Scheduling (Reschedule): solo si lo empezo el
          cliente porque algo no estaba listo (ocupado, apago el switch,
          contesto "No" al correo del dia antes).
     Se calcula sobre el historial COMPLETO (antes de filtrar), porque
     la regla 2 necesita ver la solicitud aunque el cliente no la vea. --- */
  var RESOLVE_TYPES = ['Change Reassigned', 'Change Rejected', 'Change Request Cancelled'];
  var CLIENT_NOT_READY = ['Occupied Unit Reported', 'Materials Ready Cancelled', 'Site Not Ready Reported'];
  function clientHiddenByContext(all) {
    var hidden = [], lastCompleted = -1;
    all.forEach(function (h, i) {
      if (String(h.ChangeType || '') === 'Completed' && String(h.FieldChanged || '') === 'Status') lastCompleted = i;
    });
    var pendingHidden = false, notReadyByClient = false;
    all.forEach(function (h, i) {
      var ct = String(h.ChangeType || ''), fc = String(h.FieldChanged || '');
      if (ct === 'Change Requested' || ct === 'Services Change Requested' || ct === 'Service Change Requested') {
        pendingHidden = fc === 'Supervisor Update' || isHiddenFromClient(h);
        if (fc === 'Supervisor Update') hidden.push(h);
      }
      if (ct === 'Tech Marked Complete' && lastCompleted < i) hidden.push(h);
      if (ct === 'Reopened by Tech' || ct === 'Division Changed') hidden.push(h);
      /* Reabierto: el "Service completed" de antes de ese servicio ya no
         vale; si no, el cliente lo veia completado dos veces. */
      if (ct === 'Reopened by Tech') {
        var ro = null; try { ro = JSON.parse(h.NewValue || 'null'); } catch (e) {}
        var names = ro ? (Array.isArray(ro.services) && ro.services.length ? ro.services : [ro.serviceName]) : [];
        names.forEach(function (n) {
          for (var j = i - 1; j >= 0; j--) {
            if (String(all[j].ChangeType || '') === 'Service Completed' && svcNameOf(all[j]) === String(n)) { hidden.push(all[j]); break; }
          }
        });
      }
      if (CLIENT_NOT_READY.indexOf(ct) !== -1) notReadyByClient = true;
      if (ct === 'Order Assigned' || ct === 'Materials Ready' || ct === 'Site Ready Confirmed') notReadyByClient = false;
      if (ct === 'Scheduling' || ct === 'Sent to Scheduling') {
        if (!notReadyByClient) hidden.push(h);
        pendingHidden = false;
      }
      if (RESOLVE_TYPES.indexOf(ct) !== -1) {
        if (pendingHidden) hidden.push(h);
        pendingHidden = false;
      }
    });
    return hidden;
  }

  /* 'Order Details Set' (Admin > Edit) junta varios campos en un solo
     texto "Campo: valor  ·  Campo: valor". Al cliente se le colaban
     las notas internas (Delay Reason, Delay Reason Notes, Scheduling,
     Supervisor...) porque el filtro por campo solo ve renglones
     sueltos. Al cliente solo le quedan estos; si no queda nada, el
     renglon no sale. */
  var CLIENT_DETAIL_FIELDS = ['Entry Date', 'Due Date', 'Service Window', 'Dispatch Date', 'Completed Date', 'Technician', 'Services'];
  function detailParts(notes) {
    return String(notes || '').split('  ·  ').map(function (seg) {
      var k = seg.indexOf(': ');
      return k === -1 ? { label: '', value: seg } : { label: seg.slice(0, k), value: seg.slice(k + 2) };
    });
  }
  function clientDetailsNote(notes) {
    return detailParts(notes).filter(function (p) { return CLIENT_DETAIL_FIELDS.indexOf(p.label) !== -1; })
      .map(function (p) { return p.label + ': ' + p.value; }).join('  ·  ');
  }
  /* Las fechas de solo dia llegan crudas ("2026-10-08"). */
  function prettyDetailsNote(notes) {
    return String(notes || '').replace(/(^|: )(\d{4}-\d{2}-\d{2})(?=$|\s)/g, function (m, pre, d) { return pre + fmtDate(d); });
  }

  /* 'Service Change Resolved' justo al lado de 'Service Added'/'Service
     Removed' del mismo servicio dice lo mismo dos veces: se queda el
     de Added/Removed. Los demas (cambio de nivel) dicen de que servicio. */
  function svcNameOf(h) { try { var v = JSON.parse(h.NewValue || 'null'); return v && v.serviceName ? String(v.serviceName) : ''; } catch (e) { return ''; } }
  function dropRedundantResolved(rows) {
    return rows.filter(function (h, i) {
      if (String(h.ChangeType || '') !== 'Service Change Resolved') return true;
      var name = svcNameOf(h);
      var near = [rows[i - 1], rows[i + 1]].filter(Boolean);
      return !near.some(function (r) {
        var t = String(r.ChangeType || '');
        return (t === 'Service Added' || t === 'Service Removed') && svcNameOf(r) === name && name;
      });
    });
  }

  function sameMoment(a, b) {
    return String(a.ChangedBy || '') === String(b.ChangedBy || '') &&
      Math.abs(new Date(a.ChangeDate) - new Date(b.ChangeDate)) < GROUP_WINDOW_MS;
  }

  /* Reschedule guardaba 2 renglones ('Scheduling' + la decision 'Sent
     to Scheduling'): uno solo. Se queda una nota escrita a mano, no la
     automatica "Sent back to Scheduling by X." */
  function mergeSchedulingPair(groups) {
    var out = [];
    groups.forEach(function (g) {
      var prev = out[out.length - 1];
      var t = String(g.rep.ChangeType || ''), pt = prev ? String(prev.rep.ChangeType || '') : '';
      var pair = (t === 'Sent to Scheduling' && pt === 'Scheduling') || (t === 'Scheduling' && pt === 'Sent to Scheduling');
      if (pair && sameMoment(prev.rep, g.rep)) {
        var decision = t === 'Sent to Scheduling' ? g.rep : prev.rep;
        var notes = [noteFor(prev.rep), noteFor(g.rep)].filter(function (n) { return n && !/^Sent back to Scheduling by .+\.$/.test(n); });
        prev.rep = Object.assign({}, decision, { MergedNotes: notes.filter(function (n, i) { return notes.indexOf(n) === i; }).join(' ') });
        prev.rows = prev.rows.concat(g.rows);
      } else {
        out.push(g);
      }
    });
    return out;
  }

  /* Completar guardaba hasta 3 renglones: 'Completed' (lista por
     servicio), 'Order Details Set' (Completed Date / Technician) y
     'Completed' (estatus). Uno solo: 'Completed' con la fecha, quien y
     la lista adentro. Si 'Order Details Set' trae otros campos, se
     queda aparte. */
  function completionOnly(h) {
    if (String(h.ChangeType || '') !== 'Order Details Set') return false;
    var parts = detailParts(h.Notes);
    return parts.length > 0 && parts.every(function (p) { return p.label === 'Completed Date' || p.label === 'Technician'; });
  }
  function mergeCompletion(groups) {
    var out = [];
    groups.forEach(function (g) {
      var isDone = String(g.rep.ChangeType || '') === 'Completed' && String(g.rep.FieldChanged || '') === 'Status';
      if (!isDone) { out.push(g); return; }
      var extra = [], rows = g.rows;
      for (var k = 0; k < 2; k++) {
        var prev = out[out.length - 1];
        if (!prev || !sameMoment(prev.rep, g.rep)) break;
        var pr = prev.rep;
        var recap = String(pr.ChangeType || '') === 'Completed' && String(pr.FieldChanged || '') === 'PerServiceRecap';
        if (completionOnly(pr)) {
          detailParts(pr.Notes).forEach(function (p) {
            if (!p.value || p.value === '(empty)') return;
            extra.unshift(p.label === 'Completed Date' ? '📅 Completed: ' + esc(p.value) : '👤 Technician: ' + esc(p.value));
          });
        } else if (!recap) break;
        rows = prev.rows.concat(rows);
        out.pop();
      }
      out.push({ rep: Object.assign({}, g.rep, { _extraLines: extra }), rows: rows });
    });
    return out;
  }

  /* --- API PUBLICA --- */
  function historyHtml(orderId, history, opts) {
    opts = opts || {};
    var mode = (opts.mode === 'client' || opts.mode === 'tech') ? opts.mode : 'staff';
    function actorLabel(by) {
      by = String(by || '');
      if (opts.clientId && opts.clientName && by === String(opts.clientId)) return String(opts.clientName);
      if (typeof opts.actorName === 'function') { var n = opts.actorName(by); if (n) return String(n); }
      return by;
    }
    var catalog = opts.timesCatalog || null;
    /* Tipos de evento que representan un RETROCESO real (algo que se
       deshizo) -- si se pasa, esos renglones del historial se marcan
       con un brillo distinto, para que salte a la vista que ahi paso
       algo que vale la pena abrir y leer (no un avance normal mas). */
    var regressionTypes = opts.regressionTypes || [];
    var idPrefix = 'goh-' + String(orderId || '').replace(/[^a-z0-9]/gi, '_') + '-' + mode;

    var ctxHidden = mode === 'client' ? clientHiddenByContext(history || []) : [];
    var rows = (history || []).filter(function (h) {
      if (ALWAYS_HIDDEN_TYPES.indexOf(String(h.ChangeType || '')) !== -1) return false;
      if (mode === 'client' && isHiddenFromClient(h)) return false;
      if (mode === 'client' && ctxHidden.indexOf(h) !== -1) return false;
      if (mode === 'tech' && isHiddenFromTech(h)) return false;
      return true;
    });
    if (mode === 'client') {
      rows = rows.map(function (h) {
        if (String(h.ChangeType || '') !== 'Order Details Set') return h;
        return Object.assign({}, h, { Notes: clientDetailsNote(h.Notes) });
      }).filter(function (h) { return String(h.ChangeType || '') !== 'Order Details Set' || h.Notes; });
    }
    rows = rows.map(function (h) {
      return String(h.ChangeType || '') === 'Order Details Set' ? Object.assign({}, h, { Notes: prettyDetailsNote(h.Notes) }) : h;
    });
    rows = dropRedundantResolved(rows);

    if (!rows.length) return '<p class="empty-note">No history.</p>';

    var groups = groupDatesConfirmed(mergeServiceScheduled(rows));
    groups = mergeDecisionWithDetail(groups);
    groups = mergeRescheduleRequest(groups);
    groups = mergeMaterialsReadyWithDate(groups);
    groups = mergeSchedulingPair(groups);
    groups = mergeCompletion(groups);

    return groups.map(function (g, idx) {
      var h = g.rep;
      var lines = (h._extraLines || []).concat(g.rows.reduce(function (acc, row) { return acc.concat(detailLinesFor(row, catalog, mode)); }, []));
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
      var isRegression = regressionTypes.indexOf(String(h.ChangeType || '')) !== -1;
      var noteTxt = h.MergedNotes || noteFor(h);
      /* Al cliente solo le sale ya completada: la frase de "la oficina
         todavia tiene que confirmar" ya no aplica. */
      if (mode === 'client' && String(h.ChangeType || '') === 'Tech Marked Complete') {
        noteTxt = String(noteTxt || '').replace(/\s*The office still needs to confirm and close the order\.?/, '');
      }
      /* Un segundo Update Services de campo arrastra las notas del
         primero (la oficina solo lee la solicitud mas reciente); aqui
         no se repiten las partes que ya salieron en la burbuja de
         justo antes. */
      var prevNote = idx > 0 ? (groups[idx - 1]._renderedNote || '') : '';
      g._renderedNote = noteTxt;
      if (noteTxt && prevNote) {
        var seen = {}; prevNote.split(' | ').forEach(function (x) { seen[x] = true; });
        noteTxt = noteTxt.split(' | ').filter(function (x) { return !seen[x]; }).join(' | ');
      }
      var detailId = idPrefix + '-' + idx;
      return '<div class="goh-item' + (hasDetail ? ' has-detail' : '') + (isRegression ? ' goh-regression' : '') + '"' +
        (hasDetail ? ' onclick="GSOrderHistory.toggleDetail(\'' + detailId + '\')"' : '') + '>' +
        '<div class="goh-head">' +
          '<div class="goh-head-main">' +
            '<span class="goh-date">' + esc(fmtDateTime(h.ChangeDate)) + '</span>' +
            '<span class="goh-rev">' + esc(orderId || '') + '</span> — ' +
            '<span class="goh-type">' + esc(h._label || labelFor(h.ChangeType)) + '</span>' +
            (h.ChangedBy ? '<span class="goh-by">by ' + esc(actorLabel(h.ChangedBy)) + '</span>' : '') +
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
      '.goh-item.goh-regression .goh-type{color:#B33A3A}' +
      '.goh-item.goh-regression.has-detail .goh-toggle{color:#B33A3A;font-weight:700;animation:goh-pulse 1.6s ease-in-out infinite}' +
      '@keyframes goh-pulse{0%,100%{opacity:1}50%{opacity:.4}}' +
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
    toggleDetail: toggleDetail,
    /* Publicos desde v1.33.0 -- antes eran privados de este modulo,
       cada portal que necesitaba leer un snapshot de servicios
       pendiente (OldValue/NewValue de un renglon Change Requested)
       tenia que reinventarlo. Mismo parser exacto que ya usa este
       archivo para su propio diff visual, nada nuevo. */
    parseServicesPayload: parseServicesPayload,
    servicesDiffKind: servicesDiffKind,
    /* Publico desde v1.36.0 -- mismas lineas de detalle (HTML ya
       armado y escapado) que este archivo ya calcula para su propia
       caja expandible de cada renglon (servicios agregados/quitados,
       cambio de nivel, cambio de tiempo estimado, etc.). El Order
       Tracker (order-tracker.js) lo necesita para mostrar el mismo
       detalle rico al hacer clic en un paso -- antes solo mostraba
       "fecha - quien", sin decir que paso de verdad. Un solo renglon
       de historial por llamada (h), igual que ya usa este archivo
       internamente -- el llamador decide como agrupar/deduplicar si
       hace falta, esta funcion no lo hace por su cuenta. */
    detailLines: detailLinesFor,
    /* 27/09/2026: el nombre de cada evento, el mismo que sale en el
       historial -- Admin lo usa para el "ultimo cambio" de la tarjeta. */
    label: labelFor
  };
})();
