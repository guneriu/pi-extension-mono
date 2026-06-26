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
