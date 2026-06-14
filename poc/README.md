# PoC seguras — sonda de aislamiento de contenido educativo

PoC **didácticas** que **detectan** qué capacidades tiene el contenido embebido en un LMS/CMS.
La **sonda de 15 comprobaciones** (`probe.js`) es de **solo lectura**: produce booleanos +
nombres de error redacted, **no** exfiltra, **no** hace red, **no** hace `POST`, **no** lee
valores reales de cookie/sesskey y **no** llama mutadores SCORM (`LMSSetValue`). Además,
`probe.js` incluye **botones de demostración opcionales** (para el vídeo del artículo) que,
**solo al pulsarlos** y **solo en modo same-origin/legacy**, ejecutan acciones **autorizadas y
reversibles** —incluidos `POST` reales y la carga de una imagen externa—; en modo *secure*
(origen opaco) devuelven `SecurityError`. Solo para laboratorio local y desechable.

## Ficheros

| Fichero | Qué es | Dónde se usa |
|---|---|---|
| `probe.js` | Sonda de 15 comprobaciones (fuente única) | bundle en SCORM/ELPX, inline en page |
| `evil-page.html` | HTML con la sonda *inline* | recurso *Página* / `file://` |
| `evil-scorm.zip` | SCORM 1.2 mínimo (`imsmanifest.xml` + `index.html` + `probe.js`) | `mod_scorm`, `mod_exescorm` |
| `evil.elpx` | Paquete eXeLearning base + sonda inyectada en `index.html` | `mod_exelearning`, `mod_exeweb`, WP, Omeka |
| `evil.h5p` | Paquete H5P base + intento de `<script>`/`<img onerror>` en `content.json` | `mod_h5pactivity` — **control negativo** (los parámetros se filtran) |
| `evil-h5p-library.h5p` | Librería H5P propia (`H5P.ExePocAlert`) cuyo `preloadedJs` se ejecuta | `mod_h5pactivity` — **PoC positiva**: las librerías son código de confianza (requiere `moodle/h5p:updatelibraries`, gestión/administración) |
| `build.sh` | Regenera los artefactos de forma reproducible | — |
| `src-scorm/` | Fuentes del SCORM (`imsmanifest.xml`, `index.html`) | — |
| `src-h5p-lib/` | Fuentes de `evil-h5p-library.h5p` (`h5p.json`, `content/`, librería `H5P.ExePocAlert-1.0/`) | — |

> `evil` es solo una convención didáctica para el artículo; el contenido es inocuo.

**Los dos planos de H5P.** `evil.h5p` prueba el plano de **parámetros** (`content.json`): Moodle los filtra (`H5PContentValidator`/`filter_xss`, sin `<script>` ni `on*`), así que es un **control negativo**. `evil-h5p-library.h5p` prueba el plano de **librerías**: el `preloadedJs` de una librería H5P es **código de confianza** que se ejecuta *same-origin* y sin sandbox; la barrera es la capacidad `moodle/h5p:updatelibraries` (gestión/administración, `RISK_XSS`), no el saneamiento — igual patrón que `mod_page`. Evidencia y citas `archivo:línea`: `../evidencias/resultados-h5p-library.json`.

## Las 15 comprobaciones de `probe.js`

1. ejecuta JavaScript · 2. accede a `window.parent` · 3. lee `parent.document` ·
4. lee `parent.document.cookie` (solo *si* es legible; valor `REDACTED`) ·
5. localiza un `sesskey` (sin mostrarlo) · 6. localiza formularios/enlaces de edición ·
7. accede al *top* (sin navegar) · 8. abre popups (abre y cierra al instante) ·
9. `postMessage` disponible · 10. alcanza `window.API`/`API_1484_11` (sin invocar) ·
11. `localStorage`/`sessionStorage` · 12. captura `SecurityError`/`DOMException` (solo nombre) ·
13. origen opaco · 14. lee su propio `sandbox` / same-origin efectivo · 15. *sandbox escape*
(detectado, **nunca** ejecutado).

Salida: tabla visible dentro del contenido + `window.__EXE_POC_RESULT` (JSON) +
`console.log('[EXE-POC] …')`.

## Reproducir

```bash
cd poc
node --check probe.js          # valida la sonda
bash build.sh                  # regenera evil-page.html, evil-scorm.zip, evil.elpx, evil.h5p, evil-h5p-library.h5p
```

`evil-h5p-library.h5p` se construye desde `src-h5p-lib/` (no necesita fixtures). Los otros
dos paquetes binarios toman una base de los *fixtures* del plugin eXeLearning:
- `BASE_ELPX` (def. `$FIX/elpx/really-simple-test-project.elpx`, con `FIX=../fixtures`)
- `BASE_H5P`  (def. `$FIX/h5p/question-set-demo.h5p`)
Apunta `FIX` (o `BASE_ELPX`/`BASE_H5P`) a tu checkout local de `mod_exelearning` (`research/fixtures/`).

Override: `BASE_ELPX=/ruta/x.elpx BASE_H5P=/ruta/y.h5p bash build.sh`.

## Cómo se probaron (laboratorio)

Subir/abrir cada PoC en un curso desechable marcado `POC-SAFE` y observar la tabla de
salida. En contenido **same-origin** la sonda puede inyectarse desde el padre (simula lo que
haría el contenido); en contenido **opaco** solo se observa la tabla renderizada dentro del
iframe. Resultados en `../evidencias/resultados-vivos.json` y `../evidencias/tarjetas/`.

## Qué NO contienen

Sin payloads de robo de cookies/tokens, sin código de exfiltración, sin instrucciones de
explotación reutilizables contra terceros. La única petición de red es la imagen-meme de la
demostración **opcional**; ningún dato sale del laboratorio.
