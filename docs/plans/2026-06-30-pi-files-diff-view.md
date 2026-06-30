# pi-files: Diff View for Edited Files — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing file preview a multi-mode viewer. Opening a **modified** file shows a unified diff first; opening a **new** file shows content. Inside the preview, `d` toggles between diff and content. No separate diff overlay.

**Architecture:** The existing `peek` overlay becomes a single multi-mode viewer with a `mode` state (`"diff" | "content"`). The default mode is chosen from the tree's edit marker: `M` (modified) + baseline → `diff`; `+` (new) / no baseline → `content`. Hybrid baseline resolution — (1) in-memory snapshot captured at first edit (session-accurate, no git needed), (2) `git show HEAD:<path>` fallback after reload / for bash-created files, (3) none → content-only. Diff computed with `diff` (jsdiff) — pure JS, cross-platform.

**Tech Stack:** TypeScript, `diff@8.x` (`structuredPatch`), Node `fs`, `child_process.execFileSync` (git), `@earendil-works/pi-tui` overlay primitives.

> **Status:** ✅ COMPLETE — implemented across 3 commits; 68/68 tests passing, tsc clean.

**User decisions locked:**
- Diff home: **multi-mode preview** — one overlay, `space` opens it, `d` toggles diff ⇄ content. No separate diff overlay, no tree-level `d`.
- Default mode: **diff-first for modified files** (`M` → diff; `+`/no-baseline → content)
- Baseline: **Hybrid** (snapshot → git → none), footer label shows active source `[session] / [git HEAD]`
- Layout: **Unified** single-column (green `+`, red `-`, dim context)
- Library: **`diff` (jsdiff)** — existing transitive dep, pure JS, OS-agnostic

---

## Design

### Open flow (driven by the tree's edit marker)

```
/files tree row  ──space──►  open preview
│
├─ marker M (modified) & baseline exists  → open in DIFF mode
├─ marker + (new)                         → open in CONTENT mode
└─ no marker / no baseline                → open in CONTENT mode

inside preview:  d  → toggle DIFF ⇄ CONTENT  (no-op + notice when no baseline)
```

### Baseline resolution (for diff mode)

```
├─ snapshots.has(abs)        → diff(snapshot, currentDisk), label [session]
├─ git repo & HEAD has path  → diff(git show HEAD:path, currentDisk), label [git HEAD]
└─ otherwise                 → no baseline → diff mode unavailable, stay in content
```

### Multi-mode preview (mockup)

```
  DIFF mode (default for M files)            CONTENT mode (toggle with d)
╭─ 👁 v1.7.md ──────── [diff·session] ─╮   ╭─ 👁 v1.7.md ───────── [content] ─╮
│  **Author:** Engineering            │   │ # Risk Analysis                 │
│ -**Version:** v1.5 — PCI-DSS        │ d │ **Version:** v1.6 — Pen test     │
│ +**Version:** v1.6 — Pen test       │◄─►│ **Status:** Draft               │
│  **Status:** Draft                  │   │ ...                             │
│  ⋯                                   │   │                                 │
│ +| v1.6 | 2026-06-29 | Pen test |    │   │                                 │
╰ +12 −3 · d content · ↑↓ · q close ──╯   ╰ d diff · ↑↓ · g/G · q close ────╯
```

- Added line: `theme.fg("success", "+" + text)`
- Removed line: `theme.fg("warning", "-" + text)` (warning = red/amber, always present in theme)
- Context line: `theme.fg("muted", " " + text)`
- Hunk gap marker between non-adjacent hunks: dim `⋯`
- Footer shows current mode + baseline source + add/del counts + scroll hints
- Toggling modes resets scroll to 0 (line counts differ between modes)

### Snapshot lifecycle

| Event | Action |
|---|---|
| `tool_call` (write/edit), file exists, first time seen, under size cap, not binary | `snapshots.set(abs, readFileSync(abs))` — **only if not already set** (keep true first-edit baseline) |
| `tool_execution_end` bash `mv` rename | migrate snapshot key `oldAbs → newAbs` (same as `edited` map) |
| `session_shutdown` | `snapshots.clear()` |

Memory bounded: only files the agent touches, only under `maxSnapshotBytes` (reuse `maxPeekBytes` setting), binary files skipped.

---

## File Structure

