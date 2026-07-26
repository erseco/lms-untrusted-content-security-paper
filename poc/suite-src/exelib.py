"""
Build a minimal, intermediate content.xml (zipped as .elp) from a simple JSON
spec. This is not a spec-complete ODE 2.0 document — it skips the DOCTYPE,
xmlns/version attributes, and odeId/odeVersionId/exe_version resources, and
uses older resource keys (odeVersionName, isDownload) that the eXeLearning
importer tolerates but its own exporter no longer produces. It only needs to
be good enough for that importer to round-trip it: build.sh feeds this .elp
into the real eXeLearning CLI (`make export-elpx`), which re-emits a proper,
spec-compliant content.xml as part of a real .elpx — that's what actually
becomes poc/evil.elpx.

Ported from erseco/talks (scripts/exe/exelib.py: `md` and `image` blocks, the
odeComponent/odePagStructure/odeNavStructure builders, the {{context_path}}
asset-binding mechanism) and extended with the block types this suite needs
that talks doesn't have. Task 25's premise: the design mockup
(.superpowers/sdd/2026-07-25-exe-probe-suite/diseno-maqueta.html) renders every
unit of content as an `<article>` — icon, `<h2>` title, body — which is a text
iDevice by another name. Task 24 had instead injected one big block of HTML
per page with a generic icon, so eXeLearning showed a single undifferentiated
box instead of several native iDevices. These block types render one
`<article>`'s worth of content each; the page's own icon+title (native to the
`text` iDevice, via block()'s `icon`/`block_name`) replaces what used to be a
hand-drawn `<h2>` inside the HTML:

  - "article": a free-form `text` iDevice for prose-only content — a list of
    paragraphs, plus an optional table, an optional ordered list, and an
    optional closing callout box. Covers the mockup's "medicion" intro
    article, the "seccion" hub-page article, and both "interpretar" articles.
  - "caseIntro": the first article of a "caso" page ("Qué se prueba aquí"):
    a paragraph plus the two-row secure/legacy expectation table.
  - "caseMedia": the second article of a "caso" page (icon "observe", a
    case-specific title): the case's media — reusing the same
    _render_media_item() this file already had — plus an optional
    attribution line for third-party media. Media items support
    "externalImage" alongside "image" and "externalPdf" alongside "pdf":
    the external variants keep a raw URL instead of binding a package asset
    through {{context_path}}. Images expose a real naturalWidth/complete
    signal; PDF objects only support the honest frame-no-bloqueado claim.
  - "escapeIntro": the first article of an "escape" page (5.1-5.5): a
    paragraph, plus — unless the page has no actions (5.5) — the static
    "ninguna acción se ejecuta sola" warning.
  - "actions": the second article of an "escape" page (5.1-5.4) and the
    single article of the "impacto" page (6): an intro paragraph plus a
    `<div data-exe-probe-demo-host="…">` marker. The probe bundle itself
    (poc/probe/src/entry/probe.js:mountInlineDemoHosts) finds that marker at
    runtime and mounts the real demo buttons there — the same demoBlock() UI,
    the same demo.run(), the same three-state chips the panel's Demostración
    tab uses. exelib.py never lists the actions' titles/descriptions itself:
    that would drift from the real adapters the moment one changes.
  - "probe": a `text` iDevice whose raw HTML is three <script> tags: the
    __EXE_POC_VIEW assignment ('linea' | 'completo', read from the block's
    own "view" field, default "linea"), the buildId assignment, and a base64
    loader for the probe bundle, read fresh from
    poc/probe/dist/probe.bundle.js on every run. The loader deliberately has
    no literal `>` in its JavaScript text: some eXe/Moodle editing paths
    serialize script text as HTML and turn arrow functions/operators into
    `&gt;`, breaking the whole probe before the avatar demo can run.
  - "interactiveVideo": a real `interactive-video` iDevice. Its htmlView and
    jsonProperties shapes are copied from two real eXeLearning packages
    (exelearning_5/test/fixtures/todos-los-idevices.elp and the user's
    campana-de-denuncia package) — see I18N_INTERACTIVE_VIDEO and
    SCORM_DEFAULT below, kept byte-identical to what the current CLI actually
    exports, and the local/YouTube distinction follows the exact rule the
    idevice's own runtime uses (idevices/interactive-video/interactive-video.js
    :getTypeAndId): a relative href becomes a local <video>, a youtube.com /
    youtu.be href becomes the YouTube player.

The identity ribbon ("RECURSO DE PRUEBA DE SEGURIDAD…") isn't its own article
in the mockup, so it isn't its own iDevice either: emit_page() prepends it to
the first text-based block of every page (see identity_strip()).

Spec shape (JSON): see spec.json alongside this file.

Only needs Python 3 stdlib plus the `markdown` package (for the "md" block
type, ported but unused by our own spec.json).
"""

import base64
import datetime
import hashlib
import html as _html
import json
import os
import shutil
import sys
import zipfile

def md_to_html(src):
    # Dependencia opcional: el spec canónico no usa bloques `md`, y utilidades
    # stdlib como render-medicion-fragment.py no deben necesitar instalarla.
    import markdown as _markdown
    return _markdown.markdown(src or "", extensions=["extra", "sane_lists", "nl2br"], output_format="html5")


def xesc(s):
    return _html.escape(s, quote=False)


_counter = 0
# ideviceId -> list of absolute source paths to copy into content/resources/<id>/.
# One idevice can carry more than one file (Caso 4/6 attaches its SVG, its CSS
# and its font to the same block, exactly as an author dragging three files
# into one text iDevice would).
ASSET_BINDINGS = {}


def nid():
    global _counter
    _counter += 1
    return f"SP{_counter:08d}"


def _resolve(spec_dir, path):
    return path if os.path.isabs(path) else os.path.join(spec_dir, path)


def _bind_asset(idv_id, spec_dir, relpath):
    ASSET_BINDINGS.setdefault(idv_id, []).append(_resolve(spec_dir, relpath))
    return os.path.basename(relpath)


# Map our human license tags to the exact strings eXeLearning's license picker
# recognises (so pp_license comes out "selected" in the export).
LICENSE_MAP = {
    "CC BY-SA 4.0": "creative commons: attribution - share alike 4.0",
    "creative commons: cc by-sa 4.0": "creative commons: attribution - share alike 4.0",
    "CC BY 4.0": "creative commons: attribution 4.0",
    "CC0 1.0": "creative commons: cc0 1.0",
    "unknown": "",
}


# --- capabilities.json: única fuente de las diez filas de la tabla nativa ---
# del apartado 1. El mismo fichero lo importa poc/probe/src/ui/help.js (JS)
# para las descripciones en lenguaje llano del panel; aquí se usa para
# construir el HTML estático (Propiedad + caja de ayuda con mide/implica/
# protege/doc y la propiedad técnica) — las columnas "Valor"/"Resultado" las
# rellena la sonda en tiempo de ejecución (poc/probe/src/ui/medicion-view.js).
def _load_capabilities():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "probe", "src", "core", "capabilities.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


CAPABILITIES = _load_capabilities()

# Misma base que poc/probe/src/ui/help.js:DOC_BASE — enlaces «Leer más» de la
# ayuda desplegable del apartado 1.
DOC_BASE = (
    "https://github.com/erseco/lms-untrusted-content-security-paper/blob/main/"
)


