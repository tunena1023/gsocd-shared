/* Hibrido de "guardar en SQL primero" (CFO 12/11/2026): Neon no contesta -> SharePoint + diario; cuando vuelve, el diario
   pasa a SQL en orden. lib/sql-first.js + lib/sql-journal.js contra un Postgres en memoria y un SharePoint falso.
   Correr: npm i --no-save @electric-sql/pglite && node lib/sql-hybrid.test.js */
'use strict';
let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch (e) { console.log('SKIP: npm i --no-save @electric-sql/pglite'); process.exit(0); }
const M = require('./sql-mirror');
const R = require('./sql-read');
const SF = require('./sql-first');
const J = require('./sql-journal');
let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } };
const quiet = console.error;
const logs = [];
console.error = (...a) => { logs.push(a.join(' ')); };

/* SharePoint falso (ids propios, eTag, down = Microsoft caido, failMark = el diario no se puede marcar). */
function fakeSP() {
  const sp = { lists: {}, next: {}, calls: [], down: false, failJournalPatch: 0 };
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  sp.fetch = async (path, opts, raw) => {
    const method = String((opts && opts.method) || 'GET').toUpperCase();
    sp.calls.push(method + ' ' + path);
    const m = /\/lists\/([^/?]+)\/items(?:\/(\d+))?(\/fields)?/.exec(path);
    const list = m ? decodeURIComponent(m[1]) : null;
    if (sp.down) throw err(503, 'Service Unavailable');
    if (!m) { const lm = /\/lists\/([^/?]+)\?/.exec(path); return lm ? { id: lm[1], lastModifiedDateTime: sp.mod || '2026-11-12T10:00:00Z' } : { value: [] }; }
    const L = sp.lists[list] = sp.lists[list] || {};
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (method === 'GET') {
      if (m[2]) { const it = L[m[2]]; if (!it) throw err(404, 'Item not found'); return JSON.parse(JSON.stringify(it)); }
      /* Como Graph: paginas ($top, 100 si no dice) y @odata.nextLink. */
      const qs = new URLSearchParams(String(path).split('?')[1] || '');
      const top = Math.min(Number(qs.get('$top') || 100), 100), skip = Number(qs.get('$skiptoken') || 0);
      const all = Object.values(L).sort((a, b) => Number(a.id) - Number(b.id));
      const out = { value: all.slice(skip, skip + top).map(x => JSON.parse(JSON.stringify(x))) };
      if (all.length > skip + top) { qs.set('$skiptoken', String(skip + top)); out['@odata.nextLink'] = String(path).split('?')[0] + '?' + qs.toString(); }
      return out;
    }
    if (method === 'POST') {
      const id = sp.next[list] = (sp.next[list] || 100) + 1;
      if (sp.loseNextCreate === list) { sp.loseNextCreate = null; L[id] = { id: String(id), '@odata.etag': '"sp' + id + ',1"', fields: Object.assign({ id: String(id), Created: new Date().toISOString() }, body.fields) }; throw err(504, 'Gateway Timeout'); }
      L[id] = { id: String(id), '@odata.etag': '"sp' + id + ',1"', createdDateTime: new Date().toISOString(), fields: Object.assign({ id: String(id), Created: new Date().toISOString() }, body.fields) };
      sp.mod = new Date().toISOString();
      return JSON.parse(JSON.stringify(L[id]));
    }
    const it = L[m[2]];
    if (!it) throw err(404, 'Item not found');
    if (method === 'DELETE') { delete L[m[2]]; sp.mod = new Date().toISOString(); return null; }
    if (list === J.LIST && sp.failJournalPatch > 0) { sp.failJournalPatch--; throw err(503, 'journal patch failed'); }
    const im = opts.headers && (opts.headers['If-Match'] || opts.headers['if-match']);
    if (im && im !== '*' && im !== it['@odata.etag']) throw err(412, 'Precondition Failed');
    Object.assign(it.fields, body);
    const v = Number(/,(\d+)"/.exec(it['@odata.etag'])[1]) + 1;
    it['@odata.etag'] = '"sp' + it.id + ',' + v + '"';
    sp.mod = new Date().toISOString();
    return Object.assign({ '@odata.etag': it['@odata.etag'] }, it.fields);
  };
  return sp;
}

(async () => {
  const db = new PGlite();
  const raw = (t, p) => db.query(t, p || []).then(r => r.rows);
  /* SQL de mentira: down = Neon no contesta (falla al momento), hang = no contesta nunca, failAfter = truena despues de N consultas. */
  const S = { down: false, hang: false, calls: 0, failOn: null, loseAnswerOn: null };
  const sql = async (t, p) => {
    S.calls++;
    if (S.hang) return new Promise(() => {});
    if (S.down) throw new Error('fetch failed: Neon is not answering');
    if (S.failOn && S.failOn(t)) { S.failOn = null; throw new Error('fetch failed: Neon went down in the middle'); }
    if (S.loseAnswerOn && S.loseAnswerOn(t)) { S.loseAnswerOn = null; await raw(t, p); throw new Error('SQL save timed out after 10000 ms'); }
    return raw(t, p);
  };
  await raw('create table "_sp_base" ("id" bigint primary key, "created_at" timestamptz not null default now(), "modified_at" timestamptz not null default now(), "created_by" text, "modified_by" text, "etag" text)');
  await raw('create table "Orders" (like "_sp_base" including all, "Title" text, "OrderID" text, "Status" text, "Bedrooms" numeric, "Notes" text, "OrderContactId" text)');
  await raw('create table "ClientContacts" (like "_sp_base" including all, "Title" text, "ClientID" text, "Name" text)');
  await raw('create table "ClientAddresses" (like "_sp_base" including all, "Title" text, "ClientID" text, "ContactId" text)');
  await raw('create table "Settings" (like "_sp_base" including all, "Title" text, "Key" text, "Value" text)');
  const sp = fakeSP();
  /* renglones de antes (nacidos en SharePoint, misma copia en SQL) */
  sp.lists.Orders = { 41: { id: '41', '@odata.etag': '"e41,3"', fields: { id: '41', OrderID: 'GS-1-1', Status: 'Submitted', Bedrooms: 2, Notes: 'Gate code' } } };
  sp.next.Orders = 2077; sp.next.ClientContacts = 300; sp.next.ClientAddresses = 500;
  await M.upsertItems(raw, 'Orders', [{ id: '41', '@odata.etag': '"e41,3"', fields: { OrderID: 'GS-1-1', Status: 'Submitted', Bedrooms: 2, Notes: 'Gate code' } }], { force: true });
  const P = (l, rest) => '/sites/h:/s:/lists/' + l + '/items' + (rest || '');
  const writeMode = { Orders: 'sql-first', ClientContacts: 'sql-first', ClientAddresses: 'sql-first' };
  const deps = { sql, writeMode, mode: 'sql', drainBudgetMs: 3000, hybridMs: 60, probeAfterMs: 0 };
  const g = M.wrap(sp.fetch, deps);
  const req = fn => R.context({ background: false }, async () => { let out, err = null; try { out = await fn(); } catch (e) { err = e; } return { out, err, info: Object.assign({}, R.reqInfo()) }; });
  const patch = (list, id, f, extra) => g(P(list, '/' + id + '/fields'), Object.assign({ method: 'PATCH', body: JSON.stringify(f) }, extra || {}));
  const post = (list, f) => g(P(list), { method: 'POST', body: JSON.stringify({ fields: f }) });
  const settle = async () => { for (let i = 0; i < 3; i++) { await SF.idle(); await J.idle(); await R.idle(); } };
  const drain = () => SF.drain({ sql, graphFetch: sp.fetch, budgetMs: 3000 });
  const due = () => raw('update "_sp_outbox" set "next_at" = now() where "done_at" is null');
  const journal = () => Object.values(sp.lists[J.LIST] || {}).sort((a, b) => Number(a.id) - Number(b.id)).map(x => x.fields);
  const row = async (l, id) => (await raw('select * from "' + l + '" where "id" = $1', [Number(id)]))[0];
  const up = async () => { S.down = false; S.hang = false; R._resetBreaker(); };
  const neonDown = () => { S.down = true; };
  /* El renglon del falso vs SQL: mismos campos de usuario. */
  const sameAsSP = async (list, ids) => {
    const off = [];
    for (const id of ids) {
      const r = await row(list, id);
      const it = sp.lists[list][String(r && r.sp_id ? r.sp_id : id)];
      if (!r || !it) { off.push(id + ' missing ' + (!r ? 'in SQL' : 'in SharePoint')); continue; }
      ['OrderID', 'Status', 'Bedrooms', 'Notes', 'Name', 'ContactId'].forEach(k => {
        if (!(k in r)) return;
        const a = it.fields[k], b = r[k];
        const n = v => v === undefined || v === '' ? null : v;
        if (String(n(a)) !== String(n(b)) && !(Number(a) === Number(b) && a !== null && b !== null)) off.push(id + '.' + k + ' sp=' + a + ' sql=' + b);
      });
    }
    return off;
  };

  /* ---- 0. apagado: SQL_FIRST_HYBRID=off sigue como antes (error, nada a SharePoint) ---- */
  neonDown(); sp.calls = [];
  process.env.SQL_FIRST_HYBRID = 'off';
  const off0 = await req(() => patch('Orders', 41, { Status: 'x' }));
  delete process.env.SQL_FIRST_HYBRID;
  check('hybrid off: SQL down = error, nothing to SharePoint, no header', off0.err && off0.err.status === 503 && sp.calls.length === 0 && !off0.info.data, { e: off0.err && off0.err.message, calls: sp.calls, info: off0.info });
  await up();

  /* ---- 1. SQL bien: igual que antes, header "sql" ---- */
  const c0 = await req(() => post('Orders', { OrderID: 'GS-2-1', Status: 'Submitted', Bedrooms: 1 }));
  await settle();
  const born = Number(c0.out.id);
  check('SQL up: saved in SQL first (id born in SQL), header X-GS-Data = sql', born >= SF.ID_MIN && c0.info.data === 'sql' && c0.info.writes === 1, c0.info);
  const bornSp = Number((await row('Orders', born)).sp_id);
  check('...and its backup reached SharePoint (sp_id)', bornSp > 2077 && sp.lists.Orders[bornSp].fields.OrderID === 'GS-2-1');

  /* ---- 2. Neon se cae: lecturas de SharePoint, freno a las 3 seguidas ---- */
  neonDown(); sp.calls = []; S.calls = 0;
  const r1 = await req(() => g(P('Orders') + '?$expand=fields', {}));
  check('Neon down: the read is answered from SharePoint at that moment, header = sharepoint', r1.out && r1.out.value.length === 2 && r1.info.data === 'sharepoint' && R.sqlOk(), { info: r1.info, n: r1.out && r1.out.value.length });
  check('...with the same ids the screen had (a row born in SQL keeps its SQL id, not the SharePoint one)', r1.out.value.some(x => x.id === String(born) && x.fields.id === String(born)) && !r1.out.value.some(x => x.id === String(bornSp)), r1.out.value.map(x => x.id));
  await req(() => g(P('Orders') + '?$expand=fields', {}));
  await req(() => g(P('Orders') + '?$expand=fields', {}));
  check('3 failures in a row: the server stops asking SQL (brake 1 min)', !R.sqlOk());
  S.calls = 0;
  const r4 = await req(() => g(P('Orders', '/41') + '?$expand=fields', {}));
  check('with the brake on: straight to SharePoint, SQL not asked', r4.out.fields.Status === 'Submitted' && S.calls === 0 && r4.info.data === 'sharepoint', { calls: S.calls, info: r4.info });
  const mk = await req(() => g('/sites/h:/s:/lists/Orders?$select=id,lastModifiedDateTime', {}));
  check('the "did it change?" marker of the list also from SharePoint', mk.out && mk.out.lastModifiedDateTime && mk.info.data === 'sharepoint', mk);
  /* SQL que no contesta (cuelga): a los 2 s (aqui 60 ms) la lectura sale de SharePoint */
  await up(); S.hang = true;
  const t0 = Date.now();
  const rh = await req(() => g(P('Orders', '/41') + '?$expand=fields', {}));
  check('SQL hanging: after the 2 s limit the read comes from SharePoint', rh.out && rh.out.fields.OrderID === 'GS-1-1' && Date.now() - t0 < 1500 && rh.info.data === 'sharepoint', { ms: Date.now() - t0, info: rh.info });
  S.hang = false; neonDown(); R.trip(new Error('down'));

  /* ---- 3. guardar durante la caida: SharePoint + diario ---- */
  sp.calls = [];
  const u1 = await req(() => patch('Orders', 41, { Status: 'Scheduled' }));
  await settle();
  const j1 = journal();
  check('save during the outage: in SharePoint right away ("Saved"), header = sharepoint', u1.out && u1.out.Status === 'Scheduled' && sp.lists.Orders[41].fields.Status === 'Scheduled' && u1.info.data === 'sharepoint' && !u1.err, u1);
  check('...the journal entry was written BEFORE the save and has time, list, row and the exact fields sent',
    /SqlOutageLog/.test(sp.calls[0]) && /^POST/.test(sp.calls[0]) && j1.length === 1 && j1[0].ListName === 'Orders' && j1[0].Op === 'update' && j1[0].RowId === '41' &&
    j1[0].Fields === '{"Status":"Scheduled"}' && /Z$/.test(j1[0].At) && j1[0].State === 'done', { calls: sp.calls, j1 });
  /* 5 cambios al mismo renglon */
  for (const [i, f] of [{ Status: 'In Progress' }, { Notes: 'Key under the mat' }, { Status: 'Completed', Bedrooms: 3 }, { Notes: 'Key returned' }, { Status: 'Invoiced' }].entries()) {
    await req(() => patch('Orders', 41, f));
    if (i === 1) await new Promise(r => setTimeout(r, 5));
  }
  /* creacion durante la caida: SharePoint da el id */
  const c1 = await req(() => post('Orders', { OrderID: 'GS-3-1', Status: 'Submitted', Bedrooms: 2 }));
  const newSp = Number(c1.out.id);
  await req(() => patch('Orders', newSp, { Status: 'Approved' }));
  /* borrar durante la caida */
  const c2 = await req(() => post('Orders', { OrderID: 'GS-3-2', Status: 'Submitted' }));
  await req(() => g(P('Orders', '/' + c2.out.id), { method: 'DELETE' }));
  await settle();
  check('create during the outage: SharePoint gives the id (< 1,000,000)', newSp > 2077 && newSp < SF.ID_MIN && sp.lists.Orders[newSp].fields.Status === 'Approved', c1.out);
  /* renglon nacido en SQL con copia en SharePoint que este servidor ya vio: se guarda en ese renglon de SharePoint */
  const d1 = await req(() => patch('Orders', born, { Notes: 'changed while down' }));
  await settle();
  const jb = journal().slice(-1)[0];
  check('row born in SQL whose SharePoint id this server knows: saved in that SharePoint row, the screen keeps the SQL id',
    d1.out && d1.out.Notes === 'changed while down' && String(d1.out.id) === String(born) && sp.lists.Orders[bornSp].fields.Notes === 'changed while down' &&
    jb.RowId === String(born) && jb.SpId === String(bornSp) && jb.State === 'done', { d1, jb });
  const im = await req(() => patch('Orders', born, { Status: 'x' }, { headers: { 'If-Match': '"abc,3"' } }));
  check('...with an old If-Match: SharePoint says 412 as always (the screen reads again)', im.err && im.err.status === 412, im.err && im.err.message);
  /* otro servidor que nunca vio ese renglon (no sabe su id de SharePoint): solo el diario, y la persona ve "Saved" */
  SF._reset();
  const d2 = await req(() => patch('Orders', born, { Bedrooms: 9 }));
  await settle();
  const jd = journal().filter(x => x.State === 'deferred');
  check('row born in SQL that this server does not know: kept in the journal only, the person sees "Saved"',
    d2.out && Number(d2.out.Bedrooms) === 9 && String(d2.out.id) === String(born) && jd.length === 1 && jd[0].RowId === String(born) && Number(sp.lists.Orders[bornSp].fields.Bedrooms) !== 9, { d2, jd });
  const im3 = await req(() => patch('Orders', born, { Status: 'x' }, { headers: { 'If-Match': '"abc,3"' } }));
  check('...with If-Match (cannot be checked without SQL): not saved, try again (503), nothing in the journal', im3.err && im3.err.status === 503 && journal().filter(x => x.State === 'deferred').length === 1, im3.err && im3.err.message);
  /* If-Match de un renglon de SharePoint: SharePoint lo revisa (412 igual que siempre) */
  const im2 = await req(() => patch('Orders', 41, { Status: 'y' }, { headers: { 'If-Match': '"old,1"' } }));
  await settle();
  check('If-Match during the outage: SharePoint checks it (412 as always), its journal entry = failed', im2.err && im2.err.status === 412 && journal().slice(-1)[0].State === 'failed' && sp.lists.Orders[41].fields.Status === 'Invoiced', { e: im2.err && im2.err.message, last: journal().slice(-1)[0] });
  /* doble clic: el mismo cambio dos veces a la vez */
  await Promise.all([req(() => patch('Orders', 41, { Bedrooms: 5 })), req(() => patch('Orders', 41, { Bedrooms: 5 }))]);
  await settle();
  /* la fila no sale mientras el diario no pasa */
  check('during the outage nothing in SQL changed', (await raw('select "Status", "Notes", "Bedrooms" from "Orders" where id = 41'))[0].Status === 'Submitted');

  /* ---- 4. Neon vuelve: el diario pasa a SQL en orden ---- */
  await up();
  const before = journal().length;
  const rb = await req(() => g(P('Orders', '/41') + '?$expand=fields', {}));
  check('SQL back but the journal is not applied yet: still answered from SharePoint (the warning stays)', rb.info.data === 'sharepoint' && rb.out.fields.Status === 'Invoiced', rb.info);
  await settle();
  const o41 = await row('Orders', 41);
  check('journal applied in order, field by field: the 5 changes (and the double click) end like SharePoint', o41.Status === 'Invoiced' && o41.Notes === 'Key returned' && Number(o41.Bedrooms) === 5, o41);
  const cNew = await row('Orders', newSp);
  check('create during the outage: SQL uses the SharePoint id (sp_id = id), with its later change', cNew && Number(cNew.sp_id) === newSp && cNew.Status === 'Approved' && cNew.OrderID === 'GS-3-1', cNew);
  check('delete during the outage: gone in SQL too', !(await row('Orders', Number(c2.out.id))));
  const ob = await raw('select * from "_sp_outbox" where "done_at" is null order by "n"');
  check('deferred change (row born in SQL): applied to SQL and waiting in the outbox for SharePoint', (await row('Orders', born)).Notes === 'changed while down' && Number((await row('Orders', born)).Bedrooms) === 9 &&
    ob.some(x => Number(x.row_id) === born && Number(x.fields.Bedrooms) === 9), ob);
  const jj = journal();
  const kc = (await raw('select count(*)::int n from "_sql_journal"'))[0].n;
  check('every journal entry is applied or skipped (with its reason), one key each in SQL', jj.length === before && jj.every(x => x.State === 'applied' || x.State === 'skipped') && kc === jj.length && jj.filter(x => x.State === 'skipped').length === 2, jj.map(x => x.State + ':' + x.Note));
  check('the shared flag is closed again', (await raw('select "open" from "_sql_journal_state"'))[0].open === false);
  const rq = await req(() => g(P('Orders', '/41') + '?$expand=fields', {}));
  check('after the journal: reads from SQL again (header = sql, the warning goes away)', rq.info.data === 'sql' && rq.out.fields.Status === 'Invoiced', rq.info);
  await due(); await drain(); await settle();
  check('...and the backup ends equal to SQL (rows 41, new, born)', (await sameAsSP('Orders', [41, newSp, born])).length === 0, await sameAsSP('Orders', [41, newSp, born]));
  check('history of what happened: SQL ended with the same version count for the 5 changes', /,\d+"$/.test(o41.etag) && Number(/,(\d+)"$/.exec(o41.etag)[1]) >= 8, o41.etag);

  /* ---- 5. un cambio en la fila de ANTES de la caida + uno durante ---- */
  sp.down = true; /* SharePoint caido: el cambio se queda en la fila */
  await req(() => patch('Orders', 41, { Status: 'Old (before)', Bedrooms: 7 }));
  await settle();
  sp.down = false;
  const pend0 = await raw('select * from "_sp_outbox" where "done_at" is null and "row_id" = 41');
  check('change before the outage waiting in the outbox (SharePoint was down)', pend0.length === 1 && pend0[0].fields.Status === 'Old (before)', pend0);
  neonDown(); R.trip(new Error('down'));
  await req(() => patch('Orders', 41, { Status: 'New (during)' }));
  await settle();
  await up();
  await req(() => g(P('Orders', '/41') + '?$expand=fields', {}));
  await settle();
  await due(); await drain(); await settle();
  check('old change of the outbox never overwrites the newer one in SharePoint (only its other fields go)', sp.lists.Orders[41].fields.Status === 'New (during)' && Number(sp.lists.Orders[41].fields.Bedrooms) === 7, sp.lists.Orders[41].fields);
  const s41 = await row('Orders', 41);
  check('...and in SQL: Status from the journal, Bedrooms from before', s41.Status === 'New (during)' && Number(s41.Bedrooms) === 7, s41);
  const n41 = (await raw('select "note" from "_sp_outbox" where "row_id" = 41 and "note" is not null order by "n" desc limit 1'))[0];
  check('...the old outbox entry says why (no silent drop)', n41 && /newer value/.test(n41.note), n41);

  /* ---- 6. SQL cambio DESPUES (otro servidor que no supo de la caida): SQL gana ese campo ---- */
  neonDown(); R.trip(new Error('down'));
  await req(() => patch('Orders', 41, { Status: 'From journal (older)', Notes: 'journal note' }));
  await settle();
  await up(); J._reset(); /* otro servidor: no sabe del diario */
  const other = await req(() => patch('Orders', 41, { Status: 'From SQL (newer)' }));
  await settle();
  check('a server that did not see the outage saves in SQL...', other.info.data === 'sql' && (await row('Orders', 41)).Status === 'From SQL (newer)', other.info);
  check('...but its outbox waits: the journal in SharePoint is not applied yet', sp.lists.Orders[41].fields.Status === 'From journal (older)' &&
    (await raw('select count(*)::int n from "_sp_outbox" where "done_at" is null and "row_id" = 41'))[0].n === 1);
  await settle();
  await J.apply({ sql, graphFetch: sp.fetch, site: '/sites/h:/s:' });
  await due(); await drain(); await settle();
  const s6 = await row('Orders', 41);
  check('newer SQL change wins that field; the other field comes from the journal; SharePoint the same', s6.Status === 'From SQL (newer)' && s6.Notes === 'journal note' &&
    sp.lists.Orders[41].fields.Status === 'From SQL (newer)' && sp.lists.Orders[41].fields.Notes === 'journal note', { s6, sp: sp.lists.Orders[41].fields });

  /* ---- 6b. TODOS los campos del diario los cambio SQL despues: se anota la llave y no truena (antes: error de parametros que
     ademas ponia el freno y el diario no avanzaba) ---- */
  neonDown(); R.trip(new Error('down'));
  await req(() => patch('Orders', 41, { Notes: 'old journal note' }));
  await settle();
  await up(); J._reset();
  await req(() => patch('Orders', 41, { Notes: 'newer in SQL' }));
  await settle();
  const a6 = await J.apply({ sql, graphFetch: sp.fetch, site: '/sites/h:/s:' });
  await due(); await drain(); await settle();
  check('a journal change whose fields were all changed later in SQL: applied as "nothing to change", SQL keeps the newer value, no error, no brake',
    journal().filter(x => /old journal note/.test(x.Fields)).every(x => x.State === 'applied') && !a6.error && !a6.waiting && R.sqlOk() && (await row('Orders', 41)).Notes === 'newer in SQL' && sp.lists.Orders[41].fields.Notes === 'newer in SQL', { a6, n: (await row('Orders', 41)).Notes });

  /* ---- 7. renglon nacido en SQL que todavia NO llego a SharePoint cuando Neon se cae ---- */
  sp.down = true;
  const c7 = await req(() => post('Orders', { OrderID: 'GS-7-1', Status: 'Submitted' }));
  await settle();
  sp.down = false;
  const id7 = Number(c7.out.id);
  check('row born in SQL not in SharePoint yet', id7 >= SF.ID_MIN && !(await row('Orders', id7)).sp_id);
  neonDown(); R.trip(new Error('down'));
  const l7 = await req(() => g(P('Orders') + '?$expand=fields', {}));
  check('during the outage it does not show in SharePoint (expected)', !l7.out.value.some(x => x.fields.OrderID === 'GS-7-1'));
  const u7 = await req(() => patch('Orders', id7, { Status: 'Scheduled' }));
  const u7b = await req(() => patch('Orders', id7, { Status: 'Completed' }));
  await settle();
  check('changing it gives "Saved" (no 404): kept in the journal', !u7.err && !u7b.err && u7b.out.Status === 'Completed' && journal().filter(x => x.RowId === String(id7)).every(x => x.State === 'deferred'), { u7, u7b });
  await up();
  await req(() => g(P('Orders') + '?$expand=fields', {}));
  await settle();
  await due(); await drain(); await settle();
  const s7 = await row('Orders', id7);
  check('when SQL is back: applied in order, then created in SharePoint and changed (equal)', s7.Status === 'Completed' && s7.sp_id && sp.lists.Orders[s7.sp_id].fields.Status === 'Completed', { s7, sp: s7 && s7.sp_id && sp.lists.Orders[s7.sp_id] });

  /* ---- 8. ids de otra lista: SharePoint usa sus ids, SQL los suyos ---- */
  const ct = await req(() => post('ClientContacts', { Name: 'Dana', ClientID: 'GS-9' }));
  await settle();
  const ctId = Number(ct.out.id), ctSp = Number((await row('ClientContacts', ctId)).sp_id);
  neonDown(); R.trip(new Error('down'));
  const a1 = await req(() => post('ClientAddresses', { ClientID: 'GS-9', ContactId: String(ctSp) })); /* leido de SharePoint */
  const a2 = await req(() => post('ClientAddresses', { ClientID: 'GS-9', ContactId: String(ctId) })); /* la pantalla tenia el de SQL */
  await settle();
  await up();
  await req(() => g(P('ClientAddresses') + '?$expand=fields', {}));
  await settle(); await due(); await drain(); await settle();
  const ra1 = await row('ClientAddresses', Number(a1.out.id)), ra2 = await row('ClientAddresses', Number(a2.out.id));
  check('a SharePoint id of a row born in SQL becomes its SQL id in SQL (SharePoint keeps its own)', ra1.ContactId === String(ctId) && sp.lists.ClientAddresses[a1.out.id].fields.ContactId === String(ctSp), { ra1, sp: sp.lists.ClientAddresses[a1.out.id].fields });
  check('a SQL id that SharePoint got as is: SQL keeps it and SharePoint gets its own id after', ra2.ContactId === String(ctId) && sp.lists.ClientAddresses[a2.out.id].fields.ContactId === String(ctSp), { ra2, sp: sp.lists.ClientAddresses[a2.out.id].fields });
  const byOld = await req(() => patch('Orders', bornSp, { Notes: 'by the SharePoint id' }));
  await settle();
  check('after the outage, a screen with the SharePoint id of a row born in SQL saves to its SQL row (no 404)', !byOld.err && (await row('Orders', born)).Notes === 'by the SharePoint id', byOld.err && byOld.err.message);

  /* ---- 9. los dos caidos: nada se guarda en el servidor; la pantalla lo guarda en el telefono ---- */
  neonDown(); R.trip(new Error('down')); sp.down = true;
  const bd = await req(() => patch('Orders', 41, { Status: 'both down' }));
  const br = await req(() => g(P('Orders') + '?$expand=fields', {}));
  sp.down = false;
  check('both down: the save says so (503 bothDown), header = down and X-GS-Replay (nothing saved before in the request)', bd.err && bd.err.status === 503 && bd.err.code === 'bothDown' && bd.info.data === 'down' && bd.info.replay === true, { e: bd.err && bd.err.message, info: bd.info });
  check('both down: the read fails (the screen keeps what it had), header = down', br.err && br.info.data === 'down', br.info);
  const partial = await R.context({}, async () => { await post('ClientContacts', { Name: 'x' }).catch(() => {}); return R.reqInfo(); });
  const part2 = await R.context({}, async () => { R.noteWrite(); sp.down = true; try { await patch('Orders', 41, { Status: 'z' }); } catch (e) { /* */ } sp.down = false; return R.reqInfo(); });
  check('a request that already saved something before: no X-GS-Replay (it would repeat the first save)', part2.data === 'down' && part2.replay === false && partial.data === 'sharepoint', { partial, part2 });
  await up();
  await req(() => g(P('Orders', '/41') + '?$expand=fields', {}));
  await settle();

  /* ---- 10. se cae a la mitad de aplicar el diario: reanuda sin duplicar ---- */
  neonDown(); R.trip(new Error('down'));
  const k1 = await req(() => post('Orders', { OrderID: 'GS-10-1', Status: 'Submitted' }));
  await req(() => patch('Orders', k1.out.id, { Notes: 'n1' }));
  const k2 = await req(() => post('Orders', { OrderID: 'GS-10-2', Status: 'Submitted' }));
  await req(() => patch('Orders', k2.out.id, { Notes: 'n2' }));
  await settle();
  await up();
  let applies = 0;
  S.failOn = t => /insert into "_sql_journal"/.test(t) && ++applies === 3;
  sp.failJournalPatch = 1; /* y el primero no se puede marcar en SharePoint */
  const half = await J.apply({ sql, graphFetch: sp.fetch, site: '/sites/h:/s:' });
  R._resetBreaker();
  const mid = (await raw("select count(*)::int n from \"Orders\" where \"OrderID\" like 'GS-10-%'"))[0].n;
  check('apply stops when SQL falls in the middle (2 of 4 applied)', half.waiting === 'down' && mid === 1, { half, mid });
  const again = await J.apply({ sql, graphFetch: sp.fetch, site: '/sites/h:/s:' });
  const rows10 = await raw("select * from \"Orders\" where \"OrderID\" like 'GS-10-%' order by id");
  check('apply again: continues where it was, nothing twice (2 orders, each with its note)', rows10.length === 2 && rows10[0].Notes === 'n1' && rows10[1].Notes === 'n2' &&
    journal().every(x => x.State === 'applied' || x.State === 'skipped'), { again, rows10: rows10.map(r => [r.id, r.OrderID, r.Notes]) });
  check('the entry that could not be marked in SharePoint is not applied twice (its key in SQL)', (await raw('select count(*)::int n from "_sql_journal"'))[0].n === journal().length);

  /* ---- 11. SQL guardo pero la respuesta se perdio: SharePoint + diario, y al volver no queda doble ---- */
  R._resetBreaker();
  S.loseAnswerOn = t => /^with seq as/.test(t);
  const lost = await req(() => post('Orders', { OrderID: 'GS-11-1', Status: 'Submitted' }));
  await settle();
  check('answer lost: the person still gets "Saved" (from SharePoint, with the journal)', lost.out && Number(lost.out.id) < SF.ID_MIN && lost.info.data === 'sharepoint', lost);
  await up();
  await J.apply({ sql, graphFetch: sp.fetch, site: '/sites/h:/s:' });
  await due(); await drain(); await settle();
  const r11 = await raw("select id, sp_id from \"Orders\" where \"OrderID\" = 'GS-11-1'");
  const sp11 = Object.values(sp.lists.Orders).filter(x => x.fields.OrderID === 'GS-11-1');
  check('...one row in SQL (linked to the SharePoint id) and one in SharePoint', r11.length === 1 && Number(r11[0].sp_id) === Number(lost.out.id) && sp11.length === 1, { r11, sp11: sp11.map(x => x.id) });

  /* ---- 12. pending de hace mas de 2 min (el guardado murio): se ve en SharePoint ---- */
  neonDown(); R.trip(new Error('down'));
  const jx = await J.record(sp.fetch, '/sites/h:/s:', { op: 'update', list: 'Orders', id: '41', fields: { Notes: 'never reached SharePoint' }, state: 'pending' });
  sp.lists[J.LIST][jx.jid].fields.At = new Date(Date.now() - 3 * 60000).toISOString();
  await up();
  await J.apply({ sql, graphFetch: sp.fetch, site: '/sites/h:/s:' });
  const e12 = sp.lists[J.LIST][jx.jid].fields;
  check('an old "pending" whose save never reached SharePoint: skipped with its reason, not applied', e12.State === 'skipped' && /did not go through/.test(e12.Note) && (await row('Orders', 41)).Notes !== 'never reached SharePoint', e12);

  /* ---- 12b. Neon caido y SharePoint guardo pero su respuesta se perdio (504): no se pierde ---- */
  neonDown(); R.trip(new Error('down'));
  sp.loseNextCreate = 'Orders';
  const lostSp = await req(() => post('Orders', { OrderID: 'GS-12-9', Status: 'Submitted' }));
  await settle();
  const jLost = journal().slice(-1)[0];
  check('SharePoint answer lost during the outage: the person sees it was not saved, the journal entry stays pending (not dropped)', lostSp.err && lostSp.err.code === 'bothDown' && jLost.State === 'pending', { e: lostSp.err && lostSp.err.message, jLost });
  jLost.At = new Date(Date.now() - 3 * 60000).toISOString();
  await up();
  await J.apply({ sql, graphFetch: sp.fetch, site: '/sites/h:/s:' });
  const r12 = await raw("select id, sp_id from \"Orders\" where \"OrderID\" = 'GS-12-9'");
  check('...when SQL is back the journal finds it in SharePoint and SQL gets it too (same id)', r12.length === 1 && Number(r12[0].id) === Number(r12[0].sp_id) && journal().slice(-1)[0].State === 'applied', { r12, j: journal().slice(-1)[0] });

  /* ---- 12c. create con la respuesta perdida en una lista con mucho movimiento (como NotificationLog en el e2e del 12/11):
     mas de 200 renglones nuevos antes que el suyo -> se busca en todas las paginas y SQL lo recibe ---- */
  neonDown(); R.trip(new Error('down'));
  for (let i = 0; i < 260; i++) await sp.fetch(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-BUSY-' + i, Status: 'Noise' } }) });
  sp.loseNextCreate = 'Orders';
  const busy = await req(() => post('Orders', { OrderID: 'GS-12-BUSY', Status: 'Submitted' }));
  await settle();
  /* y otro que SI salio pero su marca "done" no se pudo poner (dos veces): tambien queda pending */
  sp.failJournalPatch = 2;
  const busy2 = await req(() => post('Orders', { OrderID: 'GS-12-BUSY2', Status: 'Submitted' }));
  await settle();
  const jb2 = journal().slice(-2);
  check('lost answer and an unmarked create in a busy list: both stay pending (nothing dropped)', busy.err && !busy2.err && jb2.every(x => x.State === 'pending'), jb2.map(x => x.State + ':' + x.Note));
  for (const x of jb2) x.At = new Date(Date.now() - 3 * 60000).toISOString();
  await up();
  const calls0 = sp.calls.length;
  const ap = await J.apply({ sql, graphFetch: sp.fetch, site: '/sites/h:/s:' });
  const rb1 = await raw("select id, sp_id from \"Orders\" where \"OrderID\" in ('GS-12-BUSY', 'GS-12-BUSY2') order by \"OrderID\"");
  check('...found in SharePoint reading every page (more than 200 new rows before it): both reach SQL with their SharePoint id',
    rb1.length === 2 && rb1.every(r => Number(r.id) === Number(r.sp_id)) && journal().slice(-2).every(x => x.State === 'applied') && sp.calls.slice(calls0).some(c => /skiptoken/.test(c)),
    { ap, rb1, j: journal().slice(-2).map(x => x.State + ':' + x.Note) });
  await raw("delete from \"Orders\" where \"OrderID\" like 'GS-BUSY-%'");
  for (const id of Object.keys(sp.lists.Orders)) if (/^GS-BUSY-/.test(sp.lists.Orders[id].fields.OrderID || '')) delete sp.lists.Orders[id];
  /* respuesta cortada (504) y de verdad NO quedo: se salta con su porque y con aviso (no en silencio) */
  neonDown(); R.trip(new Error('down'));
  const jl = await J.record(sp.fetch, '/sites/h:/s:', { op: 'create', list: 'Orders', fields: { OrderID: 'GS-12-NEVER' }, state: 'pending' });
  await J.mark(sp.fetch, '/sites/h:/s:', jl.jid, { Note: 'SharePoint did not answer (504): Gateway Timeout' });
  sp.lists[J.LIST][jl.jid].fields.At = new Date(Date.now() - 3 * 60000).toISOString();
  await up();
  const ap2 = await J.apply({ sql, graphFetch: sp.fetch, site: '/sites/h:/s:' });
  const pr = await raw('select "problem" from "_sql_journal" where "k" = $1', [jl.key]);
  check('a cut answer (504) that really did not reach SharePoint: skipped with its reason AND kept for the error alert', sp.lists[J.LIST][jl.jid].fields.State === 'skipped' && pr[0] && /not found/.test(pr[0].problem), { ap2, pr });
  await raw('update "_sql_journal" set "alerted_at" = now() where "k" = $1', [jl.key]);

  /* ---- 13. lo que no se puede pasar: se anota y el cron avisa una vez ---- */
  neonDown(); R.trip(new Error('down'));
  await J.record(sp.fetch, '/sites/h:/s:', { op: 'update', list: 'Orders', id: '999', fields: { Notes: 'row nobody has' }, state: 'done' });
  await up();
  const alerts = [];
  const cr = await SF.cron({ sql, graphFetch: sp.fetch, listPath: l => P(l), alert: a => { alerts.push(a); } });
  const cr2 = await SF.cron({ sql, graphFetch: sp.fetch, listPath: l => P(l), alert: a => { alerts.push(a); } });
  check('a journal entry that cannot be applied: noted and the error alert goes once (cron)', alerts.length === 1 && /could not be applied/.test(alerts[0].error) && /#999/.test(alerts[0].error) && cr.journalAlerted === 1 && !cr2.journalAlerted, { alerts, cr });

  /* ---- 14. el header de la respuesta (lib/vercel-adapter) ---- */
  const adapter = require('./vercel-adapter')('Admin', () => ({}));
  const fakeRes = () => { const h = {}; return { h, setHeader: (k, v) => { h[k] = v; }, status() { return this; }, send() { return this; }, json() { return this; } }; };
  neonDown(); R.trip(new Error('down'));
  const resA = fakeRes();
  await R.context({ background: false }, () => adapter.toVercel(async () => { await g(P('Orders') + '?$expand=fields', {}); return { statusCode: 200, body: '{}' }; })({ method: 'GET', url: '/api/x', headers: {} }, resA));
  sp.down = true;
  const resB = fakeRes();
  await R.context({ background: false }, () => adapter.toVercel(async () => { try { await patch('Orders', 41, { Status: 'q' }); } catch (e) { return { statusCode: 503, body: JSON.stringify({ error: e.message, code: e.code }) }; } return { statusCode: 200, body: '{}' }; })({ method: 'POST', url: '/api/y', headers: {} }, resB));
  sp.down = false;
  await up();
  const resC = fakeRes();
  await R.context({ background: false }, () => adapter.toVercel(async () => { await g(P('Orders', '/41') + '?$expand=fields', {}); return { statusCode: 200, body: '{}' }; })({ method: 'GET', url: '/api/z', headers: {} }, resC));
  await settle();
  const resD = fakeRes();
  await R.context({ background: false }, () => adapter.toVercel(async () => { await g(P('Orders', '/41') + '?$expand=fields', {}); return { statusCode: 200, body: '{}' }; })({ method: 'GET', url: '/api/z', headers: {} }, resD));
  const resE = fakeRes();
  await R.context({ background: false }, () => adapter.toVercel(async () => ({ statusCode: 200, body: '{}' }))({ method: 'GET', url: '/api/w', headers: {} }, resE));
  check('response headers: sharepoint while Neon is down, down + X-GS-Replay with both down, sql when it is back, none when no list was touched',
    resA.h['X-GS-Data'] === 'sharepoint' && resB.h['X-GS-Data'] === 'down' && resB.h['X-GS-Replay'] === '1' && resD.h['X-GS-Data'] === 'sql' && !resE.h['X-GS-Data'],
    { A: resA.h, B: resB.h, C: resC.h, D: resD.h, E: resE.h });

  /* ---- 15. con el switch en sharepoint nada cambia ---- */
  neonDown(); R.trip(new Error('down')); sp.calls = [];
  const gOff = M.wrap(sp.fetch, { sql, writeMode: {}, mode: 'sharepoint' });
  const off1 = await R.context({}, async () => { const r = await gOff(P('Settings'), { method: 'POST', body: JSON.stringify({ fields: { Key: 'k', Value: 'v' } }) }); return { r, info: Object.assign({}, R.reqInfo()) }; });
  await settle();
  check('switch in sharepoint: saved in SharePoint like today, no journal, no header', off1.r.id && !off1.info.data && !sp.calls.some(c => /SqlOutageLog/.test(c)), { info: off1.info, calls: sp.calls });
  await up();

  console.error = quiet;
  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  if (fail) { console.log('log:\n  ' + logs.slice(-40).join('\n  ')); process.exit(1); }
})().catch(e => { console.error = quiet; console.error(e); process.exit(1); });
