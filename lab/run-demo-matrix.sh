#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Cross-version SAME-ORIGIN FOOTHOLD matrix. For every Moodle tag in versions.txt it
# boots a disposable instance, seeds the demo course/users, and exercises the PoC
# demo actions (authorised + reversible, lab-only) with the EXISTING harnesses:
#   - evidencias/demo-actions-test.cjs  (admin: own name+photo, create course, forum)
#   - evidencias/auto-page-test.cjs     (non-admin evil-page-auto.html: own name+photo)
# It records the outcome PLUS a DB read-back (firstname + picture) so the persistence
# of each change is verified, then aggregates into
# evidencias/resultados-demo-multiversion.json.
#
# Integrity: every row is a live run; a tag that does not boot/seed is recorded in
# "skipped" with a reason — never back-filled.
#
# Usage: bash run-demo-matrix.sh        # all versions from versions.txt
#        VERSIONS="v4.5.12 v5.2.1" bash run-demo-matrix.sh
set -uo pipefail
cd "$(dirname "$0")"
EVID="$(cd ../evidencias && pwd)"
OUTJSON="$EVID/resultados-demo-multiversion.json"

[ -f .env ] || cp .env.dist .env
set -a; . ./.env; set +a
BASE="http://localhost"
ADMIN_USER="${TEST_USER_USERNAME:-user}"
ADMIN_PASS="${TEST_USER_PASSWORD:-1234}"
DEMO_USER="${DEMO_USER:-alumno2}"      # non-admin seeded by setup_demo
DEMO_PASS="${DEMO_PASS:-Demo!2026}"
PLUGIN_REF="${PLUGIN_REF:-73fe6ff}"

DC() { MOODLE_VERSION="$1" docker compose "${@:2}"; }
docker compose down -v --remove-orphans >/dev/null 2>&1 || true
holder80="$(docker ps --format '{{.Names}} {{.Ports}}' | awk '/0\.0\.0\.0:80->/{print $1}' | grep -v '^lab-' | head -1)"
if [ -n "$holder80" ]; then echo "FATAL: host port 80 held by '$holder80'. docker stop $holder80"; exit 3; fi
TODAY="$(date +%F)"; WORK="$(mktemp -d)"; : > "$WORK/skips.tsv"; trap 'rm -rf "$WORK"' EXIT

if [ -n "${VERSIONS:-}" ]; then TAGLIST="$VERSIONS"; else TAGLIST="$(sed 's/#.*//' versions.txt | tr -s ' \t' ' ' | tr '\n' ' ')"; fi
read -r -a TAGS <<< "$TAGLIST"
[ "${#TAGS[@]}" -gt 0 ] || { echo "No versions."; exit 1; }
echo "Demo matrix tags: ${TAGS[*]}"

bash fetch-plugin.sh
( cd "$EVID" && { [ -d node_modules/playwright ] || npm install --no-audit --no-fund; } && npx playwright install chromium ) \
  || { echo "FATAL: playwright setup failed"; exit 2; }

