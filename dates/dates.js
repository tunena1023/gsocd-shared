(function (root) {
  'use strict';
  /* ================================================================
     GSDates -- fechas en el navegador, en DIA DE IOWA (America/Chicago).
     Antes cada portal tenia su fmtDate con new Date(iso): una fecha sola
     ('2026-10-01', o la misma a medianoche UTC) salia un dia antes en
     Chicago ("Sep 30"), y el due date (23:59:59 de aqui = dia siguiente en
     UTC) salia un dia despues si se cortaba con slice(0,10).

       GSDates.day(v)            -> 'YYYY-MM-DD' (para <input type="date">):
                                    'YYYY-MM-DD', medianoche UTC y una hora sin
                                    zona se quedan con su dia escrito; una hora
                                    con zona, su dia en Iowa. '' si no hay fecha.
       GSDates.today()           -> 'YYYY-MM-DD' de hoy en Iowa
       GSDates.fmtDate(v, opts)  -> 'Oct 1, 2026'
            opts.year (true)     -> false: 'Oct 1'
            opts.weekday (false) -> true: 'Thu, Oct 1, 2026'
            opts.empty ('—')     -> lo que sale sin fecha
       GSDates.fmtDateTime(v, opts) -> 'Oct 1, 3:00 PM' (hora de Iowa);
                                    una fecha sola sale sin hora ('Oct 1').
            opts.empty ('—')
       GSDates.TZ                -> 'America/Chicago'
     Prueba: node dates/dates.test.js
  ================================================================ */
  var TZ = 'America/Chicago';
  var dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

  function day(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : dayFmt.format(v);
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var head = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
    if (head && (s.length === 10 || /T00:00(:00(\.0+)?)?Z$/.test(s) || !/(Z|[+-]\d{2}:?\d{2})$/.test(s))) return head;
    var d = new Date(s);
    if (isNaN(d.getTime())) return head;
    return dayFmt.format(d);
  }

  function today() { return dayFmt.format(new Date()); }

  function opt(o, k, def) { return o && o[k] !== undefined ? o[k] : def; }

  function fmtDate(v, o) {
    var empty = opt(o, 'empty', '—');
    var d = day(v);
    if (!d) return v ? String(v) : empty;
    var f = { timeZone: 'UTC', month: 'short', day: 'numeric' };
    if (opt(o, 'year', true)) f.year = 'numeric';
    if (opt(o, 'weekday', false)) f.weekday = 'short';
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', f);
  }

  function fmtDateTime(v, o) {
    var empty = opt(o, 'empty', '—');
    var s = v instanceof Date ? v.toISOString() : String(v == null ? '' : v).trim();
    if (!s) return empty;
    /* Fecha sola o sin zona: no hay hora real que convertir. */
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s, { year: false, empty: empty });
    var d = new Date(s);
    if (isNaN(d.getTime())) return empty;
    return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  }

  var api = { TZ: TZ, day: day, today: today, fmtDate: fmtDate, fmtDateTime: fmtDateTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && !root.GSDates) root.GSDates = api;
})(typeof window !== 'undefined' ? window : this);
