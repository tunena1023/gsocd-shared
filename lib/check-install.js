/* ============================================================
   gsocd-shared/lib/check-install.js -- revisa al publicar que todo lo
   que el backend pide de gsocd-shared de verdad se instalo (dueño
   18/10/2026). El 22/09 Vercel uso una copia vieja de node_modules,
   no encontro un modulo de shared y tumbo todo el backend de Admin
   ("Cannot find module"); desde el 18/10 lib/graph.js de los 3 portales
   depende de shared, asi que eso tumbaria todo.

   Cada portal lo corre en "postinstall" (package.json):
     node node_modules/gsocd-shared/lib/check-install.js
   Busca cada require('gsocd-shared/...') en los .js del portal y lo
   carga; si alguno no se puede, sale con error, la publicacion de
   Vercel falla y produccion se queda como estaba.
============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const SKIP = new Set(['node_modules', '.git', 'tests', 'tools', 'docs', 'guides', '.vercel']);

function jsFiles(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) jsFiles(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

function sharedRequires(root) {
  const found = new Set();
  for (const f of jsFiles(root, [])) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /require\(\s*['"](gsocd-shared\/[^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src))) found.add(m[1]);
  }
  return [...found].sort();
}

function check(root) {
  const missing = [];
  const needed = sharedRequires(root);
  for (const mod of needed) {
    try { require.resolve(mod, { paths: [root] }); } catch (e) { missing.push(mod); }
  }
  return { needed, missing };
}

if (require.main === module) {
  const root = process.env.INIT_CWD || process.cwd();
  const { needed, missing } = check(root);
  if (missing.length) {
    console.error('gsocd-shared check: NOT INSTALLED: ' + missing.join(', ') + ' (the deploy stops here so production keeps working)');
    process.exit(1);
  }
  console.log('gsocd-shared check: ' + needed.length + ' modules OK');
}

module.exports = { check, sharedRequires };
