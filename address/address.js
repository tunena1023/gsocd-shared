(function (root) {
  'use strict';
  /* ================================================================
     GSAddress -- la direccion de una orden o un edificio como una
     direccion normal, en dos renglones (CFO 12/11/2026, Changelog #19):
         2618 28th Ave SW
         Altoona, IA 50009
     y, en celular, la direccion misma es la liga a la app de mapas.

       GSAddress.lines(o)        -> ['calle, suite', 'Ciudad, IA ZIP'] (solo lo que haya; [] sin nada)
       GSAddress.text(o)         -> los dos renglones en uno ("calle, Ciudad, IA ZIP")
       GSAddress.platform()      -> 'ios' | 'android' | '' (compu u otro)
       GSAddress.mapHref(o, p)   -> iPhone/iPad Apple Maps, Android geo:, compu '' (sin liga)
       GSAddress.fallbackHref(o) -> Google Maps (si en Android nada abrio geo:)
       GSAddress.html(o, opts)   -> los renglones en HTML; opts.link: liga solo en celular;
                                    opts.cls: clase del bloque
       GSAddress.open(ev, a)     -> onclick de la liga (no abre la tarjeta; Android con respaldo)

     o: fields de Orders, Clients o ClientAddresses (Address, Suite, City,
     Zip, State) o lo mismo en minusculas. Sin State va IA (todo es de
     Iowa). Si City trae "IA" (dato chueco) no se repite.
     Prueba: node address/address.test.js
  ================================================================ */
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return MAP[c]; }); }
  function s(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function pick(o, k) { return s(o[k] != null && o[k] !== '' ? o[k] : o[k.toLowerCase()]); }

  function lines(o) {
    o = o || {};
    var st = pick(o, 'State') || 'IA';
    var city = pick(o, 'City'), zip = pick(o, 'Zip');
    if (city.toUpperCase() === st.toUpperCase()) city = '';
    var one = [pick(o, 'Address'), pick(o, 'Suite')].filter(Boolean).join(', ');
    var tail = (city || zip) ? [city, [st, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
    return [one, tail].filter(Boolean);
  }
  function text(o) { return lines(o).join(', '); }

  function platform(nav) {
    var n = nav || (typeof navigator !== 'undefined' ? navigator : {});
    var ua = String(n.userAgent || '');
    if (/iPhone|iPad|iPod/.test(ua) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return '';
  }
  function mapHref(o, p) {
    var q = encodeURIComponent(text(o));
    if (!q) return '';
    if (p === undefined) p = platform();
    if (p === 'ios') return 'https://maps.apple.com/?q=' + q;
    if (p === 'android') return 'geo:0,0?q=' + q;
    return '';
  }
  function fallbackHref(o) { var q = encodeURIComponent(text(o)); return q ? 'https://www.google.com/maps/search/?api=1&query=' + q : ''; }

  var STYLE_ID = 'gs-address-style';
  function style() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var t = document.createElement('style');
    t.id = STYLE_ID;
    t.textContent = '.gs-address{overflow-wrap:anywhere}' +
      'a.gs-address-link{color:inherit;text-decoration:underline;text-decoration-color:#C9A84C;text-decoration-thickness:1px;text-underline-offset:3px;-webkit-tap-highlight-color:rgba(201,168,76,.18)}';
    (document.head || document.documentElement).appendChild(t);
  }

  function html(o, opts) {
    opts = opts || {};
    var l = lines(o);
    if (!l.length) return '';
    style();
    var inner = l.map(esc).join('<br>');
    var cls = 'gs-address' + (opts.cls ? ' ' + opts.cls : '');
    var p = opts.platform !== undefined ? opts.platform : platform();
    var href = opts.link ? mapHref(o, p) : '';
    if (!href) return '<span class="' + esc(cls) + '">' + inner + '</span>';
    return '<a class="' + esc(cls) + ' gs-address-link" href="' + esc(href) + '" data-fallback="' + esc(fallbackHref(o)) + '"' +
      (p === 'ios' ? ' target="_blank" rel="noopener"' : '') + ' onclick="return GSAddress.open(event, this)">' + inner + '</a>';
  }

  /* Android: geo: abre la app de mapas o deja escoger. Si en 1.5 s la
     pagina sigue a la vista (nada lo abrio), Google Maps en otra ventana:
     la app de Tech se queda donde estaba. iPhone: la liga normal (otra ventana). */
  var WAIT_MS = 1500;
  function open(ev, a) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    var href = a && a.getAttribute('href') || '';
    if (!/^geo:/.test(href)) return true;
    if (ev && ev.preventDefault) ev.preventDefault();
    /* Doble toque: una sola vez. */
    if (a.__gsAddrBusy) return false;
    a.__gsAddrBusy = true;
    var gone = false;
    var mark = function () { if (document.hidden) gone = true; };
    document.addEventListener('visibilitychange', mark);
    try { window.location.href = href; } catch (e) { /* sin app: cae al respaldo */ }
    setTimeout(function () {
      document.removeEventListener('visibilitychange', mark);
      a.__gsAddrBusy = false;
      var fb = a.getAttribute('data-fallback');
      if (!gone && !document.hidden && fb) window.open(fb, '_blank', 'noopener');
    }, WAIT_MS);
    return false;
  }

  var api = { lines: lines, text: text, platform: platform, mapHref: mapHref, fallbackHref: fallbackHref, html: html, open: open, WAIT_MS: WAIT_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && !root.GSAddress) root.GSAddress = api;
})(typeof window !== 'undefined' ? window : this);
