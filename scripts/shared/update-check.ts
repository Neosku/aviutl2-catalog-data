import type { SourceUpdateCheck } from "../../catalog-schema/definitions.ts";
import type { LoadedSourcePackage } from "../source/loader.ts";

export type ResolvedUpdateCheck = {
  id: string;
  source: NonNullable<Extract<SourceUpdateCheck, { enabled: true }>["source"]>;
  hashTargets: Array<{
    archiveFormat: "none" | "zip" | "7zip";
    sourcePaths: string[];
    recordPaths: string[];
  }>;
};

export function resolveUpdateCheck(pkg: LoadedSourcePackage): ResolvedUpdateCheck | null {
  const override = pkg.updateCheck;
  if (override?.enabled === false) return null;

  const inferredSource =
    pkg.install.installation.source.type === "githubRelease"
      ? pkg.install.installation.source
      : undefined;

  if (override === undefined && inferredSource === undefined) return null;

  const source = override?.source ?? inferredSource;
  if (source === undefined) {
    throw new Error(`${pkg.meta.id}: update-check source cannot be inferred`);
  }

  const hashTargets =
    override?.hashTargets?.map((target) => ({
      archiveFormat: target.archiveFormat ?? inferArchiveFormat(pkg),
      sourcePaths: target.sourcePaths.map(normalizePath),
      recordPaths: target.recordPaths.map(normalizePath),
    })) ?? inferHashTargets(pkg);

  return { id: pkg.meta.id, source, hashTargets };
}

function inferHashTargets(pkg: LoadedSourcePackage): ResolvedUpdateCheck["hashTargets"] {
  const latestVersion = pkg.versions.versions.at(-1);
  if (latestVersion === undefined || latestVersion.files.length === 0) {
    throw new Error(`${pkg.meta.id}: latest version has no files for update-check inference`);
  }

  const copySteps = pkg.install.installation.installSteps.filter(
    (
      step,
    ): step is Extract<
      (typeof pkg.install.installation.installSteps)[number],
      { action: "copy" }
    > => step.action === "copy",
  );
  const recordPaths = latestVersion.files.map((file) => normalizePath(file.path));
  const sourcePaths = recordPaths.map((recordPath) => {
    const candidates = copySteps
      .map((step) => inferSourcePath(step.from, step.to, recordPath))
      .filter((value): value is string => value !== null);
    const uniqueCandidates = [...new Set(candidates)];
    if (uniqueCandidates.length !== 1) {
      throw new Error(
        `${pkg.meta.id}: ${recordPath} maps to ${uniqueCandidates.length} update-check source paths`,
      );
    }
    return uniqueCandidates[0];
  });

  return [{ archiveFormat: inferArchiveFormat(pkg), sourcePaths, recordPaths }];
}

function inferSourcePath(fromValue: string, toValue: string, recordPath: string): string | null {
  const from = normalizePath(fromValue);
  const to = normalizePath(toValue);
  if (recordPath !== to && !recordPath.startsWith(`${to}/`)) return null;

  const suffix = recordPath === to ? "" : recordPath.slice(to.length + 1);
  const fromBaseName = from.slice(from.lastIndexOf("/") + 1);
  const recordBaseName = recordPath.slice(recordPath.lastIndexOf("/") + 1);
  const source = suffix && fromBaseName === recordBaseName ? from : joinPath(from, suffix);

  if (source === "{download}") return recordBaseName;
  if (!source.startsWith("{tmp}/")) return null;
  return source.slice("{tmp}/".length);
}

function inferArchiveFormat(pkg: LoadedSourcePackage): "none" | "zip" | "7zip" {
  const actions = pkg.install.installation.installSteps.map((step) => step.action);
  if (actions.includes("extractSfx")) return "7zip";
  if (actions.includes("extract")) return "zip";
  return "none";
}

function normalizePath(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "");
}

function joinPath(base: string, suffix: string): string {
  return suffix ? `${base}/${suffix}` : base;
}
