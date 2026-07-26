#!/usr/bin/env bash
# Instala y habilita la app de eXeLearning en el Nextcloud del laboratorio.
# Ninguna integración eXeLearning para Nextcloud existe todavía en público, así
# que lab/nextcloud-exelearning/ suele estar ausente: en ese caso el artefacto se
# mide igual sirviendo el HTML exportado desde Files o desde un enlace público
# (ese vector también cuenta, y measure.js no necesita una app instalada).
set -euo pipefail

CID="$(docker compose -f "$(dirname "$0")/docker-compose.yml" ps -q nextcloud)"
[ -n "$CID" ] || { echo "ERROR: el servicio nextcloud no está levantado" >&2; exit 1; }

if [ -n "$(ls -A "$(dirname "$0")/nextcloud-exelearning" 2>/dev/null)" ]; then
  docker exec "$CID" sh -c '
    set -e
    cp -R /opt/nextcloud-exelearning /var/www/html/custom_apps/exelearning
    chown -R www-data:www-data /var/www/html/custom_apps/exelearning
  '
  docker exec -u www-data "$CID" php occ app:enable exelearning
  echo "App habilitada."
else
  echo "Sin checkout en lab/nextcloud-exelearning: se medirá la ruta de Files / enlace público."
fi

docker exec -u www-data "$CID" php occ config:system:set skeletondirectory --value=""
