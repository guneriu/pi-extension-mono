# Production Readiness — Setup Status

Generated as part of the OSS hardening of this repo. **This repo has no CI/CD —
all building, testing, versioning, and publishing happen locally.** GitHub hosts
the code, issues, PRs, and releases only.

## ✅ Done in the repo

- **Independent versioning + releases** via Changesets (`.changeset/config.json`).
- **Per-package CHANGELOGs** (seeded; Changesets maintains them going forward).
- **npm workspaces** added to root; root marked `private`.
- **Git-only packages** (`copilot-quota`, `pi-footer`) marked `private: true` —
  versioned + changelogged but never published to npm.
- **Test scripts + `engines`** added; `npm test` runs all package tests (69 passing in pi-files).
- **Makefile** with `help`, `test`, `check`, `changeset`, `version`, `release-local`, `clean`, `doctor`, `publish-check`.
- **Governance**: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `AGENTS.md`,
  `.github/CODEOWNERS`, issue templates (bug/feature), PR template.
- **Cleanup**: moved AI review files into `docs/reviews/`, untracked `.idea/`, ignored `*.tgz`/IDE dirs, fixed `repository.url` to `git+` for all packages.

## ⚠️ One-time GitHub UI steps (optional, no CI involved)

1. **Branch protection on `main`** (Settings → Branches), if you want the PR gate:
   - Require a pull request before merging.
   - Require review from Code Owners.
   - Add yourself to **"Allow specified actors to bypass required pull requests"**
     (you're solo, so you must be able to self-merge).
   - Disable force pushes and deletions.
   - Note: there are **no status checks to require** (no CI). The gate is the PR itself.
2. **Enable Discussions** (issue template config links to it): Settings → Features → Discussions.
3. **Enable private vulnerability reporting**: Settings → Security (SECURITY.md links here).
4. (Optional) Add **repo topics** `pi`, `pi-extension`, `cli`, `tui` and a description.

> No `NPM_TOKEN` secret and no Actions permissions are needed — nothing publishes from GitHub.

## Local release flow (the whole thing)

```bash
# 1. record changes as you go
npx changeset                 # pick packages + bump + summary  (or: make changeset)

# 2. when you decide to ship:
make version                  # consume changesets -> bump versions + CHANGELOGs
git commit -am "chore: version packages"
make release-local            # runs tests, then npm publish for changed public pkgs
                              # (requires: npm login  /  npm whoami)
git push --follow-tags        # push the version commit + tags

# 3. (optional) cut GitHub releases from the tags
gh release create '@guneriu/pi-files@0.3.0' --generate-notes
```

Tag format is Changesets' default: `@guneriu/pi-files@0.3.0` (per-package).
Only packages whose version isn't already on npm get published; `private: true`
packages are skipped automatically.
