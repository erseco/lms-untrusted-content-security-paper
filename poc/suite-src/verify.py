#!/usr/bin/env python3
"""Comprueba las invariantes de exe-probe-suite.elpx.

Se ejecuta después de build.sh. Sale con 0 si el paquete cumple, con 1 y un
informe si no. Es el test de la tarea 18 (extendido en la tarea 24 para la
arquitectura de 19 páginas, en la tarea 25 para que cada página lleve varios
iDevices nativos, no uno solo, y de nuevo en la tarea 25 tras la corrección
del equipo: faltaba la página Inicio de la maqueta — 20 páginas, no 19): no
hay pytest en este repositorio, así que la verificación es un script con
asertos explícitos. Si falla, el generador (exelib.py / spec.json) es lo que
hay que arreglar, no este script.

El content.xml que emite la CLI lleva namespace
(xmlns="http://www.intef.es/xsd/ode"); el de las páginas exportadas no lo
necesita porque son HTML, no XML.

Uso:
  python3 verify.py [../exe-probe-suite.elpx]
"""
import hashlib
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ELPX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "exe-probe-suite.elpx")
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
# iDevice nativo, salvo "Resumen de la sonda"/"Resultado de la medición"
# (el bloque "probe", que la maqueta no dibuja como artículo propio pero que
# la tarea 24 ya había separado en su propio iDevice).
PAGES = {
    # La página de aterrizaje de la maqueta (kind: 'inicio' en su NAV), que
    # la tarea 24 se había saltado. Sin bloque "probe": la maqueta no dibuja
    # un resumen de la sonda bajo isInicio, a diferencia de las otras 19
    # páginas — ver PAGES_WITHOUT_PROBE más abajo.
    "Inicio": [
        ("objectives", "Para qué sirve este paquete"),
        ("roadmap", "Cómo está organizado"),
    ],
    "1. Resultado de la medición": [
        ("observe", "Qué mide este apartado"),
        ("experiment", "Resultado de la medición"),
    ],
    "2. Vídeos": [
        ("video", "2. Vídeos"),
        ("experiment", "Resumen de la sonda"),
    ],
    "2.1. Vídeo de YouTube": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Vídeo de YouTube"),
        ("experiment", "Resumen de la sonda"),
    ],
    "2.2. Vimeo y Dailymotion": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Vídeo de Vimeo y Dailymotion"),
        ("experiment", "Resumen de la sonda"),
    ],
    "2.3. Vídeo interactivo con archivo propio": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Vídeo local (control medido)"),
        ("experiment", "Resumen de la sonda"),
        ("interactive", "Vídeo interactivo"),
    ],
    "2.4. Vídeo interactivo con YouTube": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Vídeo remoto (YouTube)"),
        ("experiment", "Resumen de la sonda"),
        ("interactive", "Vídeo interactivo"),
    ],
    "3. Imágenes y archivos": [
        ("gallery", "3. Imágenes y archivos"),
        ("experiment", "Resumen de la sonda"),
    ],
    "3.1. Imagen enlazada de otro sitio": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Imagen enlazada"),
        ("experiment", "Resumen de la sonda"),
    ],
    "3.2. Imagen integrada en el paquete": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Imagen y fondo del paquete"),
        ("experiment", "Resumen de la sonda"),
    ],
    # El cuarto bloque, "download", es el iDevice nativo download-source-file
    # (fix round de la tarea 25): jsonProperties vacío, htmlView copiado de
    # un-heroe-medieval-el-cid_elpx/content.xml — ver
    # download_source_file_idevice() en exelib.py.
    "3.3. PDF y fichero fuente": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Guía en PDF y fuente tipográfica"),
        ("download", "Descargar el paquete"),
        ("experiment", "Resumen de la sonda"),
    ],
    "4. Iframe genérico": [
        ("info", "Qué se prueba aquí"),
        ("observe", "Página externa insertada"),
        ("experiment", "Resumen de la sonda"),
    ],
    # Renombrado en el fix round de la tarea 25 ("5. Salida hacia la
    # plataforma" → "5. Escalada LMS/CMS"); la numeración de 5.1-5.5 no cambia.
    "5. Escalada LMS/CMS": [
        ("technology", "5. Escalada LMS/CMS"),
        ("experiment", "Resumen de la sonda"),
    ],
    "5.1. Moodle": [
        ("technology", "Qué se prueba aquí"),
        ("alert", "Acciones disponibles"),
        ("experiment", "Resumen de la sonda"),
    ],
    "5.2. WordPress": [
        ("technology", "Qué se prueba aquí"),
        ("alert", "Acciones disponibles"),
        ("experiment", "Resumen de la sonda"),
    ],
    "5.3. Omeka S": [
        ("technology", "Qué se prueba aquí"),
        ("alert", "Acciones disponibles"),
        ("experiment", "Resumen de la sonda"),
    ],
    "5.4. Nextcloud": [
        ("technology", "Qué se prueba aquí"),
        ("alert", "Acciones disponibles"),
        ("experiment", "Resumen de la sonda"),
    ],
    # 5.5 no tiene "Acciones disponibles": el servidor genérico no ofrece
    # ninguna demo (generic.demos está vacío a propósito, ver
    # poc/probe/src/hosts/generic.js), así que no lleva bloque "actions".
    "5.5. Servidor genérico": [
        ("technology", "Qué se prueba aquí"),
        ("experiment", "Resumen de la sonda"),
    ],
    "6. Ejemplos de impacto": [
        ("stop", "Qué vería la persona usuaria"),
        ("experiment", "Resumen de la sonda"),
    ],
    "7. Cómo interpretar los resultados": [
        ("think", "Cómo leer los resultados"),
        ("guide", "Medidas que corrigen el problema"),
        ("experiment", "Resumen de la sonda"),
    ],
}

