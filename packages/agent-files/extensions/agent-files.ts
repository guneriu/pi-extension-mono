/**
 * agent-files (@guneriu/pi-agent-files)
 *
 * Compact widget above the input bar listing files the agent edited this
 * session, plus an on-demand interactive project tree (/agent-files, /files).
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

// Stub replaced by the real interactive tree in Task 8. Keeping it here lets
// this file compile and be committed on its own (S5).
function registerTreeCommands(_pi: ExtensionAPI, _edited: Map<string, EditStatus>) {}
