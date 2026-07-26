import { describe, it, expect } from 'vitest';
import generic from '../src/hosts/generic.js';
import { createContext, validateAdapter } from '../src/hosts/contract.js';

// El adaptador genérico es el que gana cuando SÍ hay acceso al padre pero ese
// padre no es ninguna de las cuatro plataformas conocidas: un servidor web
// sin gestor de contenidos detrás (apartado 5.5 del paquete). Estas medidas
// son la versión segura de lo que el apartado 5.5 describe como riesgo:
// «leer las cookies del dominio», «instalar un manejador de teclado» y
// «alcanzar un servidor externo», sin capturar ni transmitir nada.

function genericDoc(cspContent) {
  const doc = document.implementation.createHTMLDocument('generic');
  if (cspContent) {
    const meta = doc.createElement('meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy');
    meta.setAttribute('content', cspContent);
    doc.head.appendChild(meta);
  }
  doc.cookie = 'idioma=es';
  return doc;
}

function genericCtx({ cspContent, fetchImpl } = {}) {
  const doc = genericDoc(cspContent);
  const parent = { document: doc, location: { href: 'http://localhost/' } };
  const win = { parent, origin: 'http://localhost', fetch: fetchImpl || (() => {}) };
  win.parent.parent = parent;
  return createContext({ win, journal: null, buildId: 'b' });
}

function blindCtx() {
  const win = { get parent() { throw new DOMException('no', 'SecurityError'); }, origin: 'null' };
  return createContext({ win, journal: null, buildId: 'b' });
}

describe('adaptador genérico — medidas del servidor sin plataforma', () => {
  it('cumple el contrato', () => {
    expect(validateAdapter(generic)).toEqual([]);
  });

  it('no ofrece demos: es medición, nunca una acción', () => {
    expect(generic.demos).toEqual([]);
  });

  it('sin acceso al padre (origen opaco), las tres medidas son false', () => {
    const m = generic.measure(blindCtx());
    expect(m.genericCookiesReadable).toBe(false);
    expect(m.genericKeyboardHookInstallable).toBe(false);
    expect(m.genericExternalConnectReachable).toBe(false);
  });

  it('con acceso al padre y sin CSP declarada, las tres medidas son true', () => {
    const m = generic.measure(genericCtx());
    expect(m.genericCookiesReadable).toBe(true);
    expect(m.genericKeyboardHookInstallable).toBe(true);
    expect(m.genericExternalConnectReachable).toBe(true);
  });

  it('con connect-src restringido en la CSP, no se afirma alcance externo', () => {
    const m = generic.measure(genericCtx({ cspContent: "default-src 'self'; connect-src 'self'" }));
    expect(m.genericExternalConnectReachable).toBe(false);
  });

  it('nunca lee ni publica el valor de las cookies, solo si son legibles', () => {
    const m = generic.measure(genericCtx());
    expect(JSON.stringify(m)).not.toMatch(/idioma=es/);
  });

  it('instala y retira el manejador de teclado en el mismo tick, sin quedarse escuchando', () => {
    const doc = genericDoc();
    const added = [];
    const removed = [];
    const realAdd = doc.addEventListener.bind(doc);
    const realRemove = doc.removeEventListener.bind(doc);
    doc.addEventListener = (type, fn, opts) => { added.push(type); return realAdd(type, fn, opts); };
    doc.removeEventListener = (type, fn, opts) => { removed.push(type); return realRemove(type, fn, opts); };
    const parent = { document: doc, location: { href: 'http://localhost/' } };
    const win = { parent, origin: 'http://localhost', fetch: () => {} };
    win.parent.parent = parent;
    const ctx = createContext({ win, journal: null, buildId: 'b' });

    const m = generic.measure(ctx);

    expect(m.genericKeyboardHookInstallable).toBe(true);
    // Se filtra a 'keydown': jsdom puede registrar internamente otros tipos
    // de evento (p. ej. de hover) sobre un documento suelto que nada tienen
    // que ver con esta medida. Lo que importa es que el manejador de
    // teclado se instale y se retire exactamente una vez cada uno, sin
    // quedarse escuchando.
    expect(added.filter((t) => t === 'keydown')).toEqual(['keydown']);
    expect(removed.filter((t) => t === 'keydown')).toEqual(['keydown']);
  });

  it('nunca hace red: measure() no llama a fetch', () => {
    const fetchImpl = () => { throw new Error('no debería llamarse'); };
    expect(() => generic.measure(genericCtx({ fetchImpl }))).not.toThrow();
  });
});
