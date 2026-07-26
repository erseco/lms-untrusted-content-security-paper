/*
 * Forma congelada de window.__EXE_POC_RESULT.
 *
 * Portado literalmente de poc/sandbox-video-probe-src/probe.js:39-67. El arnés
 * Playwright de evidencias/ y los resultados-*.json ya publicados dependen de
 * estas claves exactas: se pueden AÑADIR claves nuevas, nunca renombrar,
 * eliminar ni cambiar el tipo de las existentes.
 */
import { errName } from './errors.js';

export const RESULT_KEYS = [
  'canRunJavascript', 'canAccessParent', 'canReadParentDocument', 'canReadParentCookie',
  'parentCookieValue', 'parentCookieLength', 'parentCookieNames', 'canFindSesskey',
  'sesskeyValue', 'canFindCourseEditForms', 'canFindCourseEditLinks',
  'canSubmitCourseEditForm', 'canAccessTop', 'canAttemptTopNavigation', 'canOpenPopups',
  'canUsePostMessage', 'canPostMessageToParent', 'canCallScormApi', 'scormApiFlavor',
  'canUseLocalStorage', 'canUseSessionStorage', 'isOpaqueOrigin', 'sandboxAllowsSameOrigin',
  'sandboxAttr', 'sandboxEscape', 'sandboxEscapeAttempted', 'errors',
  // Añadidas para la tabla nativa del apartado 1 (nunca sustituyen las de
  // arriba): solo presencia/longitud/recuento, nunca el valor. Ver
  // measure.js — nunca se lee ni se conserva el token ni el nombre de una
  // cookie, solo su .length o cuántas hay.
  'sesskeyLength', 'parentCookieCount', 'parentCookieSessionLikeCount',
];

export function createResult() {
  return {
    canRunJavascript: true,
    canAccessParent: false,
    canReadParentDocument: false,
    canReadParentCookie: false,
    parentCookieValue: 'REDACTED',
    parentCookieLength: 'redacted',
    parentCookieNames: 'redacted',
    canFindSesskey: false,
    sesskeyValue: 'REDACTED',
    canFindCourseEditForms: false,
    canFindCourseEditLinks: false,
    canSubmitCourseEditForm: 'not_attempted',
    canAccessTop: false,
    canAttemptTopNavigation: 'not_attempted',
    canOpenPopups: false,
    canUsePostMessage: false,
    canPostMessageToParent: false,
    canCallScormApi: false,
    scormApiFlavor: 'none',
    canUseLocalStorage: false,
    canUseSessionStorage: false,
    isOpaqueOrigin: false,
    sandboxAllowsSameOrigin: false,
    sandboxAttr: 'unknown',
    sandboxEscape: false,
    sandboxEscapeAttempted: false,
    errors: {},
    sesskeyLength: null,
    parentCookieCount: null,
    parentCookieSessionLikeCount: null,
  };
}

export function recordError(result, key, e) {
  result.errors[key] = errName(e);
}
