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
