# Reproducibilidad

Esta guía explica cómo regenerar, desde cero, los tres tipos de artefactos del repositorio:
las **PoC seguras** (`poc/`), los **documentos** generados localmente (PDF/DOCX en `pdf/` y
`docx/`) y las **sumas de verificación** de esos PDF locales. Todo es **local y desechable**.

**Alcance de la reproducibilidad:** los *documentos* (PDF/DOCX) y las *sumas* son plenamente reproducibles con los comandos de esta guía. Entre las **PoC**, son **plenamente reproducibles offline** desde el repositorio `poc/probe/dist/probe.bundle.js` (commiteado; fuente en `poc/probe/`), `evil-h5p-library.h5p`, `evil-scorm.zip` y `evil-page*.html`; en cambio, `evil.elpx` y `evil.h5p` se construyen a partir de **fixtures base externos** (un `.elpx` y un `.h5p` de partida) que **no se distribuyen** y deben aportarse (ver sección 3). `exe-probe-suite.elpx` (el paquete multipágina, ver sección 3) tampoco lo produce `build.sh`: se genera aparte desde `poc/suite-src/` invocando **la CLI real de eXeLearning**, para lo que hace falta un checkout local de esa CLI que tampoco se distribuye aquí. Las *pruebas en ejecución* en navegador se **documentan** con evidencias JSON y dependen de **entornos externos** (cada LMS/CMS desde su repositorio *upstream*), cuyo montaje exacto queda fuera de alcance.

La **sonda** de las
PoC es de solo lectura (solo devuelve booleanos y nombres de error censurados, sin red ni
`POST`); su fuente en `poc/probe/` incluye además **demos de acción opcionales** para
**cuatro anfitriones** (Moodle, WordPress, Omeka S, Nextcloud) que, solo al pulsarlas y solo
en modo *same-origin/legacy*, ejecutan acciones **autorizadas** contra el laboratorio
(incluidos `POST`/`PUT`), anotadas en un diario de reversión — ver la sección 4.

Resumen rápido (con `make`):

```bash
make poc     # regenera los paquetes PoC en poc/
make pdf     # regenera los PDF (pandoc + tectonic) en pdf/
make docx    # regenera los DOCX en docx/
make sums    # escribe pdf/SHA256SUMS (SHA-256 de los PDF locales)
make all     # poc + pdf + sums

make -C lab matrix   # matriz de aislamiento Moodle 4.5/5.0/5.1/5.2 -> evidencias/resultados-matriz-versiones.json
bash lab/run-demo-matrix.sh   # apoyo same-origin (nombre+foto, curso, foro) por versión -> evidencias/resultados-demo-multiversion.json
bash lab/run-label-check.sh   # Etiqueta (mod_label) ejecuta <script> en la página del curso -> evidencias/resultados-label-xss.json
# mod_exeweb/mod_exescorm same-origin sin sandbox (instala los plugins desde una copia local):
EXEWEB_SRC=/ruta/mod_exeweb EXESCORM_SRC=/ruta/mod_exescorm bash lab/run-exeweb-check.sh \
  # -> evidencias/resultados-exeweb-exescorm.json
```

## 1. Requisitos

- **Docker** — para levantar las instancias LMS/CMS de laboratorio (locales y desechables).
- **`pandoc` + `tectonic`** — para generar el PDF (cadena moderna, sin TeX Live completo;
  tectonic descarga bajo demanda solo los paquetes que use el documento y los cachea).
  - Sugerencia de instalación: `brew install pandoc tectonic`.
  - *Fallback* de PDF: si no hay `tectonic`, `generar-pdf.sh` usa **LibreOffice**
    (DOCX → PDF, sin el estilo LaTeX). Solo `pandoc` basta para generar el DOCX.
- **Node.js + Playwright** — para las sondas de navegador (verificación entre navegadores
  Chromium / Firefox).

## 2. Componentes analizados y *commits* fijados

