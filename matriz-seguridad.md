# Matriz de seguridad — contenido HTML/JS en LMS/CMS educativos

> Evidencia verificada contra el HEAD de cada repositorio (junio 2026). Cada celda
> "Cita" remite a `archivo:línea`. Las afirmaciones de comportamiento del navegador
> están marcadas `[hecho]` (verificado en código o prueba) o `[inferencia]`.
>
> SHAs de referencia: `mod_exelearning` `2c5473d` · `mod_exeweb` `60d24fb` ·
> `mod_exescorm` `e985f4d` · `moodle` `2104c372962` (5.x, code en `public/`) ·
> `exelearning` `8101f54e` · `wp-exelearning` `9eb07ff` ·
> `omeka-s-exelearning` `33faf89`.
>
> **Origen de la evidencia.** Las filas y atributos de versión **estable** / `legacy` corresponden a los SHAs fijados arriba; el **modo seguro** (atributos `secure` y los *toggles* de modo iframe, en las secciones 2.7 y 2.8) procede de la **propuesta de modificación de código** (prototipo), aún **no adoptada *upstream***. El SHA estable de cada integración es *same-origin* (equivalente a `legacy`).

## 1. Tabla resumida (para el cuerpo del artículo)

| Plataforma / recurso | ¿Ejecuta JS del autor? | ¿Mismo origen que el LMS? | `sandbox` del iframe | Aislamiento real |
|---|---|---|---|---|
| **mod_page** (Página) | **Sí** (verificado en vivo: ejecuta `<script>`) | Sí | — (no es iframe) | Ninguno server-side (`noclean`); gated por capacidad (`RISK_XSS`) |
| **mod_scorm** (core) | Sí | Sí | **ninguno** | Ninguno (confía en el SCO) |
| **mod_h5pactivity / core_h5p** | Parámetros **No** / librerías **Sí** (`preloadedJs`) | Sí (`about:blank` hereda origen) | — (`contentDocument.write`, sin sandbox) | Parámetros filtrados por semántica; el JS de librería corre *same-origin*, gate `h5p:updatelibraries` |
| **mod_exelearning** (estable) | Sí | Sí | `allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox` | Parcial (mantiene `allow-same-origin`) |
| **mod_exelearning** (modo seguro) | Sí | No (opaco) | `allow-scripts allow-popups allow-forms` (sin `allow-same-origin`) | Fuerte (origen opaco + puente) |
| **mod_exeweb** | Sí | Sí | **ninguno** | Ninguno |
| **mod_exescorm** | Sí | Sí | **ninguno** | Ninguno |
| **wp-exelearning** (estable) | Sí | Sí | `allow-scripts allow-same-origin allow-popups` | Parcial (mantiene `allow-same-origin`) |
| **wp-exelearning** (modo seguro) | Sí | No (opaco) | `allow-scripts allow-popups` | Fuerte (origen opaco) |
| **omeka-s-exelearning** (estable) | Sí | Sí | `allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox` | Parcial (mantiene `allow-same-origin`) |
| **omeka-s-exelearning** (modo seguro) | Sí | No (opaco) | `allow-scripts allow-popups allow-popups-to-escape-sandbox` | Fuerte (origen opaco; también vistas públicas) |

Para cada integración mantenida se muestran **dos estados**: la **versión estable** (*same-origin*)
y el **modo seguro propuesto** (origen opaco; propuesta de modificación de código). El modo `legacy` (*same-origin*) queda como respaldo
**opcional** (véase la nota tras la tabla principal del artículo).

Lectura rápida: *ejecutar JavaScript del autor no es el problema; el problema es
ejecutarlo **con el mismo origen** que el LMS y **sin** una frontera explícita.* Las
dos columnas que de verdad importan son "mismo origen" y "aislamiento real".

### 1.1 Matriz de riesgo formal

Criterio de clasificación explícito (referenciado desde la sección 3.4 del artículo): siete
dimensiones observables más la separación entre **impacto máximo demostrado** (verificado en
laboratorio) e **impacto inferido** (deducido del modelo del navegador). "SS" = *server-side*.