PAGE_COUNT = len(PAGES)  # 20

# Inicio no lleva bloque "probe" (ver el comentario junto a su entrada en
# PAGES): las comprobaciones de VIEW/build id/bundle inline y el recuento de
# __EXE_POC_RESULT en content.xml se saltan solo para ella.
PAGES_WITHOUT_PROBE = {"Inicio"}
PROBE_PAGE_COUNT = PAGE_COUNT - len(PAGES_WITHOUT_PROBE)  # 19

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
    "4. Iframe genérico": "iDevice de texto y código incrustado",
    "5. Escalada LMS/CMS": "reúne las acciones propias de una plataforma concreta",
    "5.1. Moodle": "destino más frecuente de un paquete SCORM",
    "5.2. WordPress": "publicar materiales exportados como sitio web",
    "5.3. Omeka S": "repositorios y exposiciones digitales",
    "5.4. Nextcloud": "no estaba en la maqueta de diseño",
    "5.5. Servidor genérico": "sin capturar una sola pulsación de teclado ni enviar un solo byte",
    "6. Ejemplos de impacto": "voltear la página",
    "7. Cómo interpretar los resultados": "ha podido este contenido salir de su propio marco",
}

# Páginas "caso" (llevan un bloque caseIntro, con la tabla de lo esperado en
# modo seguro/legacy) frente a páginas "escape" (llevan un bloque
# escapeIntro, sin esa tabla).
CASE_PAGES = {
    "2.1. Vídeo de YouTube", "2.2. Vimeo y Dailymotion",
    "2.3. Vídeo interactivo con archivo propio", "2.4. Vídeo interactivo con YouTube",
    "3.1. Imagen enlazada de otro sitio", "3.2. Imagen integrada en el paquete",
    "3.3. PDF y fichero fuente", "4. Iframe genérico",
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

    # --- content.xml: namespace, 20 páginas, 2 interactive-video, tema base -
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

    # La sonda va inline en un iDevice text por página, salvo Inicio (ver
    # PAGES_WITHOUT_PROBE): 19 páginas -> 19 bloques de texto que contienen
    # __EXE_POC_RESULT (uno de los varios `text` por página; los demás son
    # los artículos de contenido y, en 2.3/2.4, el interactive-video, que no
    # es un `text`).
    probe_blocks_in_xml = 0
    for comp in root.iter(T("odeComponent")):
        if comp.findtext(T("odeIdeviceTypeName")) != "text":
            continue
        html_view = comp.findtext(T("htmlView")) or ""
        if "__EXE_POC_RESULT" in html_view:
            probe_blocks_in_xml += 1
    check(
        probe_blocks_in_xml == PROBE_PAGE_COUNT,
        f"la sonda está inline en {probe_blocks_in_xml} bloques text de content.xml, se esperaban {PROBE_PAGE_COUNT}",
    )

    # --- el bundle en sí: publica __EXE_POC_RESULT, sin </script> literal ---
    check("__EXE_POC_RESULT" in SOURCE_BUNDLE, "el bundle no publica __EXE_POC_RESULT")
    check("</script>" not in SOURCE_BUNDLE, "el bundle contiene un </script> literal")

    # --- las cinco demos de la vitrina de impacto viajan en el bundle -------
    for showcase_id in ("showcase-flip", "showcase-terminal", "showcase-login", "showcase-logo", "showcase-notice"):
        check(showcase_id in SOURCE_BUNDLE, f"el bundle no incluye la demo de la vitrina «{showcase_id}»")

    # --- cada página exportada: varios iDevides con su icon/título nativos, -
    #     cinta de identidad, VIEW correcto y bundle inline BYTE A BYTE (no
    #     solo "está", sino que es exactamente el mismo texto que
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
    # Grupo 1: window.__EXE_POC_VIEW. Grupo 2: el bundle, capturado entre el
    # <script> del build id y su cierre.
    script_re = re.compile(
        r'window\.__EXE_POC_VIEW="(linea|completo|medicion)";</script>\s*'
        r'<script>window\.__EXE_POC_BUILD_ID="[0-9a-f]+";</script>\s*'
        r'<script>(.*?)</script>',
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

        # Ojo: el bundle inline de CADA página contiene el literal JS
        # "data-exe-probe-demo-host" (es la constante que usa
        # mountInlineDemoHosts() para buscar el marcador), así que basta con
        # buscar la subcadena para encontrarla en las 19 páginas por
        # igual — hay que exigir el <div …> real que exelib.py emite.
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
        check(m is not None, f"{path}: no se encontró VIEW+BUILD_ID+bundle inline tras __EXE_POC_VIEW")
        if m:
            want_view = expected_view(title)
            check(
                m.group(1) == want_view,
                f"{path}: __EXE_POC_VIEW es {m.group(1)!r}, se esperaba {want_view!r} para «{title}»",
            )
            check(
                m.group(2) == SOURCE_BUNDLE,
                f"{path}: el bundle inline no coincide byte a byte con probe/dist/probe.bundle.js",
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

if problems:
    print("VERIFICACIÓN FALLIDA:")
    for p in problems:
        print(" -", p)
    sys.exit(1)

print("VERIFICACIÓN OK:", ELPX)
