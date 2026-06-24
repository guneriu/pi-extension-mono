/**
 * keybindings-help.ts
 *
 * Press ? on an empty editor → floating overlay with all pi keybindings.
 * Press ? or Esc to close.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface KbEntry   { key: string; desc: string }
interface KbSection { title: string; rows: KbEntry[] }

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
      { key: "backspace",          desc: "delete char ←" },
      { key: "del / ctrl+d",       desc: "delete char →" },
      { key: "ctrl+w / alt+bksp",  desc: "delete word ←" },
      { key: "alt+d",              desc: "delete word →" },
      { key: "ctrl+u",             desc: "delete to line start" },
      { key: "ctrl+k",             desc: "delete to line end" },
    ],
  },
  {
    title: "KILL RING",
    rows: [
      { key: "ctrl+y", desc: "yank (paste)" },
      { key: "alt+y",  desc: "cycle kill ring" },
      { key: "ctrl+-", desc: "undo" },
    ],
  },
  {
    title: "INPUT",
    rows: [
      { key: "enter",             desc: "submit" },
      { key: "shift+↵ / ctrl+j", desc: "new line" },
      { key: "tab",               desc: "autocomplete" },
      { key: "ctrl+c (select)",   desc: "copy selection" },
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
      { key: "ctrl+v",    desc: "paste image" },
    ],
  },
  {
    title: "MESSAGES",
    rows: [
      { key: "alt+enter", desc: "queue follow-up" },
      { key: "alt+↑",     desc: "restore queue" },
    ],
  },
  {
    title: "MODELS & THINKING",
    rows: [
      { key: "ctrl+l",       desc: "model picker" },
      { key: "ctrl+p",       desc: "next model" },
      { key: "ctrl+shift+p", desc: "prev model" },
      { key: "shift+tab",    desc: "cycle thinking" },
      { key: "ctrl+t",       desc: "toggle think blocks" },
    ],
  },
  {
    title: "DISPLAY",
    rows: [
      { key: "ctrl+o", desc: "expand / collapse tools" },
    ],
  },
  {
    title: "SESSIONS  (in /tree)",
    rows: [
      { key: "ctrl+r", desc: "rename session" },
      { key: "ctrl+d", desc: "delete session" },
      { key: "ctrl+s", desc: "toggle sort" },
      { key: "ctrl+n", desc: "named-only filter" },
      { key: "ctrl+p", desc: "toggle path display" },
    ],
  },
];

// ─── Column renderer ───────────────────────────────────────────────────────────
//
// Renders one column as a string[] where every string is exactly `colW` visible
// chars (no ANSI width — padding is added after styling).

function buildColumn(
  theme: any,
  sections: KbSection[],
  colW: number,
): string[] {
  // Key column: fixed width; desc column: fills remainder after 1-space gap + 1-space left pad
  const px   = 1;                                    // left/right padding inside cell
  const keyW = Math.min(20, Math.floor((colW - px * 2) * 0.44));
  const descW = colW - px * 2 - keyW - 1;            // 1 = gap between key and desc

  const blank = " ".repeat(colW);
  const lines: string[] = [];

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];

    // Blank separator between sections
    if (si > 0) lines.push(blank);

    // Section header — accent, left-padded
    const titleRaw = truncateToWidth(section.title, colW - px);
    const titlePad = " ".repeat(Math.max(0, colW - px - visibleWidth(titleRaw)));
    lines.push(" ".repeat(px) + theme.fg("accent", titleRaw) + titlePad);

    // Entries
    for (const entry of section.rows) {
      const keyRaw  = truncateToWidth(entry.key,  keyW);
      const keyPad  = " ".repeat(Math.max(0, keyW  - visibleWidth(keyRaw)));
      const descRaw = truncateToWidth(entry.desc, descW);
      const descPad = " ".repeat(Math.max(0, descW - visibleWidth(descRaw)));

      lines.push(
        " ".repeat(px) +
        theme.fg("warning", keyRaw + keyPad) +
        " " +
        theme.fg("dim", descRaw + descPad) +
        " ".repeat(px),
      );
    }
  }

  // Trailing blank for bottom padding
  lines.push(blank);
  return lines;
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

async function showHelp(ctx: any): Promise<void> {
  await ctx.ui.custom(
    (_tui: any, theme: any, _kb: any, done: (v: null) => void) => {
      let cacheW: number | undefined;
      let cacheLines: string[] | undefined;

      function build(width: number): string[] {
        const lines: string[] = [];

        // Box geometry
        // width = full render width (border chars count toward it)
        // inner = width - 2 border chars (│…│)
        // center divider splits inner into leftW + 1(│) + rightW
        const inner  = width - 2;
        const leftW  = Math.floor((inner - 1) / 2);
        const rightW = inner - 1 - leftW;

        // Box-drawing helpers (styled with border color)
        const B = (s: string) => theme.fg("border", s);
        const H = "─";

        // ── Top border ──────────────────────────────────────────────────
        lines.push(B("╭" + H.repeat(leftW) + "┬" + H.repeat(rightW) + "╮"));

        // ── Header row ──────────────────────────────────────────────────
        const titleStr  = " ⌨  Pi Keybindings";
        const hintStr   = "? or esc to close ";
        const titleVis  = visibleWidth(titleStr);
        const hintVis   = visibleWidth(hintStr);

        // Left half of header: title + filler; right half: filler + hint
        const leftFill  = " ".repeat(Math.max(0, leftW  - titleVis));
        const rightFill = " ".repeat(Math.max(0, rightW - hintVis));

        lines.push(
          B("│") +
          theme.fg("accent", titleStr) + leftFill +
          B("│") +
          rightFill + theme.fg("dim", hintStr) +
          B("│"),
        );

        // ── Column divider ───────────────────────────────────────────────
        lines.push(B("├" + H.repeat(leftW) + "┼" + H.repeat(rightW) + "┤"));

        // ── Body: independent columns zipped side by side ────────────────
        const leftLines  = buildColumn(theme, LEFT_SECTIONS,  leftW);
        const rightLines = buildColumn(theme, RIGHT_SECTIONS, rightW);
        const nRows = Math.max(leftLines.length, rightLines.length);

        const emptyL = " ".repeat(leftW);
        const emptyR = " ".repeat(rightW);

        for (let i = 0; i < nRows; i++) {
          const l = leftLines[i]  ?? emptyL;
          const r = rightLines[i] ?? emptyR;
          // Safety: truncate to exact column widths (ANSI-aware)
          lines.push(
            B("│") +
            truncateToWidth(l, leftW).padEnd(leftW) +
            B("│") +
            truncateToWidth(r, rightW).padEnd(rightW) +
            B("│"),
          );
        }

        // ── Bottom border ────────────────────────────────────────────────
        lines.push(B("╰" + H.repeat(leftW) + "┴" + H.repeat(rightW) + "╯"));

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
        width:    "85%",
        maxWidth: 112,
        minWidth: 70,
        anchor:   "center",
      },
    },
  );
}

// ─── Editor wrapper ───────────────────────────────────────────────────────────

class HelpEditor extends CustomEditor {
  private _ctx:   any;
  private _empty = true;

  constructor(tui: any, theme: any, keybindings: any, ctx: any) {
    super(tui, theme, keybindings);
    this._ctx = ctx;
  }

  override handleInput(data: string): void {
    if (data === "?" && this._empty) {
      void showHelp(this._ctx);
      return;
    }

    // Update empty state
    if (data === "\r" || data === "\x03") {
      // submit (enter) or ctrl+c (clear editor) → empty
      this._empty = true;
    } else if (data.length > 1 || (data.length === 1 && data.charCodeAt(0) >= 0x20)) {
      // paste or any printable char → not empty
      this._empty = false;
    }
    // ctrl+j (\n), ctrl+u (\x15), arrows etc. → leave _empty as-is

    super.handleInput(data);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new HelpEditor(tui, theme, keybindings, ctx),
    );
  });
}
