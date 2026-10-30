/* lib/site-image.js: node lib/site-image.test.js -- con un drive falso. */
'use strict';
let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const files = {
  'Logo.jpg': { id: 'logo', name: 'Logo.jpg', size: 10 },
  'secret.pdf': { id: 'pdf', name: 'secret.pdf', size: 10 },
  'Warehouse/Items/J-001-a.jpg': { id: 'sup', name: 'J-001-a.jpg', size: 10 }
};
const folders = {
  'Assets/CategoryImages': [{ id: 'cat', name: 'Kitchen-Image.png', size: 10, isFile: true }],
  'Assets/Services': [{ id: 'svc', name: 'Kitchen-Stove.jpg', size: 10, isFile: true }],
  'Assets/Services/Kitchen': [{ id: 'g1', name: 'b.jpg', size: 10, isFile: true }, { id: 'g2', name: 'a.png', size: 10, isFile: true }, { id: 'big', name: 'c.jpg', size: 9e6, isFile: true }]
};
let lists = 0;
const g = {
  PATHS: { categoryImages: 'Assets/CategoryImages', servicesImages: 'Assets/Services' },
  jsonResponse: (statusCode, b) => ({ statusCode, body: JSON.stringify(b) }),
  driveItemByPath: async p => files[p] || null,
  listChildren: async p => { lists++; return folders[p] || []; },
  findByPrefix: async (p, pre) => (folders[p] || []).find(k => k.name.toLowerCase().startsWith(pre.toLowerCase())) || null,
  findByName: async (p, n) => (folders[p] || []).find(k => k.name.toLowerCase().replace(/\.[^.]+$/, '') === n.toLowerCase()) || null,
  downloadById: async id => Buffer.from('img-' + id)
};
const get = (h, q) => h.handler({ httpMethod: 'GET', queryStringParameters: q });
const body = r => Buffer.from(r.body, 'base64').toString();
(async () => {
  const admin = require('./site-image')(g, { supply: true });
  const orders = require('./site-image')(g);
  const tech = require('./site-image')(g, { modes: ['name'], maxAge: 600 });
  let r = await get(orders, { name: 'Logo.jpg' });
  check('name: root image', r.statusCode === 200 && body(r) === 'img-logo' && r.headers['Content-Type'] === 'image/jpeg' && /max-age=300/.test(r.headers['Cache-Control']), r);
  check('name: not an image (PDF) is not served', (await get(orders, { name: 'secret.pdf' })).statusCode === 404);
  check('a path (../, /) is never followed', (await get(orders, { name: '../Orders/x.jpg' })).statusCode === 404 && (await get(orders, { gallery: 'Kitchen', file: 'a/b.jpg' })).statusCode === 404);
  r = await get(orders, { cat: 'kitchen' });
  check('cat: by prefix', r.statusCode === 200 && body(r) === 'img-cat');
  r = await get(orders, { svc: 'Kitchen-Stove' });
  check('svc: by name without extension', r.statusCode === 200 && body(r) === 'img-svc');
  r = await get(orders, { 'gallery-list': 'Kitchen' });
  check('gallery-list: sorted images under the size limit', r.statusCode === 200 && JSON.parse(r.body).files.join() === 'a.png,b.jpg', r.body);
  const before = lists; await get(orders, { gallery: 'Kitchen', file: 'B.JPG' });
  check('gallery: same folder listing is cached', lists === before);
  check('gallery: photo over 4.5 MB not sent', (await get(orders, { gallery: 'Kitchen', file: 'c.jpg' })).statusCode === 404);
  r = await get(admin, { supply: 'J-001-a.jpg' });
  check('supply: Admin serves warehouse item photos', r.statusCode === 200 && body(r) === 'img-sup');
  check('supply: Orders does not', (await get(orders, { supply: 'J-001-a.jpg' })).statusCode === 400);
  r = await get(tech, { name: 'Logo.jpg' });
  check('Tech: name only, 10 min cache', r.statusCode === 200 && /max-age=600/.test(r.headers['Cache-Control']));
  check('Tech: no category images', (await get(tech, { cat: 'Kitchen' })).statusCode === 400);
  check('POST: 405', (await orders.handler({ httpMethod: 'POST', queryStringParameters: {} })).statusCode === 405);
  const broken = require('./site-image')(Object.assign({}, g, { driveItemByPath: async () => { throw new Error('503'); } }));
  check('SharePoint fails: 500 (not a fake 404)', (await get(broken, { name: 'Logo.jpg' })).statusCode === 500);
  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
