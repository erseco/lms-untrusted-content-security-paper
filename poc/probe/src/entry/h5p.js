/*
 * Entrada pasiva y controlable para librerías H5P.
 *
 * No se autoejecuta y no importa demos, diarios ni acciones de anfitrión.
 * H5P llama explícitamente a startProbe() desde attach(), proporcionando el
 * contenedor donde debe quedar anclado el panel.
 */
import { measure } from '../core/measure.js';
import { measureMedia } from '../core/media.js';
import { computeVerdict } from '../core/verdict.js';
import { detectPassiveHost } from '../hosts/passive-index.js';
import { mountPanel } from '../ui/panel.js';
import { renderChecks } from '../ui/checks-view.js';

const TABS = ['Resumen', 'Detalle'];

function createPassiveContext(win, buildId, allowSelfHost) {
  function parentWin() {
    try {
      const parent = win.parent;
      if (!parent) return null;
      if (parent === win) return allowSelfHost ? win : null;
      void parent.location.href;
      return parent;
    } catch (e) {
      return null;
    }
  }

  function parentDoc() {
    try {
      const parent = win.parent;
      if (!parent) return null;
      if (parent === win) return allowSelfHost ? win.document : null;
      return parent.document || null;
    } catch (e) {
      return null;
    }
  }

  // Deliberadamente no incluye fetchSameOrigin ni journal: los adaptadores
  // H5P solo reciben las primitivas de lectura que necesitan para medir.
  return { win, buildId, parentWin, parentDoc };
}

function safeStorage(win) {
  try {
    void win.sessionStorage.length;
    return win.sessionStorage;
  } catch (e) {
    return null;
  }
}

function fallback(doc, result, anchorTo) {
  try {
    if (doc.getElementById && doc.getElementById('exe-poc-result')) return;
    const pre = doc.createElement('pre');
    pre.id = 'exe-poc-result';
    pre.textContent = JSON.stringify(result, null, 2);
    (anchorTo || doc.body || doc.documentElement).appendChild(pre);
  } catch (e) { /* si esto falla, no queda un DOM utilizable */ }
}

export function startProbe(options) {
  const opts = options || {};
  const win = opts.win || window;
  const doc = opts.doc || win.document;
  const buildId = opts.buildId || 'h5p-library';
  const allowSelfHost =
    opts.allowSelfHost === true ||
    win.__EXE_POC_ALLOW_SELF_HOST === true;

  const result = measure(win, { allowSelfHost });
  const media = measureMedia(doc);
  const ctx = createPassiveContext(win, buildId, allowSelfHost);

  let hostInfo;
  try {
    const detected = detectPassiveHost(ctx);
    let measures = {};
    try { measures = detected.adapter.measure(ctx) || {}; } catch (e) { measures = {}; }
    hostInfo = {
      adapter: detected.adapter,
      matched: detected.matched,
      confidence: detected.confidence,
      signals: detected.signals,
      measures,
    };
  } catch (e) {
    hostInfo = {
      adapter: { id: 'generic', label: 'Anfitrión no identificado' },
      matched: false,
      confidence: 'weak',
      signals: [],
      measures: {},
    };
  }

  try {
    win.__EXE_POC_RESULT = result;
    win.__EXE_POC_HOST = {
      id: hostInfo.adapter.id,
      label: hostInfo.adapter.label,
      matched: hostInfo.matched,
      confidence: hostInfo.confidence,
      signals: hostInfo.signals,
    };
    win.__EXE_POC_MEDIA = media;
    win.console.log('[EXE-POC] ' + JSON.stringify(result));
  } catch (e) { /* la salida visible sigue disponible */ }

  const existing = doc.getElementById && doc.getElementById('exe-poc-result');
  if (existing && existing.getAttribute('data-mounted') === 'true') return null;

  try {
    const verdict = computeVerdict(result);
    const container = doc.createElement('div');
    const tablist = doc.createElement('div');
    tablist.setAttribute('role', 'tablist');
    tablist.style.cssText =
      'display:flex;border-bottom:1px solid #e2e6ec;margin:-10px -11px 10px';
    const view = doc.createElement('div');

    const paint = (name) => {
      view.textContent = '';
      view.appendChild(renderChecks({
        doc,
        result,
        verdict,
        hostInfo,
        media,
        isOpaqueOrigin: result.isOpaqueOrigin,
        detail: name === 'Detalle',
        measurementOnly: true,
      }));
    };

    const buttons = TABS.map((name, i) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      button.style.cssText =
        'flex:1;border:0;background:transparent;padding:7px 4px;cursor:pointer;' +
        'font:inherit;border-bottom:2px solid ' + (i === 0 ? '#0b57d0' : 'transparent');
      button.addEventListener('click', () => {
        buttons.forEach((other, j) => {
          const selected = j === i;
          other.setAttribute('aria-selected', selected ? 'true' : 'false');
          other.style.borderBottomColor = selected ? '#0b57d0' : 'transparent';
        });
        paint(name);
      });
      tablist.appendChild(button);
      return button;
    });

    container.append(tablist, view);
    paint(TABS[0]);

    const panel = mountPanel({
      doc,
      title: 'Sonda de aislamiento H5P',
      subtitle: 'medición pasiva · build ' + buildId,
      body: container,
      buildId,
      storage: safeStorage(win),
      anchorTo: opts.anchorTo || null,
    });
    panel.root.setAttribute('data-mounted', 'true');
    panel.root.setAttribute('data-view', 'measurement-only');
    return panel;
  } catch (e) {
    fallback(doc, result, opts.anchorTo);
    return null;
  }
}
