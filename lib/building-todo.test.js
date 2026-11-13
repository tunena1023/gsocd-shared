/* lib/building-todo: la direccion de una orden que no es de ningun edificio del cliente queda como edificio por completar.
   Correr: node lib/building-todo.test.js */
'use strict';
const T = require('./building-todo');
let ok = 0, bad = 0;
const check = (name, cond, x) => { if (cond) { ok++; console.log('OK   - ' + name); } else { bad++; console.log('FAIL - ' + name + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 500) : '')); } };

/* SharePoint de mentiras: listas en memoria, $filter "fields/X eq 'v'", fallas a proposito. */
function fakeG() {
  const L = { Orders: [], Clients: [], ClientAddresses: [] };
  let next = 100;
  const fails = { create: 0, read: 0, lostReply: 0, del: 0 };
  const g = {
    L, fails, ORDERS_LIST: 'Orders', CLIENTS_LIST: 'Clients', CLIENT_ADDRESSES_LIST: 'ClientAddresses',
    siteListPath: l => '/lists/' + l + '/items',
    graphFetch: async url => {
      await new Promise(r => setImmediate(r));
      if (fails.read > 0) { fails.read--; throw new Error('503 Service Unavailable'); }
      const m = /\/lists\/(\w+)\/items/.exec(url), list = m[1];
      const f = /\$filter=([^&]+)/.exec(url);
      let rows = L[list];
      if (f) { const fm = /fields\/(\w+) eq '(.*)'/.exec(decodeURIComponent(f[1])); rows = rows.filter(it => String(it.fields[fm[1]] == null ? '' : it.fields[fm[1]]) === fm[2].replace(/''/g, "'")); }
      return { value: rows.map(it => ({ id: it.id, fields: Object.assign({}, it.fields) })) };
    },
    createListItem: async (list, fields) => {
      await new Promise(r => setImmediate(r));
      if (fails.create > 0) { fails.create--; throw new Error('500 fake'); }
      const it = { id: String(++next), fields: Object.assign({}, fields) };
      L[list].push(it);
      if (fails.lostReply > 0) { fails.lostReply--; throw new Error('504 Gateway Timeout'); }
      return it;
    },
    deleteListItem: async (list, id) => { if (fails.del > 0) { fails.del--; throw new Error('500 fake'); } L[list] = L[list].filter(it => it.id !== String(id)); }
  };
  return g;
}
const add = (g, list, fields) => { const it = { id: String(Object.values(g.L).flat().length + 1), fields }; g.L[list].push(it); return it; };

