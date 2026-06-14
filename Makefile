# Makefile — reproducir PoC, documentos y sumas de verificación.
# Ver REPRODUCIBILITY.md para el detalle. Requiere: pandoc + tectonic (PDF),
# Node.js + Playwright (sondas), Docker (entornos de laboratorio).

.PHONY: help pdf docx poc sums clean all

help:
	@echo "Objetivos disponibles:"
	@echo "  pdf    - genera los PDF (bash generar-pdf.sh) en pdf/"
	@echo "  docx   - genera los DOCX (bash generar-pdf.sh docx) en docx/"
	@echo "  poc    - regenera los paquetes PoC (cd poc && bash build.sh)"
	@echo "  sums   - escribe pdf/SHA256SUMS con el SHA-256 de los PDF publicados"
	@echo "  clean  - borra los intermedios de docx/ (NUNCA pdf/, que se publica)"
	@echo "  all    - poc + pdf + sums"

pdf:
	bash generar-pdf.sh

docx:
	bash generar-pdf.sh docx

poc:
	cd poc && bash build.sh

sums:
	cd pdf && shasum -a 256 *.pdf > SHA256SUMS

clean:
	rm -f docx/*.docx

all: poc pdf sums
