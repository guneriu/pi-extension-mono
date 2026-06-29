# pi-files Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@guneriu/pi-files`, a pi extension that shows agent-edited files in a compact widget above the input bar plus an on-demand full-screen interactive project tree.

**Architecture:** Pure logic lives in `src/core.ts` (no pi/TUI imports, fully unit-tested with `node:test`). The discoverable extension `extensions/pi-files.ts` wires pi events/UI to that logic: a `tool_call`-fed edit tracker, a `setWidget` compact view, and a `ctx.ui.custom` overlay tree sourced from `git ls-files`.

**Tech Stack:** TypeScript (Node **≥ 23.6** native type-stripping — no flag needed), `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, Node built-ins (`fs`, `path`, `child_process`), `node:test`.

> **Import convention (important):** the discoverable extension imports core with an **extensionless** specifier (`../src/core`) — matching the proven `pi-footer` → `copilot-quota` cross-file pattern that pi's loader resolves. The **test files** import with the `.ts` extension (`../src/core.ts`) because Node's native test runner / type-stripping requires explicit extensions. Do not unify these.

> **Node version note:** type-stripping is on by default for Node ≥ 23.6, so the test commands below use plain `node --test`. If you are on an older Node, add `--experimental-strip-types`.

**All commands below run from:** `/Users/U466187/Developer/projects/ai-upskill/pi-extension-mono`

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/pi-files/src/core.ts` | Pure helpers: classification, widget lines, tree build, visible rows, git parse |
| `packages/pi-files/test/core.test.ts` | `node:test` unit tests for core |
| `packages/pi-files/extensions/pi-files.ts` | Extension: events, widget, overlay tree, commands |
| `packages/pi-files/package.json` | Package manifest (`@guneriu/pi-files`) |
| `packages/pi-files/README.md` | Usage docs |
| `packages/pi-files/LICENSE` | MIT (copy from sibling package) |
| `package.json` (root) | Register extension dir in `pi.extensions` |
| `README.md` (root) | Add table row |

---

## Task 1: Package scaffolding

**Files:**
- Create: `packages/pi-files/package.json`
- Create: `packages/pi-files/LICENSE`

- [ ] **Step 1: Create `packages/pi-files/package.json`**

```json
{
  "name": "@guneriu/pi-files",
  "version": "0.1.0",
  "type": "module",
  "description": "Shows agent-edited files in a compact widget above the input bar, plus an on-demand interactive project tree (gitignore-aware)",
  "keywords": ["pi-package", "pi-extension", "files", "tree", "explorer", "session"],
  "author": "Uğur Güneri (guneriu)",
  "license": "MIT",
  "files": ["extensions/", "src/", "README.md", "LICENSE"],
  "repository": {
    "type": "git",
    "url": "https://github.com/guneriu/pi-extension-mono",
    "directory": "packages/pi-files"
  },
  "pi": {
    "extensions": ["./extensions"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*"
  }
}
```

- [ ] **Step 2: Copy LICENSE from a sibling package**

Run: `cp packages/session-files/LICENSE packages/pi-files/LICENSE`
Expected: file exists, `test -f packages/pi-files/LICENSE && echo OK` prints `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/pi-files/package.json packages/pi-files/LICENSE
git commit -m "chore(pi-files): scaffold package manifest + license"
```

---

## Task 2: Core types and edit classification (TDD)

**Files:**
- Create: `packages/pi-files/src/core.ts`
- Create: `packages/pi-files/test/core.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/pi-files/test/core.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEdit, type EditStatus } from "../src/core.ts";

test("write to a non-existent file is 'new'", () => {
  assert.equal(classifyEdit("write", false, undefined), "new");
});

test("write to an existing file is 'modified'", () => {
  assert.equal(classifyEdit("write", true, undefined), "modified");
});

test("edit is always 'modified'", () => {
  assert.equal(classifyEdit("edit", false, undefined), "modified");
  assert.equal(classifyEdit("edit", true, undefined), "modified");
});

test("'new' is sticky: never downgraded to modified", () => {
  const prev: EditStatus = "new";
  assert.equal(classifyEdit("edit", true, prev), "new");
  assert.equal(classifyEdit("write", true, prev), "new");
});

test("modified can upgrade to new (write of recreated file)", () => {
  const prev: EditStatus = "modified";
  assert.equal(classifyEdit("write", false, prev), "new");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: FAIL — cannot find module `../src/core.ts` / `classifyEdit` not exported.

- [ ] **Step 3: Write minimal implementation**

Create `packages/pi-files/src/core.ts`:

```ts
export type EditStatus = "new" | "modified";
export type EditKind = "write" | "edit";

