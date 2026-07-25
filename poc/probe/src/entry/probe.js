/*
 * Punto de entrada: medir → publicar → montar.
 *
 * Si el montaje del panel falla, el artefacto no puede quedarse mudo: cae a un
 * <pre> con el JSON.
 */
import { measure } from '../core/measure.js';
import { measureMedia } from '../core/media.js';
import { computeVerdict } from '../core/verdict.js';
import { createJournal } from '../core/journal.js';
import { ADAPTERS, detectHost } from '../hosts/index.js';
import { createContext } from '../hosts/contract.js';
import { createShowcase } from '../hosts/showcase.js';
import { mountPanel } from '../ui/panel.js';
import { renderChecks } from '../ui/checks-view.js';
import { renderDemos } from '../ui/demos-view.js';

const TABS = ['Resumen', 'Detalle', 'Demostración'];

// Anfitriones con batería propia (el genérico no tiene demos).
const DEMO_ADAPTERS = ADAPTERS.filter((a) => a.demos.length);

/*
 * Pestaña Demostración: el selector debe seguir ofreciendo TODOS los
 * anfitriones (para poder cambiar de uno a otro), pero solo se pinta la
 * batería del anfitrión elegido. demos-view.js no filtra por selectedHostId
 * a propósito (es responsabilidad de quien llama) y su desplegable lista
 * exactamente lo que recibe en `adapters`, así que aquí se conserva la lista
 * completa para el desplegable y se vacía `demos` de los no elegidos para
 * que sus bloques no se pinten.
 */
function demoAdaptersFor(selectedHostId) {
  return DEMO_ADAPTERS.map((a) => (a.id === selectedHostId ? a : { id: a.id, label: a.label, demos: [] }));
}

function safeStorage(win) {
  try {
    void win.sessionStorage.length;
    return win.sessionStorage;
  } catch (e) {
    return null;
  }
}

function fallback(doc, result) {
  try {
    const pre = doc.createElement('pre');
    pre.id = 'exe-poc-result';
    pre.textContent = JSON.stringify(result, null, 2);
    (doc.body || doc.documentElement).appendChild(pre);
  } catch (e) { /* si esto también falla, no queda nada que hacer */ }
}

export function startProbe(options) {
  const win = (options && options.win) || window;
  const doc = (options && options.doc) || win.document;
  const buildId = (options && options.buildId) || 'dev';

  const result = measure(win);
  const media = measureMedia(win.document);
  const journal = createJournal({ buildId, storage: safeStorage(win) });
  const ctx = createContext({ win, journal, buildId });
  const showcase = createShowcase({ buildId, timeoutMs: 60000 });

  let hostInfo;
  try {
    const detected = detectHost(ctx);
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
      matched: false, confidence: 'weak', signals: [], measures: {},
    };
  }

  try {
    win.__EXE_POC_RESULT = result;
    win.__EXE_POC_HOST = {
      id: hostInfo.adapter.id, label: hostInfo.adapter.label,
      matched: hostInfo.matched, confidence: hostInfo.confidence, signals: hostInfo.signals,
    };
    win.__EXE_POC_MEDIA = media;
  } catch (e) { /* ignorado */ }
  try { win.console.log('[EXE-POC] ' + JSON.stringify(result)); } catch (e) { /* ignorado */ }

  const existing = doc.getElementById && doc.getElementById('exe-poc-result');
  if (existing && existing.getAttribute('data-mounted') === 'true') return null;

  const verdict = computeVerdict(result);
  let selectedHostId = hostInfo.adapter.id === 'generic' ? ADAPTERS[0].id : hostInfo.adapter.id;

  try {
    const container = doc.createElement('div');

    const tablist = doc.createElement('div');
    tablist.setAttribute('role', 'tablist');
    tablist.style.cssText = 'display:flex;border-bottom:1px solid #e2e6ec;margin:-10px -11px 10px';

    const view = doc.createElement('div');

    const paint = (name) => {
      view.textContent = '';
      if (name === 'Demostración') {
        view.appendChild(renderDemos({
          doc, ctx, journal, showcase,
          adapters: demoAdaptersFor(selectedHostId),
          isOpaqueOrigin: result.isOpaqueOrigin,
          selectedHostId,
          onSelectHost: (id) => {
            selectedHostId = id;
            paint('Demostración');
          },
        }));
      } else {
        view.appendChild(renderChecks({
          doc, result, verdict, hostInfo, media,
          isOpaqueOrigin: result.isOpaqueOrigin,
          detail: name === 'Detalle',
        }));
      }
    };

    const buttons = TABS.map((name, i) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      b.style.cssText =
        'flex:1;border:0;background:transparent;padding:7px 4px;cursor:pointer;' +
        'font:inherit;border-bottom:2px solid ' + (i === 0 ? '#0b57d0' : 'transparent');
      b.addEventListener('click', () => {
        buttons.forEach((other, j) => {
          const on = j === i;
          other.setAttribute('aria-selected', on ? 'true' : 'false');
          other.style.borderBottomColor = on ? '#0b57d0' : 'transparent';
        });
        paint(name);
      });
      tablist.appendChild(b);
      return b;
    });

    container.append(tablist, view);
    paint(TABS[0]);

    const panel = mountPanel({
      doc,
      title: 'Sonda de aislamiento',
      subtitle: 'exe-probe-suite · build ' + buildId,
      body: container,
      buildId,
      storage: safeStorage(win),
    });
    panel.root.setAttribute('data-mounted', 'true');
    return panel;
  } catch (e) {
    fallback(win.document, result);
    return null;
  }
}

// Autoarranque cuando el bundle se carga en una página real.
if (typeof window !== 'undefined' && !window.__EXE_POC_NO_AUTOSTART) {
  const boot = () => startProbe({ win: window, buildId: window.__EXE_POC_BUILD_ID || 'dev' });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  } else {
    setTimeout(boot, 0);
  }
}
