/* lib/mail-outbox.js + lib/notify.js contra un Postgres de verdad en memoria (PGlite: npm i --no-save @electric-sql/pglite)
   y un Microsoft falso que se cae y regresa. Correr: node lib/mail-outbox.test.js
   Caminos: switch apagado = como hoy; caido y regresa = sale una vez; doble clic; reintento a la mitad (candado, ya en
   Enviados); dos vueltas a la vez; orden cancelada / borrada; 24 h; 4xx no entra; app-error no espera; otro ambiente. */
'use strict';
let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch (e) { console.log('SKIP: npm i --no-save @electric-sql/pglite'); process.exit(0); }
const OB = require('./mail-outbox');
const notify = require('./notify');

let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } };

/* Microsoft falso: down = status de sendMail; sentItems = lo que Microsoft si acepto (con su marca). */
const MS = { down: 0, sentItems: [], posts: 0, readSent: 200, acceptThenFail: 0 };
const graphErr = st => { const e = new Error('Graph API error ' + st + ': {"error":{"code":"UnknownError"}}'); e.status = st; return e; };
const g = {
  siteListPath: x => '/list/' + x,
  createListItem: async () => {},
  graphFetch: async (url, opts) => {
    if (/\/sendMail$/.test(url)) {
      MS.posts++;
      if (MS.acceptThenFail) { MS.acceptThenFail--; MS.sentItems.push(JSON.parse(opts.body).message); throw graphErr(504); }
      if (MS.down) throw graphErr(MS.down);
      MS.sentItems.push(JSON.parse(opts.body).message);
      return null;
    }
    if (/mailFolders\('sentitems'\)\/messages/.test(url)) {
      if (MS.down) throw graphErr(MS.down);
      if (MS.readSent !== 200) throw graphErr(MS.readSent);
      const key = /ep\/value eq '([^']+)'/.exec(decodeURIComponent(url.split('$filter=')[1]))[1];
      return { value: MS.sentItems.filter(m => (m.singleValueExtendedProperties || []).some(p => p.id === OB.PROP && p.value === key)).map((m, i) => ({ id: 'm' + i })) };
    }
    if (url.indexOf('/list/Clients') === 0) return { value: [{ id: '2', fields: { ClientID: 'GS-9', Contact: 'manager@client.com' } }] };
    return { value: [] };
  }
};
const order = (id, extra) => Object.assign({ OrderID: id, ClientID: 'GS-9', BusinessName: 'Maple Court', UnitNumber: '12' }, extra || {});
const sentTo = (subj) => MS.sentItems.filter(m => m.subject.indexOf(subj) !== -1).length;