| Mecanismo | JS autor | Mismo origen | Rol p/ publicar | Rol visitante | Token en DOM | CSP restr. | Mutación SS alcanzable (rol) | Impacto máx. demostrado | Impacto inferido |
|---|---|---|---|---|---|---|---|---|---|
| `mod_page` | Sí | Sí (top) | profesor/gestor (`addinstance`) | cualquiera | Sí (`sesskey`) | No | Sí (servicios AJAX) | autoedición del propio perfil (vivo) | acciones acotadas por el rol del visitante |
| `mod_scorm` | Sí | Sí | profesor | cualquiera | Sí | No | Sí (gated `savetrack`) | lectura de DOM/`sesskey` (vivo) | forja acotada por validación SS |
| H5P · parámetros | No (filtrado) | Sí | — | cualquiera | n/a | No | n/a | control negativo (vivo) | — |
| H5P · librería | Sí (`preloadedJs`) | Sí | manager (`updatelibraries`) | cualquiera | Sí | No | Sí | ruta en código + PoC validada (manual) | JS arbitrario *same-origin* |
| `mod_exelearning` (estable) | Sí | Sí | profesor | cualquiera | Sí | No | Sí | lee `sesskey` y forja (vivo) | escalado por rol |
| `mod_exelearning` (modo seguro) | Sí | No (opaco) | profesor | cualquiera | No (token solo-lectura) | Sí | solo vía puente validado | `SecurityError` (vivo Chromium+FF146) | aislado |
| `mod_exeweb` / `mod_exescorm` | Sí | Sí | profesor | cualquiera | Sí | No | Sí | — (solo código) | acceso total *same-origin* |
| `wp-exelearning` / `omeka-s-exelearning` (estable) | Sí | Sí | autor/editor | cualquiera | Sí | No | Sí | acceso al padre / `/wp-admin/` (vivo) | escalado por rol |
| `wp-exelearning` / `omeka-s-exelearning` (modo seguro) | Sí | No (opaco) | autor/editor | cualquiera | No | Sí | — | opaco (vivo, Chromium+FF146) | aislado |

## 2. Matriz técnica completa (anexo)

### 2.1 mod_exelearning (`2c5473d`)

| Atributo | Valor | Cita |
|---|---|---|
| Cómo se publica | El profesor sube un `.elpx`; se extrae y se sirve por `pluginfile.php` | `lib.php:513-568` |
| HTML/JS arbitrario | Sí (HTML/JS del autor del paquete) | `view.php:446-447` |
| JS se ejecuta | Sí | iframe `allow-scripts` |
| Mismo origen | Sí (`$CFG->wwwroot` único) | `view.php:446-447` |
| Usa iframe | Sí, `#exelearningobject` | `view.php:446-447` |
| `sandbox` | `allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox` | `view.php:446-447` |
| `allow-top-navigation` | **No** (omitido a propósito) | `view.php:446-447` |
| `allow-popups-to-escape-sandbox` | Sí (residuo a quitar) | `view.php:446-447` |
| CSP | **No emitida** | `lib.php:513-568` |
| Permissions-Policy | **No emitida** (pendiente) | `lib.php:513-568` |
| X-Frame-Options | No (en pluginfile); core pone `sameorigin` en páginas | `weblib.php:1604-1605` |
| postMessage | Sí, **solo en el editor** (no en el visor) | `amd/src/editor_modal.js:441-449` |
| Valida `event.origin` | Sí (editor) | `editor_modal.js:441-449` |
| Valida `event.source` | Sí (`=== iframe.contentWindow`) | `editor_modal.js:441-449` |
| Token/contexto | `sesskey` validado server-side en `track.php` | `track.php:40`, `view.php:387-390` |
| Acceso a `parent` | Sí (mismo origen) | bridge SCORM |
| Acceso a cookies no-HttpOnly | Sí (mismo origen) | mismo origen |
| Acceso al `sesskey` | Sí (va en la URL de `track.php`, legible desde el DOM/JS) | `view.php:387-390` |
| Localiza formularios edición | Sí, si el DOM padre los tiene | mismo origen |
| Cambios reales | No demostrado (server valida `sesskey` + capability) | `track.php:40` |
| Mitigaciones | Sandbox parcial; `require_capability` en pluginfile; `require_sesskey` server-side | `lib.php:513-568`, `track.php:40` |
| Riesgos que quedan | XSS cross-component same-origin (riesgo residual) | — |
| Impacto de IA sin revisar | Alto: JS generado se ejecuta con el origen de Moodle | — |

Dependencias **duras** de same-origin (impiden quitar `allow-same-origin` sin reescribir el bridge):
1. El padre lee `iframe.contentDocument` para mapear `objectid` → `js/scorm_tracker.js:75-86` y `:151-154`.
2. El hijo (pipwerks) recorre `window.parent` buscando `window.API` → `assets/scorm/SCORM_API_wrapper.js:62-118`.
3. El *teacher-mode hider* inyecta CSS en `contentDocument` → `classes/local/ui/teacher_mode_hider.php:44-61`.

