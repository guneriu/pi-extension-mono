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
- **@guneriu/pi-keybindings-help** — Floating keybindings reference overlay
  - Press `?` on an empty editor to open a native popup with all pi keybindings
  - Two-column layout: cursor/deletion/kill-ring/input on the left; app/messages/models/display/sessions on the right
  - `?` or `Esc` to close; `?` in a non-empty editor inserts the character normally
- **@guneriu/pi-files** — Agent-edited files widget + interactive project tree
  - Compact widget above the input bar showing files touched by the agent in the current session
  - `/pi-files` command for an interactive gitignore-aware project tree
  - Peek at file contents directly from the tree without leaving pi
  - Tracks context files (AGENTS.md, SYSTEM.md, CLAUDE.md)
  - Tracks files read via `read` tool
  - Tracks files modified via `edit`/`write` tools
  - Sorting (`--alpha`, `--frequency`) and filtering (`--read-only`, `--modified-only`, `--context-only`)
  - `/session-files` command
