/*
 * Instrumento de medida pasivo. Portado 1:1 de
 * poc/sandbox-video-probe-src/probe.js:71-211.
 *
 * REGLAS DURAS (no relajar):
 *   - La salida son booleanos y NOMBRES de error. Nunca valores.
 *   - Nunca imprime ni transmite cookies, tokens ni sesskey reales.
 *   - Nunca hace red, nunca hace POST, nunca envía un formulario.
 *   - Nunca llama a un mutador SCORM. Solo DETECTA si el objeto es alcanzable.
 *   - Nunca navega el top. Solo DETECTA si es alcanzable.
 *   - Único efecto lateral: abrir y cerrar al instante un popup 1x1 about:blank.
 */
import { createResult, recordError } from './result.js';

export function measure(win) {
  const w = win || window;
  const R = createResult();

  // ---- 13. Origen opaco --------------------------------------------------
  try {
    const originStr = typeof w.origin === 'string' ? w.origin : w.location && w.location.origin;
    R.isOpaqueOrigin = originStr === 'null' || originStr === null;
  } catch (e) { recordError(R, 'isOpaqueOrigin', e); }

  // ---- 14. ¿Podemos leer nuestro propio atributo sandbox? ----------------
  // frameElement solo es alcanzable si el embebido es de mismo origen.
  try {
    const fe = w.frameElement; // lanza (SecurityError) si cross-origin/opaco
    if (fe && typeof fe.getAttribute === 'function') {
      R.sandboxAttr = fe.getAttribute('sandbox') || 'none';
    }
  } catch (e) { R.sandboxAttr = 'unreadable'; recordError(R, 'sandboxAttr', e); }

  // ---- 2. Acceso a window.parent ----------------------------------------
  let hasParent = false;
  try {
    hasParent = !!(w.parent && w.parent !== w);
    if (hasParent) {
      // Leer location.href de un padre cross-origin lanza; en mismo origen funciona.
      void w.parent.location.href;
      R.canAccessParent = true;
    }
  } catch (e) { recordError(R, 'canAccessParent', e); }

  // ---- 3/4. Documento y cookie del padre (solo presencia, valores redactados)
  try {
    if (hasParent) {
      const pdoc = w.parent.document; // lanza si cross-origin
      if (pdoc) {
        R.canReadParentDocument = true;
        // Se toca cookie solo para saber SI es legible. Nunca se conserva,
        // imprime ni transmite. El valor se queda en 'REDACTED'.
        const c = pdoc.cookie;
        R.canReadParentCookie = typeof c === 'string';
      }
    }
  } catch (e) { recordError(R, 'canReadParentDocument', e); }

  // ---- 5. Localizar un sesskey (solo presencia, valor redactado) ---------
  try {
    if (R.canReadParentDocument) {
      const pdoc = w.parent.document;
      const hasInput = !!pdoc.querySelector('input[name="sesskey"]');
      let hasCfg = false;
      try { hasCfg = !!(w.parent.M && w.parent.M.cfg && w.parent.M.cfg.sesskey); } catch (e2) { /* ignorado */ }
      R.canFindSesskey = hasInput || hasCfg;
    }
  } catch (e) { recordError(R, 'canFindSesskey', e); }

  // ---- 6. Localizar formularios/enlaces de edición (solo presencia) ------
  try {
    if (R.canReadParentDocument) {
      const pdoc = w.parent.document;
      const forms = pdoc.querySelectorAll('form');
      for (let i = 0; i < forms.length; i++) {
        const act = forms[i].getAttribute('action') || '';
        if (/course\/(edit|modedit|management)|editsection|mod\.php|modedit\.php/i.test(act)) {
          R.canFindCourseEditForms = true; break;
        }
      }
      const links = pdoc.querySelectorAll('a[href]');
      for (let j = 0; j < links.length; j++) {
        const href = links[j].getAttribute('href') || '';
        if (/course\/(edit|modedit|management)|editsection|admin\//i.test(href)) {
          R.canFindCourseEditLinks = true; break;
        }
      }
    }
  } catch (e) { recordError(R, 'canFindCourseEditForms', e); }

  // ---- 7. Alcance del top (NO se navega) --------------------------------
  try {
    if (w.top && w.top !== w) {
      void w.top.location.href; // lanza si cross-origin/opaco
      R.canAccessTop = true;
    } else if (w.top === w) {
      R.canAccessTop = true; // SOMOS el top (página suelta)
    }
  } catch (e) { recordError(R, 'canAccessTop', e); }

  // ---- 8. Popups (abrir y cerrar al instante; inocuo) --------------------
  try {
    const p = w.open('about:blank', '_blank', 'width=1,height=1');
    if (p) { R.canOpenPopups = true; try { p.close(); } catch (e3) { /* ignorado */ } }
  } catch (e) { recordError(R, 'canOpenPopups', e); }

  // ---- 9. postMessage (feature-detect; no se envía nada) ----------------
  try {
    R.canUsePostMessage = typeof w.postMessage === 'function';
    R.canPostMessageToParent = hasParent && typeof w.parent.postMessage === 'function';
  } catch (e) { recordError(R, 'canUsePostMessage', e); }

  // ---- 10. API SCORM alcanzable (solo DETECTAR; nunca se invoca) --------
  try {
    let cur = w;
    let tries = 0;
    let api = null;
    let flavor = 'none';
    while (cur && tries < 20) {
      if (cur.API_1484_11) { api = cur.API_1484_11; flavor = 'API_1484_11 (SCORM 2004)'; break; }
      if (cur.API) { api = cur.API; flavor = 'API (SCORM 1.2)'; break; }
      if (cur.parent && cur.parent !== cur) { cur = cur.parent; tries++; } else { break; }
    }
    if (!api) {
      try {
        if (w.top && w.top.opener) {
          const ow = w.top.opener;
          if (ow.API_1484_11) { api = ow.API_1484_11; flavor = 'API_1484_11 (opener)'; }
          else if (ow.API) { api = ow.API; flavor = 'API (opener)'; }
        }
      } catch (e4) { /* ignorado */ }
    }
    R.canCallScormApi = !!api; // alcanzable; deliberadamente NO se invoca
    R.scormApiFlavor = flavor;
  } catch (e) { recordError(R, 'canCallScormApi', e); }

  // ---- 11. Almacenamiento ------------------------------------------------
  try {
    const K = '__exe_poc_probe__';
    w.localStorage.setItem(K, '1');
    R.canUseLocalStorage = w.localStorage.getItem(K) === '1';
    w.localStorage.removeItem(K);
  } catch (e) { recordError(R, 'canUseLocalStorage', e); }
  try {
    const K2 = '__exe_poc_probe_s__';
    w.sessionStorage.setItem(K2, '1');
    R.canUseSessionStorage = w.sessionStorage.getItem(K2) === '1';
    w.sessionStorage.removeItem(K2);
  } catch (e) { recordError(R, 'canUseSessionStorage', e); }

  // ---- 14b. Mismo origen efectivo (derivado) -----------------------------
  // Si podemos leer el documento del padre sin estar en origen opaco, el
  // embebido concedió de hecho mismo origen (allow-same-origin, o ningún sandbox).
  R.sandboxAllowsSameOrigin = R.canReadParentDocument && !R.isOpaqueOrigin;

  // ---- 15. Escape del sandbox: DETECTADO, NUNCA INTENTADO ---------------
  R.sandboxEscapeAttempted = false;
  R.sandboxEscape = false; // no se intenta, por diseño

  return R;
}
