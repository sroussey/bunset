import { test, expect, describe } from "bun:test";
import { parseCommit, groupCommits } from "./commits.ts";

describe("parseCommit", () => {
  test("parses feature commit", () => {
    const result = parseCommit("abc123", "[feat] Add user auth");
    expect(result.type).toBe("feature");
    expect(result.description).toBe("Add user auth");
  });

  test("parses feature with full keyword", () => {
    const result = parseCommit("abc123", "[feature] Add login");
    expect(result.type).toBe("feature");
    expect(result.description).toBe("Add login");
  });

  test("parses bugfix commit", () => {
    const result = parseCommit("def456", "[fix] Resolve crash on startup");
    expect(result.type).toBe("bugfix");
    expect(result.description).toBe("Resolve crash on startup");
  });

  test("parses bug keyword", () => {
    const result = parseCommit("def456", "[bug] Fix null pointer");
    expect(result.type).toBe("bugfix");
  });

  test("parses bugfix keyword", () => {
    const result = parseCommit("def456", "[bugfix] Handle edge case");
    expect(result.type).toBe("bugfix");
  });

  test("parses test commit", () => {
    const result = parseCommit("ghi789", "[test] Add unit tests for parser");
    expect(result.type).toBe("test");
    expect(result.description).toBe("Add unit tests for parser");
  });

  test("returns null type for unrecognized prefix", () => {
    const result = parseCommit("jkl012", "[docs] Update readme");
    expect(result.type).toBeNull();
    expect(result.description).toBe("Update readme");
  });

  test("returns null type for commits without delimiter", () => {
    const result = parseCommit("mno345", "Regular commit message");
    expect(result.type).toBeNull();
    expect(result.description).toBe("Regular commit message");
  });

  test("handles custom delimiter", () => {
    const result = parseCommit("pqr678", "(feat) New feature", "(");
    expect(result.type).toBe("feature");
    expect(result.description).toBe("New feature");
  });

  test("is case-insensitive for type keyword", () => {
    const result = parseCommit("stu901", "[FEAT] Uppercase type");
    expect(result.type).toBe("feature");
  });

  test("handles missing close delimiter", () => {
    const result = parseCommit("vwx234", "[feat No closing bracket");
    expect(result.type).toBeNull();
  });
});

describe("groupCommits", () => {
  test("groups commits by type", () => {
    const commits = [
      { hash: "a", message: "", type: "feature" as const, description: "F1" },
      { hash: "b", message: "", type: "bugfix" as const, description: "B1" },
      { hash: "c", message: "", type: "test" as const, description: "T1" },
      { hash: "d", message: "", type: "feature" as const, description: "F2" },
      { hash: "e", message: "", type: null, description: "Ignored" },
    ];
    const groups = groupCommits(commits);
    expect(groups.features).toHaveLength(2);
    expect(groups.bugfixes).toHaveLength(1);
    expect(groups.tests).toHaveLength(1);
  });

  test("handles empty commit list", () => {
    const groups = groupCommits([]);
    expect(groups.features).toHaveLength(0);
    expect(groups.bugfixes).toHaveLength(0);
    expect(groups.tests).toHaveLength(0);
  });
});
