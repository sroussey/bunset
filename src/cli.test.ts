import { test, expect, describe } from "bun:test";
import { flag } from "./cli.ts";

describe("flag", () => {
  test("reads the positive spelling", () => {
    expect(flag({ commit: true }, "commit")).toBe(true);
  });

  test("reads the negated spelling", () => {
    expect(flag({ "no-commit": true }, "commit")).toBe(false);
  });

  test("negation wins when both are given", () => {
    expect(flag({ commit: true, "no-commit": true }, "commit")).toBe(false);
  });

  test("null when neither is given, so config can decide", () => {
    expect(flag({}, "commit")).toBeNull();
    expect(flag({ commit: false, "no-commit": false }, "commit")).toBeNull();
  });

  test("handles the hyphenated names", () => {
    expect(flag({ "no-filter-by-package": true }, "filter-by-package")).toBe(false);
    expect(flag({ "no-surface-check": true }, "surface-check")).toBe(false);
  });
});
