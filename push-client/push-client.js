(function () {
  'use strict';
  if (window.GSPush) return;
  /* ================================================================
     GSPush -- notificaciones push en el NAVEGADOR (27/09/2026). Gratis
     (Web Push). Lo usa Orders para el celular del cliente; es el mismo
     mecanismo que Tech ya tenia en su shared.js.
       GSPush.state()  'on' | 'off' | 'denied' | 'ios-install' | 'unsupported'
         ios-install: en iPhone solo funciona desde el icono en la
         pantalla de inicio (Compartir > Agregar a inicio).
       GSPush.subscribe(vapidPublicKey) -> la suscripcion (JSON) o lanza
       GSPush.current()                  -> la suscripcion actual o null
       GSPush.unsubscribe()              -> la borra del navegador
     El service worker es /sw.js de cada portal (muestra el aviso y abre
     la url que trae).
  ================================================================ */
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function hasApi() { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
  function state() {
    if (isIOS() && !isStandalone()) return 'ios-install';
    if (!hasApi()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.permission === 'granted' ? 'on' : 'off';
  }
  function keyBytes(k) {
    const b64 = String(k).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function registration() {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    return reg;
  }
  async function subscribe(vapidPublicKey) {
    if (!hasApi()) throw new Error('This browser cannot show notifications.');
    if (Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') throw new Error('Notifications were not allowed.');
    }
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) });
    return sub.toJSON();
  }
  async function current() {
    if (!hasApi() || Notification.permission !== 'granted') return null;
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? sub.toJSON() : null;
  }
  async function unsubscribe() {
    const reg = hasApi() ? await navigator.serviceWorker.getRegistration('/sw.js') : null;
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) await sub.unsubscribe();
  }
  window.GSPush = { isIOS: isIOS, isStandalone: isStandalone, state: state, subscribe: subscribe, current: current, unsubscribe: unsubscribe };
})();
