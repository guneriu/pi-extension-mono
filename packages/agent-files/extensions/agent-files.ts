/**
 * agent-files (@guneriu/pi-agent-files)
 *
 * Compact widget above the input bar listing files the agent edited this
 * session, plus an on-demand interactive project tree (/agent-files, /files).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
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

// ─── Settings ───────────────────────────────────────────────────────────────
interface Settings {
  enabled: boolean;
  maxWidgetRows: number;
  showIdleHint: boolean;
}
const DEFAULTS: Settings = { enabled: true, maxWidgetRows: 6, showIdleHint: true };

function getSettingsFile(): string {
  const dir = `${getAgentDir()}/extensions/pi-agent-files`;
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

const WIDGET_ID = "agent-files";

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
          render: () => [theme.fg("dim", "📁 /agent-files — file tree")],
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
          lines.push(theme.fg("accent", w.header) + theme.fg("dim", "  ·  /agent-files"));
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

function registerTreeCommands(pi: ExtensionAPI, edited: Map<string, EditStatus>) {
  const open = async (ctx: any) => {
    if (ctx.mode !== "tui") {
      ctx.ui.notify("/agent-files requires TUI mode", "error");
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

  pi.registerCommand("agent-files", { description: "Browse the project file tree (agent edits highlighted)", handler: (_a, ctx) => open(ctx) });
  pi.registerCommand("files", { description: "Alias for /agent-files", handler: (_a, ctx) => open(ctx) });
}
