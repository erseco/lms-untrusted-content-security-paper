#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Verifies the mod_exeweb / mod_exescorm same-origin, unsandboxed iframe vectors live:
# boots one Moodle version, installs the two plugins from a local source, then runs
# evidencias/exeweb-exescorm-test.cjs (as admin: creates a throwaway course, uploads
# poc/evil_web.zip into a mod_exeweb activity and poc/evil-exescorm.zip into a
# mod_exescorm activity, launches the content, and reads window.__EXE_POC_RESULT from
# INSIDE each package iframe). Writes evidencias/resultados-exeweb-exescorm.json.
#
# The plugins are NOT public on the network, so they are installed from a local
# checkout (env-overridable). The same-origin/unsandboxed iframe is identical across
# Moodle versions, so one version suffices; override with EXE_TAG.
#
# Env (all optional):
#   EXE_TAG       Moodle image tag           (default: v5.2.1)
#   EXEWEB_SRC    mod_exeweb source dir      (default: ../../mod_exeweb)
#   EXESCORM_SRC  mod_exescorm source dir    (default: ../../mod_exescorm)
#
# Usage: bash run-exeweb-check.sh
#        EXEWEB_SRC=/path/to/mod_exeweb EXESCORM_SRC=/path/to/mod_exescorm bash run-exeweb-check.sh
set -uo pipefail
cd "$(dirname "$0")"
EVID="$(cd ../evidencias && pwd)"
POC="$(cd ../poc && pwd)"
OUTJSON="$EVID/resultados-exeweb-exescorm.json"
[ -f .env ] || cp .env.dist .env 2>/dev/null || true
[ -f .env ] && { set -a; . ./.env; set +a; }
BASE="http://localhost"
TAG="${EXE_TAG:-v5.2.1}"
ADMIN_USER="${TEST_USER_USERNAME:-user}"
ADMIN_PASS="${TEST_USER_PASSWORD:-1234}"
EXEWEB_SRC="${EXEWEB_SRC:-../../mod_exeweb}"
EXESCORM_SRC="${EXESCORM_SRC:-../../mod_exescorm}"

for pair in "mod_exeweb:$EXEWEB_SRC" "mod_exescorm:$EXESCORM_SRC"; do
  name="${pair%%:*}"; dir="${pair#*:}"
  [ -f "$dir/version.php" ] || { echo "FATAL: $name source not found at '$dir' (set ${name#mod_}_SRC). Expected a checkout with version.php."; exit 2; }
done
# Ensure the PoC packages exist (built by poc/build.sh).
for z in evil_web.zip evil-exescorm.zip; do
  [ -f "$POC/$z" ] || { echo "FATAL: poc/$z missing — run 'bash poc/build.sh' first."; exit 2; }
done

DC() { MOODLE_VERSION="$TAG" docker compose "$@"; }
docker compose down -v --remove-orphans >/dev/null 2>&1 || true
holder80="$(docker ps --format '{{.Names}} {{.Ports}}' | awk '/0\.0\.0\.0:80->/{print $1}' | grep -v '^lab-' | head -1)"
[ -n "$holder80" ] && { echo "FATAL: host port 80 held by '$holder80'. docker stop $holder80"; exit 3; }

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

# Install both plugins into <dirroot>/mod/<name>, then upgrade. The image's dirroot
# differs by version (/var/www/html on 4.5/5.0, /var/www/html/public on 5.2+), so we
# ask Moodle ($CFG->dirroot) instead of guessing.
DIRROOT="$(DC exec -T moodle sh -lc 'php -r "define(\"CLI_SCRIPT\",true); require(\"/var/www/html/config.php\"); echo \$CFG->dirroot;"' 2>/dev/null | tr -d '\r')"
[ -n "$DIRROOT" ] || { echo "FATAL: could not resolve dirroot"; exit 6; }
echo "dirroot=$DIRROOT — installing mod_exeweb + mod_exescorm"
install_one() { # <name> <srcdir>
  local name="$1" src="$2"
  ( cd "$src" && tar -ch --exclude=.git . ) | DC exec -T moodle sh -lc "rm -rf '$DIRROOT/mod/$name' && mkdir -p '$DIRROOT/mod/$name' && tar -x -C '$DIRROOT/mod/$name'" \
    || { echo "FATAL: copy $name failed"; exit 6; }
}
install_one exeweb "$EXEWEB_SRC"
install_one exescorm "$EXESCORM_SRC"
DC exec -T moodle sh -lc 'php /var/www/html/admin/cli/upgrade.php --non-interactive --allow-unstable' >/dev/null 2>&1 \
  || { echo "FATAL: upgrade failed"; exit 6; }
RELEASE="$(DC exec -T moodle sh -lc 'php -r '\''define("CLI_SCRIPT",true); @require("/var/www/html/config.php"); global $CFG; echo isset($CFG->release)?$CFG->release:"";'\''' 2>/dev/null | tr -d '\r' | head -1)"
WEBREF="$(cd "$EXEWEB_SRC" && git rev-parse --short HEAD 2>/dev/null || echo '?')"
SCOREF="$(cd "$EXESCORM_SRC" && git rev-parse --short HEAD 2>/dev/null || echo '?')"
echo "release: ${RELEASE:-?}  (mod_exeweb $WEBREF, mod_exescorm $SCOREF)"

MOODLE_BASE="$BASE" EXE_USER="$ADMIN_USER" EXE_PASS="$ADMIN_PASS" OUT="$OUTJSON" \
  node "$EVID/exeweb-exescorm-test.cjs" || echo "(exeweb-exescorm-test nonzero)"

# Refresh provenance with the resolved release + plugin refs.
RELEASE="$RELEASE" TAG="$TAG" WEBREF="$WEBREF" SCOREF="$SCOREF" python3 - "$OUTJSON" <<'PY'
import json, os, sys
p = sys.argv[1]
d = json.load(open(p))
d["_meta"] = {
  "descripcion": "Sondeo de aislamiento EN EJECUCION de mod_exeweb y mod_exescorm (plugins estables, mismo origen). Sube evil_web.zip (export web eXeLearning con content.xml + probe) y evil-exescorm.zip (SCORM + content.xml), lanza el SCO y lee window.__EXE_POC_RESULT desde DENTRO del iframe del paquete. Solo booleanos; sesskey REDACTADO. Lab desechable, accion autorizada y reversible (curso de usar y tirar).",
  "harness": "lab/run-exeweb-check.sh + evidencias/exeweb-exescorm-test.cjs + poc/evil_web.zip + poc/evil-exescorm.zip",
  "moodle": "erseco/alpine-moodle:%s (release %s)" % (os.environ.get("TAG"), os.environ.get("RELEASE") or "?"),
  "plugin_commits": {"mod_exeweb": os.environ.get("WEBREF"), "mod_exescorm": os.environ.get("SCOREF")},
  "engine": "chromium (Playwright)",
}
json.dump(d, open(p, "w"), indent=2, ensure_ascii=False); open(p, "a").write("\n")
ews = (d.get("results", {}).get("exeweb", {}).get("probe", {}) or {}).get("inside")
scs = (d.get("results", {}).get("exescorm", {}).get("probe", {}) or {}).get("inside")
print("exeweb inside:", bool(ews), "| exescorm inside:", bool(scs),
      "| canCallScormApi:", (scs or {}).get("canCallScormApi"))
PY

DC down -v >/dev/null 2>&1 || true
echo "Done -> $OUTJSON"
