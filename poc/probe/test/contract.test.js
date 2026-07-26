import { describe, it, expect } from 'vitest';
import { validateAdapter, createContext } from '../src/hosts/contract.js';
import { ADAPTERS, detectHost } from '../src/hosts/index.js';
import generic from '../src/hosts/generic.js';

const ok = {
  id: 'x', label: 'X',
  detect: () => ({ matched: false, confidence: 'weak', signals: [] }),
  measure: () => ({}),
  demos: [],
};

describe('validateAdapter', () => {
  it('acepta un adaptador bien formado', () => {
    expect(validateAdapter(ok)).toEqual([]);
  });

  it('exige id, label, detect y measure', () => {
    expect(validateAdapter({ ...ok, id: undefined })).toContain('falta id');
    expect(validateAdapter({ ...ok, label: undefined })).toContain('falta label');
    expect(validateAdapter({ ...ok, detect: undefined })).toContain('detect no es función');
    expect(validateAdapter({ ...ok, measure: undefined })).toContain('measure no es función');
  });

  it('exige que cada demo declare id, label, help, persists y run', () => {
    const bad = { ...ok, demos: [{ id: 'd' }] };
    const problems = validateAdapter(bad);
    expect(problems.join(' ')).toMatch(/demo d/);
  });

  it('acepta una demo completa', () => {
    const good = {
      ...ok,
      demos: [{
        id: 'd', label: 'D', persists: false,
        help: { intenta: 'a', protege: 'b', reversion: 'c', doc: 'matriz-seguridad.md' },
        run: (ctx, journal, cb) => cb('BLOQUEADO'),
      }],
    };
    expect(validateAdapter(good)).toEqual([]);
  });
});

describe('createContext', () => {
  it('parentDoc devuelve null en vez de lanzar', () => {
    const win = { get parent() { throw new DOMException('no', 'SecurityError'); } };
    expect(createContext({ win, journal: null, buildId: 'b' }).parentDoc()).toBe(null);
  });

  it('parentDoc devuelve el documento cuando es alcanzable', () => {
    const doc = document.implementation.createHTMLDocument('p');
    const win = { parent: { document: doc } };
    win.parent.parent = win.parent;
    expect(createContext({ win, journal: null, buildId: 'b' }).parentDoc()).toBe(doc);
  });
});

// Regresión: parentWin() ya comprobaba `p === win` para no confundir "soy el
// top" con "tengo un padre real"; parentDoc() no lo hacía, así que en un
// documento ejecutado como top-level de verdad (sin ningún iframe por
// encima) devolvía su propio documento en vez de null. showcase.js:blocked()
// usa exactamente `!ctx.parentDoc()` para decidir si hay padre, así que con
// el bug dejaba correr las demos de la vitrina de impacto contra la propia
// página en vez de reportar BLOQUEADO — el hallazgo del Fix 5 de la tarea 23.
// Lo que hay que fijar aquí no es el resultado de cada función por separado
// (eso ya lo cubren los tests de arriba), sino que las dos estén siempre de
// acuerdo sobre si HAY padre: un test por función no habría atrapado esto,
// porque cada una pasaba sus propios tests describiendo mundos distintos
// para el mismo win.
describe('parentWin y parentDoc están de acuerdo sobre si hay padre', () => {
  function topLevel() {
    // win.document tiene que existir de verdad: si no, parentDoc() daría
    // null solo porque p.document es undefined, sin ejercitar en absoluto
    // el `p === win` que es justo lo que se está comprobando aquí.
    const doc = document.implementation.createHTMLDocument('top');
    const win = { document: doc };
    win.parent = win; // exactamente como window.parent de la ventana top
    return win;
  }

  function embeddedSameOrigin() {
    const doc = document.implementation.createHTMLDocument('p');
    const parentWinObj = { location: { href: 'http://anfitrion.test/' }, document: doc };
    parentWinObj.parent = parentWinObj;
    return { win: { parent: parentWinObj }, doc, parentWinObj };
  }

  function opaqueParent() {
    // El padre existe (no lanza al leer win.parent) pero es ilegible: el
    // caso real de un iframe sandbox sin allow-same-origin.
    const parent = {};
    Object.defineProperty(parent, 'location', {
      get() { throw new DOMException('blocked', 'SecurityError'); },
    });
    Object.defineProperty(parent, 'document', {
      get() { throw new DOMException('blocked', 'SecurityError'); },
    });
    return { win: { parent } };
  }

  it('en top-level de verdad (win.parent === win), los dos devuelven null', () => {
    const ctx = createContext({ win: topLevel(), journal: null, buildId: 'b' });
    expect(ctx.parentWin()).toBe(null);
    expect(ctx.parentDoc()).toBe(null);
  });

  it('mod_page puede declarar explícitamente que la propia ventana es el anfitrión', () => {
    const win = topLevel();
    const ctx = createContext({
      win, journal: null, buildId: 'b', allowSelfHost: true,
    });
    expect(ctx.parentWin()).toBe(win);
    expect(ctx.parentDoc()).toBe(win.document);
  });

  it('embebido de mismo origen, los dos devuelven su propio objeto', () => {
    const { win, doc, parentWinObj } = embeddedSameOrigin();
    const ctx = createContext({ win, journal: null, buildId: 'b' });
    expect(ctx.parentWin()).toBe(parentWinObj);
    expect(ctx.parentDoc()).toBe(doc);
  });

  it('bajo origen opaco (el padre existe pero es ilegible), los dos devuelven null', () => {
    const { win } = opaqueParent();
    const ctx = createContext({ win, journal: null, buildId: 'b' });
    expect(ctx.parentWin()).toBe(null);
    expect(ctx.parentDoc()).toBe(null);
  });

  it('nunca discrepan sobre si hay un padre alcanzable, en ningún escenario', () => {
    const escenarios = [topLevel, () => embeddedSameOrigin().win, () => opaqueParent().win];
    for (const build of escenarios) {
      const ctx = createContext({ win: build(), journal: null, buildId: 'b' });
      expect(ctx.parentWin() === null).toBe(ctx.parentDoc() === null);
    }
  });
});

describe('los adaptadores registrados', () => {
  it('todos cumplen el contrato', () => {
    for (const adapter of ADAPTERS) {
      expect({ id: adapter.id, problems: validateAdapter(adapter) })
        .toEqual({ id: adapter.id, problems: [] });
    }
  });

  it('incluye los cuatro anfitriones más el genérico', () => {
    expect(ADAPTERS.map((a) => a.id).sort())
      .toEqual(['generic', 'moodle', 'nextcloud', 'omeka', 'wordpress']);
  });

  it('toda demo que escribe declara persists: true', () => {
    for (const adapter of ADAPTERS) {
      for (const demo of adapter.demos) {
        expect(typeof demo.persists).toBe('boolean');
      }
    }
  });
});

describe('detectHost', () => {
  it('cae al genérico cuando el padre es inalcanzable', () => {
    const win = { get parent() { throw new DOMException('no', 'SecurityError'); } };
    const r = detectHost(createContext({ win, journal: null, buildId: 'b' }));
    expect(r.adapter.id).toBe('generic');
    expect(r.matched).toBe(false);
  });

  it('un adaptador que lanza en detect no rompe la detección', () => {
    const explosive = { ...ok, id: 'boom', detect: () => { throw new Error('boom'); } };
    const win = { get parent() { throw new DOMException('no', 'SecurityError'); } };
    const ctx = createContext({ win, journal: null, buildId: 'b' });
    expect(() => detectHost(ctx, [explosive, generic])).not.toThrow();
  });
});
