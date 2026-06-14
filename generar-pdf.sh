#!/usr/bin/env bash
#
# generar-pdf.sh — Genera DOCX y PDF (bonito) del artículo a partir del Markdown.
#
# Cadena (sin TeX Live completo):
#   - DOCX : pandoc  (Markdown -> DOCX nativo, editable en Word/LibreOffice).
#   - PDF  : pandoc + tectonic (LaTeX moderno; portada, índice, secciones en azul con
#            filete rojo, código con fondo, enlaces de color). Tectonic descarga bajo
#            demanda solo los paquetes que use el documento y los cachea.
#   - PDF (fallback): si no hay tectonic, LibreOffice (DOCX -> PDF, sin el estilo LaTeX).
#   - Bibliografía: references.bib vía citeproc (sección "Referencias y estándares").
#
# Requiere: pandoc. Para PDF: tectonic (preferido) o LibreOffice.
#   brew install pandoc tectonic
#
# Uso:  bash generar-pdf.sh            # DOCX + PDF de todo
#       bash generar-pdf.sh docx       # solo DOCX (rápido)
#       bash generar-pdf.sh articulo   # solo el artículo (DOCX + PDF)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
OUTPDF="$HERE/pdf"; OUTDOCX="$HERE/docx"; mkdir -p "$OUTPDF" "$OUTDOCX"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
TODAY="$(date +%Y-%m-%d)"
AUTHOR="Ernesto Serrano Collado · info@ernesto.es"
BIB="$HERE/references.bib"
CSL="$HERE/ieee.csl"   # estilo IEEE (citas numeradas), reutilizado del tooling de doctorado
READER="markdown-tex_math_dollars-tex_math_single_backslash"

command -v pandoc >/dev/null 2>&1 || { echo "ERROR: falta pandoc (brew install pandoc)"; exit 1; }
PDF_ENGINE=""; command -v tectonic >/dev/null 2>&1 && PDF_ENGINE="tectonic"
SOFFICE=""
if [[ -z "$PDF_ENGINE" ]]; then
  for s in "/Applications/LibreOffice.app/Contents/MacOS/soffice" \
           "$(command -v soffice 2>/dev/null || true)" "$(command -v libreoffice 2>/dev/null || true)"; do
    [[ -n "$s" && -x "$s" ]] && { SOFFICE="$s"; break; }
  done
fi
echo "pandoc:    $(pandoc --version | head -1)"
echo "motor PDF: ${PDF_ENGINE:+tectonic}${PDF_ENGINE:-${SOFFICE:+LibreOffice (fallback, sin estilo LaTeX)}}"
[[ -z "$PDF_ENGINE" && -z "$SOFFICE" ]] && echo "  (sin motor PDF: solo DOCX)"

TARGET="${1:-todo}"

# --- Estilo LaTeX (académico, sobrio): negro, secciones sin color, running head ---
# Genera el preámbulo con el nombre del artículo en la cabecera de página.
gen_header () {
  local running="$1"
  cat > "$TMP/header.tex" <<'TEX'
\usepackage{xcolor}
\definecolor{exelink}{HTML}{1A3E6E}   % azul marino sobrio solo para URLs externas
\definecolor{shadecolor}{HTML}{F4F6F8}
\usepackage{microtype}
\frenchspacing
% Fuente serif tipo Times (como IEEE): TeX Gyre Termes vía fontspec por fichero.
% Envuelto en \IfFontExistsTF para degradar con elegancia a Latin Modern si tectonic
% no trae la fuente, de modo que el build nunca falla por la tipografía.
\IfFontExistsTF{texgyretermes-regular.otf}{%
  \setmainfont{texgyretermes}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]%
}{%
  \IfFontExistsTF{TeX Gyre Termes}{\setmainfont{TeX Gyre Termes}}{}%
}
% Código: ajustar líneas largas para que no se salgan del margen
\usepackage{fvextra}
\DefineVerbatimEnvironment{Highlighting}{Verbatim}{breaklines,breakanywhere,commandchars=\\\{\}}
% Tablas: reglas finas (booktabs lo carga pandoc) y cuerpo compacto en tablas anchas
\usepackage{etoolbox}
\AtBeginEnvironment{longtable}{\scriptsize}
\renewcommand{\arraystretch}{1.12}
% Pies de figura/tabla más sobrios
\usepackage[font=small,labelfont=bf,labelsep=period]{caption}
% Listas algo más compactas (densidad de paper)
\usepackage{enumitem}
\setlist{topsep=3pt,itemsep=2pt,parsep=0pt}
% Secciones sobrias en serif, con filete gris muy fino
\usepackage{titlesec}
\titleformat{\section}{\large\bfseries}{\thesection}{0.6em}{}[{\color{black!12}\titlerule[0.5pt]}]
\titleformat{\subsection}{\normalsize\bfseries}{\thesubsection}{0.5em}{}
\titleformat{\subsubsection}{\normalsize\bfseries\itshape}{\thesubsubsection}{0.5em}{}
\titlespacing*{\section}{0pt}{1.25em}{0.4em}
\titlespacing*{\subsection}{0pt}{0.85em}{0.3em}
\titlespacing*{\subsubsection}{0pt}{0.7em}{0.25em}
% Título del documento, compacto con filete fino
\usepackage{titling}
\setlength{\droptitle}{-2.5em}
\pretitle{\begin{flushleft}\LARGE\bfseries}
\posttitle{\par\vspace{4pt}{\color{black}\rule{\textwidth}{0.8pt}}\end{flushleft}\vspace{0.4em}}
\preauthor{\begin{flushleft}\normalsize}
\postauthor{\end{flushleft}}
\predate{\begin{flushleft}\small\color{black!55}}
\postdate{\end{flushleft}\vspace{1em}}
% Cabecera de página (running head) con el nombre del artículo
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0.4pt}
\fancyhead[R]{\footnotesize\thepage}
\fancypagestyle{plain}{\fancyhf{}\fancyhead[R]{\footnotesize\thepage}\renewcommand{\headrulewidth}{0pt}}
TEX
  printf '\\fancyhead[L]{\\footnotesize\\itshape %s}\n' "$running" >> "$TMP/header.tex"
}

