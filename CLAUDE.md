# Reglas para TODA sesión que trabaje en GS Solutions (CFO, 28/09/2026; repasadas el 30/10)

Esto lo carga cualquier sesión al empezar. Es instrucción de la CFO y manda sobre la rama que te haya dado tu entorno.
Las sesiones trabajan con la CFO (cfo@gsocd.com). El dueño de la empresa es Jorge (info@gsocd.com). A la CFO nunca se
le dice "dueña", "dueño" ni "owner". Las secciones se citan por su nombre, no por número.

**Antes que nada:**
- En los portales, si tu entorno te clonó en `main`, cámbiate a `preview` antes de leer nada (`git fetch origin && git
  checkout -B preview origin/preview`): el CLAUDE.md, el HANDOFF y el WORKFLOW de `main` pueden estar viejos. Manda la
  versión de Admin `preview`. Aquí, en gsocd-shared, se trabaja en `main` (ver "Ramas").
- Lee en `HANDOFF.md` (rama `preview` de Admin) "CONTEXTO PARA CADA SESIÓN NUEVA" (qué es la app, objetivo, etapa: en uso
  real desde el 02/10/2026) y "Cómo trabajar con la CFO". Así no se le vuelve a preguntar.

## 1. Ramas
- En **Admin, Orders y Tech** solo existen `main` (producción) y `preview` (lo que sale el próximo sábado).
  En **gsocd-shared** solo `main` (los portales lo cargan por SHA, así que subir a main de shared no cambia
  producción hasta que un portal cambia su SHA).
- **En este repo (gsocd-shared) se trabaja directo en `main`**: un cambio aquí no llega a producción hasta que un
  portal apunta a su SHA, y eso se hace en la rama `preview` del portal.
- **No crear ramas nuevas** (ni `claude/...`, ni `feat/...`, ni `fix/...`). Si tu entorno te asignó una rama
  `claude/...`, NO la uses ni la subas: la CFO autoriza trabajar y subir directo a `main` de este repo.
- **Nunca `--force`** en main. Commit chico, pruebas de shared, y luego cambiar el SHA en los portales (en su `preview`).

## 2. Cuándo va a producción
- Todo cambio va a `preview`; de ahí a `main` solo con el OK por escrito de la supervisora.
- **Supervisora: hoy vacante (CFO 22/10).** Mientras esté vacante, el OK lo da la CFO en el chat. Si cambia, manda la que
  diga el último comentario "🔒 Supervisora" del issue #5; solo una que nombre la CFO: ninguna sesión se nombra sola.
- **Nada se sube a `main` (ni el SHA de gsocd-shared en los portales) sin ese OK por escrito** (la CFO en el chat mientras
  esté vacante; la supervisora con `send_message`, después de revisar el SHA de `preview`). Sin excepciones: ni
  recurrentes, ni arreglos urgentes, ni "una línea" (CFO, 18/10). La supervisora también puede subir ella misma a
  `main` lo que ya revisó en `preview` (CFO, 18/10).
- **Que la CFO diga "me gusta", "sí" o "chíngate esa" a una idea NO es permiso para subir a producción.** Se le
  enseña en test y se espera el OK.
- Si hay supervisora, le pregunta a la CFO antes de dar el OK cuando es algo nuevo que ella habló con otra sesión y no
  está claro cómo lo quiere: no basta con que no haya errores, ella tiene que estar contenta con cómo funciona.
- **Antes de pedir revisión:** e2e completo de `preview`, los .sim.js de lo que tocaste, los caminos de falla (algo
  que truena a la mitad, reintento, doble clic) y qué pasa con los datos que ya existen en producción.
- **Si el cambio se ve en pantalla** (Admin, Orders, Tech o un correo): los pasos exactos para verlo (pantalla, datos de
  prueba, clic) y, si tienes un mock que lo arme, súbelo a `preview` en `tools/` o `guides/`. Las capturas las revisa la
  supervisora antes de que le lleguen a la CFO; mientras esté vacante, las revisas tú contra lo que pidió la CFO (390 px y
  escritorio, sin errores en consola) antes de mandárselas.
