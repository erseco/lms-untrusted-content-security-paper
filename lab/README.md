# `lab/` — Laboratorio multi-anfitrión para la sonda de aislamiento

Laboratorio **desechable** (`POC-SAFE`) que levanta Moodle en varias versiones con el
plugin `mod_exelearning`, y además Omeka S y Nextcloud, y mide, *desde dentro* del
iframe del paquete, qué puede alcanzar el contenido educativo en **modo secure**
(origen opaco) frente a **modo legacy** (mismo origen). Reutiliza la imagen
`erseco/alpine-moodle` y la sonda ya existente (`../evidencias/exe-live-isolation-test.cjs`,
basada en `../poc/probe/`, compilada en `../poc/probe/dist/probe.bundle.js`). La
sonda en sí es read-only: **no exfiltra, no hace `POST`, no lee valores reales de
cookie/sesskey** (solo reporta booleanos y nombres de error).

**Aviso importante:** este laboratorio es exclusivamente para pruebas locales,
desechables y autorizadas. No lo apuntes nunca a un Moodle/Omeka S/Nextcloud real
ni a nada que le importe a alguien. Las **demos del panel sí escriben de verdad**
(crean cursos/ítems, suben ficheros, cambian el nombre visible del usuario, etc.)
contra estas instancias efímeras; cada acción queda registrada en un diario de
reversión (`journal.js`) para poder deshacerla, pero el objetivo del contenedor es
precisamente absorber esas escrituras — bórralo con `make clean` / `docker compose
down -v` cuando termines.

## Requisitos
- Docker (con `docker compose`).
- Node.js + `npm` (Playwright/Chromium se instala solo con `make deps`/`make matrix`).
- Acceso de red la primera vez (para `git`/`docker pull`).

## Uso rápido

```bash
cd lab
cp .env.dist .env          # opcional; make lo hace solo

# Matriz completa (4.5 LTS, 5.0 y dev/main), secure + legacy:
make matrix                # -> ../evidencias/resultados-matriz-versiones.json

# O una sola instancia interactiva (el :80 debe estar libre):
make upd                   # levanta MOODLE_VERSION de .env (def. v5.0.8) en :80 (Moodle vanilla)
make seed                  # instala el plugin en el dirroot real + siembra el curso demo
make probe MODE=secure     # sonda contra la instancia viva
make probe MODE=legacy
make clean                 # baja y borra volúmenes
```

`make matrix` itera `versions.txt`; subconjunto ad-hoc: `VERSIONS="v5.0.8 main" bash run-matrix.sh`.

## Puerto 80
alpine-moodle solo funciona bien en `http://localhost:80`, así que el lab usa el `:80`.
Si otro contenedor lo ocupa, libéralo antes (`docker stop <otro-moodle>`); `run-matrix.sh`
aborta con un mensaje claro si el `:80` está tomado por un contenedor ajeno.

## Omeka S y Nextcloud

Los tres anfitriones comparten `docker-compose.yml`. Puertos:

| Anfitrión | Puerto        | Motivo |
|-----------|---------------|--------|
| Moodle    | `:80`         | `alpine-moodle` solo funciona bien ahí (ver arriba). |
| Omeka S   | `:8081`       | libre. |
| Nextcloud | `:8082`       | libre. |

```bash
cd lab
cp .env.dist .env               # si no lo hiciste ya
docker compose up -d            # levanta moodle, omeka, nextcloud y db (una sola vez)

curl -sf -o /dev/null -w "moodle %{http_code}\n"    http://localhost/
curl -sf -o /dev/null -w "omeka %{http_code}\n"     http://localhost:8081/
curl -sf -o /dev/null -w "nextcloud %{http_code}\n" http://localhost:8082/

./install-omeka-module.sh       # copia el módulo eXeLearning si hay checkout; si no, avisa y no hace nada
./install-nextcloud-app.sh      # ídem para la app de Nextcloud
```

Credenciales de administración en ambos: `TEST_USER_USERNAME` / `TEST_USER_PASSWORD`
de `.env` (por defecto `user` / `1234`, igual que Moodle).

### Imagen de Omeka S
No existe imagen oficial de Omeka S. Se comprobó (2026-07-25) que
`erseco/alpine-omeka-s:latest` **sí** se puede descargar (`docker pull` correcto,
17 capas), así que el laboratorio usa esa imagen directamente — **no** hizo falta
el fallback de construir desde cero. Dos detalles de esa imagen que no eran obvios
desde fuera y que `docker-compose.yml` ya tiene en cuenta:
- nginx escucha en el puerto **8080** dentro del contenedor, no en el 80 (de ahí
  `8081:8080` y no `8081:80`).
- El webroot corre como usuario **`nobody:nobody`**, no `www-data` (Moodle/WordPress
  sí usan `www-data`); `install-omeka-module.sh` usa `chown nobody:nobody`.