### 2.2 mod_exeweb (`60d24fb`) y mod_exescorm (`e985f4d`)

| Atributo | mod_exeweb | mod_exescorm |
|---|---|---|
| iframe | `embed_general.mustache:32-34` | `player.php:283-285` (noscript) |
| `sandbox` | **ninguno** | **ninguno** |
| HTML/JS arbitrario | Sí | Sí |
| Mismo origen | Sí | Sí |
| SCORM API walk | No (sin tracking) | Sí (`SCORM_API_wrapper.js:71-78,140-142`) |
| `sesskey` | — | URL param (`datamodels/scorm_12.js:19-24`) |
| CSP en pluginfile | No (`lib.php:448-512`) | No (`lib.php:1064-1142`) |
| teacher-mode hider | Sí (`locallib.php:90-107`) | — |

### 2.3 Moodle core: mod_scorm (`2104c372962`)

| Atributo | Valor | Cita |
|---|---|---|
| iframe del SCO | **sin `sandbox`** | `public/mod/scorm/player.php:279-285` |
| API discovery | `myFindAPI` recorre `win.parent` y `window.opener` | `loadSCO.php:113-122`, `:128-129` |
| `sesskey` | `confirm_sesskey()` antes de guardar | `datamodel.php:53` |
| Capability | `mod/scorm:savetrack` | `datamodel.php:56` |
| Mismo origen | Sí (`wwwroot/pluginfile.php`) | `locallib.php:2323,2327` |

**Veredicto:** mod_scorm corre HTML/JS no confiable **sin sandbox** — más débil que mod_exelearning. Su defensa es server-side (`sesskey` + capability), no aislamiento del cliente.

### 2.4 Moodle core: core_h5p / mod_h5pactivity (`2104c372962`)

| Atributo | Valor | Cita |
|---|---|---|
| iframe | `src="about:blank"` | `h5piframe.mustache:33` |
| Construcción | `contentDocument.write(...)` | `h5p.js:390-394` |
| Origen del contenido | **hereda el del padre (same-origin)** `[hecho]` | `h5p.js:391-394` (nota verificada) |
| HTML/JS arbitrario (parámetros) | **No**: `content.json` validado contra la semántica; `filter_xss` sin `<script>` ni `on*` | `h5p.classes.php:2260-2282` (`filterParameters`), `:4303-4384`, `:5033-5054` |
| HTML/JS de librería (`preloadedJs`) | **Sí**: código de confianza, `<script src=pluginfile.php/…/core_h5p>` *same-origin* y sin sandbox | `player.php:484-500`, `h5p.js:391-437` |
| Gate de instalación de librería | `moodle/h5p:updatelibraries` (arquetipo **manager**, `RISK_XSS`), evaluada contra quien sube; profesorado solo `h5p:deploy` | `lib/db/access.php`, `helper.php:210-224`, `api.php:403-405`, `h5p.classes.php:1577-1579` |
| Whitelist | Extensiones curadas (content + librería) | `framework.php:698-700` |
| postMessage handler | Valida `event.source===window.parent` y `event.data.context==='h5p'`; **no** valida `event.origin` | `embed.js:38-46`, `h5p.js:457-465` |
| postMessage envío | `targetOrigin = '*'` (origen-agnóstico) | `embed.js:64-73`, `h5p.js:484-493` |
| `$CFG->h5pcrossorigin` | CORS para media (img/audio/video), no para el iframe | `helper.php:383`, `config-dist.php:778-786` |

**Veredicto (matizado):** hay que distinguir dos planos. En los **parámetros** de contenido, H5P **no ejecuta HTML/JS de autor**: filtra el texto con `filter_xss` contra una lista cerrada de etiquetas sin `<script>` y descarta `on*` (`h5p.classes.php:4303-4384,:5033-5054`) — control negativo, más controlado por diseño que un `.elpx`. En el plano de las **librerías**, en cambio, **sí**: el `preloadedJs` de una librería es **código de confianza** que corre *same-origin* y sin sandbox (`player.php:484-500`, `h5p.js:391-437`); la barrera para que el autor introduzca su propia librería es la **capacidad** `moodle/h5p:updatelibraries` (gestión/administración, `RISK_XSS`), no el saneamiento — **mismo patrón que `mod_page`**. PoC: `poc/evil-h5p-library.h5p`; evidencia: `evidencias/resultados-h5p-library.json`. Además **no es inmune** por contenido: XSS documentados (MDL-67110, CVE-2024-43439 —XSS reflejado vía mensaje de error—, CVE-2024-3111 —stored XSS vía SVG—) y precedente de RCE por import de `.h5p` (CVE-2026-30875, Chamilo). Su `postMessage` no valida `event.origin` (mitiga con `event.source` + `context`), patrón a no copiar a ciegas.