# --- hoja de estilos compartida, inyectada una sola vez vía pp_extraHeadContent
# (confirmado real: exelearning_5/src/shared/export/exporters/Html5Exporter.ts
# vuelca `meta.extraHeadContent` dentro de <head> en renderHead()). Reemplaza
# los `style="…"` repetidos que cada función de este módulo emitía antes: la
# presentación vive en un único sitio, con clases; el HTML que genera cada
# bloque solo lleva `style=` cuando el valor es genuinamente distinto por
# elemento (no hay ningún caso así en este módulo: hasta los colores del
# veredicto y del resultado de cada fila se aplican con clases desde JS,
# nunca con estilos en línea calculados en Python).
SUITE_CSS = """
.probe-identity{margin:0 0 12px;padding:8px 12px;background:#111;color:#ffdf5d;border-left:5px solid #ffdf5d;font:12px/1.4 system-ui,sans-serif}
.probe-p{margin:0 0 8px;font:12px/1.5 system-ui,sans-serif}
.probe-table{width:100%;border-collapse:collapse;font:12px/1.5 system-ui,sans-serif;margin:0 0 8px;table-layout:fixed}
.probe-table th{text-align:left;padding:8px 10px;border:1px solid #cccccc;background:#f2f2f2;font-weight:700}
.probe-table td{padding:8px 10px;border:1px solid #cccccc;vertical-align:top}
.probe-table th.probe-table__th-resultado,.probe-table td[data-exe-probe-resultado]{width:7.5rem;text-align:right;white-space:nowrap}
.probe-table td.mono,.probe-help__body dd.mono{font:11px ui-monospace,Menlo,monospace;color:#555}
.probe-table__line{display:flex;align-items:flex-start;gap:8px}
.probe-table__texto{flex:1;min-width:0}
.probe-table .probe-table__valor,.probe-table [data-exe-probe-valor]{margin-top:6px;display:inline-block;max-width:100%;box-sizing:border-box;padding:3px 7px;border-radius:4px;background:#eef0f3;border:1px solid #e0e4ea;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;font-weight:600;line-height:1.45;color:#3c434c;word-break:break-word}
.probe-help__btn{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;padding:0;border:1px solid #c9ced6;border-radius:50%;background:#fff;font:700 11px/15px system-ui,sans-serif;color:#3c434c;flex:0 0 auto;cursor:pointer;user-select:none}
.probe-help__btn[aria-expanded="true"]{background:#eef2f7;border-color:#aeb6c2}
.probe-table__help-row td{padding:0 10px 10px;background:#fafbfd;border-top:0}
.probe-help__body{margin:0;padding:7px 9px;background:#f7f9fc;border:1px dashed #cdd4de;font-size:11.5px;border-radius:4px}
.probe-help__body dt{font-weight:600;margin-top:4px}
.probe-help__body dt:first-child{margin-top:0}
.probe-help__body dd{margin:0 0 2px}
.probe-help__url{font-size:10.5px;color:#7a828c;word-break:break-all}
.probe-list{margin:0 0 8px;padding-left:20px;font:12px/1.5 system-ui,sans-serif}
.probe-list li{margin:0 0 6px}
.probe-callout{margin:8px 0 0;padding:10px 12px;border:1px solid #c9edf4;background:#e1f1f9;color:#2b627d;border-radius:6px;font:12px/1.5 system-ui,sans-serif}
.probe-warning{margin:0 0 8px;padding:10px 12px;border:1px solid #faebcc;background:#fcf8e3;color:#796034;border-radius:4px;font:12px/1.5 system-ui,sans-serif}
.probe-escape-warning{margin:10px 0 0;padding:10px 12px;border:1px solid #f3dadd;background:#fef0ef;color:#973c3b;border-radius:6px;font:12px/1.5 system-ui,sans-serif}
.probe-media{margin:0 0 12px}
.probe-media figcaption{font:12px system-ui,sans-serif}
.probe-media__frame{position:relative;max-width:640px;aspect-ratio:16/9}
.probe-media__frame iframe{width:100%;height:100%;border:0}
.probe-media__object{width:100%;max-width:640px;height:360px}
.probe-media__fallback{margin:6px 0 0;font:12px/1.5 system-ui,sans-serif}
.probe-media__img{width:160px;height:64px}
.probe-media__box{width:160px;height:64px;display:inline-block}
.probe-media__video{width:100%;max-width:480px}
.probe-verdict{border-left:4px solid #999;background:#f2f2f2;color:#333;border-radius:4px;padding:14px 18px;margin:0 0 14px}
.probe-verdict__title{margin:0 0 6px;font-size:1.05rem;font-weight:700}
.probe-verdict__text{margin:0;line-height:1.6}
.probe-verdict.is-aislado{border-left-color:#336634;background:#e5f3e0;color:#336634}
.probe-verdict.is-sin-aislamiento{border-left-color:#973c3b;background:#fef0ef;color:#973c3b}
.probe-verdict.is-parcial{border-left-color:#796034;background:#fcf8e3;color:#796034}
.probe-table td.is-alcanzado{color:#973c3b;font-weight:700}
.probe-table td.is-bloqueado{color:#336634;font-weight:700}
.probe-table td.is-condicional{color:#796034;font-weight:700}
.probe-table__group th{background:#e8e8e8;font-size:0.86rem;letter-spacing:0.02em}
.probe-table__glosa{font-weight:400;text-transform:none;letter-spacing:0;color:#555}
.probe-noscript{margin:0 0 12px;padding:12px 16px;border:1px solid #faebcc;background:#fcf8e3;color:#796034;border-radius:4px;font:12px/1.5 system-ui,sans-serif}
.probe-noscript__title{margin:0 0 6px;font-weight:700}
.probe-noscript__text{margin:0}
.section-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:8px}
.section-card{display:block;border:1px solid #dbdbdb;background:#fff;border-radius:8px;padding:14px 16px;color:#333;text-decoration:none}
.section-card:hover{border-color:#078e8e}
.section-card__label{display:block;color:#d76b4a;font-size:1.02rem;margin-bottom:4px}
.section-card__resumen{display:block;font-size:0.9rem;color:#666;line-height:1.5}
.action-card{border:1px solid #dbdbdb;background:#fff;border-radius:8px;padding:16px;margin-bottom:12px}
.action-card__row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.action-card__info{flex:1;min-width:260px}
.action-card__title{margin:0 0 4px;font-weight:700}
.action-card__desc{margin:0;font-size:0.92rem;color:#555;line-height:1.55}
.action-card__btn{border:1px solid #ccc;background:#fff;color:#555;border-radius:4px;padding:9px 16px;font-size:0.92rem;cursor:pointer;white-space:nowrap;font-family:inherit}
.action-card__btn:hover{border-color:#bbb;color:#000;box-shadow:2px 2px 4px #dbdbdb}
.action-card__status{margin:12px 0 0;font-size:0.9rem}
.action-card__pill{display:inline-block;padding:3px 10px;border-radius:4px}
.action-card__pill.st-idle{color:#7a828c}
.action-card__pill.st-run{color:#0b57d0}
.action-card__pill.st-good{color:#07601e;background:#e9f7ee}
.action-card__pill.st-bad{color:#8e0019;background:#fdeaec}
.action-card__pill.st-warn{color:#8a5600;background:#fff6e5}
.action-card__note{color:#666}
.action-card__request{margin:12px 0 6px;font-family:Monaco,'Courier New',monospace;font-size:12px;color:#555}
.action-card__response{margin:0;font-family:Monaco,'Courier New',monospace;font-size:12px;line-height:1.5;background:#112C4A;color:#E7ECF1;border-radius:8px;padding:16px 20px;overflow:auto;white-space:pre-wrap}
"""


def _component(idv_id, type_name, html_view, json_props):
    json_str = xesc(json.dumps(json_props, ensure_ascii=False))
    return (
        "<odeComponent>"
        "<odePageId>{page}</odePageId>"
        "<odeBlockId>{block}</odeBlockId>"
        f"<odeIdeviceId>{idv_id}</odeIdeviceId>"
        f"<odeIdeviceTypeName>{type_name}</odeIdeviceTypeName>"
        f"<htmlView>{xesc(html_view)}</htmlView>"
        f"<jsonProperties>{json_str}</jsonProperties>"
        "<odeComponentsOrder>1</odeComponentsOrder>"
        "<odeComponentsProperties>"
        "<odeComponentsProperty><key>identifier</key><value/></odeComponentsProperty>"
        "<odeComponentsProperty><key>visibility</key><value>true</value></odeComponentsProperty>"
        "<odeComponentsProperty><key>cssClass</key><value/></odeComponentsProperty>"
        "</odeComponentsProperties>"
        "</odeComponent>"
    )


