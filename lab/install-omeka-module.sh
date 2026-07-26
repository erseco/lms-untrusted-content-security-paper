#!/usr/bin/env bash
# Instala omeka-s-exelearning en el Omeka S del laboratorio.
# Igual que install-plugin.sh: el checkout se monta fuera del webroot y se copia
# dentro, para no pisar la preparación de la imagen. Ningún módulo eXeLearning
# para Omeka S existe todavía en público, así que lab/omeka-s-exelearning/ suele
# estar ausente (el bind mount de docker-compose lo deja vacío) y este script se
# limita a avisarlo: el vector medible en ese caso es la importación CSV /
# subida de ficheros normal de Omeka, que measure.js ya cubre sin necesitar un
# módulo instalado.
#
# erseco/alpine-omeka-s corre como nobody:nobody (no www-data como Moodle/WP).
set -euo pipefail

CID="$(docker compose -f "$(dirname "$0")/docker-compose.yml" ps -q omeka)"
[ -n "$CID" ] || { echo "ERROR: el servicio omeka no está levantado" >&2; exit 1; }

if docker exec "$CID" sh -c '[ -n "$(ls -A /opt/omeka-s-exelearning 2>/dev/null)" ]'; then
  docker exec "$CID" sh -c '
    set -e
    cp -R /opt/omeka-s-exelearning /var/www/html/modules/Exelearning
    chown -R nobody:nobody /var/www/html/modules/Exelearning
  '
  echo "Módulo copiado. Actívalo en http://localhost:8081/admin/module"
else
  echo "Sin checkout en lab/omeka-s-exelearning: no hay módulo eXeLearning público" \
       "para Omeka S todavía. Se medirá vía importación CSV / subida de ficheros."
fi