Los resultados se atan a los *commits* concretos de la sección 3.1 del artículo y a la
cabecera de `matriz-seguridad.md`. Las versiones estables analizadas (el "estado actual"
de cada plataforma) son:

| Componente | *Commit* / versión fijada |
|---|---|
| Moodle (núcleo, 5.0.7, código en `public/`) | `2104c372962` |
| `mod_exelearning` | `2c5473d` |
| `mod_exeweb` | `60d24fb` |
| `mod_exescorm` | `e985f4d` |
| Editor eXeLearning | `8101f54e` |
| `wp-exelearning` | `9eb07ff` |
| `omeka-s-exelearning` | `33faf89` |

Cada LMS/CMS analizado vive en su **propio repositorio *upstream*** (Moodle más sus plugins
`mod_exelearning` / `mod_exeweb` / `mod_exescorm`; el editor eXeLearning; el plugin de
WordPress `wp-exelearning`; el módulo de Omeka S `omeka-s-exelearning`). Cada entorno se
levanta con **Docker** o `wp-env` (WordPress vía `wp-env`; Omeka S como imagen Docker). El detalle exacto de cada montaje es **específico de
cada entorno** y queda **fuera del alcance** de esta guía: para reproducir, despliegue cada
componente desde su repositorio *upstream* en el *commit* fijado de la tabla anterior.

**Matriz transversal de versiones (`lab/`).** Además del estado fijado arriba, el laboratorio
desechable `lab/` levanta el plugin `mod_exelearning` (rama del **modo seguro**, *commit*
`73fe6ff`, la que añade `iframemode = secure|legacy`) sobre **cuatro versiones de Moodle** y
mide la sonda *dentro* del iframe en modo `secure` y `legacy`: **Moodle 4.5.12 (LTS)**, **5.0.8**,
**5.1.5** y **5.2.1**. `make -C lab matrix` regenera `evidencias/resultados-matriz-versiones.json`.
En las cuatro versiones el resultado es **idéntico**: el modo `secure` queda **opaco** (origen `null`,
`parent.document`/`sesskey` lanzan `SecurityError`, directiva `sandbox` de CSP presente) y el
modo `legacy` es *same-origin* (lee el `parent.document` y localiza el `sesskey`). El lab usa
`http://localhost:80`; si otro contenedor ocupa el `:80`, libérelo antes.

## 3. Construir las PoC

Las PoC se regeneran de forma reproducible desde sus fuentes:

```bash
cd poc
bash build.sh           # regenera todos los artefactos
```

`build.sh` consume la sonda ya compilada en `probe/dist/probe.bundle.js` (commiteada) y falla
con un mensaje claro si falta. Solo hace falta Node/`npm` para **recompilarla** desde
`probe/src/` —`cd probe && npm install && npm run build`—; `npm test` corre la batería de
Vitest de la sonda (ver sección 4).

`build.sh` produce:

- `evil.elpx` — paquete eXeLearning base con la sonda inyectada en `index.html`.
- `evil.h5p` — paquete H5P base con un intento de `<script>`/`<img onerror>` en
  `content.json` (**control negativo**: los parámetros se filtran *server-side*).
- `evil-h5p-library.h5p` — librería H5P propia (`H5P.ExePocAlert`) cuyo `preloadedJs` se
  ejecuta *same-origin* y sin sandbox (**PoC positiva**, junto con el procedimiento manual de
  la sección 9: las librerías son código de confianza; la barrera es la capacidad
  `moodle/h5p:updatelibraries`, no el saneamiento).
- `evil-scorm.zip` — SCORM 1.2 mínimo (`imsmanifest.xml` + `index.html` + `probe.bundle.js`).
- `evil-page*.html` — HTML con la sonda *inline* (recurso *Página* / `file://`).
- `evil_web.zip` — export web eXeLearning (`index.html` + `content.xml` + sonda) para
  `mod_exeweb` (copia de `evil.elpx`, que ya es un export web con `content.xml`).
