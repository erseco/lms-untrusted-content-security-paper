import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProbe } from '../src/entry/h5p.js';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, '..', 'dist', 'probe.h5p.bundle.js');

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.__EXE_POC_RESULT;
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    transform: 'none',
    filter: 'none',
    perspective: 'none',
    contain: 'none',
    willChange: 'auto',
  });
  document.elementFromPoint = () => null;
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

describe('entrada H5P pasiva', () => {
  it('admite el documento superior de WordPress con allowSelfHost explícito', () => {
    startProbe({
      win: window,
      doc: document,
      buildId: 'h5p-test',
      allowSelfHost: true,
      measurementOnly: true,
      anchorTo: document.body,
    });
    expect(window.__EXE_POC_RESULT.canAccessParent).toBe(true);
    expect(window.__EXE_POC_RESULT.canReadParentDocument).toBe(true);
  });

  it('monta únicamente Resumen y Detalle en el ancla de H5P', () => {
    const root = document.createElement('section');
    document.body.appendChild(root);
    const panel = startProbe({
      win: window,
      doc: document,
      buildId: 'h5p-test',
      allowSelfHost: true,
      measurementOnly: true,
      anchorTo: root,
      presentation: 'embedded',
      storage: null,
    });
    expect(panel.root.parentElement).toBe(root);
    expect(panel.root.getAttribute('data-presentation')).toBe('embedded');
    expect(panel.root.getAttribute('data-placement')).toBe('anchored');
    expect([...panel.shadow.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent))
      .toEqual(['Resumen', 'Detalle']);
    expect(panel.shadow.querySelector('[data-demo]')).toBeNull();
    expect(panel.shadow.textContent).toMatch(/no contiene acciones mutadoras/i);
  });

  it('el bundle exporta startProbe, no se autoejecuta y no contiene mutadores', () => {
    const bundle = readFileSync(bundlePath, 'utf8');
    expect(bundle).toContain('ExeProbe');
    expect(bundle).toContain('startProbe');
    expect(bundle).not.toContain('__EXE_POC_NO_AUTOSTART');
    expect(bundle).not.toContain('core_user_update_users');
    expect(bundle).not.toContain('/course/edit.php');
    expect(bundle).not.toContain('/wp-json/wp/v2/media');
    expect(bundle).not.toMatch(/\.fetch\(/);
    expect(bundle).not.toContain('XMLHttpRequest');
    expect(bundle).not.toContain('sendBeacon');
    expect(bundle).not.toContain('Revertir todo');
    expect(bundle).not.toContain('Demostración');
  });
});
