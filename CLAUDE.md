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
- El estado completo (qué está en producción, qué está en `preview`, la lista de pendientes #1–#16 y lo que falta
  que decida el dueño) está en `HANDOFF.md` de la rama **`preview` de Admin**, sección 4 (A–D). Léelo primero.
  Si tocas algo de esa lista, actualízalo AHÍ, en el mismo push. No abras listas nuevas en otros archivos o ramas.
- Reglas fijas de trabajo: `WORKFLOW.md` de Admin.
- Español casual con el dueño; toda la interfaz (UI) en inglés.
