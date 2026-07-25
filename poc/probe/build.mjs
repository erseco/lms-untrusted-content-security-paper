/*
 * Compila la sonda a un bundle IIFE único.
 *
 * dist/probe.bundle.js se COMMITEA: build.py y build.sh solo necesitan Python 3
 * y bash, que es lo que promete REPRODUCIBILITY.md. npm hace falta únicamente
 * para recompilar desde las fuentes.
 */
import { build } from 'esbuild';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, 'src');
const outFile = join(here, 'dist', 'probe.bundle.js');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  }).sort();
}

const hash = createHash('sha256');
for (const file of walk(srcDir)) hash.update(readFileSync(file));
const sourcesSha = hash.digest('hex').slice(0, 16);

await build({
  entryPoints: [join(srcDir, 'entry', 'probe.js')],
  bundle: true,
  format: 'iife',
  target: 'es2019',
  minify: true,
  legalComments: 'none',
  outfile: outFile,
  banner: {
    js: '/* exe-probe-suite · sources-sha256:' + sourcesSha + ' · ' +
        'Instrumento de medida para laboratorio propio y autorizado. */',
  },
});

// Un </script> literal rompería el inline dentro de content.xml.
const out = readFileSync(outFile, 'utf8');
if (out.includes('</script>')) {
  throw new Error('el bundle contiene un </script> literal');
}
writeFileSync(outFile, out);
console.log('bundle escrito:', outFile, out.length, 'bytes · sources-sha256:' + sourcesSha);
