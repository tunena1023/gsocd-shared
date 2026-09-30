/* ============================================================
   lib/schedule-entries.js -- lo que esta programado, dia por dia
   (28/09/2026, dueño: "todo lo que esta programado debe verse en el
   calendario con todos sus detalles... servicios, horarios, osea todo.
   Mas adelante se supone que vamos a mandar esto al calendario de
   Outlook").

   UNA sola pieza: el Calendario de Admin la pinta y la sincronizacion
   con Outlook la usa tal cual, asi los dos dicen exactamente lo mismo.
   Funcion pura (sin SharePoint): quien la llama le pasa las listas ya
   leidas.

   build({ from, to, orders, serviceAssignments, contracts, clientsById,
           timesBySku, recurringDates, tz })
     from / to            'YYYY-MM-DD' (incluidos)
     orders               renglones de Orders (fields) con Services /
                          ServicesDetailed ({Category, ServiceName,
                          SubOption, Level, Quantity, NotCompleted})
     serviceAssignments   renglones de ServiceAssignments (fields)
     contracts            contratos recurrentes activos: { id, clientId,
                          buildingNumber, division, services[], daysOfWeek,
                          time, totalHours, expirationDate, frequency,
                          anchorDate, people[] }
     clientsById          { ClientID: { name, address } }
     timesBySku           { SKU: {Level1Minutes, Level2Minutes, Level3Minutes} }
     recurringDates       fn(contract, from, to) -> ['YYYY-MM-DD'] (el motor
                          de recurrentes de Admin)
     crewDays             { OrderID: { 'YYYY-MM-DD': ['Nombre', ...] } } -- quien
                          va cada dia en una orden de toda-la-orden (lista
                          Scheduling). Un proyecto de varios dias (30/09/2026,
                          dueño: "en el calendario se deberia ver que van a
                          estar ocupados") sale en CADA dia desde DispatchDate,
                          con la gente y las horas de ese dia.
     tz                   default 'America/Chicago'

   Cada entrada:
     { key, kind: 'order' | 'service' | 'recurring' | 'inspection',
       date, start, end ('HH:MM' 24 h o ''), window (texto), orderId,
       contractId, client, clientId, building, unit, address, division,
       people[], services[{category, name, level, qty}], minutes,
       minutesMissing, status, planned, dayIndex?, dayCount? }
     dayIndex / dayCount solo en un proyecto de varios dias ("Day 2 of 4").
   key es estable (sirve para ligar el evento de Outlook):
     order:<OrderID> (dia 1)  order:<OrderID>:<fecha> (dia 2 en adelante)
     service:<OrderID>:<persona(s)>:<fecha>
     inspection:<OrderID>  recurring:<contrato>:<fecha> (solo proyectadas)
============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GSScheduleEntries = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TZ = 'America/Chicago';
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /* Lo que ya no se programa: fuera del calendario. */
  var SKIP = ['Cancelled', 'Incomplete', 'Draft', 'Rejected'];

  function truthy(v) { return v === true || v === 'true' || v === 'Yes'; }
  function namesOf(v) { return String(v || '').split(',').map(function (n) { return n.trim(); }).filter(Boolean); }

  /* Dia (YYYY-MM-DD) en la zona del negocio. Una fecha pelona se respeta. */
  function dayOf(v, tz) {
    var s = String(v || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: tz || TZ });
  }

  /* "8:00 AM" / "14:30" / "9" -> "08:00". '' si no se entiende. */
  function to24(t) {
    var m = String(t || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
    if (!m) return '';
    var h = Number(m[1]), mi = Number(m[2] || 0);
    if (m[3]) { var pm = /p/i.test(m[3]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    if (h > 23 || mi > 59) return '';
    return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }
  /* "8:00 AM - 11:00 AM" -> { start: '08:00', end: '11:00' } */
  function windowTimes(w) {
    var parts = String(w || '').split(/\s*[-–—]\s*/);
    if (parts.length !== 2) return { start: to24(w), end: '' };
    return { start: to24(parts[0]), end: to24(parts[1]) };
  }
  function addMinutes(hhmm, minutes) {
    if (!hhmm || !minutes) return '';
    var p = hhmm.split(':'), t = Number(p[0]) * 60 + Number(p[1]) + Math.round(minutes);
    if (t >= 24 * 60) t = 24 * 60 - 1;
    var h = Math.floor(t / 60), m = t % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function fmt12(hhmm) {
    if (!hhmm) return '';
    var p = hhmm.split(':'), h = Number(p[0]);
    return (h % 12 || 12) + ':' + p[1] + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  function svcOf(s) {
    return {
      category: s.Category || s.category || '',
      name: s.ServiceName || s.serviceName || s.service || '',
      sku: s.SubOption || s.subOption || s.sku || '',
      level: s.Level || s.level || '',
      qty: s.Quantity != null && s.Quantity !== '' ? s.Quantity : (s.qty != null ? s.qty : '')
    };
  }
  function liveServices(list) {
    return (list || []).filter(function (s) { return !truthy(s.NotCompleted); }).map(svcOf).filter(function (s) { return s.name; });
  }
  function estimate(services, timesBySku) {
    var minutes = 0, missing = 0;
    (services || []).forEach(function (s) {
      var t = timesBySku && timesBySku[String(s.sku || '').trim()];
      if (!t) { missing++; return; }
      var lv = String(s.level || '');
      var m = t.Level1Minutes;
      if (lv === 'Level 2' && t.Level2Minutes != null) m = t.Level2Minutes;
      if (lv === 'Level 3' && t.Level3Minutes != null) m = t.Level3Minutes;
      if (m == null) { missing++; return; }
      var q = Number(s.qty);
      minutes += (Number(m) || 0) * (q > 1 ? q : 1);
    });
    return { minutes: minutes, missing: missing };
  }
  function addressOf(f, client) {
    var a = [f.Address, f.Suite, f.City, f.Zip].filter(Boolean).join(', ');
    return a || (client && client.address) || '';
  }
  /* Lo que ve la oficina (mismas palabras que Active). */
  function statusLabel(f, day, today) {
    var s = String(f.Status || '');
    if (s === 'Completed') return 'Completed';
    if (s === 'Received') return 'Not sent to tech';
    if (s === 'Change Requested') return 'Change requested';
    if (s === 'Cancellation Requested') return 'Cancellation requested';
    if (s === 'Inspection') return 'Inspection';
    if (f.TechMarkedComplete === true || f.TechMarkedComplete === 'true') return 'Marked done';
    if (day && today && day <= today) return 'Working';
    return 'Scheduled';
  }

  function base(f, clientsById, tz) {
    var client = (clientsById || {})[f.ClientID] || {};
    return {
      orderId: f.OrderID || f.Title || '',
      contractId: f.RecurringServiceID ? String(f.RecurringServiceID) : '',
      client: f.BusinessName || client.name || f.ClientID || '',
      clientId: f.ClientID || '',
      building: f.BuildingNumber || '',
      unit: f.UnitNumber || '',
      address: addressOf(f, client),
      division: f.Division || '',
      notes: f.Notes || ''
    };
  }

  function nextDay(d) { return new Date(Date.parse(d + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10); }

  /* Minutos de cada dia de un proyecto: cada persona hace su parte (total /
     cuadrilla) en dias de 8 h, igual que los bloques sugeridos. Si los dias
     no alcanzan o sobran, se reparte parejo. -> [{ each, total }] */
  function projectMinutes(total, crewSizes) {
    var n = crewSizes.length, size = Math.max.apply(null, crewSizes.concat([1]));
    var each = Math.ceil((Number(total) || 0) / size), DAY = 480;
    var even = each > n * DAY || (n > 1 && each <= (n - 1) * DAY);
    return crewSizes.map(function (c, i) {
      var m = even ? Math.round(each / n) : Math.max(0, Math.min(DAY, each - i * DAY));
      return { each: m, total: m * (c || 1) };
    });
  }

  function build(opts) {
    opts = opts || {};
    var tz = opts.tz || TZ;
    var from = opts.from, to = opts.to;
    var today = opts.today || dayOf(new Date().toISOString(), tz);
    var inRange = function (d) { return !!d && (!from || d >= from) && (!to || d <= to); };
    var out = [];

    var saByOrder = {};
    (opts.serviceAssignments || []).forEach(function (a) {
      if (!a || !a.OrderID || !String(a.AssignedTo || '').trim()) return;
      (saByOrder[a.OrderID] = saByOrder[a.OrderID] || []).push(a);
    });
    /* Visitas recurrentes ya generadas (REC-...): contrato|fecha, para no
       proyectar otra encima (ni una cancelada). */
    var recTaken = {};

    (opts.orders || []).forEach(function (f) {
      if (!f) return;
      var st = String(f.Status || '');
      var oid = f.OrderID || f.Title || '';
      var disp = dayOf(f.DispatchDate, tz);
      if (f.RecurringServiceID && disp) recTaken[String(f.RecurringServiceID) + '|' + disp] = true;
      if (truthy(f.Archived) || SKIP.indexOf(st) !== -1) return;
      var b = base(f, opts.clientsById, tz);
      var services = liveServices(f.ServicesDetailed && f.ServicesDetailed.length ? f.ServicesDetailed : f.Services);
      var byService = truthy(f.AssignByService);
      var covered = {};

      /* Por servicio (y lo que se asigno aparte en una de toda-la-orden):
         una entrada por persona(s) y dia. */
      var groups = {};
      (saByOrder[oid] || []).forEach(function (a) {
        var d = dayOf(a.ScheduledDate, tz);
        if (!d) return;
        var who = namesOf(a.AssignedTo).join(', ');
        var k = who + '|' + d;
        (groups[k] = groups[k] || []).push(a);
        covered[(a.Category || '') + '|' + (a.ServiceName || '')] = true;
      });
      Object.keys(groups).forEach(function (k) {
        var d = k.split('|')[1];
        if (!inRange(d)) return;
        var rows = groups[k];
        var svcs = rows.map(function (a) {
          var s = services.filter(function (x) { return x.category === (a.Category || '') && x.name === (a.ServiceName || ''); })[0];
          return s || svcOf(a);
        });
        var est = estimate(svcs, opts.timesBySku);
        var done = rows.every(function (a) { return a.WorkStatus === 'Completed'; });
        var w = byService ? '' : (f.ServiceWindow || '');
        var t = windowTimes(w);
        out.push(Object.assign({}, b, {
          key: 'service:' + oid + ':' + k.split('|')[0] + ':' + d, kind: f.RecurringServiceID ? 'recurring' : 'service',
          date: d, window: w, start: t.start, end: t.end || addMinutes(t.start, est.minutes),
          people: namesOf(k.split('|')[0]), services: svcs, minutes: est.minutes, minutesMissing: est.missing,
          status: done ? 'Completed' : statusLabel(f, d, today), planned: false
        }));
      });

      /* Toda la orden: la cuadrilla, su dia y su ventana. Un proyecto de
         varios dias (lista Scheduling: una fila por persona y dia) sale en
         cada uno de sus dias, desde DispatchDate. */
      if (!byService && disp && (String(f.Supervisor || '').trim() || f.RecurringServiceID)) {
        var rest = services.filter(function (s) { return !covered[s.category + '|' + s.name]; });
        if (rest.length || !services.length) {
          var est2 = estimate(rest, opts.timesBySku);
          var t2 = windowTimes(f.ServiceWindow);
          var cd = (opts.crewDays || {})[oid] || {};
          var days = Object.keys(cd).map(function (d) { return dayOf(d, tz); }).filter(function (d) { return d && d > disp; });
          days = days.filter(function (d, i) { return days.indexOf(d) === i; }).sort();
          /* Solo dias seguidos desde el inicio (asi los arma el bloque); una
             fila vieja de otra fecha no hace un "dia 2" que no existe. */
          var run = [disp];
          days.forEach(function (d) { if (d === nextDay(run[run.length - 1])) run.push(d); });
          days = run;
          var crewOn = function (d) {
            var k = Object.keys(cd).filter(function (x) { return dayOf(x, tz) === d; })[0];
            var names = k ? (cd[k] || []).filter(Boolean) : [];
            return names.length ? names : namesOf(f.Supervisor);
          };
          var perDay = projectMinutes(est2.minutes, days.map(function (d) { return crewOn(d).length || 1; }));
          days.forEach(function (d, i) {
            if (!inRange(d)) return;
            var crew = crewOn(d);
            var e = Object.assign({}, b, {
              key: i ? 'order:' + oid + ':' + d : 'order:' + oid, kind: f.RecurringServiceID ? 'recurring' : 'order',
              date: d, window: f.ServiceWindow || '', start: t2.start,
              end: t2.end || addMinutes(t2.start, days.length > 1 ? perDay[i].each : est2.minutes),
              people: crew, services: rest, minutes: days.length > 1 ? perDay[i].total : est2.minutes, minutesMissing: est2.missing,
              status: statusLabel(f, d, today), planned: false
            });
            if (days.length > 1) { e.dayIndex = i + 1; e.dayCount = days.length; }
            out.push(e);
          });
        }
      }

      /* Inspeccion programada. */
      var insp = dayOf(f.InspectionDate, tz);
      if ((st === 'Inspection') && insp && inRange(insp)) {
        var t3 = windowTimes(f.InspectionWindow);
        out.push(Object.assign({}, b, {
          key: 'inspection:' + oid, kind: 'inspection',
          date: insp, window: f.InspectionWindow || '', start: t3.start, end: t3.end,
          people: namesOf(f.InspectionBy), services: services, minutes: 0, minutesMissing: 0,
          status: 'Inspection', planned: false
        }));
      }
    });

    /* Contratos recurrentes: lo que todavia no se genera como orden (de hoy
       en adelante), hasta su fecha de fin. */
    if (typeof opts.recurringDates === 'function') {
      (opts.contracts || []).forEach(function (c) {
        if (!c || c.active === false) return;
        var exp = dayOf(c.expirationDate, tz);
        var dates = [];
        try { dates = opts.recurringDates(c, from, to) || []; } catch (e) { dates = []; }
        var client = (opts.clientsById || {})[c.clientId] || {};
        var svcs = liveServices(c.services);
        var est = estimate(svcs, opts.timesBySku);
        var visits = namesOf(c.daysOfWeek).length || 1;
        var minutes = est.minutes || (Number(c.totalHours) ? Math.round(Number(c.totalHours) / visits * 60) : 0);
        var start = to24(c.time);
        dates.forEach(function (d) {
          /* Solo de hoy en adelante: lo pasado ya tiene (o no tuvo) su orden REC. */
          if (!inRange(d) || d < today || (exp && d > exp) || recTaken[String(c.id) + '|' + d]) return;
          out.push({
            key: 'recurring:' + c.id + ':' + d, kind: 'recurring', planned: true,
            orderId: '', contractId: String(c.id), client: client.name || c.clientId || '', clientId: c.clientId || '',
            building: c.buildingNumber || '', unit: '', address: client.address || '', division: c.division || 'Janitorial', notes: '',
            date: d, window: start ? fmt12(start) : '', start: start, end: addMinutes(start, minutes),
            people: (c.people || []).slice(), services: svcs, minutes: minutes, minutesMissing: est.missing,
            status: 'Planned'
          });
        });
      });
    }

    out.sort(function (a, b) {
      return a.date.localeCompare(b.date) || String(a.start || '99').localeCompare(String(b.start || '99')) || a.client.localeCompare(b.client);
    });
    return out;
  }

  /* estimate / liveServices tambien los usan los bloques sugeridos de Admin
     (lib/suggest-blocks, 29/09/2026): mismos minutos que el Calendario. */
  return { build: build, dayOf: dayOf, windowTimes: windowTimes, to24: to24, fmt12: fmt12, addMinutes: addMinutes, DAYS: DAYS,
    estimate: estimate, liveServices: liveServices, projectMinutes: projectMinutes };
}));
