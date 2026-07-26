# Reproducibilidad

Esta guía explica cómo regenerar, desde cero, los tres tipos de artefactos del repositorio:
las **PoC seguras** (`poc/`), los **documentos** generados localmente (PDF/DOCX en `pdf/` y
`docx/`) y las **sumas de verificación** de esos PDF locales. Todo es **local y desechable**.

**Alcance de la reproducibilidad:** los *documentos* (PDF/DOCX) y las *sumas* son plenamente reproducibles con los comandos de esta guía. Las PoC basadas solo en fuentes del repositorio (`evil-page.html`, `h5p-probe-moodle-div.h5p` y `h5p-probe-moodle-iframe.h5p`) se regeneran offline. Los tres formatos eXeLearning —`evil.elpx`, `evil_web.zip` y `evil_scorm.zip`— se publican ya construidos y se regeneran desde una única fuente `.elp` mediante **la CLI real de eXeLearning** (`make poc-suite`); requieren un checkout local de esa CLI, no distribuido aquí. No se copian ZIP ni se injerta `content.xml`: HTML5 y SCORM 1.2 son exportaciones reales. `evil.h5p` es la única PoC que además necesita un **fixture base externo** no distribuido (ver sección 3). Las pruebas vivas dependen de los entornos LMS/CMS externos indicados.

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

`poc/suite-src/build.sh` produce desde una única fuente:

- `evil.elpx` — paquete eXeLearning canónico de 21 páginas con la sonda inyectada.
- `evil_web.zip` — exportación HTML5 real de esas 21 páginas para `mod_exeweb`.
- `evil_scorm.zip` — exportación SCORM 1.2 real de esas 21 páginas para `mod_scorm` y
  `mod_exescorm`; contiene `content.xml`, `imsmanifest.xml`, navegación, assets y la sonda.

`poc/build.sh` usa esos tres formatos ya exportados y produce:

- `evil.h5p` — paquete H5P base con un intento de `<script>`/`<img onerror>` en
  `content.json` (**control negativo**: los parámetros se filtran *server-side*).
- `h5p-probe-moodle-div.h5p` / `h5p-probe-moodle-iframe.h5p` — librerías H5P
  propias que fuerzan por separado `div` e `iframe`, cargan la sonda común completa y
  solo contienen medición pasiva. En Moodle la barrera es
  `moodle/h5p:updatelibraries`; en WordPress, `manage_h5p_libraries`.
- `evil-page.html` — único HTML canónico autocontenido (recurso *Página* / `file://`); el
  bundle viaja en Base64 para sobrevivir a la serialización de entidades del editor.

La página 5.1 de los tres formatos eXe conserva la misma acción Moodle: al pulsarla sustituye
de inmediato el avatar visible en el DOM padre y lo resalta en verde; después intenta el
cambio persistente de nombre y foto. `verify.py` comprueba esa rutina y que el SCORM sea 1.2.

**Requiere fixture base externo**: solo `evil.h5p`, que parte de un `.h5p` de partida que **no
se distribuye** en el repositorio y debe aportarse. `build.sh` **falla de forma clara** si ese
fixture no está presente (y `make poc` propaga el error); en ese caso, regenera todos los demás
artefactos. Aporte el fixture y ajuste la ruta con variables de entorno:

```bash
FIX=ruta/a/fixtures bash build.sh
# o, directamente:
BASE_H5P=ruta/y.h5p bash build.sh
```

