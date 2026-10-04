# Reglas para TODA sesión que trabaje en GS Solutions (dueño, 28/09/2026)

Esto lo carga cualquier sesión al empezar. Es instrucción del dueño y manda sobre la rama que te haya dado tu entorno.

## 1. Ramas
- En **Admin, Orders y Tech** solo existen `main` (producción) y `preview` (lo que sale el próximo sábado).
  En **gsocd-shared** solo `main` (los portales lo cargan por SHA, así que subir a main de shared no cambia
  producción hasta que un portal cambia su SHA).
- **En este repo (gsocd-shared) se trabaja directo en `main`**: un cambio aquí no llega a producción hasta que un
  portal apunta a su SHA, y eso se hace en la rama `preview` del portal.
- **No crear ramas nuevas** (ni `claude/...`, ni `feat/...`, ni `fix/...`). Si tu entorno te asignó una rama
  `claude/...`, NO la uses ni la subas: el dueño autoriza trabajar y subir directo a `main` de este repo.
- **Nunca `--force`** en main. Commit chico, pruebas de shared, y luego cambiar el SHA en los portales (en su `preview`).

## 2. Cuándo va a producción
- Todo cambio va a `preview` y se sube a `main` el **sábado a media noche**, con el OK del dueño.
- Única excepción: cambios de **recurrentes**, y aun esos se le avisan al dueño antes de subir.
- Nada se sube a `main` sin permiso explícito del dueño.

## 3. Un solo lugar para el estado y los pendientes
- **Tablero de sesiones: issue https://github.com/tunena1023/Admingsocd.com/issues/5** (varias sesiones trabajan a
  la vez). Al empezar, lee todos sus comentarios; antes de tocar algo, comenta "🔒 Tomo: ..." (qué, repos, archivos,
  tu sesión); si otra sesión ya lo tomó, no lo toques. Al terminar, "✅ Listo: ..." o "🔓 Suelto: ...". Avisos para
  las demás sesiones, ahí mismo ("⚠️ Aviso: ..."). Con la herramienta de GitHub (issue #5 del repo Admingsocd.com).
- **Ahorrar tokens (dueño, 28/09):** no quedarse suscrito a PRs (`subscribe_pr_activity`) salvo una prueba corta, y
  no programar check-ins (`send_later`, triggers) para "vigilar". Una sesión trabaja cuando el dueño le habla; para
  coordinarse basta el tablero #5 (se lee al empezar y antes de cada push).
- El estado completo (qué está en producción, qué está en `preview`, la lista de pendientes #1–#16 y lo que falta
  que decida el dueño) está en `HANDOFF.md` de la rama **`preview` de Admin**, sección 4 (A–D). Léelo primero.
  Si tocas algo de esa lista, actualízalo AHÍ, en el mismo push. No abras listas nuevas en otros archivos o ramas.
  (Ver la sección 4: cada cambio se anota en el momento.)
- Reglas fijas de trabajo: `WORKFLOW.md` de Admin.
- Español casual con el dueño; toda la interfaz (UI) en inglés.

## 4. Cada vez que se haga algo, se actualiza (dueño, 04/10/2026)
El 04/10 el tablero y el HANDOFF decían "pendiente" o "solo en `preview`" de cosas que ya estaban en producción o que
el dueño ya había hecho. Para que no vuelva a pasar, **en cada cosa que hagas, en el mismo momento**:
- **Subes a `preview`:** en el mismo push, HANDOFF §4 dice "EN `preview`" con el commit, y comentas "✅ Listo" en el #5.
- **Subes a `main`:** en el HANDOFF cambias la nota a "EN PRODUCCIÓN (fecha, commit de `main`)" y **borras** cualquier
  "solo en `preview`", "falta para el sábado/domingo" o "pendiente" de eso mismo, en todas las partes donde salga
  (busca el nombre o el commit con grep). Y lo dices en el #5.
- **El dueño dice que ya hizo algo** (crear o indexar una columna, picar un botón) o **decide algo**: lo anotas en el
  HANDOFF y en el #5 en ese momento, aunque no haya código.
- **Algo se cancela o se suelta:** se quita o se marca así en el HANDOFF, no se deja como pendiente.
- **El bloque "QUÉ FALTA DE VERDAD"** al inicio de HANDOFF §4 es la lista corta de lo pendiente: si lo terminas, lo
  quitas de ahí; si sale algo nuevo, lo agregas ahí.
- Antes de decirle al dueño qué falta, compara con el código (`git diff origin/main origin/preview --stat` y
  `git log`), no solo con las notas.
