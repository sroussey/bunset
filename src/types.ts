export type BumpType = "patch" | "minor" | "major";
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
  | "chore";

export interface CliOptions {
  scope: PackageScope;
  bump: BumpType;
  commit: boolean;
  tag: boolean;
  perPackageTags: boolean;
  sections: CommitType[];
}

export interface ParsedCommit {
  hash: string;
  message: string;
  type: CommitType | null;
  commitScope: string | null;
  description: string;
}

export type GroupedCommits = Record<CommitType, ParsedCommit[]>;

export interface PackageInfo {
  name: string;
  path: string;
  packageJsonPath: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface UpdatedDependency {
  name: string;
  newVersion: string;
}
