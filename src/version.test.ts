import { test, expect, describe } from "bun:test";
import {
  parseSemver,
  bumpVersion,
  findBreakingCommits,
  assertBumpAllowsBreakingChanges,
  breakingBumpSlot,
  featureBumpSlot,
  escapesCaretRange,
  assertReleaseCarriesBreakingChanges,
  deriveBump,
  maxBump,
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

describe("breakingBumpSlot", () => {
  test("a released line breaks in the major", () => {
    expect(breakingBumpSlot("1.2.3")).toBe("major");
    expect(breakingBumpSlot("12.0.0")).toBe("major");
  });

  test("a 0.x line breaks in the minor", () => {
    expect(breakingBumpSlot("0.4.8")).toBe("minor");
    expect(breakingBumpSlot("0.0.1")).toBe("minor");
  });
});

describe("featureBumpSlot", () => {
  test("a released line takes features in the minor", () => {
    expect(featureBumpSlot("1.2.3")).toBe("minor");
    expect(featureBumpSlot("12.0.0")).toBe("minor");
  });

  test("a 0.x line takes them in the patch, leaving the minor for breaks", () => {
    expect(featureBumpSlot("0.4.8")).toBe("patch");
    expect(featureBumpSlot("0.0.1")).toBe("patch");
  });

  test("the two slots never collide on a released line, and never on 0.x either", () => {
    for (const version of ["0.0.1", "0.4.8", "1.2.3", "9.9.9"]) {
      expect(featureBumpSlot(version)).not.toBe(breakingBumpSlot(version));
    }
  });
});

describe("maxBump", () => {
  test("returns the more severe of the two", () => {
    expect(maxBump("patch", "minor")).toBe("minor");
    expect(maxBump("major", "minor")).toBe("major");
    expect(maxBump("patch", "patch")).toBe("patch");
    expect(maxBump("minor", "major")).toBe("major");
  });
});

describe("assertBumpAllowsBreakingChanges with a current version", () => {
  const breaking = parseCommit("a1b2c3d4", "feat!: remove the legacy API");
  const plain = parseCommit("d4e5f6a7", "feat: add a flag");

  test("a 1.x minor hides the break, so it is refused", () => {
    expect(() => assertBumpAllowsBreakingChanges([breaking], "minor", "1.2.3")).toThrow(
      BreakingChangeBumpError,
    );
  });

  test("a 1.x major carries it", () => {
    expect(() =>
      assertBumpAllowsBreakingChanges([breaking], "major", "1.2.3"),
    ).not.toThrow();
  });

  test("a 0.x minor is the break slot, so it is allowed", () => {
    expect(() =>
      assertBumpAllowsBreakingChanges([breaking], "minor", "0.4.8"),
    ).not.toThrow();
  });

  test("a 0.x patch is still refused", () => {
    expect(() => assertBumpAllowsBreakingChanges([breaking], "patch", "0.4.8")).toThrow(
      BreakingChangeBumpError,
    );
  });

  test("names the slot the line actually needs", () => {
    let message = "";
    try {
      assertBumpAllowsBreakingChanges([breaking], "minor", "1.2.3");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("--major");
    expect(message).not.toContain("--minor or --major");
  });

  test("no breaking commits, no complaint on any line", () => {
    expect(() => assertBumpAllowsBreakingChanges([plain], "patch", "1.2.3")).not.toThrow();
    expect(() => assertBumpAllowsBreakingChanges([plain], "patch", "0.1.0")).not.toThrow();
  });
});

describe("deriveBump", () => {
  const breaking = parseCommit("1111111", "feat!: drop the old API");
  const footer = parseCommit("2222222", "fix: rework config", "BREAKING CHANGE: keys renamed");
  const feature = parseCommit("3333333", "feat: add a flag");
  const fix = parseCommit("4444444", "fix: correct an off-by-one");
  const chore = parseCommit("5555555", "chore: update deps");

  test("a break takes the break slot for the line", () => {
    expect(deriveBump([breaking, fix], "1.2.3")).toBe("major");
    expect(deriveBump([breaking, fix], "0.4.8")).toBe("minor");
  });

  test("a BREAKING CHANGE footer counts as a break", () => {
    expect(deriveBump([footer], "1.2.3")).toBe("major");
  });

  test("a feature takes the minor on a released line", () => {
    expect(deriveBump([feature, fix], "1.2.3")).toBe("minor");
  });

  test("but the patch on a 0.x line, where the minor is the break slot", () => {
    // A feature and a break must not produce the same number: on 0.x the minor
    // is reserved for breaks, so an addition goes in the patch.
    expect(deriveBump([feature, fix], "0.4.8")).toBe("patch");
    expect(deriveBump([feature], "0.0.3")).toBe("patch");
  });

  test("a break still outranks a feature on a 0.x line", () => {
    expect(deriveBump([feature, breaking], "0.4.8")).toBe("minor");
  });

  test("anything else takes the patch", () => {
    expect(deriveBump([fix, chore], "1.2.3")).toBe("patch");
    expect(deriveBump([chore], "0.4.8")).toBe("patch");
  });

  test("no commits is a patch", () => {
    expect(deriveBump([], "1.2.3")).toBe("patch");
  });

  test("the break wins over a feature in the same set", () => {
    expect(deriveBump([feature, breaking], "1.2.3")).toBe("major");
  });
});

describe("escapesCaretRange", () => {
  test("a released line escapes only on the major", () => {
    expect(escapesCaretRange("1.2.3", "1.2.4")).toBe(false);
    expect(escapesCaretRange("1.2.3", "1.9.0")).toBe(false);
    expect(escapesCaretRange("1.2.3", "2.0.0")).toBe(true);
  });

  test("a 0.x line escapes on the minor", () => {
    expect(escapesCaretRange("0.4.8", "0.4.9")).toBe(false);
    expect(escapesCaretRange("0.4.8", "0.5.0")).toBe(true);
    expect(escapesCaretRange("0.4.8", "1.0.0")).toBe(true);
  });

  test("^0.0.z admits nothing but itself", () => {
    expect(escapesCaretRange("0.0.3", "0.0.4")).toBe(true);
    expect(escapesCaretRange("0.0.3", "0.0.3")).toBe(false);
  });

  test("a shared line can carry a package far past its own slot", () => {
    // The case the bump name cannot express: a package at 0.5.0 set to 2.0.1 by
    // a release that calls itself a patch has still left every ^0.5.0 range.
    expect(escapesCaretRange("0.5.0", "2.0.1")).toBe(true);
  });
});

describe("assertReleaseCarriesBreakingChanges", () => {
  const breaking = parseCommit("a1b2c3d4", "feat!: remove the legacy API");
  const plain = parseCommit("d4e5f6a7", "feat: add a flag");

  test("refuses when the landing version stays inside the old caret range", () => {
    expect(() => assertReleaseCarriesBreakingChanges([breaking], "1.4.0", "1.4.1")).toThrow(
      BreakingChangeBumpError,
    );
  });

  test("allows a jump that leaves the range, whatever the bump was called", () => {
    expect(() =>
      assertReleaseCarriesBreakingChanges([breaking], "0.5.0", "2.0.1"),
    ).not.toThrow();
  });

  test("says which versions it compared", () => {
    let message = "";
    try {
      assertReleaseCarriesBreakingChanges([breaking], "1.4.0", "1.4.1");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("1.4.0 → 1.4.1");
    expect(message).toContain("^1.4.0");
  });

  test("nothing breaking, nothing to refuse", () => {
    expect(() => assertReleaseCarriesBreakingChanges([plain], "1.4.0", "1.4.1")).not.toThrow();
  });
});
