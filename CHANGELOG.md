# Changelog

All notable changes to this project will be documented here.

## [0.1.0] - 2026-06-22

### Added
- **@guneriu/pi-copilot-quota** — GitHub Copilot AI credit usage chip
  - Configurable GitHub host (supports `github.com` and any GHE instance)
  - Credit-based cost calculation for 18 model families
  - Subagent cost tracking (`$parent ↳ $sub` format)
  - `/copilot-usage` settings dialog
- **@guneriu/pi-footer** — Enhanced pi footer
  - Path, git branch, session name, token counts, cache %, context window bar
  - Copilot cost display with subagent breakdown
  - Model name + thinking level indicator
  - `/custom-footer` toggle command
- **@guneriu/pi-session-files** — Session file tracker
  - Tracks context files (AGENTS.md, SYSTEM.md, CLAUDE.md)
  - Tracks files read via `read` tool
  - Tracks files modified via `edit`/`write` tools
  - Sorting (`--alpha`, `--frequency`) and filtering (`--read-only`, `--modified-only`, `--context-only`)
  - `/session-files` command