**`evil.elpx`** (el paquete de 21 páginas: Inicio, 7 apartados de nivel superior y
13 subapartados) se regenera aparte, no con
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
| `resultados-demo-multiversion.json` | **Apoyo *same-origin* por versión** (`lab/run-demo-matrix.sh`): acciones de demostración autorizadas y reversibles en **Moodle 4.5/5.0/5.1/5.2** —cambio del propio **nombre y foto** (persistencia verificada por lectura de BD: `firstname`, `picture`>0), creación de curso+etiqueta e inundación de foro—, desde una cuenta de administración (`demo-actions-test.cjs`) y una sin privilegios (`page-html-test.cjs`, artefacto canónico `evil-page.html`). |
| `resultados-label-xss.json` | **Vector de Etiquetas** (`lab/run-label-check.sh` + `label-xss-test.cjs`): un Profesor con edición crea una Etiqueta (`mod_label`) con `<script>`/`<img onerror>`; al cargar la página del curso **se ejecutan** (`scriptExecuted: true`) en la ventana superior, *same-origin* — mismo `noclean=true` que `mod_page`, vía `format_module_intro` (`weblib.php:872`). |
| `resultados-exeweb-exescorm.json` | **`mod_exeweb` / `mod_exescorm` en ejecución** (Moodle 5.2.1): evidencia histórica del ZIP web anterior y el SCORM híbrido; confirma que ambos iframes son *same-origin* y carecen de `sandbox`, y que `mod_exescorm` alcanza la API SCORM 1.2. El *harness* actual sube las exportaciones reales `evil_web.zip` / `evil_scorm.zip`; su repetición requiere liberar el puerto 80. |
| `resultados-probe-suite-<host>-<modo>.json` | **Matriz anfitrión × modo del artefacto unificado** (`evidencias/probe-suite-test.cjs`, `poc/evil.elpx`): un fichero por celda que sí se pudo ejecutar contra el laboratorio, con el veredicto de diez vectores y el estado de las demos de la vitrina de impacto. Detalle, control local obligatorio y estado actual de cada celda (qué se ejecutó y qué quedó `SALTADO`, con motivo) en la sección 11. |

> **Nota histórica sobre el `.elpx`.** Hasta la unificación descrita en la sección 3, `evil.elpx`
> era un paquete eXeLearning distinto —de una sola página, derivado de un *fixture* base
> externo— y no el suite actual de 21 páginas. `resultados-exeweb-exescorm.json` conserva la
> ejecución histórica del ZIP web anterior y el SCORM híbrido para no reescribir evidencia:
> el veredicto de origen/iframe no cambió, pero no se presenta como ejecución de los ZIP actuales.
> El *harness* ya apunta a las dos exportaciones reales para su siguiente repetición.
> `resultados-vivos.json` (publicación en
> WordPress con `wp media import`) **se conserva sin tocar**: documenta lo que realmente se
> ejecutó entonces, con aquel paquete de una página, y no lo que hoy se publica con ese nombre.
>
> Esa re-ejecución destapó algo que solo se ve al embeber el paquete: `index.html` es la
> **portada** del suite y era la única de las 20 páginas que tenía entonces sin sonda, así que `mod_exeweb` —que
> incrusta `index.html?embed=1`— no medía nada en la primera pantalla. Desde entonces la portada
> lleva la sonda en su vista compacta (`spec.json`, página «Inicio»; `verify.py` ya no exceptúa
> ninguna página).

## 8. Sumas de verificación

`make sums` escribe el SHA-256 de los PDF locales en `pdf/SHA256SUMS`:

```bash
make sums
# verificar después:
shasum -a 256 -c pdf/SHA256SUMS
```

## 9. Nota sobre H5P

El vector de la **librería** H5P está **verificado sobre el código fuente** y los
paquetes `div`/`iframe` están **construidos y validados estructuralmente**. Cada paquete
carga `probe.h5p.bundle.js` antes de `run.js`; el bundle expone
`ExeProbe.startProbe`, no se autoejecuta y una prueba falla si incorpora endpoints
mutadores o la pestaña de demostración. La validación runtime sigue pendiente en cuatro
celdas: Moodle `div`, Moodle `iframe`, WordPress `div` y WordPress `iframe`. Hasta
recoger esos cuatro JSON, la evidencia se describe como «código verificado + artefacto
reproducible construido», no como ejecución confirmada.

## 10. Tabla de reproducción (comando → resultado esperado → evidencia)

