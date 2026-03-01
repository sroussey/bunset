import { test, expect, describe } from "bun:test";
import { parseCommit, groupCommits, filterCommitsForPackage } from "./commits.ts";
import type { ParsedCommit } from "./types.ts";

describe("parseCommit", () => {
  // [type] description
  test("parses [feat] commit", () => {
    const result = parseCommit("abc123", "[feat] Add user auth");
    expect(result.type).toBe("feature");
    expect(result.commitScope).toBeNull();
    expect(result.files).toEqual([]);
    expect(result.description).toBe("Add user auth");
  });

  test("parses [feature] commit", () => {
    const result = parseCommit("abc123", "[feature] Add login");
    expect(result.type).toBe("feature");
    expect(result.description).toBe("Add login");
  });

  test("parses [fix] commit", () => {
    const result = parseCommit("def456", "[fix] Resolve crash on startup");
    expect(result.type).toBe("bugfix");
    expect(result.description).toBe("Resolve crash on startup");
  });

  test("parses [bug] commit", () => {
    const result = parseCommit("def456", "[bug] Fix null pointer");
    expect(result.type).toBe("bugfix");
  });

  test("parses [bugfix] commit", () => {
    const result = parseCommit("def456", "[bugfix] Handle edge case");
    expect(result.type).toBe("bugfix");
  });

  test("parses [test] commit", () => {
    const result = parseCommit("ghi789", "[test] Add unit tests for parser");
    expect(result.type).toBe("test");
    expect(result.description).toBe("Add unit tests for parser");
  });

  test("parses [refactor] commit", () => {
    const result = parseCommit("a1", "[refactor] Simplify auth module");
    expect(result.type).toBe("refactor");
    expect(result.description).toBe("Simplify auth module");
  });

  test("parses [perf] commit", () => {
    const result = parseCommit("a2", "[perf] Speed up query");
    expect(result.type).toBe("perf");
    expect(result.description).toBe("Speed up query");
  });

  test("parses [style] commit", () => {
    const result = parseCommit("a3", "[style] Fix formatting");
    expect(result.type).toBe("style");
    expect(result.description).toBe("Fix formatting");
  });

  test("parses [docs] commit", () => {
    const result = parseCommit("a4", "[docs] Update readme");
    expect(result.type).toBe("docs");
    expect(result.description).toBe("Update readme");
  });

  test("parses [build] commit", () => {
    const result = parseCommit("a5", "[build] Update dependencies");
    expect(result.type).toBe("build");
    expect(result.description).toBe("Update dependencies");
  });

  test("parses [ops] commit", () => {
    const result = parseCommit("a6", "[ops] Update CI pipeline");
    expect(result.type).toBe("ops");
    expect(result.description).toBe("Update CI pipeline");
  });

  test("parses [chore] commit", () => {
    const result = parseCommit("a7", "[chore] Initial commit");
    expect(result.type).toBe("chore");
    expect(result.description).toBe("Initial commit");
  });

  // [type]: description
  test("parses [feat]: commit", () => {
    const result = parseCommit("abc123", "[feat]: Add user auth");
    expect(result.type).toBe("feature");
    expect(result.description).toBe("Add user auth");
  });

  test("parses [fix]: commit", () => {
    const result = parseCommit("def456", "[fix]: Resolve crash");
    expect(result.type).toBe("bugfix");
    expect(result.description).toBe("Resolve crash");
  });

  // type: description
  test("parses feat: commit", () => {
    const result = parseCommit("abc123", "feat: Add user auth");
    expect(result.type).toBe("feature");
    expect(result.description).toBe("Add user auth");
  });

  test("parses fix: commit", () => {
    const result = parseCommit("def456", "fix: Resolve crash");
    expect(result.type).toBe("bugfix");
    expect(result.description).toBe("Resolve crash");
  });

  test("parses test: commit", () => {
    const result = parseCommit("ghi789", "test: Add parser tests");
    expect(result.type).toBe("test");
    expect(result.description).toBe("Add parser tests");
  });

  test("parses refactor: commit", () => {
    const result = parseCommit("b1", "refactor: Simplify logic");
    expect(result.type).toBe("refactor");
    expect(result.description).toBe("Simplify logic");
  });

  test("parses perf: commit", () => {
    const result = parseCommit("b2", "perf: Optimize render");
    expect(result.type).toBe("perf");
    expect(result.description).toBe("Optimize render");
  });

  test("parses chore: commit", () => {
    const result = parseCommit("b3", "chore: Bump version");
    expect(result.type).toBe("chore");
    expect(result.description).toBe("Bump version");
  });

  // Scoped commits: [type(scope)] description
  test("parses [feat(auth)] commit with scope", () => {
    const result = parseCommit("s1", "[feat(auth)] Add login");
    expect(result.type).toBe("feature");
    expect(result.commitScope).toBe("auth");
    expect(result.description).toBe("Add login");
  });

  test("parses [fix(ui)] commit with scope", () => {
    const result = parseCommit("s2", "[fix(ui)] Fix button color");
    expect(result.type).toBe("bugfix");
    expect(result.commitScope).toBe("ui");
    expect(result.description).toBe("Fix button color");
  });

  // Scoped commits: [type(scope)]: description
  test("parses [feat(api)]: commit with scope and colon", () => {
    const result = parseCommit("s3", "[feat(api)]: Add endpoint");
    expect(result.type).toBe("feature");
    expect(result.commitScope).toBe("api");
    expect(result.description).toBe("Add endpoint");
  });

  // Scoped commits: type(scope): description
  test("parses feat(auth): commit with scope", () => {
    const result = parseCommit("s4", "feat(auth): Add logout");
    expect(result.type).toBe("feature");
    expect(result.commitScope).toBe("auth");
    expect(result.description).toBe("Add logout");
  });

  test("parses fix(parser): commit with scope", () => {
    const result = parseCommit("s5", "fix(parser): Handle edge case");
    expect(result.type).toBe("bugfix");
    expect(result.commitScope).toBe("parser");
    expect(result.description).toBe("Handle edge case");
  });

  // Edge cases
  test("returns null type for unrecognized [prefix]", () => {
    const result = parseCommit("jkl012", "[unknown] Something");
    expect(result.type).toBeNull();
    expect(result.description).toBe("Something");
  });

  test("returns null type for unrecognized prefix:", () => {
    const result = parseCommit("jkl012", "unknown: Something");
    expect(result.type).toBeNull();
    expect(result.description).toBe("Something");
  });

  test("returns null type for plain commits", () => {
    const result = parseCommit("mno345", "Regular commit message");
    expect(result.type).toBeNull();
    expect(result.commitScope).toBeNull();
    expect(result.description).toBe("Regular commit message");
  });

  test("is case-insensitive for type keyword", () => {
    const result = parseCommit("stu901", "[FEAT] Uppercase type");
    expect(result.type).toBe("feature");
  });

  test("is case-insensitive for bare prefix", () => {
    const result = parseCommit("stu901", "FEAT: Uppercase type");
    expect(result.type).toBe("feature");
  });

  test("handles missing close bracket", () => {
    const result = parseCommit("vwx234", "[feat No closing bracket");
    expect(result.type).toBeNull();
  });
});

