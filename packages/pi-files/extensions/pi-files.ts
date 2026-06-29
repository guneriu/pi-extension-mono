/**
 * pi-files (@guneriu/pi-files)
 *
 * Compact widget above the input bar listing files the agent edited this
 * session, plus an on-demand interactive project tree (/pi-files, /files).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import {
  ancestorsOf,
  applyInlineMarkdown,
  buildOpenCommand,
  buildTree,
  buildWidgetLines,
  classifyEdit,
  detectLanguageFromPath,
  extractEditsFromBranch,
  filterFiles,
  flattenVisible,
  highlightMarkdown,
  isPreviewable,
  listProjectFiles,
  looksBinary,
  statusGlyph,
  type EditStatus,
  type EditedFile,
} from "../src/core";

// ─── Settings ───────────────────────────────────────────────────────────────
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

function saveSettings(s: Settings): void {
  try {
    writeFileSync(getSettingsFile(), JSON.stringify(s, null, 2), "utf-8");
  } catch {
    // non-fatal
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
  // Session-only collapse flag — never written to disk, resets on session_start.
  let collapsed = false;

  function updateSettings(fn: (s: Settings) => void, ctx: any): void {
    fn(settings);
    saveSettings(settings);
    renderWidget(ctx);
  }

  function toEditedFiles(cwd: string): EditedFile[] {
    // Newest-first so the compact widget shows the most recent edits (C1).
    return [...edited.entries()].reverse().map(([abs, status]) => ({
      relPath: relative(cwd, abs) || abs,
      status,
    }));
  }

  function renderWidget(ctx: any) {
    if (ctx.mode !== "tui") return;
    if (!settings.enabled || collapsed) {
      ctx.ui.setWidget(WIDGET_ID, undefined);
      return;
    }
    const cwd = ctx.sessionManager.getCwd();
    const files = toEditedFiles(cwd);

    if (files.length === 0) {
      if (settings.showIdleHint) {
        ctx.ui.setWidget(WIDGET_ID, (_tui: any, theme: any) => ({
          render: () => [theme.fg("dim", "📁 /files — file tree")],
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
          lines.push(theme.fg("accent", w.header) + theme.fg("dim", "  ·  /files"));
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
    collapsed = false; // session collapse always resets on fresh session
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

  registerTreeCommands(pi, edited, () => settings);
  registerSettingsCommand(
    pi,
    () => settings,
    (fn, ctx) => updateSettings(fn, ctx),
    () => collapsed,
    (v, ctx) => { collapsed = v; renderWidget(ctx); },
  );
}

// ─── Settings menu ──────────────────────────────────────────────────────────

function registerSettingsCommand(
  pi: ExtensionAPI,
  getSettings: () => Settings,
  updateSettings: (fn: (s: Settings) => void, ctx: any) => void,
  getCollapsed: () => boolean,
  setCollapsed: (v: boolean, ctx: any) => void,
) {
  pi.registerCommand("pi-files-settings", {
    description: "Open pi-files settings menu",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/pi-files-settings requires TUI mode", "error");
        return;
      }

      let selected = 0;

      type ToggleItem = {
        kind: "toggle";
        label: string;
        hint?: string;
        get: () => boolean;
        toggle: () => void;
      };
      type NumberItem = {
        kind: "number";
        label: string;
        get: () => number;
        inc: () => void;
        dec: () => void;
        min: number;
        max: number;
      };
      type MenuItem = ToggleItem | NumberItem;

      const items: MenuItem[] = [
        {
          kind: "toggle",
          label: "Widget enabled",
          hint: "persists across sessions",
          get: () => getSettings().enabled,
          toggle: () => updateSettings((s) => { s.enabled = !s.enabled; }, ctx),
        },
        {
          kind: "toggle",
          label: "Collapse this session",
          hint: "resets when you restart pi",
          get: () => getCollapsed(),
          toggle: () => setCollapsed(!getCollapsed(), ctx),
        },
        {
          kind: "number",
          label: "Max widget rows",
          get: () => getSettings().maxWidgetRows,
          inc: () => updateSettings((s) => { s.maxWidgetRows = Math.min(20, s.maxWidgetRows + 1); }, ctx),
          dec: () => updateSettings((s) => { s.maxWidgetRows = Math.max(1, s.maxWidgetRows - 1); }, ctx),
          min: 1,
          max: 20,
        },
        {
          kind: "toggle",
          label: "Show idle hint",
          hint: "persists across sessions",
          get: () => getSettings().showIdleHint,
          toggle: () => updateSettings((s) => { s.showIdleHint = !s.showIdleHint; }, ctx),
        },
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
      ];

      await ctx.ui.custom(
        (tui: any, theme: any, _kb: any, done: (v: null) => void) => {
          const B = (s: string) => theme.fg("border", s);

          const buildRow = (item: MenuItem, i: number, innerW: number): string => {
            const isSelected = i === selected;
            const gutter = isSelected ? theme.fg("accent", "›") : " ";

            let rowContent: string;
            if (item.kind === "toggle") {
              const on = item.get();
              // Dim the "Collapse" option when widget is fully disabled — it's a no-op.
              const dimmed = item.label === "Collapse this session" && !getSettings().enabled;
              const box = dimmed
                ? theme.fg("dim", "[ ]")
                : on
                  ? theme.fg("success", "[●]")
                  : theme.fg("dim", "[ ]");
              const labelColor = dimmed ? "dim" : isSelected ? "accent" : "muted";
              const label = theme.fg(labelColor, item.label);
              const hintStr = item.hint ? theme.fg("dim", `  ${item.hint}`) : "";
              rowContent = ` ${box} ${label}${hintStr}`;
            } else {
              const val = item.get();
              const atMin = val <= item.min;
              const atMax = val >= item.max;
              const labelColor = isSelected ? "accent" : "muted";
              const left  = atMin ? theme.fg("dim", "‹") : theme.fg("accent", "‹");
              const right = atMax ? theme.fg("dim", "›") : theme.fg("accent", "›");
              rowContent = `    ${theme.fg(labelColor, item.label)}: ${left} ${theme.fg("success", String(val))} ${right}`;
            }

            const full = gutter + rowContent;
            const cell = truncateToWidth(full, innerW);
            return B("│") + cell + " ".repeat(Math.max(0, innerW - visibleWidth(cell))) + B("│");
          };

          const build = (width: number): string[] => {
            const innerW = width - 2;
            const H = "─";
            const lines: string[] = [];

            lines.push(B("╭" + H.repeat(innerW) + "╮"));
            const title = " ⚙  Agent Files Settings";
            const hint  = "↑↓ move  spc/↵ toggle  ←→ adjust  esc close ";
            const gap   = Math.max(1, innerW - visibleWidth(title) - visibleWidth(hint));
            lines.push(
              B("│") + theme.fg("accent", title) + " ".repeat(gap) + theme.fg("dim", hint) + B("│"),
            );
            lines.push(B("├" + H.repeat(innerW) + "┤"));

            for (let i = 0; i < items.length; i++) {
              lines.push(buildRow(items[i], i, innerW));
            }

            lines.push(B("╰" + H.repeat(innerW) + "╯"));
            return lines;
          };

          return {
            render: (w: number) => build(w),
            invalidate: () => {},
            handleInput: (data: string) => {
              if (matchesKey(data, Key.escape) || data === "q") return done(null);
              if (matchesKey(data, Key.up))   { selected = Math.max(0, selected - 1);              tui.requestRender(); return; }
              if (matchesKey(data, Key.down)) { selected = Math.min(items.length - 1, selected + 1); tui.requestRender(); return; }

              const item = items[selected];
              if (!item) return;

              if (item.kind === "toggle" && (data === " " || data === "\r")) {
                item.toggle();
                tui.requestRender();
                return;
              }
              if (item.kind === "number") {
                if (matchesKey(data, Key.right)) { item.inc(); tui.requestRender(); return; }
                if (matchesKey(data, Key.left))  { item.dec(); tui.requestRender(); return; }
              }
            },
          };
        },
        {
          overlay: true,
          overlayOptions: { width: "60%", maxWidth: 72, minWidth: 52, maxHeight: "50%", anchor: "center" },
        },
      );
    },
  });
}

// ─── Project tree ─────────────────────────────────────────────────────────────

function registerTreeCommands(
  pi: ExtensionAPI,
  edited: Map<string, EditStatus>,
  getSettings: () => Settings,
) {
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
    const lang = detectLanguageFromPath(absPath);
    let rendered: string;
    if (lang === "markdown") {
      // Built-in pure highlighter — zero deps, 16-color ANSI, works on every OS.
      rendered = highlightMarkdown(text);
    } else {
      try {
        // S4: force color so cli-highlight (chalk) emits ANSI under pi's managed,
        // non-TTY stdout. Without this, peek shows uncolored plain text.
        process.env.FORCE_COLOR ||= "3";
        // B2: lazy + graceful — if cli-highlight is missing, fall back to plain
        // text instead of crashing the whole extension at module load.
        const mod = await import("cli-highlight").catch(() => undefined);
        rendered = mod?.highlight
          ? mod.highlight(text, { language: lang, ignoreIllegals: true })
          : text;
      } catch {
        rendered = text; // never crash the peek on a highlight failure
      }
    }
    // Tab-expand so widths are predictable; split into display lines.
    const allLines = rendered.replace(/\t/g, "  ").split("\n");

    let peekScroll = 0;
    await ctx.ui.custom(
      (tui: any, theme: any, _kb: any, done: (v: null) => void) => {
        const B = (s: string) => theme.fg("border", s);
        const bodyH = (): number => Math.max(1, Math.floor(tui.terminal.rows * 0.8) - 4);

        const buildPeek = (width: number): string[] => {
          const innerW = width - 2;
          const h = bodyH();
          const maxScroll = Math.max(0, allLines.length - h);
          if (peekScroll > maxScroll) peekScroll = maxScroll;
          if (peekScroll < 0) peekScroll = 0;
          const H = "─";
          const lines: string[] = [];
          lines.push(B("╭" + H.repeat(innerW) + "╮"));
          const title = ` 👁  ${basename(absPath)}`;
          const pos = `${peekScroll + 1}-${Math.min(peekScroll + h, allLines.length)}/${allLines.length} `;
          const hint = `↑↓ scroll  g/G ends  spc/esc close  ${pos}`;
          const gap = Math.max(1, innerW - visibleWidth(title) - visibleWidth(hint));
          lines.push(B("│") + theme.fg("accent", title) + " ".repeat(gap) +
            theme.fg("dim", hint) + B("│"));
          lines.push(B("├" + H.repeat(innerW) + "┤"));
          const view = allLines.slice(peekScroll, peekScroll + h);
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
          render: (w: number) => buildPeek(w),
          invalidate: () => {},
          handleInput: (data: string) => {
            const h = bodyH();
            const maxScroll = Math.max(0, allLines.length - h);
            if (matchesKey(data, Key.escape) || data === "q" || data === " ") return done(null);
            if (matchesKey(data, Key.up))       { peekScroll = Math.max(0, peekScroll - 1);          tui.requestRender(); return; }
            if (matchesKey(data, Key.down))     { peekScroll = Math.min(maxScroll, peekScroll + 1);   tui.requestRender(); return; }
            if (matchesKey(data, Key.pageUp))   { peekScroll = Math.max(0, peekScroll - h);          tui.requestRender(); return; }
            if (matchesKey(data, Key.pageDown)) { peekScroll = Math.min(maxScroll, peekScroll + h);  tui.requestRender(); return; }
            if (data === "g") { peekScroll = 0;         tui.requestRender(); return; }
            if (data === "G") { peekScroll = maxScroll; tui.requestRender(); return; }
          },
        };
      },
      {
        overlay: true,
        overlayOptions: { width: "85%", maxWidth: 120, minWidth: 50, maxHeight: "80%", anchor: "center" },
      },
    );
  };

  const open = async (ctx: any) => {
    if (ctx.mode !== "tui") {
      ctx.ui.notify("/pi-files requires TUI mode", "error");
      return;
    }
    const cwd = ctx.sessionManager.getCwd();
    const allFiles = listProjectFiles(cwd);
    const root = buildTree(allFiles);

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
    let searchQuery = "";

    await ctx.ui.custom(
      (tui: any, theme: any, _kb: any, done: (v: null) => void) => {
        const B = (s: string) => theme.fg("border", s);

        // Highlight the matched portion of a path in accent color.
        const highlightMatch = (path: string, query: string): string => {
          if (!query) return theme.fg("muted", path);
          const lo = path.toLowerCase().indexOf(query.toLowerCase());
          if (lo < 0) return theme.fg("muted", path);
          return (
            theme.fg("muted", path.slice(0, lo)) +
            theme.fg("accent", path.slice(lo, lo + query.length)) +
            theme.fg("muted", path.slice(lo + query.length))
          );
        };

        const visibleBody = (): number => {
          const max = Math.max(1, Math.floor(tui.terminal.rows * 0.8) - 4);
          const total = searchQuery
            ? Math.max(1, filterFiles(allFiles, searchQuery).length)
            : Math.max(1, flattenVisible(root, expanded).length);
          return Math.min(max, total);
        };

        const buildSearchBody = (innerW: number, bodyH: number): string[] => {
          const results = filterFiles(allFiles, searchQuery);
          if (selected >= results.length) selected = Math.max(0, results.length - 1);
          if (selected < 0) selected = 0;
          if (selected < scroll) scroll = selected;
          if (selected >= scroll + bodyH) scroll = selected - bodyH + 1;
          if (scroll < 0) scroll = 0;

          return results.slice(scroll, scroll + bodyH).map((path, i) => {
            const idx = scroll + i;
            const isSelected = idx === selected;
            const status = editedStatus.get(path);
            const statusPart = status ? statusGlyph(status) + " " : "";
            const gutter = isSelected ? theme.fg("accent", "›") : " ";
            const prefix = status
              ? theme.fg(status === "new" ? "success" : "warning", statusGlyph(status) + " ")
              : "";
            const pathStyled = highlightMatch(path, searchQuery);
            // Use plain-text width for padding calculation
            const pad = " ".repeat(Math.max(0, innerW - 1 - visibleWidth(` ${statusPart}${path}`)));
            return gutter + " " + prefix + pathStyled + pad;
          });
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
          if (searchQuery) {
            const count = filterFiles(allFiles, searchQuery).length;
            const prompt = theme.fg("success", `/ ${searchQuery}▌`);
            const info = theme.fg("dim", `  ${count} result${count !== 1 ? "s" : ""}  esc clear `);
            const promptPlain = `/ ${searchQuery}▌`;
            const infoPlain = `  ${count} result${count !== 1 ? "s" : ""}  esc clear `;
            const gap = Math.max(1, innerW - visibleWidth(title) - visibleWidth(promptPlain) - visibleWidth(infoPlain));
            lines.push(B("│") + theme.fg("accent", title) + " ".repeat(gap) + prompt + info + B("│"));
          } else {
            const hint = "↑↓ move  ↵ open  → expand  ← collapse  spc peek  type to filter  esc close ";
            const gap = Math.max(1, innerW - visibleWidth(title) - visibleWidth(hint));
            lines.push(B("│") + theme.fg("accent", title) + " ".repeat(gap) +
              theme.fg("dim", hint) + B("│"));
          }
          lines.push(B("├" + H.repeat(innerW) + "┤"));
          const body = searchQuery ? buildSearchBody(innerW, bodyH) : buildBody(innerW, bodyH);
          const empty = searchQuery ? " (no matches)" : " (no files)";
          const rowsOut = body.length ? body : [theme.fg("dim", empty)];
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
            // Esc: clear filter if active, else close overlay
            if (matchesKey(data, Key.escape)) {
              if (searchQuery) { searchQuery = ""; selected = 0; scroll = 0; tui.requestRender(); }
              else done(null);
              return;
            }

            // Backspace: remove last filter char
            if (data === "\x7f" || data === "\b") {
              if (searchQuery.length > 0) {
                searchQuery = searchQuery.slice(0, -1);
                selected = 0; scroll = 0; tui.requestRender();
              }
              return;
            }

            // Space: peek selected (Quick Look style — works in both modes)
            if (data === " ") {
              if (searchQuery) {
                const path = filterFiles(allFiles, searchQuery)[selected];
                if (path) void peek(ctx, resolve(cwd, path));
              } else {
                const rows = flattenVisible(root, expanded);
                const node = rows[selected];
                if (node && !node.isDir) void peek(ctx, resolve(cwd, node.path));
              }
              return;
            }

            // Up / Down: navigate
            if (matchesKey(data, Key.up)) {
              selected = Math.max(0, selected - 1); tui.requestRender(); return;
            }
            if (matchesKey(data, Key.down)) {
              const count = searchQuery
                ? filterFiles(allFiles, searchQuery).length
                : flattenVisible(root, expanded).length;
              selected = Math.min(Math.max(0, count - 1), selected + 1);
              tui.requestRender(); return;
            }

            // Enter: open selected
            if (data === "\r") {
              if (searchQuery) {
                const path = filterFiles(allFiles, searchQuery)[selected];
                if (path) openExternally(ctx, resolve(cwd, path));
              } else {
                const rows = flattenVisible(root, expanded);
                const node = rows[selected];
                if (!node) return;
                if (node.isDir) { expanded.add(node.path); tui.requestRender(); }
                else openExternally(ctx, resolve(cwd, node.path));
              }
              return;
            }

            // Tree-only keys: expand / collapse dirs (inactive while filtering)
            if (!searchQuery) {
              const rows = flattenVisible(root, expanded);
              const node = rows[selected];
              if (!node) return;
              if (matchesKey(data, Key.right)) {
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
                tui.requestRender(); return;
              }
            }

            // Any printable char (excl. space, handled above): append to filter
            if (data.length === 1 && data >= "!") {
              searchQuery += data; selected = 0; scroll = 0; tui.requestRender();
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
}
