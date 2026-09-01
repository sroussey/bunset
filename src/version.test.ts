import { test, expect, describe } from "bun:test";
import {
  parseSemver,
  bumpVersion,
  findBreakingCommits,
  assertBumpAllowsBreakingChanges,
  BreakingChangeBumpError,
} from "./version.ts";
import { parseCommit } from "./commits.ts";

describe("parseSemver", () => {
  test("parses standard semver", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
  });

  test("strips leading v", () => {
    expect(parseSemver("v2.0.1")).toEqual([2, 0, 1]);
  });

  test("handles 0.0.0", () => {
    expect(parseSemver("0.0.0")).toEqual([0, 0, 0]);
  });
});

describe("bumpVersion", () => {
  test("bumps patch", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
  });

  test("bumps minor and resets patch", () => {
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
  });

  test("bumps major and resets minor/patch", () => {
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  test("bumps from 0.0.0", () => {
    expect(bumpVersion("0.0.0", "patch")).toBe("0.0.1");
    expect(bumpVersion("0.0.0", "minor")).toBe("0.1.0");
    expect(bumpVersion("0.0.0", "major")).toBe("1.0.0");
  });

  test("handles v prefix", () => {
    expect(bumpVersion("v1.0.0", "patch")).toBe("1.0.1");
  });
});

describe("assertBumpAllowsBreakingChanges", () => {
  const breaking = parseCommit("a1b2c3d4", "feat!: remove the legacy API");
  const bang = parseCommit("b2c3d4e5", "fix(auth)!: change token format");
  const footer = parseCommit("c3d4e5f6", "feat: rework config", "BREAKING CHANGE: config keys renamed");
  const plain = parseCommit("d4e5f6a7", "feat: add a flag");

  test("throws on patch when a ! commit is present", () => {
    expect(() => assertBumpAllowsBreakingChanges([plain, breaking], "patch")).toThrow(
      BreakingChangeBumpError,
    );
  });

  test("throws on patch for a scoped ! commit", () => {
    expect(() => assertBumpAllowsBreakingChanges([bang], "patch")).toThrow(
      BreakingChangeBumpError,
    );
  });

  test("throws on patch for a BREAKING CHANGE footer", () => {
    expect(() => assertBumpAllowsBreakingChanges([footer], "patch")).toThrow(
      BreakingChangeBumpError,
    );
  });

  test("names the offending commits and the way out", () => {
    let error: BreakingChangeBumpError | null = null;
    try {
      assertBumpAllowsBreakingChanges([plain, breaking, bang], "patch");
    } catch (err) {
      error = err as BreakingChangeBumpError;
    }
    expect(error).toBeInstanceOf(BreakingChangeBumpError);
    expect(error!.commits).toEqual([breaking, bang]);
    expect(error!.bump).toBe("patch");
    expect(error!.message).toContain("a1b2c3d");
    expect(error!.message).toContain("feat!: remove the legacy API");
    expect(error!.message).toContain("--minor or --major");
  });

  test("allows patch when nothing is breaking", () => {
    expect(() => assertBumpAllowsBreakingChanges([plain], "patch")).not.toThrow();
  });

  test("allows patch with no commits at all", () => {
    expect(() => assertBumpAllowsBreakingChanges([], "patch")).not.toThrow();
  });

  test("allows minor and major with breaking commits", () => {
    expect(() => assertBumpAllowsBreakingChanges([breaking], "minor")).not.toThrow();
    expect(() => assertBumpAllowsBreakingChanges([breaking], "major")).not.toThrow();
  });
});

describe("findBreakingCommits", () => {
  test("returns only the breaking commits, in order", () => {
    const commits = [
      parseCommit("1111111", "feat: add a flag"),
      parseCommit("2222222", "feat!: drop the old API"),
      parseCommit("3333333", "chore: tidy up"),
      parseCommit("4444444", "[fix!] rename an option"),
    ];
    expect(findBreakingCommits(commits).map((c) => c.hash)).toEqual(["2222222", "4444444"]);
  });

  test("returns an empty list when nothing is breaking", () => {
    expect(findBreakingCommits([parseCommit("1111111", "feat: add a flag")])).toEqual([]);
  });
});
