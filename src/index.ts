#!/usr/bin/env bun

import { resolveOptions } from "./cli.ts";
import { loadConfig } from "./config.ts";
import { parseCommit, groupCommits } from "./commits.ts";
import { buildChangelogEntry, writeChangelog } from "./changelog.ts";
import { getLastTag, getCommitsSince, commitAndTag } from "./git.ts";
import { getUpdatedDependencies } from "./deps.ts";
import {
  isWorkspace,
  getAllPackages,
  getChangedPackages,
} from "./workspace.ts";
import { updatePackageVersion } from "./version.ts";

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
const groups = groupCommits(parsed);

if (Object.values(groups).every((arr) => arr.length === 0)) {
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

const tags: string[] = [];

for (const pkg of packages) {
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
  const entry = buildChangelogEntry(newVersion, groups, updatedDeps);
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
