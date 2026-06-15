#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Install the staged plugin (/opt/mod_exelearning, mounted by docker-compose) into
# the RUNNING Moodle container, wherever Moodle says its code lives. The image's
# dirroot differs by version (/var/www/html on 4.5/5.0, /var/www/html/public on
# 5.2+/dev), so we ask Moodle ($CFG->dirroot) instead of guessing, copy the plugin
# into <dirroot>/mod/exelearning, run the upgrade, and seed the demo course.
#
# The container must already be up and serving. MOODLE_VERSION (for compose image
# resolution) is read from the environment / .env.
set -euo pipefail
cd "$(dirname "$0")"

docker compose exec -T moodle sh -lc '
  set -e
  DIRROOT=$(php -r "define(\"CLI_SCRIPT\",true); require(\"/var/www/html/config.php\"); echo \$CFG->dirroot;")
  MOD="$DIRROOT/mod/exelearning"
  echo "dirroot=$DIRROOT -> installing plugin into $MOD"
  rm -rf "$MOD"
  cp -a /opt/mod_exelearning "$MOD"
  # admin/cli lives at the repo root on every layout (not under public/).
  # --allow-unstable: the dev/main image is a release candidate; no-op on stable.
  php /var/www/html/admin/cli/upgrade.php --non-interactive --allow-unstable
  php "$MOD/scripts/setup_demo.php" || echo "setup_demo.php non-zero exit (ignoring)"
'
