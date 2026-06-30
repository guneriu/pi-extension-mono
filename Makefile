# pi-extension-mono — automation
#
# This repo has no CI/CD — everything runs locally. These targets are how you
# test, validate, version, and publish from your machine.
#
# Quick reference:
#   make install        install workspace deps (npm ci)
#   make test           run all package tests
#   make check          full local gate: test + build-check + typecheck
#   make changeset      record a change for the next release
#   make release-local  version + publish from your machine (needs npm login)
#   make clean          remove build cruft and node_modules
#   make doctor         sanity-check the repo is release-ready

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Publishable packages (the git-only ones are private:true and skipped by npm).
PUBLISH_PKGS := pi-files session-files keybindings-help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------- dev

.PHONY: install
install: ## Install workspace dependencies (clean)
	npm ci

.PHONY: test
test: ## Run tests across all packages
	npm test

.PHONY: typecheck
typecheck: ## Type-check all packages (advisory)
	npm run typecheck

.PHONY: check
check: test publish-check ## Full local gate before pushing a PR
	-npm run typecheck
	@echo "✓ local checks done"

# ---------------------------------------------------------------- release prep

.PHONY: changeset
changeset: ## Record a change for the next release (interactive)
	npx changeset

.PHONY: publish-check
publish-check: ## Dry-run pack + lint package manifests (catches missing files)
	npm pack --workspaces --dry-run
	npx publint run --workspaces

.PHONY: version
version: ## Apply pending changesets: bump versions + write CHANGELOGs
	npm run version-packages

# ---------------------------------------------------------------- release (local fallback)

.PHONY: release-local
release-local: check ## Publish changed public packages to npm (run 'make version' + commit first)
	@echo "→ Make sure you ran 'make version' and committed the result first."
	@echo "→ You must be logged in: npm whoami"
	npm whoami
	npm run release

# ---------------------------------------------------------------- housekeeping

.PHONY: clean
clean: ## Remove node_modules, build cruft, and pack tarballs
	rm -rf node_modules packages/*/node_modules
	find . -name '*.js.map' -not -path '*/node_modules/*' -delete
	find . -name '*.tgz' -not -path '*/node_modules/*' -delete
	rm -f .DS_Store packages/*/.DS_Store
	@echo "✓ cleaned"

.PHONY: doctor
doctor: ## Verify the repo is in a releasable state
	@echo "== git status =="; git status --short || true
	@echo "== pending changesets =="; ls .changeset/*.md 2>/dev/null | grep -v README || echo "  (none)"
	@echo "== package versions =="; \
	for p in $(PUBLISH_PKGS) copilot-quota pi-footer; do \
		v=$$(node -p "require('./packages/$$p/package.json').version"); \
		priv=$$(node -p "require('./packages/$$p/package.json').private ? '(git-only)' : ''"); \
		printf "  %-18s %s %s\n" "$$p" "$$v" "$$priv"; \
	done
	@echo "== running tests =="; npm test
