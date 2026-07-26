/*
 * Vista nativa del apartado 1 («Resultado de la medición»).
 *
 * A diferencia del resto de vistas (línea, completo), esta no monta ningún
 * panel: exelib.py ya generó, dentro del propio iDevice de texto de la
 * página, el HTML estático de la tabla — cabecera, y una fila por cada
 * CORE_VECTOR con su descripción en lenguaje llano y su propiedad técnica ya
 * escritas. Esta función solo rellena los huecos (celdas de «Valor
 * obtenido»/«Resultado» y la caja de veredicto) con createElement/
 * textContent — nunca innerHTML con datos medidos, y nunca un panel
 * flotante ni Shadow DOM en esta página.
 */
import { CAPABILITIES } from './help.js';

export const MEDICION_ATTR = 'data-exe-probe-medicion';
const MOUNTED_ATTR = 'data-exe-probe-medicion-mounted';

const LEVEL_CLASSES = ['is-aislado', 'is-sin-aislamiento', 'is-parcial'];
const LEVEL_CLASS = { good: 'is-aislado', bad: 'is-sin-aislamiento', warn: 'is-parcial' };

// «Valor obtenido»: presencia, longitud y recuento — nunca el valor. Las
// dos claves sensibles (cookie de sesión, sesskey) llevan una cifra
// derivada (measure.js: parentCookieCount/parentCookieSessionLikeCount,
// sesskeyLength); las demás son booleanos puros, así que solo cabe decir si
// la capacidad estuvo presente o no.
function redactedValor(key, result) {
  const val = result[key];
  if (key === 'canReadParentCookie') {
    return val
      ? result.parentCookieCount + ' cookie(s), ' + result.parentCookieSessionLikeCount + ' de sesión'
      : 'no alcanzable';
  }
  if (key === 'canFindSesskey') {
    return val ? 'presente · ' + result.sesskeyLength + ' caracteres' : 'no alcanzable';
  }
  return val ? 'presente' : 'no alcanzable';
}

export function renderMedicionNative(doc, container, scene) {
  if (!container || typeof container.querySelector !== 'function') return;
  if (container.getAttribute(MOUNTED_ATTR) === 'true') return;

  const result = scene.result;
  const verdict = scene.verdict;

  const verdictBox = container.querySelector('[data-exe-probe-verdict]');
  if (verdictBox) {
    for (const cls of LEVEL_CLASSES) verdictBox.classList.remove(cls);
    verdictBox.classList.add(LEVEL_CLASS[verdict.level] || 'is-parcial');
    const title = verdictBox.querySelector('[data-exe-probe-verdict-title]');
    if (title) title.textContent = verdict.icon + ' ' + verdict.title;
    const text = verdictBox.querySelector('[data-exe-probe-verdict-text]');
    if (text) text.textContent = verdict.text;
  }

  for (const c of CAPABILITIES) {
    const row = container.querySelector('[data-exe-probe-row="' + c.key + '"]');
    if (!row) continue;
    const val = result[c.key];

    const valorCell = row.querySelector('[data-exe-probe-valor]');
    if (valorCell) valorCell.textContent = redactedValor(c.key, result);

    const resultadoCell = row.querySelector('[data-exe-probe-resultado]');
    if (resultadoCell) {
      resultadoCell.textContent = val ? 'Ha podido' : 'Bloqueado';
      resultadoCell.classList.remove('is-alcanzado', 'is-bloqueado');
      resultadoCell.classList.add(val ? 'is-alcanzado' : 'is-bloqueado');
    }
  }

  container.setAttribute(MOUNTED_ATTR, 'true');
}
