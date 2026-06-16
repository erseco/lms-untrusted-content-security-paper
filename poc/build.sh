#!/usr/bin/env bash
#
# build.sh — Reproducibly (re)build the SAFE PoC artifacts from sources.
#
#   evil-page.html     standalone HTML with the probe inlined (for mod_page / file://)
#   evil-scorm.zip     minimal SCORM 1.2 package whose SCO runs the probe
#   evil.elpx          an eXeLearning package (base fixture) with the probe injected
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
# The .elpx and .h5p artifacts are derived from existing lab fixtures so they are
# guaranteed loadable. Override the base paths with env vars if needed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# Base fixtures dir. Override with FIX=... (or BASE_ELPX=/BASE_H5P= directly). By default
# we look for the eXeLearning plugin's test fixtures relative to this repo's parent; adjust
# to wherever you keep them (e.g. a local mod_exelearning checkout's research/fixtures/).
FIX="${FIX:-../fixtures}"
BASE_ELPX="${BASE_ELPX:-$FIX/elpx/really-simple-test-project.elpx}"
BASE_H5P="${BASE_H5P:-$FIX/h5p/question-set-demo.h5p}"

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
  cat probe.js
  cat <<'HTML'
  </script>
</body>
</html>
HTML
} > evil-page.html
say "  -> evil-page.html ($(wc -c < evil-page.html) bytes)"

# ---------------------------------------------------------------------------
# 2) evil-scorm.zip  =  imsmanifest.xml + index.html + probe.js
# ---------------------------------------------------------------------------
say "Building evil-scorm.zip (SCORM 1.2)"
rm -f evil-scorm.zip
TMP_SCORM="$(mktemp -d)"
cp src-scorm/imsmanifest.xml src-scorm/index.html "$TMP_SCORM/"
cp probe.js "$TMP_SCORM/"
( cd "$TMP_SCORM" && zip -q -r -X "$HERE/evil-scorm.zip" imsmanifest.xml index.html probe.js )
rm -rf "$TMP_SCORM"
say "  -> evil-scorm.zip ($(wc -c < evil-scorm.zip) bytes)"

# ---------------------------------------------------------------------------
# 3) evil.elpx  =  base eXeLearning package + injected probe
# ---------------------------------------------------------------------------
if [[ -f "$BASE_ELPX" ]]; then
  say "Building evil.elpx from base: $BASE_ELPX"
  rm -f evil.elpx
  TMP_ELPX="$(mktemp -d)"
  unzip -q -o "$BASE_ELPX" -d "$TMP_ELPX"
  cp probe.js "$TMP_ELPX/probe.js"
  # Inject a probe loader right before </body> of the rendered page.
  if [[ -f "$TMP_ELPX/index.html" ]]; then
    python3 - "$TMP_ELPX/index.html" <<'PY'
import sys, io
p = sys.argv[1]
html = io.open(p, encoding='utf-8', errors='ignore').read()
tag = '<script src="probe.js"></script>'
if tag not in html:
    if '</body>' in html:
        html = html.replace('</body>', tag + '\n</body>', 1)
    else:
        html = html + '\n' + tag
io.open(p, 'w', encoding='utf-8').write(html)
print("injected probe loader into index.html")
PY
  else
    warn "base .elpx has no index.html; probe not injected"
  fi
  ( cd "$TMP_ELPX" && zip -q -r -X "$HERE/evil.elpx" . )
  rm -rf "$TMP_ELPX"
  say "  -> evil.elpx ($(wc -c < evil.elpx) bytes)"
else
  err "BASE_ELPX not found: $BASE_ELPX"
  MISSING_FIXTURES+=("evil.elpx <- base .elpx fixture: $BASE_ELPX")
fi

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
#    content.xml at the root. We reuse evil.elpx (already a web export carrying the
#    probe), so this is a verbatim copy. Used by evidencias/exeweb-exescorm-test.cjs.
# ---------------------------------------------------------------------------
if [[ -f evil.elpx ]]; then
  say "Building evil_web.zip (eXeLearning web export for mod_exeweb)"
  cp -f evil.elpx evil_web.zip
  say "  -> evil_web.zip ($(wc -c < evil_web.zip) bytes)"
else
  warn "evil.elpx missing; skipping evil_web.zip (needs base .elpx fixture)"
fi

# ---------------------------------------------------------------------------
# 7) evil-exescorm.zip  =  evil-scorm.zip contents + content.xml for mod_exescorm.
#    mod_exescorm's validator (exescorm_package::validate_file_list) requires a file
#    matching /^content(v\d+)?\.xml$/ and forbids *.php — a plain SCORM zip is rejected.
#    We graft content.xml (from evil.elpx) onto the SCORM package. Used by
#    evidencias/exeweb-exescorm-test.cjs.
# ---------------------------------------------------------------------------
if [[ -f evil-scorm.zip && -f evil.elpx ]]; then
  say "Building evil-exescorm.zip (SCORM + content.xml for mod_exescorm)"
  rm -f evil-exescorm.zip
  TMP_EXS="$(mktemp -d)"
  unzip -q -o evil-scorm.zip -d "$TMP_EXS"
  unzip -q -o evil.elpx content.xml -d "$TMP_EXS"
  ( cd "$TMP_EXS" && zip -q -r -X "$HERE/evil-exescorm.zip" index.html content.xml imsmanifest.xml probe.js )
  rm -rf "$TMP_EXS"
  say "  -> evil-exescorm.zip ($(wc -c < evil-exescorm.zip) bytes)"
else
  warn "evil-scorm.zip or evil.elpx missing; skipping evil-exescorm.zip"
fi

say "Built so far. Artifacts:"
ls -la evil-page.html evil-scorm.zip evil.elpx evil.h5p evil-h5p-library.h5p evil_web.zip evil-exescorm.zip 2>/dev/null || true

# ---------------------------------------------------------------------------
# Fixture gate: HARD-FAIL if any external base fixture was missing.
#
# The three offline-reproducible artifacts above (evil-page.html, evil-scorm.zip,
# evil-h5p-library.h5p) build from sources committed in this repo and are already
# done by this point. The other two (evil.elpx, evil.h5p) are *derived* from external
# eXeLearning/H5P base fixtures that are NOT shipped here. If those inputs are absent
# we must NOT pretend the build succeeded with a silent partial set — exit non-zero.
# ---------------------------------------------------------------------------
if (( ${#MISSING_FIXTURES[@]} > 0 )); then
  err "Build INCOMPLETE: ${#MISSING_FIXTURES[@]} artifact(s) could not be built because"
  err "their external base fixture(s) are missing:"
  for m in "${MISSING_FIXTURES[@]}"; do err "  - $m"; done
  err ""
  err "Obtain the base fixtures from a local eXeLearning / mod_exelearning checkout's"
  err "test-fixtures dir (e.g. <mod_exelearning>/research/fixtures/) — the defaults are:"
  err "  BASE_ELPX = \$FIX/elpx/really-simple-test-project.elpx"
  err "  BASE_H5P  = \$FIX/h5p/question-set-demo.h5p"
  err "then point the build at them, e.g.:"
  err "  FIX=/path/to/fixtures bash build.sh"
  err "  # or:  BASE_ELPX=/abs/base.elpx BASE_H5P=/abs/base.h5p bash build.sh"
  exit 1
fi

say "Done. All 7 artifacts built:"
ls -la evil-page.html evil-scorm.zip evil.elpx evil.h5p evil-h5p-library.h5p evil_web.zip evil-exescorm.zip 2>/dev/null || true
