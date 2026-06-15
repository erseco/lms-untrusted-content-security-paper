# Disposable multi-version Moodle lab for the isolation-probe matrix.
# Reuses erseco/alpine-moodle + mod_exelearning (pinned by fetch-plugin.sh) and the
# existing read-only probe in ../evidencias. See README.md.

EVID := ../evidencias

# Read MOODLE_VERSION/TEST_USER_* from .env if present.
-include .env
export

check-docker:
	@docker version >/dev/null 2>&1 || { echo "Error: Docker is not running."; exit 1; }

check-env:
	@[ -f .env ] || { echo "Creating .env from .env.dist"; cp .env.dist .env; }

# Materialise the pinned plugin into ./mod_exelearning (idempotent).
plugin:
	@bash fetch-plugin.sh

# Install the probe's Node deps + Chromium (idempotent).
deps:
	@cd $(EVID) && { [ -d node_modules/playwright ] || npm install --no-audit --no-fund; } && npx playwright install chromium

# Single instance on :80 (uses MOODLE_VERSION from .env). The image boots vanilla
# Moodle; run `make seed` once it is up to install the plugin + demo course.
up: check-docker check-env plugin
	docker compose up

upd: check-docker check-env plugin
	docker compose up -d

# Install the staged plugin into the running container + seed the demo course.
seed: check-docker
	bash install-plugin.sh

down: check-docker
	docker compose down

# Like down, but also drop volumes (fresh DB/moodledata next time).
clean: check-docker
	docker compose down -v --remove-orphans

# Probe the already-running instance once. Override MODE=secure|legacy.
MODE ?= secure
probe: deps
	MOODLE_BASE=http://localhost EXE_USER=$(or $(TEST_USER_USERNAME),user) \
	EXE_PASS=$(or $(TEST_USER_PASSWORD),1234) EXPECT_MODE=$(MODE) \
	OUT=$(EVID)/resultados-lab-$(MODE).json node $(EVID)/exe-live-isolation-test.cjs

# Full cross-version matrix -> evidencias/resultados-matriz-versiones.json.
matrix: check-docker check-env plugin deps
	bash run-matrix.sh

help:
	@echo "Targets: up upd seed down clean probe (MODE=secure|legacy) matrix plugin deps"

.DEFAULT_GOAL := help
.PHONY: check-docker check-env plugin deps up upd seed down clean probe matrix help
