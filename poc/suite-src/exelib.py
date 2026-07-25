"""
Build a minimal, intermediate content.xml (zipped as .elp) from a simple JSON
spec. This is not a spec-complete ODE 2.0 document — it skips the DOCTYPE,
xmlns/version attributes, and odeId/odeVersionId/exe_version resources, and
uses older resource keys (odeVersionName, isDownload) that the eXeLearning
importer tolerates but its own exporter no longer produces. It only needs to
be good enough for that importer to round-trip it: build.sh feeds this .elp
into the real eXeLearning CLI (`make export-elpx`), which re-emits a proper,
spec-compliant content.xml as part of a real .elpx — that's what actually
becomes poc/exe-probe-suite.elpx.

Ported from erseco/talks (scripts/exe/exelib.py: `md` and `image` blocks, the
odeComponent/odePagStructure/odeNavStructure builders, the {{context_path}}
asset-binding mechanism) and extended with three block types this suite needs
that talks doesn't have:

  - "case": a `text` iDevice carrying the identity ribbon, the case header
    (what it tests / expected in secure vs legacy mode) and the case's media,
    as raw HTML (no Markdown pass). This is the "html iDevice" the plan calls
    for, expressed as structured data instead of a pre-rendered HTML string —
    so that build-time values (buildId, {{context_path}}) are threaded in by
    this file rather than baked stale into spec.json.
  - "probe": another `text` iDevice, right after "case", whose raw HTML is
    two <script> tags: the buildId assignment and the probe bundle itself,
    read fresh from poc/probe/dist/probe.bundle.js on every run.
  - "interactiveVideo": a real `interactive-video` iDevice. Its htmlView and
    jsonProperties shapes are copied from two real eXeLearning packages
    (exelearning_5/test/fixtures/todos-los-idevices.elp and the user's
    campana-de-denuncia package) — see I18N_INTERACTIVE_VIDEO and
    SCORM_DEFAULT below, kept byte-identical to what the current CLI actually
    exports, and the local/YouTube distinction follows the exact rule the
    idevice's own runtime uses (idevices/interactive-video/interactive-video.js
    :getTypeAndId): a relative href becomes a local <video>, a youtube.com /
    youtu.be href becomes the YouTube player.

Spec shape (JSON): see spec.json alongside this file.

Only needs Python 3 stdlib plus the `markdown` package (for the "md" block
type, ported but unused by our own spec.json — every page here uses "case").
"""

import datetime
import hashlib
import html as _html
import json
import os
import shutil
import sys
import zipfile

import markdown as _markdown


def md_to_html(src):
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


# --- probe suite's own case scaffolding --------------------------------------

def identity_strip(build_id, build_date):
    return (
        '<div class="probe-identity" style="margin:0 0 12px;padding:8px 12px;'
        'background:#111;color:#ffdf5d;border-left:5px solid #ffdf5d;font:12px/1.4 '
        'system-ui,sans-serif">'
        "<strong>RECURSO DE PRUEBA DE SEGURIDAD</strong> — no es material didáctico real."
        f"<br>build {build_id} · {build_date} · sha256:{build_id}"
        "</div>"
    )


def case_header(title, what, secure, legacy):
    return (
        '<section class="probe-case" style="margin:0 0 12px;padding:10px 12px;'
        'border:1px solid #c9ced6;border-radius:8px;background:#f7f9fc;font:12px/1.5 '
        'system-ui,sans-serif">'
        f'<h2 style="margin:0 0 4px;font-size:14px">{xesc(title)}</h2>'
        f"<p style=\"margin:0 0 6px\"><strong>Qué prueba:</strong> {xesc(what)}</p>"
        f"<p style=\"margin:0\"><strong>Esperado en modo seguro:</strong> {xesc(secure)}</p>"
        f"<p style=\"margin:2px 0 0\"><strong>Esperado en modo legacy:</strong> {xesc(legacy)}</p>"
        "</section>"
    )