def markdown_idevice(idv_id, md_source):
    rendered = md_to_html(md_source)
    inner = (
        '<div class="exe-markdown-template"><div class="markdownTextIdeviceContent">'
        f'<div class="exe-markdown-activity"><div class="markdown-body">{rendered}</div></div>'
        '</div></div>'
    )
    props = {
        "ideviceId": idv_id,
        "markdownTextarea": md_source,
        "markdownTextareaHtml": rendered,
        "markdownInfoDurationInput": "",
        "markdownInfoDurationTextInput": "Duración:",
        "markdownInfoParticipantsInput": "",
        "markdownInfoParticipantsTextInput": "Agrupar:",
        "markdownFeedbackInput": "Mostrar comentarios",
        "markdownFeedbackTextarea": "",
        "markdownFeedbackTextareaHtml": "",
    }
    return _component(idv_id, "markdown-text", inner, props)


def text_idevice(idv_id, raw_html):
    """A `text` iDevice whose body is HTML as-is — no Markdown pass. This is
    the shape Step 1's spike proved survives export with a <script> inside."""
    inner = (
        '<div class="exe-text-template"><div class="textIdeviceContent">'
        f'<div class="exe-text-activity"><div>{raw_html}<p class="clearfix"> </p></div></div>'
        '</div></div>'
    )
    props = {
        "ideviceId": idv_id,
        "textInfoDurationInput": "",
        "textInfoDurationTextInput": "Duración:",
        "textInfoParticipantsInput": "",
        "textInfoParticipantsTextInput": "Agrupar:",
        "textTextarea": raw_html,
        "textFeedbackInput": "Mostrar comentarios",
        "textFeedbackTextarea": "",
    }
    return _component(idv_id, "text", inner, props)


def image_idevice(idv_id, img_basename, caption=""):
    # eXeLearning registers the image in the media library when it lives under a
    # folder named after the owning iDevice id and is referenced via context_path.
    cap = xesc(caption)
    img_html = (
        f'<p style="text-align:center;margin:0;">'
        f'<img src="{{{{context_path}}}}/{idv_id}/{img_basename}" alt="{cap}" '
        f'style="max-width:100%;height:auto;display:block;margin:0 auto;" /></p>'
    )
    if caption:
        img_html += f'<p style="text-align:center;font-size:.85em;color:#555;margin:.4em 0 0;">{cap}</p>'
    return text_idevice(idv_id, img_html)


# --- interactive-video: shape copied from a real CLI export -----------------
#
# Extracted verbatim from campana-de-denuncia/content.xml (an eXeLearning 5.x
# export, current CLI) rather than from
# exelearning_5/test/fixtures/todos-los-idevices.elp, whose content.xml has no
# xmlns and is an older/legacy shape kept for importer-compatibility testing,
# not what the current exporter produces. i18n and scorm are the exact blocks
# the idevice's own JS expects; do not rename or trim keys.
I18N_INTERACTIVE_VIDEO = {
    "start": "Inicio",
    "results": "Resultados",
    "slide": "Diapositiva (fotograma)",
    "score": "Puntuación",
    "seen": "Visto",
    "total": "Total",
    "seeAll": "debe ver todo el contenido y contestar a las preguntas",
    "noSlides": "El vídeo no tiene contenidos interactivos.",
    "goOn": "Continuar",
    "error": "Error",
    "dataError": "Código no compatible",
    "onlyOne": "Sólo un vídeo interactivo por página.",
    "cover": "Portada",
    "fsWarning": "Salga del modo pantalla completa (tecla Esc) para ver la diapositiva",
    "right": "¡Correcto!",
    "wrong": "Incorrecto",
    "sortableListInstructions": "Pinche y arrastre o use las flechas.",
    "up": "Subir",
    "down": "Bajar",
    "rightAnswer": "Respuesta correcta:",
    "notAnswered": "Por favor termine la actividad",
    "check": "Comprobar",
    "newWindow": "Ventana nueva",
    "msgOnlySaveAuto": "Su puntuación se guardará después de cada pregunta. Sólo puede jugar una vez.",
    "msgSaveAuto": "Su puntuación se guardará automáticamente después de cada pregunta.",
    "msgYouScore": "Su puntuación",
    "msgScoreScorm": "La puntuación no se puede guardar porque esta página no forma parte  de un paquete SCORM.",
    "msgYouLastScore": "La última puntuación guardada es",
    "msgActityComply": "Ya ha realizado esta actividad.",
    "msgPlaySeveralTimes": "Puede realizar esta actividad cuantas veces quiera",
    "msgEndGameScore": "Antes de guardar la puntuación comience la partida.",
    "msgSeveralScore": "Puede guardar la puntuación tantas veces como quiera",
    "msgOnlySaveScore": "¡Sólo puede guardar la puntuación una vez!",
    "msgOnlySave": "Sólo puede guardar una vez",
}

SCORM_DEFAULT = {"isScorm": 0, "textButtonScorm": "Guardar la puntuación", "repeatActivity": False}


def interactive_video_idevice(idv_id, href, href_text, slides):
    """A real `interactive-video` iDevice. `href` is either a YouTube watch
    URL (cross-origin case) or a `{{context_path}}/<id>/<file>` reference to a
    package asset (local-video case) — the idevice's own JS
    (getTypeAndId) tells the two apart by whether the href looks like an
    absolute http(s) URL or a relative path, so this function doesn't need to
    say which case it is."""
    data = {
        "slides": slides,
        "title": "",
        "description": "",
        "coverType": "text",
        "i18n": I18N_INTERACTIVE_VIDEO,
        "scorm": SCORM_DEFAULT,
        "scoreNIA": False,
        "evaluation": False,
        "evaluationID": "",
        "ideviceID": idv_id,
    }
    embedded_json = json.dumps(data, ensure_ascii=False)
    html_view = (
        f'<div class="game-evaluation-ids js-hidden" data-id="{idv_id}" '
        f'data-evaluationb="false" data-evaluationid=""></div>\t\t\t'
        f'<div class="exe-interactive-video">\t\t\t\t'
        f'<p id="exe-interactive-video-file" class="js-hidden">\t\t\t\t\t'
        f'<a href="{href}">{xesc(href_text)}</a>\t\t\t\t</p>\t\t\t\t'
        f'<script id="exe-interactive-video-contents" type="application/json">'
        f'{embedded_json}</script>\t\t\t</div>'
    )
    return _component(idv_id, "interactive-video", html_view, data)


