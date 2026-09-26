/* ============================================================
   gsocd-shared / order-cards
   Dos reglas de las tarjetas de orden, iguales en los 3 portales
   (26/09/2026, pedido del dueño):

   1. "Para esos cambios la tarjeta deberia de cerrarse y ponerse
      brillante, no quedarse abierta": cuando el refresco en vivo
      (gsocd-shared/live-refresh) trae un cambio de OTRA persona a una
      tarjeta que esta abierta, la tarjeta se vuelve a pintar CERRADA y
      con el brillo de "sin ver" (.unseen), que dura hasta abrirla.
      Excepcion: si la persona la estuvo usando hace poco (toco,
      escribio o le dio a un boton adentro en el ultimo minuto y
      medio), el cambio casi seguro es suyo -- acaba de mandar algo --
      y la tarjeta se queda abierta como siempre.
      -> GSOrderCards.closeOnChange(card)

   2. "No deberia de poder haber mas de una tarjeta abierta al mismo
      tiempo en la version cel": en pantallas de celular,
      - no existe "fijar" una tarjeta con doble toque (el candadito que
        deja varias abiertas en Admin y Orders);
      - GSOrderCards.closeOthers(card, bodySelector) cierra las demas
        (para los portales que no tenian esta regla, como Tech).
      En computadora todo sigue igual.

   La tarjeta se reconoce por su atributo: data-order-id (Admin),
   data-order (Orders, Tech, Scheduling), data-rc (recurrentes en
   Tech), data-id (contratos en Admin).
============================================================ */
(function () {
  'use strict';
  if (window.GSOrderCards) return;

  var PHONE = '(max-width: 768px)';
  var CARD_SEL = '.order-card, .rc-card';
  var RECENT_MS = 90000;
  var usedAt = {};

  function keyOf(card) {
    if (!card || !card.dataset) return '';
    var d = card.dataset;
    if (d.orderId) return d.orderId;
    if (d.order) return d.order;
    if (d.rc) return 'rc:' + d.rc;
    if (d.id) return d.id;
    return card.id || '';
  }

  /* Se anota la tarjeta (y las que la envuelven, ej. el PO) cada vez
     que la persona hace algo adentro. */
  function noteUse(e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var now = Date.now();
    var card = el.closest(CARD_SEL);
    while (card) {
      var k = keyOf(card);
      if (k) usedAt[k] = now;
      card = card.parentElement ? card.parentElement.closest(CARD_SEL) : null;
    }
  }
  ['pointerdown', 'keydown', 'input', 'change'].forEach(function (t) {
    document.addEventListener(t, noteUse, true);
  });

  function isPhone() {
    return !!(window.matchMedia && window.matchMedia(PHONE).matches);
  }

  /* En cel no se fija nada con doble toque: el doble toque de Admin y
     Orders solo sirve para eso (fijar), asi que se para aqui antes de
     que llegue a la tarjeta. */
  document.addEventListener('dblclick', function (e) {
    if (isPhone() && e.target && e.target.closest && e.target.closest(CARD_SEL)) e.stopPropagation();
  }, true);

  function recentlyUsed(cardOrKey, ms) {
    var k = typeof cardOrKey === 'string' ? cardOrKey : keyOf(cardOrKey);
    return !!k && (Date.now() - (usedAt[k] || 0)) < (ms || RECENT_MS);
  }

  /* card: la tarjeta YA repintada con los datos nuevos. true = debe
     quedar cerrada (cambio de otra persona, marcado sin ver, y nadie
     la estaba usando). */
  function closeOnChange(card) {
    return !!(card && card.classList && card.classList.contains('unseen') && !recentlyUsed(card));
  }

  /* Solo en cel: cierra las otras tarjetas abiertas (menos las que
     envuelven a esta o estan dentro de ella). */
  function closeOthers(card, bodySelector) {
    if (!card || !isPhone()) return;
    var sel = bodySelector || '.order-body';
    document.querySelectorAll(sel + '.open').forEach(function (body) {
      var other = body.closest(CARD_SEL);
      if (!other || other === card || other.contains(card) || card.contains(other)) return;
      body.classList.remove('open');
    });
  }

  window.GSOrderCards = {
    isPhone: isPhone,
    keyOf: keyOf,
    recentlyUsed: recentlyUsed,
    closeOnChange: closeOnChange,
    closeOthers: closeOthers
  };
})();
