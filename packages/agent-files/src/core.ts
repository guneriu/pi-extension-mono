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
