#!/usr/bin/env bash
# Genera los tres formatos canónicos con la CLI real de eXeLearning.
#
# Una única fuente .elp intermedia de 21 páginas se exporta como proyecto
# eXeLearning, sitio web y SCORM 1.2. No se injertan manifiestos ni XML a mano.
#
# El .elp que produce exelib.py es intermedio; quien emite un .elpx bien formado
# —tema, iDevices, navegación y HTML exportado— es la CLI. Por eso el artefacto
# es indistinguible de uno hecho en el editor.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
EXE_DIR="${EXE_DIR:-/Users/ernesto/Downloads/git/exelearning_5}"
OUT="${OUT:-$HERE/../evil.elpx}"
OUT_WEB="${OUT_WEB:-$HERE/../evil_web.zip}"
OUT_SCORM="${OUT_SCORM:-$HERE/../evil-scorm.zip}"
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
make -C "$EXE_DIR" export-elpx FORMAT=html5 \
  INPUT="$TMP/suite.elp" OUTPUT="$OUT_WEB" THEME=base >/dev/null
echo "ESCRITO $OUT_WEB ($(du -h "$OUT_WEB" | cut -f1))"
make -C "$EXE_DIR" export-elpx FORMAT=scorm12 \
  INPUT="$TMP/suite.elp" OUTPUT="$OUT_SCORM" THEME=base >/dev/null
echo "ESCRITO $OUT_SCORM ($(du -h "$OUT_SCORM" | cut -f1))"