# --- download-source-file: shape copied from a real CLI export --------------
#
# The idevice's own edition JS (exelearning_5/public/files/perm/idevices/base/
# download-source-file/edition/download-source-file.js) is the authoritative
# source for its jsonProperties shape — it has none: the idevice is pure
# HTML, no re-editable JSON data, `<jsonProperties/>` in every real export.
# htmlView below is copied verbatim (field order, classes, the two literal
# placeholders download="exe-package:elp-name"/href="exe-package:elp") from
# exelearning_5/test/fixtures/export/un-heroe-medieval-el-cid/
# un-heroe-medieval-el-cid_elpx/content.xml, the one real fixture that uses
# this idevice.
#
# Those two `exe-package:elp` placeholders are not filenames — they're a
# protocol the CLI's exporter recognises (constants.ts: ELPX_DOWNLOAD_ONCLICK,
# PageRenderer.ts) and rewrites into a client-side handler
# (libs/exe_elpx_download, bundled into the export automatically once any
# page carries this idevice). That handler reads window.__ELPX_MANIFEST__ (a
# list of files the export wrote) and re-zips them in the browser into a
# downloadable .elpx at click time — the export re-bundling itself, not a
# separately authored source file.
#
# exportSource and this idevice are UNRELATED, verified directly against
# ElpxExporter.ts (the exporter our own `make export-elpx FORMAT=elpx`
# actually runs — Html5Exporter.ts, its parent class, is a different format
# ("_web") and gates content.xml on exportSource, which is what misled an
# earlier version of this comment). In ElpxExporter.ts the manifest list is
# built and written to libs/elpx-manifest.js (lines ~331-343) BEFORE
# content.xml/the DTD are added (lines ~379-382) — and those two calls go
# straight to `this.zip.addFile(...)`, the raw zip API, never through the
# local `addFile()` wrapper that also pushes onto the manifest list. So
# content.xml is NEVER in window.__ELPX_MANIFEST__ for an .elpx build,
# regardless of exportSource: confirmed empirically too — the manifest this
# generator's own build.sh produces lists 200 files, none of them
# content.xml or content.dtd. exportSource still matters for a different
# reason (it's what makes content.xml exist in THIS package's own root at
# all, the one build.sh writes to disk — already unconditionally true here),
# but it has no effect on what the in-page download button reconstructs.
# Practical upshot: the outer evil.elpx that ships is fully
# re-importable; the ZIP this iDevice's own button re-assembles client-side,
# from inside a running page, is not — it is missing content.xml and the
# DTD, so eXeLearning could not re-import it. That is a property of
# eXeLearning's own ElpxExporter, not of this generator: nothing in
# spec.json/exelib.py can add a file to a manifest that the exporter itself
# finalises before this idevice's htmlView is even in the picture.
def download_source_file_idevice(idv_id, spec):
    title = spec.get("title") or "-"
    description = spec.get("subtitle") or "-"
    author = spec.get("author") or "-"
    pp_license = LICENSE_MAP.get(spec.get("license", ""), spec.get("license", ""))
    license_cell = _download_license_cell(pp_license)
    html_view = (
        '<div class="exe-download-package-instructions"><table class="exe-table">'
        "<caption>Información general sobre este recurso educativo</caption>"
        "<tbody>"
        f"<tr><th>Título</th><td>{xesc(title)}</td></tr>"
        f"<tr><th>Descripción</th><td>{xesc(description)}</td></tr>"
        f"<tr><th>Autoría</th><td>{xesc(author)}</td></tr>"
        f"<tr><th>Licencia</th><td>{license_cell}</td></tr>"
        "</tbody></table>"
        '<p style="text-align: center;">Este contenido fue creado con '
        '<a href="http://exelearning.net/">eXeLearning</a>, el editor libre y de fuente abierta '
        "diseñado para crear recursos educativos.</p>"
        '<p style="text-align: center;">Si desea descargar el fichero fuente, pulse en el siguiente '
        "enlace:</p></div>"
        '<p class="exe-download-package-link">'
        '<a download="exe-package:elp-name" href="exe-package:elp">Descargar el fichero .elp</a></p>'
    )
    return _component(idv_id, "download-source-file", html_view, {})


# Mismo mapeo licencia->enlace CC que trae la propia edition JS del idevice
# (completeLicense()), reducido a las licencias que LICENSE_MAP conoce. Sin
# licencia declarada en spec.json, "-" — igual que el propio iDevice cuando
# la propiedad del proyecto está vacía.
_DOWNLOAD_LICENSE_CC = {
    "creative commons: attribution 4.0": ("by/4.0", "BY 4.0"),
    "creative commons: attribution - share alike 4.0": ("by-sa/4.0", "BY-SA 4.0"),
}


def _download_license_cell(pp_license):
    if not pp_license:
        return "-"
    if pp_license == "creative commons: cc0 1.0":
        return (
            '<a href="https://creativecommons.org/publicdomain/zero/1.0/" rel="license" '
            'class="cc cc-0"><span></span>Creative Commons CC0 1.0</a>'
        )
    mapped = _DOWNLOAD_LICENSE_CC.get(pp_license)
    if not mapped:
        return xesc(pp_license)
    slug, label = mapped
    css = "cc cc-" + slug.split("/")[0]
    return (
        f'<a href="https://creativecommons.org/licenses/{slug}/" rel="license" class="{css}">'
        f"<span></span>Creative Commons {label}</a>"
    )


# --- probe suite's own case scaffolding --------------------------------------

def identity_strip(build_id, build_date):
    return (
        '<div class="probe-identity">'
        "<strong>RECURSO DE PRUEBA DE SEGURIDAD</strong> — no es material didáctico real."
        f"<br>build {build_id} · {build_date} · sha256:{build_id}"
        "</div>"
    )


# --- primitivas de párrafo/tabla/callout, compartidas por los renderizadores
# de artículo de más abajo. Ninguna emite un <h2>: el título del artículo lo
# lleva ya el propio iDevice nativo (icon/block_name en block()), así que
# repetirlo aquí dentro duplicaría lo que eXeLearning ya pinta solo. Todo el
# estilo viene de SUITE_CSS (inyectada vía pp_extraHeadContent) — nada aquí
# lleva `style=`, porque nada de esto es un valor calculado por elemento.

def _para(text):
    return f'<p class="probe-p">{xesc(text)}</p>'


def _table(headers, rows):
    head = "".join(f'<th>{xesc(h)}</th>' for h in headers)
    body = "".join(
        "<tr>" + "".join(f'<td>{xesc(c)}</td>' for c in row) + "</tr>"
        for row in rows
    )
    return f'<table class="probe-table"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


def _callout(text):
    return f'<div class="probe-callout">{xesc(text)}</div>'


# Artículo 1 de una página "caso" (2.1-2.4, 3.1-3.4, 4): título estático "Qué
# se prueba aquí" (icon "info"), tal y como lo pinta la maqueta para todo caso
# — el título que SÍ cambia por caso (p. ej. "2.1. Vídeo de YouTube") ya es el
# título de la propia página, no el de este artículo. `lead` es la cinta de
# identidad, pasada por emit_page() solo cuando este es el primer bloque de
# la página (ver identity_strip más arriba).
def case_intro_idevice(idv_id, case, lead=""):
    html = lead + _para(case["what"]) + _table(
        ["Esperado en modo seguro", "Esperado en modo legacy"],
        [[case["secure"], case["legacy"]]],
    )
    return text_idevice(idv_id, html)


# Artículo 2 de una página "caso": la media del caso (icon "observe" fijo en
# la maqueta, título específico del caso). Reutiliza _render_media_item, que
# necesita el idv_id ya asignado — por eso este helper vive después de él, no
# antes, aunque se invoque desde emit_page() en el mismo orden que case_intro.
# Nunca es el primer bloque de la página (case_intro siempre lo precede), así
# que no lleva parámetro `lead`.
def case_media_idevice(idv_id, spec_dir, case):
    parts = []
    if case.get("assetsCss"):
        base = _bind_asset(idv_id, spec_dir, case["assetsCss"])
        parts.append(f'<link rel="stylesheet" href="{{{{context_path}}}}/{idv_id}/{base}">')
    for relpath in case.get("extraAssets", []):
        _bind_asset(idv_id, spec_dir, relpath)
    for item in case.get("media", []):
        parts.append(_render_media_item(item, idv_id, spec_dir))
    if case.get("attribution"):
        parts.append(_para("Atribución: " + case["attribution"]))
    return text_idevice(idv_id, "".join(parts))


# Aviso estático de la maqueta (línea 277 de diseno-maqueta.html), igual en
# los cinco subapartados 5.1-5.5 que sí ofrecen acciones. 5.5 (servidor
# genérico) no tiene botones — measure() mide sus tres capacidades solas,
# nunca las intenta — así que su escapeIntro se construye con warn=False.
ESCAPE_WARNING = (
    '<div class="probe-escape-warning">'
    "<strong>Ninguna acción se ejecuta sola.</strong> Cada botón actúa de verdad sobre la plataforma "
    "en la que esté publicado este paquete y solo debe pulsarse en una instalación de pruebas propia. "
    "Todas las acciones son reversibles y su estado queda anotado bajo cada una.</div>"
)


