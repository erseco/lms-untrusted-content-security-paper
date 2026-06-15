#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Verifies the mod_label (Label) same-origin top-window XSS vector live: boots one
# Moodle version, seeds the demo course/teacher, and runs
# evidencias/label-xss-test.cjs (an editing teacher plants an inert <script> in a
# Label; the course page is then loaded to confirm it executes). Writes
# evidencias/resultados-label-xss.json. The noclean=true path is identical across
# Moodle versions, so one version suffices; override with LABEL_TAG.
#
# Usage: bash run-label-check.sh            # v5.2.1 by default
#        LABEL_TAG=v4.5.12 bash run-label-check.sh
set -uo pipefail
cd "$(dirname "$0")"
EVID="$(cd ../evidencias && pwd)"
OUTJSON="$EVID/resultados-label-xss.json"
[ -f .env ] || cp .env.dist .env
set -a; . ./.env; set +a
BASE="http://localhost"
TAG="${LABEL_TAG:-v5.2.1}"
TEACHER="${LABEL_USER:-teacher_demo}"
TPASS="${LABEL_PASS:-Demo!2026}"

DC() { MOODLE_VERSION="$TAG" docker compose "$@"; }
docker compose down -v --remove-orphans >/dev/null 2>&1 || true
holder80="$(docker ps --format '{{.Names}} {{.Ports}}' | awk '/0\.0\.0\.0:80->/{print $1}' | grep -v '^lab-' | head -1)"
[ -n "$holder80" ] && { echo "FATAL: host port 80 held by '$holder80'. docker stop $holder80"; exit 3; }

bash fetch-plugin.sh
( cd "$EVID" && { [ -d node_modules/playwright ] || npm install --no-audit --no-fund; } && npx playwright install chromium ) \
  || { echo "FATAL: playwright setup failed"; exit 2; }

http_code() { curl -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || echo 000; }
echo "==================== Moodle $TAG ===================="
DC up -d >/dev/null 2>&1
echo "Waiting for install (config.php) + web 200..."
deadline=$(( $(date +%s) + 900 ))
until DC exec -T moodle test -f /var/www/html/config.php 2>/dev/null; do [ "$(date +%s)" -ge "$deadline" ] && { echo "FATAL: no config.php"; exit 4; }; sleep 5; done
deadline=$(( $(date +%s) + 300 ))
while [ "$(http_code "$BASE/login/index.php")" != 200 ]; do [ "$(date +%s)" -ge "$deadline" ] && { echo "FATAL: not 200"; exit 5; }; sleep 5; done
MOODLE_VERSION="$TAG" bash install-plugin.sh >/dev/null 2>&1 || { echo "FATAL: seed failed"; exit 6; }
RELEASE="$(DC exec -T moodle sh -lc 'php -r '\''define("CLI_SCRIPT",true); @require("/var/www/html/config.php"); global $CFG; echo isset($CFG->release)?$CFG->release:"";'\''' 2>/dev/null | tr -d '\r' | head -1)"
echo "release: ${RELEASE:-?}"

MOODLE_BASE="$BASE" LABEL_USER="$TEACHER" LABEL_PASS="$TPASS" COURSE_ID=2 OUT="$OUTJSON" \
  node "$EVID/label-xss-test.cjs" || echo "(label-xss-test nonzero)"

# Stamp provenance into the JSON.
RELEASE="$RELEASE" TAG="$TAG" python3 - "$OUTJSON" <<'PY'
import json, os, sys
p = sys.argv[1]
d = json.load(open(p))
d["_meta"] = {
  "descripcion": "Verificacion en vivo de que una Etiqueta (mod_label) ejecuta <script> de autor en la VENTANA SUPERIOR (pagina del curso), same-origin, igual que mod_page. Mecanismo: format_module_intro() con noclean=true incondicional.",
  "harness": "lab/run-label-check.sh + evidencias/label-xss-test.cjs",
  "release": os.environ.get("RELEASE") or None,
  "requestedTag": os.environ.get("TAG"),
  "nota": "Lab desechable POC-SAFE; los marcadores solo fijan banderas booleanas en window. Restringido por mod/label:addinstance (editingteacher + manager).",
}
json.dump(d, open(p, "w"), indent=2, ensure_ascii=False); open(p, "a").write("\n")
print("scriptExecuted=%s imgOnerror=%s (release %s)" % (d.get("scriptExecuted"), d.get("imgOnerror"), os.environ.get("RELEASE")))
PY

DC down -v >/dev/null 2>&1 || true
echo "Done -> $OUTJSON"
