/*
 * Clasificación del resultado de una demo en tres estados.
 *
 * El estado ámbar es el motivo de existir de este módulo: antes, una acción que
 * fallaba por permisos o por límites del entorno se leía igual que una contenida
 * por el sandbox. Eso es un error de interpretación, no de estética.
 */

const CONTAINED_MSG = 'El sandbox lo impidió: el recurso no pudo salir.';
const ESCAPED_MSG = 'El recurso llegó al anfitrión y lo modificó.';
const UNKNOWN_MSG =
  'Llegó al anfitrión, pero la acción no se completó (permisos, sesión o ' +
  'límites del entorno). NO es prueba de aislamiento.';

export const DEMO_STATES = {
  idle: { cls: 'st-idle', icon: '•', label: 'sin ejecutar' },
  running: { cls: 'st-run', icon: '⏳', label: 'ejecutando…' },
  contained: { cls: 'st-good', icon: '🛡', label: 'BLOQUEADO — no pudo escapar del sandbox' },
  escaped: { cls: 'st-bad', icon: '☠', label: 'ESCAPE — ha modificado el anfitrión' },
  unknown: { cls: 'st-warn', icon: '⚠', label: 'INDETERMINADO — no lo bloqueó el sandbox' },
};

// Claves cuyo valor "ganador" prueba que la acción se completó en el anfitrión.
const WIN = {
  created: (v) => v === true,
  renamed: (v) => v === true,
  renamedViaForm: (v) => v === true,
  photoChanged: (v) => v === true,
  activityAdded: (v) => v === true,
  itemCreated: (v) => v === true,
  fileUploaded: (v) => v === true,
  displayNameChanged: (v) => v === true,
  forumMessages: (v) => typeof v === 'number' && v > 0,
  avatarSwappedInDom: (v) => typeof v === 'number' && v > 0,
  mediaUpload: (v) => typeof v === 'string' && v.indexOf('ok') === 0,
  rest: (v) => typeof v === 'string' && v.indexOf('ok') === 0,
  form: (v) => typeof v === 'string' && v.indexOf('ok') === 0,
  posts: listCreated,
  pages: listCreated,
};

function listCreated(v) {
  if (!v || typeof v.length !== 'number') return false;
  for (let i = 0; i < v.length; i++) {
    if (String(v[i]).charAt(0) === '#') return true;
  }
  return false;
}

export function classifyDemoResult(raw, ctx) {
  const opaque = Boolean(ctx && ctx.isOpaqueOrigin);
  const text = typeof raw === 'string' ? raw : safeStringify(raw);

  if (/^BLOQUEADO/i.test(text) || /SecurityError/.test(text)) {
    return { state: 'contained', message: CONTAINED_MSG };
  }

  const obj = typeof raw === 'object' && raw !== null ? raw : tryParse(text);

  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(WIN)) {
      if (Object.prototype.hasOwnProperty.call(obj, key) && WIN[key](obj[key])) {
        return { state: 'escaped', message: ESCAPED_MSG };
      }
    }
    return opaque
      ? { state: 'contained', message: CONTAINED_MSG }
      : { state: 'unknown', message: UNKNOWN_MSG };
  }

  if (/^OK/i.test(text) || /restaurad/i.test(text)) {
    return { state: 'escaped', message: ESCAPED_MSG };
  }

  return opaque
    ? { state: 'contained', message: CONTAINED_MSG }
    : { state: 'unknown', message: UNKNOWN_MSG };
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}
