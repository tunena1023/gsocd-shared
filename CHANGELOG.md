# Changelog

Todas las versiones publicadas de este repo, más recientes primero.

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
