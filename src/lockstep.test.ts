import { test, expect, describe } from "bun:test";
import { findLockstepViolations, describeLockstepViolations } from "./lockstep.ts";

const opts = (over: Partial<Parameters<typeof findLockstepViolations>[0]> = {}) => ({
  scope: "all" as const,
  skipUnchanged: false,
  perPackageTags: false,
  ...over,
});

describe("findLockstepViolations", () => {
  test("a compatible configuration has none", () => {
    expect(findLockstepViolations(opts())).toEqual([]);
  });

  test('scope "changed" leaves untouched packages behind', () => {
    const found = findLockstepViolations(opts({ scope: "changed" }));
    expect(found).toHaveLength(1);
    expect(found[0]!.option).toContain("--changed");
  });

  test("--skip-unchanged leaves quiet packages behind", () => {
    const found = findLockstepViolations(opts({ skipUnchanged: true }));
    expect(found.map((v) => v.option)).toEqual(["--skip-unchanged"]);
  });

  test("--per-package-tags is independent versions by definition", () => {
    const found = findLockstepViolations(opts({ perPackageTags: true }));
    expect(found.map((v) => v.option)).toEqual(["--per-package-tags"]);
  });

  test("reports every conflict at once rather than one per run", () => {
    const found = findLockstepViolations(
      opts({ scope: "changed", skipUnchanged: true, perPackageTags: true }),
    );
    expect(found).toHaveLength(3);
  });
});

describe("describeLockstepViolations", () => {
  test("names each option and why it breaks the line", () => {
    const text = describeLockstepViolations(
      findLockstepViolations(opts({ scope: "changed" })),
    );
    expect(text).toContain("lockstep is set");
    expect(text).toContain("--changed");
    expect(text).toContain("keep their old version");
    expect(text).toContain("turn lockstep off");
  });
});
