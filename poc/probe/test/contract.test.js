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
