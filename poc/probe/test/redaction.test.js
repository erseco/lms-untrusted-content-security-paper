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
    '<link href="/application/asset/css/x.css">';
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

  it('las claves redactadas conservan su marcador', () => {
    const r = measure(loadedParent());
    expect(r.parentCookieValue).toBe('REDACTED');
    expect(r.sesskeyValue).toBe('REDACTED');
    expect(r.parentCookieLength).toBe('redacted');
    expect(r.parentCookieNames).toBe('redacted');
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