Los pasos **offline** (PoC reproducibles offline, PDF, sumas) no necesitan entornos: se ejecutan
**directamente**. (Excepción: `evil.h5p` requiere un *fixture* base externo —ver sección 3—; sin
él, `make poc` **falla de forma clara** y regenera todo lo demás.)
Los pasos **dinámicos** necesitan **preparación previa** y no se lanzan con un solo comando: requieren
la instancia LMS/CMS correspondiente levantada en `localhost` (cada una desde su repositorio
*upstream* en el *commit* fijado de la sección 2; el montaje exacto es específico de cada entorno y
queda fuera de esta guía). Si ese entorno no está montado, **se incluye la evidencia JSON** obtenida
en el laboratorio del autor como prueba verificable. **Los comandos 4–7 presuponen que el entorno
correspondiente ya está levantado y contiene el recurso `POC-SAFE` publicado.**

| # | Comando | Resultado esperado | Evidencia | Entorno |
|---|---|---|---|---|
| 1 | `make poc` | Regenera `evil-page.html` y las sondas H5P `div`/`iframe` usando los bundles compilados y los tres formatos eXe ya publicados; `evil.h5p` solo si se aporta su fixture externo | ficheros en `poc/` | offline (`evil.h5p` requiere fixture) |
| 1b | `cd poc/probe && npm install && npm test` | Batería Vitest en verde, incluido `redaction.test.js` (el test de no-fuga: falla si alguno de los centinelas de cookie/`sesskey`/nonce/`requesttoken` se filtra fuera de los campos censurados) | salida de Vitest | offline (necesita `npm`, solo para verificar/recompilar la sonda) |
| 1c | `make poc-suite` | Regenera `evil.elpx`, `evil_web.zip` y `evil_scorm.zip` desde una sola fuente con la CLI real, y valida 21 páginas, assets, bundle, manifiesto SCORM y demo Moodle | `VERIFICACIÓN OK` | necesita un checkout local de la CLI real (`EXE_DIR`) |
| 2 | `make pdf` | 5 PDF (artículo ES/EN, matriz, anexos, informe) | `pdf/*.pdf` | offline |
| 3 | `make sums && shasum -a 256 -c pdf/SHA256SUMS` | `OK` para cada PDF | `pdf/SHA256SUMS` | offline |
| 4 | `node evidencias/firefox-isolation-test.cjs` | `legacy`: padre accesible · `secure`: `SecurityError`, `isOpaqueOrigin=true` | `resultados-firefox.json` | Firefox/Gecko (Playwright) + wp/omeka |
| 5 | `node evidencias/firefox-moodle-test.cjs` | `iframemode=secure` → opaco, `contentWindow` lanza `SecurityError` | `resultados-firefox-moodle.json` | Firefox/Gecko (Playwright) + Moodle |
| 5b | `npx playwright install webkit` + `node evidencias/webkit-isolation-test.cjs` | `secure` opaco (`SecurityError`, `isOpaqueOrigin=true`) y `mod_exelearning` modo seguro opaco, en **WebKit/Safari** | `resultados-webkit.json` | WebKit/Safari (Playwright); usa Moodle :80 y/o wp :8890 si están arriba |
| 6 | Publicar cada paquete en un recurso `POC-SAFE`; después `H5P_RUNTIME_URL=... PLATFORM=moodle MODE=div node evidencias/h5p-probe-runtime-test.cjs` (repetir las cuatro combinaciones) | Busca `__EXE_POC_RESULT` en todos los frames y escribe un JSON runtime separado | `resultados-h5p-{moodle,wordpress}-{div,iframe}-live.json` (no sustituir la evidencia curada) | Moodle (gestión) / WordPress (`manage_h5p_libraries`) |
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
cuatro motivos distintos —uno por anfitrión—, ninguno un defecto del arnés y ninguno el mismo
motivo dos veces:

