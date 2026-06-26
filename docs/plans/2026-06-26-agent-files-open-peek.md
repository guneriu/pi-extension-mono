# agent-files: Open & Peek Files — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file launching to the `/agent-files` tree — `Enter` opens a file in the OS default app (cross-platform), `p` opens an in-TUI syntax-highlighted scrollable peek, with a configurable size cap.

**Architecture:** Pure helpers (`buildOpenCommand`, `detectLanguageFromPath`, `looksBinary`, `isPreviewable`) land in `src/core.ts` with `node:test` coverage. The extension wires them: a zero-dependency `child_process.spawn` opener, a `cli-highlight`-powered peek overlay, and two new key handlers in the existing tree overlay. A new persistent setting `maxPeekBytes` is exposed through the existing `/agent-files-settings` menu.

**Tech Stack:** TypeScript (Node ≥ 23.6 native type-stripping), `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `cli-highlight` (new runtime dep), Node built-ins (`fs`, `path`, `child_process`), `node:test`.

> **Import convention:** the extension imports core **extensionless** (`../src/core`); test files import `../src/core.ts` (Node's native test runner needs the explicit extension). Do not unify these.

**All commands run from:** `/Users/U466187/Developer/projects/ai-upskill/pi-extension-mono`

**Spec:** `docs/specs/2026-06-26-agent-files-open-peek-design.md`

---

## File Structure

| File | Change |
|---|---|
| `packages/agent-files/src/core.ts` | Add `buildOpenCommand`, `detectLanguageFromPath`, `looksBinary`, `isPreviewable` |
| `packages/agent-files/test/core.test.ts` | Add unit tests for the four helpers |
| `packages/agent-files/package.json` | Add `dependencies: { "cli-highlight": "^2.1.11" }` |
| `package.json` (root) | Add `dependencies: { "cli-highlight": "^2.1.11" }` so the git/mono install path resolves it too |
| `packages/agent-files/extensions/agent-files.ts` | New `maxPeekBytes` setting, settings-menu row, external-open spawn, peek overlay, new tree keys |
| `packages/agent-files/README.md` | Document open/peek keys + the new setting |

> **Oracle-review fixes folded in:** (B1) `notify` severity is `"warning"` not `"warn"`. (B2) `cli-highlight` is added to BOTH the sub-package and the **root** `package.json`, and is imported **lazily + gracefully** so a missing dep only disables coloring instead of crashing the whole extension. (S3) merged `node:fs`/`node:path` imports are shown verbatim. (S4) force color on so cli-highlight actually emits ANSI under pi's managed stdout. (S5) every peek row gets a trailing reset so multi-line token colors never bleed into padding/border. (S8) peek scroll is clamped in the handler.

---

## Task 1: Core helper — `buildOpenCommand` (TDD)

**Files:**
- Modify: `packages/agent-files/src/core.ts`
- Modify: `packages/agent-files/test/core.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/agent-files/test/core.test.ts`:

```ts
import { buildOpenCommand } from "../src/core.ts";

test("buildOpenCommand uses `open` on macOS", () => {
  assert.deepEqual(buildOpenCommand("darwin", "/repo/a.md"), {
    cmd: "open",
    args: ["/repo/a.md"],
  });
});

test("buildOpenCommand uses cmd/start on Windows", () => {
  assert.deepEqual(buildOpenCommand("win32", "C:\\repo\\a.md"), {
    cmd: "cmd",
    args: ["/c", "start", "", "C:\\repo\\a.md"],
  });
});

