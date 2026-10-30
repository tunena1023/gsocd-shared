/* lib/recurring-published.js: node lib/recurring-published.test.js -- las 3 audiencias con un SharePoint falso. */
'use strict';
let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const RS = [{ id: '10', fields: { ClientID: 'GS-1', Published: false } }, { id: '11', fields: { ClientID: 'GS-1' } }, { id: '12', fields: { ClientID: "GS-O'1" } }];
let down = false, reads = 0;
const g = {
  RECURRING_SERVICES_LIST: 'RecurringServices', ORDERS_LIST: 'Orders',
  siteListPath: l => 'list:' + l,
  graphFetch: async url => {
    reads++;
    if (down) throw new Error('503 Service Unavailable');
    const one = /^list:RecurringServices\/([^/?]+)\?\$expand=fields$/.exec(url);
    if (one) { const it = RS.find(x => x.id === decodeURIComponent(one[1])); if (!it) { const e = new Error('404 itemNotFound'); e.status = 404; throw e; } return it; }
    const f = /\$filter=([^&]+)/.exec(url);
    const m = f && /^fields\/ClientID eq '((?:[^']|'')*)'$/.exec(decodeURIComponent(f[1]));
    if (f && !m) throw new Error('400 bad filter');
    return { value: m ? RS.filter(r => r.fields.ClientID === m[1].replace(/''/g, "'")) : RS };
  },
  queryList: async () => [{ fields: { OrderID: 'GS-1-REC1', RecurringServiceID: '10' } }]
};
const lq = { fetchAllCached: async () => { if (down) throw new Error('503'); return RS; }, fetchByValues: async (l, f, vals) => { if (down) throw new Error('503'); return RS.filter(r => vals.includes(r.fields.ClientID)); } };
const make = audience => require('./recurring-published')(g, () => lq, { audience });
const visit = (rc, st) => ({ OrderID: 'x-REC1', RecurringServiceID: rc, Status: st || 'Assigned' });
(async () => {
  const office = make('office'), client = make('client'), tech = make('tech');
  check('empty Published = published; only No hides', office.isPublished({}) && !office.isPublished({ Published: 'No' }) && !office.isPublished({ Published: false }));
  for (const [name, p] of [['office', office], ['client', client], ['tech', tech]]) {
    const h = await p.hiddenAll();
    check(name + ': unpublished visit hidden, published shows', p.hiddenOrder(h, visit('10')) && !p.hiddenOrder(h, visit('11')));
    check(name + ': deleted contract hides open visits, Completed still shows', p.hiddenOrder(h, visit('999')) && !p.hiddenOrder(h, visit('999', 'Completed')));
    check(name + ': non-REC order never hidden', !p.hiddenOrder(h, { OrderID: 'GS-1-5' }));
  }
  const hc = await client.hiddenForClient("GS-O'1");
  check("client: a ClientID with an apostrophe is escaped and found", hc.known.has('12') && hc.ok, [...hc.known]);
  const many = await client.hiddenForClients(['GS-1', 'gs-1']);
  check('client: several properties in one read, by lower-case id', many['gs-1'] && many['gs-1'].has('10'));
  check('client: an internal inspection (HiddenFromClient) is hidden; office still sees it', client.hiddenOrder(await client.hiddenAll(), { HiddenFromClient: 'Yes' }) && !office.hiddenOrder(await office.hiddenAll(), { HiddenFromClient: 'Yes' }));

  down = true;
  let e1 = null, e2 = null, e3 = null;
  try { await client.hiddenForClient('GS-1'); } catch (e) { e1 = e; }
  try { await tech.hiddenAll(); } catch (e) { e2 = e; }
  try { await make('client').hiddenForClients(['GS-9']); } catch (e) { e3 = e; }
  check('client: contracts unreadable -> 503 error (screen keeps last view and retries), never a silent short list', e1 && e1.status === 503 && e1.code === 'CONTRACTS_UNAVAILABLE', e1 && e1.message);
  check('tech: same', e2 && e2.status === 503);
  check('client (many): same', e3 && e3.status === 503);
  const warn = console.warn; const warned = []; console.warn = m => warned.push(m);
  const ho = await make('office').hiddenAll();
  console.warn = warn;
  check('office: contracts unreadable -> nothing hidden (the office sees its visits) and it is logged', ho.ok === false && !office.hiddenOrder(ho, visit('10')) && !office.hiddenOrder(ho, visit('999')) && warned.length === 1, warned);
  let e4 = null; try { client.hiddenOrder({ has: () => false, ok: false }, visit('11')); } catch (e) { e4 = e; }
  check('client: hiddenOrder with an unread list throws too', e4 && e4.status === 503);
  check('isContractPublished: unreadable = not published (no email goes out)', (await make('office').isContractPublished('11')) === false);
  check('contractState: unreadable = error (not "unpublished")', (await make('office').contractState('11')) === 'error');
  down = false;
  check('contractState: 404 = unpublished', (await office.contractState('404')) === 'unpublished');
  reads = 0; await office.isContractPublished('11'); await office.isContractPublished('11');
  check('isContractPublished: short cache', reads === 1);
  office.forget('11'); await office.isContractPublished('11');
  check('forget: reads again', reads === 2);
  check('contractIdOf: by order, by contractId, by REC OrderID', (await office.contractIdOf({ contractId: 7 })) === '7' && (await office.contractIdOf({ order: { RecurringServiceID: 8 } })) === '8' && (await office.contractIdOf({ orderId: 'GS-1-REC1' })) === '10' && (await office.contractIdOf({ orderId: 'GS-1-5' })) === '');
  let bad = null; try { require('./recurring-published')(g, lq, { audience: 'x' }); } catch (e) { bad = e; }
  check('unknown audience is refused', !!bad);
  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