- `evil-exescorm.zip` — `evil-scorm.zip` + `content.xml` (de `evil.elpx`) para superar el
  validador de paquetes de `mod_exescorm` (exige `content.xml`, prohíbe `*.php`).

**Reproducibles offline** (sin fixtures, directamente desde el repositorio): la sonda
(`probe/dist/probe.bundle.js`, commiteada), `evil-h5p-library.h5p` (se construye desde
`src-h5p-lib/`), `evil-scorm.zip` y `evil-page*.html`.
`evil_web.zip` y `evil-exescorm.zip` se derivan de `evil.elpx`, por lo que requieren su mismo
*fixture* base externo.

**Requieren fixtures base externos**: `evil.elpx` y `evil.h5p` parten de *fixtures* base —un
`.elpx` y un `.h5p` de partida— que **no se distribuyen** en el repositorio y deben aportarse.
`build.sh` **falla de forma clara** si esos fixtures no están presentes (y `make poc` propaga el
error); en ese caso, regenera solo los artefactos reproducibles offline. Aporte los fixtures y
ajuste las rutas con variables de entorno:

```bash
FIX=ruta/a/fixtures bash build.sh
# o, directamente:
BASE_ELPX=ruta/x.elpx BASE_H5P=ruta/y.h5p bash build.sh
```

**`exe-probe-suite.elpx`** (el paquete multipágina de ocho casos) se regenera aparte, no con
`build.sh`: `cd poc/suite-src && bash build.sh && python3 verify.py`. Necesita, además de
Python 3, un checkout local de **la CLI real de eXeLearning** (variable `EXE_DIR`, sin
distribuir en este repositorio) — es la CLI, no un script Python, quien emite el `.elpx`
final. Detalle completo en `poc/suite-src/README.md`.

## 4. Ejecutar la sonda

`poc/probe/` (compilada a `poc/probe/dist/probe.bundle.js`) es la **fuente única** de las 15
comprobaciones. Solo **detecta** capacidades y devuelve **booleanos + nombres de error
censurados** (`SecurityError`, `DOMException`); nunca lee valores reales de cookie/`sesskey`,
**no hace red**, **no hace `POST`** y **no invoca mutadores SCORM** (`LMSSetValue`). Aparte de
la sonda de solo lectura, `poc/probe/` incluye **demos de acción opcionales** para **cuatro
anfitriones** (adaptadores en `poc/probe/src/hosts/`: Moodle, WordPress, Omeka S, Nextcloud)
que **solo al pulsarlas** y **solo en modo *same-origin/legacy*** ejecutan acciones
**autorizadas** contra el laboratorio —incluidos `POST`/`PUT` reales—; en modo *secure* (origen
opaco) devuelven `BLOQUEADO`/`SecurityError`. Cada demo que escribe en el anfitrión se anota
antes de actuar en un **diario de reversión** (`poc/probe/src/core/journal.js`): lo que puede
deshacerse por programa se deshace con el botón **Revertir todo** del panel y muestra el
saldo (revertidas/fallidas/no-reversibles); lo que no es reversible por programa se documenta
como barrido manual en `poc/README.md`. Ninguna demo de acción forma parte de la sonda de solo
lectura ni de sus 15 comprobaciones.

La regla de redacción («nunca valores reales, solo booleanos y nombres de error») tiene una
garantía **ejecutable**: `npm test` en `poc/probe/` corre `test/redaction.test.js`, que
inyecta centinelas (cookie, `sesskey`, nonce REST, `requesttoken`) en un DOM anfitrión
simulado y falla si alguno se filtra fuera de los campos censurados del contrato.

La sonda se inyecta en el iframe del contenido y devuelve la tabla de resultados:

- En contenido **same-origin**, la sonda puede inyectarse desde la página padre (simula lo
  que haría el propio contenido del autor).
