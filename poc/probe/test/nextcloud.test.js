import { describe, it, expect, vi } from 'vitest';
import nextcloud from '../src/hosts/nextcloud.js';
import { readRequestToken, readUserId } from '../src/hosts/nextcloud-actions.js';
import { createContext, validateAdapter } from '../src/hosts/contract.js';
import { createJournal } from '../src/core/journal.js';
import { classifyDemoResult } from '../src/core/classify.js';

function ncCtx(fetchImpl) {
  const doc = document.implementation.createHTMLDocument('nc');
  doc.head.innerHTML = '<meta name="requesttoken" content="TOKEN-CENTINELA">';
  doc.head.setAttribute('data-user', 'alumna');
  doc.body.innerHTML = '<link href="/apps/files/css/x.css"><div id="nextcloud"></div>';
  const parent = {
    document: doc,
    location: { href: 'http://localhost/apps/files/' },
    OC: { getCurrentUser: () => ({ uid: 'alumna', displayName: 'Alumna Ejemplo' }) },
  };
  const win = { parent, origin: 'http://localhost', fetch: fetchImpl || vi.fn() };
  win.parent.parent = parent;
  return createContext({ win, journal: null, buildId: 'b' });
}

function blindCtx() {
  const win = { get parent() { throw new DOMException('no', 'SecurityError'); }, origin: 'null' };
  return createContext({ win, journal: null, buildId: 'b' });
}

describe('adaptador nextcloud', () => {
  it('cumple el contrato', () => {
    expect(validateAdapter(nextcloud)).toEqual([]);
  });

  it('detecta Nextcloud por el requesttoken y los assets de /apps/', () => {
    const r = nextcloud.detect(ncCtx());
    expect(r.matched).toBe(true);
    expect(r.confidence).toBe('strong');
  });

  it('no detecta nada sin acceso al padre', () => {
    expect(nextcloud.detect(blindCtx()).matched).toBe(false);
  });

  it('mide el requesttoken sin publicar su valor', () => {
    const m = nextcloud.measure(ncCtx());
    expect(m.ncRequestTokenReachable).toBe(true);
    expect(m.ncUserIdReachable).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/TOKEN-CENTINELA/);
  });

  it('lee token y usuario del DOM del padre', () => {
    expect(readRequestToken(ncCtx())).toBe('TOKEN-CENTINELA');
    expect(readUserId(ncCtx())).toBe('alumna');
  });

  it('declara dos demos de escritura', () => {
    expect(nextcloud.demos.map((d) => d.id)).toEqual(['nc-upload', 'nc-rename']);
    expect(nextcloud.demos.every((d) => d.persists)).toBe(true);
  });

  it('bajo origen opaco ambas devuelven BLOQUEADO sin tocar el diario', async () => {
    const journal = createJournal({ buildId: 'b', storage: null });
    for (const demo of nextcloud.demos) {
      const raw = await new Promise((res) => demo.run(blindCtx(), journal, res));
      expect(String(raw)).toMatch(/^BLOQUEADO/);
    }
    expect(journal.entries()).toHaveLength(0);
  });

  it('sube por WebDAV y deja una reversión que borra el fichero', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url: String(url), method: (init && init.method) || 'GET' });
      return { ok: true, status: 201, text: async () => '' };
    });
    const journal = createJournal({ buildId: 'b', storage: null });
    const raw = await new Promise((res) => nextcloud.demos[0].run(ncCtx(fetchImpl), journal, res));

    expect(JSON.parse(raw).fileUploaded).toBe(true);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toMatch(/\/remote\.php\/dav\/files\/alumna\/POC-b-/);

    await journal.revertAll();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('el rename guarda el nombre anterior y sabe revertirlo', async () => {
    const bodies = [];
    const fetchImpl = vi.fn(async (url, init) => {
      bodies.push(String((init && init.body) || ''));
      return { ok: true, status: 200, text: async () => '<ocs><meta><statuscode>200</statuscode></meta></ocs>' };
    });
    const journal = createJournal({ buildId: 'b', storage: null });
    await new Promise((res) => nextcloud.demos[1].run(ncCtx(fetchImpl), journal, res));

    expect(journal.entries()[0].previous).toBe('Alumna Ejemplo');
    await journal.revertAll();
    expect(bodies.some((b) => b.indexOf('Alumna+Ejemplo') !== -1 || b.indexOf('Alumna%20Ejemplo') !== -1)).toBe(true);
  });

  it('cuando la instancia no deja cambiar el nombre, el resultado es INDETERMINADO', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => '<ocs><meta><statuscode>997</statuscode></meta></ocs>',
    }));
    const journal = createJournal({ buildId: 'b', storage: null });
    const raw = await new Promise((res) => nextcloud.demos[1].run(ncCtx(fetchImpl), journal, res));
    expect(classifyDemoResult(raw, { isOpaqueOrigin: false }).state).toBe('unknown');
  });
});
