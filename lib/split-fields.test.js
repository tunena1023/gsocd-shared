/* node lib/split-fields.test.js -- lib/fields.js y lib/split-fields.js con los casos de produccion del 21/10/2026
   (Cintas y Perennial, tal cual) y los de la regla de un dato por campo. */
'use strict';
const F = require('./fields'), S = require('./split-fields');
let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 500) : '')); } };

/* ---- fields ---- */
check('email: one is fine', F.email('kriegers@cintas.com') === '');
check('email: two (comma, semicolon, space, &, and) -> one address only', ['a@x.com, b@y.com', 'a@x.com;b@y.com', 'a@x.com b@y.com', 'a@x.com & b@y.com', 'a@x.com and b@y.com'].every(v => F.email(v) === 'Email: one address only.'));
check('email: not valid', F.email('megan at cintas') === 'Email: one address only.' && F.email('megan@cintas') === 'Email: not a valid address.');
check('person name: one person fine (Mary-Jane too)', F.personName('Sarah Krieger') === '' && F.personName('Mary-Jane O\'Neil') === '');
check('person name: two people / phone / & -> one person only', ['Megan & Sarah', 'Megan / Sarah', 'Steven or Jordan', 'Tom 515-555-0177'].every(v => F.personName(v) === 'Name: one person only, no phone numbers.'));
check('person name: job in the name -> put it in Role', F.personName('Sarah Krieger- Service Mgr') === 'Name: only the person (put the job in Role).');
check('business name: & is fine (CFO 21/10), phone or email is not', F.businessName('D&K Products') === '' && F.businessName('Firestone 515-412-4020') !== '' && F.businessName('Firestone / Heartland') !== '');
check('address: one is fine; two (& / ; and) -> one address only', F.address('1039 19th St') === '' && F.address('100 Main St & 200 Oak Ave') !== '' && F.address('100 Main St; 200 Oak Ave') !== '');
check('emailsIn finds each email in order', JSON.stringify(F.emailsIn('a@x.com; b@y.com')) === '["a@x.com","b@y.com"]');

/* ---- split-fields: Cintas (captura de la CFO) ---- */
const contacts = [
  { id: '1', name: 'Firestone', type: 'Phone', value: 'Customer contact- Megan 515-412-4020 Cintas contact- Sarah 815-573-3768' },
  { id: '7', name: 'Pump N Pantry', type: 'Phone', value: 'Customer contact- Steven or Jordan 55-705-0765 Cintas contact- Sarah 815-573-3768' },
  { id: '8', name: 'Sarah Krieger- Service Mgr', type: 'Email', value: 'kriegers@cintas.com', phone: '815-573-3768' },
  { id: '9', name: 'St. Joseph Catholic Scholl', type: 'Phone', value: 'Lease 515-266-3433' },
  { id: '4', name: 'Junior Achievers', type: 'Phone', value: 'Customer contact- Kelsie 515-513-4384' }
];
const ctx = { contacts, primaryName: 'Sarah Krieger', buildings: [{ id: 'b1', label: 'Firestone' }, { id: 'b7', label: 'Pump N Pantry' }, { id: 'b9', label: 'St. Joseph Catholic Scholl' }, { id: 'b4', label: 'Junior Achievers' }] };
let r = S.proposeContact(contacts[0], ctx);
check('Firestone: Megan (Customer contact, 5154124020, Firestone) + Sarah = Sarah Krieger (same phone); ready',
  r.ready && r.parts.length === 2 && r.parts[0].kind === 'person' && r.parts[0].name === 'Megan' && r.parts[0].role === 'Customer contact' && r.parts[0].phone === '5154124020' && r.parts[0].buildingIds[0] === 'b1' &&
  r.parts[1].kind === 'link' && r.parts[1].linkId === '8', r);
r = S.proposeContact(contacts[1], ctx);
check('Pump N Pantry: "Steven or Jordan 55-705-0765" needs a match (two people, 9 digits); Sarah linked; not ready',
  !r.ready && r.parts[0].kind === 'unknown' && /Steven or Jordan/.test(r.parts[0].text) && r.parts[1].kind === 'link', r);
