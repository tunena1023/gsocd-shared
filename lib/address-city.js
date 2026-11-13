/* ============================================================
   lib/address-city.js -- la ciudad de una direccion (CFO 12/11/2026).

   Address check (Admin) partia "7109 SE 5th St Des Moines, IA 50315" como
   calle "7109 SE 5th St Des Moines" y ciudad "IA": sin coma entre la calle y
   la ciudad, tomaba el estado como ciudad. Aqui:

     splitInline(text)  "calle ciudad, IA 50315" (con o sin comas) ->
                        { address, city, zip } o null si no trae ciudad/estado/zip.
                        Sin coma, la ciudad sale de la lista de ciudades de Iowa del
                        area (cityAtEnd). Nunca regresa "IA"/"Iowa" ni un zip como ciudad.
     cityAtEnd(street)  "7109 SE 5th St Des Moines" -> { address: '7109 SE 5th St', city: 'Des Moines' }
                        o null (la calle tiene que empezar con numero y seguir teniendo calle).
     canonicalCity(c)   "wes des moines" -> "West Des Moines"; una que no conoce, igual (limpia).
     isState(v)         "IA", "Iowa", "I.A.", "NE"... -> true
     cityProblem(city)  '' o el mensaje (en ingles) si City es solo un estado o un numero.

   Los 3 portales guardan direcciones (Admin: clientes y edificios; Orders: edificios
   del cliente). Prueba: node lib/address-city.test.js
============================================================ */
'use strict';

const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

/* Ciudades del area donde trabaja GS (y las de los clientes de hoy). */
const IOWA_CITIES = [
  'Des Moines', 'West Des Moines', 'Ankeny', 'Waukee', 'Clive', 'Urbandale', 'Johnston', 'Altoona', 'Grimes',
  'Norwalk', 'Ames', 'Indianola', 'Pleasant Hill', 'Newton', 'Madrid', 'Windsor Heights', 'Bondurant', 'Carlisle',
  'Polk City', 'Adel', 'Van Meter', 'Dallas Center', 'Granger', 'Mitchellville', 'Runnells', 'Cumming', 'Martensdale',
  'Saylorville', 'Berwick', 'Pella', 'Knoxville', 'Marshalltown', 'Boone', 'Huxley', 'Slater', 'Story City', 'Colo',
  'Nevada', 'Grinnell', 'Ottumwa', 'Winterset', 'Perry', 'Prairie City', 'Monroe', 'Osceola', 'Chariton', 'Elkhart',
  'Kellogg', 'Baxter', 'Colfax', 'Earlham', 'De Soto', 'Booneville', 'Norwoodville'
];
/* Errores comunes -> la ciudad buena. */
const ALIASES = {
  'wes des moines': 'West Des Moines', 'w des moines': 'West Des Moines', 'w. des moines': 'West Des Moines',
  'westdesmoines': 'West Des Moines', 'west desmoines': 'West Des Moines', 'wdm': 'West Des Moines',
  'desmoines': 'Des Moines', 'des moine': 'Des Moines', 'des moins': 'Des Moines', 'dsm': 'Des Moines',
  'ankney': 'Ankeny', 'urbandal': 'Urbandale', 'altona': 'Altoona', 'pleasanthill': 'Pleasant Hill',
  'windsor hts': 'Windsor Heights'
};
const STATES = ('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI ' +
  'SC SD TN TX UT VT VA WA WV WI WY DC').split(' ');
const STATE_NAMES = ['iowa', 'nebraska', 'illinois', 'missouri', 'minnesota', 'wisconsin', 'south dakota', 'kansas'];

const low = s => clean(s).toLowerCase();
const KNOWN = {};
IOWA_CITIES.forEach(c => { KNOWN[low(c)] = c; });
Object.keys(ALIASES).forEach(a => { KNOWN[a] = ALIASES[a]; });
/* Las mas largas primero: "West Des Moines" antes que "Des Moines". */
const NAMES = Object.keys(KNOWN).sort((a, b) => b.length - a.length);

function isState(v) {
  const s = low(v).replace(/\./g, '');
  return !!s && (STATES.includes(s.toUpperCase()) || STATE_NAMES.includes(s));
}
function canonicalCity(c) {
  const k = low(c).replace(/\.$/, '');
  return KNOWN[k] || clean(c);
}

/* La ciudad pegada al final de la calle, sin coma. La calle tiene que empezar
   con numero y quedarse con al menos numero + nombre ("100 N Ankeny" no se parte
   en "100 N" + Ankeny: "N" solo no es calle, pero "1450 Ankeny Blvd" no termina en ciudad). */
function cityAtEnd(street) {
  const s = clean(street).replace(/[,.\s]+$/, '');
  if (!/^\d/.test(s)) return null;
  const l = s.toLowerCase();
  for (const name of NAMES) {
    if (!l.endsWith(' ' + name)) continue;
    const rest = s.slice(0, s.length - name.length).replace(/[,\s]+$/, '');
    /* numero + al menos una palabra de calle que no sea solo direccion (N, SE...) */
    const words = rest.split(' ');
    if (words.length < 2 || words.slice(1).every(w => /^(n|s|e|w|ne|nw|se|sw)\.?$/i.test(w))) return null;
    return { address: rest, city: KNOWN[name] };
  }
  return null;
}

/* "calle[,] ciudad[,] IA[.] 50315[-1234]" (cualquier coma puede faltar) -> { address, city, zip } */
function splitInline(text) {
  let s = clean(text);
  if (!/^\d/.test(s)) return null;
  let zip = '', state = false;
  const z = /[,\s]+(\d{5})(?:-\d{4})?$/.exec(s);
  if (z) { zip = z[1]; s = s.slice(0, z.index); }
  const st = /[,\s]+(ia|iowa|i\.a\.?)\.?$/i.exec(s);
  if (st) { state = true; s = s.slice(0, st.index); }
  s = s.replace(/[,\s]+$/, '');
  if (!zip && !state) {
    /* Sin estado ni zip: solo "calle, Ciudad" con una ciudad conocida. */
    const m = /^(.*\S),\s*([^,\d]+)$/.exec(s);
    if (m && KNOWN[low(m[2])]) return { address: clean(m[1]), city: KNOWN[low(m[2])], zip: '' };
    return null;
  }
  /* Con coma: lo de despues de la ultima coma es la ciudad (si son letras y no un estado). */
  const m = /^(.*\S),\s*([A-Za-z .'-]+)$/.exec(s);
  if (m && !isState(m[2]) && /[A-Za-z]{2}/.test(m[2])) {
    const c = clean(m[2]);
    /* "123 Main St, Apt 4, Des Moines": la ciudad es lo ultimo, lo demas se queda en la calle. */
    return { address: clean(m[1]), city: canonicalCity(c), zip };
  }
  /* Sin coma: la ciudad conocida al final de la calle. */
  const end = cityAtEnd(s);
  if (end) return { address: end.address, city: end.city, zip };
  /* No se sabe cual es la ciudad: la calle se queda, sin inventar ciudad. */
  return { address: s, city: '', zip };
}

/* City que no es ciudad: solo un estado, o un numero (zip). '' si esta bien o vacia. */
function cityProblem(city) {
  const c = clean(city);
  if (!c) return '';
  if (isState(c)) return 'City "' + c + '" is a state, not a city. Type the city name (for example Des Moines).';
  if (!/[A-Za-z]/.test(c)) return 'City "' + c + '" is a number, not a city. Type the city name (the zip goes in Zip).';
  return '';
}

module.exports = { IOWA_CITIES, ALIASES, isState, canonicalCity, cityAtEnd, splitInline, cityProblem };