# Artículo 1 de una página "escape" (5.1-5.5): título estático "Qué se prueba
# aquí" (icon "technology" en la maqueta).
def escape_intro_idevice(idv_id, what, warn=True, lead=""):
    html = lead + _para(what) + (ESCAPE_WARNING if warn else "")
    return text_idevice(idv_id, html)


# Artículo 2 de una página "escape" con acciones (5.1-5.4), y también el
# único artículo de la página "impacto" (6, "Qué vería la persona usuaria"):
# la maqueta las funde en un solo artículo porque son la misma cosa —
# intro + lista de acciones — así que un solo tipo de bloque cubre ambas
# (y en el caso de 6, es además el primer bloque de la página, de ahí `lead`).
# No lista aquí los títulos/descripciones de cada acción: eso vive en
# poc/probe/src/hosts/*.js (demo.label, demo.help.intenta), y
# mountInlineDemoHosts() los lee de ahí en tiempo de ejecución al encontrar
# el marcador. Listarlos también en spec.json los duplicaría, y duplicado es
# justo lo que se desincroniza la próxima vez que alguien cambie una demo.
def actions_idevice(idv_id, intro, host, lead=""):
    html = lead + _para(intro) + f'<div data-exe-probe-demo-host="{xesc(host)}"></div>'
    return text_idevice(idv_id, html)


# Bloque de prosa libre: cubre el artículo de "medicion" (1), el de cada
# "seccion" (2, 3, 5) y los dos de "interpretar" (7). "paragraphs" es la
# única clave obligatoria; "table"/"list"/"callout" son huecos opcionales que
# cada artículo usa según lo que la maqueta le puso. `grid_html`, cuando lo
# hay, es el índice de subapartados de una sección-hub (children_grid_html,
# más abajo) — la maqueta lo pinta dentro del MISMO <article> que el icono,
# el título y el párrafo de intro, no como un artículo aparte.
def article_idevice(idv_id, art, lead="", grid_html=""):
    parts = [lead] + [_para(p) for p in art.get("paragraphs", [])]
    if art.get("table"):
        parts.append(_table(art["table"]["headers"], art["table"]["rows"]))
    if art.get("list"):
        items = "".join(f'<li>{xesc(i)}</li>' for i in art["list"])
        parts.append(f'<ol class="probe-list">{items}</ol>')
    if art.get("callout"):
        parts.append(_callout(art["callout"]))
    if grid_html:
        parts.append(grid_html)
    return text_idevice(idv_id, "".join(parts))


# Índice de subapartados de una sección-hub (2, 3, 5): una tarjeta por hijo,
# con un enlace exe-node:<pid> real — el protocolo nativo de eXeLearning para
# enlaces internos (exelearning_5/src/shared/export/renderers/PageRenderer.ts
# :replaceInternalLinks lo resuelve contra el pid real de cada página en
# tiempo de exportación, la misma resolución que usa la navegación generada
# por la propia CLI), no una ruta de archivo adivinada. `children` y
# `child_pids` van en el mismo orden: emit_page() reserva los pids de los
# hijos antes de construir este bloque, precisamente para que este enlace
# pueda existir.
def children_grid_html(children, child_pids):
    cards = "".join(
        f'<a class="section-card" href="exe-node:{xesc(pid)}">'
        f'<span class="section-card__label">{xesc(child["title"])}</span>'
        f'<span class="section-card__resumen">{xesc(child.get("cardSummary", ""))}</span>'
        "</a>"
        for child, pid in zip(children, child_pids)
    )
    return f'<div class="section-grid">{cards}</div>'


def _warning_box(text):
    # Ámbar, distinto tanto del callout azul informativo (_callout) como del
    # aviso rojo de "ninguna acción se ejecuta sola" (ESCAPE_WARNING): es el
    # tercer color de aviso de la maqueta, el que usa el artículo "Para qué
    # sirve este paquete" de Inicio (línea 80 de diseno-maqueta.html,
    # #FCF8E3/#FAEBCC/#796034).
    return f'<div class="probe-warning">{text}</div>'


# El único artículo de la maqueta cuyos huecos van intercalados en vez de ir
# todos al final (dos párrafos, luego el aviso ámbar, luego un tercer
# párrafo): "Para qué sirve este paquete", primer artículo de Inicio. Por eso
# no encaja en article_idevice() (que siempre cierra con
# tabla/lista/callout) y se queda como su propio renderizador, con la
# `<strong>` inicial del aviso ya resuelta aquí en vez de en spec.json.
def intro_idevice(idv_id, lead_paragraphs, warning_strong, warning_rest, tail_paragraph, lead=""):
    parts = [lead] + [_para(p) for p in lead_paragraphs]
    parts.append(_warning_box(f"<strong>{xesc(warning_strong)}</strong> {xesc(warning_rest)}"))
    if tail_paragraph:
        parts.append(_para(tail_paragraph))
    return text_idevice(idv_id, "".join(parts))


# El segundo artículo de Inicio, "Cómo está organizado": la tabla Apartado /
# Qué encontrará de la maqueta (línea 90-108), pero sus filas NO se escriben
# a mano en spec.json — se derivan de spec["pages"] (título + "summary" de
# cada apartado de nivel superior) para que no puedan desincronizarse de la
# estructura real: si un apartado se añade, se quita o se reordena, esta
# tabla lo sigue sin que nadie tenga que acordarse de actualizarla aparte.
def toc_idevice(idv_id, pages, lead=""):
    rows = [[p["title"], p["summary"]] for p in pages if p.get("kind") != "inicio"]
    html = lead + _table(["Apartado", "Qué encontrará"], rows)
    return text_idevice(idv_id, html)


def _render_media_item(item, idv_id, spec_dir):
    kind = item["type"]
    label = item["label"]
    cap = f'<figcaption>{xesc(label)}</figcaption>'
    if kind == "iframe":
        src = item["src"]
        return (
            f'<figure class="probe-media">{cap}'
            f'<div class="probe-media__frame">'
            f'<iframe data-exe-probe-media="iframe" data-exe-probe-label="{xesc(label)}" '
            f'src="{src}" title="{xesc(label)}" '
            f'allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy">'
            f"</iframe></div></figure>"
        )
    if kind == "pdf":
        base = _bind_asset(idv_id, spec_dir, item["file"])
        href = f"{{{{context_path}}}}/{idv_id}/{base}"
        return (
            f'<figure class="probe-media">{cap}'
            f'<object class="probe-media__object" data-exe-probe-media="object" data-exe-probe-label="{xesc(label)}" '
            f'data="{href}" type="application/pdf" aria-label="{xesc(label)}"></object>'
            f'<p class="probe-media__fallback"><a href="{href}" target="_blank" rel="noopener">'
            f'Abrir {xesc(label)} en otra pestaña</a></p></figure>'
        )
    if kind == "externalPdf":
        src = item["src"]
        return (
            f'<figure class="probe-media">{cap}'
            f'<object class="probe-media__object" data-exe-probe-media="object" data-exe-probe-label="{xesc(label)}" '
            f'data="{src}" type="application/pdf" aria-label="{xesc(label)}"></object>'
            f'<p class="probe-media__fallback"><a href="{src}" target="_blank" rel="noopener">'
            f'Abrir {xesc(label)} en otra pestaña</a></p></figure>'
        )
    if kind == "image":
        base = _bind_asset(idv_id, spec_dir, item["file"])
        return (
            f'<figure class="probe-media">{cap}'
            f'<img class="probe-media__img" data-exe-probe-media="image" data-exe-probe-label="{xesc(label)}" '
            f'src="{{{{context_path}}}}/{idv_id}/{base}" alt="{xesc(label)}"></figure>'
        )
    if kind == "externalImage":
        # A diferencia de "image", esta no es un asset del paquete: es una
        # imagen enlazada tal cual de otro servidor (Caso 3.1), sin copiarla
        # ni pasar por _bind_asset. El <img> sí se marca con el mismo
        # data-exe-probe-media="image" que el caso 3.2: media.js mide "carga
        # real" con naturalWidth/complete, una señal que el navegador expone
        # igual de fielmente venga el archivo de dentro o de fuera del
        # paquete (a diferencia de un iframe, que no expone su estado
        # interno en cross-origin). Lo único que cambia aquí es de dónde
        # viene el byte, no si la medida es honesta.
        src = item["src"]
        return (
            f'<figure class="probe-media">{cap}'
            f'<img class="probe-media__img" data-exe-probe-media="image" data-exe-probe-label="{xesc(label)}" '
            f'src="{src}" alt="{xesc(label)}"></figure>'
        )
    if kind == "background":
        return (
            f'<figure class="probe-media">{cap}'
            f'<div class="probe-media__box" data-exe-probe-media="background" '
            f'data-exe-probe-label="{xesc(label)}"></div></figure>'
        )
    if kind == "font":
        spec = item["fontSpec"]
        return (
            f'<figure class="probe-media">{cap}'
            f'<span data-exe-probe-media="font" '
            f'data-exe-probe-label="{xesc(label)}" data-exe-probe-font="{xesc(spec)}">'
            f"Texto con la fuente del paquete</span></figure>"
        )
    if kind == "localVideo":
        # A diferencia de un iframe cross-origin, un <video> propio del
        # paquete sí expone señales directas de carga (readyState,
        # videoWidth, error), así que media.js puede afirmar carga-real en
        # vez de conformarse con frame-no-bloqueado. Separa «la vía de
        # servido funciona» de «el iDevice interactivo funciona»: si el
        # panel confirma carga-real aquí y aun así el vídeo interactivo no
        # responde, el fallo está en el iDevice bajo aislamiento, no en el
        # servido del paquete.
        base = _bind_asset(idv_id, spec_dir, item["file"])
        return (
            f'<figure class="probe-media">{cap}'
            f'<video class="probe-media__video" data-exe-probe-media="video" data-exe-probe-label="{xesc(label)}" '
            f'controls src="{{{{context_path}}}}/{idv_id}/{base}"></video></figure>'
        )
    raise ValueError(f"tipo de media desconocido: {kind}")


