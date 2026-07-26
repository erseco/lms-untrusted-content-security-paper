import { describe, it, expect } from 'vitest';
import wordpress from '../src/hosts/wordpress.js';
import { createContext, validateAdapter } from '../src/hosts/contract.js';
import { createJournal } from '../src/core/journal.js';

function wpParent() {
  const doc = document.implementation.createHTMLDocument('wp');
  doc.body.className = 'wp-admin';
  doc.body.innerHTML = '<div id="wpadminbar"></div><link href="/wp-content/themes/x/style.css">' +
    '<li id="menu-plugins"><a href="plugins.php">Plugins</a></li>' +
    '<li id="menu-users"><a href="user-new.php">Añadir usuario</a></li>';
  const parent = {
    document: doc,
    location: { href: 'http://localhost/wp-admin/' },
    wpApiSettings: { nonce: 'NONCE-CENTINELA', root: 'http://localhost/wp-json/' },
  };
  const win = { parent };
  win.parent.parent = parent;
  return createContext({ win, journal: null, buildId: 'b' });
}

function blindCtx() {
  const win = { get parent() { throw new DOMException('no', 'SecurityError'); }, origin: 'null' };
  return createContext({ win, journal: null, buildId: 'b' });
}

describe('adaptador wordpress', () => {
  it('cumple el contrato', () => {
    expect(validateAdapter(wordpress)).toEqual([]);
  });

  it('detecta WordPress por wpApiSettings y por el DOM de wp-admin', () => {
    const r = wordpress.detect(wpParent());
    expect(r.matched).toBe(true);
    expect(r.confidence).toBe('strong');
  });

  it('no detecta nada sin acceso al padre', () => {
    expect(wordpress.detect(blindCtx()).matched).toBe(false);
  });

  it('mide el nonce REST sin publicar su valor', () => {
    const m = wordpress.measure(wpParent());
    expect(m.wpRestNonceReachable).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/NONCE-CENTINELA/);
  });

  // Activar un plugin y crear una cuenta con privilegios son la tercera y
  // cuarta acción de la maqueta de diseño (apartado 5.2) que el paquete NO
  // implementa como demo: se quedan en medida. Ninguna de las dos activa un
  // plugin ni crea una cuenta; solo comprueban si esas pantallas de
  // administración están enlazadas desde el DOM del padre.
  it('mide si la administración de plugins y la creación de usuarios son alcanzables', () => {
    const m = wordpress.measure(wpParent());
    expect(m.wpPluginAdminReachable).toBe(true);
    expect(m.wpUserCreateReachable).toBe(true);
  });

  it('mide todo en falso sin acceso al padre', () => {
    const m = wordpress.measure(blindCtx());
    expect(m.wpRestNonceReachable).toBe(false);
    expect(m.wpAdminBarReachable).toBe(false);
    expect(m.wpProfileFormReachable).toBe(false);
    expect(m.wpPluginAdminReachable).toBe(false);
    expect(m.wpUserCreateReachable).toBe(false);
  });

  it('declara tres demos de escritura', () => {
    expect(wordpress.demos.map((d) => d.id)).toEqual(['wp-rename', 'wp-photo', 'wp-content']);
    expect(wordpress.demos.every((d) => d.persists)).toBe(true);
  });

  it('bajo origen opaco todas devuelven BLOQUEADO sin tocar el diario', async () => {
    const journal = createJournal({ buildId: 'b', storage: null });
    for (const demo of wordpress.demos) {
      const raw = await new Promise((res) => demo.run(blindCtx(), journal, res));
      expect(String(raw)).toMatch(/^BLOQUEADO/);
    }
    expect(journal.entries()).toHaveLength(0);
  });
});
