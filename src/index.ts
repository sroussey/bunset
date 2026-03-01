#!/usr/bin/env bun

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
} from "./git.ts";
import { getUpdatedDependencies } from "./deps.ts";
import {
  isWorkspace,
  getAllPackages,
  getChangedPackages,
} from "./workspace.ts";
import { bumpVersion, updatePackageVersion } from "./version.ts";
import type { ParsedCommit, GroupedCommits } from "./types.ts";

const cwd = process.cwd();

const isWs = await isWorkspace(cwd);
const config = await loadConfig(cwd);
const options = await resolveOptions(isWs, config);

const allPackages = await getAllPackages(cwd);
const lastTag = await getLastTag(cwd);
const rawCommits = await getCommitsSince(cwd, lastTag);

if (rawCommits.length === 0) {
  console.log("No commits found since last tag. Nothing to do.");
  process.exit(0);
}

const parsed = rawCommits.map((c) => parseCommit(c.hash, c.message));

// In a monorepo with filtering, fetch the file list for each commit
const shouldFilter = isWs && options.filterByPackage;
if (shouldFilter) {
  await Promise.all(
    parsed.map(async (commit) => {
      commit.files = await getCommitFiles(cwd, commit.hash);
    }),
  );
}

const globalGroups = groupCommits(parsed);

if (options.sections.every((type) => globalGroups[type].length === 0)) {
  console.log("No categorized commits found. Nothing to do.");
  process.exit(0);
}

let packages =
  options.scope === "changed"
    ? await getChangedPackages(cwd, allPackages, lastTag)
    : allPackages;

if (packages.length === 0) {
  console.log("No changed packages found. Nothing to do.");
  process.exit(0);
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

if (options.dryRun) {
  console.log("--- Dry Run ---\n");

  const tags: string[] = [];

  for (const pkg of packages) {
    const groups = getPackageGroups(pkg, parsed);
    const hasChanges = packageHasChanges(groups);

    if (!hasChanges && options.perPackageTags) {
      console.log(`${pkg.name}: no matching commits, skipping.`);
      continue;
    }

    const oldVersion = pkg.version ?? "0.0.0";
    const newVersion = bumpVersion(oldVersion, options.bump);
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

    console.log(`\nChangelog entry for ${pkg.name}:`);
    console.log(entry);

    if (options.tag) {
      if (options.perPackageTags) {
        tags.push(`${pkg.name}@${newVersion}`);
      } else {
        tags.push(`v${newVersion}`);
      }
    }
  }

  if (options.commit) {
    const msg =
      packages.length === 1
        ? `chore: release ${packages[0]!.name}@${bumpVersion(packages[0]!.version ?? "0.0.0", options.bump)}`
        : `chore: release ${packages.length} packages`;
    console.log(`Would commit: ${msg}`);
  } else {
    console.log("Will not commit (--commit not set).");
  }

  if (tags.length > 0) {
    console.log(`Would tag: ${tags.join(", ")}`);
  } else if (!options.tag) {
    console.log("Will not tag (--tag not set).");
  }

  console.log("\nNo files were modified.");
  process.exit(0);
}

const tags: string[] = [];

for (const pkg of packages) {
  const groups = getPackageGroups(pkg, parsed);
  const hasChanges = packageHasChanges(groups);

  // per-package-tags + no changes → skip entirely
  if (!hasChanges && options.perPackageTags) {
    console.log(`${pkg.name}: no matching commits, skipping.`);
    continue;
  }

  const { oldVersion, newVersion } = await updatePackageVersion(
    pkg.packageJsonPath,
    options.bump,
  );
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

  if (options.tag) {
    if (options.perPackageTags) {
      tags.push(`${pkg.name}@${newVersion}`);
    } else {
      tags.push(`v${newVersion}`);
    }
  }
}

if (options.commit) {
  const msg =
    packages.length === 1
      ? `chore: release ${packages[0]!.name}@${(await Bun.file(packages[0]!.packageJsonPath).json()).version}`
      : `chore: release ${packages.length} packages`;
  await commitAndTag(cwd, msg, options.tag ? tags : []);
  console.log(`Committed: ${msg}`);
  if (tags.length > 0) {
    console.log(`Tagged: ${tags.join(", ")}`);
  }
}

console.log("Done.");
