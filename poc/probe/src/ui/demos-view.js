/*
 * Pestaña Demostración.
 *
 * Nada se ejecuta solo: cada acción exige una pulsación. El resultado se traduce
 * a uno de los tres estados y el retorno crudo queda disponible debajo.
 */
import { DEMO_STATES, classifyDemoResult } from '../core/classify.js';
import { helpFor, DOC_BASE } from './help.js';

let uid = 0;

function el(doc, tag, text, css) {
  const node = doc.createElement(tag);
  if (text != null) node.textContent = text;
  if (css) node.style.cssText = css;
  return node;
}

const CHIP_CSS = {
  'st-idle': 'color:#7a828c',
  'st-run': 'color:#0b57d0',
  'st-good': 'color:#07601e;background:#e9f7ee',
  'st-bad': 'color:#8e0019;background:#fdeaec',
  'st-warn': 'color:#8a5600;background:#fff6e5',
};

// La píldora de estado (mockup: "coloured pill ... carrying the state").
// Mismo DEMO_STATES/CHIP_CSS que antes — solo cambia la forma (inline-block
// con padding y borde redondeado) para que se lea como una etiqueta, no
// como una línea de texto suelta.
function paintPill(pill, state) {
  const s = DEMO_STATES[state];
  pill.textContent = s.icon + ' ' + s.label;
  pill.style.cssText =
    'display:inline-block;padding:3px 10px;border-radius:4px;font-size:11.5px;font-weight:600;' + CHIP_CSS[s.cls];
}

function helpBox(doc, demo) {
  const help = demo.help;
  const id = 'exe-dh-' + (uid += 1);
  const box = el(doc, 'dl', null,
    'margin:0 8px 8px;padding:7px 9px;background:#f7f9fc;border:1px dashed #cdd4de;font-size:11.5px');
  box.id = id;
  box.setAttribute('data-help', demo.id);
  box.hidden = true;
  for (const [term, text] of [
    ['Qué intenta', help.intenta],
    ['De qué protege el aislamiento', help.protege],
    ['Reversión', help.reversion],
  ]) {
    box.appendChild(el(doc, 'dt', term, 'font-weight:600;margin-top:4px'));
    box.appendChild(el(doc, 'dd', text, 'margin:0 0 2px'));
  }
  const doc_ = help.doc || helpFor(demo.id).doc;
  box.appendChild(el(doc, 'dt', 'Leer más', 'font-weight:600;margin-top:4px'));
  const dd = el(doc, 'dd', null, 'margin:0');
  const link = el(doc, 'a', doc_);
  link.href = DOC_BASE + doc_;
  link.target = '_blank';
  link.rel = 'noopener';
  dd.append(link, el(doc, 'br'), el(doc, 'span', DOC_BASE + doc_, 'font-size:10.5px;color:#7a828c'));
  box.appendChild(dd);
  return { box, id };
}

function refreshSummary(state, journal) {
  if (state.summaryNode) state.summaryNode.textContent = journal.summary();
}

