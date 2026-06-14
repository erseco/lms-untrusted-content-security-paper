# Reproducibilidad

Esta guía explica cómo regenerar, desde cero, los tres tipos de artefactos del repositorio:
las **PoC seguras** (`poc/`), los **documentos** (PDF/DOCX en `pdf/` y `docx/`) y las **sumas
de verificación** de los PDF publicados. Todo es **local y desechable**.

**Alcance de la reproducibilidad:** los *artefactos* (PoC, documentos, sumas) son plenamente reproducibles con los comandos de esta guía; las *pruebas vivas* en navegador se **documentan** con evidencias JSON y dependen de **entornos externos** (cada LMS/CMS desde su repositorio *upstream*), cuyo montaje exacto queda fuera de alcance.

La **sonda** de las
PoC es de solo lectura (solo devuelve booleanos y nombres de error *redacted*, sin red ni
`POST`); `probe.js` incluye además **botones de demostración opcionales** que, solo al
pulsarlos y solo en modo *same-origin/legacy*, ejecutan acciones **autorizadas y reversibles**
(incluidos `POST`) — ver la sección 4.

Resumen rápido (con `make`):

```bash
make poc     # regenera los paquetes PoC en poc/
make pdf     # regenera los PDF (pandoc + tectonic) en pdf/
make docx    # regenera los DOCX en docx/
make sums    # escribe pdf/SHA256SUMS (SHA-256 de los PDF publicados)
make all     # poc + pdf + sums
```

## 1. Requisitos

- **Docker** — para levantar las instancias LMS/CMS de laboratorio (locales y desechables).
- **`pandoc` + `tectonic`** — para generar el PDF (cadena moderna, sin TeX Live completo;
  tectonic descarga bajo demanda solo los paquetes que use el documento y los cachea).
  - Sugerencia de instalación: `brew install pandoc tectonic`.
  - *Fallback* de PDF: si no hay `tectonic`, `generar-pdf.sh` usa **LibreOffice**
    (DOCX → PDF, sin el estilo LaTeX). Solo `pandoc` basta para generar el DOCX.
