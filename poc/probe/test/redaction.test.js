import { describe, it, expect } from 'vitest';
import { measure } from '../src/core/measure.js';
import { ADAPTERS } from '../src/hosts/index.js';
import { createContext } from '../src/hosts/contract.js';

// Centinelas: si alguno aparece en la salida, la sonda está filtrando.
//
// No todos muerden hoy por el mismo motivo. Dos grupos:
//
//   VIVOS — el código bajo prueba desreferencia el valor real y lo reduce a
//   un booleano/constante; una regresión que empiece a exponerlo rompe el
//   test ahora mismo:
//     - COOKIE-CENTINELA       -> core measure.js: `const c = pdoc.cookie`
//     - SESSKEY-CENTINELA      -> core measure.js: `M.cfg.sesskey`
//     - NONCE-CENTINELA        -> wordpress.js: `pw.wpApiSettings.nonce`
//     - REQUESTTOKEN-CENTINELA -> nextcloud-actions.js `readRequestToken()`:
//       `meta[name=requesttoken].getAttribute('content')`
//
//   DEFENSA EN PROFUNDIDAD — el nodo se toca pero ningún detect()/measure()
//   pasivo lee su valor todavía, así que estos dos no pueden fallar con el
//   código actual; quedan como guardia para el día en que alguien empiece a
//   leerlos:
//     - CSRF-CENTINELA    -> omeka.js solo comprueba presencia
//       (`pd.querySelector('input[name="csrf"]')`), nunca lee `.value`
//     - PASSWORD-CENTINELA -> ningún detect()/measure() consulta un input
//       password; el único uso del término está en la demo de showcase.js
//       (dentro de run(), fuera del alcance de este test)
//
//   Por el mismo motivo, las aserciones `detect:` de más abajo tampoco
//   pueden fallar hoy: signalsOf() en los cinco adaptadores construye sus
//   señales a partir de literales fijos, nunca de valores medidos.
const SENTINELS = [
  'COOKIE-CENTINELA', 'SESSKEY-CENTINELA', 'NONCE-CENTINELA',
  'CSRF-CENTINELA', 'REQUESTTOKEN-CENTINELA', 'PASSWORD-CENTINELA',
];

function loadedParent() {
  const doc = document.implementation.createHTMLDocument('anfitrión');
  doc.head.innerHTML = '<meta name="requesttoken" content="REQUESTTOKEN-CENTINELA">' +
    '<meta name="generator" content="Omeka S 4.1.0">';
  doc.head.setAttribute('data-user', 'alumna');
  doc.body.id = 'page-course-view';
  doc.body.className = 'wp-admin';
  doc.body.innerHTML =
    '<input name="sesskey" value="SESSKEY-CENTINELA">' +
    '<input name="csrf" value="CSRF-CENTINELA">' +
    '<input type="password" value="PASSWORD-CENTINELA">' +
    '<div id="wpadminbar"></div><div id="nextcloud"></div>' +
    '<form action="/course/edit.php"></form>' +
    '<a href="/course/management.php">x</a><a href="/admin/item/1">y</a>' +
    '<link href="/wp-content/x.css"><link href="/apps/files/x.css">' +
    '<link href="/application/asset/css/x.css">' +
    // Rutas nuevas de las medidas de escalada (tarea 26b): matriculación en
    // Moodle, administración de plugins y alta de usuarios en WordPress,
    // edición de metadatos y permisos del sitio en Omeka S. Ninguna de
    // estas medidas lee más que la presencia del enlace/formulario, pero se
    // ejercitan aquí igual que el resto: si algún día empezaran a leer un
    // valor, este test lo detectaría.
    '<a href="/enrol/users.php?id=7">matricular</a>' +
    '<li id="menu-plugins"><a href="plugins.php">plugins</a></li>' +
    '<li id="menu-users"><a href="user-new.php">usuarios</a></li>' +
    '<a href="/admin/item/42/edit">editar ítem</a>' +
    '<a href="/admin/site/3/permission">permisos del sitio</a>';
  Object.defineProperty(doc, 'cookie', {
    get: () => 'MoodleSession=COOKIE-CENTINELA; wordpress_logged_in=COOKIE-CENTINELA',
    configurable: true,
  });

  const parent = {
    document: doc,
    location: { href: 'http://localhost/course/view.php' },
    postMessage() {},
    M: { cfg: { sesskey: 'SESSKEY-CENTINELA' } },
    wpApiSettings: { nonce: 'NONCE-CENTINELA', root: 'http://localhost/wp-json/' },
    OC: { getCurrentUser: () => ({ uid: 'alumna', displayName: 'Alumna' }) },
  };
  const win = {
    origin: 'http://localhost',
    parent,
    frameElement: null,
    postMessage() {},
    open: () => ({ close() {} }),
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
  };
  win.top = parent;
  return win;
}