**Acción privilegiada (Moodle, verificado en código):** el contenido same-origin (Página, .elpx, SCO) lee `window.M.cfg.sesskey` y puede invocar servicios web **AJAX** como `core_user_update_users` (`'ajax' => true`, cap `moodle/user:update`, `public/lib/db/services.php:1982-1989`) → si lo abre un usuario privilegiado, puede forjar la edición de una cuenta. La defensa es server-side (capacidad + validación), no ocultar el token.

### 2.5 Moodle core: mod_page + filtrado global (`2104c372962`)

| Atributo | Valor | Cita |
|---|---|---|
| Render | `format_text(..., noclean=true)` | `public/mod/page/view.php:90-93` |
| trusttext por defecto | `0` (desactivado) | `locallib.php:53` |
| ¿trusttext activo? | `!empty($CFG->enabletrusttext)` | `weblib.php:958-961` |
| ¿texto confiable? | activo **y** capability | `weblib.php:949-950` |
| Capability | `moodle/site:trustcontent` (`RISK_XSS`, solo profesor/manager) | `db/access.php:452-454` |
| `noclean` en salida | `$formatoptions->noclean = true` | `public/mod/page/lib.php:352` |
| `purify_html` (otros contextos) | HTMLPurifier quita `<script>` en texto **no** `noclean` | `weblib.php:1105-1107` |
| `enabletrusttext` por defecto | `0` (desactivado) | `public/admin/settings/security.php:68` |
| X-Frame-Options | `sameorigin` salvo `$CFG->allowframembedding` | `weblib.php:1604-1605` |
| CSP global | **ninguna por defecto** | `weblib.php` (NOT FOUND) |

**Veredicto (verificado en vivo):** en `mod_page`, `<script>` y `<img onerror>` **se
ejecutan** — `noclean=true` hace que `format_text` traduzca a `clean=false` y **no** pase por
HTMLPurifier. El filtrado `purify_html` aplica a otros campos de texto no confiable (sin
`noclean`), **no** a la salida de `mod_page`. La protección de `mod_page` es la **capacidad**
de crear/editar la Página (`mod/page:addinstance`; HTML confiable ligado a
`moodle/site:trustcontent`, `RISK_XSS`), no el saneado. `enabletrusttext=0` por defecto **no**
impide la ejecución porque `mod_page` usa `noclean`.

### 2.6 eXeLearning core / contenido exportado (`8101f54e`)

| Atributo | Valor | Cita |
|---|---|---|
| SCORM API walk | `window.parent` (≤500) + `win.top.opener`, sin validación de origen | `SCORM_API_wrapper.js:71-77`, `:136-141` |
| localStorage | clave `exeTeacherMode` (revela contenido de profesor) | `exe_export.js:100-130` |
| postMessage listener | valida `type`, **no** `event.origin` | `asset_url_resolver.js:905-906` |
| `eval()` | sí (callbacks de carga de script, tooltips, `onclick`) | `common.js:805,810,757`; `common_edition.js:39` |
| MathJax | **local empaquetado** (no CDN) | `common.js:26-115` |
| iframes exportados | **sin sandbox** | `asset_url_resolver.js:933-936` |
| Validación server-side | ninguna (HTML exportado es estático/self-contained) | — |

### 2.7 wp-exelearning — estable (`9eb07ff`) y modo seguro propuesto

> **Origen.** El comportamiento **estable** en `9eb07ff` es *same-origin* (fila `legacy`); las filas `secure` y el ajuste `exelearning_iframe_sandbox_mode` son la **propuesta de modificación de código** (prototipo), aún no adoptada *upstream*.

