import { test, expect, describe } from "bun:test";
import { parseSemver, bumpVersion } from "./version.ts";

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
