# `lab/` — Laboratorio multi-versión para la sonda de aislamiento

Laboratorio **desechable** (`POC-SAFE`) que levanta Moodle en varias versiones con el
plugin `mod_exelearning` y mide, *desde dentro* del iframe del paquete, qué puede
alcanzar el contenido educativo en **modo secure** (origen opaco) frente a **modo
legacy** (mismo origen). Reutiliza la imagen `erseco/alpine-moodle` y la sonda
read-only ya existente (`../evidencias/exe-live-isolation-test.cjs`, basada en
`../poc/probe.js`). **No exfiltra, no hace `POST`, no lee valores reales de
cookie/sesskey** (la sonda solo reporta booleanos y nombres de error).

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

## Integridad de la evidencia
`resultados-matriz-versiones.json` contiene **solo capturas reales**. Las versiones
que no arrancan, o los modos cuya sonda falla, se listan en `skipped` con su motivo;
**nunca** se rellenan con valores inventados.

## Limpieza
`make clean` (o `docker compose down -v`) elimina contenedores y volúmenes. La
carpeta `lab/mod_exelearning/` se puede borrar y regenerar con `make plugin`.