(async () => {
  /* ---- Reglas ---- */
  const client = { ClientID: 'GS-1028', Address: '1806 28th Ave SW', City: 'Altoona', Zip: '50009' };
  const addrs = [{ id: '7', fields: { ClientID: 'GS-1028', Address: '2618 28th Ave SW', City: 'Altoona', Zip: '50009' } },
    { id: '8', fields: { ClientID: 'GS-1028', Address: '500 Old Rd', City: 'Altoona', Zip: '50009', Archived: true } }];
  const o = f => Object.assign({ OrderID: 'GS-1028-1249', ClientID: 'GS-1028', Status: 'Received', Address: '1649 26th Ave SW', City: 'Altoona', Zip: '50009' }, f);
  let f = T.todoFor(client, addrs, o());
  check('Order at 1649 26th Ave SW (not the primary, not a building): a building to complete, address as typed', f && f.Address === '1649 26th Ave SW' && f.City === 'Altoona' && f.Zip === '50009' && f.NeedsInfo === 'GS-1028-1249' && f.Label === '1649 26th Ave SW' && f.BuildingNumber === '', f);
  check('The primary (other case, suite, zip+4): nothing', T.todoFor(client, addrs, o({ Address: '1806 28TH AVE SW', Suite: 'Apt 4', Zip: '50009-1234' })) === null);
  check('A saved building: nothing', T.todoFor(client, addrs, o({ Address: '2618 28th Ave SW' })) === null);
  check('An ARCHIVED building with that address: nothing (archived = not applicable)', T.todoFor(client, addrs, o({ Address: '500 Old Rd' })) === null);
  check('Same street, other city: a building', !!T.todoFor(client, addrs, o({ Address: '2618 28th Ave SW', City: 'Ankeny' })));
  check('Recurring visit: nothing', T.todoFor(client, addrs, o({ RecurringServiceID: '163' })) === null);
  check('No address: nothing', T.todoFor(client, addrs, o({ Address: '' })) === null);
  check('Other client: nothing', T.todoFor({ ClientID: 'GS-1099' }, addrs, o()) === null);
  check('Keeps the map point of the order', T.todoFor(client, addrs, o({ Latitude: 41.63, Longitude: -93.49 })).Latitude === 41.63);
  check('Open = not Completed/Cancelled/Archived', T.isOpen({ Status: 'Received' }) && !T.isOpen({ Status: 'Completed' }) && !T.isOpen({ Status: 'Assigned', Archived: true }));

  /* ---- ensure ---- */
  let g = fakeG();
  add(g, 'Clients', client); add(g, 'ClientAddresses', addrs[0].fields);
  add(g, 'Orders', o()); add(g, 'Orders', o({ OrderID: 'GS-1028-1250' }));
  let r = await T.ensure(g, 'GS-1028-1249');
  const nb = () => g.L.ClientAddresses.filter(it => it.fields.Address === '1649 26th Ave SW');
  check('ensure: creates it once', r.created && nb().length === 1, r);
  r = await T.ensure(g, 'GS-1028-1249');
  check('ensure again (retry): nothing new', !r.created && nb().length === 1, r);
  r = await T.ensure(g, 'GS-1028-1250');
  check('Another order, same address: the same building (one)', !r.created && nb().length === 1, r);
  check('The order is never changed', g.L.Orders[0].fields.Address === '1649 26th Ave SW' && Object.keys(g.L.Orders[0].fields).length === 6);

  g = fakeG(); add(g, 'Clients', client); add(g, 'Orders', o()); add(g, 'Orders', o({ OrderID: 'GS-1028-1250' }));
  const both = await Promise.all([T.ensure(g, 'GS-1028-1249'), T.ensure(g, 'GS-1028-1250')]);
  check('Double click / two at once: ONE building stays (the smaller id)', nb().length === 1 && both.filter(x => x.created).length === 1, { both, n: nb().length });

  g = fakeG(); add(g, 'Clients', client); add(g, 'Orders', o());
  g.fails.create = 1;
  let threw = ''; try { await T.ensure(g, 'GS-1028-1249'); } catch (e) { threw = e.message; }
  check('Create fails: error (the caller logs it), nothing saved', /500/.test(threw) && nb().length === 0);
  r = await T.ensure(g, 'GS-1028-1249');
  check('...retry: created', r.created && nb().length === 1);
  g = fakeG(); add(g, 'Clients', client); add(g, 'Orders', o());
  g.fails.lostReply = 1;
  try { await T.ensure(g, 'GS-1028-1249'); } catch (e) { threw = e.message; }
  r = await T.ensure(g, 'GS-1028-1249');
  check('Saved but the reply was lost: the retry sees it (still ONE)', nb().length === 1 && !r.created, r);
  g = fakeG(); add(g, 'Clients', client); add(g, 'Orders', o());
  g.fails.read = 1;
  r = await T.afterSubmit(g, { statusCode: 200, body: JSON.stringify({ success: true, orderId: 'GS-1028-1249' }) });
  check('Microsoft 503 while reading: afterSubmit never throws (the order is already saved); nightly sweep covers it', Array.isArray(r) && nb().length === 0);

  /* ---- afterSubmit ---- */
  g = fakeG(); add(g, 'Clients', client);
  ['GS-1028-1300-PO1', 'GS-1028-1301-PO1'].forEach(id => add(g, 'Orders', o({ OrderID: id, Address: '77 New Ln' })));
  r = await T.afterSubmit(g, { statusCode: 200, body: JSON.stringify({ success: true, orderIds: ['GS-1028-1300-PO1', 'GS-1028-1301-PO1'] }) });
  check('A lot of 2 units at a new address: one building', g.L.ClientAddresses.filter(it => it.fields.Address === '77 New Ln').length === 1 && r.length === 2, r);
  r = await T.afterSubmit(g, { statusCode: 400, body: JSON.stringify({ error: 'x' }) });
  check('A rejected order (400): nothing', r.length === 0);
  r = await T.afterSubmit(g, { statusCode: 200, body: 'not json' });
  check('A reply that is not JSON: nothing, no error', r.length === 0);

  /* ---- Texto libre (el Edit de la orden: Address en un solo campo) ---- */
  const free = t => o({ Address: t, City: '', Zip: '', Suite: '' });
  f = T.todoFor(client, addrs, free('1649 26th Ave. SW Altoona IA 50009'));
  check('Free text without commas: street, city and zip separated; the text as typed in NeedsInfo', f && f.Address === '1649 26th Ave. SW' && f.City === 'Altoona' && f.Zip === '50009' && f.NeedsInfo === 'GS-1028-1249 | 1649 26th Ave. SW Altoona IA 50009', f);
  check('Free text of a saved building ("2618 28th Ave. SW, Altoona, IA 50009"): nothing', T.todoFor(client, addrs, free('2618 28th Ave. SW, Altoona, IA 50009')) === null);
  check('Free text of the primary, only the street ("1806 28th ave sw"): nothing', T.todoFor(client, addrs, free('1806 28th ave sw')) === null);
  f = T.todoFor(client, addrs, free('1649 26th Ave SW'));
  check('Free text with no city or zip: suggested anyway, city and zip empty (Clients marks them missing)', f && f.Address === '1649 26th Ave SW' && f.City === '' && f.Zip === '', f);
  f = T.todoFor(client, addrs, free('Behind the leasing office'));
  check('Text that is not an address: suggested as typed (someone completes it in Clients)', f && f.Address === 'Behind the leasing office' && f.NeedsInfo === 'GS-1028-1249 | Behind the leasing office', f);
  check('orderOf("GS-1 | text") = GS-1', T.orderOf('GS-1 | text') === 'GS-1' && T.orderOf('GS-2') === 'GS-2');
  g = fakeG(); add(g, 'Clients', client);
  add(g, 'Orders', free('1649 26th Ave. SW, Altoona, IA 50009')); add(g, 'Orders', Object.assign(free('1649 26th Ave SW Altoona 50009'), { OrderID: 'GS-1028-1250' }));
  await T.ensure(g, 'GS-1028-1249'); await T.ensure(g, 'GS-1028-1250');
  check('"26th Ave. SW" and "26th Ave SW" written differently: ONE building', g.L.ClientAddresses.length === 1, g.L.ClientAddresses.map(x => x.fields.Address));

  /* ---- sweep ---- */
  g = fakeG(); add(g, 'Clients', client); add(g, 'ClientAddresses', addrs[0].fields);
  add(g, 'Orders', o({ OrderID: 'A1' })); add(g, 'Orders', o({ OrderID: 'A2', Address: '2618 28th Ave SW' }));
  add(g, 'Orders', o({ OrderID: 'A3', Address: '9 Done St', Status: 'Completed' })); add(g, 'Orders', o({ OrderID: 'A4', Address: '9 Gone St', Status: 'Cancelled' }));
  add(g, 'Orders', o({ OrderID: 'A5', Address: '1649 26th Ave SW' })); add(g, 'Orders', o({ OrderID: 'A6', Address: '12 Rec St', RecurringServiceID: '9' }));
  r = await T.sweep(g);
  check('Sweep of the open orders: 1 new building (1649 for A1 and A5), closed/recurring ignored', r.created.length === 1 && r.created[0].orderId === 'A1' && g.L.ClientAddresses.length === 2 && r.checked === 3, r);
  r = await T.sweep(g);
  check('Sweep again: nothing new', r.created.length === 0 && g.L.ClientAddresses.length === 2, r);

  console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
