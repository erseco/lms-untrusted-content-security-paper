import { describe, it, expect, vi } from 'vitest';
import omeka from '../src/hosts/omeka.js';
import { readCsrf } from '../src/hosts/omeka-actions.js';
import { createContext, validateAdapter } from '../src/hosts/contract.js';
import { createJournal } from '../src/core/journal.js';

function omekaDoc() {
  const doc = document.implementation.createHTMLDocument('omeka');
  doc.head.innerHTML = '<meta name="generator" content="Omeka S 4.1.0">';
  doc.body.innerHTML =
    '<link href="/application/asset/css/style.css">' +
    '<form id="content"><input type="hidden" name="csrf" value="CSRF-CENTINELA"></form>';
  return doc;
}

function omekaCtx(fetchImpl) {
  const doc = omekaDoc();
  const parent = { document: doc, location: { href: 'http://localhost/admin' } };
  const win = { parent, origin: 'http://localhost', fetch: fetchImpl || vi.fn() };
  win.parent.parent = parent;
  return createContext({ win, journal: null, buildId: 'b' });
}

function blindCtx() {
  const win = { get parent() { throw new DOMException('no', 'SecurityError'); }, origin: 'null' };
  return createContext({ win, journal: null, buildId: 'b' });
}

describe('adaptador omeka', () => {
  it('cumple el contrato', () => {
    expect(validateAdapter(omeka)).toEqual([]);
  });

  it('detecta Omeka S por el meta generator y los assets', () => {
    const r = omeka.detect(omekaCtx());
    expect(r.matched).toBe(true);
    expect(r.signals.join(' ')).toMatch(/generator/);
  });

  it('no detecta nada sin acceso al padre', () => {
    expect(omeka.detect(blindCtx()).matched).toBe(false);
  });

  it('mide el csrf sin publicar su valor', () => {
    const m = omeka.measure(omekaCtx());
    expect(m.omekaCsrfReachable).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/CSRF-CENTINELA/);
  });

  it('readCsrf extrae el token de un formulario', () => {
    expect(readCsrf(omekaDoc())).toBe('CSRF-CENTINELA');
  });

  it('readCsrf devuelve null cuando no hay token', () => {
    expect(readCsrf(document.implementation.createHTMLDocument('x'))).toBe(null);
  });

  it('bajo origen opaco la demo devuelve BLOQUEADO sin tocar el diario', async () => {
    const journal = createJournal({ buildId: 'b', storage: null });
    const raw = await new Promise((res) => omeka.demos[0].run(blindCtx(), journal, res));
    expect(String(raw)).toMatch(/^BLOQUEADO/);
    expect(journal.entries()).toHaveLength(0);
  });

  it('registra el ítem en el diario con una reversión ejecutable', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url, method: (init && init.method) || 'GET' });
      if (String(url).indexOf('/admin/item/add') !== -1 && (!init || init.method !== 'POST')) {
        return { ok: true, text: async () => '<form><input name="csrf" value="CSRF-CENTINELA"></form>' };
      }
      return { ok: true, url: 'http://localhost/admin/item/42', text: async () => '' };
    });
    const ctx = omekaCtx(fetchImpl);
    const journal = createJournal({ buildId: 'b', storage: null });

    const raw = await new Promise((res) => omeka.demos[0].run(ctx, journal, res));
    expect(JSON.parse(raw).itemCreated).toBe(true);

    const entry = journal.entries()[0];
    expect(entry.host).toBe('omeka');
    expect(entry.id).toBe('42');
    expect(typeof entry.undo).toBe('function');

    const saldo = await journal.revertAll();
    expect(saldo.reverted).toBe(1);
    expect(calls.some((c) => c.url.indexOf('/admin/item/42/delete') !== -1)).toBe(true);
  });
});
