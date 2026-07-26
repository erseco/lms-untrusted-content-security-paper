# Makefile — reproducir PoC, documentos y sumas de verificación.
# Ver REPRODUCIBILITY.md para el detalle. Requiere: pandoc + tectonic (PDF),
# Node.js + Playwright (sondas), Docker (entornos de laboratorio).

.PHONY: help pdf docx poc-suite poc sums clean all

help:
	@echo "Objetivos disponibles:"
	@echo "  pdf    - genera los PDF (bash generar-pdf.sh) en pdf/"
	@echo "  docx   - genera los DOCX (bash generar-pdf.sh docx) en docx/"
	@echo "  poc-suite - exporta evil.elpx, evil_web.zip y evil_scorm.zip con eXeLearning"
	@echo "  poc    - regenera la Página y H5P usando la suite ya exportada"
	@echo "  sums   - escribe pdf/SHA256SUMS con el SHA-256 de los PDF locales"
	@echo "  clean  - borra los artefactos generados en docx/ y pdf/"
	@echo "  all    - poc + pdf + sums"

pdf:
	bash generar-pdf.sh

docx:
	bash generar-pdf.sh docx

poc-suite:
	cd poc/suite-src && bash build.sh && python3 verify.py

poc:
	cd poc && bash build.sh

sums:
	cd pdf && shasum -a 256 *.pdf > SHA256SUMS

clean:
	rm -f docx/*.docx pdf/*.pdf pdf/SHA256SUMS

all: poc pdf sums
