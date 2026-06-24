/**
 * keybindings-help.ts
 *
 * Press ? on an empty editor → floating overlay with all pi keybindings.
 * Press ? or Esc inside the overlay to close.
 *
 * Uses pi-native TUI: overlay + CustomEditor interception.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ─── Data ────────────────────────────────────────────────────────────────────

interface KbEntry   { key: string; desc: string }
interface KbSection { title: string; rows: KbEntry[] }

type ThemeRow =
  | { kind: "blank" }
  | { kind: "section"; title: string }
  | { kind: "entry"; key: string; desc: string };

const LEFT_SECTIONS: KbSection[] = [
  {
    title: "CURSOR",
    rows: [
      { key: "↑ / ↓",            desc: "move up / down" },
      { key: "← → / ctrl+b/f",   desc: "left / right" },
      { key: "alt+← / alt+→",    desc: "word left / right" },
      { key: "home / ctrl+a",     desc: "line start" },
      { key: "end / ctrl+e",      desc: "line end" },
      { key: "pageUp / pageDown", desc: "scroll page" },
      { key: "ctrl+]",            desc: "jump to char →" },
      { key: "ctrl+alt+]",        desc: "jump to char ←" },
    ],
  },
  {
    title: "DELETION",
    rows: [
      { key: "backspace",         desc: "delete char ←" },
      { key: "del / ctrl+d",      desc: "delete char →" },
      { key: "ctrl+w / alt+bksp", desc: "delete word ←" },
      { key: "alt+d",             desc: "delete word →" },
      { key: "ctrl+u",            desc: "delete to line start" },
      { key: "ctrl+k",            desc: "delete to line end" },
    ],
  },
  {
    title: "KILL RING",
    rows: [
      { key: "ctrl+y",  desc: "yank (paste)" },
      { key: "alt+y",   desc: "cycle kill ring" },
      { key: "ctrl+-",  desc: "undo" },
    ],
  },
  {
    title: "INPUT",
    rows: [
      { key: "enter",              desc: "submit" },
      { key: "shift+↵ / ctrl+j",  desc: "new line" },
      { key: "tab",                desc: "autocomplete" },
      { key: "ctrl+c (select)",    desc: "copy selection" },
    ],
  },
];

const RIGHT_SECTIONS: KbSection[] = [
  {
    title: "APPLICATION",
    rows: [
      { key: "esc",       desc: "abort / cancel" },
      { key: "ctrl+c",    desc: "clear editor" },
      { key: "ctrl+d",    desc: "exit (empty editor)" },
      { key: "ctrl+z",    desc: "suspend" },
      { key: "ctrl+g",    desc: "external editor ($EDITOR)" },
      { key: "ctrl+v",    desc: "paste image from clipboard" },
    ],
  },
  {
    title: "MESSAGES",
    rows: [
      { key: "alt+enter", desc: "queue follow-up message" },
      { key: "alt+↑",     desc: "restore queued messages" },
    ],
  },
  {
    title: "MODELS & THINKING",
    rows: [
      { key: "ctrl+l",       desc: "open model picker" },
      { key: "ctrl+p",       desc: "next model" },
      { key: "ctrl+shift+p", desc: "prev model" },
      { key: "shift+tab",    desc: "cycle thinking level" },
      { key: "ctrl+t",       desc: "toggle thinking blocks" },
    ],
  },
  {
    title: "DISPLAY",
    rows: [
      { key: "ctrl+o", desc: "expand / collapse tools" },
    ],
  },
  {
    title: "SESSIONS (in /tree)",
    rows: [
      { key: "ctrl+r",  desc: "rename session" },
      { key: "ctrl+d",  desc: "delete session" },
      { key: "ctrl+s",  desc: "toggle sort mode" },
      { key: "ctrl+n",  desc: "named-only filter" },
      { key: "ctrl+p",  desc: "toggle path display" },
    ],
  },
];

// ─── Layout helpers ───────────────────────────────────────────────────────────

function flattenSections(sections: KbSection[]): ThemeRow[] {
  const rows: ThemeRow[] = [];
  for (const section of sections) {
    if (rows.length > 0) rows.push({ kind: "blank" });
    rows.push({ kind: "section", title: section.title });
    for (const entry of section.rows) {
      rows.push({ kind: "entry", key: entry.key, desc: entry.desc });
    }
  }
  return rows;
}

function renderHalf(
  theme: any,
  row: ThemeRow | undefined,
  keyW: number,
  descW: number,
): string {
  const total = keyW + 2 + descW;
  if (!row || row.kind === "blank") return " ".repeat(total);

  if (row.kind === "section") {
    const text = row.title.slice(0, total);
    const pad  = Math.max(0, total - visibleWidth(text));
    return theme.fg("accent", text) + " ".repeat(pad);
  }

  // entry
  const keyRaw  = truncateToWidth(row.key,  keyW);
  const keyPad  = " ".repeat(Math.max(0, keyW - visibleWidth(keyRaw)));
  const descRaw = truncateToWidth(row.desc, descW);
  return theme.fg("warning", keyRaw + keyPad) + "  " + theme.fg("dim", descRaw);
}

// ─── Overlay component ────────────────────────────────────────────────────────

async function showHelp(ctx: any): Promise<void> {
  const leftRows  = flattenSections(LEFT_SECTIONS);
  const rightRows = flattenSections(RIGHT_SECTIONS);

  await ctx.ui.custom(
    (_tui: any, theme: any, _kb: any, done: (v: null) => void) => {
      let cacheW: number | undefined;
      let cacheLines: string[] | undefined;

      function build(width: number): string[] {
        const lines: string[] = [];
        const px    = 2;                       // horizontal padding
        const inner = Math.max(40, width - px * 2);

        // ── Header ──
        const title = "⌨  Pi Keybindings";
        const hint  = "? or esc to close";
        const gap   = Math.max(2, inner - visibleWidth(title) - visibleWidth(hint));
        lines.push(
          " ".repeat(px) +
          theme.fg("accent", title) +
          " ".repeat(gap) +
          theme.fg("dim", hint) +
          " ".repeat(px),
        );
        lines.push(" ".repeat(px) + theme.fg("border", "─".repeat(inner)) + " ".repeat(px));
        lines.push("");

        // ── Two-column body ──
        const colW  = Math.floor((inner - 3) / 2);   // 3 = mid-gap
        const keyW  = Math.min(22, Math.floor(colW * 0.48));
        const descW = colW - keyW - 2;
        const nRows = Math.max(leftRows.length, rightRows.length);

        for (let i = 0; i < nRows; i++) {
          const left  = renderHalf(theme, leftRows[i],  keyW, descW);
          const right = renderHalf(theme, rightRows[i], keyW, descW);
          lines.push(truncateToWidth(" ".repeat(px) + left + "   " + right, width));
        }

        lines.push("");
        return lines;
      }

      return {
        render(w: number): string[] {
          if (cacheW !== w) { cacheLines = build(w); cacheW = w; }
          return cacheLines!;
        },
        invalidate() { cacheW = undefined; cacheLines = undefined; },
        handleInput(data: string): void {
          if (matchesKey(data, Key.escape) || data === "?") done(null);
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        width:    "82%",
        maxWidth: 110,
        minWidth: 64,
        anchor:   "center",
        margin:   2,
      },
    },
  );
}

// ─── Editor wrapper ───────────────────────────────────────────────────────────
//
// Subclass CustomEditor so all built-in keybindings (model switch, escape-to-abort,
// etc.) continue to work. We only intercept `?` when the editor is empty.

class HelpEditor extends CustomEditor {
  private _ctx: any;
  private _empty = true;

  constructor(tui: any, theme: any, keybindings: any, ctx: any) {
    super(tui, theme, keybindings); // tui must be first — same as ModalEditor example
    this._ctx = ctx;
  }

  override handleInput(data: string): void {
    // ? on empty editor → overlay, swallow the keypress
    if (data === "?" && this._empty) {
      void showHelp(this._ctx);
      return;
    }

    // Track whether editor is empty
    //   \r = submit, \x03 = ctrl+c (clear) → truly empty
    //   \n = ctrl+j = new line (NOT submit) → do NOT mark empty
    //   \x15 = ctrl+u = del-to-line-start → unknown (other lines may exist), leave as-is
    //   multi-char data = paste → non-empty
    //   single printable char → non-empty
    if (data === "\r" || data === "\x03") {
      this._empty = true;
    } else if (data.length > 1 || (data.length === 1 && data.charCodeAt(0) >= 0x20)) {
      this._empty = false;
    }

    super.handleInput(data);
  }
}

// ─── Extension entry point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new HelpEditor(tui, theme, keybindings, ctx),
    );
  });
}
