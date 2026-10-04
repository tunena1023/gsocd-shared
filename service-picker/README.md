# Selector de servicios

Buscador + cuadritos (chips) o filas con niveles L1/L2/L3, para elegir servicios de un catálogo.
Dos modos: `'toggle'` (un chip, se prende o apaga) y `'levels'` (fila con 3 botones de nivel).

## Uso

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@<sha>/service-picker/service-picker.js"></script>
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
  - `filterMode`: `'all'` (por defecto) muestra todo el catálogo de entrada, se va acotando al
    buscar. `'selected-plus-search'` no muestra nada hasta que se escribe algo — **excepto** lo
    que ya está elegido, que siempre se ve (para poder quitarlo o cambiarle el nivel sin tener
    que volver a buscarlo). Útil al editar algo que ya existe (una orden, un template) en vez de
    armar uno desde cero.
  - `crossDivision`: si es `true`, la búsqueda no se limita a `division` — cruza todo el catálogo
    (por defecto `false`).
  - `propertyType`: `'Commercial'` (por defecto) o `'Residential'`.
  - `showPropertyToggle`: mostrar el interruptor Residential/Commercial (por defecto `true`).
  - `showSelectAll`: mostrar el control "Select all L1/L2/L3" (por defecto `false`, típico solo en
    modo `'levels'`).
  - `initialSelected` / `initialLevels`: para pre-llenar (ej. al editar una orden que ya tiene
    servicios elegidos).
  - `onChange(selected, svcLevel, propertyType)`: función que se llama cada vez que algo cambia —
    ya sea la selección o el tipo de propiedad (opcional).

`mount()` devuelve un objeto con:

```js
picker.getSelected()          // { propertyType: { nombreServicio: sku } }
picker.getLevels()            // { 'propertyType|nombreServicio': 'Level 2' }
picker.getPropertyType()      // 'Commercial' o 'Residential', el actual
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
