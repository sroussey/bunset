export type BumpType = "patch" | "minor" | "major";
/** What the user asked for: a fixed bump, or "derive it from the commits". */
export type BumpSelection = BumpType | "auto";
export type PackageScope = "all" | "changed";
export type CommitType =
  | "feature"
  | "bugfix"
  | "refactor"
  | "perf"
  | "style"
  | "test"
  | "docs"
  | "build"
  | "ops"
  | "chore"
  | "ci";

export interface CliOptions {
  scope: PackageScope;
  bump: BumpSelection;
  commit: boolean;
  tag: boolean;
  perPackageTags: boolean;
  sections: CommitType[];
  dryRun: boolean;
  filterByPackage: boolean;
  tagPrefix: string | null;
  push: boolean;
  release: boolean;
  debug: boolean;
  includePrivate: boolean;
  skipUnchanged: boolean;
  surfaceCheck: boolean;
}

export interface ParsedCommit {
  hash: string;
  message: string;
  type: CommitType | null;
  commitScope: string | null;
  description: string;
  breaking: boolean;
  files: string[];
}

export type GroupedCommits = Record<CommitType, ParsedCommit[]>;

export interface PackageInfo {
  name: string;
  path: string;
  packageJsonPath: string;
  version: string;
  private: boolean;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface UpdatedDependency {
  name: string;
  newVersion: string;
}

/**
 * An incompatible change found by comparing a package's manifest against the
 * one at the last release tag. These are breaks a commit message can omit and
 * a `.d.ts` diff would need a TypeScript parser to see.
 */
export interface SurfaceChange {
  kind:
    | "entry-point-removed"
    | "export-removed"
    | "condition-removed"
    | "bin-removed"
    | "engines-added"
    | "engines-raised"
    | "unpublished";
  detail: string;
}
