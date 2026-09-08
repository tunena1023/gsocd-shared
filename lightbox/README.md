# Lightbox de fotos

Visor de fotos en pantalla completa, con flechas para cambiar entre fotos. Reemplaza
`onclick="window.open(this.src)"`, que navegaba directo al link de descarga de la foto — en
móvil, eso se trataba como una descarga de archivo en vez de "ver la imagen".

## Uso

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.0.0/lightbox/lightbox.js"></script>
```

Una sola línea. El archivo se inyecta su propio HTML y CSS al cargar — no hace falta copiar
nada más.

Para abrir una foto (por ejemplo, en el `onclick` de una miniatura):

```js
GSLightbox.open(photos, index);
```

- `photos`: arreglo de objetos `{ downloadUrl, name }` — todas las fotos del grupo donde vive la
  que se apretó (para que las flechas tengan entre qué moverse).
- `index`: posición (empezando en 0) de la foto que se apretó, dentro de ese arreglo.

```js
GSLightbox.close();   // cerrar a la fuerza (normalmente no hace falta, el usuario lo cierra solo)
GSLightbox.nav(1);    // avanzar una foto (-1 para retroceder)
```

## Comportamiento

- Clic fuera de la imagen, tecla Escape, o el botón ✕: cierra.
- Flechas del teclado (← →), o los botones de flecha: navega entre fotos.
- Las flechas se deshabilitan solas en la primera y última foto del grupo.
- Cargar el script más de una vez en la misma página no duplica nada (se protege solo).

## Historial

- **v1.0.0** — Primera versión. Extraído de las copias que vivían por separado en
  `tech.gsocd.com` (Employee y Supervisor) y `Admingsocd.com` (Admin) — mismo componente, mismo
  comportamiento, ahora en un solo lugar.
