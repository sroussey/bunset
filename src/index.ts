#!/usr/bin/env bun

import { $ } from "bun";
import { join } from "node:path";
import { resolveOptions } from "./cli.ts";
import { loadConfig } from "./config.ts";
import {
  parseCommit,
  groupCommits,
  filterCommitsForPackage,
  COMMIT_TYPES,
} from "./commits.ts";
import { buildChangelogEntry, buildReleaseNotes, writeChangelog } from "./changelog.ts";
import {
  getLastTag,
  getCommitsSince,
  getCommitFiles,
  readPackageJsonAtRef,
  commitAndTag,
  gitPush,
  createGithubRelease,
} from "./git.ts";
import { getUpdatedDependencies } from "./deps.ts";
import {
  isWorkspace,
  getAllPackages,
  getChangedPackages,
  selectVersionablePackages,
} from "./workspace.ts";
import {
  bumpVersion,
  parseSemver,
  updatePackageVersion,
  setPackageVersion,
  assertBumpAllowsBreakingChanges,
  assertReleaseCarriesBreakingChanges,
  escapesCaretRange,
  findBreakingCommits,
  breakingBumpSlot,
  deriveBump,
  maxBump,
  BreakingChangeBumpError,
} from "./version.ts";
import { diffManifestSurface, describeSurfaceChanges } from "./surface.ts";
import { findLockstepViolations, describeLockstepViolations } from "./lockstep.ts";
import type {
  BumpType,
  GroupedCommits,
  PackageInfo,
  ParsedCommit,
  SurfaceChange,
} from "./types.ts";

const cwd = process.cwd();

const isWs = await isWorkspace(cwd);
const config = await loadConfig(cwd);
const options = await resolveOptions(isWs, config);

const dbg = options.debug;
function debug(msg: string): void {
  if (dbg) console.log(`[debug] ${msg}`);
}

if (dbg) {
  console.log("--- Debug Mode (dry-run implied) ---\n");
  debug(`cwd: ${cwd}`);
  debug(`workspace: ${isWs}`);
  debug(`config loaded: ${JSON.stringify(config)}`);
  debug(`resolved options: ${JSON.stringify(options)}`);
  console.log("");
}

const allPackages = await getAllPackages(cwd);
const lastTag = await getLastTag(cwd);
const rawCommits = await getCommitsSince(cwd, lastTag);

// Resolve tagPrefix: explicit value wins, otherwise infer from last tag
let tagPrefix: string;
if (options.tagPrefix !== null) {
  tagPrefix = options.tagPrefix;
  debug(`tag prefix explicit: "${tagPrefix}"`);
} else if (lastTag) {
  const semverMatch = lastTag.match(/\d+\.\d+\.\d+/);
  tagPrefix = semverMatch ? lastTag.slice(0, semverMatch.index) : "v";
  debug(`tag prefix auto-detected: "${tagPrefix}" (from tag: ${lastTag})`);
} else {
  tagPrefix = "v";
  debug(`tag prefix default: "${tagPrefix}" (no previous tags found)`);
}

debug(`last tag: ${lastTag ?? "(none)"}`);
debug(`raw commits since tag: ${rawCommits.length}`);

if (rawCommits.length === 0) {
  console.error("No commits found since last tag. Nothing to do.");
  process.exit(1);
}

if (options.lockstep) {
  const violations = findLockstepViolations(options);
  if (violations.length > 0) {
    console.error(describeLockstepViolations(violations));
    process.exit(1);
  }
}

if (options.release && !options.push) {
  console.error("--release requires --push (the tag must be on the remote).");
  process.exit(1);
}

if (options.release && !options.tag) {
  console.error("--release requires tagging to be enabled.");
  process.exit(1);
}

if (options.release && !options.commit) {
  console.error("--release requires --commit (tag/push/release run inside the commit step).");
  process.exit(1);
}

const parsed = rawCommits.map((c) => parseCommit(c.hash, c.message, c.body));

if (dbg) {
  console.log("");
  debug("--- Parsed commits ---");
  for (const c of parsed) {
    const typeStr = c.type ?? "UNRECOGNIZED";
    const scopeStr = c.commitScope ? `(${c.commitScope})` : "";
    const included = c.type && options.sections.includes(c.type) ? "INCLUDED" : "EXCLUDED";
    debug(`  ${c.hash.slice(0, 7)} ${typeStr}${scopeStr}: ${c.description} → ${included} (section: ${c.type ?? "none"})`);
  }
  console.log("");
}

