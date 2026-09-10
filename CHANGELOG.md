# Changelog

Todas las versiones publicadas de este repo, más recientes primero.

## v1.1.10 — 2026-09-08

- **Agregado:** nuevo evento `gs-popover-closed` -- se dispara cada vez que un popover
  (calendario o reloj) se cierra, sin importar cómo (clic afuera, elegir un día/hora, otro
  disparador). Necesario para flujos donde algo más depende de "el usuario cerró esto sin elegir
  nada" (ej. un switch que debe apagarse solo si su reloj se cierra sin confirmar una hora).
  `closeAllPopovers` también quedó expuesto públicamente.

- **Arreglado:** BUG REAL -- clic afuera del reloj podía cerrarlo de golpe justo después de elegir
  la HORA (aunque el usuario seguía dentro del reloj, a punto de elegir el minuto). Causa: elegir
  la hora vuelve a dibujar la cara del reloj (para mostrar los minutos), lo que borra del DOM el
  número que se acababa de tocar -- para cuando el clic terminaba de "burbujear" hasta el
  documento, el elemento ya no existía, y la verificación de "¿fue adentro o afuera?" veía un
  nodo desconectado y lo confundía con "afuera". Arreglado usando `composedPath()`, que congela
  la ruta real del clic desde el instante en que ocurrió, sin importar qué se borre después.

## v1.1.9 — 2026-09-08

- **Arreglado:** el popover (calendario o reloj) podía abrirse en el lugar equivocado de la
  pantalla -- reportado con screenshot: el reloj de "Unit ready" aparecía tapando otras tarjetas,
  lejos de su botón. Causa: al abrirse, algunos campos (como el de "Unit ready") primero REVELAN
  un bloque que estaba oculto (`display:none`), y el cálculo de posición corría antes de que el
  navegador terminara de acomodar ese cambio de layout, agarrando coordenadas viejas.

  Ahora la posición se calcula 2 veces: una de inmediato, y otra un frame después
  (`requestAnimationFrame`) -- si el primer cálculo ya estaba bien, no cambia nada; si el campo
  se acababa de revelar, el segundo cálculo corrige la posición una vez que el layout ya se
  acomodó. Aplica tanto al calendario como al reloj.

  LIMITACIÓN DE LA PRUEBA: el entorno de pruebas automáticas no calcula layout real de pantalla
  (getBoundingClientRect siempre da 0), así que este arreglo se confirmó sin errores de código y
  sin romper nada de lo demás, pero NO se pudo confirmar en automático que resuelve el
  posicionamiento real -- eso lo tiene que confirmar el usuario viéndolo en un navegador de
  verdad.

## v1.1.8 — 2026-09-08

