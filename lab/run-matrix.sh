#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Cross-version isolation-probe matrix. For every Moodle tag in versions.txt it
# boots a disposable instance, toggles mod_exelearning between secure and legacy
# iframe modes, and runs the EXISTING read-only probe (evidencias/exe-live-isolation-test.cjs)
# from INSIDE the package iframe. Aggregates real captures into
# evidencias/resultados-matriz-versiones.json.
#
# Integrity: every row comes from a live run. A tag that does not boot, or a
# mode whose probe fails, is recorded under "skipped" with a reason — never
# back-filled with invented values.
#
# Usage: bash run-matrix.sh            # whole matrix from versions.txt
#        VERSIONS="v5.0.8 main" bash run-matrix.sh   # ad-hoc subset
set -uo pipefail
cd "$(dirname "$0")"
LAB="$PWD"
EVID="$(cd ../evidencias && pwd)"
OUTJSON="$EVID/resultados-matriz-versiones.json"

# --- config (.env) ---
# alpine-moodle only behaves on http://localhost:80, so the lab is fixed to :80.
[ -f .env ] || cp .env.dist .env
set -a; . ./.env; set +a
BASE="http://localhost"
USER="${TEST_USER_USERNAME:-user}"
PASS="${TEST_USER_PASSWORD:-1234}"
PLUGIN_REF="${PLUGIN_REF:-73fe6ff}"

DC() { MOODLE_VERSION="$1" docker compose "${@:2}"; }

# :80 must be free. Clear any prior lab instance first, then refuse to stomp on a
# FOREIGN container (it belongs to other work); the operator frees it, as agreed.
docker compose down -v --remove-orphans >/dev/null 2>&1 || true
holder80="$(docker ps --format '{{.Names}} {{.Ports}}' | awk '/0\.0\.0\.0:80->/{print $1}' | grep -v '^lab-' | head -1)"
if [ -n "$holder80" ]; then
  echo "FATAL: host port 80 is held by container '$holder80'."
  echo "Free it first (then re-run):  docker stop $holder80"
  exit 3
fi
TODAY="$(date +%F)"
WORK="$(mktemp -d)"; : > "$WORK/skips.tsv"
trap 'rm -rf "$WORK"' EXIT

# --- versions (CLI override via $VERSIONS) ---
if [ -n "${VERSIONS:-}" ]; then
  TAGLIST="$VERSIONS"
else
  TAGLIST="$(sed 's/#.*//' versions.txt | tr -s ' \t' ' ' | tr '\n' ' ')"
fi
# bash 3.2 (macOS) has no mapfile; word-split the whitespace-separated list.
read -r -a TAGS <<< "$TAGLIST"
[ "${#TAGS[@]}" -gt 0 ] || { echo "No versions to run."; exit 1; }
echo "Matrix tags: ${TAGS[*]}"

# --- deps: pinned plugin + playwright ---
bash fetch-plugin.sh
( cd "$EVID" && { [ -d node_modules/playwright ] || npm install --no-audit --no-fund; } \
  && npx playwright install chromium ) || { echo "FATAL: playwright setup failed"; exit 2; }

http_code() { curl -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || echo 000; }

# Install is complete once config.php exists in the container. Polling for it via
# exec is independent of the web server (which can answer mid-install on a cold boot).
wait_config() { # version timeout_s
  local deadline=$(( $(date +%s) + ${2:-900} ))
  until DC "$1" exec -T moodle test -f /var/www/html/config.php 2>/dev/null; do
    [ "$(date +%s)" -ge "$deadline" ] && return 1
    sleep 5
  done
}

wait_200() { # url timeout_s
  local deadline=$(( $(date +%s) + ${2:-300} ))
  while [ "$(http_code "$1")" != 200 ]; do
    [ "$(date +%s)" -ge "$deadline" ] && return 1
    sleep 5
  done
}

get_release() { # echoes $CFG->release or empty
  DC "$1" exec -T moodle sh -lc \
    'php -r '\''define("CLI_SCRIPT",true); @require("/var/www/html/config.php"); global $CFG; echo isset($CFG->release)?$CFG->release:"";'\''' \
    2>/dev/null | tr -d '\r' | head -1
}

skip() { printf '%s\t%s\n' "$1" "$2" >> "$WORK/skips.tsv"; echo "SKIP $1: $2"; }