// In a monorepo with filtering, fetch the file list for each commit
const shouldFilter = isWs && options.filterByPackage;
debug(`per-package filtering: ${shouldFilter ? "enabled" : "disabled"}`);
if (shouldFilter) {
  await Promise.all(
    parsed.map(async (commit) => {
      commit.files = await getCommitFiles(cwd, commit.hash);
    }),
  );
  if (dbg) {
    for (const c of parsed) {
      debug(`  ${c.hash.slice(0, 7)} files: ${c.files.length > 0 ? c.files.join(", ") : "(none)"}`);
    }
    console.log("");
  }
}

let packages =
  options.scope === "changed"
    ? await getChangedPackages(cwd, allPackages, lastTag)
    : allPackages;

// Lockstep means every package in the workspace shares one version, so a
// private package cannot be left out of the line without contradicting it.
const includePrivate = options.includePrivate || options.lockstep;
if (options.lockstep && !options.includePrivate && packages.some((p) => p.private)) {
  console.log("lockstep: versioning private packages too, so none falls out of the shared version.");
}
const selected = selectVersionablePackages(packages, includePrivate, allPackages);
for (const pkg of selected.skipped) {
  console.log(`${pkg.name}: "private": true, skipping (--include-private to version it).`);
}
packages = selected.versionable;

debug(`scope: ${options.scope}, packages to process: ${packages.map((p) => p.name).join(", ") || "(none)"}`);

if (packages.length === 0) {
  console.error("No changed packages found. Nothing to do.");
  process.exit(1);
}

interface PackagePlan {
  pkg: PackageInfo;
  commits: ParsedCommit[];
  groups: GroupedCommits;
  surfaceChanges: SurfaceChange[];
  manifest: Record<string, unknown>;
  /** Both filled in once the shared-tag decision is known. */
  bump: BumpType;
  newVersion: string;
}

const globalGroups = shouldFilter ? null : groupCommits(parsed);

function commitsForPackage(pkg: PackageInfo): ParsedCommit[] {
  return shouldFilter ? filterCommitsForPackage(parsed, pkg.path, cwd) : parsed;
}

function groupsForPackage(commits: ParsedCommit[]): GroupedCommits {
  return globalGroups ?? groupCommits(commits);
}

/**
 * Whether anything landed in this package at all. Deliberately not filtered by
 * `--sections`: that narrows what the changelog renders, and a package that
 * gained a feature has still changed even when the entry will not show it.
 */
function packageHasChanges(groups: GroupedCommits): boolean {
  return COMMIT_TYPES.some((type) => groups[type].length > 0);
}

/**
 * What `--auto` derives for a package: the bump its commits call for, raised to
 * the break slot when the manifest itself shows a break no commit declared.
 * Under an explicit bump the same evidence is a refusal instead — the user
 * asserted a number, and silently overriding it would be the failure this
 * check exists to catch.
 */
function evidenceBump(plan: PackagePlan, version: string): BumpType {
  const fromCommits = deriveBump(releaseCommits(plan), version);
  if (plan.surfaceChanges.length === 0) return fromCommits;
  return maxBump(fromCommits, breakingBumpSlot(version));
}

// A package with nothing in it is skipped whenever the release can express
// that: always under per-package tags, and under shared tags on request.
const skipUnchanged = options.perPackageTags || options.skipUnchanged;

// Each package's manifest at the last tag, fetched once and read by both the
// surface diff and the changelog's dependency section, in parallel rather than
// one `git show` spawn after another.
const manifestsAtLastTag = new Map<string, Record<string, unknown>>();
await Promise.all(
  packages.map(async (pkg) => {
    const old = await readPackageJsonAtRef(cwd, pkg.packageJsonPath, lastTag);
    if (old) manifestsAtLastTag.set(pkg.packageJsonPath, old);
  }),
);