- **Arreglado:** `date-time-picker/` — BUG REAL, reportado por el usuario ("el reloj de poner una
  orden no mantenía la hora, se quedaba en 8"). Elegir solo la hora (sin llegar al minuto) nunca
  escribía nada en el campo -- solo `pickMinute` guardaba el valor final, así que si el usuario
  cerraba el reloj justo después de elegir la hora (razonable, ya que el reloj SÍ avanza
  visualmente a "elegir minuto"), el valor se quedaba pegado en lo que hubiera antes.

  Se extrajo `commitTime(fieldId)`, y ahora se llama tanto al elegir la hora como al cambiar
  AM/PM, además de al elegir el minuto -- el popover sigue abierto igual que antes (no cambia el
  flujo visual), solo que ya no depende de llegar hasta el minuto para que algo quede guardado.

  Existía desde antes de este componente -- las 5 copias locales de las que se extrajo tenían el
  mismo diseño de 2 pasos, con el mismo hueco. Confirmado reproducido primero en aislado, luego
  arreglado, y sin regresión (18 pruebas anteriores del reloj/calendario, más las 13 de
  integración de Admin, todas pasan igual).

## v1.1.7 — 2026-09-08

- **Agregado:** `date-time-picker/` — `dateHtml` acepta un 4to parámetro `options` con
  `{ min, max }`. Necesario para el panel de "Assign" en `admin.html`, el único de los 7 lugares
  ya conectados que necesitaba límites reales (la fecha asignada tiene que caer entre Entry Date y
  Due Date de la orden). Confirmado con prueba dedicada y sin regresión (15 pruebas anteriores).

## v1.1.6 — 2026-09-08

- **Agregado:** `date-time-picker/` — `dateHtml`/`timeHtml` ahora también limpian el estado
  interno cuando se llaman sin valor inicial, no solo `syncDate`/`syncTime`. Encontrado al conectar
  Create Order en `admin.html`, que regenera el formulario con el mismo `fieldId` cada vez que se
  abre para un cliente distinto -- sin este arreglo, el calendario podía seguir mostrando el
  mes/día que había dejado el cliente anterior. Confirmado sin regresión (12 pruebas anteriores).

## v1.1.5 — 2026-09-08

- **Agregado:** `date-time-picker/` — el popover cambia de `position: absolute` a `position: fixed`
  con posicionamiento propio en JS. Encontrado al conectar Create Order en `admin.html`: vive
  dentro de una tarjeta con `overflow: hidden`, que hubiera recortado el popover con
  `position: absolute`. Confirmado sin regresión: las 13 pruebas de integración anteriores
  (customer.html, tracking.html, profile.html, developer.html, admin.html) siguen pasando igual.

## v1.2.0 — 2026-09-08

- **Agregado:** `service-picker/` — `filterMode: 'selected-plus-search'` (para editar algo que ya
  existe, sin mostrar de entrada el catálogo completo), `crossDivision` (buscar sin límite de
  división), `getPropertyType()`, y que cambiar de tipo de propiedad también dispare `onChange`.

  Esto salió de revisar TODOS los 6 lugares candidatos (customer.html, templates.html, admin.html
  ×3 copias internas, developer.html, recurring.html) ANTES de conectar el primero, en vez de
  conectar uno, encontrar un hueco, parchar, conectar el siguiente, encontrar otro hueco -- que es
  como se hicieron los 3 parches anteriores (v1.1.0/v1.1.1/v1.1.2) del date-time-picker. Correcion
  del propio proceso, no solo del componente.

  De paso: `supervisor.html` (tech.gsocd.com), que parecía candidato por usar el mismo estilo de
  botones L1/L2/L3, se descarta -- es una herramienta distinta (modifica servicios de una orden ya
  existente, con quitar/deshacer), no un selector desde catálogo.

## v1.1.2 — 2026-09-08

- **Agregado:** `date-time-picker/` — al elegir fecha u hora, el input oculto ahora también
  dispara su evento nativo `'change'` (además del `gs-date-picked`/`gs-time-picked` propio). Hueco
  encontrado al conectar `customer.html`, que ya escuchaba `change` en esos inputs para el
  autoguardado de borrador y el aviso de "menos de 24 horas".

## v1.1.1 — 2026-09-08

- **Agregado:** `date-time-picker/` — `syncDate(fieldId)` / `syncTime(fieldId)`, para cuando el
  valor del campo se pone desde fuera (cargar un borrador, editar una orden existente) sin pasar
  por el calendario/reloj. Hueco encontrado al conectar `customer.html` (ordersgsocd.com), que
  pone estos valores directo en varios lugares.

## v1.1.0 — 2026-09-08

- **Agregado:** `date-time-picker/` — selector de fecha y hora (calendario + reloj circular).
  Extraído de las copias en `admin.html`, `developer.html` (Admingsocd.com), y `tracking.html`,
  `customer.html`, `profile.html` (ordersgsocd.com).
- **Agregado:** `service-picker/` — buscador + chips o filas con niveles L1/L2/L3. Extraído de
  las 3 copias dentro de `admin.html` (Approvals/Review, Active, Create Order), más
  `developer.html`, `recurring.html`, `customer.html`, `templates.html`, y `supervisor.html`
  (tech.gsocd.com).

`v1.0.0` sigue existiendo tal cual — nada de lo que ya usa Tech (el lightbox) cambió, no hace
falta que se mueva de versión.

## v1.0.0 — 2026-09-08

Primera versión del repo.

- **Agregado:** `lightbox/` — visor de fotos en pantalla completa con flechas. Extraído de las
  copias que vivían por separado en `tech.gsocd.com` (Employee y Supervisor) y `Admingsocd.com`
  (Admin).

Todavía ningún portal consume este repo — este es el primer componente listo, antes de conectar
el primero (probablemente `Admingsocd.com`, para probar el proceso completo con el menor riesgo).

## order-history v1.0.0 — 2026-09-09

- Primera version. Consolida en una sola pieza lo que antes eran 3 implementaciones
  independientes (Admingsocd.com, ordersgsocd.com, tech.gsocd.com), cada una con sus
  propias reglas de que se agrupa, que se etiqueta, y que se esconde -- por eso el
  mismo evento se veia distinto (o de plano no se veia) segun donde se mirara.
- Reglas consolidadas: agrupar renglones consecutivos de 'Dates Confirmed', fusionar
  esa tanda con el evento de decision que le sigue de cerca, fusionar 'Change
  Requested' + 'Reschedule Requested' del mismo actor. Etiquetas legibles por
  ChangeType, iguales en todos los modos. Nunca esconde un evento completo por falta
  de detalle -- siempre se ve el encabezado como minimo (antes Admin escondia el
  evento entero si no tenia ni detalle ni nota).
- Dos modos: 'staff' (todo, sin filtrar mas alla del ruido operativo puro --
  Document Generated/Failed, Archived) y 'client' (ademas esconde Office Change
  (Internal), Supervisor, Inspection Date, Delay Reason).

## v1.4.0 — 2026-09-09

- **order-history**: se agregaron 2 etiquetas que faltaban, encontradas al conectar Admin
  a la pieza compartida -- 'Reschedule Requested' pasa de 'Reschedule requested' a 'New dates
  requested' (redaccion ya usada en Admin, mas clara), y se agrego 'Expected Ready Date' ->
  'Ready Date & Time' (tipo real usado por save-expected-ready-date.js en Orders, que no
  se habia contemplado en la v1.0.0).

## v1.5.0 — 2026-09-09

- **order-history**: corregido el ChangeType real de la aprobacion de reactivacion --
  era 'Reactivation Approved' (inventado), el backend real usa 'Order Reactivated'
  (ya existia desde antes en admin-approve-order.js y confirm-reactivation.js). Se
  corrigio tanto en LABELS como en DECISION_TYPES.

## v1.6.0 — 2026-09-09

- **order-history**: 2 arreglos reales encontrados al revisar el mini con el usuario.
  1. `parseServicesPayload` ahora conserva el objeto completo (antes solo extraia
     `.services`/`.dirtLevel`, descartando cualquier otro campo) -- necesario para que
     el evento "Created" tambien pueda leer las fechas del pedido original, no solo
     los servicios.
  2. El detalle de "Created" ahora muestra Entry/Due/Window ademas de los servicios,
     cuando el backend los trae (ver commits de Admingsocd.com/ordersgsocd.com -- antes
     el backend nunca guardaba el pedido original completo, solo la palabra del
     estatus, asi que este renglon siempre se veia vacio).

## v1.7.0 — 2026-09-09

- Nuevo componente **order-badges**. Consolida en una sola pieza lo que antes eran
  4 copias independientes (admin.html, tracking.html, employee.html, supervisor.html)
  del mismo diseno de badge, ya desincronizadas: el texto no coincidia entre Admin/
  Orders ("Occupied unit") y Tech ("Occupied"), y Orders nunca tuvo la nota completa
  de que se necesita de la oficina -- el cliente veia el badge morado pero nunca el
  detalle real.

## v1.8.0 — 2026-09-09

- **order-badges**: nueva funcion `nowOpen(o)` -- badge "Now Open · 8am-5pm" /
  "Closed · Opens 9am", Opcion 1 confirmada con el usuario (misma linea que los
  demas badges). Lee `o.NowOpenStatus` (ya calculado del lado del backend, cruzando
  horario semanal + Holidays), no calcula nada por su cuenta.

## v1.9.0 — 2026-09-09

- **service-picker**: nueva opcion `groupByCategory` -- agrupa los servicios en
  un acordeon por categoria (con contador de elegidos por categoria), en vez
  de la lista plana de siempre. Sin esta opcion (default false), el
  comportamiento es EXACTAMENTE igual al de antes -- ningun llamador
  existente se ve afectado sin pedirlo explicitamente.
- Bug real encontrado y arreglado ANTES de llegar al componente compartido
  (via mini con el usuario): elegir un servicio no debe cerrar la categoria
  abierta -- se corrigio guardando el estado de "abierto/cerrado" por
  categoria de forma persistente (openCats), en vez de reconstruirlo desde
  cero en cada render.
- Buscar abre automaticamente solo las categorias con resultados.
- Servicios sin categoria asignada caen en "Uncategorized", nunca se pierden.

## v1.10.0 — 2026-09-10

- **service-picker**: BUG REAL -- la clase `gs-sp-accordion` (el contenedor
  de las cajas de categoria del acordeon nuevo de v1.9.0) se le ponia al
  grid desde JS pero nunca tuvo una regla CSS que la definiera. Resultado:
  las categorias siempre se veian apiladas en 1 sola columna, en cualquier
  ancho de pantalla, sin importar el dispositivo. Se agrega la regla que
  faltaba: 2 columnas en desktop, 1 en mobile (`max-width:640px`, mismo
  breakpoint que ya usa el resto del componente).
- Estandarizado `groupByCategory: true` en los 2 lugares que se habian
  quedado atras de v1.2.0 sin el acordeon (`developer.html` > tpl-admin,
  `templates.html` > template-editor) -- confirmado con el usuario: el
  acordeon por categoria es el estandar en TODO lugar de Admin u Orders
  donde se pone o edita una orden (no aplica a tech.gsocd.com, ahi nunca
  se crean ordenes).

## v1.11.0 — 2026-09-10

- **service-picker**: BUG REAL -- se podian abrir varias categorias del
  acordeon al mismo tiempo (la clase gs-sp-accordion tenia su CSS de 2
  columnas de v1.10.0, pero el click de cada header solo volteaba su
  propio estado, sin cerrar las demas). Ahora abrir una categoria cierra
  las otras -- solo una abierta a la vez, encontrado al construir Recurring.