for V in "${TAGS[@]}"; do
  echo "==================== Moodle $V ===================="
  DC "$V" down -v >/dev/null 2>&1 || true
  if ! DC "$V" up -d; then skip "$V" "docker compose up failed (tag pull/start)"; continue; fi

  echo "Waiting for install to finish (config.php), then web 200..."
  if ! wait_config "$V" 900; then
    skip "$V" "config.php never appeared within 900s (install failed?)"; DC "$V" down -v >/dev/null 2>&1 || true; continue
  fi
  if ! wait_200 "$BASE/login/index.php" 300; then
    skip "$V" "login did not return 200 within 300s"; DC "$V" down -v >/dev/null 2>&1 || true; continue
  fi

  # Install the plugin into Moodle's real dirroot, then upgrade + seed the demo.
  if ! MOODLE_VERSION="$V" bash install-plugin.sh; then
    skip "$V" "plugin install/upgrade failed"; DC "$V" down -v >/dev/null 2>&1 || true; continue
  fi
  seeded="$(DC "$V" exec -T moodle sh -lc 'php -r "define(\"CLI_SCRIPT\",true); require(\"/var/www/html/config.php\"); global \$DB; echo (int)\$DB->count_records(\"exelearning\");"' 2>/dev/null | tr -dc '0-9')"
  if [ -z "$seeded" ] || [ "$seeded" -lt 1 ]; then
    skip "$V" "demo activity not seeded (exelearning records=$seeded)"; DC "$V" down -v >/dev/null 2>&1 || true; continue
  fi
  RELEASE="$(get_release "$V")"; echo "Detected release: ${RELEASE:-<unknown>} (exe activities: $seeded)"

  for MODE in legacy secure; do
    DC "$V" exec -T moodle php /var/www/html/admin/cli/cfg.php --component=mod_exelearning --name=iframemode --set="$MODE" >/dev/null 2>&1 \
      || echo "  (warning: could not set iframemode=$MODE via cfg.php)"
    DC "$V" exec -T moodle php /var/www/html/admin/cli/purge_caches.php >/dev/null 2>&1 || true

    ok=0
    for attempt in 1 2 3 4 5 6; do
      if MOODLE_BASE="$BASE" EXE_USER="$USER" EXE_PASS="$PASS" EXPECT_MODE="$MODE" \
         OUT="$WORK/probe.json" node "$EVID/exe-live-isolation-test.cjs" >/dev/null 2>&1; then ok=1; break; fi
      echo "  probe $V/$MODE attempt $attempt failed; retrying..."; sleep 15
    done

    if [ "$ok" = 1 ]; then
      RELEASE="$RELEASE" TAG="$V" MODE="$MODE" python3 - "$WORK/probe.json" "$WORK/entry-$V-$MODE.json" <<'PY'
import json, os, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
entry = {"requestedTag": os.environ["TAG"], "release": os.environ.get("RELEASE") or None, "mode": os.environ["MODE"]}
for k in ("sandboxAttr", "iframeSrc", "secureBridgePresent", "insideIframe", "responseHeaders", "loggedIn", "activityUrl"):
    if k in d: entry[k] = d[k]
json.dump(entry, open(dst, "w"), indent=2)
print("  captured", os.environ["TAG"], os.environ["MODE"])
PY
    else
      skip "$V" "$MODE probe failed after retries"
    fi
  done
  DC "$V" down -v >/dev/null 2>&1 || true
done

# --- assemble aggregate (real captures only) ---
PLUGIN_REF="$PLUGIN_REF" TODAY="$TODAY" python3 - "$WORK" "$OUTJSON" <<'PY'
import glob, json, os, sys
work, out = sys.argv[1], sys.argv[2]
matrix = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(work, "entry-*.json")))]
skipped = []
sk = os.path.join(work, "skips.tsv")
if os.path.exists(sk):
    for line in open(sk):
        line = line.rstrip("\n")
        if not line: continue
        tag, _, reason = line.partition("\t")
        skipped.append({"tag": tag, "reason": reason})
doc = {
  "_meta": {
    "descripcion": "Matriz de aislamiento transversal: la sonda de poc/probe.js medida desde dentro del iframe del paquete en varias versiones de Moodle, en modo secure y legacy.",
    "engine": "chromium (Playwright)",
    "harness": "lab/run-matrix.sh + evidencias/exe-live-isolation-test.cjs",
    "plugin": "mod_exelearning",
    "commit": os.environ["PLUGIN_REF"],
    "image": "erseco/alpine-moodle",
    "fecha": os.environ["TODAY"],
    "nota": "Capturas vivas reales (lab desechable POC-SAFE). Las versiones/modos que no arrancaron o cuya sonda falló se listan en 'skipped', nunca con valores inventados.",
  },
  "matrix": matrix,
  "skipped": skipped,
}
json.dump(doc, open(out, "w"), indent=2, ensure_ascii=False)
open(out, "a").write("\n")
print(f"\nWrote {out}: {len(matrix)} captured rows, {len(skipped)} skipped.")
PY
echo "Done."
