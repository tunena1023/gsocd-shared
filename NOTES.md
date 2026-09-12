# NOTES.md — Cómo se trabaja en este proyecto

Este archivo existe para que cualquier chat de Claude (u otra persona) que entre
a este repo después no tenga que adivinar el proceso, ni repetir preguntas ya
resueltas, ni subir cosas sin permiso. Léelo completo antes de tocar código.

## Reglas de trabajo con el dueño del proyecto

1. **Nada se sube al repo sin permiso explícito.** El dueño dice cómo quiere
   que algo funcione (el resultado, no el código línea por línea). Quien
   programa se inventa la forma técnica de lograrlo, pero antes de tocar el
   repo real, regresa y explica: "encontré esto, funciona así, ¿le entro?" —
   sobre todo si hay una decisión de por medio (crear una columna nueva,
   elegir entre 2 formas de resolverlo, etc.). Solo con un "dale"/"súbelo"
   explícito se sube. Sin excepción, aunque el fix se vea obvio.

2. **No asumas silenciosamente.** Si algo es ambiguo, o si el código actual
   sugiere un mecanismo distinto al que el dueño describe, se pregunta o se
   verifica ANTES de decidir por cuenta propia. Leer el código para entender
   cómo funciona hoy está bien y se espera — pero eso no reemplaza confirmar
   qué se quiere que pase.

3. **"Minis" antes de tocar UI/visual.** Para cualquier cambio visual o de
   comportamiento de interfaz, se arma una vista previa interactiva (HTML
   autocontenido, publicado como artifact) ANTES de tocar el repo real. Si
   el cambio usa un componente de `gsocd-shared`, el mini debe inyectar el
   componente REAL (el archivo tal cual, no una reconstrucción) para que lo
   que se prueba sea exactamente el comportamiento real, no una simulación.

4. **Los cambios se pueden acumular en local sin subir.** El dueño puede
   pedir varios cambios seguidos y decir "no subas nada todavía" — en ese
   caso los cambios se hacen sobre copias locales (en el sandbox de la
   sesión) y se van apilando, hasta que se den todos juntos con un solo
   "dale". Cuando esto pase, quien retome la conversación (aunque sea otra
   sesión) debe saber que puede haber cambios locales sin commitear — si el
   dueño menciona algo que "quedó pendiente" y no aparece en el repo, no es
   un error, probablemente sigue en el sandbox de la sesión anterior sin
   subir. Pregúntale directo si quiere que se rehaga o si ya se perdió.

5. **Cada commit debe explicar el porqué, no solo el qué.** El mensaje de
   commit tiene que ser lo bastante específico para que una sesión nueva
   entienda el contexto completo sin tener que re-investigar: qué problema
   real se encontró, por qué se eligió esa solución y no otra, y si hay
   trade-offs o casos que se dejaron fuera a propósito.

6. **El tono del dueño es directo y con groserías — no es un ataque
   personal, es como habla.** Se puede hablar de igual a igual, con más
   soltura de la que se usaría normalmente, sin necesidad de ser cortante
   ni de disculparse en exceso. Dicho eso: no hay que auto-insultarse ni
   quedarse callado si algo cruza a un insulto directo — se puede reconocer
   el error real sin necesidad de repetir el insulto.

7. **Antes de subir CUALQUIER cambio al repo (aunque ya esté "confirmado" y
   listo para el commit), hay que revisarlo de punta a punta como si fuera
   un caso real** — seguir el flujo completo, paso a paso, desde que algo
   se crea/pide hasta que se completa/cierra, buscando específicamente: dos
   flujos que puedan pisarse o duplicarse, un dato que se pierda en el
   camino entre una pantalla y otra, una pantalla que no se entere de un
   cambio que hizo otra, y campos usados en el código que no coincidan con
   lo documentado como columnas necesarias en SharePoint. Esto no es
   opcional ni solo para features grandes — es el último paso antes de
   cualquier "dale", cada vez. En esta sesión, esta revisión encontró 7
   bugs reales que el código "ya terminado" traía escondidos — ninguno era
   un error de sintaxis (esos ya se habían validado con `node --check`),
   todos eran de lógica: cosas que se ven perfectas archivo por archivo
   pero fallan en la costura entre dos archivos.

