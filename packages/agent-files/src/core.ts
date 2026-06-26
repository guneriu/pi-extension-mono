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
