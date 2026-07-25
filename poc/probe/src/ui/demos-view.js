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

function paintChip(chip, state) {
  const s = DEMO_STATES[state];
  chip.textContent = s.icon + ' ' + s.label;
  chip.style.cssText = 'display:block;padding:4px 9px 6px;font-size:11.5px;font-weight:600;' + CHIP_CSS[s.cls];
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

function demoBlock(doc, demo, scene, state) {
  const wrap = el(doc, 'div', null, 'border:1px solid #e6e9ee;border-radius:7px;margin-bottom:7px');

  const top = el(doc, 'div', null, 'display:flex;align-items:center;gap:6px;padding:6px 8px');
  const action = el(doc, 'button', (demo.icon ? demo.icon + ' ' : '') + demo.label,
    'flex:1;text-align:left;border:1px solid #c9ced6;border-radius:6px;background:#fff;' +
    'padding:5px 8px;cursor:pointer;font:inherit');
  action.type = 'button';
  action.setAttribute('data-demo', demo.id);

  const { box, id } = helpBox(doc, demo);
  const info = el(doc, 'button', 'i',
    'width:17px;height:17px;padding:0;border:1px solid #c9ced6;border-radius:50%;' +
    'background:#fff;font:700 11px/15px system-ui;cursor:pointer;flex:0 0 auto');
  info.type = 'button';
  info.setAttribute('data-toggle', id);
  info.setAttribute('aria-controls', id);
  info.setAttribute('aria-expanded', 'false');
  info.setAttribute('aria-label', 'Qué intenta ' + demo.label);
  info.addEventListener('click', () => {
    const open = info.getAttribute('aria-expanded') === 'true';
    info.setAttribute('aria-expanded', open ? 'false' : 'true');
    box.hidden = open;
  });

  top.append(action, info);

  const chip = el(doc, 'span');
  chip.setAttribute('data-chip', demo.id);
  chip.setAttribute('aria-live', 'polite');
  paintChip(chip, 'idle');

  const raw = el(doc, 'pre', '',
    'white-space:pre-wrap;background:#f6f8fa;border:1px solid #e1e4e8;border-radius:5px;' +
    'padding:6px;margin:0 8px 8px;font-size:10.5px;max-height:150px;overflow:auto');
  raw.setAttribute('data-raw', demo.id);
  raw.hidden = true;

  action.addEventListener('click', () => {
    action.disabled = true;
    paintChip(chip, 'running');
    const done = (value) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      const verdict = classifyDemoResult(value, { isOpaqueOrigin: scene.isOpaqueOrigin });
      paintChip(chip, verdict.state);
      chip.appendChild(el(doc, 'small', verdict.message, 'display:block;font-weight:400;color:#4a5058'));
      raw.textContent = text;
      raw.hidden = false;
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

  wrap.append(top, chip, box, raw);
  return wrap;
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
