import type { CliOptions } from "./types.ts";

export interface LockstepViolation {
  option: string;
  reason: string;
}

/**
 * Options that contradict lockstep.
 *
 * Each of these leaves some package behind the shared version line, which is
 * the one thing lockstep exists to prevent. They are refused rather than
 * silently overridden: a flag that stops meaning what it says is how a release
 * ends up not matching what anyone asked for.
 */
export function findLockstepViolations(
  options: Pick<CliOptions, "scope" | "skipUnchanged" | "perPackageTags">,
): LockstepViolation[] {
  const violations: LockstepViolation[] = [];

  if (options.scope === "changed") {
    violations.push({
      option: "scope = \"changed\" (--changed)",
      reason: "only packages with file changes are versioned; the rest keep their old version",
    });
  }

  if (options.skipUnchanged) {
    violations.push({
      option: "--skip-unchanged",
      reason: "packages with no matching commits are skipped, so they fall behind",
    });
  }

  if (options.perPackageTags) {
    violations.push({
      option: "--per-package-tags",
      reason: "per-package tags give every package its own independent version line",
    });
  }

  return violations;
}

export function describeLockstepViolations(
  violations: readonly LockstepViolation[],
): string {
  return [
    "lockstep is set, but these would leave packages behind the shared version:",
    "",
    ...violations.map((v) => `  ${v.option}\n      ${v.reason}`),
    "",
    "Drop them, or turn lockstep off.",
  ].join("\n");
}
