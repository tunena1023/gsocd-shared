/* gsocd-shared lib/standard-times -- la UNICA fuente de los tiempos estandar de GS (CFO 16/11/2026): los minutos aprobados
   de cada servicio (catalogos 111 limpieza, 222 renovaciones, 333 exteriores), por opcion (tamaño A-E, nivel, capas, pieza).
   Los leen las cotizaciones de Marketing (Admin) y el menu de servicios del portal de clientes (Orders). Datos: lib/standard-times.json.
   Solo minutos, sin precios. Los minutos solo le llegan al cliente que tiene Show estimated time (lo decide get-services).
     entries()                 -> la lista [{ sku, name, unit, options: [{ key, label, minutes, per?, level? }], ... }]
     minutesFor(key)           -> minutos de UNA unidad de la opcion "SKU|opcion" del menu, o null si no tiene tiempo estandar
                                  (sin entrada, sin esa opcion, sin minutos, "noStandardTime" o cobrado por hora: nunca se inventa, nunca 0)
     forKeys(keys)             -> { times: { key: minutos }, missing: [key] }
   Dos reglas que Marketing ya usa (quote-paint bandMin, quote-paint SINGLE '222-97|A') y que el menu del portal tambien necesita,
   para que el portal y Marketing den los MISMOS minutos (CFO 16/11): (1) pintura / techos / zocalo arriba de 1,250 sq ft (opcion F,
   por 100 sq ft) = el tamaño E ÷ 12.5, igual que la limpieza de unidad; (2) gabinetes de cocina "A · Small / Mid / Big" = los minutos
   de la opcion A (Marketing usa los mismos para los 3 tamaños). Nada nuevo: solo las cuentas de Marketing. */
'use strict';
const DATA = require('./standard-times.json');
const LIST = Array.isArray(DATA) ? DATA : (DATA.entries || []);
const BY_SKU = {};
LIST.forEach(e => { if (e && e.sku) BY_SKU[String(e.sku)] = e; });

const entries = () => LIST;
const isHourly = (e, o) => /^\s*(per hour|hours? per)/i.test(String((o && o.per) || (e && e.unit) || ''));

const OVER_E = /^(222|210)-(10|13|19|49|90)$/;
const CAB_SIZES = /^(222|210)-(97|28)\|A · (Small|Mid|Big)$/;
const own = (e, k) => { const o = (e.options || []).find(x => String(x.key) === k); return o && !isHourly(e, o) && Number(o.minutes) > 0 ? Number(o.minutes) : null; };

function minutesFor(key) {
  const s = String(key || ''), i = s.indexOf('|');
  if (i < 0) return null;
  const sku = s.slice(0, i), opt = s.slice(i + 1);
  const e = BY_SKU[sku];
  if (!e || e.noStandardTime || !Array.isArray(e.options)) return null;
  const o = e.options.find(x => String(x.key) === opt);
  if (!o && CAB_SIZES.test(s)) return own(e, 'A');
  if (!o && OVER_E.test(sku) && /^F(?: · .+)?$/.test(opt)) {
    const m = own(e, opt.replace(/^F/, 'E'));
    return m == null ? null : Math.round(m / 12.5 * 10) / 10;
  }
  if (!o || isHourly(e, o)) return null;
  const m = Number(o.minutes);
  return isFinite(m) && m > 0 ? m : null;
}

function forKeys(keys) {
  const times = {}, missing = [];
  (keys || []).forEach(k => { const m = minutesFor(k); if (m == null) missing.push(k); else times[k] = m; });
  return { times, missing };
}

module.exports = { entries, minutesFor, forKeys };
