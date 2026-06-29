# Publish pi-files, keybindings-help, session-files — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push the mono-repo to GitHub, publish three packages to npm, and have them appear on pi.dev/packages.

**Architecture:** Each sub-package (`packages/pi-files`, `packages/keybindings-help`, `packages/session-files`) is an independent npm package published separately under the `@guneriu` scope. The root repo is pushed to GitHub as-is; only the three listed packages are published to npm. pi.dev/packages auto-discovers npm packages tagged `pi-package` — no manual submission required.

**Packages to publish:**
- `@guneriu/pi-files` (`packages/pi-files`)
- `@guneriu/pi-keybindings-help` (`packages/keybindings-help`)
- `@guneriu/pi-session-files` (`packages/session-files`)

**Packages NOT published (private, stay in repo only):**
- `packages/copilot-quota`
- `packages/pi-footer`

**All commands run from:** `/Users/U466187/Developer/projects/ai-upskill/pi-extension-mono`

---

## Task 1: GitHub — wire remote and push

**Files:** none

- [ ] **Step 1: Check if remote exists**

```bash
git remote -v
```

Expected: shows `origin` pointing to `https://github.com/guneriu/pi-extension-mono`, or no output if unset.

- [ ] **Step 2: Add remote if missing**

If Step 1 showed no remote:

```bash
git remote add origin https://github.com/guneriu/pi-extension-mono
```

If it already exists but points to the wrong URL:

```bash
git remote set-url origin https://github.com/guneriu/pi-extension-mono
```

- [ ] **Step 3: Create the repo on GitHub if it doesn't exist**

Either via the GitHub UI at https://github.com/new (name: `pi-extension-mono`, public, no README init)
or via the `gh` CLI:

```bash
gh repo create guneriu/pi-extension-mono --public --source=. --remote=origin
```

- [ ] **Step 4: Push**

```bash
git push -u origin main
```

Expected: all commits pushed, `main` branch tracking `origin/main`.

---

## Task 2: npm — authenticate

**Files:** `~/.npmrc` (written by npm automatically)

- [ ] **Step 1: Log in to npm**

```bash
npm login
```

This opens a browser for OTP/token flow. You must be logged in as `guneriu` (the scope owner).

- [ ] **Step 2: Verify login**

```bash
npm whoami
```

Expected: `guneriu`

---

## Task 3: Bump versions

All three packages are currently at `0.1.0`. Run `npm version` inside each package directory — this edits `package.json` and creates a git tag.

**Files:**
- Modify: `packages/pi-files/package.json`
- Modify: `packages/keybindings-help/package.json`
- Modify: `packages/session-files/package.json`

- [ ] **Step 1: Bump pi-files**

```bash
cd packages/pi-files && npm version minor && cd ../..
```

Expected: prints `v0.2.0`, updates `packages/pi-files/package.json`.

- [ ] **Step 2: Bump keybindings-help**

```bash
cd packages/keybindings-help && npm version minor && cd ../..
```

Expected: prints `v0.2.0`.

- [ ] **Step 3: Bump session-files**

```bash
cd packages/session-files && npm version minor && cd ../..
```

Expected: prints `v0.2.0`.

- [ ] **Step 4: Push version bumps and tags**

```bash
git push && git push --tags
```

Expected: commits + three new tags (`v0.2.0` × 3, or per-package tags if npm created them) pushed to GitHub.

---

## Task 4: Publish packages to npm

**Prerequisite:** Task 2 complete (logged in as `guneriu`).

`--access public` is required on the first publish of a scoped package. Subsequent publishes don't need it but it's harmless to include.

- [ ] **Step 1: Publish pi-files**

```bash
cd packages/pi-files && npm publish --access public && cd ../..
```

Expected: `+ @guneriu/pi-files@0.2.0` (or whichever version was bumped to).

Verify: https://www.npmjs.com/package/@guneriu/pi-files

- [ ] **Step 2: Publish keybindings-help**

```bash
cd packages/keybindings-help && npm publish --access public && cd ../..
```

Expected: `+ @guneriu/pi-keybindings-help@0.2.0`

Verify: https://www.npmjs.com/package/@guneriu/pi-keybindings-help

- [ ] **Step 3: Publish session-files**

```bash
cd packages/session-files && npm publish --access public && cd ../..
```

Expected: `+ @guneriu/pi-session-files@0.2.0`

Verify: https://www.npmjs.com/package/@guneriu/pi-session-files

---

## Task 5: Verify pi.dev/packages listing

The gallery polls npm for packages tagged `pi-package`. All three packages already have that keyword. No submission required.

- [ ] **Step 1: Wait ~1 hour after publish**

- [ ] **Step 2: Check each package appears**

- https://pi.dev/packages/@guneriu/pi-files
- https://pi.dev/packages/@guneriu/pi-keybindings-help
- https://pi.dev/packages/@guneriu/pi-session-files

Expected: gallery card showing name, description, install command, and npm/repo links.

- [ ] **Step 3: Smoke-test install from npm**

In a scratch terminal (not the repo directory):

```bash
pi install npm:@guneriu/pi-files
```

Expected: installs without error, extension loads on next pi start.

---

## Optional: Add a gallery preview image

To show a screenshot on the pi.dev package card, add an `image` field to the `pi` block in `package.json`:

```json
"pi": {
  "extensions": ["./extensions"],
  "image": "https://raw.githubusercontent.com/guneriu/pi-extension-mono/main/assets/pi-files-preview.png"
}
```

Add the PNG to `assets/pi-files-preview.png` in the repo, then re-publish (`npm version patch && npm publish`).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm publish` fails with 403 | You're not logged in as `guneriu`, or the package name is taken — run `npm whoami` |
| `npm publish` fails with 402 | Scoped packages need `--access public` on first publish |
| Package not on pi.dev after 2 hours | Check `keywords` contains `"pi-package"` — `npm info @guneriu/pi-files keywords` |
| `pi install` resolves wrong version | Specify version: `pi install npm:@guneriu/pi-files@0.2.0` |
| Git push rejected | Repo may not exist yet on GitHub — do Task 1 Step 3 |
