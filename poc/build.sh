#!/usr/bin/env bash
#
# build.sh — Reproducibly (re)build the SAFE PoC artifacts from sources.
#
#   evil-page.html     standalone HTML with the probe inlined (for mod_page / file://)
#   evil-scorm.zip     minimal SCORM 1.2 package whose SCO runs the probe
#   evil.elpx          copy of exe-probe-suite.elpx (the 20-page probe suite)
#   evil.h5p           an H5P package (base fixture) with an XSS attempt injected
#   evil_web.zip       eXeLearning web export (content.xml + probe) for mod_exeweb
#   evil-exescorm.zip  SCORM + content.xml for mod_exescorm's package validator
#
# The bundled 15-check probe is read-only: it only DETECTS capabilities (booleans +
# redacted error names) — no exfiltration, no network, no POST, no SCORM mutators.
# The artifacts also ship probe.js's opt-in DEMO buttons, which perform authorized,
# reversible actions (incl. real POSTs and one external image fetch) ONLY when clicked
# and ONLY in same-origin/legacy mode (SecurityError in secure/opaque mode).
#
# Every eXeLearning artifact derives from exe-probe-suite.elpx, which is committed here
# (its generator lives in suite-src/ and needs the real eXeLearning CLI, so we ship the
# built package rather than rebuilding it). Only evil.h5p still needs an external base
# fixture; override its path with an env var if needed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# The one eXeLearning package everything else is cut from (20 pages, native iDevices,
# probe inlined in content.xml and in the exported HTML). Built by suite-src/build.sh.
SUITE_ELPX="${SUITE_ELPX:-$HERE/exe-probe-suite.elpx}"

# Base fixture for the H5P negative control. Override with FIX=... (or BASE_H5P= directly).
# By default we look for the eXeLearning plugin's test fixtures relative to this repo's
# parent; adjust to wherever you keep them (a local mod_exelearning checkout's
# research/fixtures/).
FIX="${FIX:-../fixtures}"
BASE_H5P="${BASE_H5P:-$FIX/h5p/question-set-demo.h5p}"

# Fuente única de la sonda. Se compila aparte con `npm run build` en poc/probe/
# y su dist/ está commiteado, así que este script sigue necesitando solo bash.
PROBE_SRC="${PROBE_SRC:-$HERE/probe/dist/probe.bundle.js}"

if [ ! -f "$PROBE_SRC" ]; then
  echo "ERROR: falta $PROBE_SRC — ejecuta 'cd poc/probe && npm run build'" >&2
  exit 1
fi

if [ ! -f "$SUITE_ELPX" ]; then
  echo "ERROR: falta $SUITE_ELPX — regenéralo con 'cd poc/suite-src && bash build.sh'" >&2
  echo "       (requiere un checkout local de la CLI real de eXeLearning; ver su README)" >&2
  exit 1
fi