# El aviso que se ve cuando la sonda NO llega a correr. Es el estado ESTÁTICO
# de la página: la medición se emite oculta (`hidden`) y la revela
# poc/probe/src/ui/medicion-view.js como último paso del rellenado. Se hace
# así, y no con <noscript>, porque <noscript> solo cubre «JavaScript
# desactivado» y deja fuera los dos casos que este paquete existe para medir:
# que la política de contenidos del anfitrión bloquee el <script> inline, y
# que el bundle falle. En esos dos, <noscript> sigue oculto y lo que quedaría
# en pantalla es una tabla de guiones — que se lee como una medición que salió
# vacía, no como una que no llegó a hacerse.
#
# Se usa el atributo `hidden` y no una clase para que el fallback sobreviva a
# que un tema descarte el pp_extraHeadContent: [hidden]{display:none} vive en
# la hoja de estilos del navegador. INVARIANTE: ninguna regla de SUITE_CSS
# puede fijar `display` sobre [data-exe-probe-medido], .probe-table ni
# .probe-noscript, o anularía ese `hidden`.
_NOSCRIPT_TITULO = "LA SONDA NO SE EJECUTÓ AQUÍ"
_NOSCRIPT_TEXTO = (
    "No hay medición que mostrar. Esto es en sí un resultado: o el navegador tiene "
    "JavaScript desactivado, o la política de contenidos del anfitrión bloqueó el script, "
    "o el script falló antes de terminar."
)


def _noscript_box():
    return (
        '<div class="probe-noscript" data-exe-probe-noscript>'
        f'<p class="probe-noscript__title">⚠ {xesc(_NOSCRIPT_TITULO)}</p>'
        f'<p class="probe-noscript__text">{xesc(_NOSCRIPT_TEXTO)}</p>'
        "</div>"
    )


# Los dos grupos de la tabla. No reordenan nada: capabilities.json ya viene
# con las siete críticas primero y las tres condicionales después, así que
# agrupar es partir la lista por donde ya estaba partida.
_GRUPOS = [
    (
        "critica",
        "ACCESO AL ANFITRIÓN",
        "alcanzarlas es alcanzar la sesión de quien abre el recurso",
    ),
    (
        "condicional",
        "CAPACIDADES PROPIAS DEL CONTENIDO",
        "necesarias para SCORM y para guardar el progreso; solo son peligrosas "
        "acompañadas de una de las anteriores",
    ),
]


def _medicion_help_body_html(c):
    """Cuerpo dl de la ayuda ⓘ: misma estructura que las demos del LMS.
    La propiedad técnica vive aquí, no en una columna de la tabla.
    """
    doc = c.get("doc") or "matriz-seguridad.md"
    url = DOC_BASE + doc
    return (
        f'<dl class="probe-help__body">'
        f"<dt>Propiedad comprobada</dt>"
        f'<dd class="mono">{xesc(c["prop"])}</dd>'
        f"<dt>Qué mide</dt><dd>{xesc(c['mide'])}</dd>"
        f"<dt>Qué implica</dt><dd>{xesc(c['implica'])}</dd>"
        f"<dt>De qué protege el aislamiento</dt><dd>{xesc(c['protege'])}</dd>"
        f"<dt>Leer más</dt>"
        f"<dd>"
        f'<a href="{xesc(url)}" target="_blank" rel="noopener">{xesc(doc)}</a>'
        f'<br><span class="probe-help__url">{xesc(url)}</span>'
        f"</dd>"
        f"</dl>"
    )


def _medicion_row_html(c):
    """Dos columnas: (propiedad + valor medido) | resultado.

    La ayuda ⓘ se emite en la fila siguiente a todo el ancho (colspan=2),
    para que el texto no quede en un hueco estrecho. medicion-view.js
    rellena valor/resultado y cablea el botón.
    """
    key = c["key"]
    help_id = "exe-mh-" + key
    return (
        f'<tr data-exe-probe-row="{xesc(key)}">'
        f'<td class="probe-table__main">'
        f'<div class="probe-table__line">'
        f'<span class="probe-table__texto">{xesc(c["texto"])}</span>'
        f'<button type="button" class="probe-help__btn" data-exe-probe-help-toggle '
        f'data-exe-probe-help-for="{xesc(key)}" aria-controls="{xesc(help_id)}" '
        f'aria-expanded="false" title="Qué mide esta prueba y de qué protege" '
        f'aria-label="Explicación: {xesc(c["texto"])}">i</button>'
        f"</div>"
        f'<div class="probe-table__valor" data-exe-probe-valor>—</div>'
        f"</td>"
        f'<td data-exe-probe-resultado>—</td>'
        f"</tr>"
        f'<tr class="probe-table__help-row" id="{xesc(help_id)}" '
        f'data-exe-probe-help="{xesc(key)}" hidden>'
        f'<td colspan="2">{_medicion_help_body_html(c)}</td>'
        f"</tr>"
    )