const plans: PackagePlan[] = [];
const claimedHashes = new Set<string>();
for (const pkg of packages) {
  const commits = commitsForPackage(pkg);
  for (const c of commits) claimedHashes.add(c.hash);
  const groups = groupsForPackage(commits);
  const hasChanges = packageHasChanges(groups);

  if (dbg) {
    debug(`--- Package: ${pkg.name} ---`);
    debug(`  path: ${pkg.path}`);
    debug(`  current version: ${pkg.version ?? "0.0.0"}`);
    for (const section of options.sections) {
      const sectionCommits = groups[section];
      if (sectionCommits.length > 0) {
        debug(`  ${section}: ${sectionCommits.length} commit(s)`);
        for (const c of sectionCommits) {
          debug(`    - ${c.hash.slice(0, 7)} ${c.description}${c.commitScope ? ` (scope: ${c.commitScope})` : ""}`);
        }
      } else {
        debug(`  ${section}: 0 commits`);
      }
    }
    debug(`  has matching commits: ${hasChanges}`);
  }

  if (!hasChanges && skipUnchanged) {
    console.log(`${pkg.name}: no matching commits, skipping.`);
    continue;
  }

  const oldPkg = manifestsAtLastTag.get(pkg.packageJsonPath) ?? null;
  const manifest = (await Bun.file(pkg.packageJsonPath).json()) as Record<string, unknown>;
  let surfaceChanges: SurfaceChange[] = [];
  if (options.surfaceCheck && oldPkg) {
    surfaceChanges = diffManifestSurface(oldPkg, manifest);
    if (dbg && surfaceChanges.length > 0) {
      debug(`  manifest surface changes: ${surfaceChanges.length}`);
      for (const c of surfaceChanges) debug(`    - [${c.kind}] ${c.detail}`);
    }
  }

  plans.push({ pkg, commits, groups, surfaceChanges, manifest, bump: "patch", newVersion: "" });
}

if (plans.length === 0) {
  console.error("No packages with matching commits. Nothing to do.");
  process.exit(1);
}

/**
 * Breaking commits that touched no package directory — a root tsconfig, a CI
 * workflow, the workspace manifest. Per-package filtering drops them from every
 * package's list, so without this they would be gated by nothing and ship as a
 * patch. A repo-wide break belongs to every package being released.
 */
const unclaimedBreaking = findBreakingCommits(parsed).filter((c) => !claimedHashes.has(c.hash));
if (unclaimedBreaking.length > 0) {
  debug(`breaking commits outside every package: ${unclaimedBreaking.length}`);
}

/** A package's own commits plus any repo-wide break. */
function releaseCommits(plan: PackagePlan): ParsedCommit[] {
  return unclaimedBreaking.length === 0 ? plan.commits : [...plan.commits, ...unclaimedBreaking];
}

// When scope is "all" in a workspace, also update the workspace root's package.json
const rootPackageJsonPath = join(cwd, "package.json");
const updateRoot =
  isWs &&
  options.scope === "all" &&
  !packages.some((p) => p.packageJsonPath === rootPackageJsonPath);
const rootCurrentVersion = updateRoot
  ? ((await Bun.file(rootPackageJsonPath).json()).version ?? "0.0.0")
  : null;
debug(`update root package.json: ${updateRoot}${updateRoot ? ` (current: ${rootCurrentVersion})` : ""}`);

// When using shared tags, sync all packages (and root, if updating) to the same target version
let targetVersion: string | null = null;
let sharedBump: BumpType | null = null;
if (!options.perPackageTags && (plans.length > 1 || updateRoot)) {
  const candidateVersions = plans.map((p) => p.pkg.version ?? "0.0.0");
  if (updateRoot && rootCurrentVersion) candidateVersions.push(rootCurrentVersion);
  const maxVersion = candidateVersions.reduce((max, v) => {
    const [mj1, mn1, p1] = parseSemver(max);
    const [mj2, mn2, p2] = parseSemver(v);
    if (mj2 > mj1) return v;
    if (mj2 === mj1 && mn2 > mn1) return v;
    if (mj2 === mj1 && mn2 === mn1 && p2 > p1) return v;
    return max;
  }, "0.0.0");
  // One version line, so one bump: the strongest any released package calls for.
  sharedBump =
    options.bump === "auto"
      ? plans
          .map((p) => evidenceBump(p, maxVersion))
          .reduce((a, b) => maxBump(a, b), "patch" as BumpType)
      : options.bump;
  targetVersion = bumpVersion(maxVersion, sharedBump);
  debug(`shared tag mode: max version = ${maxVersion}, bump = ${sharedBump}, target version = ${targetVersion}`);
}

