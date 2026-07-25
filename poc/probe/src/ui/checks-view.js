/*
 * Pestañas Resumen y Detalle.
 *
 * Todo el DOM se construye con createElement y textContent: nunca innerHTML con
 * datos medidos. sandboxAttr, por ejemplo, viene de un atributo del anfitrión.
 */
import { CORE_VECTORS } from '../core/verdict.js';
import { RESULT_KEYS } from '../core/result.js';
import { CLAIM_TEXT } from '../core/media.js';
import { helpFor, DOC_BASE } from './help.js';

let uid = 0;

function el(doc, tag, text, css) {
  const node = doc.createElement(tag);
  if (text != null) node.textContent = text;
  if (css) node.style.cssText = css;
  return node;
}

// Claves cuyo valor real NUNCA debe imprimirse tal cual, pase lo que pase.
// measure.js las deja siempre fijas en 'REDACTED'/'redacted' (createResult()
// las inicializa así y ningún measure()/adapter las vuelve a escribir — ver
// test/redaction.test.js), pero esta es una segunda barrera, independiente,
// en la capa de RENDER: si algún día una edición futura de measure.js
// empezara a calcular aquí un valor de verdad, esta lista impide que
// checks-view.js lo imprima de todos modos. No basta con que la MEDIDA sea
// segura — el render tiene que serlo también, por su cuenta.
const NEVER_PRINT_VALUE = new Set([
  'parentCookieValue', 'parentCookieLength', 'parentCookieNames', 'sesskeyValue',
]);

function valueLabel(key, value) {
  if (NEVER_PRINT_VALUE.has(key)) return 'redactado';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value == null || value === '') return 'sin datos';
  return String(value);
}

