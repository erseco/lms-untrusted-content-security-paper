import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
const bundlePath = join(here, '..', 'dist', 'probe.bundle.js');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  }).sort();
}

function sourcesHash() {
  const h = createHash('sha256');
  for (const file of walk(srcDir)) h.update(readFileSync(file));
  return h.digest('hex').slice(0, 16);
}

describe('dist/probe.bundle.js', () => {
  const bundle = readFileSync(bundlePath, 'utf8');

  it('está al día respecto a src/', () => {
    expect(bundle).toContain('sources-sha256:' + sourcesHash());
  });

  it('no contiene un </script> literal, que rompería el inline en content.xml', () => {
    expect(bundle).not.toContain('</script>');
  });

  it('no usa sintaxis por encima de es2019', () => {
    expect(bundle).not.toMatch(/\?\?/);
    expect(bundle).not.toMatch(/\?\./);
  });

  it('publica el contrato congelado', () => {
    expect(bundle).toContain('__EXE_POC_RESULT');
    expect(bundle).toContain('exe-poc-result');
  });
});
