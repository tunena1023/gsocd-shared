# Reloj y Calendario

Selector de fecha (calendario) y de hora (reloj circular), en el estilo oficial ya usado en toda
la app. Depende de la paleta de colores de marca (`--gold`, `--black`, `--white`, `--off`,
`--gray`, `--border`, `--gold-dk`) — si la página no los define, cada color tiene un respaldo
razonable, pero se ve mejor si la página ya los define (los 3 portales ya los tienen).

## Uso

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.0.0/date-time-picker/date-time-picker.js"></script>
```

### Campo de fecha

```js
GSDateTimePicker.dateHtml(fieldId, initialISO, placeholder)
```

- `fieldId`: id único para este campo (se usa como id del `<input type="hidden">` real).
- `initialISO`: fecha ya elegida, formato `'YYYY-MM-DD'`, o `null` si no hay ninguna todavía.
- `placeholder`: texto del botón cuando no hay fecha (opcional, por defecto "Pick a date").

Devuelve el HTML completo (input oculto + botón + calendario) — se inserta donde se necesite,
normalmente dentro de un template string junto al resto del formulario.

### Campo de hora

```js
GSDateTimePicker.timeHtml(fieldId, initialHHMM, placeholder)
```

Igual que arriba, pero `initialHHMM` es formato 24 horas (`'14:30'`), y por defecto dice "Pick a
time".

### Leer el valor elegido

```js
GSDateTimePicker.getDate(fieldId)   // 'YYYY-MM-DD' o null
GSDateTimePicker.getTime(fieldId)   // 'HH:MM' (24h) o null
```

También se puede leer directo del input oculto: `document.getElementById(fieldId).value`.

### Cuando el valor se cambia desde fuera (cargar un borrador, editar una orden existente)

Si el código de la página pone `document.getElementById(fieldId).value = '2026-09-15'` directamente
(sin pasar por el calendario/reloj), el botón visible no se entera solo — hay que avisarle:

```js
document.getElementById('entryDate').value = '2026-09-15';
GSDateTimePicker.syncDate('entryDate');   // el boton ahora dice "Sep 15, 2026"

document.getElementById('entryTime').value = '14:30';
GSDateTimePicker.syncTime('entryTime');   // el boton ahora dice "2:30 PM"
```

Si el input queda vacío, `syncDate`/`syncTime` regresan el botón a su texto de "Pick a date/time".

### Reaccionar cuando se elige algo (por ejemplo, para guardar automático)

```js
document.addEventListener('gs-date-picked', (e) => {
  console.log(e.detail.fieldId, e.detail.value); // 'entryDate', '2026-09-15'
});
document.addEventListener('gs-time-picked', (e) => {
  console.log(e.detail.fieldId, e.detail.value); // 'entryTime', '14:30'
});
```

## Comportamiento

- Cada campo es independiente — pueden convivir varios en la misma pantalla (ej. Entry Date +
  Entry Time + Due Date), cada uno con su propio `fieldId`.
- Abrir cualquier calendario o reloj cierra cualquier otro que estuviera abierto en la página.
- Clic fuera de un popover abierto lo cierra.
- El reloj primero pide la hora, luego pasa solo a minutos — se puede tocar el número de hora o
  de minuto en el resultado (arriba del reloj) para regresar a ese paso.

## Historial

- **v1.1.1** — Se agrega `syncDate`/`syncTime`, para cuando el valor se pone desde fuera (cargar un
  borrador, editar una orden existente) sin pasar por el calendario/reloj.
- **v1.0.0** — Primera versión. Extraído de las copias que vivían por separado en `admin.html` y
  `developer.html` (Admingsocd.com), y en `tracking.html`, `customer.html`, y `profile.html`
  (ordersgsocd.com).