# El HTML estático del apartado 1: el aviso de arriba, y —oculta— la caja de
# veredicto vacía (la rellena poc/probe/src/ui/medicion-view.js con
# createElement/textContent, nunca innerHTML) y la tabla de las diez
# comprobaciones. Dos columnas: «Propiedad y valor» (ancha) y «Resultado».
# La propiedad técnica y la explicación van en una fila de ayuda a todo el
# ancho bajo cada comprobación (CAPABILITIES → misma fuente que help.js).
# «Valor» y «Resultado» los escribe la sonda al medir, con el resumen
# redactado (presencia/longitud/recuento, nunca el valor de sesión).
def medicion_shell_html():
    parts = [
        '<div class="probe-verdict" data-exe-probe-verdict>'
        '<p class="probe-verdict__title" data-exe-probe-verdict-title>—</p>'
        '<p class="probe-verdict__text" data-exe-probe-verdict-text>—</p>'
        '</div>',
        _para(
            "La comprobación se hace sola al cargar la página y no modifica nada: solo pregunta al "
            "navegador qué le permitiría hacer este contenido. Los valores de sesión nunca se "
            "muestran, ni siquiera parcialmente: esta tabla dice si una capacidad estuvo presente y, "
            "cuando aplica, su longitud o su recuento, nunca el dato en sí. Pulsa ⓘ en cada fila "
            "para ver qué mide, qué implica y de qué protege el aislamiento."
        ),
    ]
    headers = (
        f"<th>{xesc('Propiedad y valor')}</th>"
        f'<th class="probe-table__th-resultado">{xesc("Resultado")}</th>'
    )
    cuerpos = []
    for severidad, titulo, glosa in _GRUPOS:
        filas = "".join(
            _medicion_row_html(c)
            for c in CAPABILITIES
            if c["severidad"] == severidad
        )
        cuerpos.append(
            f'<tbody data-exe-probe-grupo="{xesc(severidad)}">'
            f'<tr class="probe-table__group"><th colspan="2">{xesc(titulo)} '
            f'<span class="probe-table__glosa">— {xesc(glosa)}</span></th></tr>'
            f"{filas}</tbody>"
        )
    parts.append(
        f'<table class="probe-table"><thead><tr>{headers}</tr></thead>{"".join(cuerpos)}</table>'
    )
    return (
        '<div data-exe-probe-medicion>'
        + _noscript_box()
        + '<div data-exe-probe-medido hidden>'
        + "".join(parts)
        + "</div></div>"
    )


# view: 'medicion' (solo el apartado 1) monta la tabla nativa de arriba,
# rellenada por la sonda sin panel ni Shadow DOM; 'completo' monta el panel
# con pestañas de siempre (ninguna página de este paquete lo pide ya, pero
# se conserva como comportamiento por defecto); 'linea' monta el resumen
# compacto de una línea que consolida el detalle en el apartado 1 (ver
# poc/probe/src/entry/probe.js:resolveView). Cualquier valor ausente o
# desconocido se trata como 'completo' — por eso aquí SIEMPRE se emite
# explícitamente, para que verify.py pueda comprobar qué vista pidió cada
# página en vez de depender del valor por defecto del bundle.
def probe_idevice(idv_id, build_id, bundle_js, view="linea"):
    if view == "medicion":
        shell = medicion_shell_html()
    elif view == "linea":
        # Mismo criterio que el apartado 1: lo estático es el aviso, y el
        # resumen lo escribe la sonda dentro de este contenedor
        # (poc/probe/src/entry/probe.js:mountLineaInline), retirando el aviso
        # solo después de haber pintado.
        shell = (
            '<div data-exe-probe-linea>'
            '<p class="probe-noscript" data-exe-probe-noscript>'
            "⚠ La sonda no se ejecutó en esta página."
            "</p></div>"
        )
    else:
        shell = ""
    bundle_b64 = base64.b64encode(bundle_js.encode("utf-8")).decode("ascii")
    loader_js = (
        '(function(){var s=document.createElement("script");'
        's.textContent=atob("' + bundle_b64 + '");'
        '(document.head||document.documentElement).appendChild(s);s.remove();})();'
    )
    assert not any(c in loader_js for c in "<>&"), (
        "el cargador no puede contener <, > ni &: eXe podría serializarlos como entidades HTML"
    )
    raw_html = (
        shell +
        f'<script>window.__EXE_POC_VIEW="{view}";</script>'
        f'<script>window.__EXE_POC_BUILD_ID="{build_id}";</script>'
        f'<script data-exe-probe-loader="base64">{loader_js}</script>'
    )
    return text_idevice(idv_id, raw_html)


def block(page_id, block_id, order, component_xml, icon, block_name, teacher_only=False):
    icon_tag = f"<iconName>{xesc(icon)}</iconName>" if icon else "<iconName/>"
    component_xml = component_xml.replace("{page}", page_id).replace("{block}", block_id)
    teacher_prop = (
        "<odePagStructureProperty><key>teacherOnly</key><value>true</value></odePagStructureProperty>"
        if teacher_only else ""
    )
    return (
        "<odePagStructure>"
        f"<odePageId>{page_id}</odePageId>"
        f"<odeBlockId>{block_id}</odeBlockId>"
        f"<blockName>{xesc(block_name)}</blockName>"
        f"{icon_tag}"
        f"<odePagStructureOrder>{order}</odePagStructureOrder>"
        "<odePagStructureProperties>"
        "<odePagStructureProperty><key>identifier</key><value/></odePagStructureProperty>"
        "<odePagStructureProperty><key>visibility</key><value>true</value></odePagStructureProperty>"
        "<odePagStructureProperty><key>allowToggle</key><value>false</value></odePagStructureProperty>"
        "<odePagStructureProperty><key>minimized</key><value>false</value></odePagStructureProperty>"
        "<odePagStructureProperty><key>cssClass</key><value/></odePagStructureProperty>"
        f"{teacher_prop}"
        "</odePagStructureProperties>"
        f"<odeComponents>{component_xml}</odeComponents>"
        "</odePagStructure>"
    )


def nav_page(page_id, name, order, blocks_xml, parent_id=""):
    return (
        "<odeNavStructure>"
        f"<odePageId>{page_id}</odePageId>"
        f"<odeParentPageId>{parent_id}</odeParentPageId>"
        f"<pageName>{xesc(name)}</pageName>"
        f"<odeNavStructureOrder>{order}</odeNavStructureOrder>"
        "<odeNavStructureProperties>"
        "<odeNavStructureProperty><key>visibility</key><value>true</value></odeNavStructureProperty>"
        f"<odeNavStructureProperty><key>titleNode</key><value>{xesc(name)}</value></odeNavStructureProperty>"
        "<odeNavStructureProperty><key>titleHtml</key><value/></odeNavStructureProperty>"
        f"<odeNavStructureProperty><key>titlePage</key><value>{xesc(name)}</value></odeNavStructureProperty>"
        "<odeNavStructureProperty><key>description</key><value/></odeNavStructureProperty>"
        "</odeNavStructureProperties>"
        f"<odePagStructures>{blocks_xml}</odePagStructures>"
        "</odeNavStructure>"
    )