(async () => {
  const db = new PGlite();
  const sql = (t, p) => db.query(t, p || []).then(r => r.rows);
  await sql('create table "Orders" ("id" bigint primary key, "OrderID" text, "Status" text)');
  await sql('insert into "Orders" values (1, \'GS-9-1001\', \'Completed\'), (2, \'GS-9-1002\', \'Assigned\'), (3, \'GS-9-1003\', \'Assigned\'), (4, \'GS-9-1005\', \'Assigned\')');
  OB._setSql(sql);
  const rows = () => sql('select * from _mail_outbox order by id').catch(() => []);
  const tableExists = async () => (await sql("select count(*)::int as n from information_schema.tables where table_name = '_mail_outbox'"))[0].n === 1;
  const due = () => sql('update _mail_outbox set next_at = now() - interval \'1 second\' where status = \'pending\'');
  process.env.NOTIFY_MODE = 'live';
  process.env.VERCEL_ENV = 'production';

  /* ---- clasificacion ---- */
  check('5xx / 429 / 408 / red / timeout / token 503 = Microsoft (se reintenta)', [502, 503, 504, 500, 429, 408].every(s => OB.transient(graphErr(s))) &&
    OB.transient(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })) && OB.transient(Object.assign(new Error('x'), { name: 'AbortError' })) &&
    OB.transient(new Error('Token request failed: 503 down')));
  check('4xx de datos y errores nuestros = no se reintenta', [400, 404, 413, 422].every(s => !OB.transient(graphErr(s))) && !OB.transient(new Error('NOTIFY_MODE=test but NOTIFY_TEST_TO is empty')) &&
    !OB.transient(new Error('Token request failed: 400 bad')));
  check('espera 1, 2, 5, 10, 15, 30 min y luego cada hora', [1, 2, 3, 4, 5, 6, 7, 20].map(OB._backoffMin).join() === '1,2,5,10,15,30,60,60');
  check('la llave no cambia con la hora del texto', OB.textOf('<b>Marked done</b> Nov 12, 2026, 3:32 PM 2026-11-12T21:32:23.000Z') === OB.textOf('<b>Marked done</b> Nov 12, 2026, 3:33 PM 2026-11-12T21:33:01Z'));

  /* ---- switch apagado: como hoy ---- */
  delete process.env.MAIL_OUTBOX;
  MS.down = 502;
  const off = await notify.notifyClient(g, { event: 'completed', order: order('GS-9-1001') });
  check('APAGADO + Microsoft caido: falla como hoy (error, sent false)', off.sent === false && /502/.test(off.error) && !off.queued, off);
  check('APAGADO: no toca SQL (ni la tabla se crea)', !(await tableExists()));
  MS.down = 0;
  const off2 = await notify.notifyClient(g, { event: 'completed', order: order('GS-9-1001') });
  const offMsg = MS.sentItems[MS.sentItems.length - 1];
  check('APAGADO: el correo sale igual que antes, sin marca escondida', off2.sent === true && !offMsg.singleValueExtendedProperties, offMsg);
  check('APAGADO: drain y kick no hacen nada', (await OB.drain(g)).off === true && OB.kick(() => g) === null);
  MS.sentItems = []; MS.posts = 0;

  /* ---- prendido: Microsoft caido ---- */
  process.env.MAIL_OUTBOX = 'on';
  MS.down = 502;
  const q1 = await notify.notifyClient(g, { event: 'completed', order: order('GS-9-1001') });
  let r = await rows();
  check('caido: el correo del cliente entra a la fila y la llamada contesta como mandado (queued)', q1.sent === true && q1.queued > 0 && r.length === 1 && r[0].status === 'pending' && r[0].attempts === 1, { q1, r });
  check('el renglon lleva el mensaje completo, destinatario, orden, evento y error', r[0].payload.message.toRecipients[0].emailAddress.address === 'manager@client.com' &&
    r[0].order_id === 'GS-9-1001' && r[0].event === 'completed' && r[0].audience === 'client' && /502/.test(r[0].last_error) && r[0].env === 'production');
  const q1b = await notify.notifyClient(g, { event: 'completed', order: order('GS-9-1001') });
  r = await rows();
  check('doble clic / reintento de la pagina: el mismo renglon, no dos', q1b.queued === q1.queued && r.length === 1, r.length);

  const t1 = await notify.notifyOffice(g, { event: 'tech-done', order: order('GS-9-1001'), tech: 'Ana', at: '2026-11-12T21:32:23Z' });
  const t2 = await notify.notifyOffice(g, { event: 'tech-done', order: order('GS-9-1001'), tech: 'Ana', at: '2026-11-12T21:32:32Z' });
  r = await rows();
  check('aviso de oficina mandado dos veces (9 s de diferencia, como GS-1036-1287 hoy): un solo renglon', t1.queued && t1.queued === t2.queued && r.length === 2, r.map(x => x.event));

  const bad = await notify.notifyClient(Object.assign({}, g, { graphFetch: async (u, o) => /sendMail/.test(u) ? Promise.reject(graphErr(400)) : g.graphFetch(u, o) }), { event: 'scheduled', order: order('GS-9-1002') });
  check('4xx (datos malos): NO entra a la fila, falla como hoy', bad.sent === false && /400/.test(bad.error) && (await rows()).length === 2, bad);

  const al = await notify.notifyAlert(g, { event: 'app-error', portal: 'Admin', route: 'x', status: 502, error: 'y', count: 3, since: new Date().toISOString() });
  check('aviso de errores (app-error) no espera: viejo ya no sirve', al.sent === false && !al.queued && (await rows()).length === 2, al);
  const man = await notify.notifyClient(g, { event: 'completed', order: order('GS-9-1001'), manual: true, to: ['x@client.com'] });
  check('a mano desde Admin (una persona pico el boton): no espera, ella ve la falla', man.sent === false && /502/.test(man.error) && (await rows()).length === 2, man);

  /* ---- reintento mientras sigue caido ---- */
  let d = await OB.drain(g);
  check('vuelta antes de tiempo: no intenta (espera 1 min)', d.sent === 0 && d.waiting === 0 && MS.posts === 6, { d, posts: MS.posts });
  await due();
  d = await OB.drain(g);
  r = await rows();
  check('sigue caido: se quedan esperando, intento 2, la siguiente en 2 min', d.waiting === 2 && r.every(x => x.status === 'pending' && x.attempts === 2 && x.lease_until === null) &&
    r.every(x => new Date(x.next_at) - Date.now() > 60e3), { d, r: r.map(x => [x.attempts, x.next_at]) });

  /* ---- Microsoft regresa ---- */
  MS.down = 0;
  await due();
  const [da, db2] = await Promise.all([OB.drain(g), OB.drain(g)]);
  r = await rows();
  check('regresa (dos vueltas a la vez): cada correo sale UNA vez', da.sent + db2.sent === 2 && MS.sentItems.length === 2 && sentTo('GS-9-1001') === 2 &&
    r.every(x => x.status === 'sent' && x.sent_at && x.payload === null), { da, db2, n: MS.sentItems.length, r: r.map(x => x.status) });
  check('el que sale lleva la marca escondida con su llave', MS.sentItems.every(m => m.singleValueExtendedProperties[0].value === r.find(x => x.subject === m.subject).dedupe_key));
  await due();
  d = await OB.drain(g);
  check('otra vuelta: ya no manda nada', d.sent === 0 && MS.sentItems.length === 2);

  /* ---- reintento a la mitad ---- */
  MS.sentItems = []; MS.posts = 0;
  MS.acceptThenFail = 1; /* Microsoft lo acepta pero contesta 504 */
  const h1 = await notify.notifyClient(g, { event: 'scheduled', order: order('GS-9-1002'), services: [] });
  await due();
  d = await OB.drain(g);
  r = await rows();
  const hr = r.find(x => x.id === h1.queued);
  check('504 pero Microsoft si lo acepto: antes de reintentar se ve en Enviados y NO se manda otra vez', h1.queued && d.sent === 1 && MS.posts === 1 && MS.sentItems.length === 1 && hr.status === 'sent' && /Sent Items/.test(hr.note), { d, posts: MS.posts, hr });

  MS.down = 503;
  const h2 = await notify.notifyClient(g, { event: 'scheduled', order: order('GS-9-1003'), services: [] });
  MS.down = 0;
  await due();
  await sql('update _mail_outbox set lease_until = now() + interval \'2 minutes\', attempts = attempts + 1 where id = $1', [h2.queued]); /* otra vuelta lo tomo y se murio */
  d = await OB.drain(g);
  check('tomado por una vuelta que se murio: nadie lo manda mientras dura el candado', d.sent === 0 && sentTo('GS-9-1003') === 0);
  await sql('update _mail_outbox set lease_until = now() - interval \'1 second\' where id = $1', [h2.queued]);
  d = await OB.drain(g);
  check('vencido el candado: sale UNA vez (ni se pierde ni se duplica)', d.sent === 1 && sentTo('GS-9-1003') === 1, d);

  MS.readSent = 403;
  MS.down = 503;
  const h3 = await notify.notifyClient(g, { event: 'confirm', order: order('GS-9-1005'), diff: [] });
  MS.down = 0; await due();
  d = await OB.drain(g);
  check('sin permiso para ver Enviados: se manda igual (una vez)', h3.queued && d.sent === 1 && sentTo('GS-9-1005') === 1, d);
  MS.readSent = 200; OB._reset();

  /* ---- orden cancelada / borrada antes del reintento ---- */
  MS.down = 502;
  const c1 = await notify.notifyClient(g, { event: 'changed', order: order('GS-9-1002'), diff: [{ label: 'Date', from: 'Mon', to: 'Tue' }] });
  const c2 = await notify.notifyClient(g, { event: 'request-decision', order: order('GS-9-1002'), kind: 'cancel', approved: true });
  const c3 = await notify.notifyClient(g, { event: 'changed', order: order('GS-9-1999'), diff: [{ label: 'Date', from: 'Mon', to: 'Wed' }] });
  const c4 = await notify.notifyOffice(g, { event: 'client-request', kind: 'cancel', order: order('GS-9-1002') });
  await sql('update "Orders" set "Status" = \'Cancelled\' where "OrderID" = \'GS-9-1002\'');
  MS.down = 0; MS.sentItems = []; await due();
  d = await OB.drain(g);
  r = await rows();
  const st = id => r.find(x => x.id === id);
  check('orden cancelada: el "changed" no sale y dice por que', st(c1.queued).status === 'skipped' && /cancelled/.test(st(c1.queued).note) && st(c1.queued).payload === null, st(c1.queued));
  check('orden cancelada: el aviso de que se aprobo la cancelacion SI sale', st(c2.queued).status === 'sent', st(c2.queued));
  check('orden borrada: no sale y dice por que', st(c3.queued).status === 'skipped' && /deleted/.test(st(c3.queued).note), st(c3.queued));
  check('aviso a la oficina de la misma orden: sale (la oficina ve todo)', st(c4.queued).status === 'sent');
  check('en total salieron solo esos 2', MS.sentItems.length === 2 && d.skipped === 2, { d, n: MS.sentItems.length });

  /* ---- 24 h ---- */
  MS.down = 502; MS.sentItems = [];
  const x1 = await notify.notifyClient(g, { event: 'completed', order: order('GS-9-1003'), services: [] });
  await sql('update _mail_outbox set created_at = now() - interval \'25 hours\', next_at = now() - interval \'1 second\' where id = $1', [x1.queued]);
  d = await OB.drain(g);
  r = await rows();
  let alerts = r.filter(x => x.audience === 'alert');
  const gx = r.find(x => x.id === x1.queued);
  check('24 h sin salir: deja de intentar (gave_up), guarda el mensaje', d.gaveUp === 1 && gx.status === 'gave_up' && !!gx.payload, gx);
  check('24 h: el aviso de errores a CFO@ (Microsoft sigue caido: espera en la fila)', alerts.length === 1 && /not sent in 24 hours/.test(alerts[0].subject) && alerts[0].recipients === 'CFO@gsocd.com', alerts.map(x => x.subject));
  check('24 h: se marca avisado (no se repite)', !!gx.alerted_at);
  MS.down = 0; await due();
  d = await OB.drain(g);
  const am = MS.sentItems.find(m => /App alert/.test(m.subject));
  check('Microsoft regresa: llega el aviso con la orden y el destinatario, y nada mas', d.sent === 1 && am && /completed GS-9-1003/.test(am.body.content) && /manager@client\.com/.test(am.body.content) && MS.sentItems.length === 1, { d, s: MS.sentItems.map(m => m.subject) });
  await due();
  d = await OB.drain(g);
  check('otra vuelta: no hay otro aviso', d.sent === 0 && MS.sentItems.length === 1);

  /* ---- otro ambiente ---- */
  MS.down = 502;
  process.env.VERCEL_ENV = 'preview';
  const p1 = await notify.notifyOffice(g, { event: 'contact-form', name: 'Ana', email: 'ana@x.com', message: 'from test' });
  process.env.VERCEL_ENV = 'production';
  MS.down = 0; MS.sentItems = []; await due();
  d = await OB.drain(g);
  check('produccion no manda lo que se quedo de test (y al reves)', p1.queued && d.sent === 0 && MS.sentItems.length === 0 && (await rows()).find(x => x.id === p1.queued).status === 'pending');
  process.env.VERCEL_ENV = 'preview';
  d = await OB.drain(g);
  check('test lo manda en test', d.sent === 1 && MS.sentItems.length === 1);
  process.env.VERCEL_ENV = 'production';

  /* ---- SQL caido: el correo falla como hoy (nada truena) ---- */
  OB._setSql(async () => { throw new Error('SQL down'); });
  MS.down = 502;
  const s1 = await notify.notifyClient(g, { event: 'completed', order: order('GS-9-1001') });
  check('SQL caido al mismo tiempo: falla como hoy, sin tronar', s1.sent === false && /502/.test(s1.error), s1);
  OB._setSql(sql); OB._reset(); MS.down = 0;

  /* ---- kick: una vez por minuto, por detras ---- */
  const k1 = OB.kick(() => g), k2 = OB.kick(() => g);
  await k1;
  check('kick: corre por detras y no se repite en el mismo minuto', k1 && k2 === null && OB.kick(() => g) === null);

  /* ---- cada peticion de los 3 portales (vercel-adapter): primero contesta, luego revisa la fila ---- */
  OB._reset(); MS.down = 502; MS.sentItems = [];
  const v1 = await notify.notifyOffice(g, { event: 'contact-form', name: 'Bo', email: 'bo@x.com', message: 'adapter' });
  MS.down = 0; await due();
  const order2 = [];
  const { toVercel } = require('./vercel-adapter')('Test', () => g);
  const res = { headersSent: false, setHeader() {}, status() { return this; }, send() { order2.push('answer'); }, json() { order2.push('answer'); } };
  await toVercel(async () => { order2.push('handler'); return { statusCode: 200, body: '{}' }; })({ method: 'GET', url: '/api/x', headers: {} }, res);
  await new Promise(r => setTimeout(r, 300));
  check('vercel-adapter: contesta primero y despues manda lo que esperaba', order2.join() === 'handler,answer' && v1.queued && sentTo('adapter') === 0 && MS.sentItems.length === 1 && /adapter/.test(MS.sentItems[0].body.content), { order2, n: MS.sentItems.length });

  /* ---- DB_WAKE (lib/db-wake): la marca fuera de la base ---- */
  const W = require('./db-wake');
  const drive = { files: {}, down: 0 };
  const resp = (status, text) => ({ status, ok: status >= 200 && status < 300, text: async () => text || '' });
  g.getDriveId = async () => 'drv';
  g.rawGraphFetch = async (url, opts) => {
    if (drive.down) return resp(drive.down);
    const p = decodeURIComponent(url.split('root:/')[1].replace(/:\/content$/, ''));
    if (opts && opts.method === 'PUT') { drive.files[p] = String(opts.body); return resp(200, '{}'); }
    return drive.files[p] === undefined ? resp(404) : resp(200, drive.files[p]);
  };
  const flagFile = 'App Data/DB wake/flag-mail-production.json';
  process.env.DB_WAKE = 'on'; W._reset(); OB._reset(); MS.down = 0;
  await sql('update _mail_outbox set status = \'sent\' where status = \'pending\'');
  /* La ultima vuelta del cron ya reviso todo: sin marca nueva el kick no toca la base. */
  await W.done(g, 'mail', Date.now(), {});
  let sqlCalls = 0;
  OB._setSql((t, p) => { sqlCalls++; return sql(t, p); });
  await OB.kick(() => g);
  check('DB_WAKE: sin correos esperando, el kick de cada peticion no toca la base', sqlCalls === 0, sqlCalls);
  OB._setSql(sql); OB._reset();
  MS.down = 503;
  const wq = await notify.notifyOffice(g, { event: 'contact-form', name: 'Wake', email: 'w@x.com', message: 'wake flag' });
  MS.down = 0;
  check('DB_WAKE: al encolar queda la marca mail-production en el drive', wq.queued && drive.files[flagFile] && Date.parse(JSON.parse(drive.files[flagFile]).at) > 0, { wq, f: drive.files });
  const dw = await W.due(g, 'mail', { flags: [OB.wakeFlag()] });
  check('DB_WAKE: con la marca nueva el cron si corre', dw.run && /new work/.test(dw.why), dw);
  await due();
  const dr = await OB.drain(g);
  check('DB_WAKE: drain dice cuando vence lo siguiente (nada esperando: left 0, nextAt null)', dr.sent === 1 && dr.left === 0 && dr.nextAt === null, dr);
  MS.down = 502;
  await notify.notifyOffice(g, { event: 'contact-form', name: 'Wake2', email: 'w@x.com', message: 'wake flag two' });
  await due(); const dr2 = await OB.drain(g);
  check('DB_WAKE: con Microsoft caido, drain da la hora del siguiente reintento', dr2.left === 1 && Date.parse(dr2.nextAt) > Date.now(), dr2);
  MS.down = 0;
  /* Marca que no se puede escribir (Microsoft caido): el correo igual queda en la fila (lo ve la revision de cada hora). */
  drive.down = 503; MS.down = 502; W._reset();
  const wq3 = await notify.notifyOffice(g, { event: 'contact-form', name: 'Wake3', email: 'w@x.com', message: 'wake flag three' });
  check('DB_WAKE: si la marca no se guarda, el correo igual queda en la fila (no truena)', wq3.queued > 0, wq3);
  const dd = await W.due(g, 'mail', { flags: [OB.wakeFlag()] });
  check('DB_WAKE: marca que no se puede leer = el cron revisa la base (camino seguro)', dd.run && dd.why === 'flag not readable', dd);
  drive.down = 0; MS.down = 0;
  delete process.env.DB_WAKE;

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