/**
 * Decide the status glyph for a write/edit.
 * - "new" is sticky once set (the agent created the file this session).
 * - write to a path that does not currently exist => "new".
 * - everything else => "modified".
 */
export function classifyEdit(
  kind: EditKind,
  existsBefore: boolean,
  previous: EditStatus | undefined,
): EditStatus {
  if (previous === "new") return "new";
  if (kind === "write" && !existsBefore) return "new";
  return "modified";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/pi-files/src/core.ts packages/pi-files/test/core.test.ts
git commit -m "feat(pi-files): edit classification helper + tests"
```

---

## Task 3: Widget line builder (TDD)

**Files:**
- Modify: `packages/pi-files/src/core.ts`
- Modify: `packages/pi-files/test/core.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/pi-files/test/core.test.ts`:

```ts
import { buildWidgetLines, type EditedFile } from "../src/core.ts";

const files: EditedFile[] = [
  { relPath: "a.md", status: "modified" },
  { relPath: "b.md", status: "new" },
  { relPath: "c.md", status: "new" },
];

test("widget shows header + all rows when under cap", () => {
  const lines = buildWidgetLines(files, 6);
  assert.equal(lines.header, "Edited files (3)");
  assert.deepEqual(lines.rows, ["M a.md", "+ b.md", "+ c.md"]);
  assert.equal(lines.overflow, undefined);
});

test("widget caps rows and reports overflow", () => {
  const many: EditedFile[] = Array.from({ length: 10 }, (_, i) => ({
    relPath: `f${i}.md`,
    status: "modified" as const,
  }));
  const lines = buildWidgetLines(many, 6);
  assert.equal(lines.rows.length, 6);
  assert.equal(lines.overflow, "… +4 more");
});

test("empty file list yields no header/rows", () => {
  const lines = buildWidgetLines([], 6);
  assert.equal(lines.header, undefined);
  assert.deepEqual(lines.rows, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: FAIL — `buildWidgetLines` / `EditedFile` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/pi-files/src/core.ts`:

```ts
export interface EditedFile {
  relPath: string;
  status: EditStatus;
}

export interface WidgetLines {
  header: string | undefined;
  rows: string[];
  overflow: string | undefined;
}

export function statusGlyph(status: EditStatus): string {
  return status === "new" ? "+" : "M";
}

/**
 * Build plain (unstyled) widget content; the extension applies theme colors.
 * `files` MUST already be in display order (newest edit first) — the extension
 * is responsible for ordering. We keep the first `maxRows` so the newest edits
 * are shown and older ones fold into the overflow line.
 */
export function buildWidgetLines(files: EditedFile[], maxRows: number): WidgetLines {
  if (files.length === 0) {
    return { header: undefined, rows: [], overflow: undefined };
  }
  const shown = files.slice(0, maxRows);
  const rows = shown.map((f) => `${statusGlyph(f.status)} ${f.relPath}`);
  const hidden = files.length - shown.length;
  return {
    header: `Edited files (${files.length})`,
    rows,
    overflow: hidden > 0 ? `… +${hidden} more` : undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/pi-files/src/core.ts packages/pi-files/test/core.test.ts
git commit -m "feat(pi-files): widget line builder with cap + overflow"
```

---

## Task 4: Tree builder + visible rows (TDD)

**Files:**
- Modify: `packages/pi-files/src/core.ts`
- Modify: `packages/pi-files/test/core.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/pi-files/test/core.test.ts`:

```ts
import {
  buildTree,
  ancestorsOf,
  flattenVisible,
  parseGitFileList,
  type TreeNode,
} from "../src/core.ts";

test("parseGitFileList splits, trims, drops blanks", () => {
  assert.deepEqual(parseGitFileList("a.md\nsub/b.ts\n\n"), ["a.md", "sub/b.ts"]);
});

test("buildTree nests files under dirs, dirs sorted before files", () => {
  const root = buildTree(["docs/plans/rca.md", "docs/x.md", "FEATURES.md"]);
  // root children: docs (dir) before FEATURES.md (file)
  assert.deepEqual(root.children.map((c) => c.name), ["docs", "FEATURES.md"]);
  const docs = root.children[0];
  assert.equal(docs.isDir, true);
  assert.deepEqual(docs.children.map((c) => c.name), ["plans", "x.md"]);
});

test("ancestorsOf returns each parent dir path", () => {
  assert.deepEqual(ancestorsOf("docs/plans/rca.md"), ["docs", "docs/plans"]);
  assert.deepEqual(ancestorsOf("FEATURES.md"), []);
});

test("flattenVisible only descends into expanded dirs", () => {
  const root = buildTree(["docs/plans/rca.md", "FEATURES.md"]);
  const collapsed = flattenVisible(root, new Set());
  assert.deepEqual(collapsed.map((n) => n.path), ["docs", "FEATURES.md"]);
  const expanded = flattenVisible(root, new Set(["docs", "docs/plans"]));
  assert.deepEqual(expanded.map((n) => n.path), [
    "docs",
    "docs/plans",
    "docs/plans/rca.md",
    "FEATURES.md",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: FAIL — `buildTree`/`ancestorsOf`/`flattenVisible`/`parseGitFileList` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/pi-files/src/core.ts`:

```ts
export interface TreeNode {
  name: string;       // basename
  path: string;       // posix-style relative path from cwd
  isDir: boolean;
  depth: number;      // 0 for top-level entries
  children: TreeNode[];
}

/** Parse `git ls-files` style newline output into clean relative paths. */
export function parseGitFileList(out: string): string[] {
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** All ancestor directory paths of a file, root-first. "docs/plans/x" -> ["docs","docs/plans"]. */
export function ancestorsOf(relPath: string): string[] {
  const parts = relPath.split("/");
  const dirs: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    dirs.push(parts.slice(0, i + 1).join("/"));
  }
  return dirs;
}

/** Build a synthetic root node whose children are the top-level entries. */
export function buildTree(relPaths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, depth: -1, children: [] };
  for (const rel of relPaths) {
    const parts = rel.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isDir = i < parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === name && c.isDir === isDir);
      if (!child) {
        child = { name, path, isDir, depth: i, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; // dirs first
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

/** DFS over the tree, descending into a dir only when its path is in `expanded`. */
export function flattenVisible(root: TreeNode, expanded: Set<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode) => {
    for (const child of n.children) {
      out.push(child);
      if (child.isDir && expanded.has(child.path)) walk(child);
    }
  };
  walk(root);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: PASS (12 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/pi-files/src/core.ts packages/pi-files/test/core.test.ts
git commit -m "feat(pi-files): tree builder, ancestors, visible-row flatten + tests"
```

---

## Task 5: Edit tracker module (session scan, no TUI)

**Files:**
- Modify: `packages/pi-files/src/core.ts`
- Modify: `packages/pi-files/test/core.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/pi-files/test/core.test.ts`:

```ts
import { extractEditsFromBranch } from "../src/core.ts";

test("extractEditsFromBranch collects write/edit paths from assistant toolCalls", () => {
  const branch = [
    { type: "message", message: { role: "assistant", content: [
      { type: "toolCall", name: "edit", arguments: { path: "/repo/a.md" } },
      { type: "toolCall", name: "read", arguments: { path: "/repo/skip.md" } },
      { type: "toolCall", name: "write", arguments: { path: "/repo/b.md" } },
    ] } },
    { type: "message", message: { role: "user", content: [] } },
  ];
  const result = extractEditsFromBranch(branch);
  assert.deepEqual(result, [
    { path: "/repo/a.md", kind: "edit" },
    { path: "/repo/b.md", kind: "write" },
  ]);
});

test("extractEditsFromBranch ignores non-assistant + missing paths", () => {
  const branch = [
    { type: "message", message: { role: "assistant", content: [
      { type: "toolCall", name: "write", arguments: {} },
    ] } },
  ];
  assert.deepEqual(extractEditsFromBranch(branch), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: FAIL — `extractEditsFromBranch` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/pi-files/src/core.ts`:

```ts
export interface BranchEdit {
  path: string;
  kind: EditKind;
}

/**
 * Scan a session branch (ctx.sessionManager.getBranch()) for write/edit tool
 * calls and return their target paths in order. Mirrors the toolCall shape used
 * across pi sessions: assistant message -> content[] -> { type:"toolCall", name, arguments }.
 */
export function extractEditsFromBranch(branch: any[]): BranchEdit[] {
  const edits: BranchEdit[] = [];
  for (const entry of branch) {
    if (entry?.type !== "message") continue;
    if (entry.message?.role !== "assistant") continue;
    for (const block of entry.message?.content ?? []) {
      if (block?.type !== "toolCall") continue;
      const kind = block.name;
      if (kind !== "write" && kind !== "edit") continue;
      const path = block.arguments?.path;
      if (typeof path !== "string" || path.length === 0) continue;
      edits.push({ path, kind });
    }
  }
  return edits;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/pi-files/src/core.ts packages/pi-files/test/core.test.ts
git commit -m "feat(pi-files): session branch edit extractor + tests"
```

---

## Task 6: File-list source (git ls-files + fallback)

**Files:**
- Modify: `packages/pi-files/src/core.ts`
- Modify: `packages/pi-files/test/core.test.ts`

This task adds an impure helper that shells out to git, with a filesystem
fallback. The pure parsing is already tested (Task 4); here we test the fallback
walker against a temp dir.

- [ ] **Step 1: Write the failing test**

Append to `packages/pi-files/test/core.test.ts`:

```ts
import { walkDirRelative } from "../src/core.ts";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("walkDirRelative lists files relative, excluding .git and node_modules", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-files-"));
  mkdirSync(join(dir, "sub"));
  mkdirSync(join(dir, ".git"));
  mkdirSync(join(dir, "node_modules"));
  writeFileSync(join(dir, "a.md"), "x");
  writeFileSync(join(dir, "sub", "b.ts"), "x");
  writeFileSync(join(dir, ".git", "cfg"), "x");
  writeFileSync(join(dir, "node_modules", "dep.js"), "x");

  const files = walkDirRelative(dir).sort();
  assert.deepEqual(files, ["a.md", "sub/b.ts"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: FAIL — `walkDirRelative` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/pi-files/src/core.ts`:

```ts
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ALWAYS_EXCLUDE = new Set([".git", "node_modules"]);

/** Recursive readdir fallback returning posix-relative paths, excluding noise dirs. */
export function walkDirRelative(cwd: string): string[] {
  const out: string[] = [];
  const walk = (absDir: string, relPrefix: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && ALWAYS_EXCLUDE.has(e.name)) continue;
      const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(`${absDir}/${e.name}`, rel);
      } else if (e.isFile()) {
        out.push(rel);
      }
    }
  };
  walk(cwd, "");
  return out;
}

/**
 * Preferred source: git ls-files (respects .gitignore exactly). Falls back to a
 * filesystem walk when not a git repo or git is unavailable.
 *
 * Note: `git ls-files --cached` can report staged-but-deleted paths, so we drop
 * entries that no longer exist on disk before building the tree.
 */
export function listProjectFiles(cwd: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const files = parseGitFileList(out).filter((rel) => existsSync(join(cwd, rel)));
    if (files.length > 0) return files;
    return walkDirRelative(cwd);
  } catch {
    return walkDirRelative(cwd);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: PASS (15 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/pi-files/src/core.ts packages/pi-files/test/core.test.ts
git commit -m "feat(pi-files): project file source (git ls-files + fs fallback)"
```

---

## Task 7: Extension wiring — tracker + widget (tree stub)

**Files:**
- Create: `packages/pi-files/extensions/pi-files.ts`

No new unit tests (TUI/event wiring is verified by the manual smoke test in
Task 9). The file compiles and is committed on its own via a `registerTreeCommands`
stub that Task 8 replaces.

- [ ] **Step 1: Create the extension file (settings + tracker + widget + tree stub)**

Create `packages/pi-files/extensions/pi-files.ts`:

```ts
/**
 * agent-files (@guneriu/pi-files)
 *
 * Compact widget above the input bar listing files the agent edited this
 * session, plus an on-demand interactive project tree (/pi-files, /files).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  buildWidgetLines,
  classifyEdit,
  extractEditsFromBranch,
  statusGlyph,
  type EditStatus,
  type EditedFile,
} from "../src/core";

// ─── Settings ───────────────────────────────────────────────────────────────
interface Settings {
  enabled: boolean;
  maxWidgetRows: number;
  showIdleHint: boolean;
}
const DEFAULTS: Settings = { enabled: true, maxWidgetRows: 6, showIdleHint: true };

function getSettingsFile(): string {
  const dir = `${getAgentDir()}/extensions/pi-files`;
  mkdirSync(dir, { recursive: true });
  return `${dir}/settings.json`;
}
function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(getSettingsFile(), "utf-8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

const WIDGET_ID = "pi-files";

export default function (pi: ExtensionAPI) {
  // absPath -> status, insertion-ordered (oldest first; rendered newest-first).
  const edited = new Map<string, EditStatus>();
  // toolCallId -> pre-execution context, committed on success (S1).
  const pending = new Map<
    string,
    { abs: string; kind: "write" | "edit"; existsBefore: boolean }
  >();
  // Loaded once per session, not on every tool call (S2).
  let settings: Settings = loadSettings();

  function toEditedFiles(cwd: string): EditedFile[] {
    // Newest-first so the compact widget shows the most recent edits (C1).
    return [...edited.entries()].reverse().map(([abs, status]) => ({
      relPath: relative(cwd, abs) || abs,
      status,
    }));
  }

  function renderWidget(ctx: any) {
    if (ctx.mode !== "tui") return;
    if (!settings.enabled) {
      ctx.ui.setWidget(WIDGET_ID, undefined);
      return;
    }
    const cwd = ctx.sessionManager.getCwd();
    const files = toEditedFiles(cwd);

    if (files.length === 0) {
      if (settings.showIdleHint) {
        ctx.ui.setWidget(WIDGET_ID, (_tui: any, theme: any) => ({
          render: () => [theme.fg("dim", "📁 /pi-files — file tree")],
          invalidate: () => {},
        }));
      } else {
        ctx.ui.setWidget(WIDGET_ID, undefined);
      }
      return;
    }

    const w = buildWidgetLines(files, settings.maxWidgetRows);
    const shown = files.slice(0, settings.maxWidgetRows);
    ctx.ui.setWidget(WIDGET_ID, (_tui: any, theme: any) => ({
      render: () => {
        const lines: string[] = [];
        if (w.header) {
          lines.push(theme.fg("accent", w.header) + theme.fg("dim", "  ·  /pi-files"));
        }
        for (const f of shown) {
          const color = f.status === "new" ? "success" : "warning";
          lines.push(theme.fg(color, statusGlyph(f.status) + " ") + theme.fg("muted", f.relPath));
        }
        if (w.overflow) lines.push(theme.fg("dim", w.overflow));
        return lines;
      },
      invalidate: () => {},
    }));
  }

  function rebuildFromHistory(ctx: any) {
    edited.clear();
    const branch = ctx.sessionManager.getBranch();
    for (const e of extractEditsFromBranch(branch)) {
      const abs = resolve(ctx.sessionManager.getCwd(), e.path);
      // Reconstruction cannot know the pre-write filesystem state, so we treat
      // history-derived edits as "modified" (existsBefore = true). Live
      // tool_call tracking provides accurate new/modified during the session.
      const status = classifyEdit(e.kind, true, edited.get(abs));
      edited.set(abs, status);
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    settings = loadSettings();
    rebuildFromHistory(ctx);
    renderWidget(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    edited.clear();
    pending.clear();
    if (ctx?.mode === "tui") ctx.ui.setWidget(WIDGET_ID, undefined); // N1
  });

  // Capture pre-execution state on tool_call (fires before the tool runs), so
  // existsSync reflects the pre-write filesystem (new vs modified).
  pi.on("tool_call", async (event, ctx) => {
    if (ctx.mode !== "tui") return;
    let kind: "write" | "edit" | undefined;
    if (isToolCallEventType("write", event)) kind = "write";
    else if (isToolCallEventType("edit", event)) kind = "edit";
    if (!kind) return;
    const rawPath = (event.input as { path?: string }).path;
    if (!rawPath) return;
    const abs = resolve(ctx.sessionManager.getCwd(), rawPath);
    pending.set(event.toolCallId, { abs, kind, existsBefore: existsSync(abs) });
  });

  // Commit only on success (S1): a failed write/edit must not appear as edited.
  pi.on("tool_execution_end", async (event, ctx) => {
    if (ctx.mode !== "tui") return;
    const p = pending.get(event.toolCallId);
    if (!p) return;
    pending.delete(event.toolCallId);
    if (event.isError) return;
    const prev = edited.get(p.abs);   // read BEFORE delete so sticky-new survives
    edited.delete(p.abs);             // re-insert so the newest edit sorts last
    edited.set(p.abs, classifyEdit(p.kind, p.existsBefore, prev));
    renderWidget(ctx);
  });

  registerTreeCommands(pi, edited);
}

// Stub replaced by the real interactive tree in Task 8. Keeping it here lets
// this file compile and be committed on its own (S5).
function registerTreeCommands(_pi: ExtensionAPI, _edited: Map<string, EditStatus>) {}
```

- [ ] **Step 2: Run the core tests (must still pass)**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: PASS (15 tests) — the new file must not break core.

- [ ] **Step 3: Commit**

```bash
git add packages/pi-files/extensions/pi-files.ts
git commit -m "feat(pi-files): settings, edit tracker, compact widget (tree stub)"
```

---

## Task 8: Extension wiring — interactive tree overlay (replaces stub)

**Files:**
- Modify: `packages/pi-files/extensions/pi-files.ts`

- [ ] **Step 1: Extend imports**

Replace the core import block with the fuller one (adds the tree helpers; keep
the **extensionless** `../src/core` specifier — C3):

```ts
import {
  ancestorsOf,
  buildTree,
  buildWidgetLines,
  classifyEdit,
  extractEditsFromBranch,
  flattenVisible,
  listProjectFiles,
  statusGlyph,
  type EditStatus,
  type EditedFile,
} from "../src/core";
```

And add TUI imports at the top of the file (after the existing pi import):

```ts
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
```

- [ ] **Step 2: Replace the `registerTreeCommands` stub**

Replace the stub `registerTreeCommands` at the end of
`packages/pi-files/extensions/pi-files.ts` with the real implementation:

```ts
function registerTreeCommands(pi: ExtensionAPI, edited: Map<string, EditStatus>) {
  const open = async (ctx: any) => {
    if (ctx.mode !== "tui") {
      ctx.ui.notify("/pi-files requires TUI mode", "error");
      return;
    }
    const cwd = ctx.sessionManager.getCwd();
    const root = buildTree(listProjectFiles(cwd));

    // Edited files as cwd-relative posix paths for highlight + auto-expand.
    const toRel = (abs: string) => relative(cwd, abs).split("\\").join("/");
    const editedStatus = new Map<string, EditStatus>();
    for (const [abs, status] of edited.entries()) editedStatus.set(toRel(abs), status);

    const expanded = new Set<string>();
    for (const rel of editedStatus.keys()) {
      for (const dir of ancestorsOf(rel)) expanded.add(dir);
    }

    let selected = 0;
    let scroll = 0;

    await ctx.ui.custom(
      (tui: any, theme: any, _kb: any, done: (v: null) => void) => {
        const B = (s: string) => theme.fg("border", s);

        // C2: derive body height from the terminal so the box stays close to the
        // 80% maxHeight (degenerate <~6-row terminals keep a 1-row minimum).
        const visibleBody = (): number => {
          const max = Math.max(1, Math.floor(tui.terminal.rows * 0.8) - 4);
          const total = flattenVisible(root, expanded).length || 1;
          return Math.min(max, total);
        };

        const buildBody = (innerW: number, bodyH: number): string[] => {
          const rows = flattenVisible(root, expanded);
          if (selected >= rows.length) selected = rows.length - 1;
          if (selected < 0) selected = 0;
          if (selected < scroll) scroll = selected;
          if (selected >= scroll + bodyH) scroll = selected - bodyH + 1;
          if (scroll < 0) scroll = 0;

          return rows.slice(scroll, scroll + bodyH).map((n, i) => {
            const idx = scroll + i;
            const indent = "  ".repeat(n.depth);
            const caret = n.isDir ? (expanded.has(n.path) ? "▾ " : "▸ ") : "  ";
            const status = !n.isDir ? editedStatus.get(n.path) : undefined;

            // S4: raw + styled share identical glyph prefixes so widths match.
            const namePlain = status ? `${statusGlyph(status)} ${n.name}` : n.name;
            const nameStyled = status
              ? theme.fg(status === "new" ? "success" : "warning", namePlain)
              : n.isDir
                ? theme.fg("accent", n.name)
                : theme.fg("muted", n.name);

            // S3: reserve a 1-col cursor gutter; row content starts at column 2,
            // so the selection marker never overwrites the caret/glyph.
            const gutter = idx === selected ? theme.fg("accent", "›") : " ";
            const contentPlain = ` ${indent}${caret}${namePlain}`;
            const contentStyled = ` ${indent}${caret}${nameStyled}`;
            const pad = " ".repeat(Math.max(0, innerW - 1 - visibleWidth(contentPlain)));
            return gutter + contentStyled + pad;
          });
        };

        const build = (width: number): string[] => {
          const innerW = width - 2;
          const bodyH = visibleBody();
          const H = "─";
          const lines: string[] = [];
          lines.push(B("╭" + H.repeat(innerW) + "╮"));
          const title = " 📁 Project files";
          const hint = "↑↓ move  → expand  ← collapse  esc close ";
          const gap = Math.max(1, innerW - visibleWidth(title) - visibleWidth(hint));
          lines.push(B("│") + theme.fg("accent", title) + " ".repeat(gap) +
            theme.fg("dim", hint) + B("│"));
          lines.push(B("├" + H.repeat(innerW) + "┤"));
          // Pad every cell to exactly innerW visible cols AFTER truncation so the
          // right border stays aligned for short, exact, and over-long rows.
          const body = buildBody(innerW, bodyH);
          const rowsOut = body.length ? body : [theme.fg("dim", " (no files)")];
          for (const row of rowsOut) {
            const cell = truncateToWidth(row, innerW);
            lines.push(B("│") + cell + " ".repeat(Math.max(0, innerW - visibleWidth(cell))) + B("│"));
          }
          lines.push(B("╰" + H.repeat(innerW) + "╯"));
          return lines;
        };

        return {
          render: (w: number) => build(w),
          invalidate: () => {},
          handleInput: (data: string) => {
            const rows = flattenVisible(root, expanded);
            if (matchesKey(data, Key.escape) || data === "q") return done(null);
            if (rows.length === 0) return; // nothing to navigate (empty tree)
            if (matchesKey(data, Key.up)) { selected = Math.max(0, selected - 1); tui.requestRender(); return; }
            if (matchesKey(data, Key.down)) { selected = Math.min(rows.length - 1, selected + 1); tui.requestRender(); return; }
            const node = rows[selected];
            if (!node) return;
            if (matchesKey(data, Key.right) || data === "\r") {
              if (node.isDir) { expanded.add(node.path); tui.requestRender(); }
              return;
            }
            if (matchesKey(data, Key.left)) {
              if (node.isDir && expanded.has(node.path)) {
                expanded.delete(node.path);
              } else {
                const parents = ancestorsOf(node.path);
                const parent = parents[parents.length - 1];
                if (parent) {
                  const pIdx = flattenVisible(root, expanded).findIndex((n) => n.path === parent);
                  if (pIdx >= 0) selected = pIdx;
                }
              }
              tui.requestRender();
              return;
            }
          },
        };
      },
      {
        overlay: true,
        overlayOptions: { width: "80%", maxWidth: 100, minWidth: 50, maxHeight: "80%", anchor: "center" },
      },
    );
  };

  pi.registerCommand("pi-files", { description: "Browse the project file tree (agent edits highlighted)", handler: (_a, ctx) => open(ctx) });
  pi.registerCommand("files", { description: "Alias for /pi-files", handler: (_a, ctx) => open(ctx) });
}
```

- [ ] **Step 3: Type-check / sanity-run the core tests still pass**

Run: `node --test packages/pi-files/test/core.test.ts`
Expected: PASS (15 tests) — extension changes must not break core.

- [ ] **Step 4: Commit**

```bash
git add packages/pi-files/extensions/pi-files.ts
git commit -m "feat(pi-files): widget + interactive project tree overlay"
```

---

## Task 9: Register in monorepo + README + manual smoke test

**Files:**
- Modify: `package.json` (root)
- Modify: `README.md` (root)
- Create: `packages/pi-files/README.md`

- [ ] **Step 1: Register the extension in root `package.json`**

In `package.json`, add the new path to `pi.extensions` (keep existing entries):

```json
  "pi": {
    "extensions": [
      "./packages/copilot-quota/extensions",
      "./packages/pi-footer/extensions",
      "./packages/session-files/extensions",
      "./packages/keybindings-help/extensions",
      "./packages/pi-files/extensions"
    ]
  },
```

- [ ] **Step 2: Add a row to the root `README.md` Extensions table**

Add under the existing table rows:

```markdown
| [`@guneriu/pi-files`](./packages/pi-files) | `pi install npm:@guneriu/pi-files` | Agent-edited files widget + interactive project tree (`/pi-files`, `/files`) |
```

- [ ] **Step 3: Create `packages/pi-files/README.md`**

```markdown
# @guneriu/pi-files

Shows the files the agent edited this session in a compact widget above the
input bar, and opens an interactive, gitignore-aware project tree on demand.

## Features

- **Compact widget** above the editor: `+` new / `M` modified, capped rows with
  `… +N more` overflow so a big change set never swamps the terminal.
- **Idle hint** when nothing is edited yet (toggle off in settings).
- **`/pi-files`** (alias **`/files`**) — full-screen tree overlay. Arrow keys
  move, `→`/Enter expand, `←` collapse / jump to parent, `Esc`/`q` close.
- Respects `.gitignore` via `git ls-files`; falls back to a filesystem walk
  outside git repos.

## Install

```bash
pi install npm:@guneriu/pi-files
# or the whole mono:
pi install git:github.com/guneriu/pi-extension-mono
```

## Settings

`<agent-dir>/extensions/pi-files/settings.json`:

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master on/off |
| `maxWidgetRows` | `6` | Max file rows in the compact widget |
| `showIdleHint` | `true` | Show the one-line hint when no edits yet |
```

- [ ] **Step 4: Run the full core test suite**

Run: `node --test packages/pi-files/test/`
Expected: PASS (15 tests).

- [ ] **Step 5: Manual TUI smoke test**

Run:
```bash
pi install ./pi-extension-mono   # or: cd into a project and use -e
```
Then in a pi TUI session in a git repo:
1. Confirm the idle hint `📁 /pi-files — file tree` appears above the input.
2. Ask the agent to create/edit a couple files; confirm the widget shows
   `Edited files (N)` with `+`/`M` rows, **newest edit on top** (C1).
3. Trigger a write that fails (e.g. to a read-only path); confirm that file is
   **not** listed (S1).
4. Run `/pi-files`; confirm the overlay opens, auto-expanded to edited files,
   arrows/expand/collapse/esc work, edited files are highlighted, the selection
   marker does not hide the ▾/▸ caret (S3), and edited filenames are not clipped (S4).
5. Shrink the terminal to ~15 rows and reopen `/pi-files`; confirm the box
   fits with all borders visible and scrolls (C2).
6. Edit >6 files; confirm widget caps at 6 rows + `… +N more`.

Expected: all behaviors verified.

- [ ] **Step 6: Commit**

```bash
git add package.json README.md packages/pi-files/README.md
git commit -m "feat(pi-files): register in monorepo + docs"
```

---

## Self-Review Notes

- **Spec coverage:** widget (T3,T7), idle hint (T7), overflow cap (T3,T7),
  edit detection live + reconstruct (T2,T5,T7), tree + auto-expand + gitignore
  (T4,T6,T8), commands (T8), monorepo registration + docs (T9). All covered.
- **Type consistency:** `EditStatus`, `EditKind`, `EditedFile`, `TreeNode`,
  `BranchEdit` defined in `core.ts` (T2–T6) and consumed unchanged in the
  extension (T7–T8). `classifyEdit`, `buildWidgetLines`, `buildTree`,
  `ancestorsOf`, `flattenVisible`, `listProjectFiles`, `extractEditsFromBranch`,
  `statusGlyph` signatures match call sites.
- **Each task is independently green:** Task 7 ships a `registerTreeCommands`
  stub so the extension compiles and is committed on its own; Task 8 replaces the
  stub (S5). No task leaves the tree in a non-compiling state.
- **Oracle review fixes folded in:**
  - C1 — widget renders newest-first (`toEditedFiles` reverses) (T7).
  - C2 — overlay body height derived from `tui.terminal.rows * 0.8 - 4` so the
    box tracks the `maxHeight` budget (degenerate sub-6-row terminals keep a
    1-row minimum) and scroll math uses the same `bodyH` (T8).
  - C3 — extension imports `../src/core` (extensionless); tests import
    `../src/core.ts` (Tech Stack note + T7/T8).
  - S1 — edits committed on `tool_execution_end` only when `!isError`;
    pre-state captured on `tool_call` keyed by `toolCallId` (T7).
  - S2 — settings loaded once per session, not per tool call (T7).
  - S3 — 1-col cursor gutter so the selection marker never overwrites the
    caret/glyph (T8).
  - S4 — padding width computed from a `contentPlain` that includes the same
    `+`/`M ` glyph as the styled string (T8).
  - N1 — `session_shutdown` clears the widget (`setWidget(undefined)`) (T7).
  - N2 — test commands use plain `node --test` (type-stripping default on
    Node ≥ 23.6).
  - N3 — `listProjectFiles` drops staged-but-deleted paths via `existsSync` (T6).
  - N4 — overlay factory arg renamed `_tui` → `tui` (it is used) (T8).
```
