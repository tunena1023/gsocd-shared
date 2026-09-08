# Selector de servicios

Buscador + cuadritos (chips) o filas con niveles L1/L2/L3, para elegir servicios de un catálogo.
Dos modos: `'toggle'` (un chip, se prende o apaga) y `'levels'` (fila con 3 botones de nivel).

## Uso

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.0.0/service-picker/service-picker.js"></script>
```

```js
const picker = GSServicePicker.mount(pickerId, container, options);
```

- `pickerId`: id único para esta instancia (puede haber varias en la misma pantalla).
- `container`: elemento del DOM, o el id de uno, donde se dibuja el selector completo.
- `options`:
  - `catalog`: arreglo de servicios `{ sku, serviceName, division, propertyType }`.
  - `division`: qué división mostrar (ej. `'Janitorial'`).
  - `mode`: `'toggle'` o `'levels'`.
  - `propertyType`: `'Commercial'` (por defecto) o `'Residential'`.
  - `showPropertyToggle`: mostrar el interruptor Residential/Commercial (por defecto `true`).
  - `showSelectAll`: mostrar el control "Select all L1/L2/L3" (por defecto `false`, típico solo en
    modo `'levels'`).
  - `initialSelected` / `initialLevels`: para pre-llenar (ej. al editar una orden que ya tiene
    servicios elegidos).
  - `onChange(selected, svcLevel)`: función que se llama cada vez que algo cambia (opcional).

`mount()` devuelve un objeto con:

```js
picker.getSelected()          // { propertyType: { nombreServicio: sku } }
picker.getLevels()            // { 'propertyType|nombreServicio': 'Level 2' }
picker.setSelected(sel, lvl)  // pre-llenar despues de montado
picker.setDivision(div)       // cambiar de division sin volver a montar
picker.setPropertyType(tipo)
picker.setCatalog(catalogo)
picker.destroy()
```

## Reaccionar a los cambios (alternativa a `onChange`)

```js
document.addEventListener('gs-services-changed', (e) => {
  console.log(e.detail.pickerId, e.detail.selected, e.detail.svcLevel);
});
```

## Historial

- **v1.0.0** — Primera versión. Extraído de las 3 copias que vivían dentro de `admin.html`
  (Approvals/Review, Active, Create Order), más las de `developer.html`, `recurring.html`,
  `customer.html`, `templates.html`, y `supervisor.html` (Update Services).
