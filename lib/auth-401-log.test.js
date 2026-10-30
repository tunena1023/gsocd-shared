/* node lib/auth-401-log.test.js */
'use strict';
const { describe401, peekToken, log401 } = require('./auth-401-log');
let ok = 0, fail = 0;
const assert = (n, c, ev) => { if (c) { ok++; console.log('OK   - ' + n); } else { fail++; console.log('FAIL - ' + n, JSON.stringify(ev)); } };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Date.parse('2026-10-30T15:00:00Z');

const jwt = b64({ alg: 'RS256' }) + '.' + b64({ preferred_username: 'warehouse@gsocd.com', name: 'Xitlaly', exp: now / 1000 - 600 }) + '.firma';
let d = describe401({ portal: 'Admin', slug: 'quickbooks-clients', req: { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit Version/17 Safari/605' } }, token: jwt, why: 'jwt expired', now, from: 'header' });
assert('Admin: correo del token (sin validar), vencido hace 10 min, el porque y el navegador',
  d.who === 'warehouse@gsocd.com' && d.name === 'Xitlaly' && d.token === 'expired 10 min ago' && d.why === 'jwt expired' && d.browser === 'Safari' && d.method === 'GET', d);

const cookieTok = b64({ cid: 'GS-1043', r: 1, exp: now / 1000 + 3600 }) + '.sig';
d = describe401({ portal: 'Orders', slug: 'get-orders', req: { headers: { cookie: 'a=1; gs_client=' + encodeURIComponent(cookieTok) } }, cookie: 'gs_client', why: 'no session', now });
assert('Orders: cid de la cookie firmada, vigente -> present', d.who === 'GS-1043' && d.token === 'present', d);

d = describe401({ portal: 'Tech', slug: 'get-my-orders', req: { headers: {} }, cookie: 'gs_tech', why: 'no session', now });
assert('sin cookie -> token none, who (unknown)', d.token === 'none' && d.who === '(unknown)', d);
d = describe401({ portal: 'Admin', slug: 'x', token: 'basura', why: 'bad', now });
assert('token que no se lee -> unreadable', d.token === 'unreadable', d);
assert('peekToken de algo raro no truena', peekToken('a.b.c') === null && peekToken(null) === null);

const lines = []; const orig = console.warn; console.warn = s => lines.push(s);
log401({ portal: 'Admin', slug: 'q', token: jwt, why: 'x' });
console.warn = orig;
assert('log401: una linea "auth-401: {json}" y nunca el token', lines.length === 1 && /^auth-401: \{/.test(lines[0]) && !lines[0].includes('firma') && !lines[0].includes(jwt.split('.')[1]), lines);
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
