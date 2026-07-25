import { describe, it, expect } from 'vitest';
import { errName } from '../src/core/errors.js';
import { createResult, recordError, RESULT_KEYS } from '../src/core/result.js';

// Copia literal de las claves de poc/sandbox-video-probe-src/probe.js:39-67.
// Este test es el candado del contrato: si alguien renombra una clave, falla.
const FROZEN = [
  'canRunJavascript', 'canAccessParent', 'canReadParentDocument', 'canReadParentCookie',
  'parentCookieValue', 'parentCookieLength', 'parentCookieNames', 'canFindSesskey',
  'sesskeyValue', 'canFindCourseEditForms', 'canFindCourseEditLinks',
  'canSubmitCourseEditForm', 'canAccessTop', 'canAttemptTopNavigation', 'canOpenPopups',
  'canUsePostMessage', 'canPostMessageToParent', 'canCallScormApi', 'scormApiFlavor',
  'canUseLocalStorage', 'canUseSessionStorage', 'isOpaqueOrigin', 'sandboxAllowsSameOrigin',
  'sandboxAttr', 'sandboxEscape', 'sandboxEscapeAttempted', 'errors',
];

describe('errName', () => {
  it('devuelve solo el nombre, nunca el mensaje', () => {
    const e = new DOMException('la cookie era abc123', 'SecurityError');
    expect(errName(e)).toBe('SecurityError');
    expect(errName(e)).not.toMatch(/abc123/);
  });

  it('cae a Error cuando no hay nombre', () => {
    expect(errName({})).toBe('Error');
  });

  it('devuelve null sin error', () => {
    expect(errName(null)).toBe(null);
  });
});

describe('createResult', () => {
  it('declara exactamente las 27 claves congeladas', () => {
    expect(RESULT_KEYS).toEqual(FROZEN);
    expect(Object.keys(createResult())).toEqual(FROZEN);
  });

  it('arranca con los valores iniciales del contrato', () => {
    const r = createResult();
    expect(r.canRunJavascript).toBe(true);
    expect(r.parentCookieValue).toBe('REDACTED');
    expect(r.parentCookieLength).toBe('redacted');
    expect(r.parentCookieNames).toBe('redacted');
    expect(r.sesskeyValue).toBe('REDACTED');
    expect(r.canSubmitCourseEditForm).toBe('not_attempted');
    expect(r.canAttemptTopNavigation).toBe('not_attempted');
    expect(r.scormApiFlavor).toBe('none');
    expect(r.sandboxAttr).toBe('unknown');
    expect(r.errors).toEqual({});
  });

  it('cada llamada devuelve un objeto independiente', () => {
    const a = createResult();
    const b = createResult();
    a.canAccessParent = true;
    expect(b.canAccessParent).toBe(false);
    expect(a.errors).not.toBe(b.errors);
  });
});

describe('recordError', () => {
  it('guarda el nombre bajo la clave indicada', () => {
    const r = createResult();
    recordError(r, 'canAccessParent', new DOMException('secreto', 'SecurityError'));
    expect(r.errors.canAccessParent).toBe('SecurityError');
  });
});
