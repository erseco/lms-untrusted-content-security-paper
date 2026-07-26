#!/usr/bin/env python3
"""Comprueba las invariantes de evil.elpx (paquete eXeLearning de 21 páginas).

Se ejecuta después de build.sh. Sale con 0 si el paquete cumple, con 1 y un
informe si no. Es el test de la tarea 18 (extendido en la tarea 24 para la
arquitectura de 19 páginas, en la tarea 25 para que cada página lleve varios
iDevices nativos, no uno solo, y de nuevo en la tarea 25 tras la corrección
del equipo: faltaba la página Inicio de la maqueta — 20 páginas, no 19; ahora
son 21 tras añadir el contraste de PDF remoto): no hay pytest en este
repositorio, así que la verificación es un script con
asertos explícitos. Si falla, el generador (exelib.py / spec.json) es lo que
hay que arreglar, no este script.

El content.xml que emite la CLI lleva namespace
(xmlns="http://www.intef.es/xsd/ode"); el de las páginas exportadas no lo
necesita porque son HTML, no XML.

Uso:
  python3 verify.py [../evil.elpx]
"""
import base64
import hashlib
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ELPX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "evil.elpx")
WEB = os.path.join(HERE, "..", "evil_web.zip")
SCORM = os.path.join(HERE, "..", "evil-scorm.zip")
OBSOLETE_EXESCORM = os.path.join(HERE, "..", "evil-exescorm.zip")
BUNDLE = os.path.join(HERE, "..", "probe", "dist", "probe.bundle.js")

# Misma fuente que exelib.py (medicion_shell_html) y help.js (CAPABILITIES):
# las diez filas de la tabla nativa del apartado 1, en orden.
with open(os.path.join(HERE, "..", "probe", "src", "core", "capabilities.json"), encoding="utf-8") as _f:
    CAPABILITIES = json.load(_f)