// Tarjeta de acción, tal y como la dibuja la maqueta de diseño
// (diseno-maqueta.html, líneas 288-309 y 322-335 — «Acciones disponibles» y
// «Qué vería la persona usuaria» comparten la misma tarjeta): título +
// descripción a la izquierda, botón «Ejecutar» a la derecha; debajo, la
// píldora de estado con su nota; tras ejecutar, la línea de petición (forma
// real de la llamada, nunca inventada — ver el campo `request` en
// hosts/*.js) y la respuesta en un <pre> oscuro. La respuesta es siempre el
// valor que ya devuelve demo.run() — el mismo que muestra la pestaña
// Demostración —, nunca un dato de sesión real: eso es lo que garantizan
// measure.js/las acciones mismas, no esta vista.
export function demoBlock(doc, demo, scene, state) {
  const card = el(doc, 'div', null,
    'border:1px solid #dbdbdb;background:#fff;border-radius:8px;padding:16px;margin-bottom:12px');

  const row = el(doc, 'div', null,
    'display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap');

  const info = el(doc, 'div', null, 'flex:1;min-width:260px');
  info.append(
    el(doc, 'p', (demo.icon ? demo.icon + ' ' : '') + demo.label, 'margin:0 0 4px;font-weight:700'),
    el(doc, 'p', demo.help.intenta, 'margin:0;font-size:0.92rem;color:#555;line-height:1.55'),
  );

  const action = el(doc, 'button', 'Ejecutar',
    'border:1px solid #ccc;background:#fff;color:#555;border-radius:4px;padding:9px 16px;' +
    'font-size:0.92rem;cursor:pointer;white-space:nowrap;font:inherit');
  action.type = 'button';
  action.setAttribute('data-demo', demo.id);

  row.append(info, action);

  const { box, id } = helpBox(doc, demo);
  const toggle = el(doc, 'button', 'i',
    'width:17px;height:17px;padding:0;border:1px solid #c9ced6;border-radius:50%;' +
    'background:#fff;font:700 11px/15px system-ui;cursor:pointer;vertical-align:middle;margin-left:8px');
  toggle.type = 'button';
  toggle.setAttribute('data-toggle', id);
  toggle.setAttribute('aria-controls', id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Qué intenta ' + demo.label);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    box.hidden = open;
  });

  const pill = el(doc, 'span');
  pill.setAttribute('data-chip', demo.id);
  pill.setAttribute('aria-live', 'polite');
  paintPill(pill, 'idle');
  const note = el(doc, 'span', '', 'color:#666;margin-left:6px;font-size:0.9rem');
  const statusLine = el(doc, 'p', null, 'margin:12px 0 0;font-size:0.9rem');
  statusLine.append(pill, note, toggle);

  // Petición + respuesta: ambas ocultas hasta que la acción se ejecuta,
  // igual que en la maqueta (sc-if value="{{ a.hecho }}"). Sin `demo.request`
  // (la vitrina de impacto no hace ninguna petición: pinta sobre el DOM del
  // anfitrión) no se pinta línea de petición — una línea de red inventada
  // para algo que no hace red sería peor que no ponerla.
  const resultWrap = el(doc, 'div', null, 'margin-top:12px');
  resultWrap.hidden = true;
  if (demo.request) {
    resultWrap.appendChild(el(doc, 'p', demo.request,
      "margin:0 0 6px;font-family:Monaco,'Courier New',monospace;font-size:12px;color:#555"));
  }
  const raw = el(doc, 'pre', '',
    "white-space:pre-wrap;font-family:Monaco,'Courier New',monospace;font-size:12px;line-height:1.5;" +
    'background:#112C4A;color:#E7ECF1;border-radius:8px;padding:16px 20px;margin:0;overflow:auto');
  raw.setAttribute('data-raw', demo.id);
  resultWrap.appendChild(raw);

  action.addEventListener('click', () => {
    action.disabled = true;
    paintPill(pill, 'running');
    note.textContent = '';
    const done = (value) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      const verdict = classifyDemoResult(value, { isOpaqueOrigin: scene.isOpaqueOrigin });
      paintPill(pill, verdict.state);
      note.textContent = verdict.message;
      raw.textContent = text;
      resultWrap.hidden = false;
      action.disabled = false;
      try {
        scene.doc.defaultView.__EXE_POC_LAST_DEMO = { id: demo.id, state: verdict.state, raw: text };
      } catch (e) { /* ignorado */ }
      refreshSummary(state, scene.journal);
    };
    try {
      demo.run(scene.ctx, scene.journal, done);
    } catch (e) {
      done('BLOQUEADO: ' + ((e && e.name) || 'Error'));
    }
  });

  card.append(row, statusLine, box, resultWrap);
  return card;
}

/*
 * Monta la misma batería de demos — misma UI, mismo demo.run(), mismos chips
 * de tres estados de demoBlock() — directamente en un contenedor de la propia
 * página (luz, no en el Shadow DOM del panel). Es lo que usan los botones
 * «Acciones disponibles» de los subapartados 5.1-5.4 y «Qué vería la persona
 * usuaria» del apartado 6: no hay una segunda vía de reporte ni una segunda
 * implementación de la acción, así que una demo se comporta igual se dispare
 * desde aquí o desde la pestaña Demostración del panel.
 */
export function mountInlineDemos(doc, container, demos, scene) {
  const state = {};
  for (const demo of demos) container.appendChild(demoBlock(doc, demo, scene, state));
}