- **`moodle/secure` y `moodle/legacy`**: el `:80` de `lab/docker-compose.yml` lo tenía tomado un
  contenedor **ajeno** (`mod_exelearning_2-moodle-1`, de otra tarea concurrente); siguiendo la
  misma política que ya aplica `lab/run-matrix.sh` ("rehúsa pisar un contenedor `:80` ajeno, que
  lo libere el operador"), no se detuvo. En cuanto el `:80` quede libre, `docker compose up -d
  moodle` y exportar las dos URLs basta para rellenar estas dos celdas.
- **`wordpress/secure` y `wordpress/legacy`**: igual que Omeka S, el módulo `wp-exelearning`
  **existe** (tabla de la sección 2, *commit* `9eb07ff`; evidencia ya citada en
  `resultados-webkit.json`/`resultados-firefox.json`/`resultados-wp-omeka-secure.json`) — con
  la salvedad de que su aislamiento seguro no es un `sandbox` opaco sino **origen separado**
  (`exelearning_content_origin`, un subdominio/puerto distinto), un mecanismo distinto del que
  usan Moodle y Omeka S. Pero aquí el gap **es mayor** que en Omeka S: `lab/docker-compose.yml`
  **no define ningún servicio WordPress** (solo `moodle`, `omeka`, `nextcloud`, `db` — ver
  `lab/README.md`, "Los tres anfitriones..."), así que no hay ni contenedor donde dejar caer un
  checkout. El brief original de esta tarea asumía cuatro anfitriones en el laboratorio; el
  laboratorio real de la tarea 21 solo levantó tres. Añadir el servicio WordPress al
  `docker-compose.yml` (con el módulo fijado en `9eb07ff` y su conmutador de modo) es trabajo
  nuevo de la envergadura de la tarea 21, no un *fetch* suelto, y queda fuera del alcance de
  esta tarea.
- **`omeka/secure` y `omeka/legacy`**: el módulo `omeka-s-exelearning` **sí existe** — la tabla
  de la sección 2 lo fija en el *commit* `33faf89` (rama `feature/secure-iframe-sandbox`), y es
  el mismo módulo cuyo modo seguro (`sandbox` opaco sin `allow-same-origin`) ya está verificado
  en tres motores y citado más arriba (`resultados-webkit.json`, `resultados-firefox.json`,
  `resultados-wp-omeka-secure.json`). El motivo de que la celda no corriera **en esta sesión** no
  es que la integración no exista: es que `lab/omeka-s-exelearning/` es un punto de montaje
  **vacío** (gitignorado) sin ningún paso de *fetch* que lo rellene — a diferencia de
  `mod_exelearning`, que tiene `fetch-plugin.sh`, aquí no hay equivalente. Para rellenar estas
  dos celdas: colocar el checkout de `omeka-s-exelearning` en `33faf89` dentro de
  `lab/omeka-s-exelearning/`, `./install-omeka-module.sh`, activar el módulo en
  `http://localhost:8081/admin/module` y fijar su modo seguro/legacy, exactamente como ya hace
  `install-plugin.sh` para Moodle.
- **`nextcloud/secure` y `nextcloud/legacy`**: aquí sí falta la integración, no solo el
  *fetch*: no hay ninguna app eXeLearning para Nextcloud citada en ningún sitio de este
  documento (a diferencia de Omeka S y WordPress, no hay *commit* fijado en la tabla de la
  sección 2 ni evidencia previa) — es la única de las cuatro plataformas para la que este plan
  construyó un adaptador (`poc/probe/src/hosts/nextcloud.js`, con demos reales y reversibles)
  sin que exista todavía un sitio donde ejercitarlo. Se comprobó a mano contra la instancia viva
  de este laboratorio (login de administrador real, `:8082`): las apps instaladas (`text`,
  `viewer`, `files_pdfviewer`; `occ app:list`) previsualizan un `.html` subido como texto plano o
  como imagen, sin ejecutar su `<script>` — no hay ninguna vía nativa de incrustarlo same-origin
  ni en origen opaco. En cuanto exista una integración publicada, `URL_NC_SECURE`/`URL_NC_LEGACY`
  son las únicas variables que hace falta añadir.
