#!/usr/bin/env bun

import { $ } from "bun";
import { resolveOptions } from "./cli.ts";
import { loadConfig } from "./config.ts";
import {
  parseCommit,
  groupCommits,
  filterCommitsForPackage,
} from "./commits.ts";
import { buildChangelogEntry, writeChangelog } from "./changelog.ts";
import {
  getLastTag,
  getCommitsSince,
  getCommitFiles,
  commitAndTag,
  gitPush,
} from "./git.ts";
import { getUpdatedDependencies } from "./deps.ts";
import {
  isWorkspace,
  getAllPackages,
  getChangedPackages,
} from "./workspace.ts";
import { bumpVersion, parseSemver, updatePackageVersion, setPackageVersion } from "./version.ts";
import type { ParsedCommit, GroupedCommits } from "./types.ts";

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

// Warn if breaking changes detected with non-major bump
const hasBreaking = parsed.some((c) => c.breaking);
if (hasBreaking && options.bump !== "major") {
  console.log(`\u26a0 Breaking changes detected but bump is "${options.bump}" (not "major").`);
  if (dbg) {
    for (const c of parsed.filter((c) => c.breaking)) {
      debug(`  breaking: ${c.hash.slice(0, 7)} ${c.message}`);
    }
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

const globalGroups = groupCommits(parsed);

let packages =
  options.scope === "changed"
    ? await getChangedPackages(cwd, allPackages, lastTag)
    : allPackages;

debug(`scope: ${options.scope}, packages to process: ${packages.map((p) => p.name).join(", ") || "(none)"}`);

if (packages.length === 0) {
  console.error("No changed packages found. Nothing to do.");
  process.exit(1);
}

function getPackageGroups(
  pkg: (typeof packages)[number],
  allParsed: ParsedCommit[],
): GroupedCommits {
  if (!shouldFilter) return globalGroups;
  const filtered = filterCommitsForPackage(allParsed, pkg.path, cwd);
  return groupCommits(filtered);
}

function packageHasChanges(groups: GroupedCommits): boolean {
  return options.sections.some((type) => groups[type].length > 0);
}

// When using shared tags, sync all packages to the same target version
let targetVersion: string | null = null;
if (!options.perPackageTags && packages.length > 1) {
  const maxVersion = packages.reduce((max, pkg) => {
    const v = pkg.version ?? "0.0.0";
    const [mj1, mn1, p1] = parseSemver(max);
    const [mj2, mn2, p2] = parseSemver(v);
    if (mj2 > mj1) return v;
    if (mj2 === mj1 && mn2 > mn1) return v;
    if (mj2 === mj1 && mn2 === mn1 && p2 > p1) return v;
    return max;
  }, "0.0.0");
  targetVersion = bumpVersion(maxVersion, options.bump);
  debug(`shared tag mode: max version = ${maxVersion}, target version = ${targetVersion}`);
}

if (options.dryRun) {
  if (!dbg) console.log("--- Dry Run ---\n");

  const tags: string[] = [];
  const filesToCommit: string[] = [];

  for (const pkg of packages) {
    const groups = getPackageGroups(pkg, parsed);
    const hasChanges = packageHasChanges(groups);

    if (dbg) {
      debug(`--- Package: ${pkg.name} ---`);
      debug(`  path: ${pkg.path}`);
      debug(`  current version: ${pkg.version ?? "0.0.0"}`);
      for (const section of options.sections) {
        const commits = groups[section];
        if (commits.length > 0) {
          debug(`  ${section}: ${commits.length} commit(s)`);
          for (const c of commits) {
            debug(`    - ${c.hash.slice(0, 7)} ${c.description}${c.commitScope ? ` (scope: ${c.commitScope})` : ""}`);
          }
        } else {
          debug(`  ${section}: 0 commits`);
        }
      }
      debug(`  has matching commits: ${hasChanges}`);
    }

    if (!hasChanges && options.perPackageTags) {
      console.log(`${pkg.name}: no matching commits, skipping.`);
      continue;
    }

    const oldVersion = pkg.version ?? "0.0.0";
    const newVersion = targetVersion ?? bumpVersion(oldVersion, options.bump);
    console.log(`${pkg.name}: ${oldVersion} → ${newVersion}`);
    filesToCommit.push(pkg.packageJsonPath, `${pkg.path}/CHANGELOG.md`);

    const updatedDeps = await getUpdatedDependencies(
      cwd,
      pkg.packageJsonPath,
      lastTag,
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
      if (options.perPackageTags) {
        tags.push(`${pkg.name}@${newVersion}`);
      } else {
        tags.push(`${tagPrefix}${newVersion}`);
      }
    }
  }

  const uniqueTags = [...new Set(tags)];

  filesToCommit.push(`${cwd}/bun.lock`);

  if (options.commit) {
    const releaseVersion = targetVersion ?? bumpVersion(packages[0]!.version ?? "0.0.0", options.bump);
    const msg =
      packages.length === 1
        ? `chore: release ${packages[0]!.name}@${releaseVersion}`
        : `chore: release ${packages.length} packages`;
    console.log(`Would commit: ${msg}`);
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

  console.log(`\nFiles that would be modified (${filesToCommit.length}):`);
  for (const f of filesToCommit) {
    console.log(`  ${f}`);
  }
  process.exit(0);
}

const tags: string[] = [];
const changedFiles: string[] = [];

for (const pkg of packages) {
  const groups = getPackageGroups(pkg, parsed);
  const hasChanges = packageHasChanges(groups);

  // per-package-tags + no changes → skip entirely
  if (!hasChanges && options.perPackageTags) {
    console.log(`${pkg.name}: no matching commits, skipping.`);
    continue;
  }

  const { oldVersion, newVersion } = targetVersion
    ? await setPackageVersion(pkg.packageJsonPath, targetVersion)
    : await updatePackageVersion(pkg.packageJsonPath, options.bump);
  changedFiles.push(pkg.packageJsonPath);
  console.log(`${pkg.name}: ${oldVersion} → ${newVersion}`);

  const updatedDeps = await getUpdatedDependencies(
    cwd,
    pkg.packageJsonPath,
    lastTag,
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
    if (options.perPackageTags) {
      tags.push(`${pkg.name}@${newVersion}`);
    } else {
      tags.push(`${tagPrefix}${newVersion}`);
    }
  }
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
  const msg =
    packages.length === 1
      ? `chore: release ${packages[0]!.name}@${(await Bun.file(packages[0]!.packageJsonPath).json()).version}`
      : `chore: release ${packages.length} packages`;
  await commitAndTag(cwd, msg, options.tag ? uniqueTags : [], changedFiles);
  console.log(`Committed: ${msg}`);
  if (uniqueTags.length > 0) {
    console.log(`Tagged: ${uniqueTags.join(", ")}`);
  }

  if (options.push) {
    await gitPush(cwd, uniqueTags);
    console.log("Pushed to remote.");
  }
}

console.log("Done.");