- En contenido **opaco** (modo seguro), solo se observa la tabla renderizada **dentro** del
  iframe; la página padre únicamente comprueba que `contentDocument` es `null` y que
  `contentWindow` lanza `SecurityError`.

El método **por plataforma** (cómo se monta y se inyecta en cada caso) está documentado en
`anexos-tecnicos.md`.

## 5. Regenerar los documentos

```bash
make pdf            # PDF (pandoc + tectonic; fallback LibreOffice) -> pdf/
make docx           # DOCX (solo pandoc) -> docx/
# equivalente directo:
bash generar-pdf.sh        # DOCX + PDF de todo
bash generar-pdf.sh docx   # solo DOCX (rápido)
```

La salida se genera localmente en `pdf/`; `pdf/` y `docx/` no se versionan. Se generan el
artículo (ES y EN), la matriz, los anexos y el informe completo.

## 6. Matriz de navegadores

El aislamiento de origen opaco es un **comportamiento definido por el estándar web**, no de un motor concreto;
para confirmarlo se replicó la comprobación en **tres motores** con Playwright:

| Navegador | Estado | Script |
|---|---|---|
| Chromium | Verificado | (sondas Playwright / inyección desde la página padre) |
| Firefox/Gecko (Playwright; UA `Firefox/146.0`) | Verificado | `evidencias/firefox-isolation-test.cjs`, `evidencias/firefox-moodle-test.cjs` |
| WebKit/Safari (Playwright; UA `Version/26.4 Safari/605.1.15`) | Verificado (aislamiento de origen opaco: `mod_exelearning`, `wp-exelearning` y `omeka-s-exelearning` en modo seguro + control autocontenido) | `evidencias/webkit-isolation-test.cjs` → `resultados-webkit.json` |

El resultado en Firefox es **idéntico al de Chromium**: la incrustación en modo seguro es opaca
(`contentDocument === null`, `contentWindow` lanza `SecurityError`) en las tres integraciones.
Las versiones de navegador son las **empaquetadas por Playwright** en la fecha de ejecución (UA
observado `Firefox/146.0`); no se fija una versión de navegador concreta más allá del motor.

## 7. Mapa de evidencias

Cada fichero `evidencias/resultados-*.json` respalda una prueba concreta:

