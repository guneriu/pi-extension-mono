export type EditStatus = "new" | "modified";
export type EditKind = "write" | "edit";

/**
 * Decide the status glyph for a write/edit.
 * - "new" is sticky once set (the agent created the file this session).
 * - write to a path that does not currently exist => "new".
 * - everything else => "modified".
 */
export function classifyEdit(
  kind: EditKind,
  existsBefore: boolean,
  previous: EditStatus | undefined,
): EditStatus {
  if (previous === "new") return "new";
  if (kind === "write" && !existsBefore) return "new";
  return "modified";
}

export interface EditedFile {
  relPath: string;
  status: EditStatus;
}

export interface WidgetLines {
  header: string | undefined;
  rows: string[];
  overflow: string | undefined;
}

export function statusGlyph(status: EditStatus): string {
  return status === "new" ? "+" : "M";
}

/**
 * Build plain (unstyled) widget content; the extension applies theme colors.
 * `files` MUST already be in display order (newest edit first) — the extension
 * is responsible for ordering. We keep the first `maxRows` so the newest edits
 * are shown and older ones fold into the overflow line.
 */
export function buildWidgetLines(files: EditedFile[], maxRows: number): WidgetLines {
  if (files.length === 0) {
    return { header: undefined, rows: [], overflow: undefined };
  }
  const shown = files.slice(0, maxRows);
  const rows = shown.map((f) => `${statusGlyph(f.status)} ${f.relPath}`);
  const hidden = files.length - shown.length;
  return {
    header: `Edited files (${files.length})`,
    rows,
    overflow: hidden > 0 ? `… +${hidden} more` : undefined,
  };
}

export interface TreeNode {
  name: string;       // basename
  path: string;       // posix-style relative path from cwd
  isDir: boolean;
  depth: number;      // 0 for top-level entries
  children: TreeNode[];
}

/** Parse `git ls-files` style newline output into clean relative paths. */
export function parseGitFileList(out: string): string[] {
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** All ancestor directory paths of a file, root-first. "docs/plans/x" -> ["docs","docs/plans"]. */
export function ancestorsOf(relPath: string): string[] {
  const parts = relPath.split("/");
  const dirs: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    dirs.push(parts.slice(0, i + 1).join("/"));
  }
  return dirs;
}

/** Build a synthetic root node whose children are the top-level entries. */
export function buildTree(relPaths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, depth: -1, children: [] };
  for (const rel of relPaths) {
    const parts = rel.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isDir = i < parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === name && c.isDir === isDir);
      if (!child) {
        child = { name, path, isDir, depth: i, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; // dirs first
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

/** DFS over the tree, descending into a dir only when its path is in `expanded`. */
export function flattenVisible(root: TreeNode, expanded: Set<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode) => {
    for (const child of n.children) {
      out.push(child);
      if (child.isDir && expanded.has(child.path)) walk(child);
    }
  };
  walk(root);
  return out;
}

export interface BranchEdit {
  path: string;
  kind: EditKind;
}

/**
 * Scan a session branch (ctx.sessionManager.getBranch()) for write/edit tool
 * calls and return their target paths in order. Mirrors the toolCall shape used
 * across pi sessions: assistant message -> content[] -> { type:"toolCall", name, arguments }.
 */
export function extractEditsFromBranch(branch: any[]): BranchEdit[] {
  const edits: BranchEdit[] = [];
  for (const entry of branch) {
    if (entry?.type !== "message") continue;
    if (entry.message?.role !== "assistant") continue;
    for (const block of entry.message?.content ?? []) {
      if (block?.type !== "toolCall") continue;
      const kind = block.name;
      if (kind !== "write" && kind !== "edit") continue;
      const path = block.arguments?.path;
      if (typeof path !== "string" || path.length === 0) continue;
      edits.push({ path, kind });
    }
  }
  return edits;
}

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ALWAYS_EXCLUDE = new Set([".git", "node_modules"]);

/** Recursive readdir fallback returning posix-relative paths, excluding noise dirs. */
export function walkDirRelative(cwd: string): string[] {
  const out: string[] = [];
  const walk = (absDir: string, relPrefix: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && ALWAYS_EXCLUDE.has(e.name)) continue;
      const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(`${absDir}/${e.name}`, rel);
      } else if (e.isFile()) {
        out.push(rel);
      }
    }
  };
  walk(cwd, "");
  return out;
}

/**
 * Preferred source: git ls-files (respects .gitignore exactly). Falls back to a
 * filesystem walk when not a git repo or git is unavailable.
 *
 * Note: `git ls-files --cached` can report staged-but-deleted paths, so we drop
 * entries that no longer exist on disk before building the tree.
 */
export function listProjectFiles(cwd: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const files = parseGitFileList(out).filter((rel) => existsSync(join(cwd, rel)));
    if (files.length > 0) return files;
    return walkDirRelative(cwd);
  } catch {
    return walkDirRelative(cwd);
  }
}

// ─── Open & Peek helpers ────────────────────────────────────────────────────

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

/** Minimal extension -> cli-highlight language id map. Undefined => auto-detect. */
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
