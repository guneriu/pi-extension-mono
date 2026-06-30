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
import { basename, join, resolve as resolvePath } from "node:path";
import { execFileSync } from "node:child_process";
import { structuredPatch } from "diff";

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
    return files; // trust git result even when empty — avoids surfacing gitignored files via fallback
  } catch {
    return walkDirRelative(cwd);
  }
}

/**
 * Read a file's committed content from git HEAD. Returns undefined when not a
 * git repo, git is unavailable, or the path is not tracked at HEAD.
 * relPath must be posix-relative to cwd.
 */
export function getGitBaseline(cwd: string, relPath: string): string | undefined {
  try {
    // The `./` prefix forces git to resolve the path relative to `cwd` rather
    // than the repo root — essential in monorepos where cwd is a subdirectory.
    return execFileSync("git", ["show", `HEAD:./${relPath}`], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return undefined;
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

/**
 * Case-insensitive substring filter over a flat file list.
 * Empty query returns the full list unchanged.
 */
export function filterFiles(files: string[], query: string): string[] {
  if (!query) return files;
  const q = query.toLowerCase();
  return files.filter((f) => f.toLowerCase().includes(q));
}

// ─── Markdown highlighter ───────────────────────────────────────────────────
// Pure, zero-dependency, 16-color ANSI — works on macOS, Linux, Windows.
// Uses only the base 16-color range so there is no truecolor/256-color
// requirement; every terminal and Windows Terminal supports these codes.

const _R   = "\x1b[0m";  // reset
const _B   = "\x1b[1m";  // bold
const _DIM = "\x1b[2m";  // dim
const _IT  = "\x1b[3m";  // italic
const _CYN = "\x1b[36m"; // cyan  — headings
const _YLW = "\x1b[33m"; // yellow — code
const _GRN = "\x1b[32m"; // green  — list markers
const _MGT = "\x1b[35m"; // magenta — links
const _BLU = "\x1b[94m"; // bright blue — blockquotes

/**
 * Apply inline markdown spans to a single string: inline code, bold, italic,
 * links. Exported so it can be unit-tested independently.
 */
export function applyInlineMarkdown(text: string): string {
  // Inline code first — everything inside backticks is literal.
  text = text.replace(/`([^`\n]+)`/g, `${_YLW}\`$1\`${_R}`);
  // Bold: **text** or __text__ — exclude spans that contain backticks (already code-styled)
  text = text.replace(/\*\*([^*\n`]+)\*\*/g, `${_B}**$1**${_R}`);
  text = text.replace(/__([^_\n`]+)__/g, `${_B}__$1__${_R}`);
  // Italic: *text* or _text_ — lookbehind/lookahead on backtick prevents matching
  // inside code spans whose replacement output still contains the ` char.
  text = text.replace(/(?<![*_`])\*([^*\n`]+)\*(?![*`])/g, `${_IT}*$1*${_R}`);
  text = text.replace(/(?<![_`])_([^_\n`]+)_(?![_`])/g, `${_IT}_$1_${_R}`);
  // Links / images: [text](url)
  text = text.replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, `${_MGT}[$1]${_R}${_DIM}($2)${_R}`);
  return text;
}

/**
 * Syntax-highlight a full markdown document for terminal display.
 * Processes line-by-line with stateful fenced-code-block tracking.
 * Emits standard 16-color ANSI codes only — compatible with every terminal.
 */
