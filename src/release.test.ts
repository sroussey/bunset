import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "index.ts");

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "bunset-release-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

interface RepoSpec {
  /** Root package.json, minus the version. */
  root: Record<string, unknown>;
  packages?: Record<string, Record<string, unknown>>;
  /** Commits applied after the tag: subject plus the files each one writes. */
  commits: { message: string; files?: Record<string, string> }[];
  tag: string;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`git ${args[0]} failed: ${await new Response(proc.stderr).text()}`);
}

let counter = 0;

async function makeRepo(spec: RepoSpec): Promise<string> {
  const dir = join(root, `repo-${counter++}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify(spec.root, null, 2));
  // Never commit or tag from a test: the assertions only need the plan.
  await writeFile(join(dir, ".bunset.toml"), "commit = false\ntag = false\n");

  for (const [name, manifest] of Object.entries(spec.packages ?? {})) {
    await mkdir(join(dir, "packages", name), { recursive: true });
    await writeFile(
      join(dir, "packages", name, "package.json"),
      JSON.stringify(manifest, null, 2),
    );
  }

  await git(dir, "init", "-q", ".");
  await git(dir, "config", "user.email", "test@example.com");
  await git(dir, "config", "user.name", "test");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", "chore: init");
  await git(dir, "tag", spec.tag);

  for (const commit of spec.commits) {
    for (const [path, contents] of Object.entries(commit.files ?? {})) {
      await mkdir(join(dir, path, ".."), { recursive: true }).catch(() => {});
      await writeFile(join(dir, path), contents);
    }
    await git(dir, "add", "-A");
    await git(dir, "commit", "-qm", commit.message, "--allow-empty");
  }

  return dir;
}

async function run(cwd: string, ...args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["bun", CLI, ...args, "--dry-run"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, out: stdout + stderr };
}

describe("a breaking change that touched no package directory", () => {
  test("is still refused, rather than falling through every package's filter", async () => {
    // Per-package filtering drops a root-level commit from every package's
    // list, so a gate that only reads those lists sees no break at all.
    const dir = await makeRepo({
      root: { name: "root", version: "1.4.0", private: true, workspaces: ["packages/*"] },
      packages: {
        a: { name: "pkg-a", version: "1.4.0" },
        b: { name: "pkg-b", version: "1.4.0" },
      },
      tag: "v1.4.0",
      commits: [
        { message: "feat!: drop root-level config support", files: { "tsconfig.json": "{}" } },
      ],
    });

    const { code, out } = await run(dir, "--patch", "--all");
    expect(code).toBe(1);
    expect(out).toContain("Breaking changes found");
    expect(out).toContain("drop root-level config support");
  }, 20_000);

  test("and raises the bump under --auto instead of shipping a patch", async () => {
    const dir = await makeRepo({
      root: { name: "root", version: "1.4.0", private: true, workspaces: ["packages/*"] },
      packages: { a: { name: "pkg-a", version: "1.4.0" } },
      tag: "v1.4.0",
      commits: [{ message: "feat!: drop root config", files: { "tsconfig.json": "{}" } }],
    });

    const { code, out } = await run(dir, "--auto", "--all");
    expect(code).toBe(0);
    expect(out).toContain("pkg-a: 1.4.0 → 2.0.0");
  }, 20_000);
});

describe("the workspace root's own version", () => {
  test("takes the strongest bump of the release, not whichever package sorted first", async () => {
    // Package order comes from a glob, so reading plans[0] made the root's
    // number depend on directory naming.
    const dir = await makeRepo({
      root: { name: "root", version: "1.4.0", private: true, workspaces: ["packages/*"] },
      packages: {
        api: { name: "z-api", version: "1.4.0" },
        app: { name: "a-app", version: "1.4.0" },
      },
      tag: "v1.4.0",
      commits: [
        { message: "chore: tidy api", files: { "packages/api/f.js": "x" } },
        { message: "feat!: break the app", files: { "packages/app/g.js": "y" } },
      ],
    });

    const { code, out } = await run(dir, "--auto", "--per-package-tags", "--all");
    expect(code).toBe(0);
    expect(out).toContain("a-app: 1.4.0 → 2.0.0");
    expect(out).toContain("z-api: 1.4.0 → 1.4.1");
    expect(out).toContain("(workspace root): 1.4.0 → 2.0.0");
  }, 20_000);

  test("is not bumped when the root package itself was skipped", async () => {
    // A workspace whose glob includes the root: skipping it as unchanged and
    // then versioning it through the root path contradicts what was printed.
    const dir = await makeRepo({
      root: { name: "root-pkg", version: "1.4.0", workspaces: [".", "packages/*"] },
      packages: { a: { name: "pkg-a", version: "1.4.0" } },
      tag: "v1.4.0",
      commits: [{ message: "feat: only pkg-a", files: { "packages/a/f.js": "x" } }],
    });

    const { code, out } = await run(dir, "--auto", "--all", "--skip-unchanged");
    expect(code).toBe(0);
    expect(out).toContain("root-pkg: no matching commits, skipping.");
    expect(out).not.toContain("(workspace root)");
  }, 20_000);
});

describe("private packages under --changed", () => {
  test("stay skipped when the release happens to touch only them", async () => {
    const dir = await makeRepo({
      root: { name: "root", version: "1.4.0", private: true, workspaces: ["packages/*"] },
      packages: {
        pub: { name: "pub", version: "1.4.0" },
        aws: { name: "aws", version: "1.4.0", private: true },
      },
      tag: "v1.4.0",
      commits: [{ message: "fix: only the private one", files: { "packages/aws/f.js": "x" } }],
    });

    const { code, out } = await run(dir, "--patch", "--changed");
    expect(out).toContain('aws: "private": true, skipping');
    expect(out).not.toContain("aws: 1.4.0 →");
    expect(code).toBe(1);
  }, 20_000);
});

describe("a shared version line spanning different majors", () => {
  test("does not refuse a break the landing version plainly carries", async () => {
    // pkg-b at 0.5.0 is set to 2.0.1 by a release that calls itself a patch;
    // that jump leaves every ^0.5.0 range, so there is nothing to refuse.
    const dir = await makeRepo({
      root: { name: "root", version: "2.0.0", private: true, workspaces: ["packages/*"] },
      packages: {
        a: { name: "pkg-a", version: "2.0.0" },
        b: { name: "pkg-b", version: "0.5.0" },
      },
      tag: "v2.0.0",
      commits: [{ message: "feat!: break pkg-b", files: { "packages/b/f.js": "x" } }],
    });

    const { code, out } = await run(dir, "--patch", "--all");
    expect(code).toBe(0);
    expect(out).toContain("pkg-b: 0.5.0 → 2.0.1");
  }, 20_000);
});
