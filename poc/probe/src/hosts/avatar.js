/*
 * Avatar que usan las demos de acción para sustituir la foto de perfil.
 *
 * Antes esta imagen se descargaba de Wikimedia (un meme con copyright), lo que
 * convertía a la sonda en cliente de un tercero: la única petición cross-origin
 * de toda la PoC. Ahora el gráfico es propio (CC0, `poc/pwned-avatar.svg`) y
 * viaja dentro del bundle, así que las demos funcionan sin red, sin depender de
 * nadie y también donde una petición externa fallaría.
 *
 * Moodle y WordPress no aceptan SVG como foto de perfil, así que lo rasterizamos
 * a PNG con un canvas del propio documento de la sonda.
 */
import { AVATAR_SVG } from './avatar-svg.js';

export { AVATAR_SVG };

export var AVATAR_DATA_URI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(AVATAR_SVG);

// Rasteriza el avatar y devuelve cb(blobPng, dataUrl). Si el entorno no da
// canvas (jsdom en los tests, navegadores con canvas deshabilitado), llama a
// cb(null, AVATAR_DATA_URI): quien lo use puede seguir cambiando el DOM aunque
// no pueda subir un PNG, y lo reporta en vez de fingir que subió algo.
export function avatarPng(win, size, cb) {
  var px = size || 256;
  var g = null;
  var c = null;
  try {
    c = win.document.createElement('canvas');
    c.width = px; c.height = px;
    g = c.getContext ? c.getContext('2d') : null;
  } catch (e) { g = null; }
  if (!g) { cb(null, AVATAR_DATA_URI); return; }

  var done = false;
  var finish = function () {
    if (done) { return; }
    done = true;
    var dataUrl;
    try { dataUrl = c.toDataURL('image/png'); } catch (e) { dataUrl = AVATAR_DATA_URI; }
    if (!c.toBlob) { cb(null, dataUrl); return; }
    try { c.toBlob(function (blob) { cb(blob || null, dataUrl); }, 'image/png'); }
    catch (e) { cb(null, dataUrl); }
  };

  try {
    var img = new win.Image();
    img.onload = function () {
      try { g.drawImage(img, 0, 0, px, px); } catch (e) { /* se entrega el canvas vacío */ }
      finish();
    };
    img.onerror = function () { finish(); };
    img.src = AVATAR_DATA_URI;
  } catch (e) { finish(); }
}