| Evidencia | Qué prueba |
|---|---|
| `resultados-firefox.json` | Comportamiento del `sandbox` en Firefox/Gecko (Playwright) (autocontenido: `legacy` con `allow-same-origin` vs. `secure` opaco) y incrustaciones reales `wp-exelearning` / `omeka-s-exelearning`. |
| `resultados-firefox-moodle.json` | Incrustación real de `mod_exelearning` (`iframemode=secure`, servido por `tokenpluginfile`) en Firefox: opaco, `SecurityError`. |
| `resultados-webkit.json` | **Réplica en WebKit/Safari** (`evidencias/webkit-isolation-test.cjs`; UA `Version/26.4 Safari/605.1.15`) del aislamiento de origen opaco, para cerrar el hueco «Safari/WebKit no probado». Cubre **cuatro superficies**: el control autocontenido (`legacy` con `allow-same-origin` alcanza el padre vs. `secure` opaco, `SecurityError`) y los **tres embeds reales en modo seguro** — `mod_exelearning` (Moodle 5.2.1; iframe opaco), `wp-exelearning` (aislamiento por **origen separado** vía `exelearning_content_origin`, cross-origin) y `omeka-s-exelearning` (rama `feature/secure-iframe-sandbox`; `sandbox` **opaco** sin `allow-same-origin`) —. En los tres: `contentDocument === null`, `contentWindow` lanza `SecurityError`, `opaque:true`. Confirma que el aislamiento se comporta igual en los tres motores. |
| `resultados-h5p-library.json` | Vector H5P por **librería**: el `preloadedJs` se ejecuta *same-origin* y sin sandbox; barrera = capacidad `moodle/h5p:updatelibraries` (parámetros de `content.json` sí se filtran). |
| `resultados-modo-seguro.json` | Antes/después del modo seguro de `mod_exelearning` (`iframemode: secure` vs `legacy`); demostración en ejecución con cambio reversible y *rollback* verificado. |
| `resultados-moodle-online.json` | Confirmación en ejecución (instalación en línea, host y cuenta anonimizados) de la cadena de edición del propio perfil desde contenido SCORM, autorizada y reversible. |
| `resultados-vivos.json` | Sonda inyectada en el iframe del contenido (entorno local desechable); *dry-run* de detección de capacidades, sin `POST` ni lectura de valores reales. |
| `resultados-wp-omeka-secure.json` | Verificación en ejecución del modo seguro **propuesto** (origen opaco; prototipo) en `wp-exelearning` y `omeka-s-exelearning`; prueba de solo lectura desde la página padre. |
| `resultados-matriz-versiones.json` | **Matriz transversal de versiones** (`lab/`): la misma sonda dentro del iframe de `mod_exelearning` en **Moodle 4.5.12, 5.0.8, 5.1.5 y 5.2.1**, en modo `secure` (origen opaco; `parent.document`/`sesskey` bloqueados, CSP `sandbox`) y `legacy` (*same-origin*). Capturas vivas reales; las versiones/modos que no arrancan se listan en `skipped`. |
| `resultados-demo-multiversion.json` | **Apoyo *same-origin* por versión** (`lab/run-demo-matrix.sh`): acciones de demostración autorizadas y reversibles en **Moodle 4.5/5.0/5.1/5.2** —cambio del propio **nombre y foto** (persistencia verificada por lectura de BD: `firstname`, `picture`>0), creación de curso+etiqueta e inundación de foro—, desde una cuenta de administración (`demo-actions-test.cjs`) y una sin privilegios (`auto-page-test.cjs`, `evil-page-auto.html`). |
| `resultados-label-xss.json` | **Vector de Etiquetas** (`lab/run-label-check.sh` + `label-xss-test.cjs`): un Profesor con edición crea una Etiqueta (`mod_label`) con `<script>`/`<img onerror>`; al cargar la página del curso **se ejecutan** (`scriptExecuted: true`) en la ventana superior, *same-origin* — mismo `noclean=true` que `mod_page`, vía `format_module_intro` (`weblib.php:872`). |
| `resultados-exeweb-exescorm.json` | **`mod_exeweb` / `mod_exescorm` en ejecución** (`lab/run-exeweb-check.sh` + `evidencias/exeweb-exescorm-test.cjs`, Moodle 5.2.1): se sube `evil_web.zip` (export web `.elpx` con `content.xml`) y `evil-exescorm.zip` (SCORM + `content.xml`), se lanza el contenido y se lee `window.__EXE_POC_RESULT` **desde dentro** del iframe del paquete. Ambos *same-origin* y **sin `sandbox`** (`#exewebobject` / `#exescorm_object`): acceso al `document`/`cookie`/`sesskey` del padre; `mod_exescorm` además invoca la **API SCORM 1.2** (`canCallScormApi: true`). Confirma dinámicamente el veredicto «Alto» antes inferido por código. |
| `resultados-probe-suite-<host>-<modo>.json` | **Matriz anfitrión × modo del artefacto unificado** (`evidencias/probe-suite-test.cjs`, `poc/exe-probe-suite.elpx`): un fichero por celda que sí se pudo ejecutar contra el laboratorio, con el veredicto de diez vectores y el estado de las demos de la vitrina de impacto. Detalle, control local obligatorio y estado actual de cada celda (qué se ejecutó y qué quedó `SALTADO`, con motivo) en la sección 11. |

## 8. Sumas de verificación

`make sums` escribe el SHA-256 de los PDF locales en `pdf/SHA256SUMS`:

