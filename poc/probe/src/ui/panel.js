/*
 * Shell del panel: Shadow DOM, cascada anti-tapado, arrastre y minimizar.
 *
 * El panel nunca desaparece en silencio. Si el anfitrión impide flotar, se
 * ancla en el flujo y lo dice.
 */
import { PANEL_CSS, PLACEMENT_CSS } from './styles.js';

export const PLACEMENTS = ['tr', 'br', 'bl', 'tl'];

const BREAKING = ['transform', 'filter', 'perspective', 'contain'];

/*
 * Defensa 1, determinista: un ancestro con cualquiera de estas propiedades se
 * convierte en bloque contenedor y degrada position:fixed a absolute.
 */
export function breaksFixedPositioning(el) {
  let cur = el && el.parentElement;
  while (cur && cur !== cur.ownerDocument.documentElement) {
    let style;
    try {
      style = cur.ownerDocument.defaultView.getComputedStyle(cur);
    } catch (e) {
      return false;
    }
    for (const prop of BREAKING) {
      const value = style[prop];
      if (value && value !== 'none' && value !== 'auto') return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

function probePoint(doc, hostEl, placement) {
  const vw = doc.defaultView.innerWidth || 1024;
  const vh = doc.defaultView.innerHeight || 768;
  const rect = hostEl.getBoundingClientRect();
  const w = Math.min(rect.width || 420, vw - 24);
  const inset = 12;
  const x = placement === 'tr' || placement === 'br' ? vw - inset - w / 2 : inset + w / 2;
  const y = placement === 'tr' || placement === 'tl' ? inset + 16 : vh - inset - 16;
  return [Math.max(1, Math.min(vw - 1, x)), Math.max(1, Math.min(vh - 1, y))];
}

function outOfViewport(doc, hostEl) {
  const vw = doc.defaultView.innerWidth || 1024;
  const vh = doc.defaultView.innerHeight || 768;
  const r = hostEl.getBoundingClientRect();
  return r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw;
}

/*
 * Defensa 2, empírica: se pregunta al navegador qué hay realmente en la esquina.
 * Si lo que devuelve no es el panel, esa esquina está tapada.
 * Defensa 3: si ninguna sirve, anclado.
 *
 * No se mide aquí si la caja cae fuera del viewport: en este punto el host
 * todavía está en su posición de flujo estático (antes de aplicar el CSS de
 * la esquina elegida), así que esa medida no dice nada sobre dónde acabará
 * realmente el panel. Esa comprobación va después de fijar el CSS, en
 * mountPanel.
 */
export function choosePlacement(doc, hostEl) {
  if (breaksFixedPositioning(hostEl)) return 'anchored';

  for (const placement of PLACEMENTS) {
    const [x, y] = probePoint(doc, hostEl, placement);
    let hit;
    try {
      hit = doc.elementFromPoint(x, y);
    } catch (e) {
      return 'anchored';
    }
    if (!hit || hit === hostEl || hostEl.contains(hit)) return placement;
  }
  return 'anchored';
}

function buildShell(doc, options) {
  const panel = doc.createElement('div');
  panel.id = 'exe-poc-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'exe-poc-title');

  const header = doc.createElement('header');
  header.className = 'hd';

  const titles = doc.createElement('div');
  titles.style.cssText = 'flex:1;min-width:0';
  const h2 = doc.createElement('h2');
  h2.id = 'exe-poc-title';
  h2.textContent = options.title;
  const sub = doc.createElement('p');
  sub.textContent = options.subtitle || '';
  titles.append(h2, sub);

  const minimize = doc.createElement('button');
  minimize.id = 'exe-poc-minimize';
  minimize.type = 'button';
  minimize.textContent = '−';
  minimize.title = 'Minimizar';
  minimize.setAttribute('aria-expanded', 'true');
  minimize.setAttribute('aria-label', 'Minimizar el panel');

  const close = doc.createElement('button');
  close.id = 'exe-poc-close';
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Cerrar';
  close.setAttribute('aria-label', 'Cerrar el panel');

  header.append(titles, minimize, close);

  const body = doc.createElement('div');
  body.id = 'exe-poc-body';
  if (options.body) body.appendChild(options.body);

  panel.append(header, body);
  return { panel, header, body, minimize, close };
}

const POS_KEY = 'exePocPanelPos';

// El almacenamiento es un extra: bajo sandbox el acceso lanza. Nunca debe
// impedir que el panel se monte.
function readPos(storage) {
  try {
    const raw = storage && storage.getItem(POS_KEY);
    const pos = raw ? JSON.parse(raw) : null;
    return pos && typeof pos.left === 'number' && typeof pos.top === 'number' ? pos : null;
  } catch (e) {
    return null;
  }
}

function writePos(storage, pos) {
  try {
    if (storage) storage.setItem(POS_KEY, JSON.stringify(pos));
  } catch (e) { /* ignorado */ }
}

function placeAt(hostEl, pos) {
  hostEl.style.cssText =
    'position:fixed;z-index:2147483647;left:' + pos.left + 'px;top:' + pos.top + 'px';
  hostEl.setAttribute('data-placement', 'custom');
}

function enableDrag(hostEl, header, doc, storage) {
  let dragging = false;
  let dx = 0;
  let dy = 0;

  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (hostEl.getAttribute('data-placement') === 'anchored') return;
    const r = hostEl.getBoundingClientRect();
    dragging = true;
    dx = e.clientX - r.left;
    dy = e.clientY - r.top;
    try { header.setPointerCapture(e.pointerId); } catch (err) { /* ignorado */ }
  });

  header.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    placeAt(hostEl, { left: e.clientX - dx, top: e.clientY - dy });
  });

  const stop = () => {
    if (dragging) {
      const r = hostEl.getBoundingClientRect();
      writePos(storage, { left: Math.round(r.left), top: Math.round(r.top) });
    }
    dragging = false;
  };
  header.addEventListener('pointerup', stop);
  header.addEventListener('pointercancel', stop);
  doc.addEventListener('pointerup', stop);
  return stop;
}