## Mapa de la arquitectura (para no perderse)

**4 repos, todos de `tunena1023` en GitHub, cada uno su propio proyecto en
Vercel (equipo "GS Solutions"):**

| Repo | Dominio | Para quién | Notas |
|---|---|---|---|
| `tech.gsocd.com` | tech.gsocd.com | Empleados/supervisores en campo | Login por QR + DeviceToken (sin password). Nunca se crean órdenes aquí. |
| `Admingsocd.com` | admin.gsocd.com | Oficina/staff | Aprobar órdenes, catálogo de servicios, scheduling |
| `ordersgsocd.com` | orders.gsocd.com | Clientes | Pedir servicio, tracking, portal de cliente |
| `gsocd-shared` | — (no se despliega) | — | Componentes de UI reutilizados por los 3 portales, vía jsDelivr + git tags |

**Cómo se consume `gsocd-shared`:** cada componente se referencia en el HTML
con una URL fija a una versión (`https://cdn.jsdelivr.net/gh/tunena1023/
gsocd-shared@vX.X.X/nombre-componente/archivo.js`). Los tags son de TODO el
repo (no por componente), así que subir un fix implica: 1) editar el archivo
en `main`, 2) crear un tag nuevo (`git/refs` con `refs/tags/vX.X.X` apuntando
al commit), 3) actualizar el `<script src>` en cada HTML que lo usa a la
versión nueva. Sin el paso 3, el fix vive en el repo pero nadie lo usa
todavía — cada consumidor está pegado a la versión que tenga escrita.

**El catálogo de servicios tiene 2 listas de SharePoint, NO conectadas entre
sí por el sistema — son fuentes independientes, a propósito:**
- **`ServicesCatalog`** — SKUs importados de QuickBooks (Division,
  PropertyType, Price, ServiceName se sobreescriben en cada import). El
  campo `Category` es la ÚNICA excepción: el import nunca la toca, se
  mantiene a mano desde `developer.html` > tab "Services" (botón junto a
  cada renglón). Esta es la lista real que alimenta el selector de
  servicios en TODO lugar donde se pone o edita una orden.
- **`Services`** — lista vieja, migrada de un Excel el 30/08/2026. Ya no es
  la fuente real para nada activo del selector de servicios nuevo (ver
  historial de conversación del 10/09/2026 para el porqué se descartó como
  fuente — quedó documentado ahí que mezclar las 2 listas fue un error).

**El selector de servicios compartido (`gsocd-shared/service-picker`)**
tiene una opción `groupByCategory: true` que agrupa por `Category` en un
acordeón (categorías sin asignar caen en "Uncategorized", nunca se pierden).
Por regla del dueño (confirmada 10/09/2026): **este acordeón es el estándar
en TODO lugar de Admin u Orders donde se pone o edita una orden** — no
aplica a Tech (ahí nunca se crean órdenes). Los 6 lugares que existen hoy:
`create-order` y `appr-`/`admin-` (edición) en Admin, `customer-order` en
Orders, más `tpl-admin` (Admin) y `template-editor` (Orders) para
plantillas — estos últimos 2 se estandarizaron el 10/09/2026, antes se
habían quedado en una versión vieja del componente sin el acordeón.

## Pendientes conocidos (al 10/09/2026)

- El **sistema de servicios recurrentes** (ubicaciones/clientes con
  servicio recurrente, técnico asignado que ve y marca servicios como
  hechos) está apenas empezado — no es funcional todavía. Documento de
  referencia pendiente de analizar con el dueño.
- **En local, sin subir al repo:** fix en `service-picker.js` para que solo
  una categoría del acordeón esté abierta a la vez (hoy se pueden abrir
  varias al mismo tiempo). Vive en el sandbox de la sesión del 10/09/2026,
  no en GitHub — si no aparece en el repo y no se sabe por qué, es por esto.
- Bug sin resolver: banner "File downloaded... sharepoint.com" en Tech
  (portal de empleados, celular) — el fondo o logo se descarga como archivo
  en vez de solo mostrarse. No tocar hasta que el dueño lo pida
  explícitamente.