- Su script de arranque solo ejecuta el instalador de Omeka S
  (`install_cli.php`) si **las cuatro** variables `OMEKA_ADMIN_EMAIL`,
  `OMEKA_ADMIN_NAME`, `OMEKA_ADMIN_PASSWORD` y `OMEKA_SITE_TITLE` están
  presentes; sin `OMEKA_ADMIN_NAME` el sitio arranca en el asistente de
  instalación en vez de con un admin ya sembrado.

#### Vía alternativa (solo si `erseco/alpine-omeka-s` deja de estar disponible)
Construir desde `php:8.3-apache` con el zip de la release oficial:

```dockerfile
# lab/omeka.Dockerfile
FROM php:8.3-apache
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip curl libzip-dev libpng-dev \
 && docker-php-ext-install pdo_mysql zip gd \
 && a2enmod rewrite \
 && rm -rf /var/lib/apt/lists/*
ARG OMEKA_VERSION=4.1.0
RUN curl -fsSL -o /tmp/omeka.zip \
      "https://github.com/omeka/omeka-s/releases/download/v${OMEKA_VERSION}/omeka-s-${OMEKA_VERSION}.zip" \
 && unzip -q /tmp/omeka.zip -d /var/www \
 && rm -rf /var/www/html && mv /var/www/omeka-s /var/www/html \
 && chown -R www-data:www-data /var/www/html
```

```bash
docker build -f lab/omeka.Dockerfile -t exe-lab/omeka-s:4.1.0 lab/
echo 'OMEKA_IMAGE=exe-lab/omeka-s:4.1.0' >> lab/.env
```

Esta vía corre como `www-data` (imagen Debian estándar), no `nobody`, y escucha en
el puerto 80 de Apache — si algún día se usa, revisar `install-omeka-module.sh` y
el mapeo de puertos en `docker-compose.yml` en consecuencia.

### Base de datos de Omeka S
Omeka S usa el mismo servidor MariaDB que Moodle (servicio `db`), en una base
`omeka` separada creada por `lab/db-init/01-omeka.sql` la primera vez que arranca
el contenedor `db` (con datadir vacío). Si Omeka S responde `500`, lo más probable
es que falte esa base: `docker compose logs db | grep omeka`.

### Integración eXeLearning aún no publicada
No existe todavía un módulo eXeLearning para Omeka S ni una app para Nextcloud en
público. `lab/omeka-s-exelearning/` y `lab/nextcloud-exelearning/` son puntos de
checkout opcionales (como `lab/mod_exelearning/`, generado por `fetch-plugin.sh`):
si no existen, los instaladores lo detectan y no instalan nada — el vector medible
en ese caso es la importación CSV / subida de ficheros normal de cada anfitrión,
que la sonda mide igualmente.

## Qué hace `make matrix`
Por cada tag de [`versions.txt`](versions.txt):
1. `docker compose up -d` arranca **Moodle vanilla** y espera a que sirva (200 en `/login`).
2. `install-plugin.sh` copia el plugin (desde el *stage* `/opt/mod_exelearning`) al
   **`$CFG->dirroot/mod/exelearning` real** —que cambia según la versión: `/var/www/html`
   en 4.5/5.0, `/var/www/html/public` en 5.2+/dev—, ejecuta `admin/cli/upgrade.php`
   (`--allow-unstable` para la rama dev) y siembra el curso demo (`scripts/setup_demo.php`).
3. Detecta la *release* real (`$CFG->release`) y verifica que el curso quedó sembrado.
4. Para `legacy` y `secure`: fija `mod_exelearning/iframemode` vía `admin/cli/cfg.php`,
   purga cachés y corre la sonda dentro del iframe.
5. `docker compose down -v` antes de la siguiente versión.

## Componentes fijados
- Plugin: `mod_exelearning` **`73fe6ff`** (rama `feature/secure-iframe-scorm-bridge`,
  la que añade el ajuste `iframemode = secure|legacy`). Lo materializa
  `fetch-plugin.sh` en `lab/mod_exelearning/` (ignorado por git). Sobrescribe el
  origen con `PLUGIN_SRC=/ruta/local` (sin red) o `PLUGIN_REF=<sha>`.
- Imagen Moodle: `erseco/alpine-moodle:<tag>` (tags resueltos 2026-06-15).
- Imagen Omeka S: `erseco/alpine-omeka-s:latest` (comprobada 2026-07-25; ver
  "Omeka S y Nextcloud" más abajo para la vía alternativa).
- Imagen Nextcloud: `nextcloud:apache` (oficial).

## Integridad de la evidencia
`resultados-matriz-versiones.json` contiene **solo capturas reales**. Las versiones
que no arrancan, o los modos cuya sonda falla, se listan en `skipped` con su motivo;
**nunca** se rellenan con valores inventados.

## Limpieza
`make clean` (o `docker compose down -v`) elimina contenedores y volúmenes,
incluidos los de Omeka S (`omekafiles`) y Nextcloud (`ncdata`). La carpeta
`lab/mod_exelearning/` se puede borrar y regenerar con `make plugin`.