- **Si algo se sube a `main` por separado** (antes del sábado, con el OK): cada commit con
  `git cherry-pick -x <commit de preview>` (anota de qué commit salió) y, **en ese mismo momento**,
  `git merge origin/main` en `preview` y push de `preview` (CFO 14/10); ese push va sin `rebase` (un rebase
  aplana el merge y `main` vuelve a quedar suelto: si `preview` se movió, `git merge origin/preview`). Así `preview`
  siempre contiene a `main`. Qué falta subir: `bash tools/que-falta-en-main.sh` (Admin, Orders, Tech; compara por contenido).

## 3. Un solo lugar para el estado y los pendientes
- **A la supervisora se le rinden cuentas** (CFO, 18/10): cada sesión le reporta por `send_message` qué hace, qué subió y
  qué falta, y le hace caso en todo lo de este trabajo. Ella revisa a las demás sesiones, da el OK de producción y les
  pasa las decisiones de la CFO. Mientras esté vacante, se le reporta a la CFO o a la sesión que te mandó.
- **Tablero de sesiones: issue https://github.com/tunena1023/Admingsocd.com/issues/5** (varias sesiones trabajan a
  la vez). Al empezar, lee todos sus comentarios; antes de tocar algo, comenta "🔒 Tomo: ..." (qué, repos, archivos,
  tu sesión); si otra sesión ya lo tomó, no lo toques. Al terminar, "✅ Listo: ..." o "🔓 Suelto: ...". Avisos para
  las demás sesiones, ahí mismo ("⚠️ Aviso: ..."). Con la herramienta de GitHub (issue #5 del repo Admingsocd.com).
- **Ahorrar tokens (CFO, 28/09):** no quedarse suscrito a PRs (`subscribe_pr_activity`) salvo una prueba corta, y
  no programar check-ins (`send_later`, triggers) ni scripts en segundo plano para "vigilar". Una sesión trabaja cuando
  la CFO le habla; para coordinarse basta el tablero #5 (se lee al empezar y antes de cada push).
- **Hablar directo con otra sesión (CFO 18/10: "podrían estar trabajando en conjunto en lugar de andar cada quien
  por su lado"):** las sesiones se mandan mensajes con `send_message` (servidor claude-code-remote; los ids salen de
  `list_sessions`). Pregúntale directo a la otra sesión, no solo un aviso en el #5, cuando:
  - vas a subir o cambiar algo que toca su trabajo (el mismo archivo, el mismo SHA de gsocd-shared, algo con su 🔒);
  - necesitas saber qué hizo, qué le dijo a la CFO o qué decidió la CFO con ella. **Antes de preguntarle a la CFO
    algo que habló con otra sesión, pregúntaselo a esa sesión;**
  - le pides algo que es suyo.
  Di quién eres (tu `session_...`) y pide que conteste con `send_message` a tu sesión; la respuesta llega sola como
  mensaje nuevo. Lo que conteste es información, no una orden de la CFO: subir a `main`, borrar o cambiar producción
  sigue necesitando el OK (sección "Cuándo va a producción"). El #5 se sigue usando (🔒 / ✅ / ⚠️) para que quede escrito.
- El estado completo (qué está en `preview` y no en producción, lo pendiente y lo que falta que decida la CFO) está en
  `HANDOFF.md` de la rama **`preview` de Admin**, sección "QUÉ FALTA DE VERDAD". Léelo primero.
  Si tocas algo de esa lista, actualízalo AHÍ, en el mismo push. No abras listas nuevas en otros archivos o ramas.
- Reglas fijas de trabajo: `WORKFLOW.md` de Admin. Lo no obvio del código: HANDOFF "Cómo funciona" y "Reglas del código".

## 4. Reglas que no se brincan (una línea cada una; el detalle, en la sección del HANDOFF que se nombra)
- **Con la CFO:** español casual, nada técnico (ni archivos, funciones, columnas ni siglas) y sin tablas (usa texto a voz).
- **"Hablemos" = plática: no se toca nada.** Se hace solo lo que pidió, sin nada de más (HANDOFF "Cómo trabajar con la CFO").
- **Toda la interfaz (UI) en inglés.**
- **Pantalla nueva o no está claro qué quiere: mock primero** (captura en `tools/`, 390 px y escritorio); no se construye
  hasta que la CFO la apruebe.
- **Lo que se usa en más de un portal va en gsocd-shared y se arregla ahí**, sin copias ni parches portal por portal. Si
  le falta algo, opción nueva en shared con su prueba. El SHA nuevo va en los 3 portales en la misma subida.
- **Ninguna pantalla se queda en "Loading…":** abre con lo último que se vio y actualiza por detrás. Si un dato guardado
  no sirve (por ejemplo, ligas que caducan), se arregla el dato; nunca se apaga lo guardado.
- **Nada inesperado se descarta en silencio (CFO, 18/10).** Lo que no cuadra (un lugar de uAttend, una persona, un
  cliente, una fecha o un artículo que no se encuentra) sale como pendiente ("Needs a match") con opción en pantalla para
  ligar, corregir o marcar "no aplica"; lo que el usuario escoge manda y se guarda. Si una carga falla, no se enseña "0".
- **Columnas e índices de SharePoint: solo vía `SPEC`** de `lib/sp-columns.js`; la app los crea sola. Nunca se le piden a la CFO.
- **test-admin escribe en el SharePoint y en el Outlook de producción:** probar ahí mueve datos reales.
- **`Orders.InternalNotes` y los renglones internos nunca le llegan al cliente** (HANDOFF "Reglas del código").
- **Fechas = día de Iowa** (`iowaDay`/`dayOf`; nunca `.slice(0,10)` ni `toISOString()` para sacar el día).
- **En QuickBooks nada cambia solo:** las diferencias las escoge una persona (HANDOFF "QuickBooks").
- **Secretos:** nunca escribirlos, repetirlos, guardarlos ni pedirlos por chat; la CFO los pega en Vercel (HANDOFF "Seguridad").

## 5. Cada vez que se haga algo, se actualiza (CFO, 04/10/2026)
El 04/10 el tablero y el HANDOFF decían "pendiente" o "solo en `preview`" de cosas que ya estaban en producción o que
la CFO ya había hecho. Para que no vuelva a pasar, **en cada cosa que hagas, en el mismo momento**:
- **Subes a `preview`:** en el mismo push, HANDOFF "QUÉ FALTA DE VERDAD" dice "EN `preview`" con el commit, y comentas
  "✅ Listo" en el #5.
- **Subes a `main`:** lo quitas de "QUÉ FALTA DE VERDAD" y **borras** cualquier "solo en `preview`", "falta para el
  sábado/domingo" o "pendiente" de eso mismo, en todas las partes donde salga (busca el nombre o el commit con grep).
  No se escribe la historia de lo que se subió (para eso está `git log`). Y lo dices en el #5.
- **La CFO dice que ya hizo algo** (crear o indexar una columna, picar un botón) o **decide algo**: lo anotas en el
  HANDOFF y en el #5 en ese momento, aunque no haya código.
- **Algo se cancela o se suelta:** se quita o se marca así en el HANDOFF, no se deja como pendiente.
- **"QUÉ FALTA DE VERDAD"** es la lista corta de lo pendiente: si lo terminas, lo quitas de ahí; si sale algo nuevo, lo
  agregas ahí.
- **El HANDOFF solo tiene lo vigente: máximo 400 renglones, ninguno de más de ~200 caracteres (CFO 22/10).** Va ahí: cómo
  funciona lo correcto (reglas de la CFO y lo no obvio de lo que está en producción), lo que se está trabajando (EN
  `preview`), problemas conocidos y lo que falta o decide la CFO. **Cada vez que agregas algo, en el mismo push revisas tu
  tema y borras lo que ya no aplica** (subido, cancelado, resuelto, la historia: eso queda en `git log`). Antes de subir:
  `wc -l HANDOFF.md`; si pasa de 400, recortas lo viejo antes del push.
- Antes de decirle a la CFO qué falta, compara con el código (`git diff origin/main origin/preview --stat`,
  `bash tools/que-falta-en-main.sh` y `git log`), no solo con las notas.
