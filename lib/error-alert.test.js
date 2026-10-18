/* node lib/error-alert.test.js */
'use strict';
const assert = require('assert');
const errorAlert = require('./error-alert');
const adapter = require('./vercel-adapter');

(async () => {
  let t = 0;
  const mails = [];
  const a = errorAlert('Admin', () => ({}), { always: true, now: () => t, send: async (g, o) => { mails.push(o); } });
  a.failure('/api/x', 500, 'The request has been throttled'); t += 1000;
  a.failure('/api/x', 500, 'The request has been throttled'); t += 1000;
  assert.strictEqual(mails.length, 0, 'two failures: no email');
  await a.failure('/api/x', 500, 'The request has been throttled');
  assert.strictEqual(mails.length, 1, 'third in 10 min: email');
  assert.strictEqual(mails[0].event, 'app-error');
  assert.strictEqual(mails[0].route, 'x');
  assert.strictEqual(mails[0].count, 3);
  t += 60e3; await a.failure('/api/x', 500, 'The request has been throttled');
  assert.strictEqual(mails.length, 1, 'same failure again within 2 h: no email');
  t += 2 * 36e5;
  a.failure('/api/x', 500, 'The request has been throttled');
  assert.strictEqual(mails.length, 1, 'after 2 h one failure alone (old ones out of the 10 min): no email');
  a.failure('/api/x', 500, 'The request has been throttled'); await a.failure('/api/x', 500, 'The request has been throttled');
  assert.strictEqual(mails.length, 2, 'a new burst after 2 h: email');
  /* numeros distintos = la misma falla */
  a.failure('/api/y', 500, 'Item 12 not found'); a.failure('/api/y', 500, 'Item 34 not found'); await a.failure('/api/y', 500, 'Item 56 not found');
  assert.strictEqual(mails.length, 3, 'same failure with other numbers counts together');
  /* tope de 4 por hora */
  for (const r of ['z1', 'z2', 'z3']) { a.failure('/api/' + r, 500, 'boom'); a.failure('/api/' + r, 500, 'boom'); await a.failure('/api/' + r, 500, 'boom'); }
  assert.strictEqual(mails.length, 5, 'never more than 4 emails an hour (the first one was more than an hour ago)');
  /* fuera de produccion, nada */
  const b = errorAlert('Admin', () => ({}), { now: () => t, send: async () => { throw new Error('should not send'); } });
  delete process.env.VERCEL_ENV;
  assert.strictEqual(b.failure('/api/x', 500, 'a'), null, 'not production: nothing');
  /* el correo que falla no truena */
  const c = errorAlert('Admin', () => ({}), { always: true, now: () => t, send: async () => { throw new Error('mail down'); } });
  c.failure('/api/q', 500, 'x'); c.failure('/api/q', 500, 'x');
  await c.failure('/api/q', 500, 'x');

  /* adaptador: respuestas 5xx y funciones que truenan cuentan; 4xx no */
  const sent = [];
  const { toVercel } = adapter('Tech', () => ({}), { always: true, now: () => t, send: async (g, o) => { sent.push(o); } });
  const fakeRes = () => { const r = { headers: {}, code: 0, body: null }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = c => { r.code = c; return r; }; r.send = b => { r.body = b; }; r.json = b => { r.body = b; }; return r; };
  const ok = toVercel(async ev => ({ statusCode: 200, headers: { 'X-A': '1' }, body: JSON.stringify({ got: JSON.parse(ev.body).n }) }));
  const r1 = fakeRes(); await ok({ method: 'POST', url: '/api/ok', body: { n: 5 }, headers: {} }, r1);
  assert.strictEqual(r1.code, 200); assert.strictEqual(r1.headers['X-A'], '1'); assert.strictEqual(JSON.parse(r1.body).got, 5);
  const bad = toVercel(async () => ({ statusCode: 400, body: JSON.stringify({ error: 'nope' }) }));
  for (let i = 0; i < 3; i++) await bad({ method: 'POST', url: '/api/bad', body: '{}' }, fakeRes());
  assert.strictEqual(sent.length, 0, '4xx never alerts');
  const fails = toVercel(async () => ({ statusCode: 500, body: JSON.stringify({ error: 'The request has been throttled' }) }));
  const crash = toVercel(async () => { throw new Error('kaput'); });
  for (let i = 0; i < 3; i++) await fails({ method: 'POST', url: '/api/fails?x=1', body: '{}' }, fakeRes());
  const r2 = fakeRes(); for (let i = 0; i < 3; i++) await crash({ method: 'GET', url: '/api/crash' }, r2);
  assert.strictEqual(r2.code, 500); assert.strictEqual(r2.body.error, 'kaput');
  assert.deepStrictEqual(sent.map(s => s.route + ':' + s.portal), ['fails:Tech', 'crash:Tech'], '5xx and crashes alert, route without /api/ and ?');

  /* la plantilla del correo */
  const notify = require('./notify');
  process.env.NOTIFY_MODE = 'test'; process.env.NOTIFY_TEST_TO = 'dev@x.com';
  const out = [];
  const g = { graphFetch: async (url, o) => { if (/sendMail/.test(url)) out.push(JSON.parse(o.body).message); return {}; }, createListItem: async () => ({}) };
  const r = await notify.notifyAlert(g, { event: 'app-error', portal: 'Admin', route: 'get-order-detail', status: 500, error: 'The request has been throttled', count: 3, since: '2026-10-18T02:00:00Z' });
  assert.ok(r.sent, 'alert email sent');
  assert.ok(/\[TEST → CFO@gsocd\.com\] App error: get-order-detail failed 3 times in 10 min \(Admin\)/.test(out[0].subject), out[0].subject);
  assert.ok(/throttled/.test(out[0].body.content));
  /* Orden nueva con "Unit ready" y gente en la unidad: todo en el mismo correo (dueño 18/10). */
  const r6 = await notify.notifyOffice(g, { event: 'client-request', kind: 'new', orderId: 'GS-1-9', order: { OrderID: 'GS-1-9', ClientID: 'GS-1', BusinessName: 'Lofts' }, ready: [{ unit: '101', date: '2026-10-19', time: '09:00', occupied: true }] });
  const m6 = out[out.length - 1].body.content;
  assert.ok(r6.sent && /Unit ready/.test(m6) && /9:00 AM/.test(m6) && /People in the unit/.test(m6), 'ready and occupied inside the new-order email');
  await notify.notifyOffice(g, { event: 'client-request', kind: 'new', orderId: 'GS-1-10', order: { OrderID: 'GS-1-10', ClientID: 'GS-1' }, ready: [{ unit: '201', date: '2026-10-19', time: '13:30' }, { unit: '202', occupied: true }] });
  const m7 = out[out.length - 1].body.content;
  assert.ok(/Unit 201: /.test(m7) && /1:30 PM/.test(m7) && /Unit 202/.test(m7) && !/Unit 202: /.test(m7), 'a lot lists each ready unit and who has people');
  console.log('error-alert ok');
})().catch(e => { console.error(e); process.exit(1); });