for (const plan of plans) {
  plan.bump =
    sharedBump ??
    (options.bump === "auto"
      ? evidenceBump(plan, plan.pkg.version ?? "0.0.0")
      : options.bump);
  plan.newVersion = targetVersion ?? bumpVersion(plan.pkg.version ?? "0.0.0", plan.bump);
  if (options.bump === "auto") {
    debug(`${plan.pkg.name}: derived bump = ${plan.bump}`);
    // Under an explicit bump these findings are a refusal that names them. Under
    // --auto they raise the bump instead, so say so rather than leaving the
    // larger version number unexplained.
    if (plan.surfaceChanges.length > 0) {
      console.log(
        `${describeSurfaceChanges(plan.pkg.name, plan.surfaceChanges)}\n` +
          `  counted as breaking, so the bump is at least the break slot.`,
      );
    }
  }
}

const rootBump = plans.map((p) => p.bump).reduce((a, b) => maxBump(a, b), "patch" as BumpType);

// A declared break must land in a slot a consumer's range does not admit.
const bumpFailures: string[] = [];
for (const plan of plans) {
  try {
    assertReleaseCarriesBreakingChanges(
      releaseCommits(plan),
      plan.pkg.version ?? "0.0.0",
      plan.newVersion,
    );
  } catch (err) {
    if (!(err instanceof BreakingChangeBumpError)) throw err;
    bumpFailures.push(`${plan.pkg.name}: ${err.message}`);
  }
}
if (bumpFailures.length > 0) {
  console.error(bumpFailures.join("\n\n"));
  process.exit(1);
}

// An undeclared break: the manifest lost something a consumer resolves against,
// and no commit said so. This is what a `!` marker would have caught if written.
const surfaceFailures: string[] = [];
for (const plan of plans) {
  if (plan.surfaceChanges.length === 0) continue;
  const oldVersion = plan.pkg.version ?? "0.0.0";
  if (escapesCaretRange(oldVersion, plan.newVersion)) continue;
  surfaceFailures.push(
    `${describeSurfaceChanges(plan.pkg.name, plan.surfaceChanges)}\n` +
      `  (${oldVersion} \u2192 ${plan.newVersion} stays inside a "^${oldVersion}" range)`,
  );
}
if (surfaceFailures.length > 0) {
  console.error(
    `Incompatible manifest changes found since ${lastTag}:\n\n${surfaceFailures.join("\n\n")}\n\n` +
      `No commit declared these. Mark the commit breaking (feat!: / BREAKING CHANGE:),\n` +
      `raise the bump, run --auto to derive it, or pass --no-surface-check if they\n` +
      `are not breaks.`,
  );
  process.exit(1);
}

if (dbg) {
  for (const c of findBreakingCommits(parsed)) {
    debug(`breaking: ${c.hash.slice(0, 7)} ${c.message}`);
  }
}

if (options.dryRun) {
  if (!dbg) console.log("--- Dry Run ---\n");

  const tags: string[] = [];
  const filesToCommit: string[] = [];
  const tagEntries = new Map<string, { pkgName: string; entry: string }[]>();
  let anyPackageUpdated = false;

  for (const plan of plans) {
    const { pkg, groups } = plan;
    const oldVersion = pkg.version ?? "0.0.0";
    const newVersion = plan.newVersion;
    console.log(`${pkg.name}: ${oldVersion} → ${newVersion} (${plan.bump})`);
    filesToCommit.push(pkg.packageJsonPath, `${pkg.path}/CHANGELOG.md`);
    anyPackageUpdated = true;

    const updatedDeps = getUpdatedDependencies(
      manifestsAtLastTag.get(pkg.packageJsonPath) ?? null,
      plan.manifest,
    );
    const entry = buildChangelogEntry(
      newVersion,
      groups,
      updatedDeps,
      options.sections,
    );

    console.log(`\nChangelog entry for ${pkg.name}:`);
    console.log(entry);

    if (options.tag) {
      const tag = options.perPackageTags
        ? `${pkg.name}@${newVersion}`
        : `${tagPrefix}${newVersion}`;
      tags.push(tag);
      const list = tagEntries.get(tag) ?? [];
      list.push({ pkgName: pkg.name, entry });
      tagEntries.set(tag, list);
    }
  }

  if (updateRoot && rootCurrentVersion && anyPackageUpdated) {
    const newRootVersion = targetVersion ?? bumpVersion(rootCurrentVersion, rootBump);
    console.log(`(workspace root): ${rootCurrentVersion} → ${newRootVersion}`);
    filesToCommit.push(rootPackageJsonPath);
  }

  const uniqueTags = [...new Set(tags)];

  filesToCommit.push(`${cwd}/bun.lock`);

  if (options.commit) {
    const releaseVersion = targetVersion ?? plans[0]!.newVersion;
    const msg =
      plans.length === 1
        ? `chore: release ${plans[0]!.pkg.name}@${releaseVersion}`
        : `chore: release ${releaseVersion} for ${plans.length} packages`;

    const notes = buildReleaseNotes([...tagEntries.values()].flat());
    console.log(`Would commit: ${msg}\n\n${notes}`);
  } else {
    console.log("Will not commit (--commit not set).");
  }

  if (uniqueTags.length > 0) {
    console.log(`Would tag: ${uniqueTags.join(", ")}`);
  } else if (!options.tag) {
    console.log("Will not tag (--tag not set).");
  }

  if (options.push) {
    console.log("Would push commit and tags to remote.");
  }

  if (options.release) {
    for (const tag of uniqueTags) {
      const entries = tagEntries.get(tag) ?? [];
      console.log(`\nWould create GitHub release ${tag} with notes:`);
      console.log(buildReleaseNotes(entries));
    }
  }

  console.log(`\nFiles that would be modified (${filesToCommit.length}):`);
  for (const f of filesToCommit) {
    console.log(`  ${f}`);
  }
  process.exit(0);
}

