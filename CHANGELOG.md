# Changelog

Todas las versiones publicadas de este repo, más recientes primero.

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