http_code() { curl -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || echo 000; }
wait_config() { local d=$(( $(date +%s) + ${2:-900} )); until DC "$1" exec -T moodle test -f /var/www/html/config.php 2>/dev/null; do [ "$(date +%s)" -ge "$d" ] && return 1; sleep 5; done; }
wait_200() { local d=$(( $(date +%s) + ${2:-300} )); while [ "$(http_code "$1")" != 200 ]; do [ "$(date +%s)" -ge "$d" ] && return 1; sleep 5; done; }
get_release() { DC "$1" exec -T moodle sh -lc 'php -r '\''define("CLI_SCRIPT",true); @require("/var/www/html/config.php"); global $CFG; echo isset($CFG->release)?$CFG->release:"";'\''' 2>/dev/null | tr -d '\r' | head -1; }
db_field() { DC "$1" exec -T moodle php -r "define('CLI_SCRIPT',true); require('/var/www/html/config.php'); global \$DB; \$u=\$DB->get_record('user',['username'=>'$2']); echo \$u ? \$u->$3 : '';" 2>/dev/null | tr -d '\r' | head -1; }
skip() { printf '%s\t%s\n' "$1" "$2" >> "$WORK/skips.tsv"; echo "SKIP $1: $2"; }

for V in "${TAGS[@]}"; do
  echo "==================== Moodle $V ===================="
  DC "$V" down -v >/dev/null 2>&1 || true
  if ! DC "$V" up -d; then skip "$V" "docker compose up failed"; continue; fi
  if ! wait_config "$V" 900; then skip "$V" "config.php never appeared"; DC "$V" down -v >/dev/null 2>&1 || true; continue; fi
  if ! wait_200 "$BASE/login/index.php" 300; then skip "$V" "login not 200"; DC "$V" down -v >/dev/null 2>&1 || true; continue; fi
  if ! MOODLE_VERSION="$V" bash install-plugin.sh >/dev/null 2>&1; then skip "$V" "plugin/seed failed"; DC "$V" down -v >/dev/null 2>&1 || true; continue; fi
  RELEASE="$(get_release "$V")"; echo "release: ${RELEASE:-?}"

  # (1) ADMIN foothold: own name+photo, create course + label + forum.
  MOODLE_BASE="$BASE" EXE_USER="$ADMIN_USER" EXE_PASS="$ADMIN_PASS" OUT="$WORK/da.json" \
    node "$EVID/demo-actions-test.cjs" >/dev/null 2>&1 || echo "  (demo-actions-test nonzero)"
  ADMIN_FN="$(db_field "$V" "$ADMIN_USER" firstname)"; ADMIN_PIC="$(db_field "$V" "$ADMIN_USER" picture)"

  # (2) NON-ADMIN evil-page-auto.html: own name+photo (admins get a guardrail).
  MOODLE_BASE="$BASE" AUTO_USER="$DEMO_USER" AUTO_PASS="$DEMO_PASS" OUT="$WORK/ap.json" \
    node "$EVID/auto-page-test.cjs" >/dev/null 2>&1 || echo "  (auto-page-test nonzero)"
  DEMO_FN="$(db_field "$V" "$DEMO_USER" firstname)"; DEMO_PIC="$(db_field "$V" "$DEMO_USER" picture)"

  TAG="$V" RELEASE="$RELEASE" ADMIN_FN="$ADMIN_FN" ADMIN_PIC="$ADMIN_PIC" DEMO_USER="$DEMO_USER" DEMO_FN="$DEMO_FN" DEMO_PIC="$DEMO_PIC" \
  python3 - "$WORK/da.json" "$WORK/ap.json" "$WORK/entry-$V.json" <<'PY'
import json, os, sys
da = json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else {}
ap = json.load(open(sys.argv[2])) if os.path.exists(sys.argv[2]) else {}
ou = da.get('ownUser', {}); cc = da.get('createCourse', {})
def truthy_pic(v):
    try: return int(v) > 0
    except Exception: return False
entry = {
  "requestedTag": os.environ["TAG"], "release": os.environ.get("RELEASE") or None,
  "admin_foothold": {
    "account": "admin",
    "renamed_via_webservice": ou.get("renamed"),
    "renamed_via_form": ou.get("renamedViaForm"),
    "photo_changed": ou.get("photoChanged"),
    "firstname_db": os.environ.get("ADMIN_FN"),
    "picture_db": os.environ.get("ADMIN_PIC"),
    "name_persisted": os.environ.get("ADMIN_FN") == "PWNED ;)",
    "photo_persisted": truthy_pic(os.environ.get("ADMIN_PIC")),
    "course_created": cc.get("created"), "label_added": cc.get("activityAdded"),
    "forum_messages": cc.get("forumMessages"),
  },
  "nonadmin_auto_page": {
    "account": os.environ.get("DEMO_USER"),
    "is_high_privilege": ap.get("isHighPrivilege"),
    "guardrail_shown": ap.get("guardrailShown"),
    "page_flipped": ap.get("flipped"),
    "firstname_db": os.environ.get("DEMO_FN"),
    "picture_db": os.environ.get("DEMO_PIC"),
    "name_persisted": os.environ.get("DEMO_FN") == "PWNED ;)",
    "photo_persisted": truthy_pic(os.environ.get("DEMO_PIC")),
  },
}
json.dump(entry, open(sys.argv[3], "w"), indent=2, ensure_ascii=False)
print("  captured %s: admin name/photo=%s/%s | non-admin name/photo=%s/%s" % (
  os.environ["TAG"], entry["admin_foothold"]["name_persisted"], entry["admin_foothold"]["photo_persisted"],
  entry["nonadmin_auto_page"]["name_persisted"], entry["nonadmin_auto_page"]["photo_persisted"]))
PY
  DC "$V" down -v >/dev/null 2>&1 || true
done

PLUGIN_REF="$PLUGIN_REF" TODAY="$TODAY" DEMO_USER="$DEMO_USER" python3 - "$WORK" "$OUTJSON" <<'PY'
import glob, json, os, sys
work, out = sys.argv[1], sys.argv[2]
matrix = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(work, "entry-*.json")))]
skipped = []
sk = os.path.join(work, "skips.tsv")
if os.path.exists(sk):
    for line in open(sk):
        line = line.rstrip("\n")
        if line:
            tag, _, reason = line.partition("\t"); skipped.append({"tag": tag, "reason": reason})
doc = {
  "_meta": {
    "descripcion": "Foothold same-origin verificado en varias versiones de Moodle: acciones de demostracion AUTORIZADAS y REVERSIBLES (cambio del propio nombre+foto, creacion de curso+etiqueta, inundacion de foro) ejecutadas con la sesion del propio usuario. Incluye lectura de BD (firstname + picture) que confirma la PERSISTENCIA.",
    "harness": "lab/run-demo-matrix.sh + evidencias/demo-actions-test.cjs (admin) + evidencias/auto-page-test.cjs (no-admin, evil-page-auto.html)",
    "plugin_commit": os.environ["PLUGIN_REF"],
    "fecha": os.environ["TODAY"],
    "cuenta_no_admin": os.environ["DEMO_USER"],
    "nota": "Lab desechable POC-SAFE; cambios reversibles. picture>0 = foto de perfil establecida. name_persisted = firstname == 'PWNED ;)'. Las versiones que no arrancaron/sembraron se listan en 'skipped'.",
  },
  "matrix": matrix,
  "skipped": skipped,
}
json.dump(doc, open(out, "w"), indent=2, ensure_ascii=False); open(out, "a").write("\n")
print("\nWrote %s: %d versions, %d skipped." % (out, len(matrix), len(skipped)))
PY
echo "Done."
