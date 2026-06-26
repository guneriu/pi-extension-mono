import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEdit, type EditStatus } from "../src/core.ts";

test("write to a non-existent file is 'new'", () => {
  assert.equal(classifyEdit("write", false, undefined), "new");
});

test("write to an existing file is 'modified'", () => {
  assert.equal(classifyEdit("write", true, undefined), "modified");
});

test("edit is always 'modified'", () => {
  assert.equal(classifyEdit("edit", false, undefined), "modified");
  assert.equal(classifyEdit("edit", true, undefined), "modified");
});

test("'new' is sticky: never downgraded to modified", () => {
  const prev: EditStatus = "new";
  assert.equal(classifyEdit("edit", true, prev), "new");
  assert.equal(classifyEdit("write", true, prev), "new");
});

test("modified can upgrade to new (write of recreated file)", () => {
  const prev: EditStatus = "modified";
  assert.equal(classifyEdit("write", false, prev), "new");
});

import { buildWidgetLines, type EditedFile } from "../src/core.ts";

const files: EditedFile[] = [
  { relPath: "a.md", status: "modified" },
  { relPath: "b.md", status: "new" },
  { relPath: "c.md", status: "new" },
];

test("widget shows header + all rows when under cap", () => {
  const lines = buildWidgetLines(files, 6);
  assert.equal(lines.header, "Edited files (3)");
  assert.deepEqual(lines.rows, ["M a.md", "+ b.md", "+ c.md"]);
  assert.equal(lines.overflow, undefined);
});

test("widget caps rows and reports overflow", () => {
  const many: EditedFile[] = Array.from({ length: 10 }, (_, i) => ({
    relPath: `f${i}.md`,
    status: "modified" as const,
  }));
  const lines = buildWidgetLines(many, 6);
  assert.equal(lines.rows.length, 6);
  assert.equal(lines.overflow, "… +4 more");
});

test("empty file list yields no header/rows", () => {
  const lines = buildWidgetLines([], 6);
  assert.equal(lines.header, undefined);
  assert.deepEqual(lines.rows, []);
});

import {
  buildTree,
  ancestorsOf,
  flattenVisible,
  parseGitFileList,
  type TreeNode,
} from "../src/core.ts";

test("parseGitFileList splits, trims, drops blanks", () => {
  assert.deepEqual(parseGitFileList("a.md\nsub/b.ts\n\n"), ["a.md", "sub/b.ts"]);
});

test("buildTree nests files under dirs, dirs sorted before files", () => {
  const root = buildTree(["docs/plans/rca.md", "docs/x.md", "FEATURES.md"]);
  // root children: docs (dir) before FEATURES.md (file)
  assert.deepEqual(root.children.map((c) => c.name), ["docs", "FEATURES.md"]);
  const docs = root.children[0];
  assert.equal(docs.isDir, true);
  assert.deepEqual(docs.children.map((c) => c.name), ["plans", "x.md"]);
});

test("ancestorsOf returns each parent dir path", () => {
  assert.deepEqual(ancestorsOf("docs/plans/rca.md"), ["docs", "docs/plans"]);
  assert.deepEqual(ancestorsOf("FEATURES.md"), []);
});

test("flattenVisible only descends into expanded dirs", () => {
  const root = buildTree(["docs/plans/rca.md", "FEATURES.md"]);
  const collapsed = flattenVisible(root, new Set());
  assert.deepEqual(collapsed.map((n) => n.path), ["docs", "FEATURES.md"]);
  const expanded = flattenVisible(root, new Set(["docs", "docs/plans"]));
  assert.deepEqual(expanded.map((n) => n.path), [
    "docs",
    "docs/plans",
    "docs/plans/rca.md",
    "FEATURES.md",
  ]);
});

import { extractEditsFromBranch } from "../src/core.ts";

test("extractEditsFromBranch collects write/edit paths from assistant toolCalls", () => {
  const branch = [
    { type: "message", message: { role: "assistant", content: [
      { type: "toolCall", name: "edit", arguments: { path: "/repo/a.md" } },
      { type: "toolCall", name: "read", arguments: { path: "/repo/skip.md" } },
      { type: "toolCall", name: "write", arguments: { path: "/repo/b.md" } },
    ] } },
    { type: "message", message: { role: "user", content: [] } },
  ];
  const result = extractEditsFromBranch(branch);
  assert.deepEqual(result, [
    { path: "/repo/a.md", kind: "edit" },
    { path: "/repo/b.md", kind: "write" },
  ]);
});

test("extractEditsFromBranch ignores non-assistant + missing paths", () => {
  const branch = [
    { type: "message", message: { role: "assistant", content: [
      { type: "toolCall", name: "write", arguments: {} },
    ] } },
  ];
  assert.deepEqual(extractEditsFromBranch(branch), []);
});

import { walkDirRelative } from "../src/core.ts";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("walkDirRelative lists files relative, excluding .git and node_modules", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-files-"));
  mkdirSync(join(dir, "sub"));
  mkdirSync(join(dir, ".git"));
  mkdirSync(join(dir, "node_modules"));
  writeFileSync(join(dir, "a.md"), "x");
  writeFileSync(join(dir, "sub", "b.ts"), "x");
  writeFileSync(join(dir, ".git", "cfg"), "x");
  writeFileSync(join(dir, "node_modules", "dep.js"), "x");

  const files = walkDirRelative(dir).sort();
  assert.deepEqual(files, ["a.md", "sub/b.ts"]);
});
