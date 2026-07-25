import { describe, it, expect, vi } from 'vitest';
import { measure } from '../src/core/measure.js';

// Ventana falsa: mismo origen, con DOM de Moodle en el padre.
function sameOriginWin() {
  const parentDoc = document.implementation.createHTMLDocument('padre');
  parentDoc.body.innerHTML = `
    <input name="sesskey" value="SESSKEY-CENTINELA">
    <form action="/course/edit.php"></form>
    <a href="/course/management.php">gestionar</a>`;
  Object.defineProperty(parentDoc, 'cookie', {
    get: () => 'MoodleSession=COOKIE-CENTINELA',
    configurable: true,
  });

  const parent = {
    document: parentDoc,
    location: { href: 'http://localhost/course/view.php?id=2' },
    postMessage() {},
    M: { cfg: { sesskey: 'SESSKEY-CENTINELA' } },
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

// Ventana falsa: origen opaco, todo acceso al padre lanza.
function opaqueWin() {
  const boom = () => { throw new DOMException('bloqueado', 'SecurityError'); };
  const parent = {
    get document() { return boom(); },
    get location() { return boom(); },
    postMessage() {},
  };
  const win = {
    origin: 'null',
    parent,
    get frameElement() { return boom(); },
    postMessage() {},
    open: () => null,
    get localStorage() { return boom(); },
    get sessionStorage() { return boom(); },
  };
  win.top = parent;
  return win;
}

describe('measure — mismo origen (legacy)', () => {
  it('detecta el acceso al padre y a su documento', () => {
    const r = measure(sameOriginWin());
    expect(r.canAccessParent).toBe(true);
    expect(r.canReadParentDocument).toBe(true);
    expect(r.canReadParentCookie).toBe(true);
  });

  it('localiza sesskey y formularios de edición sin publicar sus valores', () => {
    const r = measure(sameOriginWin());
    expect(r.canFindSesskey).toBe(true);
    expect(r.canFindCourseEditForms).toBe(true);
    expect(r.canFindCourseEditLinks).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/SESSKEY-CENTINELA/);
    expect(JSON.stringify(r)).not.toMatch(/COOKIE-CENTINELA/);
  });

  it('deriva sandboxAllowsSameOrigin', () => {
    const r = measure(sameOriginWin());
    expect(r.sandboxAllowsSameOrigin).toBe(true);
    expect(r.isOpaqueOrigin).toBe(false);
  });

  it('nunca intenta enviar formularios ni navegar el top', () => {
    const r = measure(sameOriginWin());
    expect(r.canSubmitCourseEditForm).toBe('not_attempted');
    expect(r.canAttemptTopNavigation).toBe('not_attempted');
  });

  it('nunca declara un escape', () => {
    const r = measure(sameOriginWin());
    expect(r.sandboxEscape).toBe(false);
    expect(r.sandboxEscapeAttempted).toBe(false);
  });
});

describe('measure — origen opaco (seguro)', () => {
  it('marca origen opaco y no alcanza nada del padre', () => {
    const r = measure(opaqueWin());
    expect(r.isOpaqueOrigin).toBe(true);
    expect(r.canAccessParent).toBe(false);
    expect(r.canReadParentDocument).toBe(false);
    expect(r.canReadParentCookie).toBe(false);
    expect(r.canFindSesskey).toBe(false);
    expect(r.sandboxAllowsSameOrigin).toBe(false);
  });

  it('registra solo el nombre del error', () => {
    const r = measure(opaqueWin());
    expect(r.errors.canAccessParent).toBe('SecurityError');
    expect(JSON.stringify(r.errors)).not.toMatch(/bloqueado/);
  });

  it('marca el sandbox como ilegible en vez de lanzar', () => {
    const r = measure(opaqueWin());
    expect(r.sandboxAttr).toBe('unreadable');
  });

  it('no abre popups cuando el sandbox lo impide', () => {
    const r = measure(opaqueWin());
    expect(r.canOpenPopups).toBe(false);
  });
});

describe('measure — SCORM', () => {
  it('detecta la API sin invocar ningún método', () => {
    const win = sameOriginWin();
    const getValue = vi.fn();
    win.parent.API = { LMSGetValue: getValue, LMSSetValue: getValue };
    const r = measure(win);
    expect(r.canCallScormApi).toBe(true);
    expect(r.scormApiFlavor).toMatch(/SCORM 1\.2/);
    expect(getValue).not.toHaveBeenCalled();
  });

  it('prefiere SCORM 2004 cuando ambas están', () => {
    const win = sameOriginWin();
    win.parent.API = {};
    win.parent.API_1484_11 = {};
    expect(measure(win).scormApiFlavor).toMatch(/SCORM 2004/);
  });
});
