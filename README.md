# pi-extension-mono

Pi coding agent extensions by [guneriu](https://github.com/guneriu).

## Extensions

| Package | npm | Description |
|---------|-----|-------------|
| [`@guneriu/pi-files`](./packages/pi-files) | `pi install npm:@guneriu/pi-files` | Agent-edited files widget + interactive project tree (`/pi-files`, type-to-filter, Space to peek) |
| [`@guneriu/pi-session-files`](./packages/session-files) | `pi install npm:@guneriu/pi-session-files` | Track context, read, and modified files in your session |
| [`@guneriu/pi-keybindings-help`](./packages/keybindings-help) | `pi install npm:@guneriu/pi-keybindings-help` | Press `?` on an empty editor → floating keybindings reference |
| [`@guneriu/pi-copilot-quota`](./packages/copilot-quota) | git only | GitHub Copilot quota chip, session cost, `/copilot-rates` |
| [`@guneriu/pi-footer`](./packages/pi-footer) | git only | Enhanced footer — tokens, cache %, context bar, Copilot cost breakdown |

## Install

```bash
# Individual packages (npm — latest):
pi install npm:@guneriu/pi-files
pi install npm:@guneriu/pi-session-files
pi install npm:@guneriu/pi-keybindings-help

# Individual packages (npm — pinned to a release):
pi install npm:@guneriu/pi-files@0.2.0
pi install npm:@guneriu/pi-session-files@0.2.0
pi install npm:@guneriu/pi-keybindings-help@0.2.0

# All five from GitHub (the only way to get copilot-quota and pi-footer):
# Note: git install always loads all extensions listed in the root package.json.
pi install git:github.com/guneriu/pi-extension-mono

# Local development:
pi install /path/to/pi-extension-mono
```

## Requirements

- [pi coding agent](https://pi.dev)
- [`gh` CLI](https://cli.github.com) — required by `pi-copilot-quota`
- GitHub Copilot subscription — required by `pi-copilot-quota`

## Development

```bash
npm ci                      # install workspace deps
pi install ./pi-extension-mono   # try it inside pi; /reload after edits
make check                  # local gate: test + pack/publint checks
```

See [`Makefile`](./Makefile) (`make help`) for all automation targets.

## Versioning & releases

Packages are versioned **independently** with [Changesets](https://github.com/changesets/changesets).
Releases are run **locally** by the maintainer (no CI/CD).

1. Make a change, then record it: `npx changeset` (or `make changeset`).
2. When ready to ship: `make version` (bumps + writes CHANGELOGs), commit it.
3. `make release-local` publishes changed public packages to npm; then
   `git push --follow-tags` (and optionally `gh release create` per tag).

Git-only packages (`copilot-quota`, `pi-footer`) are `private: true` and are
versioned/changelogged but never published to npm. Full details in
[`.changeset/README.md`](./.changeset/README.md) and [`AGENTS.md`](./AGENTS.md).

## Contributing

Issues and PRs welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md),
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md), and [`SECURITY.md`](./SECURITY.md).

## License

MIT © Uğur Güneri