- **Node.js + Playwright** — para las sondas de navegador (verificación cross-browser
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

## 3. Construir las PoC

Las PoC se regeneran de forma reproducible desde sus fuentes:

```bash
cd poc
node --check probe.js   # valida la sonda (opcional)
bash build.sh           # regenera todos los artefactos
```

`build.sh` produce:

- `evil.elpx` — paquete eXeLearning base con la sonda inyectada en `index.html`.
- `evil.h5p` — paquete H5P base con un intento de `<script>`/`<img onerror>` en
  `content.json` (**control negativo**: los parámetros se filtran *server-side*).
- `evil-h5p-library.h5p` — librería H5P propia (`H5P.ExePocAlert`) cuyo `preloadedJs` se
  ejecuta *same-origin* y sin sandbox (**PoC positiva**: las librerías son código de
  confianza; la barrera es la capacidad `moodle/h5p:updatelibraries`, no el saneamiento).
- `evil-scorm.zip` — SCORM 1.2 mínimo (`imsmanifest.xml` + `index.html` + `probe.js`).
- `evil-page*.html` — HTML con la sonda *inline* (recurso *Página* / `file://`).

`evil-h5p-library.h5p` se construye desde `src-h5p-lib/` (no necesita fixtures). `evil.elpx`
y `evil.h5p` parten de *fixtures* base; ajuste las rutas con variables de entorno si las
necesita:

```bash
FIX=ruta/a/fixtures bash build.sh
# o, directamente:
BASE_ELPX=ruta/x.elpx BASE_H5P=ruta/y.h5p bash build.sh
```

## 4. Ejecutar la sonda

`poc/probe.js` es la **fuente única** de las 15 comprobaciones. Solo **detecta**
capacidades y devuelve **booleanos + nombres de error *redacted*** (`SecurityError`,
`DOMException`); nunca lee valores reales de cookie/`sesskey`, **no hace red**, **no hace
`POST`** y **no invoca mutadores SCORM** (`LMSSetValue`). Aparte de la sonda, `probe.js`
incluye **botones de demostración opcionales** (`exePocDeface` / `exePocCreateCourse` /
`exePocOwnUser`) que **solo al pulsarlos** y **solo en modo *same-origin/legacy*** ejecutan
acciones **autorizadas y reversibles** —incluidos `POST` reales y la carga de una imagen
externa—; en modo *secure* (origen opaco) devuelven `SecurityError`. No forman parte de la
sonda de solo lectura.

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

La salida se publica en `pdf/`; el `docx/` intermedio no se versiona. Se generan el
artículo (ES y EN), la matriz, los anexos y el informe completo.

## 6. Matriz de navegadores

El aislamiento de origen opaco es una **garantía del estándar web**, no de un motor concreto;
para confirmarlo se replicó la comprobación en dos motores con Playwright:

| Navegador | Estado | Script |
|---|---|---|
| Chromium | Verificado | (sondas Playwright / inyección desde la página padre) |
| Firefox 146 (Gecko) | Verificado | `evidencias/firefox-isolation-test.cjs`, `evidencias/firefox-moodle-test.cjs` |
| Safari / WebKit | Pendiente (trabajo futuro) | — |

El resultado en Firefox es **idéntico al de Chromium**: el embed en modo seguro es opaco
(`contentDocument === null`, `contentWindow` lanza `SecurityError`) en las tres integraciones.

## 7. Mapa de evidencias

Cada fichero `evidencias/resultados-*.json` respalda una prueba concreta:

| Evidencia | Qué prueba |
|---|---|
| `resultados-firefox.json` | Comportamiento del `sandbox` en Firefox 146/Gecko (autocontenido: `legacy` con `allow-same-origin` vs. `secure` opaco) y embeds reales `wp-exelearning` / `omeka-s-exelearning`. |
| `resultados-firefox-moodle.json` | Embed real de `mod_exelearning` (`iframemode=secure`, servido por `tokenpluginfile`) en Firefox: opaco, `SecurityError`. |
| `resultados-h5p-library.json` | Vector H5P por **librería**: el `preloadedJs` corre *same-origin* y sin sandbox; barrera = capacidad `moodle/h5p:updatelibraries` (parámetros de `content.json` sí se filtran). |
| `resultados-modo-seguro.json` | Antes/después del modo seguro de `mod_exelearning` (`iframemode: secure` vs `legacy`); demostración viva con cambio reversible y *rollback* verificado. |
| `resultados-moodle-online.json` | Confirmación en vivo (instalación en línea, host y cuenta anonimizados) de la cadena de edición del propio perfil desde contenido SCORM, autorizada y reversible. |
| `resultados-vivos.json` | Sonda inyectada en el iframe del contenido (entorno local desechable); *dry-run* de detección de capacidades, sin `POST` ni lectura de valores reales. |
| `resultados-wp-omeka-secure.json` | Verificación en vivo del modo seguro (origen opaco, por defecto) en `wp-exelearning` y `omeka-s-exelearning`; prueba de solo lectura desde la página padre. |

## 8. Sumas de verificación

`make sums` escribe el SHA-256 de los PDF publicados en `pdf/SHA256SUMS`:

```bash
make sums
# verificar después:
shasum -a 256 -c pdf/SHA256SUMS
```

## 9. Nota sobre H5P

El vector de la **librería** H5P está **verificado sobre el código fuente** (rutas
`archivo:línea` citadas en el artículo y en la matriz) y el paquete `evil-h5p-library.h5p`
está **validado estructuralmente**. La ejecución en vivo *end-to-end* (subir la librería con
rol de gestión → ver aparecer el aviso de `preloadedJs`) se documenta como **procedimiento
manual reproducible**: la automatización *headless* del *file picker* de Moodle 5 no resultó
fiable y queda como trabajo pendiente de automatizar.

## 10. Tabla de reproducción (comando → resultado esperado → evidencia)

Los pasos **offline** (PoC, PDF, sumas) no necesitan entornos. Los pasos **vivos** requieren
la instancia LMS/CMS correspondiente levantada en `localhost` (cada una desde su repositorio
*upstream* en el *commit* fijado de la sección 2; el montaje exacto es específico de cada
entorno y queda fuera de esta guía).

| # | Comando | Resultado esperado | Evidencia | Entorno |
|---|---|---|---|---|
| 1 | `make poc` | Regenera `evil.elpx`, `evil.h5p`, `evil-h5p-library.h5p`, `evil-scorm.zip`, `evil-page*.html` | ficheros en `poc/` | offline |
| 2 | `make pdf` | 5 PDF (artículo ES/EN, matriz, anexos, informe) | `pdf/*.pdf` | offline |
| 3 | `make sums && shasum -a 256 -c pdf/SHA256SUMS` | `OK` para cada PDF | `pdf/SHA256SUMS` | offline |
| 4 | `node evidencias/firefox-isolation-test.cjs` | `legacy`: padre accesible · `secure`: `SecurityError`, `isOpaqueOrigin=true` | `resultados-firefox.json` | Firefox 146 + wp/omeka |
| 5 | `node evidencias/firefox-moodle-test.cjs` | `iframemode=secure` → opaco, `contentWindow` lanza `SecurityError` | `resultados-firefox-moodle.json` | Firefox 146 + Moodle |
| 6 | `node evidencias/h5p-library-test.cjs` + confirmación manual | `preloadedJs` ejecuta *same-origin* al ver el contenido (subida manual; *headless* no fiable) | `resultados-h5p-library.json` | Moodle (admin/gestión) |
| 7 | Inyectar `poc/probe.js` en el iframe del contenido y leer la tabla | booleanos *redacted* según el aislamiento de cada plataforma | `resultados-vivos.json`, `resultados-wp-omeka-secure.json`, `resultados-modo-seguro.json` | Moodle/WP/Omeka |

Pasos 4–7: si el entorno no está disponible, el JSON de evidencia adjunto documenta el
resultado obtenido en el laboratorio del autor (versiones y *commits* en la sección 2).
