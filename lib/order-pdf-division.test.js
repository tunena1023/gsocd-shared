/* node lib/order-pdf-division.test.js -- el PDF de la orden lista los servicios Renovations, Janitorial, Exteriors
   (CFO 16/11/2026); sin catalogo, como vienen. */
'use strict';
const fakeGraph = { graphFetch: async () => ({ value: [] }), siteListPath: l => 'list:' + l, ORDERS_LIST: 'Orders' };
const P = require('./order-pdf')(fakeGraph);
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 400) : '')); } };
const svc = (n, sku) => ({ Category: 'Commercial', ServiceName: n, SubOption: sku, Division: 'Mixed' });
const services = [svc('Zgutter', '333-10'), svc('Yrestroom', '111-13'), svc('Xprime', '222-52'), svc('Wmanual', 'X-1'), svc('Vsweep', '111-58')];
const divisions = { '333-10': 'Exteriors', '111-13': 'Janitorial', '222-52': 'Renovations', '111-58': 'Janitorial' };
const order = { OrderID: 'GS-1-1', ClientID: 'GS-1', BusinessName: 'Test', Status: 'Assigned', Division: 'Mixed' };
const textOf = buf => buf.toString('latin1');
const pos = (t, n) => t.indexOf(n);
const t1 = textOf(P.buildOrderPdf({ order, services, history: [], divisions }));
const want = ['Xprime', 'Yrestroom', 'Vsweep', 'Zgutter', 'Wmanual'];
const at = want.map(n => pos(t1, n));
check('order PDF: Renovations, Janitorial, Exteriors, then no match', at.every(p => p >= 0) && at.every((p, i) => i === 0 || p > at[i - 1]), at);
const t2 = textOf(P.buildOrderPdf({ order, services, history: [] }));
const at2 = services.map(s => pos(t2, s.ServiceName));
check('without the catalog the PDF keeps the order they came in', at2.every(p => p >= 0) && at2.every((p, i) => i === 0 || p > at2[i - 1]), at2);
const t3 = textOf(P.buildCompletionPdf({ order: Object.assign({}, order, { Status: 'Completed' }), services, history: [], divisions, photos: [] }));
const at3 = want.map(n => pos(t3, n));
check('completion PDF: same order', at3.every(p => p >= 0) && at3.every((p, i) => i === 0 || p > at3[i - 1]), at3);
console.log('\n' + ok + ' ok, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