export function mountPanel(options) {
  const doc = options.doc || document;

  let root = doc.getElementById('exe-poc-result');
  if (!root) {
    root = doc.createElement('div');
    root.id = 'exe-poc-result';
  }

  const shadow = root.shadowRoot || root.attachShadow({ mode: 'open' });
  shadow.textContent = '';

  const style = doc.createElement('style');
  style.textContent = PANEL_CSS;
  shadow.appendChild(style);

  const shell = buildShell(doc, options);
  shadow.appendChild(shell.panel);

  // Se inserta antes de medir: choosePlacement necesita una caja real.
  if (!root.parentNode) (doc.body || doc.documentElement).appendChild(root);

  function apply(placement) {
    root.setAttribute('data-placement', placement);
    root.style.cssText = PLACEMENT_CSS[placement] || PLACEMENT_CSS.tr;
    const previo = shadow.querySelector('.aviso');
    if (previo) previo.remove();
    if (placement === 'anchored') {
      const aviso = doc.createElement('p');
      aviso.className = 'aviso';
      aviso.textContent =
        'El anfitrión impide el panel flotante; anclado al final de la página.';
      shell.panel.insertBefore(aviso, shell.body);
      const anchor = options.anchorTo || doc.querySelector('main') || doc.body;
      if (anchor && root.parentNode !== anchor) anchor.appendChild(root);
    }
  }

  // Defensa 3 en dos tiempos: choosePlacement decide con el corral, que no
  // depende de dónde esté el host en el flujo estático; solo después de
  // fijar ese CSS se comprueba si la caja resultante cae realmente fuera de
  // la vista. Medir antes de fijar la posición daría un falso "anclado" en
  // cualquier página más alta que la ventana (hallazgo 1 de la revisión).
  function applyChosen() {
    apply(choosePlacement(doc, root));
    if (root.getAttribute('data-placement') !== 'anchored' && outOfViewport(doc, root)) {
      apply('anchored');
    }
  }

  const saved = readPos(options.storage);
  if (saved && !breaksFixedPositioning(root)) {
    // El paquete tiene seis páginas: si alguien movió el panel, debe quedarse
    // donde lo dejó al navegar entre casos.
    placeAt(root, saved);
  } else {
    applyChosen();
  }

  shell.minimize.addEventListener('click', () => {
    const expanded = shell.minimize.getAttribute('aria-expanded') === 'true';
    shell.minimize.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    shell.minimize.setAttribute('aria-label', expanded ? 'Expandir el panel' : 'Minimizar el panel');
    shell.minimize.title = expanded ? 'Expandir' : 'Minimizar';
    shell.minimize.textContent = expanded ? '+' : '−';
    shell.body.hidden = expanded;
  });

  const stopDrag = enableDrag(root, shell.header, doc, options.storage);

  // Reevaluación con throttle: el contenido del anfitrión se mueve.
  let pending = 0;
  const recheck = () => {
    if (pending) return;
    pending = doc.defaultView.setTimeout(() => {
      pending = 0;
      if (root.getAttribute('data-placement') === 'custom') return;
      applyChosen();
    }, 250);
  };
  doc.defaultView.addEventListener('resize', recheck);
  doc.defaultView.addEventListener('scroll', recheck, true);

  // Único punto de desmontaje: cerrar con el botón × tiene que limpiar
  // exactamente lo mismo que destroy(), o el cierre normal deja oyentes de
  // resize/scroll/pointerup vivos apuntando a un host ya desprendido
  // (hallazgo 2 de la revisión).
  function teardown() {
    doc.defaultView.removeEventListener('resize', recheck);
    doc.defaultView.removeEventListener('scroll', recheck, true);
    doc.removeEventListener('pointerup', stopDrag);
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  shell.close.addEventListener('click', teardown);

  return {
    root,
    shadow,
    setBody(node) {
      shell.body.textContent = '';
      shell.body.appendChild(node);
    },
    setPlacement: apply,
    destroy: teardown,
  };
}