- 404 de `Logo.jpg` / `NavBackground.jpg` en Orders (`/api/site-image`) —
  pendiente de que el dueño confirme el nombre real de esos archivos en la
  raíz del drive de SharePoint (Onlineorders).
# NOTES.md — Cómo se trabaja en este proyecto

Este repo no tenía NOTES.md propio todavía — se crea ahora (12/09/2026)
porque por primera vez se editó directamente, no solo se consumió desde
Admin/Orders/Tech. Lee también el NOTES.md de cualquiera de los otros 3
repos para las reglas generales de trabajo (nada se sube sin "dale"
explícito, minis antes de UI, etc.) — son las mismas aquí.

## Cómo se versiona este repo (importante, ya se aprendió una vez)

Los tags son de TODO el repo, no por componente. Antes de crear un tag
nuevo, correr `git tag --sort=-v:refname | head -1` para saber cuál es
el más alto de verdad — NO asumir que el siguiente número es "uno más"
que el tag que trae puesto el componente que estás tocando (otros
componentes pueden haber avanzado más adelante mientras el tuyo se quedó
quieto). Ejemplo real: `order-form-premium` estaba en v1.19.0 pero el
repo ya iba en v1.24.0 por cambios a `nav-premium`/`gallery-groups` — el
tag correcto para el siguiente cambio fue v1.25.0, no v1.20.0.

Subir un fix implica: 1) editar el archivo en `main`, 2) crear un tag
nuevo apuntando a ese commit, 3) actualizar el `<script src>` en CADA
HTML que lo consume (buscar `gsocd-shared@vX.X.X/nombre-componente/` en
los 3 repos consumidores).

## En local, sin subir (12/09/2026): unificar Office Access en order-form-premium

`order-form-premium.js`: se agregó `officeAccessHtml(dom, opts)`,
`setOfficeNeed(dom, yes)`, `getOfficeNeedValue(dom)`,
`getOfficeNeedNotes(dom)` y `onOfficeNeedChange(dom, fn)`. Antes la
tarjeta "Need anything from the office?" vivía duplicada 4 veces (2 en
el flujo de crear orden de Admin/Orders, 2 en "Add Unit" de ambos), cada
una con texto ligeramente distinto y sin forma de que un cambio se
reflejara en las 4 a la vez. El dueño pidió unificarlo explícitamente
("por que motivo estaria pagando por ti... si es para hacer todo el
trabajo y dejarlo bien conectado en lugar de hacer parches") — no fue
decisión unilateral.

`onOfficeNeedChange` existe porque Orders/create-order hace algo que es
SOLO SUYO al prender el toggle (renombra "Entry time" a "Office
availability time" en otro campo de esa pantalla) — en vez de que el
shared conozca esa lógica ajena, la página se suscribe con un callback.

Cambios de contenido pedidos por el dueño:
- Título: "Need anything from the office?" → "Do we need anything from
  you?"
- Se quitó el label de adentro de la caja ("What do we need from the
  office?") — el placeholder sube a ocupar ese espacio.
- Nuevos ejemplos en el placeholder: "Access keys, materials, special
  instructions..." en vez de "Keys for the mailroom, gate code, access
  to the roof...".

`opts.compact=true` trae la versión delgada (aprobada en el mini de Add
Unit) — sin `compact`, mantiene el tamaño original del flujo de crear
orden.

Tag creado localmente: **v1.25.0** (commit `6298d16` reescrito con
`--amend`, ver `git log`). **Pendiente: push a origin + push del tag** —
no se ha hecho, sigue en el sandbox local hasta que el dueño autorice
explícitamente subirlo. Esto es una librería compartida: afecta a los 3
portales a la vez, así que el push aquí es más delicado que un cambio de
un solo repo — conviene confirmar por separado antes de subirlo, aunque
ya esté aprobado el contenido.

Probado con jsdom (16/16): render normal y compact, título, quitar
label, placeholder nuevo, toggle, candado, `getOfficeNeedNotes` regresa
vacío con el toggle apagado, y el listener `onOfficeNeedChange`.
