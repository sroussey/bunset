import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { buildChangelogEntry, writeChangelog } from "./changelog.ts";
import type { GroupedCommits } from "./types.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("buildChangelogEntry", () => {
  test("builds entry with all sections", () => {
    const groups: GroupedCommits = {
      features: [
        { hash: "a", message: "", type: "feature", description: "Add login" },
      ],
      bugfixes: [
        { hash: "b", message: "", type: "bugfix", description: "Fix crash" },
      ],
      tests: [
        { hash: "c", message: "", type: "test", description: "Add tests" },
      ],
    };
    const entry = buildChangelogEntry("1.2.0", groups);
    expect(entry).toContain("## 1.2.0");
    expect(entry).toContain("### Features");
    expect(entry).toContain("- Add login");
    expect(entry).toContain("### Bug Fixes");
    expect(entry).toContain("- Fix crash");
    expect(entry).toContain("### Tests");
    expect(entry).toContain("- Add tests");
  });

  test("omits empty sections", () => {
    const groups: GroupedCommits = {
      features: [
        { hash: "a", message: "", type: "feature", description: "New thing" },
      ],
      bugfixes: [],
      tests: [],
    };
    const entry = buildChangelogEntry("1.0.0", groups);
    expect(entry).toContain("### Features");
    expect(entry).not.toContain("### Bug Fixes");
    expect(entry).not.toContain("### Tests");
  });

  test("includes updated dependencies", () => {
    const groups: GroupedCommits = {
      features: [],
      bugfixes: [],
      tests: [],
    };
    const deps = [{ name: "lodash", newVersion: "4.18.0" }];
    const entry = buildChangelogEntry("2.0.0", groups, deps);
    expect(entry).toContain("### Updated Dependencies");
    expect(entry).toContain("- `lodash`: 4.18.0");
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