const tags: string[] = [];
const changedFiles: string[] = [];
const tagEntries = new Map<string, { pkgName: string; entry: string }[]>();
let anyPackageUpdated = false;

for (const plan of plans) {
  const { pkg, groups } = plan;

  const { oldVersion, newVersion } = await setPackageVersion(
    pkg.packageJsonPath,
    plan.newVersion,
  );
  changedFiles.push(pkg.packageJsonPath);
  console.log(`${pkg.name}: ${oldVersion} → ${newVersion} (${plan.bump})`);
  anyPackageUpdated = true;

  const updatedDeps = getUpdatedDependencies(
    manifestsAtLastTag.get(pkg.packageJsonPath) ?? null,
    plan.manifest,
  );
  const entry = buildChangelogEntry(
    newVersion,
    groups,
    updatedDeps,
    options.sections,
  );
  await writeChangelog(pkg.path, entry);
  changedFiles.push(`${pkg.path}/CHANGELOG.md`);

  if (options.tag) {
    const tag = options.perPackageTags
      ? `${pkg.name}@${newVersion}`
      : `${tagPrefix}${newVersion}`;
    tags.push(tag);
    const list = tagEntries.get(tag) ?? [];
    list.push({ pkgName: pkg.name, entry });
    tagEntries.set(tag, list);
  }
}

if (updateRoot && anyPackageUpdated) {
  const { oldVersion, newVersion } = targetVersion
    ? await setPackageVersion(rootPackageJsonPath, targetVersion)
    : await updatePackageVersion(rootPackageJsonPath, rootBump);
  changedFiles.push(rootPackageJsonPath);
  console.log(`(workspace root): ${oldVersion} → ${newVersion}`);
}

const uniqueTags = [...new Set(tags)];

if (changedFiles.length === 0) {
  console.error("No packages were updated. Nothing to do.");
  process.exit(1);
}

// Update lockfile after package.json versions changed
await $`bun install --lockfile-only`.cwd(cwd).quiet();
changedFiles.push(`${cwd}/bun.lock`);
debug("updated bun.lock");

if (options.commit) {
  const releaseVersion = (await Bun.file(plans[0]!.pkg.packageJsonPath).json()).version;
  const msg =
    plans.length === 1
      ? `chore: release ${plans[0]!.pkg.name}@${releaseVersion}`
      : `chore: release ${releaseVersion} for ${plans.length} packages`;
  const notes = buildReleaseNotes([...tagEntries.values()].flat());
  await commitAndTag(cwd, msg + "\n\n" + notes, options.tag ? uniqueTags : [], changedFiles);
  console.log(`Committed: ${msg}\n\n${notes}`);
  if (uniqueTags.length > 0) {
    console.log(`Tagged: ${uniqueTags.join(", ")}`);
  }

  if (options.push) {
    await gitPush(cwd, uniqueTags);
    console.log("Pushed to remote.");
  }

  if (options.release) {
    for (const tag of uniqueTags) {
      const entries = tagEntries.get(tag) ?? [];
      const notes = buildReleaseNotes(entries);
      try {
        await createGithubRelease(cwd, tag, notes);
        console.log(`Created GitHub release: ${tag}`);
      } catch (err) {
        console.warn(
          `⚠ Failed to create GitHub release ${tag}: ${(err as Error).message}`,
        );
      }
    }
  }
}

console.log("Done.");
