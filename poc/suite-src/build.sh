#!/usr/bin/env bash
# Genera poc/evil.elpx con la CLI real de eXeLearning.
#
# Un solo .elpx de 21 páginas (el que se sube a Moodle/WP/Omeka y del que
# poc/build.sh corta evil_web.zip y evil-exescorm.zip). El nombre canónico
# es evil.elpx (el que citan el artículo y las evidencias).
#
# El .elp que produce exelib.py es intermedio; quien emite un .elpx bien formado
# —tema, iDevices, navegación y HTML exportado— es la CLI. Por eso el artefacto
# es indistinguible de uno hecho en el editor.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
EXE_DIR="${EXE_DIR:-/Users/ernesto/Downloads/git/exelearning_5}"
OUT="${OUT:-$HERE/../evil.elpx}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

[ -f "$HERE/../probe/dist/probe.bundle.js" ] || {
  echo "ERROR: falta probe/dist/probe.bundle.js — ejecuta 'cd poc/probe && npm run build'" >&2
  exit 1
}

# El PDF del Caso 3.3 se genera aquí, no se commitea: así el "guía de uso"
# que descarga esa página es siempre contenido de verdad, reproducible en
# cada build, en vez de un binario de relleno.
python3 "$HERE/build_pdf.py" "$HERE/assets/probe-embed.pdf"

python3 "$HERE/exelib.py" "$HERE/spec.json" "$TMP/suite.elp"
make -C "$EXE_DIR" export-elpx FORMAT=elpx \
  INPUT="$TMP/suite.elp" OUTPUT="$OUT" THEME=base >/dev/null
echo "ESCRITO $OUT ($(du -h "$OUT" | cut -f1))"