function assertClean(label, payload) {
  const text = JSON.stringify(payload);
  for (const s of SENTINELS) {
    expect(`${label}: ${text.includes(s) ? 'FUGA de ' + s : 'limpio'}`).toBe(`${label}: limpio`);
  }
}

describe('no-fuga de datos sensibles', () => {
  it('las medidas del núcleo no publican ningún valor sensible', () => {
    assertClean('measure', measure(loadedParent()));
  });

  it('las medidas de los cuatro adaptadores tampoco', () => {
    const ctx = createContext({ win: loadedParent(), journal: null, buildId: 'b' });
    for (const adapter of ADAPTERS) {
      assertClean('measure:' + adapter.id, adapter.measure(ctx));
      assertClean('detect:' + adapter.id, adapter.detect(ctx));
    }
  });

  // Las cinco medidas de escalada (tarea 26b: matriculación en Moodle,
  // administración de plugins y alta de usuarios en WordPress, edición de
  // metadatos y permisos del sitio en Omeka S) son la versión medida de
  // cuatro acciones que la maqueta de diseño proponía y que este paquete no
  // implementa. Con el DOM del padre cargado con los enlaces/formularios
  // correspondientes (ver loadedParent más arriba), deben dar true — nunca
  // otra cosa que un booleano.
  it('las cinco medidas de escalada son solo booleanos, nunca una URL o un valor', () => {
    const ctx = createContext({ win: loadedParent(), journal: null, buildId: 'b' });
    const moodle = ADAPTERS.find((a) => a.id === 'moodle').measure(ctx);
    const wordpress = ADAPTERS.find((a) => a.id === 'wordpress').measure(ctx);
    const omeka = ADAPTERS.find((a) => a.id === 'omeka').measure(ctx);
    const escalationFields = {
      moodleEnrolReachable: moodle.moodleEnrolReachable,
      wpPluginAdminReachable: wordpress.wpPluginAdminReachable,
      wpUserCreateReachable: wordpress.wpUserCreateReachable,
      omekaMetadataEditReachable: omeka.omekaMetadataEditReachable,
      omekaPermissionsReachable: omeka.omekaPermissionsReachable,
    };
    for (const [key, value] of Object.entries(escalationFields)) {
      expect(typeof value).toBe('boolean');
      expect(value).toBe(true);
    }
    assertClean('escalation', escalationFields);
  });

  it('las claves redactadas conservan su marcador', () => {
    const r = measure(loadedParent());
    expect(r.parentCookieValue).toBe('REDACTED');
    expect(r.sesskeyValue).toBe('REDACTED');
    expect(r.parentCookieLength).toBe('redacted');
    expect(r.parentCookieNames).toBe('redacted');
  });

  // sesskeyLength/parentCookieCount/parentCookieSessionLikeCount son campos
  // NUEVOS (añadidos, nunca sustituyen a los de arriba): solo presencia,
  // longitud o recuento — nunca el valor ni el nombre de una cookie.
  it('longitud y recuento son números, nunca el valor ni el nombre de la cookie', () => {
    const r = measure(loadedParent());
    expect(typeof r.sesskeyLength).toBe('number');
    expect(typeof r.parentCookieCount).toBe('number');
    expect(typeof r.parentCookieSessionLikeCount).toBe('number');
    assertClean('sesskeyLength/parentCookieCount', {
      sesskeyLength: r.sesskeyLength,
      parentCookieCount: r.parentCookieCount,
      parentCookieSessionLikeCount: r.parentCookieSessionLikeCount,
    });
  });

  it('los errores registrados solo llevan el nombre del tipo', () => {
    const boom = () => { throw new DOMException('cookie=COOKIE-CENTINELA', 'SecurityError'); };
    const win = {
      origin: 'null',
      get parent() { return boom(); },
      get frameElement() { return boom(); },
      get localStorage() { return boom(); },
      get sessionStorage() { return boom(); },
      postMessage() {},
      open: () => null,
    };
    win.top = { get location() { return boom(); } };
    assertClean('errores', measure(win).errors);
  });

  it('ninguna medida pasiva declara haber enviado un formulario o navegado el top', () => {
    const r = measure(loadedParent());
    expect(r.canSubmitCourseEditForm).toBe('not_attempted');
    expect(r.canAttemptTopNavigation).toBe('not_attempted');
  });
});