pdf_common=(
  --from "$READER" --to pdf --pdf-engine=tectonic
  --toc --toc-depth=2 -V toc-title=Índice
  --syntax-highlighting=monochrome --include-in-header="$TMP/header.tex"
  -V lang=es -V geometry:margin=2.2cm -V fontsize=10pt
  -V linestretch=1.05
  -V colorlinks=true -V linkcolor=exelink -V citecolor=black -V urlcolor=exelink
  -V author="$AUTHOR" -V date="$TODAY"
)
docx_common=(
  --from "$READER" --to docx --standalone --toc --toc-depth=2
  --metadata author="$AUTHOR" --metadata date="$TODAY" --metadata lang=es
)

strip_h1 () { awk 'f==0 && /^# /{f=1; next} {print}' "$1"; }   # quita el primer H1 (lo da el título)

emit () { # emit <slug> <title> <body.md> <withbib:0|1>
  local slug="$1" title="$2" body="$3" bib="$4"
  # running head = nombre corto del artículo (antes de ':' o ' —')
  local running="${title%%:*}"; running="${running%% —*}"
  gen_header "$running"
  local cite=()
  if [[ "$bib" == 1 ]]; then
    cite=(--citeproc --bibliography="$BIB")
    [[ -f "$CSL" ]] && cite+=(--csl="$CSL")
    # Solo se listan las referencias efectivamente citadas en el texto (sin `nocite: @*`),
    # como corresponde a un artículo para revisión por pares; el índice completo de fuentes
    # (citadas o no) vive en `fuentes/README.md`.
  fi
  pandoc "$body" "${docx_common[@]}" ${cite[@]+"${cite[@]}"} --metadata title="$title" -o "$OUTDOCX/$slug.docx"
  echo "  docx -> $slug.docx ($(du -h "$OUTDOCX/$slug.docx" | cut -f1))"
  [[ "$TARGET" == docx ]] && return 0
  if [[ "$PDF_ENGINE" == tectonic ]]; then
    if pandoc "$body" "${pdf_common[@]}" ${cite[@]+"${cite[@]}"} -V title="$title" -o "$OUTPDF/$slug.pdf" 2>"$TMP/$slug.err"; then
      echo "  pdf  -> $slug.pdf ($(du -h "$OUTPDF/$slug.pdf" | cut -f1)) [tectonic]"
    else echo "  pdf  -> FALLO tectonic ($slug):"; sed -n '1,6p' "$TMP/$slug.err"; fi
  elif [[ -n "$SOFFICE" ]]; then
    "$SOFFICE" --headless --norestore --convert-to pdf --outdir "$OUTPDF" \
      -env:UserInstallation="file://$TMP/lo-$$-$RANDOM" "$OUTDOCX/$slug.docx" >/dev/null 2>&1
    echo "  pdf  -> $slug.pdf [LibreOffice]"
  fi
}

echo "== Artículo =="
strip_h1 seguridad-html-js-recursos-educativos.md > "$TMP/art.md"
emit "seguridad-html-js-recursos-educativos" \
     "El iframe que sabía demasiado: aislamiento de JavaScript no confiable en recursos educativos" \
     "$TMP/art.md" 1

echo "== Article (EN) =="
strip_h1 security-html-js-educational-resources.en.md > "$TMP/art-en.md"
emit "security-html-js-educational-resources.en" \
     "The iframe that knew too much: isolating untrusted JavaScript in educational resources" \
     "$TMP/art-en.md" 1

if [[ "$TARGET" == "todo" || "$TARGET" == "docx" ]]; then
  echo "== Matriz =="
  strip_h1 matriz-seguridad.md > "$TMP/mat.md"
  emit "matriz-seguridad" "Matriz de seguridad — contenido HTML/JS en LMS/CMS educativos" "$TMP/mat.md" 0
  echo "== Anexos =="
  strip_h1 anexos-tecnicos.md > "$TMP/anx.md"
  emit "anexos-tecnicos" "Anexos técnicos — riesgos de HTML/JS en recursos educativos" "$TMP/anx.md" 0
  echo "== Informe completo (artículo + matriz + anexos) =="
  {
    cat "$TMP/art.md"
    printf '\n\n# Anexo A — Matriz de seguridad\n\n'; cat "$TMP/mat.md"
    printf '\n\n# Anexo B — Anexos técnicos\n\n';     cat "$TMP/anx.md"
  } > "$TMP/informe.md"
  emit "informe-completo" "Riesgos de HTML/JS en recursos educativos — informe completo" "$TMP/informe.md" 1
fi

echo "Listo."
echo "DOCX en: $OUTDOCX"; ls -1 "$OUTDOCX"/*.docx 2>/dev/null || true
echo "PDF  en: $OUTPDF";  ls -1 "$OUTPDF"/*.pdf  2>/dev/null || true
