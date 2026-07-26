import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const poc = join(here, '..', '..');

function source(mode, library) {
  return join(poc, 'src-h5p-probe', mode, library);
}

describe.each([
  ['div', 'H5P.ExePocProbeDiv-1.0', 'H5P.ExePocProbeDiv'],
  ['iframe', 'H5P.ExePocProbeIframe-1.0', 'H5P.ExePocProbeIframe'],
])('paquete H5P %s', (mode, libraryDir, machineName) => {
  const h5p = JSON.parse(readFileSync(source(mode, 'h5p.json'), 'utf8'));
  const library = JSON.parse(
    readFileSync(source(mode, join(libraryDir, 'library.json')), 'utf8'),
  );
  const run = readFileSync(source(mode, join(libraryDir, 'scripts', 'run.js')), 'utf8');

  it('fuerza un único modo de embebido', () => {
    expect(h5p.embedTypes).toEqual([mode]);
    expect(library.embedTypes).toEqual([mode]);
    expect(h5p.mainLibrary).toBe(machineName);
    expect(library.machineName).toBe(machineName);
  });

  it('carga primero el bundle y después attach()', () => {
    expect(library.preloadedJs.map((item) => item.path)).toEqual([
      'scripts/probe.h5p.bundle.js',
      'scripts/run.js',
    ]);
    expect(run).toContain('.prototype.attach');
    expect(run).toContain('allowSelfHost: window.parent === window');
    expect(run).toContain('measurementOnly: true');
    expect(run).toContain('anchorTo: root');
    expect(run).toContain("presentation: 'embedded'");
    expect(run).toContain('storage: null');
  });
});