r = S.proposeContact(contacts[3], ctx);
check('St. Joseph "Lease 515-266-3433": needs a match (no person)', !r.ready && r.parts.length === 1 && r.parts[0].kind === 'unknown', r);
r = S.proposeContact(contacts[4], ctx);
check('Junior Achievers: Kelsie, Customer contact, its building', r.ready && r.parts[0].name === 'Kelsie' && r.parts[0].buildingIds[0] === 'b4', r);
r = S.proposeContact(contacts[2], ctx);
check('Sarah Krieger- Service Mgr: keep, Name "Sarah Krieger" + Role "Service Mgr"', r.ready && r.parts.length === 1 && r.parts[0].kind === 'keep' && r.parts[0].name === 'Sarah Krieger' && r.parts[0].role === 'Service Mgr', r);
r = S.proposeContact({ id: '20', name: 'Megan & Sarah', type: 'Email', value: 'megan@x.com, kriegers@cintas.com', phone: '' }, ctx);
check('"Megan & Sarah" with two emails: keep Megan + megan@x.com; Sarah needs a match; kriegers@ links to Sarah Krieger',
  !r.ready && r.parts[0].kind === 'keep' && r.parts[0].name === 'Megan' && r.parts[0].email === 'megan@x.com' && r.parts.some(p => p.kind === 'link' && p.linkId === '8') && r.parts.some(p => p.kind === 'unknown' && p.text === 'Sarah'), r);

/* ---- Perennial y Sixth Ave (Clients.Phone tal cual) ---- */
const pctx = { contacts: [], primaryName: 'Antwan Howard' };
r = S.proposeClient('Phone', 'Office: 515-346-6855 Cell: 515-554-5307', pctx);
check('GS-1059: keep the office phone; the cell is a new contact for the main contact, "Cell" is NOT a role',
  r.ready && r.parts[0].kind === 'keep' && r.parts[0].phone === '5153466855' && r.parts[1].kind === 'person' && r.parts[1].name === 'Antwan Howard' && r.parts[1].role === '' && r.parts[1].phoneNote === 'Cell', r);
r = S.proposeClient('Phone', 'Office 515-288-8309 Cell:515-554-5307', pctx);
check('GS-1058 ("Cell:515…" with no space): same', r.ready && r.parts[0].phone === '5152888309' && r.parts[1].phone === '5155545307', r);
r = S.proposeClient('Phone', '515-554-5307, 620-875-0785', { contacts: [], primaryName: 'Lee Park' });
check('GS-1053 Sixth Ave: keep the first; the second needs a match (doesn\'t say whose)', !r.ready && r.parts[0].kind === 'keep' && r.parts[1].kind === 'unknown', r);
r = S.proposeClient('Phone', 'Office: 515-346-6855 Cell: 815-573-3768', { contacts, primaryName: 'Antwan Howard' });
check('a second phone that is already a contact is linked, not created again', r.parts[1].kind === 'link' && r.parts[1].linkId === '8', r);
r = S.proposeClient('Contact', 'a@x.com; kriegers@cintas.com', ctx);
check('client email with two: keep the first; the second links to its contact', r.ready && r.parts[0].email === 'a@x.com' && r.parts[1].kind === 'link', r);
r = S.proposeClient('ClientName', 'Megan & Sarah', ctx);
check('client contact person "Megan & Sarah": keep Megan; Sarah needs a match', !r.ready && r.parts[0].name === 'Megan' && r.parts[1].text === 'Sarah', r);
check('summary in words', /new contact Megan \(Customer contact\) \(515\) 412-4020 · same person: Sarah Krieger- Service Mgr/.test(S.proposeContact(contacts[0], ctx).summary), S.proposeContact(contacts[0], ctx).summary);

console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
process.exitCode = bad ? 1 : 0;
