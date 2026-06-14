#!/usr/bin/env bash
#
# build.sh — Reproducibly (re)build the four SAFE PoC artifacts from sources.
#
#   evil-page.html   standalone HTML with the probe inlined (for mod_page / file://)
#   evil-scorm.zip   minimal SCORM 1.2 package whose SCO runs the probe
#   evil.elpx        an eXeLearning package (base fixture) with the probe injected
#   evil.h5p         an H5P package (base fixture) with an XSS attempt injected
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
  warn "BASE_ELPX not found ($BASE_ELPX); skipping evil.elpx"
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
  warn "BASE_H5P not found ($BASE_H5P); skipping evil.h5p"
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

say "Done. Artifacts:"
ls -la evil-page.html evil-scorm.zip evil.elpx evil.h5p evil-h5p-library.h5p 2>/dev/null || true
