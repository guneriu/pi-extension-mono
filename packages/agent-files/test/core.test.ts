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
