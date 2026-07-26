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
 *
 * El HTML estático viene con el AVISO visible y la MEDICIÓN oculta, no al
 * revés: si esta función no llega a correr —JavaScript desactivado, la CSP
 * del anfitrión bloqueando el <script> inline, o el bundle fallando—, lo que
 * queda en pantalla dice que no hubo medición, en vez de una tabla de guiones
 * que se leería como una medición que salió vacía. Revelar es el último paso
 * de todo el rellenado, para que un fallo a mitad falle cerrado.
 */
import { CAPABILITIES } from './help.js';

export const MEDICION_ATTR = 'data-exe-probe-medicion';
const MOUNTED_ATTR = 'data-exe-probe-medicion-mounted';
export const NOSCRIPT_ATTR = 'data-exe-probe-noscript';
export const MEDIDO_ATTR = 'data-exe-probe-medido';

const LEVEL_CLASSES = ['is-aislado', 'is-sin-aislamiento', 'is-parcial'];
const LEVEL_CLASS = { good: 'is-aislado', bad: 'is-sin-aislamiento', warn: 'is-parcial' };

// Severidad por clave, desde la misma capabilities.json que usa verdict.js y
// que exelib.py lee en Python para construir la tabla.
const SEVERIDAD = {};
for (const c of CAPABILITIES) SEVERIDAD[c.key] = c.severidad;

// Las tres condicionales no se acusan. «Ha podido» en rojo junto a «leer la
// cookie de sesión» mete en el mismo saco la capacidad que el contenido SCORM
// legítimo necesita y el acceso que compromete la sesión; pintarlas iguales
// era el error. No alcanzada se pinta igual en los dos casos: bloqueado es
// bloqueado.
function resultadoCelda(key, val) {
  if (!val) {
    return { texto: SEVERIDAD[key] === 'condicional' ? 'No disponible' : 'Bloqueado', cls: 'is-bloqueado' };
  }
  return SEVERIDAD[key] === 'condicional'
    ? { texto: 'Disponible', cls: 'is-condicional' }
    : { texto: 'Ha podido', cls: 'is-alcanzado' };
}

// Intercambia aviso y medición. Se llama SOLO al final de un rellenado
// completo: si algo lanzó antes, el aviso sigue en pie.
function revelarMedicion(container) {
  const aviso = container.querySelector('[' + NOSCRIPT_ATTR + ']');
  if (aviso) aviso.hidden = true;
  const medido = container.querySelector('[' + MEDIDO_ATTR + ']');
  if (medido) medido.hidden = false;
}

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
      const r = resultadoCelda(c.key, val);
      resultadoCell.textContent = r.texto;
      resultadoCell.classList.remove('is-alcanzado', 'is-bloqueado', 'is-condicional');
      resultadoCell.classList.add(r.cls);
    }
  }

  revelarMedicion(container);
  container.setAttribute(MOUNTED_ATTR, 'true');
}