function buildRow(doc, dataAttr, key, value, isOpaqueOrigin) {
  const help = helpFor(key);
  const id = 'exe-h-' + (uid += 1);

  // Fila flex de dos huecos elásticos: sin min-width:0 el hueco por defecto es
  // 'auto' (el tamaño mínimo de su contenido), y como el CSS del panel hereda
  // overflow-wrap:anywhere, ese mínimo de contenido puede llegar a ser un solo
  // carácter. Con la etiqueta a flex:1 (base 0) y el valor sin tope, TODO el
  // encogimiento recaía en la etiqueta: el valor largo de sandboxAttr se
  // quedaba en una sola línea y la etiqueta acababa partida letra a letra.
  // min-width:0 en ambos huecos, más un tope de ancho y envoltura explícita en
  // el valor, hace que sea el valor el que rompa línea, no la etiqueta.
  const row = el(doc, 'div', null, 'display:flex;align-items:flex-start;gap:6px;padding:3px 0;border-top:1px solid #f0f2f5');
  row.setAttribute(dataAttr, key);
  // Etiqueta principal en lenguaje llano (help.texto, estilo CAPACIDADES de
  // la maqueta de diseño: «Leer las cookies de sesión de esa página» en vez
  // del nombre de la clave) — la clave técnica (p. ej. canReadParentCookie)
  // se relega a la caja de ayuda ⓘ, más abajo.
  row.appendChild(el(doc, 'span', help.texto || key, 'flex:1;min-width:0;font:11.5px system-ui,sans-serif'));

  const safe = value === false || (key === 'isOpaqueOrigin' && value === true);
  const pill = el(doc, 'span', valueLabel(key, value),
    'flex:0 1 auto;min-width:0;max-width:60%;white-space:normal;word-break:break-word;' +
    'font:11px ui-monospace,Menlo,monospace;padding:0 6px;border-radius:9px;' +
    (typeof value !== 'boolean' ? 'background:#eef0f3;color:#4a5058'
      : safe ? 'background:#e9f7ee;color:#07601e' : 'background:#fdeaec;color:#8e0019'));
  row.appendChild(pill);

  const toggle = el(doc, 'button', 'i',
    'width:17px;height:17px;padding:0;border:1px solid #c9ced6;border-radius:50%;' +
    'background:#fff;font:700 11px/15px system-ui;cursor:pointer;flex:0 0 auto');
  toggle.type = 'button';
  toggle.setAttribute('data-toggle', id);
  toggle.setAttribute('aria-controls', id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('title', 'Qué mide esta prueba y de qué protege');
  toggle.setAttribute('aria-label', 'Ayuda sobre ' + key);
  row.appendChild(toggle);

  const box = el(doc, 'dl', null,
    'margin:0;padding:7px 9px;background:#f7f9fc;border-top:1px dashed #cdd4de;font-size:11.5px');
  box.id = id;
  box.setAttribute('data-help', key);
  box.hidden = true;
  box.appendChild(el(doc, 'dt', 'Propiedad comprobada', 'font-weight:600;margin-top:4px'));
  box.appendChild(el(doc, 'dd', key, 'margin:0 0 2px;font:11px ui-monospace,Menlo,monospace'));
  for (const [term, text] of [['Qué mide', help.mide], ['Qué implica', help.implica], ['De qué protege', help.protege]]) {
    box.appendChild(el(doc, 'dt', term, 'font-weight:600;margin-top:4px'));
    box.appendChild(el(doc, 'dd', text, 'margin:0 0 2px'));
  }
  box.appendChild(el(doc, 'dt', 'Leer más', 'font-weight:600;margin-top:4px'));
  const dd = el(doc, 'dd', null, 'margin:0');
  const link = el(doc, 'a', help.doc);
  link.href = DOC_BASE + help.doc;
  link.target = '_blank';
  link.rel = 'noopener';
  dd.appendChild(link);
  if (isOpaqueOrigin) {
    // Bajo origen opaco el sandbox bloquea target="_blank": se imprime la URL
    // completa para poder copiarla a mano.
    dd.appendChild(el(doc, 'br'));
    dd.appendChild(el(doc, 'span', DOC_BASE + help.doc, 'font-size:10.5px;color:#7a828c'));
  }
  box.appendChild(dd);

  const group = el(doc, 'div');
  group.append(row, box);
  return group;
}

// Fila de un vector del núcleo o del contrato completo: cuenta para las
// aserciones de "una fila por CORE_VECTORS" y para las 27 claves del detalle.
function checkRow(doc, key, value, isOpaqueOrigin) {
  return buildRow(doc, 'data-check', key, value, isOpaqueOrigin);
}

// Fila de un vector propio del anfitrión (sandboxAttr, medidas del
// adaptador): misma ayuda con ⓘ, pero con un atributo distinto para que no
// se cuente como capacidad del núcleo ni altere el marcador de 10.
function hostCheckRow(doc, key, value, isOpaqueOrigin) {
  return buildRow(doc, 'data-host-check', key, value, isOpaqueOrigin);
}

function hostBlock(doc, hostInfo, sandboxAttr, isOpaqueOrigin) {
  const box = el(doc, 'section', null, 'margin:0 0 10px;padding:8px 9px;border:1px solid #e6e9ee;border-radius:7px');
  box.appendChild(el(doc, 'h3', 'Anfitrión', 'margin:0 0 3px;font-size:12px'));

  if (hostInfo.matched) {
    box.appendChild(el(doc, 'p', hostInfo.adapter.label + ' (' + hostInfo.confidence + ')', 'margin:0;font-size:11.5px'));
    box.appendChild(el(doc, 'p', 'Señales: ' + hostInfo.signals.join(' · '), 'margin:2px 0 0;font-size:11px;color:#5a6068'));
  } else {
    box.appendChild(el(doc, 'p', 'El anfitrión no puede identificarse.', 'margin:0;font-size:11.5px'));
    box.appendChild(el(doc, 'p',
      'No es un fallo del instrumento: es una medida. Sin acceso al DOM del padre ni a document.referrer, ' +
      'el recurso tampoco sabe dónde está incrustado.',
      'margin:2px 0 0;font-size:11px;color:#5a6068'));
  }

  // sandbox no cuenta como capacidad alcanzada y no entra en el marcador de
  // 10, pero es un valor medido (atributo del iframe del anfitrión) como
  // cualquier otro: lleva su misma ⓘ con qué mide / implica / protege.
  box.appendChild(hostCheckRow(doc, 'sandboxAttr', sandboxAttr, isOpaqueOrigin));

  const measures = Object.keys(hostInfo.measures || {});
  if (measures.length) {
    box.appendChild(el(doc, 'p', 'Vectores del anfitrión (no cuentan para el marcador de 10):',
      'margin:6px 0 2px;font-size:11px;color:#5a6068'));
    for (const key of measures) {
      box.appendChild(checkRow(doc, key, hostInfo.measures[key], isOpaqueOrigin));
    }
  }
  return box;
}

function mediaBlock(doc, media) {
  const box = el(doc, 'section', null, 'margin:0 0 10px;padding:8px 9px;border:1px solid #e6e9ee;border-radius:7px');
  box.appendChild(el(doc, 'h3', 'Media embebida', 'margin:0 0 3px;font-size:12px'));
  if (!media.total) {
    box.appendChild(el(doc, 'p', 'Esta página no lleva media marcada.', 'margin:0;font-size:11.5px'));
    return box;
  }
  box.appendChild(el(doc, 'p', media.ok + ' de ' + media.total + ' en orden', 'margin:0;font-size:11.5px'));
  for (const item of media.items) {
    box.appendChild(el(doc, 'p', item.label + ' — ' + item.status, 'margin:4px 0 0;font-size:11px;font-weight:600'));
    box.appendChild(el(doc, 'p', CLAIM_TEXT[item.claim], 'margin:1px 0 0;font-size:11px;color:#5a6068'));
  }
  return box;
}

export function renderChecks(scene) {
  const doc = scene.doc;
  const frag = doc.createDocumentFragment();

  const v = scene.verdict;
  const colors = {
    good: ['#e9f7ee', '#0a7d28', '#07601e'],
    bad: ['#fdeaec', '#b00020', '#8e0019'],
    warn: ['#fff6e5', '#b06f00', '#8a5600'],
  }[v.level];

  const verdictBox = el(doc, 'section', null,
    'display:flex;gap:9px;align-items:flex-start;padding:9px 11px;margin:0 0 10px;' +
    'border-left:4px solid ' + colors[1] + ';background:' + colors[0]);
  verdictBox.setAttribute('aria-live', 'polite');
  verdictBox.appendChild(el(doc, 'span', v.icon, 'font-size:19px;line-height:1'));
  const texts = el(doc, 'div');
  texts.appendChild(el(doc, 'b', v.title, 'display:block;font-size:12.5px;color:' + colors[2]));
  texts.appendChild(el(doc, 'p', v.text, 'margin:2px 0 0;font-size:11.5px;color:#3c434c'));
  verdictBox.appendChild(texts);
  frag.appendChild(verdictBox);

  frag.appendChild(hostBlock(doc, scene.hostInfo, scene.result.sandboxAttr, scene.isOpaqueOrigin));
  frag.appendChild(mediaBlock(doc, scene.media));

  const checks = el(doc, 'section', null, 'margin:0;padding:8px 9px;border:1px solid #e6e9ee;border-radius:7px');
  checks.appendChild(el(doc, 'h3', 'Capacidades que deciden el veredicto', 'margin:0 0 3px;font-size:12px'));
  for (const key of CORE_VECTORS) {
    checks.appendChild(checkRow(doc, key, scene.result[key], scene.isOpaqueOrigin));
  }
  frag.appendChild(checks);

  if (scene.detail) {
    const full = el(doc, 'section', null,
      'margin:10px 0 0;padding:8px 9px;border:1px solid #e6e9ee;border-radius:7px');
    full.setAttribute('data-full-result', '');
    full.appendChild(el(doc, 'h3', 'Contrato completo', 'margin:0 0 3px;font-size:12px'));
    for (const key of RESULT_KEYS) {
      // errors se lista aparte; sandboxAttr ya se muestra con su ⓘ en el
      // bloque Anfitrión — no se repite aquí.
      if (key === 'errors' || key === 'sandboxAttr') continue;
      full.appendChild(checkRow(doc, key, scene.result[key], scene.isOpaqueOrigin));
    }

    const errores = Object.keys(scene.result.errors || {}).filter((k) => scene.result.errors[k]);
    full.appendChild(el(doc, 'h3', 'Errores redactados', 'margin:8px 0 3px;font-size:12px'));
    if (!errores.length) {
      full.appendChild(el(doc, 'p', 'Ninguno.', 'margin:0;font-size:11px;color:#5a6068'));
    } else {
      full.appendChild(el(doc, 'p',
        'Solo se conserva el nombre del tipo de error; nunca el mensaje ni los datos que arrastre.',
        'margin:0 0 3px;font-size:11px;color:#5a6068'));
      for (const key of errores) {
        full.appendChild(el(doc, 'p', key + ' → ' + scene.result.errors[key],
          'margin:2px 0 0;font:11px ui-monospace,Menlo,monospace'));
      }
    }
    frag.appendChild(full);
  }

  const nota = el(doc, 'p',
    'La sonda solo mide: publica booleanos y nombres de error, nunca valores de cookie ' +
    'ni de sesskey, y no hace peticiones de red. Las acciones reales están en la pestaña ' +
    'Demostración y requieren que alguien las pulse.',
    'margin:8px 0 0;font-size:11px;color:#5a6068');
  frag.appendChild(nota);

  return frag;
}
