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

function valueLabel(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value == null || value === '') return 'sin datos';
  return String(value);
}

function checkRow(doc, key, value, isOpaqueOrigin) {
  const help = helpFor(key);
  const id = 'exe-h-' + (uid += 1);

  const row = el(doc, 'div', null, 'display:flex;align-items:center;gap:6px;padding:3px 0;border-top:1px solid #f0f2f5');
  row.setAttribute('data-check', key);
  row.appendChild(el(doc, 'span', key, 'flex:1;font:11px ui-monospace,Menlo,monospace'));

  const safe = value === false || (key === 'isOpaqueOrigin' && value === true);
  const pill = el(doc, 'span', valueLabel(value),
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

function hostBlock(doc, hostInfo, sandboxAttr) {
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

  // sandbox no cuenta como capacidad alcanzada (no lleva ⓘ ni entra en el
  // marcador de 10): es contexto sobre con qué permisos se sirvió el
  // recurso, visible ya en el resumen porque documenta el propio anfitrión.
  box.appendChild(el(doc, 'p', 'sandbox: ' + valueLabel(sandboxAttr), 'margin:2px 0 0;font-size:11px;color:#5a6068'));

  const measures = Object.keys(hostInfo.measures || {});
  if (measures.length) {
    box.appendChild(el(doc, 'p', 'Vectores del anfitrión (no cuentan para el marcador de 10):',
      'margin:6px 0 2px;font-size:11px;color:#5a6068'));
    for (const key of measures) {
      box.appendChild(checkRow(doc, key, hostInfo.measures[key], false));
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

  frag.appendChild(hostBlock(doc, scene.hostInfo, scene.result.sandboxAttr));
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
      if (key === 'errors') continue;
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
