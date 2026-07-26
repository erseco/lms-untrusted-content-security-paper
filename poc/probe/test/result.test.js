import { describe, it, expect } from 'vitest';
import { errName } from '../src/core/errors.js';
import { createResult, recordError, RESULT_KEYS } from '../src/core/result.js';

// Copia literal de las claves de poc/sandbox-video-probe-src/probe.js:39-67.
// Este test es el candado del contrato: si alguien renombra o quita una
// clave original, falla. El contrato SÍ permite añadir claves nuevas al
// final (nunca renombrar/quitar/cambiar tipo — ver la cabecera de
// result.js): FROZEN_CORE_27 es ese candado original; ADDED_TASK_25_FIX son
// las tres añadidas para la tabla nativa del apartado 1 (longitud de
// sesskey, recuento de cookies) — solo presencia/longitud/recuento, nunca
// un valor, así que no rompen la disciplina que el candado protege.
const FROZEN_CORE_27 = [
  'canRunJavascript', 'canAccessParent', 'canReadParentDocument', 'canReadParentCookie',
  'parentCookieValue', 'parentCookieLength', 'parentCookieNames', 'canFindSesskey',
  'sesskeyValue', 'canFindCourseEditForms', 'canFindCourseEditLinks',
  'canSubmitCourseEditForm', 'canAccessTop', 'canAttemptTopNavigation', 'canOpenPopups',
  'canUsePostMessage', 'canPostMessageToParent', 'canCallScormApi', 'scormApiFlavor',
  'canUseLocalStorage', 'canUseSessionStorage', 'isOpaqueOrigin', 'sandboxAllowsSameOrigin',
  'sandboxAttr', 'sandboxEscape', 'sandboxEscapeAttempted', 'errors',
];
const ADDED_TASK_25_FIX = ['sesskeyLength', 'parentCookieCount', 'parentCookieSessionLikeCount'];
const FROZEN = [...FROZEN_CORE_27, ...ADDED_TASK_25_FIX];

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
  it('declara exactamente las 27 claves originales, en el mismo orden, más las 3 añadidas', () => {
    expect(RESULT_KEYS.slice(0, 27)).toEqual(FROZEN_CORE_27);
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
    expect(r.sesskeyLength).toBe(null);
    expect(r.parentCookieCount).toBe(null);
    expect(r.parentCookieSessionLikeCount).toBe(null);
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
