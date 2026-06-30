# Oracle Review — pi-files extension
**Date:** 2026-06-29  
**Scope:** inline search, Space peek toggle, markdown highlighter, external opener, key binding correctness  
**Test run:** 39/39 pass · working tree clean

---

## 1. Inline type-to-filter search

### ✅ Correct behaviour
- `filterFiles` (core.ts ~L295): empty query returns the original array reference — safe since `allFiles` is never mutated after construction.
- `searchQuery` drives all branching — no stale `searchMode` boolean. The transition logic is clean.
- `buildSearchBody` clamps `selected` with `Math.max(0, results.length - 1)` when results are empty, so `selected` stays 0 and the empty-state render path `" (no matches)"` fires correctly. No crash on zero results.
- Down-key guard: `Math.min(Math.max(0, count - 1), selected + 1)` — correctly handles empty result set (count=0 → clamp to 0). ✅
- Width math in `buildSearchBody`: verified algebraically — total visible cols = innerW exactly. ✅

### ⚠️ Minor: `filterFiles` called multiple times per render cycle
In search mode a single keystroke triggers: `visibleBody()` (1 call), `build()` (1 call for count), `buildSearchBody()` (1 call for results) — 3 `filterFiles` calls per render. For most repos imperceptible, but for tens of thousands of files it could cause lag. Not a bug; low-priority optimisation.

### ⚠️ Minor: stale `allFiles` if files are created/deleted while the overlay is open
`allFiles` is populated once at `open()`. Expected for a modal overlay, but worth documenting. No crash.

### ⚠️ Minor: tree selection not preserved when backspacing to empty
When backspace empties `searchQuery`, `selected = 0; scroll = 0` always resets to tree top, discarding any prior tree cursor position.

---

## 2. Space key peek toggle

### ✅ Open (tree mode, pi-files.ts ~L668)
Guard `if (path)` / `if (node && !node.isDir)` both correct — no crash on empty list or directory. `void peek(...)` correctly fire-and-forget. ✅

### ✅ Close (peek handleInput, pi-files.ts ~L494)
```ts
if (matchesKey(data, Key.escape) || data === "q" || data === " ") return done(null);
```
Simple and correct. ✅

### ⚠️ UX: Space closes peek instead of page-down
Standard terminal pagers (less, more, man) use Space to page down. Users may press Space expecting to scroll and instead close the peek. Intentional per design; hint shows `spc/esc close`. Worth flagging as a potential surprise.

### ⚠️ Minor: Space on a directory silently no-ops
In tree mode with a directory selected, Space does nothing (correctly guarded by `!node.isDir`) but provides no feedback. Low priority.

---

## 3. Built-in markdown highlighter

### ✅ Fence state correctly scoped
`let inFence = false` declared inside `highlightMarkdown` — fresh state per call, no shared state. ✅

### ✅ Fence regex handles language tags
`/^(`{3,}|~{3,})/` matches ` ```ts `, ` ~~~python `, 4-backtick fences. ✅

