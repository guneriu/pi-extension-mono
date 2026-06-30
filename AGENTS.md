# AGENTS.md

Operating rules for any AI agent (or human) working in this repository.
**This repo is production, open-source software. Treat every change as shippable.**

If you are an agent: read this file fully before editing. Follow these rules on
every task without being asked.

---

## 1. What this repo is

A monorepo of independent [pi](https://pi.dev) extensions under `packages/*`.
Each package is versioned, changelogged, and released **independently** (like
charts in a Helm monorepo).

| Package | npm? |
|---|---|
| `pi-files`, `session-files`, `keybindings-help` | published to npm |
| `copilot-quota`, `pi-footer` | git-only (`private: true`) |

## 2. Non-negotiable rules for every change

Before you consider a task "done", ALL of these must be true:

1. **Tests exist and pass.** New behavior needs tests. Bug fixes need a
   regression test. Run `npm test` and confirm green. Never claim success
   without running it (see the verification rule below).
2. **Docs are updated.** If behavior, commands, flags, or install steps change,
   update that package's `README.md` and, if user-facing in the index, the root
   `README.md`.
3. **A changeset is added** for any user-facing change:
   ```bash
   npx changeset
   ```
   Pick the affected package(s), bump type, and a one-line summary. Commit the
   `.changeset/*.md` file. Tooling/docs-only changes don't need one.
4. **Conventional Commit messages**, scoped by package:
   `feat(pi-files): ...`, `fix(copilot-quota): ...`, `docs: ...`, `chore: ...`.
5. **No secrets, tokens, or personal absolute paths** in committed files.

## 3. Verification before claiming completion

Do **not** say "done", "fixed", "passing", or "ready" until you have actually
run the relevant command and seen it succeed in this session. Evidence before
assertions. The minimum gate:

```bash
make check     # = npm test + publish-check (+ advisory typecheck)
```

If you changed a publishable package, also confirm the package would ship the
right files: `npm pack --workspace packages/<pkg> --dry-run`.

## 4. Versioning rules (pre-1.0)

- **patch** — bug fix, no API/behavior change.
- **minor** — new feature, OR any breaking change (while < 1.0 we ship breaking
  changes as minor and call them out clearly in the changeset summary).
- Each package bumps on its own. Do not touch versions by hand — let Changesets
  do it.

## 5. Release process (local-only, controlled — maintainer decides when)

All releases run **from the maintainer's machine**. There is no CI/CD; GitHub
holds the code, issues, and releases, but does not build or publish anything.
We use **trunk-based development on `main`** — no `develop` branch. The release
is gated by the accumulation of changesets, not by a branch.

Flow:
1. Changes land on `main`, each with its changeset.
2. When ready to ship, the maintainer runs locally:
   ```bash
   make version        # consume changesets -> bump versions + CHANGELOGs
   git commit -am "chore: version packages"
   make release-local  # runs tests, then npm publish (needs npm login)
   git push --follow-tags
   ```
3. Optionally create GitHub releases from the pushed tags (`gh release create`).

Until `make version` is run, changesets just accumulate and nothing ships.

Agents: **never publish to npm or push tags on your own.** Stop at adding the
changeset unless the maintainer explicitly asks you to run a release.

## 6. Adding a new extension

1. `packages/<name>/` with `package.json` (`name`, `version: 0.0.0`, `type: module`,
   `files`, `exports`, `repository.directory`, `engines`, `peerDependencies`, `pi.extensions`).
2. Add `extensions/` (and `src/`, `test/` if it has logic).
3. Add it to the root `package.json` `pi.extensions` array.
4. Add a `test` script; write at least one test.
5. Add it to the root `README.md` table and `CONTRIBUTING.md` layout.
6. Decide npm vs git-only: git-only ⇒ set `"private": true`.
7. Add an initial changeset.

## 7. Quick command reference

```bash
make help          # list all targets
make test          # run all tests
make check         # full local gate (run before any PR)
make changeset     # record a change for release
make doctor        # is the repo releasable?
make clean         # remove node_modules + build cruft
```