# --- el mapa de artículos de la tarea 25: página -> [(icon, título), …] -----
# Es justo lo que la tarea 24 se saltó: entonces cada página llevaba UN solo
# bloque "case" con un icono genérico. Esta lista es la prueba de que ya no:
# se compara tanto contra content.xml (la fuente) como contra el HTML
# exportado (el artefacto), en ese orden y con ese icono exactos. Cada tupla
# es un <article> de la maqueta de diseño
# (.superpowers/sdd/2026-07-25-exe-probe-suite/diseno-maqueta.html) hecho
# iDevice nativo, salvo "Aislamiento en esta página"/"Resultado de la medición"
# (el bloque "probe", que la maqueta no dibuja como artículo propio pero que
# la tarea 24 ya había separado en su propio iDevice).
PAGES = {
    # La página de aterrizaje de la maqueta (kind: 'inicio' en su NAV), que
    # la tarea 24 se había saltado. Lleva bloque "probe" con la vista de una
    # línea, aunque la maqueta no lo dibujara: index.html es lo que incrustan
    # en su iframe mod_exelearning, mod_exeweb, wp-exelearning y
    # omeka-s-exelearning, así que si la portada no midiera, la primera (y a
    # menudo única) pantalla que ve la plataforma no mediría nada. Se detectó
    # cuando el arnés de mod_exeweb dejó de leer __EXE_POC_RESULT al pasar
    # este paquete a ser también el evil.elpx.
    "Inicio": [
        ("objectives", "Para qué sirve este paquete"),
        ("roadmap", "Cómo está organizado"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "1. Resultado de la medición": [
        ("observe", "Qué mide este apartado"),
        ("experiment", "Resultado de la medición"),
    ],
    "2. Vídeos": [
        ("video", "2. Vídeos"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "2.1. Vídeo de YouTube": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Vídeo de YouTube"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "2.2. Vimeo y Dailymotion": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Vídeo de Vimeo y Dailymotion"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "2.3. Vídeo interactivo con archivo propio": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Vídeo local (control medido)"),
        ("experiment", "Aislamiento en esta página"),
        ("interactive", "Vídeo interactivo"),
    ],
    "2.4. Vídeo interactivo con YouTube": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Vídeo remoto (YouTube)"),
        ("experiment", "Aislamiento en esta página"),
        ("interactive", "Vídeo interactivo"),
    ],
    "3. Imágenes y archivos": [
        ("gallery", "3. Imágenes y archivos"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "3.1. Imagen enlazada de otro sitio": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Imagen enlazada"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "3.2. Imagen integrada en el paquete": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Imagen y fondo del paquete"),
        ("experiment", "Aislamiento en esta página"),
    ],
    # El cuarto bloque, "download", es el iDevice nativo download-source-file
    # (fix round de la tarea 25): jsonProperties vacío, htmlView copiado de
    # un-heroe-medieval-el-cid_elpx/content.xml — ver
    # download_source_file_idevice() en exelib.py.
    "3.3. PDF y fichero fuente": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Guía en PDF y fuente tipográfica"),
        ("download", "Descargar el paquete"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "3.4. PDF remoto": [
        ("info", "Qué se prueba aquí"),
        ("observe", "PDF remoto (Mozilla PDF.js)"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "4. Iframe genérico": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Página externa insertada"),
        ("experiment", "Aislamiento en esta página"),
    ],
    # Renombrado en el fix round de la tarea 25 ("5. Salida hacia la
    # plataforma" → "5. Escalada LMS/CMS"); la numeración de 5.1-5.5 no cambia.
    "5. Escalada LMS/CMS": [
        ("technology", "5. Escalada LMS/CMS"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "5.1. Moodle": [
        ("technology", "Qué se prueba aquí"),
        ("alert", "Acciones disponibles"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "5.2. WordPress": [
        ("technology", "Qué se prueba aquí"),
        ("alert", "Acciones disponibles"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "5.3. Omeka S": [
        ("technology", "Qué se prueba aquí"),
        ("alert", "Acciones disponibles"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "5.4. Nextcloud": [
        ("technology", "Qué se prueba aquí"),
        ("alert", "Acciones disponibles"),
        ("experiment", "Aislamiento en esta página"),
    ],
    # 5.5 no tiene "Acciones disponibles": el servidor genérico no ofrece
    # ninguna demo (generic.demos está vacío a propósito, ver
    # poc/probe/src/hosts/generic.js), así que no lleva bloque "actions".
    "5.5. Servidor genérico": [
        ("technology", "Qué se prueba aquí"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "6. Ejemplos de impacto": [
        ("stop", "Qué vería la persona usuaria"),
        ("experiment", "Aislamiento en esta página"),
    ],
    "7. Cómo interpretar los resultados": [
        ("think", "Cómo leer los resultados"),
        ("guide", "Medidas que corrigen el problema"),
        ("experiment", "Aislamiento en esta página"),
    ],
}

PAGE_COUNT = len(PAGES)  # 21

# Ya no hay excepción: las 21 páginas llevan sonda, Inicio incluida (ver el
# comentario junto a su entrada en PAGES). El conjunto se conserva porque las
# comprobaciones de VIEW/build id/bundle inline y el recuento de
# __EXE_POC_RESULT en content.xml siguen consultándolo.
PAGES_WITHOUT_PROBE = set()
PROBE_PAGE_COUNT = PAGE_COUNT - len(PAGES_WITHOUT_PROBE)  # 21

# Texto que debe aparecer en el HTML exportado de cada página, para comprobar
# que el contenido correcto acabó en la página correcta (no solo que el
# número y los icon/título de bloques cuadran). Cada página se identifica sin
# ambigüedad por su propio <h1 class="page-title">, así que este texto ya no
# necesita desambiguar nada — solo confirma contenido.
COMPANION = {
    "Inicio": "Es un banco de pruebas",
    "1. Resultado de la medición": "Todas las páginas de este paquete comparten una misma sonda",
    "2. Vídeos": "El vídeo es el recurso externo más habitual",
    "2.1. Vídeo de YouTube": "youtube-nocookie.com",
    "2.2. Vimeo y Dailymotion": "frame-ancestors",
    "2.3. Vídeo interactivo con archivo propio": "audita de verdad la vía de servido del plugin",
    "2.4. Vídeo interactivo con YouTube": "frame-no-bloqueado es la única afirmación honesta",
    "3. Imágenes y archivos": "cambia lo que el navegador permite",
    "3.1. Imagen enlazada de otro sitio": "sin copiarla al paquete",
    "3.2. Imagen integrada en el paquete": "vía de servido opaca del plugin",
    "3.3. PDF y fichero fuente": "fuente tipográfica declarada por la hoja de estilos",
    "3.4. PDF remoto": "permite fetch cross-origin mediante CORS",
    "4. Iframe genérico": "iDevice de texto y código incrustado",
    "5. Escalada LMS/CMS": "reúne las acciones propias de una plataforma concreta",
    "5.1. Moodle": "destino más frecuente de un paquete SCORM",
    "5.2. WordPress": "publicar materiales exportados como sitio web",
    "5.3. Omeka S": "repositorios y exposiciones digitales",
    "5.4. Nextcloud": "no estaba en la maqueta de diseño",
    "5.5. Servidor genérico": "sin capturar una sola pulsación de teclado ni enviar un solo byte",
    "6. Ejemplos de impacto": "voltear la página",
    "7. Cómo interpretar los resultados": "puede este contenido alcanzar la sesión de quien lo abre",
}

# Páginas "caso" (llevan un bloque caseIntro, con la tabla de lo esperado en
# modo seguro/legacy) frente a páginas "escape" (llevan un bloque
# escapeIntro, sin esa tabla).
CASE_PAGES = {
    "2.1. Vídeo de YouTube", "2.2. Vimeo y Dailymotion",
    "2.3. Vídeo interactivo con archivo propio", "2.4. Vídeo interactivo con YouTube",
    "3.1. Imagen enlazada de otro sitio", "3.2. Imagen integrada en el paquete",
    "3.3. PDF y fichero fuente", "3.4. PDF remoto", "4. Iframe genérico",
}

# Páginas con un bloque "actions": el marcador data-exe-probe-demo-host que
# mountInlineDemoHosts() (poc/probe/src/entry/probe.js) rellena en tiempo de
# ejecución con los botones reales de ese anfitrión (o de la vitrina, para
# "showcase"). 5.5 se comprueba aparte: no debe llevar ninguno.
HOST_PAGES = {
    "5.1. Moodle": "moodle",
    "5.2. WordPress": "wordpress",
    "5.3. Omeka S": "omeka",
    "5.4. Nextcloud": "nextcloud",
    "6. Ejemplos de impacto": "showcase",
}

# Tarea 26b: la maqueta de diseño proponía una cuarta acción de escalada por
# cada uno de estos tres subapartados (matricular, activar un plugin +
# crear una cuenta con privilegios, modificar metadatos + conceder un
# permiso) que el paquete decidió NO implementar como acción — measure() de
# poc/probe/src/hosts/{moodle,wordpress,omeka}.js las mide en su lugar
# (moodleEnrolReachable, wpPluginAdminReachable/wpUserCreateReachable,
# omekaMetadataEditReachable/omekaPermissionsReachable). La prosa de
# spec.json tiene que decirlo sin rodeos: qué se propuso, que el paquete
# mide si sería posible y que deliberadamente no lo hace, y por qué.
ESCALATION_MEASURE_PROSE = {
    "5.1. Moodle": [
        "matricular a la persona conectada en un curso ajeno",
        "deliberadamente no la ejecuta",
        "herramienta de escalada, no un instrumento de medición",
    ],
    "5.2. WordPress": [
        "activar un plugin ya instalado y crear una cuenta con permisos de administración",
        "deliberadamente no activa ningún plugin ni crea ninguna cuenta",
        "es una herramienta, no un instrumento",
    ],
    "5.3. Omeka S": [
        "modificar los metadatos de un ítem ya existente y conceder un permiso de colaboración",
        "deliberadamente no toca ningún ítem ni concede ningún permiso",
        "sería una herramienta, no un instrumento",
    ],
}

# Subpáginas reales, anidadas bajo su sección en la navegación — no
# hermanas planas — comprobado contra odeParentPageId en content.xml, no
# solo contra el anidamiento de spec.json (que ya lo tenía bien desde la
# tarea 24; lo que esto atrapa es que la CLI lo respete al re-exportar).
PARENT_OF = {
    "2.1. Vídeo de YouTube": "2. Vídeos",
    "2.2. Vimeo y Dailymotion": "2. Vídeos",
    "2.3. Vídeo interactivo con archivo propio": "2. Vídeos",
    "2.4. Vídeo interactivo con YouTube": "2. Vídeos",
    "3.1. Imagen enlazada de otro sitio": "3. Imágenes y archivos",
    "3.2. Imagen integrada en el paquete": "3. Imágenes y archivos",
    "3.3. PDF y fichero fuente": "3. Imágenes y archivos",
    "3.4. PDF remoto": "3. Imágenes y archivos",
    "5.1. Moodle": "5. Escalada LMS/CMS",
    "5.2. WordPress": "5. Escalada LMS/CMS",
    "5.3. Omeka S": "5. Escalada LMS/CMS",
    "5.4. Nextcloud": "5. Escalada LMS/CMS",
    "5.5. Servidor genérico": "5. Escalada LMS/CMS",
}

# Secciones-hub con índice de subapartados (childrenGrid en spec.json): cada
# tarjeta enlaza con exe-node:<pid>, que PageRenderer.replaceInternalLinks()
# resuelve a la ruta estática real en tiempo de exportación — se comprueba
# que esa ruta exista de verdad en el .elpx, no solo que el enlace se pintó.
SECTION_HUB_PAGES = {"2. Vídeos", "3. Imágenes y archivos", "5. Escalada LMS/CMS"}

# Vista que cada página pide a la sonda (window.__EXE_POC_VIEW). Solo el
# apartado 1 pide la tabla nativa ('medicion', fix round de la tarea 25: sin
# panel ni Shadow DOM — antes pedía 'completo'); el resto pide el resumen de
# una línea que remite a él (ver poc/probe/src/entry/probe.js:resolveView y
# exelib.py:probe_idevice).
def expected_view(page_title):
    return "medicion" if page_title == "1. Resultado de la medición" else "linea"


ASSET_BASENAMES = [
    "probe-embed.pdf",
    "probe-asset.svg",
    "probe-asset.css",
    "probe-asset.woff",
    "probe-local.mp4",
]

# El PDF anterior era un stub de 395 bytes sin contenido real; build_pdf.py
# genera ahora una guía de uso de verdad en cada build. 1000 bytes es un
# suelo cómodo por encima del stub y por debajo de lo que produce el texto
# real (~2 KB), sin acoplarse al conteo exacto de bytes de una frase que
# podría reescribirse.
PDF_MIN_BYTES = 1000

problems = []


def check(condition, message):
    if not condition:
        problems.append(message)


if not os.path.exists(ELPX):
    print(f"VERIFICACIÓN FALLIDA:\n - no existe {ELPX} (ejecuta build.sh primero)")
    sys.exit(1)

with open(BUNDLE, encoding="utf-8") as f:
    SOURCE_BUNDLE = f.read()

with zipfile.ZipFile(ELPX) as archive:
    names = archive.namelist()

    # --- assets propios del paquete, en algún content/resources/<id>/ -------
    # La imagen externa del Caso 3.1 (Example.jpg, Wikimedia Commons) NO está
    # aquí a propósito: es un enlace de verdad a otro servidor, nunca copiada
    # al paquete (ver exelib.py: media kind "externalImage").
    resource_names = {os.path.basename(n) for n in names if n.startswith("content/resources/")}
    for base in ASSET_BASENAMES:
        check(base in resource_names, f"falta el asset propio del paquete: {base}")

    # El PDF debe ser la guía de uso real que genera build_pdf.py, no el
    # stub de 395 bytes de compilaciones anteriores.
    pdf_entries = [n for n in names if n.endswith("/probe-embed.pdf") or n == "probe-embed.pdf"]
    check(len(pdf_entries) >= 1, "no se encontró probe-embed.pdf en el paquete")
    for entry in pdf_entries:
        size = archive.getinfo(entry).file_size
        check(
            size >= PDF_MIN_BYTES,
            f"{entry} tiene {size} bytes, se esperaban al menos {PDF_MIN_BYTES} (¿ha vuelto a ser el stub de 395?)",
        )

    # --- content.xml: namespace, 21 páginas, 2 interactive-video, tema base -
    content_xml = archive.read("content.xml").decode("utf-8")
    root = ET.fromstring(content_xml)
    ns = root.tag.split("}")[0] + "}" if "}" in root.tag else ""

    def T(tag):
        return ns + tag

    pages = [n.findtext(T("pageName")) for n in root.iter(T("odeNavStructure"))]
    check(len(pages) == PAGE_COUNT, f"se esperaban {PAGE_COUNT} páginas, hay {len(pages)}: {pages}")
    check(set(pages) == set(PAGES), f"los títulos de página no coinciden con PAGES: {set(pages) ^ set(PAGES)}")

    page_names = {
        nav.findtext(T("odePageId")): nav.findtext(T("pageName"))
        for nav in root.iter(T("odeNavStructure"))
    }

    # --- las subpáginas son hijas reales en la navegación, no hermanas ------
    #     planas: odeParentPageId, no solo el anidamiento de spec.json.
    parent_id_of = {
        nav.findtext(T("odePageId")): nav.findtext(T("odeParentPageId"))
        for nav in root.iter(T("odeNavStructure"))
    }
    for title, parent_title in PARENT_OF.items():
        pid = next((p for p, n in page_names.items() if n == title), None)
        check(pid is not None, f"no se encontró la página «{title}» para comprobar su anidamiento")
        if pid is None:
            continue
        actual_parent_id = parent_id_of.get(pid) or ""
        actual_parent_title = page_names.get(actual_parent_id, "")
        check(
            actual_parent_title == parent_title,
            f"«{title}» tiene como padre «{actual_parent_title or '(ninguno)'}», se esperaba «{parent_title}»",
        )
    for title in PAGES:
        if title in PARENT_OF:
            continue
        pid = next((p for p, n in page_names.items() if n == title), None)
        if pid is None:
            continue
        check(
            not parent_id_of.get(pid),
            f"«{title}» es de nivel superior pero tiene odeParentPageId={parent_id_of.get(pid)!r}",
        )

    blocks_by_page = {}
    for struct in root.iter(T("odePagStructure")):
        pid = struct.findtext(T("odePageId"))
        icon = struct.findtext(T("iconName")) or ""
        name = struct.findtext(T("blockName"))
        blocks_by_page.setdefault(pid, []).append((icon, name))

    # --- cada página tiene VARIOS iDevices, con el icono y el título del ----
    #     mapa de artículos — no un único bloque inyectado con icono
    #     genérico, que es justo la regresión de la tarea 24 que esto habría
    #     atrapado.
    for pid, actual_blocks in blocks_by_page.items():
        title = page_names.get(pid, pid)
        expected_blocks = PAGES.get(title)
        check(expected_blocks is not None, f"página inesperada en content.xml: «{title}»")
        if expected_blocks is None:
            continue
        check(
            len(actual_blocks) >= 2,
            f"la página «{title}» tiene solo {len(actual_blocks)} bloque(s): debería llevar varios iDevices, no uno inyectado",
        )
        check(
            actual_blocks == expected_blocks,
            f"la página «{title}» tiene los bloques {actual_blocks}, se esperaban {expected_blocks}",
        )

    # --- ninguna página repite el nombre de bloque en dos de sus bloques ----
    # Esto es justo lo que habría atrapado la regresión de la tarea 23: el
    # bloque "case" y el bloque "probe" (y, en los Casos 2.3/2.4, también
    # "interactiveVideo") caían los tres en el título de la página por no
    # llevar blockName propio, así que esa cabecera se veía duplicada (o
    # triplicada) en pantalla. Sigue funcionando igual con la arquitectura de
    # varios iDevices por página de la tarea 25.
    for pid, actual_blocks in blocks_by_page.items():
        block_names = [name for _icon, name in actual_blocks]
        dupes = sorted({n for n in block_names if block_names.count(n) > 1})
        check(
            not dupes,
            f"la página «{page_names.get(pid, pid)}» tiene bloques con el nombre repetido: {dupes}",
        )

    iv_components = [
        c for c in root.iter(T("odeComponent"))
        if c.findtext(T("odeIdeviceTypeName")) == "interactive-video"
    ]
    check(
        len(iv_components) == 2,
        f"se esperaban 2 componentes interactive-video, hay {len(iv_components)}",
    )

    # El iDevice nativo download-source-file (Caso 3.3, fix round de la tarea
    # 25): exactamente uno, jsonProperties vacío como en toda exportación
    # real (ver download_source_file_idevice() en exelib.py).
    dsf_components = [
        c for c in root.iter(T("odeComponent"))
        if c.findtext(T("odeIdeviceTypeName")) == "download-source-file"
    ]
    check(
        len(dsf_components) == 1,
        f"se esperaba 1 componente download-source-file, hay {len(dsf_components)}",
    )
    for c in dsf_components:
        jp = (c.findtext(T("jsonProperties")) or "").strip()
        check(jp in ("", "{}"), f"download-source-file debería llevar jsonProperties vacío, tiene {jp!r}")
        html_view = c.findtext(T("htmlView")) or ""
        check(
            "exe-package:elp" in html_view,
            "download-source-file no lleva el marcador exe-package:elp que la CLI resuelve al exportar",
        )

    theme = None
    for pref in root.iter(T("userPreference")):
        if pref.findtext(T("key")) == "theme":
            theme = pref.findtext(T("value"))
    check(theme == "base", f"el tema declarado en userPreferences es {theme!r}, se esperaba 'base'")

    # La sonda va codificada en un loader base64 dentro de un iDevice text
    # por página, Inicio incluida (ver
    # PAGES_WITHOUT_PROBE): 21 páginas -> 21 bloques de texto que contienen
    # __EXE_POC_RESULT (uno de los varios `text` por página; los demás son
    # los artículos de contenido y, en 2.3/2.4, el interactive-video, que no
    # es un `text`).
    probe_blocks_in_xml = 0
    for comp in root.iter(T("odeComponent")):
        if comp.findtext(T("odeIdeviceTypeName")) != "text":
            continue
        html_view = comp.findtext(T("htmlView")) or ""
        if 'data-exe-probe-loader="base64"' in html_view:
            probe_blocks_in_xml += 1
    check(
        probe_blocks_in_xml == PROBE_PAGE_COUNT,
        f"la sonda está inline en {probe_blocks_in_xml} bloques text de content.xml, se esperaban {PROBE_PAGE_COUNT}",
    )

    # --- el bundle en sí: publica __EXE_POC_RESULT, sin </script> literal ---
    check("__EXE_POC_RESULT" in SOURCE_BUNDLE, "el bundle no publica __EXE_POC_RESULT")
    check("</script>" not in SOURCE_BUNDLE, "el bundle contiene un </script> literal")
    check("avatarSwappedInDom" in SOURCE_BUNDLE, "el bundle no incluye el cambio inmediato del avatar del padre")
    check("3px solid #39ff77" in SOURCE_BUNDLE, "el bundle no incluye el resaltado verde del avatar")
    check("userinitials" in SOURCE_BUNDLE, "el bundle no cubre el avatar de iniciales de Moodle")
    check("data-exe-live-avatar" in SOURCE_BUNDLE, "el bundle no inyecta la imagen en el avatar de iniciales")
    check("course/section.php" in SOURCE_BUNDLE, "el bundle no conserva el wwwroot efímero de Moodle Playground")

    # --- las cinco demos de la vitrina de impacto viajan en el bundle -------
    for showcase_id in ("showcase-flip", "showcase-terminal", "showcase-login", "showcase-logo", "showcase-notice"):
        check(showcase_id in SOURCE_BUNDLE, f"el bundle no incluye la demo de la vitrina «{showcase_id}»")

    # --- cada página exportada: varios iDevides con su icon/título nativos, -
    #     cinta de identidad, VIEW correcto y bundle base64 BYTE A BYTE (no
    #     solo "está", sino que al decodificar es exactamente el mismo texto que
    #     poc/probe/dist/probe.bundle.js) ---------------------------------
    html_files = {n: archive.read(n).decode("utf-8") for n in names if n == "index.html" or n.startswith("html/")}
    check(
        len(html_files) >= PAGE_COUNT,
        f"se esperaban al menos {PAGE_COUNT} páginas HTML exportadas, hay {len(html_files)}",
    )

    # Cada página exportada lleva un único <h1 class="page-title"> — a
    # diferencia del <h2> que la arquitectura de la tarea 24 dibujaba dentro
    # del HTML de cada "case", este título es el que pinta la propia
    # plantilla del tema a partir de pageName, y no se repite en el menú de
    # navegación persistente (que usa <a>, no <h1 class="page-title">).
    page_title_re = re.compile(r'<h1 class="page-title">([^<]*)</h1>')
    # Un <article class="box"> por iDevice: su icono (cualquier profundidad
    # de "../" antes de theme/icons/) y su título nativo.
    box_re = re.compile(
        r'<div class="box-icon exe-icon">\s*<img src="[^"]*theme/icons/([a-z0-9_-]+)\.png"[^>]*>\s*</div>\s*'
        r'<h1 class="box-title">([^<]*)</h1>',
        re.S,
    )
    # Grupo 1: window.__EXE_POC_VIEW. Grupo 2: el bundle codificado. El
    # cargador carece deliberadamente de `>` en su texto para sobrevivir a
    # rutas de edición que lo convierten en `&gt;`.
    script_re = re.compile(
        r'window\.__EXE_POC_VIEW="(linea|completo|medicion)";</script>\s*'
        r'<script>window\.__EXE_POC_BUILD_ID="[0-9a-f]+";</script>\s*'
        r'<script data-exe-probe-loader="base64">'
        r'\(function\(\)\{var s=document\.createElement\("script"\);'
        r's\.textContent=atob\("([A-Za-z0-9+/=]+)"\);'
        r'\(document\.head\|\|document\.documentElement\)\.appendChild\(s\);s\.remove\(\);\}\)\(\);'
        r'</script>',
        re.S,
    )
    # Los diez huecos de la tabla nativa del apartado 1 (fix round de la
    # tarea 25): el HTML estático que exelib.py genera, antes de que la sonda
    # los rellene en tiempo de ejecución.
    medicion_row_re = re.compile(r'data-exe-probe-row="([a-zA-Z]+)"')
    # Tarjetas del índice de una sección-hub: href ya resuelto por
    # PageRenderer a una ruta estática (exe-node:<pid> ya no aparece en el
    # HTML exportado, solo en content.xml).
    section_card_re = re.compile(r'class="section-card" href="([^"]+)"')

    owner_of = {}
    for path, html in html_files.items():
        m = page_title_re.search(html)
        check(m is not None, f"{path}: no tiene <h1 class=\"page-title\">")
        if m:
            owner_of.setdefault(m.group(1), []).append(path)

    check(
        set(owner_of) == set(PAGES),
        f"los títulos de página exportados no coinciden con PAGES: {set(owner_of) ^ set(PAGES)}",
    )

    for title, paths in owner_of.items():
        check(len(paths) == 1, f"«{title}» es el page-title de {len(paths)} páginas exportadas: {paths}")
        if len(paths) != 1:
            continue
        path = paths[0]
        html = html_files[path]
        expected_blocks = PAGES[title]
        companion = COMPANION[title]

        actual_boxes = box_re.findall(html)
        check(
            len(actual_boxes) >= 2,
            f"{path} («{title}»): el HTML exportado tiene solo {len(actual_boxes)} caja(s) de iDevice, "
            "se esperaban varias — ¿ha vuelto a colapsar todo en un bloque inyectado?",
        )
        check(
            actual_boxes == expected_blocks,
            f"{path} («{title}»): las cajas exportadas son {actual_boxes}, se esperaban {expected_blocks}",
        )

        check(companion in html, f"{path}: falta «{companion}» en la página «{title}»")
        check(
            "RECURSO DE PRUEBA DE SEGURIDAD" in html,
            f"{path}: falta la cinta de identidad en la página «{title}»",
        )
        if title == "2.2. Vimeo y Dailymotion":
            check(
                "https://player.vimeo.com/video/76979871" in html,
                f"{path}: no contiene el vídeo oficial y embebible de Vimeo esperado",
            )
        if title == "3.4. PDF remoto":
            remote_pdf = "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf"
            check(
                html.count(remote_pdf) >= 2,
                f"{path}: el PDF remoto no aparece tanto en object[data] como en el enlace de respaldo",
            )
            check(
                'type="application/pdf"' in html
                and 'target="_blank"' in html
                and 'rel="noopener"' in html
                and "Abrir PDF remoto de Mozilla PDF.js en otra pestaña" in html,
                f"{path}: falta el object PDF o su enlace accesible de apertura",
            )
        if title in CASE_PAGES:
            check(
                "Esperado en modo seguro" in html,
                f"{path}: la página «{title}» es un caso y no declara el resultado esperado",
            )

        # --- apartado 6: las dos demos nuevas de la vitrina, mencionadas ----
        if title == "6. Ejemplos de impacto":
            check(
                "sustituir el logotipo de la institución" in html,
                f"{path}: falta la mención a «sustituir el logotipo de la institución» en «{title}»",
            )
            check(
                "aviso de mantenimiento falso" in html,
                f"{path}: falta la mención a «mostrar un aviso de mantenimiento falso» en «{title}»",
            )

        # --- 5.1-5.3: prosa de la tarea 26b — cuatro acciones de la maqueta
        # (matricular, activar un plugin, crear una cuenta con privilegios,
        # conceder un permiso de colaboración) que el paquete mide en vez de
        # ejecutar, con la razón dicha sin rodeos: una herramienta, no un
        # instrumento, por reversible que fuera. ------------------------------
        if title in ESCALATION_MEASURE_PROSE:
            for fragment in ESCALATION_MEASURE_PROSE[title]:
                check(
                    fragment in html,
                    f"{path}: falta la mención «{fragment}» en «{title}» (tarea 26b)",
                )
        if title == "5.1. Moodle":
            for fragment in (
                "avatar visible en el DOM padre",
                "borde verde",
                "actividad Foro",
                "curso actual",
            ):
                check(fragment in html, f"{path}: falta «{fragment}» en la explicación de la demo Moodle")

        # Hay que exigir el <div …> real que exelib.py emite, no una cadena
        # que pueda aparecer dentro del bundle codificado.
        if title in HOST_PAGES:
            marker = f'<div data-exe-probe-demo-host="{HOST_PAGES[title]}">'
            check(marker in html, f"{path}: falta el marcador {marker} en la página «{title}»")
        elif title == "5.5. Servidor genérico":
            check(
                "<div data-exe-probe-demo-host=" not in html,
                f"{path}: «{title}» no debería llevar botones de acción (el servidor genérico no tiene demos)",
            )

        if title in PAGES_WITHOUT_PROBE:
            check(
                "__EXE_POC_VIEW" not in html,
                f"{path}: «{title}» no debería llevar la sonda (ver PAGES_WITHOUT_PROBE)",
            )
            continue

        m = script_re.search(html)
        check(m is not None, f"{path}: no se encontró VIEW+BUILD_ID+loader base64 tras __EXE_POC_VIEW")
        if m:
            want_view = expected_view(title)
            check(
                m.group(1) == want_view,
                f"{path}: __EXE_POC_VIEW es {m.group(1)!r}, se esperaba {want_view!r} para «{title}»",
            )
            loader_body = m.group(0).split('data-exe-probe-loader="base64">', 1)[1].rsplit("</script>", 1)[0]
            check(
                not any(c in loader_body for c in "<>&"),
                f"{path}: el JavaScript del loader contiene <, > o & y puede convertirse en una entidad HTML",
            )
            try:
                decoded_bundle = base64.b64decode(m.group(2), validate=True).decode("utf-8")
            except Exception as exc:
                decoded_bundle = ""
                check(False, f"{path}: el loader base64 no decodifica: {exc}")
            check(
                decoded_bundle == SOURCE_BUNDLE,
                f"{path}: el bundle base64 no coincide byte a byte con probe/dist/probe.bundle.js",
            )

        # --- apartado 1: los diez huecos de la tabla nativa, sin panel -------
        if title == "1. Resultado de la medición":
            check(
                "data-exe-probe-medicion" in html and "data-exe-probe-verdict" in html,
                f"{path}: falta el contenedor nativo de la medición (data-exe-probe-medicion/-verdict)",
            )
            rows = medicion_row_re.findall(html)
            check(
                len(rows) == len(CAPABILITIES),
                f"{path}: la tabla nativa tiene {len(rows)} filas, se esperaban {len(CAPABILITIES)}: {rows}",
            )
            check(
                rows == [c["key"] for c in CAPABILITIES],
                f"{path}: las filas de la tabla nativa no siguen el orden de capabilities.json: {rows}",
            )
            check(
                html.count('class="probe-table__valor" data-exe-probe-valor') == len(CAPABILITIES),
                f"{path}: los diez valores técnicos no usan la clase visual probe-table__valor",
            )
            check(
                ".probe-table .probe-table__valor" in html
                and "font-family:ui-monospace" in html
                and "font-weight:600" in html
                and "background:#eef0f3" in html,
                f"{path}: falta el estilo monoespaciado, seminegrita y gris de los valores técnicos",
            )
            # La medición se emite OCULTA: si la sonda no corre, lo que queda
            # en pantalla es el aviso, no una tabla de guiones que se leería
            # como una medición vacía. Si esto se rompiera, el fallback dejaría
            # de existir sin que nada más lo delatara.
            check(
                "<div data-exe-probe-medido hidden>" in html,
                f"{path}: el bloque medido no se emite oculto (falta data-exe-probe-medido con hidden)",
            )
            # Los dos grupos de severidad, en el orden de capabilities.json.
            grupos = re.findall(r'<tbody data-exe-probe-grupo="([a-z]+)"', html)
            check(
                grupos == ["critica", "condicional"],
                f"{path}: los grupos de la tabla nativa son {grupos}, se esperaban ['critica', 'condicional']",
            )
            for titulo in ("ACCESO AL ANFITRIÓN", "CAPACIDADES PROPIAS DEL CONTENIDO"):
                check(
                    titulo in html,
                    f"{path}: falta el encabezado de grupo «{titulo}» en la tabla nativa",
                )
            # Tabla legible en dos columnas: «Propiedad y valor» (ancha) |
            # «Resultado». La ayuda ⓘ va en la fila siguiente a todo el
            # ancho (colspan=2); la propiedad técnica no es columna.
            check(
                "<th>Propiedad y valor</th>" in html,
                f"{path}: falta la cabecera «Propiedad y valor» en la tabla nativa",
            )
            check(
                "Resultado" in html and "probe-table__th-resultado" in html,
                f"{path}: falta la cabecera «Resultado» en la tabla nativa",
            )
            check(
                "Qué ha intentado el contenido" not in html,
                f"{path}: la tabla nativa aún usa la cabecera antigua de cuatro columnas",
            )
            check(
                "<th>Valor</th>" not in html,
                f"{path}: la tabla nativa aún separa Valor en su propia columna",
            )
            help_keys = re.findall(r'data-exe-probe-help="([a-zA-Z]+)"', html)
            check(
                help_keys == [c["key"] for c in CAPABILITIES],
                f"{path}: las cajas ⓘ no cubren las diez capacidades en orden: {help_keys}",
            )
            check(
                'colspan="2"' in html and "probe-table__help-row" in html,
                f"{path}: la ayuda ⓘ no se emite a todo el ancho (falta help-row colspan=2)",
            )
            for field in ("Qué mide", "Qué implica", "De qué protege el aislamiento", "Propiedad comprobada"):
                check(
                    field in html,
                    f"{path}: la ayuda desplegable no incluye «{field}»",
                )

        # --- las 21 páginas con sonda: el aviso de «no se ejecutó» ------------
        # Es el estado estático de la página, no un adorno: sin él, una página
        # cuyo script no llegue a correr queda muda y no se distingue de una
        # que midió y no encontró nada.
        #
        # Mismo cuidado que con data-exe-probe-demo-host más arriba: el bundle
        # inline de las 21 páginas contiene el literal JS
        # "data-exe-probe-noscript" (es la constante NOSCRIPT_ATTR de
        # medicion-view.js), así que buscar la subcadena a secas pasaría sola
        # aunque exelib.py dejara de emitir el aviso. Hay que exigir la
        # etiqueta real, con su clase.
        aviso_tag = (
            '<div class="probe-noscript" data-exe-probe-noscript>'
            if expected_view(title) == "medicion"
            else '<p class="probe-noscript" data-exe-probe-noscript>'
        )
        check(
            aviso_tag in html,
            f"{path} («{title}»): falta el aviso estático de que la sonda no se ejecutó ({aviso_tag})",
        )
        if expected_view(title) == "linea":
            check(
                "<div data-exe-probe-linea>" in html,
                f"{path} («{title}»): falta el contenedor del resumen de línea (data-exe-probe-linea)",
            )

        # --- secciones-hub: cada tarjeta del índice enlaza a un fichero real -
        if title in SECTION_HUB_PAGES:
            hrefs = section_card_re.findall(html)
            check(len(hrefs) >= 2, f"{path} («{title}»): el índice de subapartados tiene {len(hrefs)} tarjeta(s)")
            for href in hrefs:
                resolved = os.path.normpath(os.path.join(os.path.dirname(path), href)).replace(os.sep, "/")
                check(
                    resolved in names,
                    f"{path} («{title}»): la tarjeta hacia «{href}» resuelve a «{resolved}», que no existe en el paquete",
                )

    # --- los dos vídeos interactivos exportados: uno local, uno YouTube -----
    local_video_pages = [p for p, html in html_files.items() if 'href="../content/resources/' in html and ".mp4" in html]
    youtube_iv_pages = [
        p for p, html in html_files.items()
        if 'exe-interactive-video-file' in html and 'href="https://www.youtube.com/watch' in html
    ]
    check(len(local_video_pages) >= 1, "ninguna página exportada referencia el vídeo local por ruta relativa")
    check(len(youtube_iv_pages) >= 1, "ninguna página exportada tiene el iDevice interactive-video contra YouTube")

# Los ZIP de publicación se exportan desde la misma fuente por la CLI real:
# web no es una copia renombrada del .elpx y SCORM no es un SCO mínimo con
# content.xml injertado. Ambos conservan las 21 páginas y la demo Moodle.
check(not os.path.exists(OBSOLETE_EXESCORM), "evil-exescorm.zip es obsoleto: solo debe existir evil-scorm.zip")
if os.path.exists(ELPX) and os.path.exists(WEB):
    with open(ELPX, "rb") as source_file, open(WEB, "rb") as web_file:
        check(
            hashlib.sha256(source_file.read()).digest() != hashlib.sha256(web_file.read()).digest(),
            "web: evil_web.zip no puede ser una copia renombrada de evil.elpx",
        )
for artifact, kind in ((WEB, "web"), (SCORM, "SCORM")):
    check(os.path.exists(artifact), f"falta la exportación {kind}: {artifact}")
    if not os.path.exists(artifact):
        continue
    with zipfile.ZipFile(artifact) as archive:
        names = set(archive.namelist())
        check("content.xml" in names, f"{kind}: falta content.xml de eXeLearning")
        check("index.html" in names, f"{kind}: falta index.html")
        check("html/51-moodle.html" in names, f"{kind}: falta la página 5.1 Moodle")
        html_pages = [n for n in names if n == "index.html" or n.startswith("html/") and n.endswith(".html")]
        check(len(html_pages) == PAGE_COUNT, f"{kind}: se esperaban {PAGE_COUNT} páginas HTML, hay {len(html_pages)}")
        if "html/51-moodle.html" in names:
            moodle_html = archive.read("html/51-moodle.html").decode("utf-8")
            moodle_match = script_re.search(moodle_html)
            check(moodle_match is not None, f"{kind}: la página Moodle no incluye el loader de la sonda")
            moodle_bundle = ""
            if moodle_match:
                try:
                    moodle_bundle = base64.b64decode(moodle_match.group(2), validate=True).decode("utf-8")
                except Exception:
                    pass
            check("avatarSwappedInDom" in moodle_bundle, f"{kind}: la página Moodle no incluye el cambio al vuelo")
            check("3px solid #39ff77" in moodle_bundle, f"{kind}: la página Moodle no incluye el borde verde")
            check("data-exe-live-avatar" in moodle_bundle, f"{kind}: la página Moodle no cubre avatares de iniciales")
        if kind == "SCORM":
            check("imsmanifest.xml" in names, "SCORM: falta imsmanifest.xml")
            if "imsmanifest.xml" in names:
                manifest = archive.read("imsmanifest.xml").decode("utf-8")
                check("<schemaversion>1.2</schemaversion>" in manifest, "SCORM: el manifiesto no declara SCORM 1.2")
                check('href="html/51-moodle.html"' in manifest, "SCORM: el manifiesto no publica el SCO 5.1 Moodle")
        else:
            check("imsmanifest.xml" not in names, "web: contiene un manifiesto SCORM inesperado")

if problems:
    print("VERIFICACIÓN FALLIDA:")
    for p in problems:
        print(" -", p)
    sys.exit(1)

print("VERIFICACIÓN OK:", ELPX)
