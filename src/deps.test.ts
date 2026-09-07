import { test, expect, describe } from "bun:test";
import { getUpdatedDependencies } from "./deps.ts";

describe("getUpdatedDependencies", () => {
  test("reports a dependency whose range moved", () => {
    expect(
      getUpdatedDependencies(
        { dependencies: { a: "^1.0.0", b: "^2.0.0" } },
        { dependencies: { a: "^1.1.0", b: "^2.0.0" } },
      ),
    ).toEqual([{ name: "a", newVersion: "^1.1.0" }]);
  });

  test("covers devDependencies too", () => {
    expect(
      getUpdatedDependencies(
        { devDependencies: { t: "^5.0.0" } },
        { devDependencies: { t: "^7.0.0" } },
      ),
    ).toEqual([{ name: "t", newVersion: "^7.0.0" }]);
  });

  test("a newly added dependency is not an update", () => {
    expect(getUpdatedDependencies({ dependencies: {} }, { dependencies: { a: "^1.0.0" } })).toEqual(
      [],
    );
  });

  test("no manifest at the last tag means nothing to compare", () => {
    expect(getUpdatedDependencies(null, { dependencies: { a: "^1.0.0" } })).toEqual([]);
  });

  test("missing sections on either side are treated as empty", () => {
    expect(getUpdatedDependencies({}, {})).toEqual([]);
  });
});