| File | Role | Action |
|---|---|---|
| `packages/pi-files/src/core.ts` | Pure utils: diff builder, git baseline, diff-line styling helpers | **Modify** |
| `packages/pi-files/extensions/pi-files.ts` | Snapshot capture, baseline resolution, diff overlay, `d` keybinding | **Modify** |
| `packages/pi-files/test/core.test.ts` | Unit tests for diff builder + git baseline | **Modify** |
| `packages/pi-files/package.json` | Add `diff` dependency | **Modify** |

---

## Task 1: Add `diff` dependency

**Files:** Modify `packages/pi-files/package.json`

- [ ] **Step 1: Add dependency**

In `dependencies`:
```json
"dependencies": {
  "cli-highlight": "^2.1.11",
  "diff": "^8.0.4"
}
```

- [ ] **Step 2: Install**

```bash
cd packages/pi-files && npm install
```

- [ ] **Step 3: Verify it resolves**

```bash
cd packages/pi-files && node --input-type=module -e "import { structuredPatch } from 'diff'; console.log(typeof structuredPatch)"
```
Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json 2>/dev/null; git add package.json
git commit -m "build(pi-files): add diff (jsdiff) dependency for diff view"
```

---

## Task 2: Pure diff builder in `src/core.ts`

**Files:** Modify `src/core.ts`, `test/core.test.ts`

### Types & function

```ts
import { structuredPatch } from "diff";

export type DiffLineKind = "add" | "del" | "ctx" | "gap";
export interface DiffLine {
  kind: DiffLineKind;
  text: string;   // raw line content WITHOUT the +/-/space prefix (gap text is the "⋯" marker)
}
export interface UnifiedDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
}

/**
 * Build a unified diff (hunk-based, N lines of context) between two strings.
 * Uses jsdiff structuredPatch. Returns classified lines ready for styling.
 * A "gap" line is inserted between non-adjacent hunks.
 */
export function buildUnifiedDiff(before: string, after: string, context = 3): UnifiedDiff {
  const patch = structuredPatch("a", "b", before, after, "", "", { context });
  const lines: DiffLine[] = [];
  let added = 0, removed = 0;
  patch.hunks.forEach((hunk, i) => {
    if (i > 0) lines.push({ kind: "gap", text: "⋯" });
    for (const raw of hunk.lines) {
      const marker = raw[0];
      const text = raw.slice(1);
      if (marker === "+") { lines.push({ kind: "add", text }); added++; }
      else if (marker === "-") { lines.push({ kind: "del", text }); removed++; }
      else { lines.push({ kind: "ctx", text }); }
      // jsdiff may emit a "\ No newline at end of file" line starting with "\"
      if (marker === "\\") lines.pop();
    }
  });
  return { lines, added, removed };
}
```

- [ ] **Step 1: Write failing tests** (add to `test/core.test.ts`)

```ts
import { buildUnifiedDiff } from "../src/core.ts";

test("buildUnifiedDiff: single line change", () => {
  const d = buildUnifiedDiff("a\nold\nc\n", "a\nnew\nc\n");
  assert.equal(d.added, 1);
  assert.equal(d.removed, 1);
  const kinds = d.lines.map((l) => l.kind);
  assert.ok(kinds.includes("del") && kinds.includes("add"));
  const del = d.lines.find((l) => l.kind === "del");
  const add = d.lines.find((l) => l.kind === "add");
  assert.equal(del?.text, "old");
  assert.equal(add?.text, "new");
});

test("buildUnifiedDiff: pure addition", () => {
  const d = buildUnifiedDiff("a\nb\n", "a\nb\nc\n");
  assert.equal(d.added, 1);
  assert.equal(d.removed, 0);
});

test("buildUnifiedDiff: pure deletion", () => {
  const d = buildUnifiedDiff("a\nb\nc\n", "a\nc\n");
  assert.equal(d.removed, 1);
  assert.equal(d.added, 0);
});

test("buildUnifiedDiff: identical content yields no changes", () => {
  const d = buildUnifiedDiff("a\nb\n", "a\nb\n");
  assert.equal(d.added, 0);
  assert.equal(d.removed, 0);
  assert.deepEqual(d.lines, []);
});