```bash
make sums
# verificar después:
shasum -a 256 -c pdf/SHA256SUMS
```

## 9. Nota sobre H5P

El vector de la **librería** H5P está **verificado sobre el código fuente** (rutas
`archivo:línea` citadas en el artículo y en la matriz) y el paquete `evil-h5p-library.h5p`
está **validado estructuralmente**. La ejecución *end-to-end* en una instancia real (subir la librería con
rol de gestión → ver aparecer el aviso de `preloadedJs`) se documenta como **procedimiento
manual reproducible**: la automatización *headless* del selector de ficheros de Moodle 5 no resultó
fiable y queda como trabajo pendiente de automatizar.

## 10. Tabla de reproducción (comando → resultado esperado → evidencia)

Los pasos **offline** (PoC reproducibles offline, PDF, sumas) no necesitan entornos: se ejecutan
**directamente**. (Excepción: `evil.elpx` y `evil.h5p` requieren *fixtures* base externos —ver
sección 3—; sin ellos, `make poc` **falla de forma clara** y regenera solo el resto.)
Los pasos **dinámicos** necesitan **preparación previa** y no se lanzan con un solo comando: requieren
la instancia LMS/CMS correspondiente levantada en `localhost` (cada una desde su repositorio
*upstream* en el *commit* fijado de la sección 2; el montaje exacto es específico de cada entorno y
queda fuera de esta guía). Si ese entorno no está montado, **se incluye la evidencia JSON** obtenida
en el laboratorio del autor como prueba verificable. **Los comandos 4–7 presuponen que el entorno
correspondiente ya está levantado y contiene el recurso `POC-SAFE` publicado.**