export function highlightMarkdown(text: string): string {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      // Fenced code block delimiter (``` or ~~~)
      if (/^(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
        return `${_DIM}${_YLW}${line}${_R}`;
      }
      // Inside a fenced code block — dim yellow, no further processing
      if (inFence) return `${_YLW}${_DIM}${line}${_R}`;

      // ATX headings: # … ######
      const hm = line.match(/^(#{1,6})\s(.+)$/);
      if (hm) {
        const marks = hm[1];
        const body  = applyInlineMarkdown(hm[2]);
        if (marks.length === 1) return `${_B}${_CYN}${marks} ${_R}${_B}${body}${_R}`;
        if (marks.length === 2) return `${_B}${_CYN}${marks} ${_R}${body}`;
        return `${_DIM}${_CYN}${marks} ${_R}${body}`;
      }

      // Blockquote
      if (/^>/.test(line)) return `${_BLU}${_DIM}${line}${_R}`;

      // Horizontal rule (must come before setext-underline check)
      if (/^(\*{3,}|-{3,}|_{3,})$/.test(line)) return `${_DIM}${line}${_R}`;

      // Unordered list item: - / * / + (with optional indentation)
      const ulm = line.match(/^(\s*)([-*+]) (.*)$/);
      if (ulm) return `${ulm[1]}${_GRN}${ulm[2]}${_R} ${applyInlineMarkdown(ulm[3])}`;

      // Ordered list item: 1. / 12. (with optional indentation)
      const olm = line.match(/^(\s*)(\d+\.) (.*)$/);
      if (olm) return `${olm[1]}${_GRN}${olm[2]}${_R} ${applyInlineMarkdown(olm[3])}`;

      // Table separator row |---|---|
      if (/^\|[-: |]+\|$/.test(line)) return `${_DIM}${line}${_R}`;
      // Table data row — dim the pipe characters
      if (/^\|/.test(line)) return line.replace(/\|/g, `${_DIM}|${_R}`);

      // Plain paragraph text — apply inline spans only
      return applyInlineMarkdown(line);
    })
    .join("\n");
}

/**
 * Parse `mv <src> <dst>` patterns out of a shell command string.
 * Returns [oldAbsPath, newAbsPath] pairs for each simple rename found.
 * Returns [] for globs, multi-source mv, or non-mv commands.
 * Best-effort only — the caller prunes stale entries as a safety net.
 *
 * Note: `mv old.md dir/` (move-into-directory) is returned as-is;
 * the caller must check statSync(newAbs).isDirectory() and adjust.
 *
 * @param cmd  Raw bash command string
 * @param cwd  Current working directory (for resolving relative paths)
 */
export function parseMvRenames(cmd: string, cwd: string): Array<[string, string]> {
  const results: Array<[string, string]> = [];
  // Join backslash line continuations before splitting (mv src \
  //    dst → mv src dst)
  const normalised = cmd.replace(/\\\n\s*/g, " ");
  // Split on shell statement separators: &&, ||, ;, newlines
  const statements = normalised.split(/&&|\|\||;|\n/);
  for (const stmt of statements) {
    const tokens = stmt.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    if (tokens[0] !== "mv") continue;
    // Strip option flags (e.g. -f -n -i -v --force --) — both short and long
    const args = tokens.slice(1).filter((t) => !t.startsWith("-"));
    // Only handle simple two-arg form: mv <src> <dst>
    if (args.length !== 2) continue;
    // Reject globs — if either arg contains *, ?, or [ it's ambiguous
    if (args.some((a) => /[*?[\]]/.test(a))) continue;
    const oldAbs = args[0].startsWith("/") ? args[0] : resolvePath(cwd, args[0]);
    const newAbs = args[1].startsWith("/") ? args[1] : resolvePath(cwd, args[1]);
    results.push([oldAbs, newAbs]);
  }
  return results;
}

// ─── Unified diff ─────────────────────────────────────────────────────────────

export type DiffLineKind = "add" | "del" | "ctx" | "gap";
export interface DiffLine {
  kind: DiffLineKind;
  /** Line content WITHOUT the +/-/space prefix. For "gap" this is the marker. */
  text: string;
}
export interface UnifiedDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
}

/**
 * Build a hunk-based unified diff (N lines of context) between two strings.
 * Backed by jsdiff's structuredPatch — pure JS, cross-platform. Returns
 * classified lines ready for styling. A "gap" line marks the boundary between
 * non-adjacent hunks. Identical input yields an empty line list.
 */
export function buildUnifiedDiff(before: string, after: string, context = 3): UnifiedDiff {
  const patch = structuredPatch("a", "b", before, after, "", "", { context });
  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  patch.hunks.forEach((hunk, i) => {
    if (i > 0) lines.push({ kind: "gap", text: "⋯" });
    for (const raw of hunk.lines) {
      const marker = raw[0];
      // jsdiff emits "\ No newline at end of file" — drop it, it's not content.
      if (marker === "\\") continue;
      const text = raw.slice(1);
      if (marker === "+") {
        lines.push({ kind: "add", text });
        added++;
      } else if (marker === "-") {
        lines.push({ kind: "del", text });
        removed++;
      } else {
        lines.push({ kind: "ctx", text });
      }
    }
  });
  return { lines, added, removed };
}