test("buildUnifiedDiff: inserts gap marker between non-adjacent hunks", () => {
  const before = Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n") + "\n";
  const after = before.replace("line2", "CHANGED2").replace("line27", "CHANGED27");
  const d = buildUnifiedDiff(before, after, 3);
  assert.ok(d.lines.some((l) => l.kind === "gap"), "must have a gap between far-apart hunks");
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd packages/pi-files && node --test test/core.test.ts 2>&1 | grep -E "buildUnifiedDiff|fail"
```
Expected: failures (`buildUnifiedDiff is not defined`).

- [ ] **Step 3: Implement** — add the import + function above to `src/core.ts` (place `import { structuredPatch } from "diff";` with the other top imports near line 151; place the function after `highlightMarkdown`).

- [ ] **Step 4: Run, verify pass**

```bash
cd packages/pi-files && node --test test/core.test.ts 2>&1 | grep -E "buildUnifiedDiff|tests|pass|fail"
```
Expected: all `buildUnifiedDiff` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core.ts test/core.test.ts
git commit -m "feat(pi-files): add buildUnifiedDiff (jsdiff-backed) pure diff builder"
```

---

## Task 3: Git baseline helper in `src/core.ts`

**Files:** Modify `src/core.ts`, `test/core.test.ts`

```ts
/**
 * Read a file's committed content from git HEAD. Returns undefined when not a
 * git repo, git is unavailable, or the path is not tracked at HEAD.
 * relPath must be posix-relative to cwd.
 */
export function getGitBaseline(cwd: string, relPath: string): string | undefined {
  try {
    return execFileSync("git", ["show", `HEAD:${relPath}`], {
      cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 1: Write tests** (integration-style with a temp git repo, mirroring existing `listProjectFiles` tests)

```ts
import { getGitBaseline } from "../src/core.ts";

test("getGitBaseline: returns committed content for tracked file", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-files-gitbase-"));
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "T"], { cwd: dir });
  writeFileSync(join(dir, "f.md"), "committed\n");
  execFileSync("git", ["add", "f.md"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init", "--quiet"], { cwd: dir });
  writeFileSync(join(dir, "f.md"), "modified\n"); // working tree differs
  assert.equal(getGitBaseline(dir, "f.md"), "committed\n");
});

test("getGitBaseline: returns undefined for untracked file", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-files-gitbase-untracked-"));
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  writeFileSync(join(dir, "new.md"), "x\n");
  assert.equal(getGitBaseline(dir, "new.md"), undefined);
});

