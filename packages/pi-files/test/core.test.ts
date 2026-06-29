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

import { buildOpenCommand } from "../src/core.ts";

test("buildOpenCommand uses `open` on macOS", () => {
  assert.deepEqual(buildOpenCommand("darwin", "/repo/a.md"), {
    cmd: "open",
    args: ["/repo/a.md"],
  });
});

test("buildOpenCommand uses cmd/start on Windows", () => {
  assert.deepEqual(buildOpenCommand("win32", "C:\\repo\\a.md"), {
    cmd: "cmd",
    args: ["/c", "start", "", "C:\\repo\\a.md"],
  });
});

test("buildOpenCommand falls back to xdg-open elsewhere", () => {
  assert.deepEqual(buildOpenCommand("linux", "/repo/a.md"), {
    cmd: "xdg-open",
    args: ["/repo/a.md"],
  });
  assert.deepEqual(buildOpenCommand("freebsd", "/repo/a.md"), {
    cmd: "xdg-open",
    args: ["/repo/a.md"],
  });
});

import {
  detectLanguageFromPath,
  looksBinary,
  isPreviewable,
} from "../src/core.ts";

test("detectLanguageFromPath maps known extensions", () => {
  assert.equal(detectLanguageFromPath("src/core.ts"), "typescript");
  assert.equal(detectLanguageFromPath("a/b.js"), "javascript");
  assert.equal(detectLanguageFromPath("data.json"), "json");
  assert.equal(detectLanguageFromPath("README.md"), "markdown");
});

test("detectLanguageFromPath returns undefined for unknown/extensionless", () => {
  assert.equal(detectLanguageFromPath("Makefile"), undefined);
  assert.equal(detectLanguageFromPath("weird.xyz"), undefined);
});

test("looksBinary detects a NUL byte, passes plain text", () => {
  assert.equal(looksBinary(Buffer.from("hello world")), false);
  assert.equal(looksBinary(Buffer.from([0x68, 0x00, 0x69])), true);
});

test("isPreviewable is true at/under cap, false over", () => {
  assert.equal(isPreviewable(100, 512), true);
  assert.equal(isPreviewable(512, 512), true);
  assert.equal(isPreviewable(513, 512), false);
});

import { highlightMarkdown, applyInlineMarkdown } from "../src/core.ts";

// ANSI code constants for assertions
const RST  = "\x1b[0m";
const BOLD = "\x1b[1m";
const YLW  = "\x1b[33m";
const CYN  = "\x1b[36m";
const GRN  = "\x1b[32m";
const BLU  = "\x1b[94m";

/** Strip all ANSI SGR codes so we can assert plain text content separately. */
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

import { filterFiles } from "../src/core.ts";

test("filterFiles: empty query returns all files", () => {
  const files = ["src/core.ts", "README.md", "test/core.test.ts"];
  assert.deepEqual(filterFiles(files, ""), files);
});

test("filterFiles: case-insensitive substring match", () => {
  const files = ["src/Core.ts", "README.md", "test/core.test.ts"];
  assert.deepEqual(filterFiles(files, "core"), ["src/Core.ts", "test/core.test.ts"]);
});

test("filterFiles: no match returns empty array", () => {
  const files = ["src/core.ts", "README.md"];
  assert.deepEqual(filterFiles(files, "zzznomatch"), []);
});

test("filterFiles: matches on full path, not just filename", () => {
  const files = ["packages/pi-files/src/core.ts", "packages/pi-footer/src/index.ts"];
  assert.deepEqual(filterFiles(files, "pi-files"), ["packages/pi-files/src/core.ts"]);
});

test("highlightMarkdown: h1 is bold + cyan, text preserved", () => {
  const out = highlightMarkdown("# Hello World");
  assert.ok(out.includes(BOLD), "h1 must be bold");
  assert.ok(out.includes(CYN),  "h1 must be cyan");
  assert.ok(strip(out).includes("Hello World"));
});

test("highlightMarkdown: h2 is bold + cyan, h3 is dim + cyan", () => {
  const h2 = highlightMarkdown("## Section");
  assert.ok(h2.includes(BOLD) && h2.includes(CYN));
  const h3 = highlightMarkdown("### Sub");
  assert.ok(h3.includes(CYN));
  assert.ok(strip(h3).includes("Sub"));
});

test("highlightMarkdown: fenced code block lines are yellow", () => {
  const out = highlightMarkdown("```ts\nconst x = 1;\n```");
  const lines = out.split("\n");
  assert.ok(lines[0].includes(YLW), "opening fence is yellow");
  assert.ok(lines[1].includes(YLW), "code inside fence is yellow");
  assert.ok(lines[2].includes(YLW), "closing fence is yellow");
});

test("highlightMarkdown: fenced blocks do not affect lines after closing fence", () => {
  const out = highlightMarkdown("```\ncode\n```\nnormal");
  const lines = out.split("\n");
  // "normal" line should NOT contain the code-block yellow (may have inline formatting reset only)
  assert.ok(!lines[3].startsWith(YLW), "line after fence is not styled as code");
});

test("highlightMarkdown: unordered list marker is green", () => {
  const out = highlightMarkdown("- item one");
  assert.ok(out.includes(GRN));
  assert.ok(strip(out).includes("item one"));
});

test("highlightMarkdown: ordered list marker is green", () => {
  const out = highlightMarkdown("1. first");
  assert.ok(out.includes(GRN));
  assert.ok(strip(out).includes("first"));
});

test("highlightMarkdown: blockquote is blue", () => {
  const out = highlightMarkdown("> quoted text");
  assert.ok(out.includes(BLU));
  assert.ok(strip(out).includes("> quoted text"));
});

test("highlightMarkdown: plain text round-trips unchanged", () => {
  const out = highlightMarkdown("just plain text");
  assert.equal(strip(out), "just plain text");
});

test("applyInlineMarkdown: inline code is yellow", () => {
  const out = applyInlineMarkdown("use `const` keyword");
  assert.ok(out.includes(YLW));
  assert.ok(strip(out).includes("`const`"));
});

test("applyInlineMarkdown: **bold** gets bold escape", () => {
  const out = applyInlineMarkdown("**important**");
  assert.ok(out.includes(BOLD));
  assert.ok(strip(out).includes("**important**"));
});

test("applyInlineMarkdown: *italic* gets italic escape", () => {
  const IT = "\x1b[3m";
  const out = applyInlineMarkdown("*note*");
  assert.ok(out.includes(IT));
  assert.ok(strip(out).includes("*note*"));
});

test("applyInlineMarkdown: [link](url) is magenta + dim url", () => {
  const MGT = "\x1b[35m";
  const out = applyInlineMarkdown("[click here](https://example.com)");
  assert.ok(out.includes(MGT));
  assert.ok(strip(out).includes("click here"));
  assert.ok(strip(out).includes("https://example.com"));
});

test("applyInlineMarkdown: text with no markup passes through", () => {
  const out = applyInlineMarkdown("ordinary words");
  assert.equal(out, "ordinary words");
});

test("walkDirRelative lists files relative, excluding .git and node_modules", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-files-"));
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
