import { test, expect, describe } from "bun:test";
import { selectVersionablePackages } from "./workspace.ts";
import type { PackageInfo } from "./types.ts";

const pkg = (name: string, isPrivate: boolean): PackageInfo => ({
  name,
  path: `/repo/packages/${name}`,
  packageJsonPath: `/repo/packages/${name}/package.json`,
  version: "0.4.8",
  private: isPrivate,
  dependencies: {},
  devDependencies: {},
});

const names = (list: PackageInfo[]): string[] => list.map((p) => p.name);

describe("selectVersionablePackages", () => {
  test("drops private packages when a publishable one remains", () => {
    // libs: @workglow/aws and @workglow/cloudflare are private among 40 published.
    const result = selectVersionablePackages(
      [pkg("published", false), pkg("aws", true), pkg("cloudflare", true)],
      false,
    );
    expect(names(result.versionable)).toEqual(["published"]);
    expect(names(result.skipped)).toEqual(["aws", "cloudflare"]);
  });

  test("keeps them when every package is private", () => {
    // builder: all five workspace packages are private, and versioning them
    // is the entire purpose of the release.
    const all = [pkg("api", true), pkg("app", true), pkg("electron", true)];
    const result = selectVersionablePackages(all, false);
    expect(names(result.versionable)).toEqual(["api", "app", "electron"]);
    expect(result.skipped).toEqual([]);
  });

  test("keeps a lone private package", () => {
    const result = selectVersionablePackages([pkg("solo", true)], false);
    expect(names(result.versionable)).toEqual(["solo"]);
    expect(result.skipped).toEqual([]);
  });

  test("includePrivate keeps everything and skips nothing", () => {
    const result = selectVersionablePackages([pkg("a", false), pkg("b", true)], true);
    expect(names(result.versionable)).toEqual(["a", "b"]);
    expect(result.skipped).toEqual([]);
  });

  test("no private packages is a passthrough", () => {
    const result = selectVersionablePackages([pkg("a", false), pkg("b", false)], false);
    expect(names(result.versionable)).toEqual(["a", "b"]);
    expect(result.skipped).toEqual([]);
  });

  test("an empty list stays empty", () => {
    expect(selectVersionablePackages([], false).versionable).toEqual([]);
  });

  test("a --changed subset of only private packages is still not a private workspace", () => {
    // The scoped set is all-private, but the workspace has a published package,
    // so the fallback must not fire and start versioning the private ones.
    const workspace = [pkg("published", false), pkg("aws", true), pkg("cf", true)];
    const changed = [pkg("aws", true), pkg("cf", true)];
    const result = selectVersionablePackages(changed, false, workspace);
    expect(result.versionable).toEqual([]);
    expect(names(result.skipped)).toEqual(["aws", "cf"]);
  });

  test("an all-private workspace still keeps a private --changed subset", () => {
    const workspace = [pkg("api", true), pkg("app", true)];
    const result = selectVersionablePackages([pkg("api", true)], false, workspace);
    expect(names(result.versionable)).toEqual(["api"]);
    expect(result.skipped).toEqual([]);
  });
});