mkdir -p base
say() { printf '\033[1;34m[build]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }

# Collect any missing external base fixtures so we can HARD-FAIL at the end (after
# building the offline-reproducible artifacts), rather than silently producing a
# partial set. See the final fixture gate below.
MISSING_FIXTURES=()

# ---------------------------------------------------------------------------
# 1) evil-page.html  =  HTML header + inlined probe.js + footer
# ---------------------------------------------------------------------------
say "Generating evil-page.html (probe inlined)"
{
  cat <<'HTML'
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PoC SEGURA — recurso Página (HTML/JS)</title>
</head>
<body>
  <h1>PoC SEGURA — recurso Página / HTML enriquecido</h1>
  <p>Si ves la tabla de abajo, el JavaScript <strong>se ha ejecutado</strong> en este
     contexto. Si no aparece, el HTML fue filtrado (p. ej. HTMLPurifier de Moodle quitó
     el <code>&lt;script&gt;</code>). La sonda solo detecta capacidades; no exfiltra nada.</p>
  <!-- The probe is INLINED on purpose: mod_page stores HTML in the DB and does not
       serve sibling files, so an external <script src> would not load. -->
  <script>
HTML
  cat "$PROBE_SRC"
  cat <<'HTML'
  </script>
</body>
</html>
HTML
} > evil-page.html
say "  -> evil-page.html ($(wc -c < evil-page.html) bytes)"

# ---------------------------------------------------------------------------
# 2) evil-scorm.zip  =  imsmanifest.xml + index.html + probe.bundle.js
# ---------------------------------------------------------------------------
say "Building evil-scorm.zip (SCORM 1.2)"
rm -f evil-scorm.zip
TMP_SCORM="$(mktemp -d)"
cp src-scorm/imsmanifest.xml src-scorm/index.html "$TMP_SCORM/"
cp "$PROBE_SRC" "$TMP_SCORM/probe.bundle.js"
( cd "$TMP_SCORM" && zip -q -r -X "$HERE/evil-scorm.zip" imsmanifest.xml index.html probe.bundle.js )
rm -rf "$TMP_SCORM"
say "  -> evil-scorm.zip ($(wc -c < evil-scorm.zip) bytes)"

# ---------------------------------------------------------------------------
# 3) evil.elpx  =  exe-probe-suite.elpx, verbatim.
#    The .elpx uploaded to mod_exelearning / wp-exelearning / Omeka IS the probe suite:
#    one package, 20 pages, probe inlined in content.xml and in the exported HTML. The
#    name is kept because it is the one cited by the paper and by the published evidence.
# ---------------------------------------------------------------------------
say "Building evil.elpx (copy of exe-probe-suite.elpx)"
cp -f "$SUITE_ELPX" evil.elpx
say "  -> evil.elpx ($(wc -c < evil.elpx) bytes)"

# ---------------------------------------------------------------------------
# 4) evil.h5p  =  base H5P package + XSS attempt injected into content.json
#    (negative control: H5P filterParameters should strip it)
# ---------------------------------------------------------------------------
if [[ -f "$BASE_H5P" ]]; then
  say "Building evil.h5p from base: $BASE_H5P"
  rm -f evil.h5p
  TMP_H5P="$(mktemp -d)"
  unzip -q -o "$BASE_H5P" -d "$TMP_H5P"
  if [[ -f "$TMP_H5P/content/content.json" ]]; then
    python3 - "$TMP_H5P/content/content.json" <<'PY'
import sys, json, io
p = sys.argv[1]
d = json.load(io.open(p, encoding='utf-8'))
# Inocuous attempt: a <script> that only sets a flag + an <img onerror> flag.
# If H5P renders it raw, the flags appear; if filtered (expected), they don't.
payload = ('<p>PoC</p>'
           '<script>window.__EXE_POC_H5P_RAN=true;</script>'
           '<img src=x onerror="window.__EXE_POC_H5P_IMG=true;">')
intro = d.get('introPage')
if isinstance(intro, dict):
    intro['introduction'] = payload + (intro.get('introduction') or '')
    intro['showIntroPage'] = True
else:
    d['__poc_note'] = payload
json.dump(d, io.open(p, 'w', encoding='utf-8'), ensure_ascii=False)
print("injected XSS attempt into content/content.json (introPage.introduction)")
PY
  else
    warn "base .h5p has no content/content.json; nothing injected"
  fi
  # H5P is a zip with h5p.json at the root.
  ( cd "$TMP_H5P" && zip -q -r -X "$HERE/evil.h5p" . )
  rm -rf "$TMP_H5P"
  say "  -> evil.h5p ($(wc -c < evil.h5p) bytes)"
else
  err "BASE_H5P not found: $BASE_H5P"
  MISSING_FIXTURES+=("evil.h5p <- base .h5p fixture: $BASE_H5P")
fi

# ---------------------------------------------------------------------------
# 5) evil-h5p-library.h5p  =  a minimal CUSTOM H5P library whose preloadedJs runs
#    POSITIVE control: H5P libraries are TRUSTED CODE -> their JS executes in the host
#    page, same-origin and unsandboxed. Installing a NEW library from an uploaded .h5p
#    needs moodle/h5p:updatelibraries (manager/admin by default, RISK_XSS); an editing
#    teacher (h5p:deploy only) cannot. So this is an admin-trust / supply-chain PoC.
# ---------------------------------------------------------------------------
if [[ -d src-h5p-lib ]]; then
  say "Building evil-h5p-library.h5p (custom library, preloadedJs executes)"
  rm -f evil-h5p-library.h5p
  TMP_H5PL="$(mktemp -d)"
  cp -R src-h5p-lib/. "$TMP_H5PL/"
  ( cd "$TMP_H5PL" && zip -q -r -X "$HERE/evil-h5p-library.h5p" h5p.json content "H5P.ExePocAlert-1.0" )
  rm -rf "$TMP_H5PL"
  say "  -> evil-h5p-library.h5p ($(wc -c < evil-h5p-library.h5p) bytes)"
else
  warn "src-h5p-lib/ not found; skipping evil-h5p-library.h5p"
fi

# ---------------------------------------------------------------------------
# 6) evil_web.zip  =  eXeLearning *web export* (index.html + content.xml + assets +
#    probe) for mod_exeweb. mod_exeweb opens an .elpx-style web export and requires
#    content.xml at the root. The suite already is such an export carrying the probe,
#    so this is a verbatim copy. Used by evidencias/exeweb-exescorm-test.cjs.
# ---------------------------------------------------------------------------
say "Building evil_web.zip (eXeLearning web export for mod_exeweb)"
cp -f "$SUITE_ELPX" evil_web.zip
say "  -> evil_web.zip ($(wc -c < evil_web.zip) bytes)"

# ---------------------------------------------------------------------------
# 7) evil-exescorm.zip  =  evil-scorm.zip contents + content.xml for mod_exescorm.
#    mod_exescorm's validator (exescorm_package::validate_file_list) requires a file
#    matching /^content(v\d+)?\.xml$/ and forbids *.php — a plain SCORM zip is rejected.
#    We graft the suite's content.xml onto the SCORM package (the SCO that runs is still
#    index.html). Used by evidencias/exeweb-exescorm-test.cjs.
# ---------------------------------------------------------------------------
if [[ -f evil-scorm.zip ]]; then
  say "Building evil-exescorm.zip (SCORM + content.xml for mod_exescorm)"
  rm -f evil-exescorm.zip
  TMP_EXS="$(mktemp -d)"
  unzip -q -o evil-scorm.zip -d "$TMP_EXS"
  unzip -q -o "$SUITE_ELPX" content.xml -d "$TMP_EXS"
  ( cd "$TMP_EXS" && zip -q -r -X "$HERE/evil-exescorm.zip" index.html content.xml imsmanifest.xml probe.bundle.js )
  rm -rf "$TMP_EXS"
  say "  -> evil-exescorm.zip ($(wc -c < evil-exescorm.zip) bytes)"
else
  warn "evil-scorm.zip missing; skipping evil-exescorm.zip"
fi

say "Built so far. Artifacts:"
ls -la evil-page.html evil-scorm.zip evil.elpx evil.h5p evil-h5p-library.h5p evil_web.zip evil-exescorm.zip 2>/dev/null || true

# ---------------------------------------------------------------------------
# Fixture gate: HARD-FAIL if the external base fixture was missing.
#
# Six of the seven artifacts above build from sources committed in this repo — the probe
# bundle, src-scorm/, src-h5p-lib/ and exe-probe-suite.elpx — and are already done by this
# point. Only evil.h5p is *derived* from an external H5P base fixture that is NOT shipped
# here. If that input is absent we must NOT pretend the build succeeded with a silent
# partial set — exit non-zero.
# ---------------------------------------------------------------------------
if (( ${#MISSING_FIXTURES[@]} > 0 )); then
  err "Build INCOMPLETE: ${#MISSING_FIXTURES[@]} artifact(s) could not be built because"
  err "their external base fixture(s) are missing:"
  for m in "${MISSING_FIXTURES[@]}"; do err "  - $m"; done
  err ""
  err "Obtain the base fixture from a local eXeLearning / mod_exelearning checkout's"
  err "test-fixtures dir (e.g. <mod_exelearning>/research/fixtures/) — the default is:"
  err "  BASE_H5P  = \$FIX/h5p/question-set-demo.h5p"
  err "then point the build at it, e.g.:"
  err "  FIX=/path/to/fixtures bash build.sh"
  err "  # or:  BASE_H5P=/abs/base.h5p bash build.sh"
  exit 1
fi

say "Done. All 7 artifacts built:"
ls -la evil-page.html evil-scorm.zip evil.elpx evil.h5p evil-h5p-library.h5p evil_web.zip evil-exescorm.zip 2>/dev/null || true
