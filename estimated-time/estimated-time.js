/* ============================================================
   gsocd-shared / estimated-time
   Calculo del tiempo estimado de una orden segun sus servicios --
   misma logica exacta que ya usa admin.html (Janitorial usa level1/
   level2/level3 segun el Level del servicio, todo lo demas usa
   level1 nomas). Se saca a pieza compartida para que Orders la use
   sin reescribirla por su cuenta.

   Uso:
     const catalog = { '111-14': { division:'Janitorial', level1:30, level2:45, level3:70 }, ... };
     const services = [ { ServiceName:'...', SubOption:'111-14', Level:'Level 2' }, ... ];

     GSEstimatedTime.calcTotal(services, catalog)
       -> { totalMinutes: 45 } o null si ningun servicio tiene tiempo conocido

     GSEstimatedTime.svcMinutes(sku, level, catalog) -> numero o null

     GSEstimatedTime.fmtDuration(90) -> "1h 30min"

     GSEstimatedTime.boxHtml(services, catalog) -> HTML del recuadro
       grande ("Estimated time"), o '' si no hay nada que calcular.
       Mismo estilo visual que admin.html (clase .gs-est-time-box).
============================================================ */
(function () {
  'use strict';

  var STYLE_ID = 'gs-est-time-style';

  function styleTag() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.gs-est-time-box{margin-top:14px;padding:12px 16px;border-radius:4px;' +
        'background:#FDF3E0;border-left:4px solid #8C6F2A;' +
        'display:flex;align-items:center;justify-content:space-between}' +
      '.gs-est-time-box-label{font-size:12px;font-weight:700;letter-spacing:.04em;' +
        'text-transform:uppercase;color:#8C6F2A}' +
      '.gs-est-time-box-value{font-size:22px;font-weight:700;color:#8C6F2A}' +
      '.gs-est-time-inline{color:#8C6F2A;font-weight:600;white-space:nowrap}';
    var tag = document.createElement('style');
    tag.id = STYLE_ID;
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function catalogGet(catalog, sku) {
    if (!catalog) return null;
    return catalog.get ? catalog.get(String(sku || '').trim()) : catalog[String(sku || '').trim()];
  }

  /* Tiempo de UN solo servicio -- '' si no se conoce todavia. */
  function svcMinutes(sku, level, catalog) {
    var svc = catalogGet(catalog, sku);
    if (!svc) return null;
    var minutes;
    if (svc.division === 'Janitorial' && level === 'Level 2') minutes = svc.level2;
    else if (svc.division === 'Janitorial' && level === 'Level 3') minutes = svc.level3;
    else minutes = svc.level1; // Level 1, o no-Janitorial (siempre level1)
    return minutes == null ? null : minutes;
  }

  function calcTotal(services, catalog) {
    var total = 0, anyKnown = false;
    (services || []).forEach(function (s) {
      var minutes = svcMinutes(s.SubOption, s.Level, catalog);
      if (minutes == null) return;
      anyKnown = true;
      total += minutes;
    });
    return anyKnown ? { totalMinutes: total } : null;
  }

  function fmtDuration(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + 'h ' + m + 'min';
    if (h) return h + 'h';
    return m + 'min';
  }

  function boxHtml(services, catalog) {
    styleTag();
    var result = calcTotal(services, catalog);
    if (!result) return '';
    return '<div class="gs-est-time-box">' +
      '<span class="gs-est-time-box-label">Estimated time</span>' +
      '<span class="gs-est-time-box-value">' + esc(fmtDuration(result.totalMinutes)) + '</span>' +
    '</div>';
  }

  window.GSEstimatedTime = {
    svcMinutes: svcMinutes,
    calcTotal: calcTotal,
    fmtDuration: fmtDuration,
    boxHtml: boxHtml
  };
})();