### ⚠️ Minor: unclosed fence colours rest of file yellow
Malformed markdown with unclosed ` ``` ` makes everything after it yellow. Correct per CommonMark spec but visually jarring for WIP files. No crash.

### ⚠️ Minor: fence length mismatch not tracked
A 4-backtick fence should only close on 4+ backticks. Current implementation closes on any 3+ match, so a 4-backtick fence containing 3-backtick examples closes prematurely. Extremely rare in practice. Acceptable for a syntax highlighter.

### ⚠️ Minor: sequential regex in `applyInlineMarkdown` can layer ANSI codes
Order: inline code → bold → italic → links. When bold wraps a span containing inline-code ANSI codes, the code span's `\x1b[0m` reset interrupts the bold. Visual result: bold ends at first inline-code reset. Not a crash, not common, accepted limitation of regex-based highlighting.

### ⚠️ Minor: HR pattern `-{3,}` matches setext heading underlines
`/^(\*{3,}|-{3,}|_{3,})$/` fires before setext-underline context is checked. A `---` line after a paragraph is dimmed as HR rather than styled as setext h2. Known accepted limitation; setext headings are rare. No crash.

---

## 4. External file opener

### ✅ `buildOpenCommand` — platform mapping correct
darwin → `open`, win32 → `cmd /c start "" <path>`, other → `xdg-open`. Spawn uses args array so paths with spaces are handled safely by the OS without shell quoting issues. ✅

### ✅ `openExternally` error handling
`child.on("error", ...)` + `child.unref()` — error event can still fire after unref. On headless boxes the user gets a notify. ✅

### ✅ `detectLanguageFromPath` on Windows absolute paths
Even with backslash paths (e.g. `C:\Users\foo\bar.ts`), `base.lastIndexOf(".")` finds the last dot correctly and `ext = "ts"` is extracted. ✅

---

## 5. Key binding correctness

### ✅ Printable char threshold `data >= "!"`
ASCII 33 — correctly excludes space (32, handled as peek) and all control chars (<32). The `data.length === 1` guard prevents multi-char escape sequences from appending. ✅

### ✅ Backspace: both `\x7f` (DEL) and `\b` (`\x08` BS) handled. ✅

### ✅ Esc smart clear-then-close: first Esc clears filter, second closes. ✅

### ✅ Arrow keys guard on empty tree: `if (!node) return` prevents crash. ✅

### ✅ `q` now typeable as filter char — falls through to printable-char append. Only close key is Esc. Deliberate UX change, documented in README. ✅

---

## 6. Unused import — actionable

**`pi-files.ts` ~L21: `applyInlineMarkdown` imported but never called directly by the extension.**

```ts
import {
  ...
  applyInlineMarkdown,   // ← only used internally by highlightMarkdown in core.ts
  ...
} from "../src/core";
```

`highlightMarkdown` calls `applyInlineMarkdown` internally. The extension itself never calls it directly. Dead import — no crash, no runtime effect, but should be removed.

---

## 7. Unused test variable — cosmetic

`const RST = "\x1b[0m"` is declared in `core.test.ts` in the ANSI constants block but never referenced in any assertion. Harmless.

---

## Summary

| Severity | Count | Items |
|---|---|---|
| **Blocker** | 0 | — |
| **Bug** | 0 | — |
| **Significant** | 1 | Unused `applyInlineMarkdown` import in `pi-files.ts` |
| **Minor UX** | 4 | Space closes peek vs page-down; Space on dir silent; tree selection lost on backspace-to-empty; stale allFiles |
| **Minor correctness** | 3 | 3x filterFiles per render; fence length mismatch; sequential ANSI layering |
| **Cosmetic** | 2 | Unused RST test var; unclosed fence colours whole file |

**No blockers. Safe to ship.** The one item worth acting on is removing the unused `applyInlineMarkdown` import from `pi-files.ts`.

---

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Review is read-only analysis only. No files were modified, no code was written, no scope was widened. Findings written solely to oracle-review.md as specified."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "node --test packages/pi-files/test/core.test.ts",
      "result": "passed",
      "summary": "39/39 tests pass, 0 failures"
    },
    {
      "command": "git status && git log --oneline -6",
      "result": "passed",
      "summary": "Working tree clean, 6 recent commits verified"
    }
  ],
  "validationOutput": [
    "39 tests pass, 0 fail",
    "Working tree clean — nothing to commit"
  ],
  "residualRisks": [
    "Unused applyInlineMarkdown import in pi-files.ts (dead code, no runtime effect)",
    "Space closes peek instead of paging down — departure from less/more convention, intentional by design",
    "filterFiles called 3x per render in search mode — minor perf concern for very large repos",
    "Stale allFiles if files created/deleted while overlay is open — expected modal behaviour",
    "Unclosed markdown fence colours remainder of file yellow — correct per spec but visually jarring"
  ],
  "noStagedFiles": true,
  "diffSummary": "No changes made. This is a read-only review.",
  "reviewFindings": [
    "significant: pi-files.ts ~L21 — applyInlineMarkdown imported but never used directly by the extension; remove this import",
    "minor-ux: peek handleInput L494 — Space closes peek (intentional) but departs from less/more page-down convention; hint text already documents this",
    "minor-ux: tree handleInput Space branch — pressing Space on a directory silently no-ops with no feedback to the user",
    "minor-ux: backspace-to-empty resets selected=0 scroll=0, losing prior tree cursor position",
    "minor-perf: filterFiles called 3 times per render cycle in search mode",
    "minor-correctness: highlightMarkdown fence toggle uses same regex for open and close — 4-backtick fences closed by 3-backtick lines",
    "minor-correctness: applyInlineMarkdown sequential regex — bold wrapping inline code resets bold at first code-span reset",
    "cosmetic: core.test.ts — const RST declared but never used in any assertion"
  ],
  "manualNotes": "All 39 tests pass. No blockers found. The most actionable item is removing the unused applyInlineMarkdown import from pi-files.ts. All other findings are minor UX or low-priority correctness observations. The implementation is correct and safe to ship."
}
```
