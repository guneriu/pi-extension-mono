import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface SessionFilesSettings {
  enabled: boolean;
  trackContext: boolean;
  trackReads: boolean;
  trackModified: boolean;
  maxFilesToShow: number;
}

const DEFAULTS: SessionFilesSettings = {
  enabled: true,
  trackContext: true,
  trackReads: true,
  trackModified: true,
  maxFilesToShow: 0,
};

function getSettingsFile(): string {
  const dir = join(getAgentDir(), "extensions", "pi-session-files");
  mkdirSync(dir, { recursive: true });
  return join(dir, "settings.json");
}

function loadSettings(): SessionFilesSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(getSettingsFile(), "utf-8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

interface FileInfo {
  path: string;
  type: "read" | "modified" | "context";
  count: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
}

/**
 * Scan a directory for context files (AGENTS.md, SYSTEM.md, CLAUDE.md, etc.)
 * Uses ctx.sessionManager.getCwd() to find files in the session's working directory.
 */
function scanForContextFiles(cwd: string): Array<{ path: string; type: string }> {
  const contextPatterns = ["AGENTS.md", "SYSTEM.md", "CLAUDE.md", "claude.md"];
  const contextFiles: Array<{ path: string; type: string }> = [];

  try {
    for (const pattern of contextPatterns) {
      const filePath = join(cwd, pattern);
      if (!existsSync(filePath)) continue;
      try {
        // statSync dereferences symlinks — throws if the symlink target is broken
        statSync(filePath);
      } catch {
        continue; // broken symlink — skip
      }
      contextFiles.push({
        path: filePath,
        type: pattern === "AGENTS.md" ? "AGENTS.md"
            : pattern === "SYSTEM.md" ? "SYSTEM.md"
            : "CLAUDE",
      });
    }

    // Also check .pi/agents/ directory
    const piAgentsDir = join(cwd, ".pi", "agents");
    if (existsSync(piAgentsDir)) {
      try {
        for (const file of readdirSync(piAgentsDir)) {
          if (file.endsWith(".md")) {
            contextFiles.push({
              path: join(piAgentsDir, file),
              type: file === "AGENTS.md" ? "AGENTS.md" : "Custom",
            });
          }
        }
      } catch { /* non-fatal */ }
    }
  } catch { /* non-fatal */ }

  return contextFiles;
}

/** Analyze session history to extract all files read and modified. */
function analyzeSessionFiles(branch: any[]): Map<string, FileInfo> {
  const settings = loadSettings();
  const files = new Map<string, FileInfo>();

  for (const entry of branch) {
    if (entry.type !== "message") continue;
    if (entry.message?.role !== "assistant") continue;

    for (const block of entry.message?.content || []) {
      if (block.type !== "toolCall") continue;

      const toolName = block.name;
      const args = block.arguments || {};

      const trackFile = (path: string, type: "read" | "modified") => {
        // Use path+type as composite key so a file that is both read AND modified
        // appears in both sections (previously, modified would overwrite the read entry)
        const key = `${type}:${path}`;
        const existing = files.get(key);
        files.set(key, {
          path, type,
          count: (existing?.count || 0) + 1,
          firstTimestamp: existing?.firstTimestamp || entry.timestamp,
          lastTimestamp: entry.timestamp,
        });
      };

      if (settings.trackReads && toolName === "read" && args.path)
        trackFile(args.path, "read");
      if (settings.trackModified && toolName === "edit" && args.path)
        trackFile(args.path, "modified");
      if (settings.trackModified && toolName === "write" && args.path)
        trackFile(args.path, "modified");
    }
  }

  return files;
}

function sortFiles(files: FileInfo[], sortBy: "frequency" | "alpha"): FileInfo[] {
  return [...files].sort(sortBy === "frequency"
    ? (a, b) => b.count - a.count
    : (a, b) => a.path.localeCompare(b.path));
}

export default function (pi: ExtensionAPI) {
  // B.1 FIX: capturedContextFiles is inside the factory — not shared across sessions
  let capturedContextFiles: Array<{ path: string; type: string }> = [];

  pi.on("before_agent_start", async (event, _ctx) => {
    if (event.systemPromptOptions?.contextFiles) {
      capturedContextFiles = event.systemPromptOptions.contextFiles.map((file: any) => ({
        path: file.path,
        type: file.path.endsWith("AGENTS.md") ? "AGENTS.md"
            : file.path.endsWith("SYSTEM.md") ? "SYSTEM.md"
            : file.path.endsWith(".md") ? "Custom" : "Other",
      }));
    }
  });

  pi.registerCommand("session-files", {
    description: "Show context files, files read, and files modified in current session",
    handler: async (argsStr, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/session-files requires TUI mode", "error");
        return;
      }

      const args = (argsStr || "").split(/\s+/).filter(Boolean);
      let sortBy: "frequency" | "alpha" = "frequency";
      let filterType: "all" | "read" | "modified" | "context" = "all";

      for (const arg of args) {
        if (arg === "--alpha") sortBy = "alpha";
        if (arg === "--frequency") sortBy = "frequency";
        if (arg === "--read-only") filterType = "read";
        if (arg === "--modified-only") filterType = "modified";
        if (arg === "--context-only") filterType = "context";
      }

      const branch = ctx.sessionManager.getBranch();
      if (!branch.length) { ctx.ui.notify("No session history yet", "info"); return; }

      const sessionFiles = analyzeSessionFiles(branch);
      const theme = ctx.ui.theme;
      const settings = loadSettings();
      const sessionCwd = ctx.sessionManager.getCwd();

      // Use event-captured files first; fall back to filesystem scan
      const contextFiles = capturedContextFiles.length > 0
        ? capturedContextFiles
        : scanForContextFiles(sessionCwd);

      let output = "\n";
      output += theme.fg("accent", "📋 Session Files Report") + "\n";
      output += theme.fg("dim", "═".repeat(50)) + "\n\n";

      if (settings.trackContext && (filterType === "all" || filterType === "context")) {
        if (contextFiles.length > 0) {
          output += theme.fg("success", "📄 Context Files") + ` (${contextFiles.length}):\n`;
          for (const file of contextFiles)
            output += theme.fg("dim", "  • ") + theme.fg("muted", file.path) + "\n";
          output += "\n";
        } else {
          output += theme.fg("dim", "📄 Context Files: None\n   (no AGENTS.md or SYSTEM.md found)\n\n");
        }
      }

      const readFiles = sortFiles(Array.from(sessionFiles.values()).filter(f => f.type === "read"), sortBy);
      const maxRead = settings.maxFilesToShow > 0 ? settings.maxFilesToShow : 20;

      if (settings.trackReads && (filterType === "all" || filterType === "read") && readFiles.length > 0) {
        output += theme.fg("success", "📖 Files Read") + ` (${readFiles.length}):\n`;
        for (const file of readFiles.slice(0, maxRead)) {
          const count = file.count > 1 ? theme.fg("dim", ` (${file.count}x)`) : "";
          output += theme.fg("dim", "  • ") + theme.fg("muted", file.path) + count + "\n";
        }
        if (readFiles.length > maxRead)
          output += theme.fg("dim", `  ... and ${readFiles.length - maxRead} more\n`);
        output += "\n";
      }

      const modifiedFiles = sortFiles(Array.from(sessionFiles.values()).filter(f => f.type === "modified"), sortBy);
      const maxModified = settings.maxFilesToShow > 0 ? settings.maxFilesToShow : Infinity;

      if (settings.trackModified && (filterType === "all" || filterType === "modified") && modifiedFiles.length > 0) {
        output += theme.fg("warning", "✏️  Files Modified") + ` (${modifiedFiles.length}):\n`;
        for (const file of modifiedFiles.slice(0, maxModified)) {
          const count = file.count > 1 ? theme.fg("dim", ` (${file.count}x)`) : "";
          output += theme.fg("dim", "  • ") + theme.fg("muted", file.path) + count + "\n";
        }
        if (modifiedFiles.length > maxModified)
          output += theme.fg("dim", `  ... and ${modifiedFiles.length - maxModified} more\n`);
        output += "\n";
      }

      // Deduplicate by path — sessionFiles keys are composite "type:path" since the fix
      const uniquePaths = new Set([
        ...contextFiles.map(f => f.path),
        ...Array.from(sessionFiles.values()).map(f => f.path),
      ]);
      const totalFiles = uniquePaths.size;
      output += theme.fg("dim", "─".repeat(50)) + "\n";
      output += theme.fg("accent", "📊 Summary") + ": " +
        theme.fg("success", `${totalFiles} total`) + " | " +
        theme.fg("success", `${readFiles.length} read`) + " | " +
        theme.fg("warning", `${modifiedFiles.length} modified`) + "\n";

      ctx.ui.notify(output, "info");
    },
  });
}
