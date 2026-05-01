import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { buildChangelogEntry, buildReleaseNotes, writeChangelog } from "./changelog.ts";
import { COMMIT_TYPES } from "./commits.ts";
import type { GroupedCommits } from "./types.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function emptyGroups(): GroupedCommits {
  return {
    feature: [],
    bugfix: [],
    refactor: [],
    perf: [],
    style: [],
    test: [],
    docs: [],
    build: [],
    ops: [],
    chore: [],
    ci: [],
  };
}

describe("buildChangelogEntry", () => {
  test("builds entry with specified sections", () => {
    const groups: GroupedCommits = {
      ...emptyGroups(),
      feature: [
        { hash: "a", message: "", type: "feature", commitScope: null, breaking: false, files: [], description: "Add login" },
      ],
      bugfix: [
        { hash: "b", message: "", type: "bugfix", commitScope: null, breaking: false, files: [], description: "Fix crash" },
      ],
      test: [
        { hash: "c", message: "", type: "test", commitScope: null, breaking: false, files: [], description: "Add tests" },
      ],
    };
    const entry = buildChangelogEntry("1.2.0", groups, [], COMMIT_TYPES);
    expect(entry).toContain("## 1.2.0");
    expect(entry).toContain("### Features");
    expect(entry).toContain("- Add login");
    expect(entry).toContain("### Bug Fixes");
    expect(entry).toContain("- Fix crash");
    expect(entry).toContain("### Tests");
    expect(entry).toContain("- Add tests");
  });

  test("only includes configured sections", () => {
    const groups: GroupedCommits = {
      ...emptyGroups(),
      feature: [
        { hash: "a", message: "", type: "feature", commitScope: null, breaking: false, files: [], description: "New thing" },
      ],
      test: [
        { hash: "b", message: "", type: "test", commitScope: null, breaking: false, files: [], description: "Add tests" },
      ],
    };
    const entry = buildChangelogEntry("1.0.0", groups, [], ["feature", "bugfix", "perf"]);
    expect(entry).toContain("### Features");
    expect(entry).not.toContain("### Tests");
  });

  test("omits empty sections", () => {
    const groups: GroupedCommits = {
      ...emptyGroups(),
      feature: [
        { hash: "a", message: "", type: "feature", commitScope: null, breaking: false, files: [], description: "New thing" },
      ],
    };
    const entry = buildChangelogEntry("1.0.0", groups);
    expect(entry).toContain("### Features");
    expect(entry).not.toContain("### Bug Fixes");
    expect(entry).not.toContain("### Performance");
  });

  test("groups scoped commits under sub-headings", () => {
    const groups: GroupedCommits = {
      ...emptyGroups(),
      feature: [
        { hash: "a", message: "", type: "feature", commitScope: null, breaking: false, files: [], description: "Global feature" },
        { hash: "b", message: "", type: "feature", commitScope: "auth", breaking: false, files: [], description: "Add login" },
        { hash: "c", message: "", type: "feature", commitScope: "auth", breaking: false, files: [], description: "Add logout" },
        { hash: "d", message: "", type: "feature", commitScope: "ui", breaking: false, files: [], description: "New dashboard" },
      ],
    };
    const entry = buildChangelogEntry("1.0.0", groups);
    expect(entry).toContain("### Features");
    expect(entry).toContain("- Global feature");
    expect(entry).toContain("#### auth");
    expect(entry).toContain("- Add login");
    expect(entry).toContain("- Add logout");
    expect(entry).toContain("#### ui");
    expect(entry).toContain("- New dashboard");

    // Unscoped comes before scoped
    const globalIdx = entry.indexOf("- Global feature");
    const authIdx = entry.indexOf("#### auth");
    expect(globalIdx).toBeLessThan(authIdx);
  });

  test("renders only scoped commits when no unscoped", () => {
    const groups: GroupedCommits = {
      ...emptyGroups(),
      bugfix: [
        { hash: "a", message: "", type: "bugfix", commitScope: "parser", breaking: false, files: [], description: "Fix edge case" },
      ],
    };
    const entry = buildChangelogEntry("1.0.0", groups);
    expect(entry).toContain("### Bug Fixes");
    expect(entry).toContain("#### parser");
    expect(entry).toContain("- Fix edge case");
  });

  test("includes updated dependencies", () => {
    const groups = emptyGroups();
    const deps = [{ name: "lodash", newVersion: "4.18.0" }];
    const entry = buildChangelogEntry("2.0.0", groups, deps);
    expect(entry).toContain("### Updated Dependencies");
    expect(entry).toContain("- `lodash`: 4.18.0");
  });

  test("renders Breaking Changes section first when breaking commits exist", () => {
    const groups: GroupedCommits = {
      ...emptyGroups(),
      feature: [
        { hash: "a", message: "", type: "feature", commitScope: null, breaking: true, files: [], description: "Remove old API" },
        { hash: "b", message: "", type: "feature", commitScope: null, breaking: false, files: [], description: "Add new API" },
      ],
      bugfix: [
        { hash: "c", message: "", type: "bugfix", commitScope: "parser", breaking: true, files: [], description: "Change return type" },
      ],
    };
    const entry = buildChangelogEntry("2.0.0", groups, [], ["feature", "bugfix"]);
    expect(entry).toContain("### Breaking Changes");
    expect(entry).toContain("- **features**: Remove old API");
    expect(entry).toContain("- **bug fixes(parser)**: Change return type");

    // Breaking Changes section appears before Features
    const breakingIdx = entry.indexOf("### Breaking Changes");
    const featuresIdx = entry.indexOf("### Features");
    expect(breakingIdx).toBeLessThan(featuresIdx);
  });

  test("breaking section appears even when commit type is not in sections", () => {
    const groups: GroupedCommits = {
      ...emptyGroups(),
      chore: [
        { hash: "a", message: "", type: "chore", commitScope: null, breaking: true, files: [], description: "Drop Node 14 support" },
      ],
      feature: [
        { hash: "b", message: "", type: "feature", commitScope: null, breaking: false, files: [], description: "Add feature" },
      ],
    };
    // sections only includes "feature", not "chore"
    const entry = buildChangelogEntry("3.0.0", groups, [], ["feature"]);
    expect(entry).toContain("### Breaking Changes");
    expect(entry).toContain("- **chores**: Drop Node 14 support");
    // Chore section itself should not appear
    expect(entry).not.toContain("### Chores");
  });

  test("no Breaking Changes section when no breaking commits", () => {
    const groups: GroupedCommits = {
      ...emptyGroups(),
      feature: [
        { hash: "a", message: "", type: "feature", commitScope: null, breaking: false, files: [], description: "Add feature" },
      ],
    };
    const entry = buildChangelogEntry("1.1.0", groups);
    expect(entry).not.toContain("### Breaking Changes");
  });
});