export function renderDemos(scene) {
  const doc = scene.doc;
  const frag = doc.createDocumentFragment();
  // Estado local del render: dos paneles en la misma página no pueden pisarse.
  const state = {};

  frag.appendChild(el(doc, 'p',
    'Acciones reales sobre el anfitrión, autorizadas y reversibles. Solo se ejecutan al ' +
    'pulsarlas. En modo seguro (origen opaco) deben devolver BLOQUEADO; que se ejecuten es ' +
    'exactamente lo que demuestra la falta de aislamiento. Úsalas solo en un laboratorio propio.',
    'margin:0 0 8px;font-size:11px;color:#5a6068'));

  // El desplegable lista `hostsForSelect` cuando se da (para poder ofrecer
  // más anfitriones de los que realmente se pintan abajo, p. ej. cuando
  // quien llama ya ha filtrado `adapters` a uno solo); si no se da, se
  // deriva de `adapters` como antes.
  const selectRow = el(doc, 'label', 'Anfitrión: ', 'display:block;font-size:11px;margin-bottom:8px');
  const select = doc.createElement('select');
  select.setAttribute('data-host-select', '');
  for (const host of scene.hostsForSelect || scene.adapters) {
    const opt = doc.createElement('option');
    opt.value = host.id;
    opt.textContent = host.label;
    if (host.id === scene.selectedHostId) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => scene.onSelectHost(select.value));
  selectRow.appendChild(select);
  selectRow.appendChild(el(doc, 'span',
    ' — cámbialo para lanzar la batería de otra plataforma; en modo seguro todas deben quedar bloqueadas.',
    'color:#5a6068'));
  frag.appendChild(selectRow);

  for (const adapter of scene.adapters) {
    if (!adapter.demos.length) continue;
    frag.appendChild(el(doc, 'p', adapter.label, 'margin:8px 0 4px;font-weight:600;font-size:12px'));
    for (const demo of adapter.demos) frag.appendChild(demoBlock(doc, demo, scene, state));
  }

  frag.appendChild(el(doc, 'p', scene.showcase.label, 'margin:8px 0 4px;font-weight:600;font-size:12px'));
  frag.appendChild(el(doc, 'p',
    'Ejemplos de lo que podría hacer una persona malintencionada. No escriben nada en el ' +
    'anfitrión: solo pintan encima, se retiran solas en 60 s y llevan su franja de demostración.',
    'margin:0 0 6px;font-size:11px;color:#5a6068'));
  for (const demo of scene.showcase.demos) frag.appendChild(demoBlock(doc, demo, scene, state));

  const controls = el(doc, 'div', null, 'display:flex;gap:6px;flex-wrap:wrap;margin-top:10px');

  const restore = el(doc, 'button', 'Restaurar vitrina',
    'padding:5px 10px;font:inherit;border:1px solid #c9ced6;border-radius:6px;background:#fff;cursor:pointer');
  restore.type = 'button';
  restore.setAttribute('data-restore-showcase', '');
  restore.addEventListener('click', () => scene.showcase.restoreAll(scene.ctx));

  const revert = el(doc, 'button', 'Revertir todo',
    'padding:5px 10px;font:inherit;border:1px solid #c9ced6;border-radius:6px;background:#fff;cursor:pointer');
  revert.type = 'button';
  revert.setAttribute('data-revert-all', '');
  revert.addEventListener('click', () => {
    revert.disabled = true;
    Promise.resolve(scene.journal.revertAll()).then(() => {
      revert.disabled = false;
      refreshSummary(state, scene.journal);
    });
  });

  controls.append(restore, revert);
  frag.appendChild(controls);

  state.summaryNode = el(doc, 'p', scene.journal.summary(), 'margin:6px 0 0;font-size:11px;color:#5a6068');
  state.summaryNode.setAttribute('data-journal-summary', '');
  state.summaryNode.setAttribute('aria-live', 'polite');
  frag.appendChild(state.summaryNode);

  frag.appendChild(el(doc, 'p',
    'Lo que el diario no puede deshacer queda trazable: todo lo creado lleva el prefijo ' +
    'POC-<build>-<marca>. El barrido manual por plataforma está en poc/README.md.',
    'margin:4px 0 0;font-size:10.5px;color:#7a828c'));

  return frag;
}
