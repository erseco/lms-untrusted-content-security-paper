import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pocDir = join(here, '..', '..');
const pagePath = join(pocDir, 'evil-page.html');
const oldAutoPath = join(pocDir, 'evil-page-auto.html');
const bundlePath = join(here, '..', 'dist', 'probe.bundle.js');
const fragmentRenderer = join(pocDir, 'suite-src', 'render-medicion-fragment.py');

describe('evil-page.html canónico', () => {
  const html = readFileSync(pagePath, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim());

  it('es el único artefacto HTML de Página', () => {
    expect(existsSync(oldAutoPath)).toBe(false);
  });

  it('activa el anfitrión top-level antes de cargar la sonda actual', () => {
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain('__EXE_POC_ALLOW_SELF_HOST = true');
    expect(scripts[0]).toContain("__EXE_POC_VIEW = 'medicion'");
    expect(scripts[1]).toBe(readFileSync(bundlePath, 'utf8').trim());
  });

  it('incluye resultado y acciones Moodle visibles, pero no dispara ninguna', () => {
    const pageDoc = new DOMParser().parseFromString(html, 'text/html');
    expect(html).toContain('data-exe-probe-medicion');
    expect(pageDoc.querySelectorAll('[data-exe-probe-row]')).toHaveLength(10);
    expect(html).toContain('data-exe-probe-demo-host="moodle"');
    expect(html).toContain('Ninguna acción se ejecuta automáticamente');
  });

  it('reutiliza byte a byte la tabla y los estilos del generador de la página 1', () => {
    const render = (kind) => execFileSync(
      'python3', [fragmentRenderer, kind], { encoding: 'utf8' }
    ).trim();
    expect(html).toContain(render('css'));
    expect(html).toContain(render('html'));
  });
});