describe("writeChangelog", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "changelog-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("creates new changelog if missing", async () => {
    await writeChangelog(tmpDir, "## 1.0.0\n\n### Features\n\n- Init\n\n");
    const content = await Bun.file(join(tmpDir, "CHANGELOG.md")).text();
    expect(content).toStartWith("# Changelog");
    expect(content).toContain("## 1.0.0");
  });

  test("prepends entry to existing changelog", async () => {
    await Bun.write(
      join(tmpDir, "CHANGELOG.md"),
      "# Changelog\n\n## 0.1.0\n\n- Old entry\n",
    );
    await writeChangelog(tmpDir, "## 1.0.0\n\n### Features\n\n- New\n\n");
    const content = await Bun.file(join(tmpDir, "CHANGELOG.md")).text();
    const idx1 = content.indexOf("## 1.0.0");
    const idx2 = content.indexOf("## 0.1.0");
    expect(idx1).toBeLessThan(idx2);
  });
});

describe("buildReleaseNotes", () => {
  test("returns empty string for no entries", () => {
    expect(buildReleaseNotes([])).toBe("");
  });

  test("strips the version heading from a single entry", () => {
    const entry = "## 1.2.3\n\n### Features\n\n- Add login\n";
    expect(buildReleaseNotes([{ pkgName: "pkg-a", entry }])).toBe(
      "### Features\n\n- Add login\n",
    );
  });

  test("combines multiple entries under per-package headings", () => {
    const result = buildReleaseNotes([
      { pkgName: "pkg-a", entry: "## 1.2.3\n\n### Features\n\n- A\n" },
      { pkgName: "pkg-b", entry: "## 1.2.3\n\n### Bug Fixes\n\n- B\n" },
    ]);
    expect(result).toContain("## pkg-a");
    expect(result).toContain("## pkg-b");
    expect(result).toContain("### Features");
    expect(result).toContain("### Bug Fixes");
    expect(result).not.toMatch(/^## 1\.2\.3/m);
    expect(result.indexOf("## pkg-a")).toBeLessThan(result.indexOf("## pkg-b"));
  });

  test("handles entries without a leading version heading", () => {
    const entry = "### Features\n\n- Plain entry\n";
    expect(buildReleaseNotes([{ pkgName: "pkg-a", entry }])).toBe(entry);
  });
});