def build_content_xml(spec, spec_dir):
    theme = spec.get("theme", "base")

    bundle_path = _resolve(spec_dir, spec["bundle"])
    with open(bundle_path, encoding="utf-8") as f:
        bundle_js = f.read()
    assert "</script>" not in bundle_js, "el bundle no puede contener un </script> literal"
    build_id = hashlib.sha256(bundle_js.encode("utf-8")).hexdigest()[:8]
    build_date = spec.get("buildDate") or datetime.date.today().isoformat()

    pages_xml = []
    order = [0]

    def emit_page(page, parent_id, forced_pid=None):
        pid = forced_pid or nid()
        # Los pids de los hijos se reservan ANTES de construir los bloques
        # propios de esta página, no al recorrerlos más abajo: el bloque
        # "childrenGrid" (índice de subapartados de una sección-hub) necesita
        # el pid real de cada hijo para su enlace exe-node:<pid> — y ese
        # enlace se construye aquí, no cuando emit_page() vuelve a llamarse
        # sobre el hijo (que sería demasiado tarde).
        children = page.get("children", [])
        child_pids = [nid() for _ in children]
        blocks_xml = []
        for b_order, blk in enumerate(page.get("blocks", []), start=1):
            bid = nid()
            idv = nid()
            teacher = bool(blk.get("teacher"))
            # La cinta de identidad no es un <article> de la maqueta, así que
            # no es un iDevice propio: se antepone al contenido del primer
            # bloque de texto de cada página, sea cual sea su tipo.
            lead = identity_strip(build_id, build_date) if b_order == 1 else ""
            # Título/icono por defecto de cada bloque cuando spec.json no da
            # uno explícito. Cada tipo de bloque representa un <article>
            # distinto de la maqueta (o, para "probe"/"interactiveVideo", un
            # iDevice adicional que la maqueta no dibuja pero que la tarea 24
            # ya había separado) y trae su propio icono/título con sentido.
            default_title = page["title"]
            default_icon = "info"
            if "image" in blk:
                src = blk["image"]
                base = os.path.basename(src)
                _bind_asset(idv, spec_dir, src)
                comp = image_idevice(idv, base, blk.get("caption", ""))
            elif "md" in blk:
                comp = markdown_idevice(idv, blk.get("md", ""))
            elif "article" in blk:
                art = blk["article"]
                grid_html = children_grid_html(children, child_pids) if art.get("childrenGrid") else ""
                comp = article_idevice(idv, art, lead=lead, grid_html=grid_html)
                default_title = art.get("title", page["title"])
                default_icon = art.get("icon", "info")
            elif "intro" in blk:
                it = blk["intro"]
                comp = intro_idevice(
                    idv, it["lead"], it["warningStrong"], it["warningRest"], it.get("tail", ""), lead=lead,
                )
                default_title = "Para qué sirve este paquete"
                default_icon = "objectives"
            elif blk.get("toc"):
                comp = toc_idevice(idv, spec["pages"], lead=lead)
                default_title = "Cómo está organizado"
                default_icon = "roadmap"
            elif "caseIntro" in blk:
                comp = case_intro_idevice(idv, blk["caseIntro"], lead=lead)
                default_title = "Qué se prueba aquí"
                default_icon = "info"
            elif "caseMedia" in blk:
                cm = blk["caseMedia"]
                comp = case_media_idevice(idv, spec_dir, cm)
                default_title = cm.get("title", "Media")
                default_icon = "observe"
            elif "escapeIntro" in blk:
                ei = blk["escapeIntro"]
                comp = escape_intro_idevice(idv, ei["what"], warn=ei.get("warn", True), lead=lead)
                default_title = "Qué se prueba aquí"
                default_icon = "technology"
            elif "actions" in blk:
                ac = blk["actions"]
                comp = actions_idevice(idv, ac["intro"], ac["host"], lead=lead)
                default_title = ac.get("title", "Acciones disponibles")
                default_icon = ac.get("icon", "alert")
            elif blk.get("probe"):
                comp = probe_idevice(idv, build_id, bundle_js, blk.get("view", "linea"))
                # «Aislamiento en esta página» y no «Resumen de la sonda»: el
                # veredicto es idéntico en las 21 páginas (misma measure(win),
                # misma vía de servido), así que este bloque no resume nada que
                # el apartado 1 no diga mejor. Lo que sí aporta, y solo él, es
                # si la sonda llegó a correr AQUÍ — que es justo lo que se
                # audita en 2.3 (vídeo local) y 3.2 (imagen del paquete).
                default_title = (
                    "Resultado de la medición" if blk.get("view") in ("medicion", "completo")
                    else "Aislamiento en esta página"
                )
                default_icon = "experiment"
            elif "interactiveVideo" in blk:
                iv = blk["interactiveVideo"]
                if iv["source"] == "local":
                    base = _bind_asset(idv, spec_dir, iv["file"])
                    href = f"{{{{context_path}}}}/{idv}/{base}"
                    href_text = base
                elif iv["source"] == "youtube":
                    href = f"https://www.youtube.com/watch?v={iv['videoId']}"
                    href_text = f"com/watch?v={iv['videoId']}"
                else:
                    raise ValueError(f"origen de vídeo desconocido: {iv['source']}")
                comp = interactive_video_idevice(idv, href, href_text, iv["slides"])
                default_title = "Vídeo interactivo"
                default_icon = "interactive"
            elif blk.get("downloadSource"):
                comp = download_source_file_idevice(idv, spec)
                default_title = "Descargar el paquete"
                default_icon = "download"
            else:
                raise ValueError(f"tipo de bloque desconocido: {sorted(blk.keys())}")
            blocks_xml.append(
                block(pid, bid, b_order, comp,
                      icon=blk.get("icon", default_icon),
                      block_name=blk.get("title", default_title),
                      teacher_only=teacher)
            )
        order[0] += 1
        pages_xml.append(nav_page(pid, page["title"], order[0], "".join(blocks_xml), parent_id))
        for child, child_pid in zip(children, child_pids):
            emit_page(child, pid, forced_pid=child_pid)

    for page in spec["pages"]:
        emit_page(page, "")

    footer = spec.get("footer", "")
    pp_license = LICENSE_MAP.get(spec.get("license", ""), spec.get("license", ""))
    return f"""<?xml version="1.0" encoding="utf-8"?>
<ode>
<userPreferences><userPreference><key>theme</key><value>{xesc(theme)}</value></userPreference></userPreferences>
<odeResources>
  <odeResource><key>odeVersionName</key><value>1</value></odeResource>
  <odeResource><key>isDownload</key><value>true</value></odeResource>
</odeResources>
<odeProperties>
  <odeProperty><key>pp_title</key><value>{xesc(spec["title"])}</value></odeProperty>
  <odeProperty><key>pp_lang</key><value>{xesc(spec.get("lang", "es"))}</value></odeProperty>
  <odeProperty><key>pp_author</key><value>{xesc(spec.get("author", ""))}</value></odeProperty>
  <odeProperty><key>pp_description</key><value>{xesc(spec.get("subtitle", ""))}</value></odeProperty>
  <odeProperty><key>pp_license</key><value>{xesc(pp_license)}</value></odeProperty>
  <odeProperty><key>pp_licenseUrl</key><value>{xesc(spec.get("licenseUrl", ""))}</value></odeProperty>
  <odeProperty><key>pp_theme</key><value>{xesc(theme)}</value></odeProperty>
  <odeProperty><key>pp_addExeLink</key><value>true</value></odeProperty>
  <odeProperty><key>pp_addPagination</key><value>true</value></odeProperty>
  <odeProperty><key>pp_addSearchBox</key><value>true</value></odeProperty>
  <odeProperty><key>pp_addAccessibilityToolbar</key><value>false</value></odeProperty>
  <odeProperty><key>pp_footer</key><value><![CDATA[{footer}]]></value></odeProperty>
  <odeProperty><key>exportSource</key><value>true</value></odeProperty>
  <odeProperty><key>pp_extraHeadContent</key><value><![CDATA[<style>{SUITE_CSS}</style>]]></value></odeProperty>
</odeProperties>
<odeNavStructures>
{''.join(pages_xml)}
</odeNavStructures>
</ode>
"""


def write_elp(spec, out_path, spec_dir="."):
    global _counter, ASSET_BINDINGS
    _counter = 0
    ASSET_BINDINGS = {}
    src_dir = out_path + "-src"
    if os.path.isdir(src_dir):
        shutil.rmtree(src_dir)
    os.makedirs(src_dir)

    content = build_content_xml(spec, spec_dir)
    with open(os.path.join(src_dir, "content.xml"), "w", encoding="utf-8") as f:
        f.write(content)

    for idv, srcs in ASSET_BINDINGS.items():
        dst_dir = os.path.join(src_dir, "content", "resources", idv)
        os.makedirs(dst_dir, exist_ok=True)
        for src in srcs:
            if not os.path.exists(src):
                print(f"WARN: missing asset {src}", file=sys.stderr)
                continue
            shutil.copy(src, os.path.join(dst_dir, os.path.basename(src)))

    if os.path.exists(out_path):
        os.remove(out_path)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, dirs, files in os.walk(src_dir):
            dirs.sort()
            for fn in sorted(files):
                ap = os.path.join(dp, fn)
                z.write(ap, os.path.relpath(ap, src_dir))
    shutil.rmtree(src_dir)
    return out_path


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python3 exelib.py <spec.json> <out.elp>", file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        spec = json.load(f)
    write_elp(spec, sys.argv[2], spec_dir=os.path.dirname(os.path.abspath(sys.argv[1])))
    print(f"Wrote {sys.argv[2]} ({len(spec['pages'])} pages)")