test("buildOpenCommand falls back to xdg-open elsewhere", () => {
  assert.deepEqual(buildOpenCommand("linux", "/repo/a.md"), {
    cmd: "xdg-open",
    args: ["/repo/a.md"],
  });
  assert.deepEqual(buildOpenCommand("freebsd", "/repo/a.md"), {
    cmd: "xdg-open",
    args: ["/repo/a.md"],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/agent-files/test/core.test.ts`
Expected: FAIL — `buildOpenCommand` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/agent-files/src/core.ts`:

```ts
export interface OpenCommand {
  cmd: string;
  args: string[];
}

/**
 * Map a platform + absolute path to a spawnable OS "open with default app"
 * command. Pure so it can be unit-tested without spawning anything.
 * - darwin  -> `open <path>`
 * - win32   -> `cmd /c start "" <path>`  (empty "" is the start window title)
 * - other   -> `xdg-open <path>`         (linux, *bsd, incl. WSL)
 */
export function buildOpenCommand(
  platform: NodeJS.Platform,
  absPath: string,
): OpenCommand {
  if (platform === "darwin") return { cmd: "open", args: [absPath] };
  if (platform === "win32") return { cmd: "cmd", args: ["/c", "start", "", absPath] };
  return { cmd: "xdg-open", args: [absPath] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/agent-files/test/core.test.ts`
Expected: PASS (18 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-files/src/core.ts packages/agent-files/test/core.test.ts
git commit -m "feat(agent-files): buildOpenCommand cross-platform opener helper + tests"
```

---

## Task 2: Core helpers — `detectLanguageFromPath`, `looksBinary`, `isPreviewable` (TDD)

**Files:**
- Modify: `packages/agent-files/src/core.ts`
- Modify: `packages/agent-files/test/core.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/agent-files/test/core.test.ts`:

```ts
import {
  detectLanguageFromPath,
  looksBinary,
  isPreviewable,
} from "../src/core.ts";

test("detectLanguageFromPath maps known extensions", () => {
  assert.equal(detectLanguageFromPath("src/core.ts"), "typescript");
  assert.equal(detectLanguageFromPath("a/b.js"), "javascript");
  assert.equal(detectLanguageFromPath("data.json"), "json");
  assert.equal(detectLanguageFromPath("README.md"), "markdown");
});

test("detectLanguageFromPath returns undefined for unknown/extensionless", () => {
  assert.equal(detectLanguageFromPath("Makefile"), undefined);
  assert.equal(detectLanguageFromPath("weird.xyz"), undefined);
});

test("looksBinary detects a NUL byte, passes plain text", () => {
  assert.equal(looksBinary(Buffer.from("hello world")), false);
  assert.equal(looksBinary(Buffer.from([0x68, 0x00, 0x69])), true);
});

test("isPreviewable is true at/under cap, false over", () => {
  assert.equal(isPreviewable(100, 512), true);
  assert.equal(isPreviewable(512, 512), true);
  assert.equal(isPreviewable(513, 512), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/agent-files/test/core.test.ts`
Expected: FAIL — the three helpers are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/agent-files/src/core.ts`:

```ts
/** Minimal extension → cli-highlight language id map. Undefined ⇒ auto-detect. */
const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  py: "python",
  rs: "rust",
  go: "go",
  c: "c",
  h: "c",
  cpp: "cpp",
  java: "java",
  rb: "ruby",
  toml: "ini",
  sql: "sql",
};

/** Language id for cli-highlight from a file path, or undefined to auto-detect. */
export function detectLanguageFromPath(path: string): string | undefined {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return undefined; // no ext, or dotfile like ".env"
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_LANG[ext];
}

/** Heuristic: a NUL byte in the sampled bytes means "binary". */
export function looksBinary(buf: Buffer | Uint8Array): boolean {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/** True when a file of `sizeBytes` is within the peek cap `maxBytes`. */
export function isPreviewable(sizeBytes: number, maxBytes: number): boolean {
  return sizeBytes <= maxBytes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/agent-files/test/core.test.ts`
Expected: PASS (22 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-files/src/core.ts packages/agent-files/test/core.test.ts
git commit -m "feat(agent-files): language detect + binary + previewable helpers + tests"
```

---

## Task 3: Add `cli-highlight` dependency (sub-package + root) + `maxPeekBytes` setting

**Files:**
- Modify: `packages/agent-files/package.json`
- Modify: `package.json` (root)
- Modify: `packages/agent-files/extensions/agent-files.ts`

- [ ] **Step 1: Add the runtime dependency to the sub-package**

In `packages/agent-files/package.json`, add a `dependencies` block (keep
`peerDependencies` as-is). Insert it directly before `"peerDependencies"`:

```json
  "dependencies": {
    "cli-highlight": "^2.1.11"
  },
```

- [ ] **Step 2: Add the same dependency to the ROOT `package.json` (B2)**

The README documents `pi install git:github.com/guneriu/pi-extension-mono`. That
path runs `npm install` at the repo root, which is **not** an npm workspace, so it
will NOT descend into `packages/*`. Without a root dep, `cli-highlight` is absent
on the git/mono install path. Add a root `dependencies` block (the root currently
has only `peerDependencies`):

```json
  "dependencies": {
    "cli-highlight": "^2.1.11"
  },
```

- [ ] **Step 3: Install it (resolves locally for the smoke test)**

Run: `cd packages/agent-files && npm install && cd ../.. && npm install`
Expected: `cli-highlight` resolves. Verify either location exists:
`(test -d packages/agent-files/node_modules/cli-highlight || test -d node_modules/cli-highlight) && echo OK` prints `OK`.

- [ ] **Step 4: Extend the `Settings` type + defaults**

In `packages/agent-files/extensions/agent-files.ts`, update the `Settings`
interface and `DEFAULTS` (currently 3 keys):

Replace:

```ts
interface Settings {
  enabled: boolean;
  maxWidgetRows: number;
  showIdleHint: boolean;
}
const DEFAULTS: Settings = { enabled: true, maxWidgetRows: 6, showIdleHint: true };
```

With:

```ts
interface Settings {
  enabled: boolean;
  maxWidgetRows: number;
  showIdleHint: boolean;
  maxPeekBytes: number;
}
const DEFAULTS: Settings = {
  enabled: true,
  maxWidgetRows: 6,
  showIdleHint: true,
  maxPeekBytes: 524288, // 512 KB
};
```

- [ ] **Step 5: Verify core tests still pass**

Run: `node --test packages/agent-files/test/core.test.ts`
Expected: PASS (22 tests) — manifest/type changes must not break core.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-files/package.json package.json packages/agent-files/extensions/agent-files.ts
git commit -m "feat(agent-files): add cli-highlight dep (sub+root) + maxPeekBytes setting"
```

> Note: if `package-lock.json` files were created/changed by `npm install`, include them too (`git add package-lock.json packages/agent-files/package-lock.json`).

---

## Task 4: Settings menu — "Max peek size (KB)" row

**Files:**
- Modify: `packages/agent-files/extensions/agent-files.ts`

- [ ] **Step 1: Add the number row to the settings `items` array**

In `registerSettingsCommand`, the `items: MenuItem[]` array currently ends with
the "Show idle hint" toggle. Add a new number item **after** it (before the
closing `];`). The menu edits **KB**; storage stays in **bytes**:

```ts
        {
          kind: "number",
          label: "Max peek size (KB)",
          get: () => Math.round(getSettings().maxPeekBytes / 1024),
          inc: () => updateSettings((s) => {
            s.maxPeekBytes = Math.min(8192 * 1024, s.maxPeekBytes + 64 * 1024);
          }, ctx),
          dec: () => updateSettings((s) => {
            s.maxPeekBytes = Math.max(64 * 1024, s.maxPeekBytes - 64 * 1024);
          }, ctx),
          min: 64,
          max: 8192,
        },
```

> The existing number renderer shows `String(item.get())` and compares against
> `item.min`/`item.max` for the dim-arrow state. Because `get()` returns KB and
> `min`/`max` are KB, the `‹`/`›` arrows dim correctly at the 64/8192 bounds.

- [ ] **Step 2: Verify core tests still pass**

Run: `node --test packages/agent-files/test/core.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 3: Commit**

```bash
git add packages/agent-files/extensions/agent-files.ts
git commit -m "feat(agent-files): expose maxPeekBytes in settings menu (KB)"
```

---

## Task 5: External open on `Enter` (tree overlay)

**Files:**
- Modify: `packages/agent-files/extensions/agent-files.ts`

- [ ] **Step 1: Extend imports**

Add `spawn` from `node:child_process` and `buildOpenCommand` from core.

At the top, after the existing `node:path` import, add:

```ts
import { spawn } from "node:child_process";
```

And in the `../src/core` import block (the one used by the extension), add
`buildOpenCommand` to the named imports.

- [ ] **Step 2: Add an `openExternally` helper inside `registerTreeCommands`**

In `registerTreeCommands`, immediately inside the function body (before
`const open = async (ctx: any) => {`), add:

```ts
  const openExternally = (ctx: any, absPath: string) => {
    const { cmd, args } = buildOpenCommand(process.platform, absPath);
    try {
      const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
      child.on("error", () => {
        ctx.ui.notify(`Could not open ${absPath}`, "error");
      });
      child.unref();
    } catch {
      ctx.ui.notify(`Could not open ${absPath}`, "error");
    }
  };
```

- [ ] **Step 3: Split `Enter` from `→` in the tree `handleInput`**

The current handler combines them:

```ts
            if (matchesKey(data, Key.right) || data === "\r") {
              if (node.isDir) { expanded.add(node.path); tui.requestRender(); }
              return;
            }
```

Replace that block with separate handling so `Enter` opens files while arrows
stay tree-only:

```ts
            if (data === "\r") {
              if (node.isDir) {
                expanded.add(node.path);
                tui.requestRender();
              } else {
                openExternally(ctx, resolve(cwd, node.path));
              }
              return;
            }
            if (matchesKey(data, Key.right)) {
              if (node.isDir) { expanded.add(node.path); tui.requestRender(); }
              return;
            }
```

> `cwd` and `resolve` are already in scope (`resolve` is imported at the top;
> `cwd` is captured at the start of `open`). `node.path` is cwd-relative posix.

- [ ] **Step 4: Update the tree overlay hint line to mention Enter/open**

Replace the tree hint string:

```ts
          const hint = "↑↓ move  → expand  ← collapse  esc close ";
```

with:

```ts
          const hint = "↑↓ move  ↵ open  → expand  ← collapse  p peek  esc close ";
```

- [ ] **Step 5: Verify core tests still pass**

Run: `node --test packages/agent-files/test/core.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/agent-files/extensions/agent-files.ts
git commit -m "feat(agent-files): Enter opens files in OS default app"
```

---

## Task 6: In-TUI peek overlay on `p` (tree overlay)

**Files:**
- Modify: `packages/agent-files/extensions/agent-files.ts`

- [ ] **Step 1: Extend imports for the peek (merged, no duplicates) (S3)**

`readFileSync` is already imported from `node:fs` and `relative`/`resolve` from
`node:path`. Replace those two existing import lines with the merged forms (do
NOT add a second `node:fs`/`node:path` line):

Replace:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
```

with:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { relative, resolve, basename } from "node:path";
```

Do **not** add a static `import { highlight } from "cli-highlight"` — it is loaded
lazily inside `peek` (Step 2) so a missing dep never crashes the extension (B2).

Add `detectLanguageFromPath`, `looksBinary`, `isPreviewable` to the `../src/core`
import block.

- [ ] **Step 2: Add a `peek` function inside `registerTreeCommands`**

`registerTreeCommands` needs access to `getSettings()` for the cap. Update its
signature and the call site.

Change the signature:

```ts
function registerTreeCommands(pi: ExtensionAPI, edited: Map<string, EditStatus>) {
```

to:

```ts
function registerTreeCommands(
  pi: ExtensionAPI,
  edited: Map<string, EditStatus>,
  getSettings: () => Settings,
) {
```

And update the call site in the default export (currently
`registerTreeCommands(pi, edited);`) to:

```ts
  registerTreeCommands(pi, edited, () => settings);
```

Then add the `peek` helper inside `registerTreeCommands`, next to
`openExternally`:

```ts
  const peek = async (ctx: any, absPath: string) => {
    const max = getSettings().maxPeekBytes;
    let size = 0;
    try {
      size = statSync(absPath).size;
    } catch {
      ctx.ui.notify(`Cannot read ${basename(absPath)}`, "error");
      return;
    }
    if (!isPreviewable(size, max)) {
      const kb = (size / 1024).toFixed(0);
      ctx.ui.notify(
        `${basename(absPath)} too large to preview (${kb} KB) — press Enter to open externally`,
        "warning",
      );
      return;
    }

    let raw: Buffer;
    try {
      raw = readFileSync(absPath);
    } catch {
      ctx.ui.notify(`Cannot read ${basename(absPath)}`, "error");
      return;
    }
    if (looksBinary(raw.subarray(0, 4096))) {
      ctx.ui.notify(
        `${basename(absPath)} looks binary — press Enter to open externally`,
        "warning",
      );
      return;
    }

    const text = raw.toString("utf-8");
    let rendered: string;
    try {
      // S4: force color so cli-highlight (chalk) emits ANSI under pi's managed,
      // non-TTY stdout. Without this, peek shows uncolored plain text.
      process.env.FORCE_COLOR ||= "3";
      // B2: lazy + graceful — if cli-highlight is missing, fall back to plain
      // text instead of crashing the whole extension at module load.
      const mod = await import("cli-highlight").catch(() => undefined);
      rendered = mod?.highlight
        ? mod.highlight(text, { language: detectLanguageFromPath(absPath), ignoreIllegals: true })
        : text;
    } catch {
      rendered = text; // never crash the peek on a highlight failure
    }
    // Tab-expand so widths are predictable; split into display lines.
    const allLines = rendered.replace(/\t/g, "  ").split("\n");

    let scroll = 0;
    await ctx.ui.custom(
      (tui: any, theme: any, _kb: any, done: (v: null) => void) => {
        const B = (s: string) => theme.fg("border", s);
        const bodyH = (): number => Math.max(1, Math.floor(tui.terminal.rows * 0.8) - 4);

        const build = (width: number): string[] => {
          const innerW = width - 2;
          const h = bodyH();
          if (scroll > Math.max(0, allLines.length - h)) scroll = Math.max(0, allLines.length - h);
          if (scroll < 0) scroll = 0;
          const H = "─";
          const lines: string[] = [];
          lines.push(B("╭" + H.repeat(innerW) + "╮"));
          const title = ` 👁  ${basename(absPath)}`;
          const pos = `${scroll + 1}-${Math.min(scroll + h, allLines.length)}/${allLines.length} `;
          const hint = `↑↓ scroll  g/G ends  esc close  ${pos}`;
          const gap = Math.max(1, innerW - visibleWidth(title) - visibleWidth(hint));
          lines.push(B("│") + theme.fg("accent", title) + " ".repeat(gap) +
            theme.fg("dim", hint) + B("│"));
          lines.push(B("├" + H.repeat(innerW) + "┤"));
          const view = allLines.slice(scroll, scroll + h);
          const rowsOut = view.length ? view : [theme.fg("dim", " (empty file)")];
          for (const row of rowsOut) {
            const cell = truncateToWidth(row, innerW);
            // S5: append a hard reset so a multi-line highlight token (block
            // comment, template literal) never bleeds color into the padding
            // or right border of this or the next row.
            const padded = cell + "\x1b[0m" + " ".repeat(Math.max(0, innerW - visibleWidth(cell)));
            lines.push(B("│") + padded + B("│"));
          }
          lines.push(B("╰" + H.repeat(innerW) + "╯"));
          return lines;
        };

        return {
          render: (w: number) => build(w),
          invalidate: () => {},
          handleInput: (data: string) => {
            const h = bodyH();
            const maxScroll = Math.max(0, allLines.length - h);
            if (matchesKey(data, Key.escape) || data === "q") return done(null);
            if (matchesKey(data, Key.up))   { scroll = Math.max(0, scroll - 1); tui.requestRender(); return; }
            if (matchesKey(data, Key.down)) { scroll = Math.min(maxScroll, scroll + 1); tui.requestRender(); return; }
            if (matchesKey(data, Key.pageUp))   { scroll = Math.max(0, scroll - h); tui.requestRender(); return; }
            if (matchesKey(data, Key.pageDown)) { scroll = Math.min(maxScroll, scroll + h); tui.requestRender(); return; }
            if (data === "g") { scroll = 0; tui.requestRender(); return; }
            if (data === "G") { scroll = maxScroll; tui.requestRender(); return; }
          },
        };
      },
      {
        overlay: true,
        overlayOptions: { width: "85%", maxWidth: 120, minWidth: 50, maxHeight: "80%", anchor: "center" },
      },
    );
  };
```

> `Key.pageUp` / `Key.pageDown` are the correct key ids in
> `@earendil-works/pi-tui` (already imported alongside `Key`).

- [ ] **Step 3: Bind `p` in the tree `handleInput`**

In the tree overlay `handleInput`, after the `Key.left` block and before the
closing `}`, add:

```ts
            if (data === "p") {
              if (!node.isDir) void peek(ctx, resolve(cwd, node.path));
              return;
            }
```

- [ ] **Step 4: Verify core tests still pass**

Run: `node --test packages/agent-files/test/core.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-files/extensions/agent-files.ts
git commit -m "feat(agent-files): p opens in-TUI syntax-highlighted peek with size/binary guards"
```

---

## Task 7: Docs + manual smoke test

**Files:**
- Modify: `packages/agent-files/README.md`

- [ ] **Step 1: Update the tree-overlay key table**

In `packages/agent-files/README.md`, replace the "Inside the project tree"
table body with:

```markdown
| Key | Action |
|---|---|
| `↑` / `↓` | Move selection |
| `Enter` | **Open the file in your OS default app** (expands a directory) |
| `p` | **Peek: in-TUI syntax-highlighted preview** (files only) |
| `→` | Expand a directory |
| `←` | Collapse a directory — or jump to its parent if already collapsed |
| `Esc` or `q` | Close the overlay |
```

- [ ] **Step 2: Add an "Opening files" section after that table**

```markdown
### Opening files

- **`Enter`** launches the file with your operating system's default
  application (`open` on macOS, `xdg-open` on Linux, `start` on Windows). On a
  headless/SSH box with no GUI handler you'll get a notification instead.
- **`p`** opens a scrollable, syntax-highlighted preview *inside* pi — no need to
  leave the terminal. Scroll with `↑/↓`, page with `PgUp/PgDn`, jump with `g`/`G`,
  close with `Esc`/`q`.
  - Files larger than **Max peek size** (default 512 KB) are refused with a hint
    to open them externally instead.
  - Binary files are detected and refused (open them externally).
```

- [ ] **Step 3: Add the new setting to the settings table**

In the Settings table, add this row (and note it's persistent):

```markdown
| `maxPeekBytes` | `524288` | Largest file (bytes) the in-TUI peek will render | ✅ yes |
```

Also add to the settings-menu key section that **"Max peek size (KB)"** is
adjusted with `←/→` in 64 KB steps (range 64 KB–8 MB).

- [ ] **Step 4: Run the full core test suite**

Run: `node --test packages/agent-files/test/core.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 5: Manual TUI smoke test**

Run `pi` in this repo (extension auto-loads via root `pi.extensions`), then:
1. `/agent-files` → move to a source file → **`Enter`**: confirm it opens in your
   default editor/app.
2. Move to a file → **`p`**: confirm a syntax-highlighted, scrollable preview;
   test `↑/↓`, `PgUp/PgDn`, `g`/`G`, `Esc`.
3. `p` on a large file (> current cap) → confirm the "too large" notification.
4. `p` on a binary (e.g. an image or compiled file) → confirm the "binary"
   notification.
5. `/agent-files-settings` → lower **Max peek size (KB)** → reopen `/agent-files`
   → `p` on a file now over the lowered cap → confirm it's refused.
6. Confirm `→`/`←` still only expand/collapse dirs (no open).
7. Confirm peek output is actually **colored** (S4/FORCE_COLOR). If it's plain,
   the force-color step did not take effect — check `process.env.FORCE_COLOR`.
8. Open a file with a block comment / multi-line template literal → confirm color
   does **not** bleed into the right border or padding (S5).
9. (Mono-install path) confirm coloring still works after
   `pi install git:...pi-extension-mono`; if `cli-highlight` is absent the peek
   must still open as **plain text** (no crash) per B2.

Expected: all behaviors verified.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-files/README.md
git commit -m "docs(agent-files): document open/peek keys + maxPeekBytes setting"
```

---

## Self-Review Notes

- **Spec coverage:** external open zero-dep (T1,T5), peek with cli-highlight
  (T3,T6), language detect / binary / size guards (T2,T6), configurable cap
  (T3,T4,T6), final keymap arrows-only + Enter + `p` (T5,T6), docs (T7). All
  covered.
- **Type consistency:** `OpenCommand`, `buildOpenCommand`,
  `detectLanguageFromPath`, `looksBinary`, `isPreviewable` defined in `core.ts`
  (T1–T2) and consumed unchanged in the extension (T5–T6). `Settings` gains
  `maxPeekBytes` once (T3) and is read via `getSettings()` in the peek (T6) and
  the menu (T4). `registerTreeCommands` signature change (T6) updates its single
  call site in the same step.
- **Each task independently green:** core helpers ship with tests (T1–T2);
  manifest/setting (T3), menu row (T4), open (T5), peek (T6) each keep core tests
  passing and compile on their own.
- **Import convention:** extension imports `../src/core` (extensionless); tests
  import `../src/core.ts`. New deps: `cli-highlight` (runtime) + `node:child_process`,
  merged `node:fs`/`node:path` named imports (no duplicate import lines).
- **Risk handled (oracle review):** B1 severity (`"warning"`), B2 dependency gap
  (root + sub-package dep) + load-time crash (lazy/graceful `import()`), S3 merged
  imports, S4 force-color, S5 per-row reset, S8 scroll clamp. `Key.pageUp`/
  `Key.pageDown` confirmed as real pi-tui ids.
```
