# Contributing to pi-extension-mono

Thanks for your interest! This is a small, solo-maintained monorepo of [pi](https://pi.dev) extensions. This guide keeps contributions smooth for everyone.

## Who can do what

- **Anyone** can open **issues** (use the templates) and **pull requests** (from a fork).
- **Only the maintainer (@guneriu)** merges to `main`. All PRs need maintainer review.
- For **large features**, please open an issue first and wait for a 👍 before writing code — this avoids wasted effort.
- Small fixes (typos, obvious bugs) — just send the PR.

## Project layout

```
packages/
  pi-files/          published to npm
  session-files/     published to npm
  keybindings-help/  published to npm
  copilot-quota/     git-only (private: true)
  pi-footer/         git-only (private: true)
```

Each package is an independent pi extension with its own version, CHANGELOG, and (eventually) tests.

## Development setup

```bash
git clone https://github.com/guneriu/pi-extension-mono
cd pi-extension-mono
npm ci          # installs workspace deps

# Try it inside pi:
pi install ./pi-extension-mono
# after edits, in pi:  /reload
```

## Before you open a PR

Run the local gate before opening a PR (the maintainer will run it too):

```bash
make check        # test + build-check + typecheck
```

or individually:

```bash
npm test            # runs every package's tests (where present)
npm run publish-check  # dry-run pack + publint on publishable packages
npm run typecheck   # advisory for now
```

## The one extra step: a changeset

Any change that affects users (a fix, a feature, a behavior change) needs a **changeset**:

```bash
npx changeset
```

Pick the affected package(s), the bump type, and write a one-line summary. Commit the generated `.changeset/*.md` file with your change. Tooling/docs-only changes don't need one.

See [`.changeset/README.md`](./.changeset/README.md) for details.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) with the package as scope:

```
feat(pi-files): add diff view for modified files
fix(copilot-quota): handle missing gh CLI gracefully
docs: clarify install instructions
chore: bump dev deps
```

## Releases

You don't release anything in a PR. The maintainer ships releases locally with
`make version` + `make release-local`. See [`AGENTS.md`](./AGENTS.md) and
[`.changeset/README.md`](./.changeset/README.md).

## Code of Conduct

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
