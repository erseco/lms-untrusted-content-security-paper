import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { breaksFixedPositioning, choosePlacement, mountPanel, PLACEMENTS } from '../src/ui/panel.js';

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

function stubStyle(map) {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
    const own = map.get(el) || {};
    return {
      transform: own.transform || 'none',
      filter: own.filter || 'none',
      perspective: own.perspective || 'none',
      contain: own.contain || 'none',
      willChange: own.willChange || 'auto',
    };
  });
}

describe('breaksFixedPositioning', () => {
  it('es falso en un árbol limpio', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    stubStyle(new Map());
    expect(breaksFixedPositioning(el)).toBe(false);
  });

  it('detecta un ancestro con transform', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.appendChild(inner);
    document.body.appendChild(outer);
    stubStyle(new Map([[outer, { transform: 'translateZ(0)' }]]));
    expect(breaksFixedPositioning(inner)).toBe(true);
  });

  it('detecta filter, perspective y contain', () => {
    for (const prop of ['filter', 'perspective', 'contain']) {
      const outer = document.createElement('div');
      const inner = document.createElement('div');
      outer.appendChild(inner);
      document.body.appendChild(outer);
      stubStyle(new Map([[outer, { [prop]: prop === 'contain' ? 'paint' : 'blur(1px)' }]]));
      expect(`${prop}:${breaksFixedPositioning(inner)}`).toBe(`${prop}:true`);
    }
  });
});

describe('choosePlacement', () => {
  it('devuelve la primera esquina libre', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.getBoundingClientRect = () => ({ width: 300, height: 200, top: 10, left: 10, right: 310, bottom: 210 });
    document.elementFromPoint = () => host;
    stubStyle(new Map());
    expect(choosePlacement(document, host)).toBe(PLACEMENTS[0]);
  });

  it('salta a la siguiente esquina cuando la primera está tapada', () => {
    const host = document.createElement('div');
    const intruso = document.createElement('div');
    document.body.append(host, intruso);
    host.getBoundingClientRect = () => ({ width: 300, height: 200, top: 10, left: 10, right: 310, bottom: 210 });
    let calls = 0;
    document.elementFromPoint = () => (++calls === 1 ? intruso : host);
    stubStyle(new Map());
    expect(choosePlacement(document, host)).toBe(PLACEMENTS[1]);
  });

  it('cae a anclado cuando todas las esquinas están tapadas', () => {
    const host = document.createElement('div');
    const intruso = document.createElement('div');
    document.body.append(host, intruso);
    host.getBoundingClientRect = () => ({ width: 300, height: 200, top: 10, left: 10, right: 310, bottom: 210 });
    document.elementFromPoint = () => intruso;
    stubStyle(new Map());
    expect(choosePlacement(document, host)).toBe('anchored');
  });

  it('cae a anclado sin probar esquinas si un ancestro rompe el bloque contenedor', () => {
    const outer = document.createElement('div');
    const host = document.createElement('div');
    outer.appendChild(host);
    document.body.appendChild(outer);
    const spy = vi.fn(() => host);
    document.elementFromPoint = spy;
    stubStyle(new Map([[outer, { transform: 'scale(1)' }]]));
    expect(choosePlacement(document, host)).toBe('anchored');
    expect(spy).not.toHaveBeenCalled();
  });

  // No hay test aquí de "caja fuera del viewport": esa comprobación ya no
  // vive en choosePlacement (ver hallazgo 1 de la revisión de la tarea 14).
  // choosePlacement solo decide con el corral empírico, que no depende de
  // dónde esté el host en el flujo estático; medir el viewport tiene que
  // pasar después, sobre la caja ya fijada. Esos casos están cubiertos en
  // el describe de mountPanel más abajo.
});

