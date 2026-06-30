# pi-files: Rename Tracking Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the agent renames a file via `bash` (`mv old new`), the pi-files "Edited files" widget must update from the old path to the new path instead of permanently showing a stale ghost entry.

**Architecture:** The `tool_call` / `tool_execution_end` event pipeline already tracks `write` and `edit` tool calls. We extend it to intercept `bash` tool calls, parse `mv` commands for source→destination pairs, and on successful completion move those entries in the `edited` Map. A safety-net prune (which fires after **every** successful bash call, not only when `mv` was found) removes any remaining stale entries to cover renames/deletes that `parseMvRenames` did not match.

**Tech Stack:** TypeScript, Node.js `fs.existsSync`, `fs.statSync`, `path.resolve`, `path.basename`, `path.join`, `isToolCallEventType` from `@earendil-works/pi-coding-agent`

> **Status:** ✅ COMPLETE — all tasks implemented and 56/56 tests passing.

---

## Oracle Review Corrections Applied

The following issues were found in the initial design during parallel oracle review and have been fixed:

| # | Issue | Fix applied |
|---|---|---|
| 1 | Safety-net prune only fired when `parseMvRenames` found a match (empty renames → no `pendingRenames` entry → prune never ran for `rm`, piped mv, etc.) | Always store in `pendingRenames` for every bash call (even `[]`); guard changed from `if (renames)` to `if (renames !== undefined)` |
| 2 | `mv old.md dir/` (2-arg, dest is existing directory) resolved to the directory path, not `dir/old.md` → ghost entry at directory path persisted | In `tool_execution_end`, check `statSync(newAbs).isDirectory()` and use `join(newAbs, basename(oldAbs))` as the real dest |
| 3 | `pendingRenames` not cleared in `session_shutdown` → memory leak on resume | Added `pendingRenames.clear()` |
| 4 | `parseMvRenames` called in extension before it existed → extension crashed at load | Implemented `parseMvRenames` in `src/core.ts` and added to import in extension |
| 5 | `join` not imported in extension (needed for directory-dest fix) | Added `join` to `import … from "node:path"` |
| 6 | `resolve` alias clash in `core.ts` (already had `join` imported but not `resolve`/`basename`) | Added `basename, resolve as resolvePath` to `core.ts` path import |

---

## File Structure

| File | Role | Action |
|---|---|---|
| `packages/pi-files/src/core.ts` | Pure utility functions | **Modified** — added `parseMvRenames` export + `basename`/`resolvePath` path imports |
| `packages/pi-files/extensions/pi-files.ts` | Main extension — event handlers and widget | **Modified** — wired bash rename tracking with corrected guards + directory-dest handling |
| `packages/pi-files/test/core.test.ts` | Unit tests | **Modified** — added 17 `parseMvRenames` tests |

---

## Task 1: Add `parseMvRenames` to `src/core.ts` ✅

### What was added

```ts
// imports added to existing node:path import line:
import { basename, join, resolve as resolvePath } from "node:path";

export function parseMvRenames(cmd: string, cwd: string): Array<[string, string]> {
  const results: Array<[string, string]> = [];
  const statements = cmd.split(/&&|\|\||;|\n/);
  for (const stmt of statements) {
    const tokens = stmt.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    if (tokens[0] !== "mv") continue;
    const args = tokens.slice(1).filter((t) => !t.startsWith("-"));
    if (args.length !== 2) continue;
    if (args.some((a) => /[*?[\]]/.test(a))) continue;
    const oldAbs = args[0].startsWith("/") ? args[0] : resolvePath(cwd, args[0]);
    const newAbs = args[1].startsWith("/") ? args[1] : resolvePath(cwd, args[1]);
    results.push([oldAbs, newAbs]);
  }
  return results;
}
```

### Test cases (all passing)

