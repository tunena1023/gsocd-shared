/* ============================================================
   gsocd-shared/lib/photo-name.js -- el pedazo de fecha y azar del nombre
   de una foto subida ("AAAA-MM-DD_HHMMSS-xxxx"). Antes eran 7 copias
   iguales en los endpoints de subida (Admin upload-service-photo; Orders
   upload-client-photo / -recurring-photo / -service-photo; Tech
   upload-photo / upload-recurring-photo / upload-service-photo).

   fileTimestamp(d)  -> "AAAA-MM-DD_HHMMSS" (hora del servidor)
   randomSuffix()    -> 4 letras/numeros. Sin esto, 2 fotos en el mismo
                        segundo tenian el mismo nombre y el PUT de
                        SharePoint REEMPLAZABA la primera sin avisar.
   photoStamp(b, now)-> b.photoKey si es valido (camera-queue: la foto
                        trae su nombre desde que se tomo; si llega 2 veces
                        se escribe en el MISMO archivo, sin copia); si no,
                        fileTimestamp + '-' + randomSuffix.
   (lib/photo-log.photoStamp es otra cosa: saca ese pedazo de un nombre.)
============================================================ */
'use strict';

const PHOTO_KEY = /^\d{4}-\d{2}-\d{2}_\d{6}-[a-z0-9]{4,12}$/;

function fileTimestamp(d) {
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function photoStamp(b, now) {
  const k = String((b && b.photoKey) || '');
  return PHOTO_KEY.test(k) ? k : fileTimestamp(now || new Date()) + '-' + randomSuffix();
}

module.exports = { fileTimestamp, randomSuffix, photoStamp, PHOTO_KEY };
