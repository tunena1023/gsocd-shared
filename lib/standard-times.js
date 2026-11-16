/* gsocd-shared lib/standard-times -- la UNICA fuente de los tiempos estandar de GS (CFO 16/11/2026): los minutos aprobados
   de cada servicio (catalogos 111 limpieza, 222 renovaciones, 333 exteriores), por opcion (tamaño A-E, nivel, capas, pieza).
   Los leen las cotizaciones de Marketing (Admin) y el menu de servicios del portal de clientes (Orders). Datos: lib/standard-times.json.
   Solo minutos, sin precios. Los minutos solo le llegan al cliente que tiene Show estimated time (lo decide get-services).
     entries()                 -> la lista [{ sku, name, unit, options: [{ key, label, minutes, per?, level? }], ... }]
     minutesFor(key)           -> minutos de UNA unidad de la opcion "SKU|opcion" del menu, o null si no tiene tiempo estandar
                                  (sin entrada, sin esa opcion, sin minutos, "noStandardTime" o cobrado por hora: nunca se inventa, nunca 0)
     forKeys(keys)             -> { times: { key: minutos }, missing: [key] } */
'use strict';
const DATA = require('./standard-times.json');
const LIST = Array.isArray(DATA) ? DATA : (DATA.entries || []);
const BY_SKU = {};
LIST.forEach(e => { if (e && e.sku) BY_SKU[String(e.sku)] = e; });

const entries = () => LIST;
const isHourly = (e, o) => /^\s*(per hour|hours? per)/i.test(String((o && o.per) || (e && e.unit) || ''));

function minutesFor(key) {
  const s = String(key || ''), i = s.indexOf('|');
  if (i < 0) return null;
  const e = BY_SKU[s.slice(0, i)];
  if (!e || e.noStandardTime || !Array.isArray(e.options)) return null;
  const o = e.options.find(x => String(x.key) === s.slice(i + 1));
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