- Simple relative rename
- Absolute paths
- Mixed absolute/relative
- Single flag stripped (`-f`)
- Multiple flags stripped (`-f -n`)
- `--` end-of-options stripped
- Compound `&&` command (both renames returned)
- Compound `;` command
- Multi-source (3 args) → `[]`
- Glob (`*.md`) → `[]`
- Non-mv commands (`echo`, `cp`, `rm`, empty) → `[]`
- Move-into-dir (`mv old.md dir/`) → pair returned; caller resolves via `statSync`

---

## Task 2: Wire Rename Tracking into the Extension ✅

### Changes applied to `extensions/pi-files.ts`

**Imports:**
```ts
import { basename, join, relative, resolve } from "node:path"; // join added
import { parseMvRenames, ... } from "../src/core";             // parseMvRenames added
```

**New Map:**
```ts
const pendingRenames = new Map<string, Array<[string, string]>>();
```

**`session_shutdown`:**
```ts
pendingRenames.clear(); // added alongside edited.clear() / pending.clear()
```

**`tool_call` handler (bash branch):**
```ts
if (isToolCallEventType("bash", event)) {
  const cmd = (event.input as { command?: string }).command ?? "";
  const renames = parseMvRenames(cmd, ctx.sessionManager.getCwd());
  // Always store (even empty []) so tool_execution_end runs the safety-net prune.
  pendingRenames.set(event.toolCallId, renames);
  return;
}
```

**`tool_execution_end` handler (bash branch):**
```ts
const renames = pendingRenames.get(event.toolCallId);
if (renames !== undefined) {           // not `if (renames)` — empty [] is valid
  pendingRenames.delete(event.toolCallId);
  if (!event.isError) {
    for (const [oldAbs, newAbs] of renames) {
      const prev = edited.get(oldAbs);
      if (prev !== undefined) {
        edited.delete(oldAbs);
        let dest = newAbs;
        try {
          if (statSync(newAbs).isDirectory()) {
            dest = join(newAbs, basename(oldAbs)); // mv old.md dir/ → dir/old.md
          }
        } catch { /* newAbs doesn't exist yet */ }
        edited.set(dest, prev);
      }
    }
    // Safety net fires after EVERY bash call (not just when mv was found).
    for (const abs of [...edited.keys()]) {
      if (!existsSync(abs)) edited.delete(abs);
    }
    renderWidget(ctx);
  }
  return;
}
```

---

## Edge Cases Covered

| Scenario | Handled by |
|---|---|
| `mv` parsed, old path in `edited` | rename loop moves status to new path |
| `mv` parsed, old path NOT in `edited` | rename loop is a no-op |
| `bash` command has no `mv` (`echo`, `git`, etc.) | `parseMvRenames` returns `[]`; empty entry stored; safety-net prune runs |
| `mv` fails (non-zero exit) | `event.isError` branch skips; old entry preserved |
| Glob `mv *.md dir/` | `parseMvRenames` returns `[]`; safety-net prune handles post-facto |
| Multi-source `mv a b c/` | `parseMvRenames` returns `[]`; safety-net prune handles post-facto |
| `mv old.md existing-dir/` | `statSync(newAbs).isDirectory()` resolves to `dir/old.md` |
| File deleted via `rm` | safety-net prune removes entry (`existsSync` → false) |
| Multiple `mv` in compound command | all pairs extracted and processed |
| Piped mv (`mv old new \| tee log`) | single `|` not in split regex → returns `[]`; safety-net cleans up old entry |
| `pendingRenames` leak on session crash | cleared on `session_shutdown` |

## Known Limitations

- Quoted paths with spaces (`mv 'my file.md' 'new file.md'`) are not tracked (whitespace-split tokeniser splits into 4 tokens → `args.length !== 2` → `[]` returned). Safety-net removes the old stale entry. The new name won't appear in the widget until the agent also writes/edits it.
- History rebuild (`rebuildFromHistory` / `extractEditsFromBranch`) does not replay bash renames — pre-existing behaviour, not a regression.
