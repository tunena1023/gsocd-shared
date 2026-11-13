/* Prueba de address-city.js: node lib/address-city.test.js */
'use strict';
const A = require('./address-city');
let ok = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { ok++; console.log('OK   - ' + name); } else { fail++; console.log('FAIL - ' + name + ' got ' + g + ' want ' + w); }
};

/* Los 3 casos reales del 14/10 (Address check los dejo con City "IA") */
eq('GS-1010 Flats on 5th', A.splitInline('7109 SE 5th St Des Moines, IA 50315'), { address: '7109 SE 5th St', city: 'Des Moines', zip: '50315' });
eq('GS-1032 Oakwood Place', A.splitInline('2810 SE Rio Dr Ankeny, IA 50021'), { address: '2810 SE Rio Dr', city: 'Ankeny', zip: '50021' });
eq('GS-1046 The Pointe on 88th ("Wes Des Moines")', A.splitInline('8790 EP True Pkwy Wes Des Moines, IA 50266'), { address: '8790 EP True Pkwy', city: 'West Des Moines', zip: '50266' });
eq('GS-1051 sin comas', A.splitInline('3815 Tripp St Ames IA 50014'), { address: '3815 Tripp St', city: 'Ames', zip: '50014' });

/* Con comas (como antes) */
eq('con comas', A.splitInline('1405 SE 1st St, Des Moines, IA 50315'), { address: '1405 SE 1st St', city: 'Des Moines', zip: '50315' });
eq('Iowa escrito', A.splitInline('1405 SE 1st St, Des Moines, Iowa 50315'), { address: '1405 SE 1st St', city: 'Des Moines', zip: '50315' });
eq('sin estado, con zip', A.splitInline('1250 SE 11th St, Grimes 50111'), { address: '1250 SE 11th St', city: 'Grimes', zip: '50111' });
eq('sin zip', A.splitInline('1250 SE 11th St, Grimes, IA'), { address: '1250 SE 11th St', city: 'Grimes', zip: '' });
eq('zip+4', A.splitInline('600 Sixth Ave, Des Moines, IA 50309-1234'), { address: '600 Sixth Ave', city: 'Des Moines', zip: '50309' });
eq('ciudad que no esta en la lista, con coma', A.splitInline('101 Main St, Sioux City, IA 51101'), { address: '101 Main St', city: 'Sioux City', zip: '51101' });
eq('"Wes Des Moines" con coma -> West Des Moines', A.splitInline('8790 EP True Pkwy, Wes Des Moines, IA 50266'), { address: '8790 EP True Pkwy', city: 'West Des Moines', zip: '50266' });
eq('West Des Moines sin coma (no se queda en "Des Moines")', A.splitInline('1450 28th St West Des Moines IA 50266'), { address: '1450 28th St', city: 'West Des Moines', zip: '50266' });
eq('direccion de calle con punto cardinal al final', A.splitInline('1209 W 16th St S Newton, IA 50208'), { address: '1209 W 16th St S', city: 'Newton', zip: '50208' });
eq('dos palabras: Pleasant Hill', A.splitInline('1325 Metro E Dr Pleasant Hill IA 50327'), { address: '1325 Metro E Dr', city: 'Pleasant Hill', zip: '50327' });

/* Nunca "IA" ni un zip como ciudad */
eq('sin ciudad conocida y sin coma: ciudad vacia (no "IA")', A.splitInline('123 Something Rd Unknownville, IA 50000'), { address: '123 Something Rd Unknownville', city: '', zip: '50000' });
eq('solo estado y zip', A.splitInline('123 Main St, IA 50315'), { address: '123 Main St', city: '', zip: '50315' });
eq('estado en la coma, sin zip', A.splitInline('123 Main St, IA'), { address: '123 Main St', city: '', zip: '' });

/* Lo que NO es "inline" */
eq('calle sola', A.splitInline('1405 SE First St'), null);
eq('calle con suite (no es ciudad)', A.splitInline('1000 Commerce Pkwy SW, Suite 201'), null);
eq('calle que se llama como ciudad, sin estado ni zip', A.splitInline('1450 Ankeny Blvd'), null);
eq('no empieza con numero', A.splitInline('PO Box 12, Des Moines, IA 50309'), null);
eq('calle, Ciudad conocida sin estado ni zip', A.splitInline('500 Walnut St, Des Moines'), { address: '500 Walnut St', city: 'Des Moines', zip: '' });

/* cityAtEnd */
eq('cityAtEnd', A.cityAtEnd('7109 SE 5th St Des Moines'), { address: '7109 SE 5th St', city: 'Des Moines' });
eq('cityAtEnd no deja la calle sin nombre', A.cityAtEnd('100 N Ankeny'), null);
eq('cityAtEnd sin numero', A.cityAtEnd('Main St Ankeny'), null);
eq('cityAtEnd sin ciudad', A.cityAtEnd('1450 28th St'), null);

/* canonicalCity */
eq('alias', A.canonicalCity('wes des moines'), 'West Des Moines');
eq('mayusculas de la lista', A.canonicalCity('ANKENY'), 'Ankeny');
eq('una que no conoce, igual', A.canonicalCity('  Sioux  City '), 'Sioux City');

/* Validacion al guardar */
eq('IA no es ciudad', A.cityProblem('IA'), 'City "IA" is a state, not a city. Type the city name (for example Des Moines).');
eq('Iowa no es ciudad', !!A.cityProblem('Iowa'), true);
eq('i.a. no es ciudad', !!A.cityProblem('i.a.'), true);
eq('otro estado tampoco', !!A.cityProblem('NE'), true);
eq('zip no es ciudad', A.cityProblem('50315'), 'City "50315" is a number, not a city. Type the city name (the zip goes in Zip).');
eq('vacia: la revisa quien la pide', A.cityProblem(''), '');
eq('ciudad buena', A.cityProblem('Des Moines'), '');
eq('ciudad de la lista con punto', A.cityProblem('W. Des Moines'), '');
eq('Ames (parecida a un estado) esta bien', A.cityProblem('Ames'), '');
eq('isState', [A.isState('IA'), A.isState('iowa'), A.isState('Ankeny'), A.isState('')], [true, true, false, false]);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
