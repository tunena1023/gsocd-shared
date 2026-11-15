/* node lib/site-visits.test.js -- lib/site-visits.js (CFO 14/11/2026): llegada una vez por dia (reintento y doble toque),
   salida por Done / 10 min fuera / ultima vez visto, regreso al lugar, varios dias, columnas y el renglon de la oficina. */
'use strict';
const S = require('./site-visits');
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 500) : '')); } };
const T = (h, m) => new Date(Date.UTC(2026, 10, 16, h + 6, m || 0)).toISOString(); /* hora de Iowa (CST = UTC-6) */

let r = S.arrive([], { at: T(8, 42), by: 'Carlos Ramírez', source: 'drive' });
check('arrive: first one is saved', r.changed && r.visit.arrivedAt === T(8, 42) && r.visit.day === '2026-11-16' && r.visit.source === 'drive');
let v = r.visits;
r = S.arrive(v, { at: T(8, 44), by: 'Ana López', source: 'map' });
check('arrive: a retry / second tap / other tech the same day changes nothing', !r.changed && r.visit.arrivedAt === T(8, 42) && r.visit.arrivedBy === 'Carlos Ramírez');
check('arrive: bad time -> nothing', !S.arrive(v, { at: 'nope' }).changed);

r = S.seen(v, { at: T(8, 45) });
check('seen: less than 4 min after -> no write', !r.changed);
r = S.seen(v, { at: T(9, 30) }); v = r.visits;
check('seen: later -> seenAt moves', r.changed && r.visit.seenAt === T(9, 30));
check('seen: before arrival / no visit that day -> nothing', !S.seen(v, { at: T(7, 0) }).changed && !S.seen(v, { at: '2026-11-17T15:00:00Z' }).changed);

r = S.leave(v, { at: T(10, 17), source: 'left' }); v = r.visits;
check('leave: 10 min outside -> left', r.changed && r.visit.leftAt === T(10, 17) && r.visit.leftSource === 'left');
r = S.leave(v, { at: T(10, 40), source: 'done' });
check('leave: Done after he already left keeps the left time', !r.changed && r.visit.leftAt === T(10, 17));
r = S.seen(v, { at: T(10, 50) });
check('seen after left: he came back -> departure cleared', r.changed && !r.visit.leftAt && r.visit.seenAt === T(10, 50));
v = r.visits;
r = S.leave(v, { at: T(11, 5), source: 'done' }); v = r.visits;
check('leave: Done -> left at Done', r.changed && r.visit.leftAt === T(11, 5) && r.visit.leftSource === 'done');
r = S.leave(v, { at: T(11, 30), source: 'done' }); v = r.visits;
check('leave: a later Done (another part) moves it', r.changed && r.visit.leftAt === T(11, 30));
check('leave: an earlier Done does not', !S.leave(v, { at: T(11, 10), source: 'done' }).changed);
check('leave: left after Done changes nothing', !S.leave(v, { at: T(12, 0), source: 'left' }).changed);

const c = S.columns(v);
check('columns: summary of the latest day', c.ArrivedAt === T(8, 42) && c.LeftAt === T(11, 30) && c.LeftSource === 'done' && c.ArrivalSource === 'drive' && JSON.parse(c.SiteVisits).length === 1);
check('parse(columns) round trip', JSON.stringify(S.parse(c)) === JSON.stringify(v));
check('parse: old order with only the columns', S.parse({ ArrivedAt: T(8, 0), ArrivalSource: 'map' })[0].source === 'map');
check('parse: junk -> []', S.parse({ SiteVisits: '{oops' }).length === 0 && S.parse(null).length === 0);

const line = S.line(v[0], T(13, 0));
check('line: office text', line === 'Arrived 8:42 AM · Left 11:30 AM · 2 h 48 min · by drive mode', line);

/* sin Done ni salida: hoy sigue en el lugar; ayer = la ultima vez visto */
let w = S.arrive([], { at: T(8, 0), by: 'X', source: 'map' }).visits;
w = S.seen(w, { at: T(9, 35) }).visits;
check('view today, seen 5 min ago -> on site, minutes until now', (() => { const x = S.view(w[0], T(9, 40)); return x.onSite && x.minutes === 100; })());
check('view today, not seen for 2 h -> last seen', (() => { const x = S.view(w[0], T(11, 40)); return !x.onSite && x.minutes === 95 && S.line(x).indexOf('Last seen 9:35 AM') >= 0; })());
check('view next day -> left = last seen', (() => { const x = S.view(w[0], '2026-11-17T15:00:00Z'); return x.leftSource === 'last seen' && x.leftAt === T(9, 35) && x.minutes === 95; })());

/* varios dias */
let m = S.arrive([], { at: T(8, 0), by: 'X', source: 'drive' }).visits;
m = S.leave(m, { at: T(12, 0), source: 'done' }).visits;
m = S.arrive(m, { at: '2026-11-17T14:10:00Z', by: 'X', source: 'drive' }).visits;
check('two days: both kept, columns = the second', m.length === 2 && S.columns(m).ArrivedAt === '2026-11-17T14:10:00.000Z' && !S.columns(m).LeftAt);
const ls = S.lines(S.columns(m), '2026-11-17T14:20:00Z');
check('lines: one per day with the date', ls.length === 2 && /^Nov 16: Arrived 8:00 AM · Left 12:00 PM/.test(ls[0]) && /^Nov 17: Arrived 8:10 AM · On site/.test(ls[1]), ls);

/* Done sin llegada (no tenia la app / sin permiso de ubicacion) */
const d = S.leave([], { at: T(15, 0), source: 'done' });
check('Done without arrival: only the departure', d.changed && d.visit.leftAt === T(15, 0) && !d.visit.arrivedAt && S.line(d.visit, T(16, 0)) === 'Left 3:00 PM');
check('arrival after a Done of that day keeps the arrival and drops the earlier Done', (() => { const a = S.arrive(d.visits, { at: T(15, 30), by: 'X' }); return a.changed && !a.visit.leftAt; })());
check('left without visit -> nothing', !S.leave([], { at: T(9, 0), source: 'left' }).changed);

console.log('\n' + ok + ' ok, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
