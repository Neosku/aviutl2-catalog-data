// 新schema 正本から旧schema index.jsonを作成(互換性維持のための措置)
import { existsSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import process from "node:process";
import type {
  CatalogLicense,
  CatalogPackageType,
  Installation,
  SourceContent,
} from "../../catalog-schema/definitions.ts";
import { writeJsonFile } from "../shared/fs-utils.ts";
import { AuditReport } from "../shared/validation-report.ts";
import {
  loadSourcePackages,
  compareSourcePackagesByAddedAt,
  pickContentForLocale,
  resolveLocalizedLocalReference,
  type LoadedSourcePackage,
} from "../source/loader.ts";
import { loadSourcePopularity, SOURCE_POPULARITY_RELATIVE_PATH } from "../source/popularity.ts";
import {
  legacyIndexSchema,
  type LegacyIndex,
  type LegacyPackage,
} from "../migration/legacy-schema.ts";
import { resolveLegacyInputReference } from "../migration/input-paths.ts";

type LegacyPopularity = { popularity: number; trend: number };
type SourcePackageMap = Map<string, LoadedSourcePackage>;
type InstallStep = Installation["installSteps"][number] | Installation["uninstallSteps"][number];
const LEGACY_DESCRIPTION_ROOT = "md";
const LEGACY_IMAGE_ROOT = "image";
const DEFAULT_OUTPUT_FILE = "index-test.json";
const PACKAGE_TYPE_TO_LEGACY_TYPE = {
  core: "本体",
  mod: "MOD",
  inputPlugin: "入力プラグイン",
  outputPlugin: "出力プラグイン",
  generalPlugin: "汎用プラグイン",
  filterPlugin: "フィルタプラグイン",
  script: "スクリプト",
  custom: "その他",
};
function main(): void {
  const repoRoot = process.cwd();
  const outputFile = process.env.LEGACY_INDEX_OUTPUT?.trim() || DEFAULT_OUTPUT_FILE;
  const report = new AuditReport();
  const packagesRoot = resolve(repoRoot, "packages");
  const sourcePackages = loadSourcePackages(packagesRoot);
  const sourceByNewId = new Map(sourcePackages.map((pkg) => [pkg.meta.id, pkg]));
  const popularity = loadSourcePopularity(repoRoot).packages;
  const orderedPackages = [...sourcePackages].sort(compareSourcePackagesByAddedAt);
  const restoredIndex = orderedPackages.map((pkg) =>
    buildLegacyPackage(repoRoot, pkg.packageRoot, pkg, sourceByNewId, popularity, report),
  );
  validateGeneratedIndex(restoredIndex, outputFile, report);
  if (report.hasIssues()) {
    report.printSummary();
    process.exit(1);
  }
  writeJsonFile(resolve(repoRoot, outputFile), restoredIndex);
  console.log(
    `OK built legacy ${outputFile} from source packages: ${restoredIndex.length} package(s)`,
  );
}
function buildLegacyPackage(
  repoRoot: string,
  packageRoot: string,
  pkg: LoadedSourcePackage,
  sourceByNewId: SourcePackageMap,
  popularity: Readonly<Record<string, LegacyPopularity>>,
  report: AuditReport,
): LegacyPackage {
  const content = pickContentForLocale(pkg, "ja");
  const latestVersion = pkg.versions.versions[pkg.versions.versions.length - 1];
  const popularityEntry = popularity[pkg.meta.id];
  if (latestVersion === undefined) {
    report.add({
      severity: "error",
      file: packageRoot,
      packageId: pkg.meta.legacyId,
      jsonPath: "versions.versions",
      rule: "legacy-index.version.present",
      message: "versions.json must contain at least one version.",
    });
  }
  if (popularityEntry === undefined) {
    report.add({
      severity: "error",
      file: SOURCE_POPULARITY_RELATIVE_PATH,
      packageId: pkg.meta.legacyId,
      jsonPath: "<root>",
      rule: "legacy-index.popularity.present",
      message: "Source popularity data do not have popularity/trend for this package id.",
    });
  }
  return {
    id: pkg.meta.legacyId,
    name: content.name,
    type: restoreLegacyType(pkg.meta.legacyId, pkg.meta.packageType, content.typeLabel, report),
    summary: content.description.summary,
    description: restoreLegacyDescriptionPath(repoRoot, pkg, content.description.markdownSource),
    author: content.author,
    repoURL: pkg.meta.packagePageUrl,
    "latest-version": latestVersion?.version ?? "",
    popularity: popularityEntry?.popularity ?? 0,
    trend: popularityEntry?.trend ?? 0,
    licenses: content.licenses.map((license) => restoreLegacyLicense(license)),
    tags: content.tags,
    dependencies: restoreLegacyDependencies(
      pkg.meta.legacyId,
      pkg.install.relations?.requires ?? [],
      sourceByNewId,
      report,
    ),
    images: restoreLegacyImages(repoRoot, pkg, content),
    installer: restoreLegacyInstaller(pkg.install.installation),
    version: pkg.versions.versions.map((version) => ({
      version: version.version,
      release_date: version.releaseDate,
      file: version.files.map((file) => ({
        path: file.path,
        XXH3_128: file.xxh128,
      })),
    })),
    ...(pkg.meta.niconiCommonsId !== undefined
      ? { niconiCommonsId: pkg.meta.niconiCommonsId }
      : {}),
    ...(content.originalAuthor !== undefined ? { originalAuthor: content.originalAuthor } : {}),
  };
}
function restoreLegacyType(
  legacyId: string,
  packageType: CatalogPackageType,
  typeLabel: string | undefined,
  report: AuditReport,
): string {
  if (packageType === "custom") {
    return typeLabel ?? PACKAGE_TYPE_TO_LEGACY_TYPE.custom;
  }
  const restored = PACKAGE_TYPE_TO_LEGACY_TYPE[packageType];
  if (restored !== undefined) {
    return restored;
  }
  report.add({
    severity: "error",
    file: legacyId,
    packageId: legacyId,
    jsonPath: "meta.packageType",
    rule: "legacy-index.type.mapped",
    message: `Unknown packageType "${packageType}" cannot be restored to legacy type.`,
  });
  return packageType;
}
function restoreLegacyDescriptionPath(
  repoRoot: string,
  pkg: LoadedSourcePackage,
  markdownSource: string,
): string {
  const localizedSource = resolveLocalizedLocalReference(pkg.packageRoot, "ja", markdownSource);
  if (!localizedSource.startsWith("./")) {
    return localizedSource;
  }
  const legacyMirror = `./${LEGACY_DESCRIPTION_ROOT}/${pkg.meta.legacyId}.md`;
  if (existsSync(resolveLegacyInputReference(repoRoot, legacyMirror))) {
    return legacyMirror;
  }
  const sourcePath = resolve(pkg.packageRoot, localizedSource);
  if (existsSync(sourcePath)) {
    return trimTrailingLineBreaks(readFileSync(sourcePath, "utf8"));
  }
  return localSourceReferenceToRepoPath(repoRoot, pkg.packageRoot, localizedSource);
}
function restoreLegacyImages(
  repoRoot: string,
  pkg: LoadedSourcePackage,
  content: SourceContent,
): LegacyPackage["images"] {
  if (content.images === undefined) {
    return [];
  }
  const infoImg = (content.images.detailImages ?? []).map((image, index) =>
    restoreLegacyImagePath(
      repoRoot,
      pkg,
      resolveLocalizedLocalReference(pkg.packageRoot, "ja", image),
      index + 1,
    ),
  );
  const rawThumbnail = content.images.thumbnail
    ? restoreLegacyImagePath(
        repoRoot,
        pkg,
        resolveLocalizedLocalReference(pkg.packageRoot, "ja", content.images.thumbnail),
        "thumbnail",
      )
    : undefined;
  const thumbnail =
    rawThumbnail !== undefined &&
    rawThumbnail.startsWith("./packages/") &&
    infoImg[0]?.startsWith("./image/")
      ? infoImg[0]
      : rawThumbnail;
  if (thumbnail === undefined && infoImg.length === 0) {
    return [];
  }
  return [
    {
      ...(thumbnail !== undefined ? { thumbnail } : {}),
      ...(infoImg.length > 0 ? { infoImg } : {}),
    },
  ];
}
function restoreLegacyImagePath(
  repoRoot: string,
  pkg: LoadedSourcePackage,
  sourcePath: string,
  imageKind: number | "thumbnail",
): string {
  if (!sourcePath.startsWith("./")) {
    return sourcePath;
  }
  const extension = extname(sourcePath) || ".png";
  const legacyFileName =
    imageKind === "thumbnail"
      ? `${pkg.meta.legacyId}_thumbnail${extension}`
      : `${pkg.meta.legacyId}_${imageKind}${extension}`;
  const legacyMirror = `./${LEGACY_IMAGE_ROOT}/${legacyFileName}`;
  if (existsSync(resolveLegacyInputReference(repoRoot, legacyMirror))) {
    return legacyMirror;
  }
  return localSourceReferenceToRepoPath(repoRoot, pkg.packageRoot, sourcePath);
}
function localSourceReferenceToRepoPath(
  repoRoot: string,
  packageRoot: string,
  sourcePath: string,
): string {
  const absoluteSourcePath = resolve(packageRoot, sourcePath);
  const relativePath = relative(repoRoot, absoluteSourcePath).replaceAll("\\", "/");
  return `./${relativePath}`;
}
function restoreLegacyDependencies(
  legacyId: string,
  dependencyIds: string[],
  sourceByNewId: SourcePackageMap,
  report: AuditReport,
): string[] {
  return dependencyIds.map((dependencyId) => {
    const dependency = sourceByNewId.get(dependencyId);
    if (dependency !== undefined) {
      return dependency.meta.legacyId;
    }
    report.add({
      severity: "error",
      file: legacyId,
      packageId: legacyId,
      jsonPath: "install.relations.requires",
      rule: "legacy-index.dependency.exists",
      message: `Referenced dependency id "${dependencyId}" does not exist in source packages.`,
    });
    return dependencyId;
  });
}
function restoreLegacyInstaller(installation: Installation): LegacyPackage["installer"] {
  return {
    source: restoreLegacyInstallerSource(installation.source),
    install: installation.installSteps.map(restoreLegacyInstallerAction),
    uninstall: installation.uninstallSteps.map(restoreLegacyInstallerAction),
  };
}
function restoreLegacyInstallerSource(
  source: Installation["source"],
): LegacyPackage["installer"]["source"] {
  switch (source.type) {
    case "directUrl":
      return { direct: source.url };
    case "booth":
      return { booth: source.url };
    case "githubRelease":
      return { github: { owner: source.owner, repo: source.repo, pattern: source.pattern } };
    case "googleDrive":
      return { GoogleDrive: { id: source.id } };
  }
}
function restoreLegacyInstallerAction(
  step: InstallStep,
): LegacyPackage["installer"]["install"][number] {
  switch (step.action) {
    case "download":
      return { action: "download" };
    case "extract":
    case "extractSfx":
      return {
        action: step.action === "extract" ? "extract" : "extract_sfx",
        ...(step.from !== undefined ? { from: step.from } : {}),
        ...(step.to !== undefined ? { to: step.to } : {}),
      };
    case "copy":
      return { action: "copy", from: step.from, to: step.to };
    case "delete":
      return { action: "delete", path: step.path };
    case "run":
      return {
        action: "run",
        path: step.path,
        args: step.args ?? [],
        ...(step.elevate !== undefined ? { elevate: step.elevate } : {}),
      };
    case "runAuoSetup":
      return { action: "run_auo_setup", path: step.path };
  }
}
function restoreLegacyLicense(license: CatalogLicense): LegacyPackage["licenses"][number] {
  const legacyType =
    license.type === "custom"
      ? (license.name ?? "カスタムライセンス")
      : license.type === "unknown"
        ? (license.name ?? "不明")
        : (license.name ?? license.type);
  return {
    type: legacyType,
    isCustom: license.type === "custom" || license.type === "unknown",
    copyrights: license.copyrights ?? [],
    licenseBody: license.licenseBody ?? null,
  };
}
function trimTrailingLineBreaks(value: string): string {
  return value.replace(/(?:\r?\n)+$/u, "");
}
function validateGeneratedIndex(index: LegacyIndex, outputFile: string, report: AuditReport): void {
  const parsed = legacyIndexSchema.safeParse(index);
  if (!parsed.success) {
    report.addZodError(outputFile, parsed.error);
    return;
  }
  const seenIds = new Set();
  for (const [packageIndex, pkg] of index.entries()) {
    if (seenIds.has(pkg.id)) {
      report.add({
        severity: "error",
        file: outputFile,
        packageId: pkg.id,
        jsonPath: `[${packageIndex}].id`,
        rule: "legacy-index.id.unique",
        message: "Duplicate legacy id detected in generated output.",
      });
    }
    seenIds.add(pkg.id);
    const latestVersion = pkg.version[pkg.version.length - 1]?.version;
    if (latestVersion !== pkg["latest-version"]) {
      report.add({
        severity: "error",
        file: outputFile,
        packageId: pkg.id,
        jsonPath: `[${packageIndex}].latest-version`,
        rule: "legacy-index.latest-version.matches-last-version",
        message: `latest-version (${pkg["latest-version"]}) does not match the last version entry (${latestVersion ?? "<missing>"}).`,
      });
    }
  }
}
main();