describe('mountPanel', () => {
  const body = () => {
    const el = document.createElement('p');
    el.textContent = 'contenido';
    return el;
  };

  it('crea el host con el id histórico y un shadow root', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const panel = mountPanel({ doc: document, title: 'Sonda', subtitle: 'sub', body: body(), buildId: 'b' });
    expect(document.getElementById('exe-poc-result')).toBe(panel.root);
    expect(panel.shadow).toBeTruthy();
    expect(panel.shadow.getElementById('exe-poc-panel')).toBeTruthy();
    expect(panel.shadow.getElementById('exe-poc-close')).toBeTruthy();
  });

  it('reutiliza el host si ya existe', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const previo = document.createElement('div');
    previo.id = 'exe-poc-result';
    document.body.appendChild(previo);
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    expect(panel.root).toBe(previo);
    expect(document.querySelectorAll('#exe-poc-result')).toHaveLength(1);
  });

  it('el CSS vive dentro del shadow root, no en el documento', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    expect(panel.shadow.querySelector('style')).toBeTruthy();
    expect(document.head.querySelector('style')).toBe(null);
  });

  it('por defecto monta anclado en el flujo del anchorTo indicado, sin aviso', () => {
    const outer = document.createElement('div');
    document.body.appendChild(outer);
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b', anchorTo: outer });
    expect(panel.root.getAttribute('data-placement')).toBe('anchored');
    expect(panel.shadow.textContent).not.toMatch(/anclado al final de la página/i);
    expect(panel.root.parentElement).toBe(outer);
  });

  it('el modo embedded ocupa el ancho del contenedor y elimina controles flotantes', () => {
    const outer = document.createElement('div');
    document.body.appendChild(outer);
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const panel = mountPanel({
      doc: document,
      title: 'S',
      subtitle: '',
      body: body(),
      buildId: 'b',
      anchorTo: outer,
      presentation: 'embedded',
    });
    expect(panel.root.getAttribute('data-presentation')).toBe('embedded');
    expect(panel.root.getAttribute('data-placement')).toBe('anchored');
    expect(panel.root.parentElement).toBe(outer);
    expect(panel.shadow.querySelector('style').textContent)
      .toContain(':host([data-presentation="embedded"]) #exe-poc-panel{width:100%');
  });

  it('cerrar elimina el host del documento', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    panel.shadow.getElementById('exe-poc-close').click();
    expect(document.getElementById('exe-poc-result')).toBe(null);
  });

  it('minimizar oculta el cuerpo y conserva el veredicto', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    const min = panel.shadow.getElementById('exe-poc-minimize');
    min.click();
    expect(panel.shadow.getElementById('exe-poc-body').hidden).toBe(true);
    expect(min.getAttribute('aria-expanded')).toBe('false');
    min.click();
    expect(panel.shadow.getElementById('exe-poc-body').hidden).toBe(false);
  });

  it('recupera la posición arrastrada de una página anterior del paquete', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const store = new Map([['exePocPanelPos', JSON.stringify({ left: 40, top: 90 })]]);
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b', storage });
    expect(panel.root.getAttribute('data-placement')).toBe('custom');
    expect(panel.root.style.left).toBe('40px');
  });

  it('funciona cuando el almacenamiento lanza, como bajo sandbox', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const hostil = {
      getItem() { throw new DOMException('blocked', 'SecurityError'); },
      setItem() { throw new DOMException('blocked', 'SecurityError'); },
    };
    expect(() => mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b', storage: hostil }))
      .not.toThrow();
  });

  it('setPlacement mueve el panel entre esquinas', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    panel.setPlacement('bl');
    expect(panel.root.getAttribute('data-placement')).toBe('bl');
  });

  it('destroy limpia los escuchadores de resize y scroll', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const remove = vi.spyOn(window, 'removeEventListener');
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    panel.destroy();
    expect(remove).toHaveBeenCalled();
    remove.mockRestore();
  });

  // Regresión hallazgo 1: la posición estática (antes de fijar el CSS) no
  // debe decidir nada. Con el bug, el host recién insertado en el flujo
  // normal mide top:3000 (fuera de cualquier viewport razonable) y
  // choosePlacement se rendía sin llegar a probar ninguna esquina. La cascada
  // ya no corre sola al montar: hace falta pedir flotar para ejercitarla.
  it('al pedir flotar, usa una esquina aunque la posición estática esté fuera de vista (regresión hallazgo 1)', () => {
    stubStyle(new Map());
    const host = document.createElement('div');
    host.id = 'exe-poc-result';
    host.getBoundingClientRect = () => {
      const placement = host.getAttribute('data-placement');
      if (placement && placement !== 'anchored') {
        // apply() ya marcó una esquina y fijó el CSS: la caja está en vista.
        return { width: 300, height: 200, top: 12, left: 700, right: 1000, bottom: 212 };
      }
      // Todavía sin colocar (flujo estático): el host cuelga al final de una
      // página larga, muy por debajo del pliegue.
      return { width: 300, height: 200, top: 3000, left: 10, right: 310, bottom: 3200 };
    };
    document.body.appendChild(host);
    document.elementFromPoint = () => host;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    panel.shadow.getElementById('exe-poc-float').click();
    expect(PLACEMENTS).toContain(panel.root.getAttribute('data-placement'));
  });

  // La otra mitad de la misma defensa: si tras fijar el CSS la caja sigue
  // fuera de la vista de verdad, ahí sí toca anclar y avisar, porque esta vez
  // sí es la consecuencia de un flotado pedido y fallido.
  it('al pedir flotar, cae a anclado y avisa si la caja sigue fuera de la vista tras fijar la posición', () => {
    stubStyle(new Map());
    const host = document.createElement('div');
    host.id = 'exe-poc-result';
    host.getBoundingClientRect = () => ({ width: 300, height: 200, top: -9999, left: -9999, right: -9699, bottom: -9799 });
    document.body.appendChild(host);
    document.elementFromPoint = () => host;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    expect(panel.shadow.textContent).not.toMatch(/anclado al final de la página/i);
    panel.shadow.getElementById('exe-poc-float').click();
    expect(panel.root.getAttribute('data-placement')).toBe('anchored');
    expect(panel.shadow.textContent).toMatch(/anclado al final de la página/i);
  });

  // Regresión hallazgo 2: cerrar con el botón × es el camino normal, y tiene
  // que limpiar exactamente lo mismo que destroy(), no solo desmontar.
  it('cerrar limpia resize, scroll y pointerup, no solo desmonta el host', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const removeWin = vi.spyOn(window, 'removeEventListener');
    const removeDoc = vi.spyOn(document, 'removeEventListener');
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    panel.shadow.getElementById('exe-poc-close').click();
    expect(removeWin).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeWin).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    expect(removeDoc).toHaveBeenCalledWith('pointerup', expect.any(Function));
    removeWin.mockRestore();
    removeDoc.mockRestore();
  });

  // Ventana propia: todos los tests de este archivo comparten un único
  // window/document de jsdom, y los mountPanel() de tests anteriores que no
  // llaman a close/destroy dejan oyentes de scroll vivos ahí. Un
  // window.dispatchEvent en el document compartido dispararía también esos
  // restos y falsearía el recuento. Aislar la ventana es lo que permite
  // comprobar de verdad que este panel, y solo este, dejó de escuchar.
  it('no repite trabajo tras cerrar: un scroll posterior no vuelve a sondear', async () => {
    const { window: win } = new JSDOM('<!doctype html><body></body>');
    const doc = win.document;
    const spy = vi.fn(() => null);
    doc.elementFromPoint = spy;
    const el = doc.createElement('p');
    el.textContent = 'contenido';
    const panel = mountPanel({ doc, title: 'S', subtitle: '', body: el, buildId: 'b' });
    // Se pide flotar para que el recheck por scroll tenga algo que hacer: por
    // defecto, anclado, ya no sondea nada en absoluto.
    panel.shadow.getElementById('exe-poc-float').click();
    spy.mockClear();
    panel.shadow.getElementById('exe-poc-close').click();
    win.dispatchEvent(new win.Event('scroll'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('flotar / anclar', () => {
  const body = () => {
    const el = document.createElement('p');
    el.textContent = 'contenido';
    return el;
  };

  it('por defecto monta anclado en el flujo, sin correr la sonda de esquinas ni mostrar aviso', () => {
    stubStyle(new Map());
    const spy = vi.fn(() => null);
    document.elementFromPoint = spy;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    expect(panel.root.getAttribute('data-placement')).toBe('anchored');
    expect(panel.shadow.textContent).not.toMatch(/anclado al final de la página/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('el botón de flotar tiene etiqueta, aria-label y title en español desde el principio', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    const floatBtn = panel.shadow.getElementById('exe-poc-float');
    expect(floatBtn.getAttribute('aria-label')).toMatch(/flotar/i);
    expect(floatBtn.title).toMatch(/flotar/i);
    expect(floatBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('pulsar el botón saca el panel del flujo y lo pone en una esquina', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null; // ninguna esquina tapada
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    const floatBtn = panel.shadow.getElementById('exe-poc-float');
    floatBtn.click();
    expect(PLACEMENTS).toContain(panel.root.getAttribute('data-placement'));
    expect(floatBtn.getAttribute('aria-pressed')).toBe('true');
    expect(floatBtn.getAttribute('aria-label')).toMatch(/anclar/i);
    expect(floatBtn.title).toMatch(/anclar/i);
  });

  it('una segunda pulsación devuelve el panel al flujo, sin aviso', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b' });
    const floatBtn = panel.shadow.getElementById('exe-poc-float');
    floatBtn.click();
    floatBtn.click();
    expect(panel.root.getAttribute('data-placement')).toBe('anchored');
    expect(panel.shadow.textContent).not.toMatch(/anclado al final de la página/i);
    expect(floatBtn.getAttribute('aria-pressed')).toBe('false');
    expect(floatBtn.getAttribute('aria-label')).toMatch(/flotar/i);
  });

  it('si el flotado pedido falla, ancla y esta vez sí avisa', () => {
    const outer = document.createElement('div');
    document.body.appendChild(outer);
    // El host se cuelga de outer, así que el ancestro que rompe el bloque
    // contenedor tiene que ser outer para que la defensa 1 se dispare.
    stubStyle(new Map([[outer, { transform: 'scale(1)' }]]));
    document.elementFromPoint = () => null;
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b', anchorTo: outer });
    panel.shadow.getElementById('exe-poc-float').click();
    expect(panel.root.getAttribute('data-placement')).toBe('anchored');
    expect(panel.shadow.textContent).toMatch(/anclado al final de la página/i);
    expect(panel.root.parentElement).toBe(outer);
  });

  it('restaura una posición flotante guardada al montar, sin esperar a que se pulse el botón', () => {
    stubStyle(new Map());
    document.elementFromPoint = () => null;
    const store = new Map([['exePocPanelPos', JSON.stringify({ left: 40, top: 90 })]]);
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const panel = mountPanel({ doc: document, title: 'S', subtitle: '', body: body(), buildId: 'b', storage });
    expect(panel.root.getAttribute('data-placement')).toBe('custom');
    const floatBtn = panel.shadow.getElementById('exe-poc-float');
    expect(floatBtn.getAttribute('aria-pressed')).toBe('true');
  });
});
