import { test, expect, describe } from "bun:test";
import { diffManifestSurface, describeSurfaceChanges, rangeFloor } from "./surface.ts";

const kinds = (old: object, next: object): string[] =>
  diffManifestSurface(old as Record<string, unknown>, next as Record<string, unknown>).map(
    (c) => c.kind,
  );

describe("rangeFloor", () => {
  test("reads the shapes an engines field uses", () => {
    expect(rangeFloor(">=24")).toEqual([24, 0, 0]);
    expect(rangeFloor("^1.4.0")).toEqual([1, 4, 0]);
    expect(rangeFloor("~0.4.8")).toEqual([0, 4, 8]);
    expect(rangeFloor("18.x")).toEqual([18, 0, 0]);
    expect(rangeFloor(">=1.4.0")).toEqual([1, 4, 0]);
  });

  test("returns null for a range with no version in it", () => {
    expect(rangeFloor("*")).toBeNull();
  });
});

describe("engines", () => {
  test("a floor where there was none is a break", () => {
    // @workglow/sqlite 0.4.6: node:sqlite added engines.node to a package
    // that declared none, and shipped as a patch.
    expect(kinds({ name: "p" }, { name: "p", engines: { node: ">=24" } })).toEqual([
      "engines-added",
    ]);
  });

  test("a raised floor is a break", () => {
    expect(
      kinds({ name: "p", engines: { bun: "^1.3" } }, { name: "p", engines: { bun: "^1.4" } }),
    ).toEqual(["engines-raised"]);
  });

  test("a widened floor is not", () => {
    expect(
      kinds(
        { name: "p", engines: { typescript: ">=5.9.3" } },
        { name: "p", engines: { typescript: ">=5.0.0" } },
      ),
    ).toEqual([]);
  });

  test("an unchanged floor is not", () => {
    expect(
      kinds({ name: "p", engines: { node: ">=24" } }, { name: "p", engines: { node: ">=24" } }),
    ).toEqual([]);
  });
});

describe("exports", () => {
  test("dropping one condition from a subpath is a break", () => {
    // @workglow/sqlite 0.4.6 also deleted its "bun" export condition.
    const before = {
      name: "p",
      exports: { "./storage": { bun: "./dist/bun.js", import: "./dist/node.js" } },
    };
    const after = { name: "p", exports: { "./storage": { import: "./dist/node.js" } } };
    const changes = diffManifestSurface(before, after);
    expect(changes.map((c) => c.kind)).toEqual(["condition-removed"]);
    expect(changes[0]!.detail).toContain("bun");
    expect(changes[0]!.detail).toContain("./storage");
  });

  test("dropping a whole subpath is a break", () => {
    const before = { name: "p", exports: { ".": "./a.js", "./ai": "./ai.js" } };
    const after = { name: "p", exports: { ".": "./a.js" } };
    const changes = diffManifestSurface(before, after);
    expect(changes.map((c) => c.kind)).toEqual(["export-removed"]);
    expect(changes[0]!.detail).toContain("./ai");
  });

  test("removing the entry point entirely is one finding, not many", () => {
    // @workglow/sec: exports/main/types all null at HEAD, queued for a patch.
    const before = {
      name: "p",
      exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    };
    const after = { name: "p", exports: null, main: null, types: null, bin: { p: "./dist/p.js" } };
    expect(kinds(before, after)).toEqual(["entry-point-removed"]);
  });

  test("adding a subpath is not a break", () => {
    const before = { name: "p", exports: { ".": "./a.js" } };
    const after = { name: "p", exports: { ".": "./a.js", "./new": "./new.js" } };
    expect(kinds(before, after)).toEqual([]);
  });

  test("adding a condition is not a break", () => {
    const before = { name: "p", exports: { ".": { import: "./a.js" } } };
    const after = { name: "p", exports: { ".": { types: "./a.d.ts", import: "./a.js" } } };
    expect(kinds(before, after)).toEqual([]);
  });

  test("a package with no exports on either side is quiet", () => {
    expect(kinds({ name: "p", main: "./a.js" }, { name: "p", main: "./a.js" })).toEqual([]);
  });
});

describe("bin", () => {
  test("dropping a binary is a break", () => {
    const before = { name: "p", bin: { p: "./p.js", "p-base": "./base.js" } };
    const after = { name: "p", bin: { p: "./p.js" } };
    const changes = diffManifestSurface(before, after);
    expect(changes.map((c) => c.kind)).toEqual(["bin-removed"]);
    expect(changes[0]!.detail).toContain("p-base");
  });

  test("a string bin is named after the package", () => {
    expect(kinds({ name: "p", bin: "./p.js" }, { name: "p" })).toEqual(["bin-removed"]);
  });

  test("adding a binary is not a break", () => {
    expect(kinds({ name: "p", bin: { p: "./p.js" } }, { name: "p", bin: { p: "./p.js", q: "./q.js" } })).toEqual(
      [],
    );
  });
});

describe("private", () => {
  test("going private is a break for anyone installing it", () => {
    expect(kinds({ name: "p" }, { name: "p", private: true })).toEqual(["unpublished"]);
  });

  test("staying private is not a new break", () => {
    expect(kinds({ name: "p", private: true }, { name: "p", private: true })).toEqual([]);
  });

  test("becoming publishable is not a break", () => {
    expect(kinds({ name: "p", private: true }, { name: "p" })).toEqual([]);
  });
});

describe("describeSurfaceChanges", () => {
  test("names the package and lists each detail", () => {
    const changes = diffManifestSurface(
      { name: "@scope/p", engines: { node: ">=22" } },
      { name: "@scope/p", engines: { node: ">=24" }, private: true },
    );
    const text = describeSurfaceChanges("@scope/p", changes);
    expect(text).toContain("@scope/p:");
    expect(text).toContain("engines.node");
    expect(text).toContain("private");
  });
});