| # | Comando | Resultado esperado | Evidencia | Entorno |
|---|---|---|---|---|
| 1 | `make poc` | Regenera offline `evil-h5p-library.h5p`, `evil-scorm.zip`, `evil-page*.html` (consumiendo la sonda ya compilada en `poc/probe/dist/probe.bundle.js`); `evil.elpx` y `evil.h5p` solo si se aportan los *fixtures* base externos (si faltan, falla de forma clara) | ficheros en `poc/` | offline (`.elpx`/`.h5p` requieren fixtures) |
| 1b | `cd poc/probe && npm install && npm test` | Batería Vitest en verde, incluido `redaction.test.js` (el test de no-fuga: falla si alguno de los centinelas de cookie/`sesskey`/nonce/`requesttoken` se filtra fuera de los campos censurados) | salida de Vitest | offline (necesita `npm`, solo para verificar/recompilar la sonda) |
| 1c | `cd poc/suite-src && bash build.sh && python3 verify.py` | Regenera `poc/exe-probe-suite.elpx` (8 páginas) y lo valida (páginas, iDevices `interactive-video`, assets, bundle inline byte a byte) | `VERIFICACIÓN OK` en la salida de `verify.py` | necesita un checkout local de la CLI real de eXeLearning (`EXE_DIR`), no distribuido en este repositorio |
| 2 | `make pdf` | 5 PDF (artículo ES/EN, matriz, anexos, informe) | `pdf/*.pdf` | offline |
| 3 | `make sums && shasum -a 256 -c pdf/SHA256SUMS` | `OK` para cada PDF | `pdf/SHA256SUMS` | offline |
| 4 | `node evidencias/firefox-isolation-test.cjs` | `legacy`: padre accesible · `secure`: `SecurityError`, `isOpaqueOrigin=true` | `resultados-firefox.json` | Firefox/Gecko (Playwright) + wp/omeka |
| 5 | `node evidencias/firefox-moodle-test.cjs` | `iframemode=secure` → opaco, `contentWindow` lanza `SecurityError` | `resultados-firefox-moodle.json` | Firefox/Gecko (Playwright) + Moodle |
| 5b | `npx playwright install webkit` + `node evidencias/webkit-isolation-test.cjs` | `secure` opaco (`SecurityError`, `isOpaqueOrigin=true`) y `mod_exelearning` modo seguro opaco, en **WebKit/Safari** | `resultados-webkit.json` | WebKit/Safari (Playwright); usa Moodle :80 y/o wp :8890 si están arriba |
| 6 | `node evidencias/h5p-library-test.cjs` + confirmación manual | `preloadedJs` ejecuta *same-origin* al ver el contenido (subida manual; *headless* no fiable) | `resultados-h5p-library.json` | Moodle (admin/gestión) |
| 7 | Inyectar `poc/probe/dist/probe.bundle.js` en el iframe del contenido y leer la tabla | booleanos censurados según el aislamiento de cada plataforma | `resultados-vivos.json`, `resultados-wp-omeka-secure.json`, `resultados-modo-seguro.json` | Moodle/WP/Omeka |
| 8a | Control local (obligatorio antes de 8b): construir `harness-secure.html`/`harness-legacy.html` (uno embebe `poc/probe/dist/probe.bundle.js` en un `<iframe sandbox="allow-scripts">`, el otro en un `<iframe>` sin `sandbox`, mismo origen), servirlos con `npx http-server . -p 8199`, y `cd evidencias && URL_MOODLE_SECURE=http://localhost:8199/harness-secure.html URL_MOODLE_LEGACY=http://localhost:8199/harness-legacy.html npm run probe-suite` | `secure`: `0/10`, las 7 demos encontradas (2 de Moodle + 5 de la vitrina) en `contained` · `legacy`: `6/10`, las 5 demos de la vitrina en `escaped` (las 2 de Moodle quedan `unknown`: no hay `sesskey` que scrapear en la página de control, resultado correcto) | no se commitea (fixture desechable; ver §11 para reconstruirlo) | offline |
| 8b | `cd evidencias && npm run probe-suite` con `URL_<HOST>_<MODO>` de la matriz real exportadas | `secure`: `0/10` y todas las demos `contained` · `legacy`: `n/10` con `n > 0` y ≥1 demo `escaped` | `resultados-probe-suite-<host>-<modo>.json` (uno por celda) | laboratorio de `lab/` levantado, artefacto ya subido a cada anfitrión (ver §11) |

Pasos 4–8: si el entorno no está disponible, el JSON de evidencia adjunto documenta el
resultado obtenido en el laboratorio del autor (versiones y *commits* en la sección 2).

## 11. Matriz anfitrión × modo (`evidencias/probe-suite-test.cjs`)

`evidencias/probe-suite-test.cjs` (`npm run probe-suite` dentro de `evidencias/`) es el arnés
que produce la evidencia **citable** de contraste entre modo seguro y modo legacy, anfitrión
por anfitrión: cada celda que ejecuta escribe `resultados-probe-suite-<host>-<modo>.json` con
el veredicto (mismos diez vectores que `poc/probe/src/core/verdict.js`), el resultado crudo, el
anfitrión detectado, la medida de medios y el estado de cada demo pulsada. En modo seguro exige
`0/10` y **todas** las demos en `contained`; en legacy exige `n/10` con `n > 0` y **al menos
una** demo en `escaped`. Una celda sin URL en el entorno se reporta `SALTADO` con el motivo — el
arnés nunca rellena una celda con un resultado inventado.

Las demos que pulsa son las de la página **"6. Ejemplos de impacto"** del artefacto (voltear la
página, terminal falsa, login falso, sustituir logo, aviso falso: las cinco de
`poc/probe/src/hosts/showcase.js`) — **no** las acciones específicas de plataforma de las
páginas 5.1-5.4 (renombrar usuario, crear curso, etc.), que sí escriben de verdad en el
anfitrión y viven en páginas aparte a propósito. La vitrina es agnóstica de plataforma, no
persiste nada (se retira sola) y por eso es la única batería que tiene sentido re-ejecutar cada
vez que se regenera esta evidencia.