| Atributo | Valor | Cita |
|---|---|---|
| Modo iframe | ajuste `exelearning_iframe_sandbox_mode`: **`secure` (def.)** / `legacy`; helper único, *fail-safe* a `secure` | `includes/class-iframe-sandbox.php` |
| iframe (`secure`) | `sandbox="allow-scripts allow-popups"` (**sin** same-origin → opaco) + `referrerpolicy="no-referrer"` | `public/class-shortcodes.php` (`sandbox_tokens()`) |
| iframe (`legacy`) | `sandbox="allow-scripts allow-same-origin allow-popups"` (same-origin) | `class-iframe-sandbox.php` (`TOKENS_LEGACY`) |
| Teacher mode (`secure`) | server-side por la `src` (`exe-teacher`/`exe-teacher-toggler`), aplicado por el content proxy | `includes/class-content-proxy.php` |
| Content proxy | `permission_callback => '__return_true'` (lectura no autenticada por hash SHA1) | `includes/class-exelearning-rest-api.php:44-50` |
| Nonce en guardado | usa `permission_callback` (capability), no `wp_verify_nonce` | `rest-api.php:223` |
| Nonce en editor | `wp_verify_nonce` al cargar página | `class-exelearning-editor.php:111` |

### 2.8 omeka-s-exelearning — estable (`33faf89`) y modo seguro propuesto

> **Origen.** El comportamiento **estable** en `33faf89` es *same-origin* (fila `legacy`); las filas `secure` y el ajuste `exelearning_iframe_mode` son la **propuesta de modificación de código** (prototipo), aún no adoptada *upstream*.

| Atributo | Valor | Cita |
|---|---|---|
| Modo iframe | ajuste `exelearning_iframe_mode`: **`secure` (def.)** / `legacy`; helper único, *fail-safe* a `secure` | `src/Service/IframeSandbox.php` |
| iframe (`secure`) | `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"` (**sin** same-origin → opaco); **también en las dos vistas públicas** (antes fijadas a `allow-same-origin`) | `ExeLearningRenderer.php`, `view/.../public/*-show.phtml` |
| iframe (`legacy`) | añade `allow-same-origin` | `IframeSandbox::tokens()` |
| `src` | fijado por JS desde `window.location` (prefijo de base) | `ExeLearningRenderer.php` |
| CSRF | token **obligatorio** (rechaza vacío/nulo) | `src/Controller/CsrfValidationTrait.php:24-38` |
| postMessage | mixto: `editor.js:83` usa `'*'`; `omeka-exe-download.js:122-125` y `omeka-exe-bridge.js:46` usan origen específico | citas |

## 3. Mitigaciones emparejadas (riesgo → mitigación → limitación)

| Riesgo | Mitigación | Qué **no** resuelve |
|---|---|---|
| Lectura de cookies de sesión | `HttpOnly` + `SameSite=Strict` | No protege frente a XSS en el mismo origen ni a tokens expuestos en el DOM |
| Acceso al `parent` / mismo origen | iframe de origen opaco sin `allow-same-origin` (o `srcdoc`, o subdominio) | Rompe el bridge SCORM directo (`window.API`); exige bridge `postMessage` |
| Localización/envío de formularios con `sesskey`/nonce | Validación server-side del token por acción + capacidades mínimas | Si el server confía en el cliente, ocultar el token en el DOM no sirve |
| `postMessage` no validado | Allowlist cerrada + validación de `event.origin` **y** `event.source` | Una allowlist mal mantenida reabre la superficie |
| Ejecución de JS arbitrario | CSP restrictiva + `sandbox` sin `allow-same-origin` | El contenido legítimo que necesita JS (SCORM/H5P) exige arquitectura de bridge explícita |
| Navegación superior / popups | Omitir `allow-top-navigation` y `allow-popups-to-escape-sandbox` | Puede degradar UX de contenido legítimo que abre recursos externos |

**Principio rector:** la mitigación efectiva vive en el **servidor** y en las **cabeceras**, no en confiar en que el cliente "no encuentre" el token.

## 4. Tabla de concienciación (perfil no técnico)

| Riesgo detectado | Por qué importa | Mitigación | Limitación de la mitigación |
|---|---|---|---|
| El recurso puede leer la cookie de sesión | Permitiría suplantar al usuario autenticado | `HttpOnly` + `SameSite=Strict` | No cubre XSS en el mismo origen |
| El recurso accede al marco padre | Acceso al DOM autenticado del LMS | Origen opaco sin `allow-same-origin` | Rompe SCORM directo; exige bridge |
| El recurso localiza el `sesskey`/nonce | Primer paso para forzar acciones | Validación server-side por acción | Inútil si el server confía en el cliente |
| El recurso localiza formularios de edición | Permitiría crear/modificar contenido | Capacidades mínimas + validación server-side | Depende de la configuración de roles |
| `postMessage` sin validar origen/source | Canal de control no autenticado | Allowlist + validación `origin`/`source` | Allowlist mal mantenida reabre el hueco |