describe("groupCommits", () => {
  test("groups commits by type", () => {
    const commits: ParsedCommit[] = [
      { hash: "a", message: "", type: "feature", commitScope: null, description: "F1", files: [] },
      { hash: "b", message: "", type: "bugfix", commitScope: null, description: "B1", files: [] },
      { hash: "c", message: "", type: "test", commitScope: null, description: "T1", files: [] },
      { hash: "d", message: "", type: "feature", commitScope: "auth", description: "F2", files: [] },
      { hash: "e", message: "", type: "refactor", commitScope: null, description: "R1", files: [] },
      { hash: "f", message: "", type: "chore", commitScope: null, description: "C1", files: [] },
      { hash: "g", message: "", type: null, commitScope: null, description: "Ignored", files: [] },
    ];
    const groups = groupCommits(commits);
    expect(groups.feature).toHaveLength(2);
    expect(groups.bugfix).toHaveLength(1);
    expect(groups.test).toHaveLength(1);
    expect(groups.refactor).toHaveLength(1);
    expect(groups.chore).toHaveLength(1);
    expect(groups.perf).toHaveLength(0);
    expect(groups.docs).toHaveLength(0);
  });

  test("handles empty commit list", () => {
    const groups = groupCommits([]);
    expect(groups.feature).toHaveLength(0);
    expect(groups.bugfix).toHaveLength(0);
    expect(groups.test).toHaveLength(0);
  });
});

describe("filterCommitsForPackage", () => {
  const commits: ParsedCommit[] = [
    { hash: "a", message: "", type: "feature", commitScope: null, description: "A feat", files: ["packages/a/src/index.ts"] },
    { hash: "b", message: "", type: "bugfix", commitScope: null, description: "B fix", files: ["packages/b/src/main.ts"] },
    { hash: "c", message: "", type: "feature", commitScope: null, description: "Both", files: ["packages/a/lib/x.ts", "packages/b/lib/y.ts"] },
    { hash: "d", message: "", type: "feature", commitScope: null, description: "No files", files: [] },
  ];

  test("filters commits to only those touching the package", () => {
    const filtered = filterCommitsForPackage(commits, "/root/packages/a", "/root");
    expect(filtered).toHaveLength(3); // a, c (touches a), d (no files = included)
    expect(filtered.map((c) => c.hash)).toEqual(["a", "c", "d"]);
  });

  test("filters for a different package", () => {
    const filtered = filterCommitsForPackage(commits, "/root/packages/b", "/root");
    expect(filtered).toHaveLength(3); // b, c (touches b), d (no files = included)
    expect(filtered.map((c) => c.hash)).toEqual(["b", "c", "d"]);
  });

  test("includes commits with no files (fallback)", () => {
    const noFileCommits: ParsedCommit[] = [
      { hash: "x", message: "", type: "feature", commitScope: null, description: "X", files: [] },
    ];
    const filtered = filterCommitsForPackage(noFileCommits, "/root/packages/a", "/root");
    expect(filtered).toHaveLength(1);
  });
});
