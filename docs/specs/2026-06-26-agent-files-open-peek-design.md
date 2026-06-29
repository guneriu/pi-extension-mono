# pi-files: Open & Peek Files — Design

**Date:** 2026-06-26
**Package:** `@guneriu/pi-files`
**Status:** Approved (pending spec review)

## Goal

Add file-opening from the `/pi-files` project tree:

1. **Enter** on a file → open it in the **OS default application** (cross-platform).
2. **`p`** on a file → **peek**: an in-TUI, scrollable, syntax-highlighted preview.

Directories keep today's behavior (arrows expand/collapse). This turns the tree
from read-only navigation into a launch point for the files you care about.

## Non-Goals

- Editing from the peek (read-only preview).
- Image/PDF/binary rendering (binaries are detected and refused).
- Configurable highlight themes (use `cli-highlight` defaults).
- Opening directories in a file manager (Enter on a dir still expands).

## User Decisions (locked)

| Decision | Choice |
|---|---|
| Open behavior | Hybrid: Enter = external open, `p` = internal peek |
| External opener | Zero-dependency `process.platform` spawn |
| Peek highlighter | `cli-highlight` (runtime dependency) |
| Keymap | Arrows = expand/collapse only; Enter = open; `p` = peek |
| Peek size cap | Configurable via settings (`maxPeekBytes`, default 512 KB) |
| Binary files | Detected (NUL byte scan) and refused with a message |

## Architecture

Keeps the existing two-file split:

- `src/core.ts` — **pure logic, unit-tested** (no pi/TUI imports). New helpers:
  `buildOpenCommand`, `detectLanguageFromPath`, `looksBinary`, `isPreviewable`.
- `extensions/pi-files.ts` — pi/TUI wiring: spawn the OS opener, render the
  peek overlay, bind the new keys in the tree overlay.

### External open (zero-dep)

`buildOpenCommand(platform, absPath)` returns `{ cmd: string; args: string[] }`:

| `platform` | Command |
|---|---|
| `"darwin"` | `open <path>` |
| `"win32"` | `cmd` with args `["/c", "start", "", <path>]` |
| anything else (incl. linux) | `xdg-open <path>` |

The extension spawns it with `child_process.spawn(cmd, args, { detached: true,
stdio: "ignore" })` then `.unref()` so pi never blocks on it. On a spawn `error`
event → `ctx.ui.notify("Could not open <name>", "error")`. WSL is treated as
linux (`xdg-open`); documented as a known limitation.

### Internal peek (cli-highlight)

- New `dependencies: { "cli-highlight": "^2.1.11" }`. Pi runs `npm install` on
  package install, so it resolves automatically.
- On `p` over a file:
  1. `statSync` the path. If `!isPreviewable(size, settings.maxPeekBytes)` →
     notify "File too large to preview (X) — press Enter to open externally" and
     stop.
  2. Read the first 4 KB; if `looksBinary(buffer)` → notify "Binary file — press
     Enter to open externally" and stop.
  3. Read the full file as UTF-8. Highlight via `cli-highlight`'s `highlight()`
     using `detectLanguageFromPath(path)` (extension → language id; `undefined`
     lets cli-highlight auto-detect; on throw, fall back to the raw text).
  4. Split into lines and show in a bordered, scrollable overlay (same pattern as
     the tree/settings overlays).
- Peek keys: `↑/↓` scroll one line, `PgUp/PgDn` page, `g`/`G` top/bottom,
  `Esc`/`q` close (returns to the tree overlay, which is still open underneath).
- Each rendered line is tab-expanded then `truncateToWidth`-clipped so long/wide
  lines never break the right border.

### Pure helpers (all unit-tested)

```ts
// platform + abs path -> spawnable command
buildOpenCommand(platform: NodeJS.Platform, absPath: string):
  { cmd: string; args: string[] }

// file extension -> cli-highlight language id (or undefined to auto-detect)
detectLanguageFromPath(path: string): string | undefined

// true if the first bytes contain a NUL (binary heuristic)
looksBinary(buf: Buffer | Uint8Array): boolean

// size <= cap
isPreviewable(sizeBytes: number, maxBytes: number): boolean
```

## Settings

One new key, configurable from the existing `/pi-files-settings` menu:

| Key | Default | Meaning |
|---|---|---|
| `maxPeekBytes` | `524288` (512 KB) | Largest file the in-TUI peek will render |

In the settings menu it appears as a number row **"Max peek size (KB)"**, adjusted
with `←/→`. Stored in bytes; the menu shows/edits **KB** (step 64 KB, range
64 KB–8 MB). Persisted to `settings.json` like the other persistent settings.

## Keymap (tree overlay, final)

| Key | On a file | On a directory |
|---|---|---|
| `Enter` | Open in OS default app | Expand |
| `→` | no-op | Expand |
| `←` | no-op | Collapse / jump to parent |
| `p` | Peek (in-TUI preview) | no-op |
| `↑`/`↓` | Move selection | Move selection |
| `Esc`/`q` | Close overlay | Close overlay |

## Compatibility & error handling

- **No GUI handler** (headless/SSH): spawn `error` → notify; peek still works.
- **Truecolor vs 256-color:** rely on `cli-highlight`'s own terminal detection.
- **Huge / binary / unreadable files:** guarded by `isPreviewable`, `looksBinary`,
  and a try/catch around read+highlight (falls back to plain text or a notify).
- **Long/wide/CJK lines:** tab-expand + `truncateToWidth` per visible line.

## Testing

- **Unit (`src/core.ts`):** `buildOpenCommand` for darwin/win32/linux;
  `detectLanguageFromPath` for known/unknown extensions; `looksBinary` for
  text vs NUL-containing buffers; `isPreviewable` boundary cases.
- **Manual TUI smoke test:** Enter opens the OS app; `p` previews with colors and
  scrolls; oversize file is refused with the hint; a binary file is refused;
  `maxPeekBytes` change in settings takes effect.

## Files

```
packages/pi-files/
├── extensions/pi-files.ts   # + spawn opener, peek overlay, new keys
├── src/core.ts                 # + buildOpenCommand, detectLanguageFromPath,
│                               #   looksBinary, isPreviewable
├── test/core.test.ts           # + unit tests for the four helpers
├── package.json                # + dependencies: cli-highlight
└── README.md                   # + open/peek docs, new setting
```

## Open follow-ups (not in scope)

- Optional in-peek search (`/`).
- Configurable highlight theme.
- Open directory in OS file manager.