**Antes de tocar el laboratorio, ejecutar el control local (paso 8a de la tabla anterior)**: sin
él no hay forma de saber si el arnés sabe distinguir las dos columnas. El resultado real de esa
ejecución (2026-07-26, con `poc/probe/dist/probe.bundle.js` sin modificar) fue exactamente el
esperado — `secure`: `0/10`, 7/7 demos `contained`; `legacy`: `6/10`
(`sandboxAllowsSameOrigin`, `canAccessParent`, `canReadParentDocument`, `canReadParentCookie`,
`canUseLocalStorage`, `canUseSessionStorage`), 5/7 demos `escaped` (las 2 de Moodle, `unknown`,
correctamente: no hay `sesskey` que alcanzar en una página de control que no es Moodle). El
control no se commitea (es un fixture desechable, dos HTML + una copia de
`poc/probe/dist/probe.bundle.js`, reconstruible en un minuto); su resultado íntegro queda en el
informe de la tarea que escribió este arnés
(`.superpowers/sdd/2026-07-25-exe-probe-suite/task-22-report.md`).

**Estado de la matriz real (2026-07-26): 0 de 8 celdas ejecutadas contra el laboratorio**, por
tres motivos distintos, ninguno un defecto del arnés:

- **`moodle/secure` y `moodle/legacy`**: el `:80` de `lab/docker-compose.yml` lo tenía tomado un
  contenedor **ajeno** (`mod_exelearning_2-moodle-1`, de otra tarea concurrente); siguiendo la
  misma política que ya aplica `lab/run-matrix.sh` ("rehúsa pisar un contenedor `:80` ajeno, que
  lo libere el operador"), no se detuvo. En cuanto el `:80` quede libre, `docker compose up -d
  moodle` y exportar las dos URLs basta para rellenar estas dos celdas.
- **`wordpress/secure` y `wordpress/legacy`**: `lab/docker-compose.yml` **no define ningún
  servicio WordPress** (solo `moodle`, `omeka`, `nextcloud`, `db` — ver `lab/README.md`, "Los
  tres anfitriones..."). El brief original de esta tarea asumía cuatro anfitriones en el
  laboratorio; el laboratorio real de la tarea 21 solo levantó tres. Añadir WordPress al
  `docker-compose.yml` (con un plugin que exponga un `iframemode` como el de `mod_exelearning`)
  queda fuera del alcance de esta tarea.
- **`omeka/secure`, `omeka/legacy`, `nextcloud/secure`, `nextcloud/legacy`**: Omeka S y
  Nextcloud **están levantados y accesibles** (`:8081`, `:8082`), pero **ninguno de los dos
  ofrece hoy una forma nativa de incrustar el artefacto con un modo seguro/legacy conmutable**:
  no existe todavía un módulo eXeLearning para Omeka S ni una app para Nextcloud publicados (ver
  `lab/README.md`). Se comprobó a mano contra las instancias vivas de este laboratorio (login de
  administrador real en ambas): el ingester "Upload" de Omeka S sirve los ficheros con un
  renderizador según su tipo (imagen/audio/vídeo/descarga), sin ejecutar HTML arbitrario
  incrustado; existe un ingester "HTML" independiente (contenido tecleado por quien administra,
  no un fichero subido — un vector distinto del que describe el artículo), pero requiere además
  un *Site* público, que este laboratorio no tiene configurado. En Nextcloud, las apps instaladas
  (`text`, `viewer`, `files_pdfviewer`; comprobado con `occ app:list`) previsualizan como texto o
  como imagen/PDF, sin ejecutar `<script>`. Ninguna de las dos vías produce un contraste
  seguro/legacy real que medir hoy; en cuanto exista una integración publicada para cualquiera de
  los dos anfitriones, `URL_OMEKA_*`/`URL_NC_*` son las únicas variables que hace falta añadir.