test("getGitBaseline: returns undefined outside a git repo", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-files-nogit-base-"));
  writeFileSync(join(dir, "f.md"), "x\n");
  assert.equal(getGitBaseline(dir, "f.md"), undefined);
});
```

(Note: `execFileSync`, `mkdtempSync`, `writeFileSync`, `join`, `tmpdir` are already imported in the test file.)

- [ ] **Step 2: Run, verify fail**

```bash
cd packages/pi-files && node --test test/core.test.ts 2>&1 | grep -E "getGitBaseline|fail"
```

- [ ] **Step 3: Implement** — add `getGitBaseline` to `src/core.ts` (near `listProjectFiles`, reuses the already-imported `execFileSync`).

- [ ] **Step 4: Run, verify pass**

```bash
cd packages/pi-files && node --test test/core.test.ts 2>&1 | grep -E "getGitBaseline|tests|pass|fail"
```

- [ ] **Step 5: Commit**

```bash
git add src/core.ts test/core.test.ts
git commit -m "feat(pi-files): add getGitBaseline helper for git diff fallback"
```

---

## Task 4: Snapshot capture + migration in the extension

**Files:** Modify `extensions/pi-files.ts`

- [ ] **Step 1: Add snapshot map** (next to `edited` / `pending` / `pendingRenames`)

```ts
// absPath -> file content at the moment of FIRST edit this session (the
// session-accurate diff baseline). Never overwritten once set.
const snapshots = new Map<string, string>();
```

- [ ] **Step 2: Capture in `tool_call`** — in the write/edit branch, after computing `abs` and BEFORE `pending.set`:

```ts
// Capture the pre-edit baseline once, for session-accurate diffs.
if (!snapshots.has(abs) && existsSync(abs)) {
  try {
    const stat = statSync(abs);
    if (stat.size <= settings.maxPeekBytes) {
      const buf = readFileSync(abs);
      if (!looksBinary(buf.subarray(0, 4096))) {
        snapshots.set(abs, buf.toString("utf-8"));
      }
    }
  } catch { /* non-fatal: just no snapshot for this file */ }
}
```

(`statSync`, `readFileSync`, `existsSync`, `looksBinary` already imported.)

- [ ] **Step 3: Migrate on rename** — in `tool_execution_end`, inside the rename loop where `edited` key is moved old→new, also move the snapshot:

```ts
const snap = snapshots.get(oldAbs);
if (snap !== undefined) {
  snapshots.delete(oldAbs);
  snapshots.set(dest, snap);  // dest is the resolved destination (handles mv into dir)
}
```

- [ ] **Step 4: Clear on shutdown** — add to `session_shutdown`:

```ts
snapshots.clear();
```

- [ ] **Step 5: Build check**

```bash
cd packages/pi-files && npm run build 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add extensions/pi-files.ts
git commit -m "feat(pi-files): capture pre-edit snapshots for session-accurate diffs"
```

---

## Task 5: Refactor `peek` into a multi-mode preview with `d` toggle

**Files:** Modify `extensions/pi-files.ts`

The existing `peek(ctx, absPath)` already renders file content in an overlay. We extend it to (a) accept a default mode, (b) compute a diff baseline, (c) toggle modes with `d`. The tree's `space` handler passes the default mode based on the file's edit status.

### 5a. Imports + signature

Add to the `../src/core` import: `buildUnifiedDiff`, `getGitBaseline`, `type DiffLine`.

Pass `snapshots` and `edited` into `registerTreeCommands` (it already receives `edited`; add `snapshots`).

Change `peek` signature:
```ts
const peek = async (ctx: any, absPath: string, preferDiff = false) => {
```

### 5b. Baseline resolver (inside `registerTreeCommands`, before `peek`)

```ts
// Returns the diff baseline for a file, or undefined when none is available.
const resolveBaseline = (cwd: string, absPath: string): { before: string; source: "session" | "git" } | undefined => {
  const snap = snapshots.get(absPath);
  if (snap !== undefined) return { before: snap, source: "session" };
  const rel = relative(cwd, absPath).split("\\").join("/");
  const git = getGitBaseline(cwd, rel);
  if (git !== undefined) return { before: git, source: "git" };
  return undefined;
};
```

### 5c. Inside `peek`, after the content lines are built (`allLines`)

Compute the diff lazily and decide the starting mode:
```ts
const cwd = ctx.sessionManager.getCwd();
const baseline = resolveBaseline(cwd, absPath);
let diff: ReturnType<typeof buildUnifiedDiff> | undefined;
if (baseline) {
  try { diff = buildUnifiedDiff(baseline.before, text); } catch { diff = undefined; }
  if (diff && diff.lines.length === 0) diff = undefined; // no changes → no diff mode
}
// Start in diff mode only when requested AND a non-empty diff exists.
let mode: "diff" | "content" = preferDiff && diff ? "diff" : "content";
let scroll = 0;
```

(Rename the existing `peekScroll` to `scroll` for clarity, or keep `peekScroll` — just be consistent.)

### 5d. Render both modes

Replace the single-mode body builder so it renders from `diff.lines` when `mode === "diff"`, else from `allLines`. Diff line styling:
```ts
const styleDiffLine = (l: DiffLine): string => {
  if (l.kind === "add") return theme.fg("success", "+" + l.text);
  if (l.kind === "del") return theme.fg("warning", "-" + l.text);
  if (l.kind === "gap") return theme.fg("dim", " ⋯");
  return theme.fg("muted", " " + l.text);
};
```

Footer/title reflects mode:
```ts
const modeLabel = mode === "diff"
  ? `[diff·${baseline!.source === "git" ? "git" : "session"}] +${diff!.added} −${diff!.removed}`
  : "[content]";
const toggleHint = diff ? (mode === "diff" ? "d content  " : "d diff  ") : "";
const hint = `${toggleHint}↑↓ scroll  g/G ends  spc/esc close `;
```

The rows source switches on mode:
```ts
const rows = mode === "diff" ? diff!.lines.map(styleDiffLine) : allLines;
// then slice rows[scroll .. scroll+h] as before
```

### 5e. Handle `d` toggle in `peek`'s `handleInput`

```ts
if (data === "d") {
  if (!diff) { ctx.ui.notify("No diff available (new file or no baseline)", "info"); return; }
  mode = mode === "diff" ? "content" : "diff";
  scroll = 0; // line counts differ between modes
  tui.requestRender();
  return;
}
```

### 5f. Tree `space` handler passes `preferDiff`

In the tree overlay `handleInput`, update the `space` branches (both tree and search) to pass the default mode from the edit status:
```ts
// tree branch:
if (node && !node.isDir) {
  const abs = resolve(cwd, node.path);
  const preferDiff = editedStatus.get(node.path) === "modified";
  void peek(ctx, abs, preferDiff);
}
// search branch:
const path = filterFiles(allFiles, searchQuery)[selected];
if (path) {
  const preferDiff = editedStatus.get(path) === "modified";
  void peek(ctx, resolve(cwd, path), preferDiff);
}
```

### 5g. Update the tree hint string

```ts
const hint = "↑↓ move  ↵ open  → expand  ← collapse  spc preview  type to filter  esc close ";
```

(`spc preview` replaces `spc peek`; the diff toggle is discoverable in the preview footer.)

- [ ] **Step 1:** add imports; pass `snapshots` into `registerTreeCommands`.
- [ ] **Step 2:** add `resolveBaseline`.
- [ ] **Step 3:** extend `peek` signature + compute `diff`/`mode`.
- [ ] **Step 4:** render both modes + mode-aware footer.
- [ ] **Step 5:** handle `d` toggle.
- [ ] **Step 6:** pass `preferDiff` from the two `space` handlers; update hint.
- [ ] **Step 7: Build check**

```bash
cd packages/pi-files && npm run build 2>&1 | tail -5
```

- [ ] **Step 8: Full test run**

```bash
cd packages/pi-files && node --test test/core.test.ts 2>&1 | tail -8
```
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add extensions/pi-files.ts
git commit -m "feat(pi-files): multi-mode preview — diff-first for modified files, d toggles"
```

---

## Task 6: Manual smoke test

- [ ] **Modified file:** agent writes + edits a file → `space` opens it directly in DIFF mode, footer `[diff·session]`; press `d` → flips to CONTENT; `d` again → back to DIFF.
- [ ] **New file:** agent creates a brand-new file → `space` opens CONTENT; `d` → "no diff available" notice.
- [ ] **Reload then preview:** edit a committed file, reload pi, `space` → DIFF from `[git HEAD]` (or CONTENT if untracked).
- [ ] **Renamed file:** write → `mv` to new name → `space` on new name → DIFF still works (snapshot migrated).
- [ ] **No-op edit:** edit a file back to identical content → `space` → opens CONTENT (diff suppressed since empty); `d` → "no diff available".
- [ ] **Binary/large:** confirm no crash; binary skipped, large file respects size cap.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| New file (`status === "new"`) | plain content view, no diff (user requirement) |
| Modified, snapshot present | session diff `[session]` |
| Modified, no snapshot, git-tracked | `git show HEAD:path` diff `[git HEAD]` |
| Modified, no snapshot, untracked / no git | plain content `[no baseline]` |
| Renamed via `mv` | snapshot migrates with the rename → session diff intact |
| Edited multiple times | snapshot kept from FIRST edit (true session baseline) |
| Edit reverted to identical | "no changes" notify, overlay not shown |
| Binary file | not snapshotted; diff falls back / skipped |
| Large file (> maxPeekBytes) | not snapshotted (memory bound); git fallback still possible |
| File deleted after edit | pruned from widget already → not reachable |
| CRLF/LF + trailing newline diffs | jsdiff handles; may show a trailing-newline hunk (documented) |
| Reload (snapshots lost) | git fallback or `[no baseline]` |

## OS Compatibility Notes

- `diff` (jsdiff) is pure JavaScript — identical behavior on macOS / Linux / Windows, no native bindings.
- Git fallback uses `execFileSync("git", …)` with `try/catch` — absent git degrades to `[no baseline]`, never crashes.
- Path handling normalizes to posix for the git `HEAD:<path>` spec via `.split("\\").join("/")` (same approach already used in the tree's `toRel`).

## Out of Scope (future)

- Per-hunk accept/reject (Cursor-style) — pi-files is a viewer, not an editor.
- Side-by-side layout (unified chosen).
- Syntax highlighting *inside* diff lines (v1 uses flat +/− coloring; can layer `highlightMarkdown`/`cli-highlight` later).