def _render_media_item(item, idv_id, spec_dir):
    kind = item["type"]
    label = item["label"]
    cap = f'<figcaption style="font:12px system-ui">{xesc(label)}</figcaption>'
    if kind == "iframe":
        src = item["src"]
        return (
            f'<figure style="margin:0 0 12px">{cap}'
            f'<div style="position:relative;max-width:640px;aspect-ratio:16/9">'
            f'<iframe data-exe-probe-media="iframe" data-exe-probe-label="{xesc(label)}" '
            f'src="{src}" title="{xesc(label)}" style="width:100%;height:100%;border:0" '
            f'allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy">'
            f"</iframe></div></figure>"
        )
    if kind == "pdf":
        base = _bind_asset(idv_id, spec_dir, item["file"])
        return (
            f'<figure style="margin:0 0 12px">{cap}'
            f'<object data-exe-probe-media="object" data-exe-probe-label="{xesc(label)}" '
            f'data="{{{{context_path}}}}/{idv_id}/{base}" type="application/pdf" width="320" height="180"></object></figure>'
        )
    if kind == "image":
        base = _bind_asset(idv_id, spec_dir, item["file"])
        return (
            f'<figure style="margin:0 0 12px">{cap}'
            f'<img data-exe-probe-media="image" data-exe-probe-label="{xesc(label)}" '
            f'src="{{{{context_path}}}}/{idv_id}/{base}" alt="{xesc(label)}" width="160" height="64"></figure>'
        )
    if kind == "background":
        return (
            f'<figure style="margin:0 0 12px">{cap}'
            f'<div class="probe-asset-box" data-exe-probe-media="background" '
            f'data-exe-probe-label="{xesc(label)}"></div></figure>'
        )
    if kind == "font":
        spec = item["fontSpec"]
        return (
            f'<figure style="margin:0 0 12px">{cap}'
            f'<span class="probe-asset-font" data-exe-probe-media="font" '
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
            f'<figure style="margin:0 0 12px">{cap}'
            f'<video data-exe-probe-media="video" data-exe-probe-label="{xesc(label)}" '
            f'controls src="{{{{context_path}}}}/{idv_id}/{base}"></video></figure>'
        )
    raise ValueError(f"tipo de media desconocido: {kind}")


def case_idevice(idv_id, build_id, build_date, spec_dir, case):
    parts = []
    if case.get("assetsCss"):
        base = _bind_asset(idv_id, spec_dir, case["assetsCss"])
        parts.append(f'<link rel="stylesheet" href="{{{{context_path}}}}/{idv_id}/{base}">')
    for relpath in case.get("extraAssets", []):
        _bind_asset(idv_id, spec_dir, relpath)
    parts.append(identity_strip(build_id, build_date))
    parts.append(case_header(case["title"], case["what"], case["secure"], case["legacy"]))
    for item in case.get("media", []):
        parts.append(_render_media_item(item, idv_id, spec_dir))
    return text_idevice(idv_id, "".join(parts))


def probe_idevice(idv_id, build_id, bundle_js):
    raw_html = (
        f'<script>window.__EXE_POC_BUILD_ID="{build_id}";</script>'
        f'<script>{bundle_js}</script>'
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

    def emit_page(page, parent_id):
        pid = nid()
        blocks_xml = []
        for b_order, blk in enumerate(page.get("blocks", []), start=1):
            bid = nid()
            idv = nid()
            teacher = bool(blk.get("teacher"))
            if "image" in blk:
                src = blk["image"]
                base = os.path.basename(src)
                _bind_asset(idv, spec_dir, src)
                comp = image_idevice(idv, base, blk.get("caption", ""))
            elif "md" in blk:
                comp = markdown_idevice(idv, blk.get("md", ""))
            elif "case" in blk:
                comp = case_idevice(idv, build_id, build_date, spec_dir, blk["case"])
            elif blk.get("probe"):
                comp = probe_idevice(idv, build_id, bundle_js)
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
            else:
                raise ValueError(f"tipo de bloque desconocido: {sorted(blk.keys())}")
            blocks_xml.append(
                block(pid, bid, b_order, comp,
                      icon=blk.get("icon", "info"),
                      block_name=blk.get("title", page["title"]),
                      teacher_only=teacher)
            )
        order[0] += 1
        pages_xml.append(nav_page(pid, page["title"], order[0], "".join(blocks_xml), parent_id))
        for child in page.get("children", []):
            emit_page(child, pid)

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
