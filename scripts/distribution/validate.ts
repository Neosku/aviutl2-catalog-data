// 新schema 配布用の検証
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { zstdDecompressSync } from "node:zlib";
import type { ZodType } from "zod";
import { readJsonFile } from "../shared/fs-utils.ts";
import { sha256Hex } from "../shared/hash-utils.ts";
import { isJstIsoString } from "../shared/date-time.ts";
import { SUPPORTED_LOCALES } from "../../catalog-schema/definitions.ts";
import { AuditReport } from "../shared/validation-report.ts";
import {
  loadSourcePackages,
  compareSourcePackagesByAddedAt,
  pickContentForLocale,
  resolveLocalizedLocalReference,
  type LoadedSourcePackage,
} from "../source/loader.ts";
import { sourcePopularityPath } from "../source/popularity.ts";
import {
  catalogDetailSchema,
  catalogInstallSchema,
  catalogLatestVersionsSchema,
  catalogListSchema,
  catalogPopularitySchema,
  catalogUpdateCheckSchema,
  catalogVersionsSchema,
  manifestSchema,
  type CatalogManifest,
} from "../../catalog-schema/definitions.ts";
import { resolveUpdateCheck } from "../shared/update-check.ts";

type Artifact = CatalogManifest["paths"]["versions"];

function main(): void {
  const repoRoot = process.cwd();
  const options = parseOptions(process.argv.slice(2));
  const previewRoot = resolve(repoRoot, options.previewRoot ?? "publish-preview");
  const report = new AuditReport();
  const manifestPath = resolve(previewRoot, "manifest.json");
  const packageListPath = resolve(previewRoot, "パッケージ.md");
  const manifest = loadJson(manifestPath, manifestSchema, report);

  if (!existsSync(packageListPath)) {
    addError(
      report,
      packageListPath,
      "<root>",
      "package-list.exists",
      "Generated package list does not exist.",
    );
  }

  if (manifest === null) {
    finish(report, 0, []);
    return;
  }

  validateManifestConfiguration(manifest, report);
  validateManifestDateTimes(manifestPath, manifest, report);
  validateManifestPublication(manifestPath, manifest, options.expectedArtifactCommit, report);

  const sourcePackages = loadSourcePackages(resolve(repoRoot, "packages"));
  const sourceById = new Map(sourcePackages.map((pkg) => [pkg.meta.id, pkg]));
  const sourcePopularity = loadJson(
    sourcePopularityPath(repoRoot),
    catalogPopularitySchema,
    report,
  );
  const orderedPackages = [...sourcePackages].sort(compareSourcePackagesByAddedAt);

  for (const locale of manifest.locales) {
    const listArtifact = manifest.paths.list[locale];
    const detailArtifact = manifest.paths.detail[locale];
    if (listArtifact === undefined || detailArtifact === undefined) {
      addError(
        report,
        manifestPath,
        `paths.${listArtifact === undefined ? "list" : "detail"}.${locale}`,
        "manifest.locale-path.exists",
        `Manifest is missing an artifact for locale ${locale}.`,
      );
      continue;
    }

    validateArtifact(previewRoot, listArtifact, report);
    validateArtifact(previewRoot, detailArtifact, report);
    const listPath = artifactPath(previewRoot, listArtifact.json.path);
    const detailPath = artifactPath(previewRoot, detailArtifact.json.path);
    const list = loadJson(listPath, catalogListSchema, report);
    const detail = loadJson(detailPath, catalogDetailSchema, report);
    if (list !== null) {
      validateList(listPath, list, locale, orderedPackages, report);
    }
    if (detail !== null) {
      validateDetail(detailPath, detail, locale, sourceById, report);
    }
  }

  const coreArtifacts = [
    manifest.paths.versions,
    manifest.paths.popularity,
    manifest.paths.install,
    manifest.paths.updateCheck,
  ];
  for (const artifact of coreArtifacts) {
    validateArtifact(previewRoot, artifact, report);
  }

  const versionsPath = artifactPath(previewRoot, manifest.paths.versions.json.path);
  const latestVersionsPath = resolve(previewRoot, "catalog-latest-versions.json");
  const popularityPath = artifactPath(previewRoot, manifest.paths.popularity.json.path);
  const installPath = artifactPath(previewRoot, manifest.paths.install.json.path);
  const updateCheckPath = artifactPath(previewRoot, manifest.paths.updateCheck.json.path);
  const versions = loadJson(versionsPath, catalogVersionsSchema, report);
  const latestVersions = loadJson(latestVersionsPath, catalogLatestVersionsSchema, report);
  const popularity = loadJson(popularityPath, catalogPopularitySchema, report);
  const install = loadJson(installPath, catalogInstallSchema, report);
  const updateCheck = loadJson(updateCheckPath, catalogUpdateCheckSchema, report);

  if (versions !== null) {
    validateVersions(versionsPath, versions, sourceById, report);
  }
  if (latestVersions !== null) {
    validateLatestVersions(latestVersionsPath, latestVersions, sourceById, report);
  }
  if (popularity !== null && sourcePopularity !== null) {
    validatePopularity(popularityPath, popularity, sourcePopularity, sourceById, report);
  }
  if (install !== null) {
    validateInstall(installPath, install, sourceById, report);
  }
  if (updateCheck !== null) {
    validateUpdateCheck(updateCheckPath, updateCheck, sourceById, report);
  }

  finish(report, sourcePackages.length, manifest.locales);
}

type ValidationOptions = {
  previewRoot?: string;
  expectedArtifactCommit?: string;
};

function parseOptions(args: string[]): ValidationOptions {
  const options: ValidationOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--preview-root") {
      options.previewRoot = args[index + 1];
      index += 1;
    } else if (argument === "--expected-artifact-commit") {
      options.expectedArtifactCommit = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.previewRoot === undefined && args.includes("--preview-root")) {
    throw new Error("--preview-root requires a value.");
  }
  if (options.expectedArtifactCommit === undefined && args.includes("--expected-artifact-commit")) {
    throw new Error("--expected-artifact-commit requires a value.");
  }
  return options;
}

function validateManifestPublication(
  manifestPath: string,
  manifest: CatalogManifest,
  expectedArtifactCommit: string | undefined,
  report: AuditReport,
): void {
  if (expectedArtifactCommit === undefined) {
    return;
  }
  if (manifest.artifactCommit !== expectedArtifactCommit) {
    addError(
      report,
      manifestPath,
      "artifactCommit",
      "manifest.artifact-commit.expected",
      `Expected artifact commit ${expectedArtifactCommit}, got ${manifest.artifactCommit ?? "<missing>"}.`,
    );
  }
  if (manifest.artifactBaseUrl === undefined) {
    addError(
      report,
      manifestPath,
      "artifactBaseUrl",
      "manifest.artifact-base-url.required",
      "artifactBaseUrl is required when an expected artifact commit is provided.",
    );
  }
}

function validateManifestConfiguration(manifest: CatalogManifest, report: AuditReport): void {
  if (!sameJson(manifest.locales, [...SUPPORTED_LOCALES])) {
    addError(
      report,
      "manifest.json",
      "locales",
      "manifest.locales",
      `Expected locales ${SUPPORTED_LOCALES.join(", ")}.`,
    );
  }
}

function validateManifestDateTimes(
  manifestPath: string,
  manifest: CatalogManifest,
  report: AuditReport,
): void {
  const dateTimes: Array<[string, string]> = [["updatedAt", manifest.updatedAt]];
  for (const locale of manifest.locales) {
    const list = manifest.paths.list[locale];
    const detail = manifest.paths.detail[locale];
    if (list !== undefined) {
      dateTimes.push([`paths.list.${locale}.updatedAt`, list.updatedAt]);
    }
    if (detail !== undefined) {
      dateTimes.push([`paths.detail.${locale}.updatedAt`, detail.updatedAt]);
    }
  }
  dateTimes.push(
    ["paths.versions.updatedAt", manifest.paths.versions.updatedAt],
    ["paths.popularity.updatedAt", manifest.paths.popularity.updatedAt],
    ["paths.install.updatedAt", manifest.paths.install.updatedAt],
    ["paths.updateCheck.updatedAt", manifest.paths.updateCheck.updatedAt],
  );

  for (const [jsonPath, value] of dateTimes) {
    if (!isJstIsoString(value)) {
      addError(
        report,
        manifestPath,
        jsonPath,
        "manifest.updated-at.jst",
        `Expected an ISO 8601 date-time with the +09:00 offset, got ${value}.`,
      );
    }
  }
}

function validateList(
  path: string,
  payload: ReturnType<typeof catalogListSchema.parse>,
  locale: string,
  expectedPackages: LoadedSourcePackage[],
  report: AuditReport,
): void {
  validatePayloadHeader(path, payload, locale, report);
  if (payload.packages.length !== expectedPackages.length) {
    addError(
      report,
      path,
      "packages",
      "list.count",
      `Expected ${expectedPackages.length} packages, got ${payload.packages.length}.`,
    );
  }

  for (const [index, entry] of payload.packages.entries()) {
    const source = expectedPackages[index];
    if (source === undefined) {
      continue;
    }
    const expected = expectedListEntry(source, locale);
    if (!sameJson(entry, expected)) {
      addError(
        report,
        path,
        `packages[${index}]`,
        "list.source-values",
        `Entry does not match source for ${source.meta.id}.`,
        source.meta.id,
      );
    }
    checkAsset(
      path,
      entry.changelog?.markdownSource,
      source.meta.id,
      `packages[${index}].changelog.markdownSource`,
      report,
    );
    checkAsset(
      path,
      entry.images?.thumbnail,
      source.meta.id,
      `packages[${index}].images.thumbnail`,
      report,
    );
  }
}

function validateDetail(
  path: string,
  payload: ReturnType<typeof catalogDetailSchema.parse>,
  locale: string,
  sourceById: ReadonlyMap<string, LoadedSourcePackage>,
  report: AuditReport,
): void {
  validatePayloadHeader(path, payload, locale, report);
  validateKeySet(path, payload.packages, sourceById, "detail.ids", report);

  for (const [id, entry] of Object.entries(payload.packages)) {
    const source = sourceById.get(id);
    if (source === undefined) {
      continue;
    }
    if (!sameJson(entry, expectedDetailEntry(source, locale))) {
      addError(
        report,
        path,
        `packages.${id}`,
        "detail.source-values",
        "Detail entry does not match source.",
        id,
      );
    }
    checkAsset(
      path,
      entry.description.markdownSource,
      id,
      `packages.${id}.description.markdownSource`,
      report,
    );
    checkAsset(
      path,
      entry.notice?.markdownSource,
      id,
      `packages.${id}.notice.markdownSource`,
      report,
    );
    for (const [index, image] of (entry.images?.detailImages ?? []).entries()) {
      checkAsset(path, image, id, `packages.${id}.images.detailImages[${index}]`, report);
    }
  }
}

function validateVersions(
  path: string,
  payload: ReturnType<typeof catalogVersionsSchema.parse>,
  sourceById: ReadonlyMap<string, LoadedSourcePackage>,
  report: AuditReport,
): void {
  validateKeySet(path, payload.packages, sourceById, "versions.ids", report);
  for (const [id, source] of sourceById) {
    const actual = payload.packages[id];
    if (actual === undefined) continue;
    if (!sameJson(actual.versions, source.versions.versions)) {
      addError(
        report,
        path,
        `packages.${id}.versions`,
        "versions.source-values",
        "Versions do not match source.",
        id,
      );
    }
  }
}

function validateLatestVersions(
  path: string,
  payload: ReturnType<typeof catalogLatestVersionsSchema.parse>,
  sourceById: ReadonlyMap<string, LoadedSourcePackage>,
  report: AuditReport,
): void {
  validateKeySet(path, payload, sourceById, "latest-versions.ids", report);
  for (const [id, source] of sourceById) {
    const actual = payload[id];
    const expected = source.versions.versions.at(-1)?.version;
    if (actual !== expected) {
      addError(
        report,
        path,
        id,
        "latest-versions.source-value",
        `Latest version does not match source: expected ${expected ?? "<missing>"}.`,
        id,
      );
    }
  }
}

function validatePopularity(
  path: string,
  payload: ReturnType<typeof catalogPopularitySchema.parse>,
  sourcePopularity: ReturnType<typeof catalogPopularitySchema.parse>,
  sourceById: ReadonlyMap<string, LoadedSourcePackage>,
  report: AuditReport,
): void {
  validateKeySet(path, payload.packages, sourceById, "popularity.ids", report);
  validateKeySet(
    sourcePopularityPath(process.cwd()),
    sourcePopularity.packages,
    sourceById,
    "source-popularity.ids",
    report,
  );
  if (!sameJson(payload, sourcePopularity)) {
    addError(
      report,
      path,
      "<root>",
      "popularity.source-values",
      "Popularity data do not match catalog-popularity.json.",
    );
  }
}

function validateInstall(
  path: string,
  payload: ReturnType<typeof catalogInstallSchema.parse>,
  sourceById: ReadonlyMap<string, LoadedSourcePackage>,
  report: AuditReport,
): void {
  validateKeySet(path, payload.packages, sourceById, "install.ids", report);
  for (const [id, source] of sourceById) {
    const actual = payload.packages[id];
    if (actual !== undefined && !sameJson(actual, source.install)) {
      addError(
        report,
        path,
        `packages.${id}`,
        "install.source-values",
        "Install data does not match source.",
        id,
      );
    }
  }
}

function validateUpdateCheck(
  path: string,
  payload: ReturnType<typeof catalogUpdateCheckSchema.parse>,
  sourceById: ReadonlyMap<string, LoadedSourcePackage>,
  report: AuditReport,
): void {
  const expectedIds = new Set(
    [...sourceById.values()]
      .filter((pkg) => resolveUpdateCheck(pkg) !== null)
      .map((pkg) => pkg.meta.id),
  );
  const actualIds = new Set(payload.packages.map((entry) => entry.id));
  if (!sameJson([...actualIds].sort(), [...expectedIds].sort())) {
    addError(
      report,
      path,
      "packages",
      "update-check.ids",
      "Package ids do not match resolved source update checks.",
    );
  }
  for (const entry of payload.packages) {
    const source = sourceById.get(entry.id);
    if (source === undefined) {
      addError(
        report,
        path,
        "packages[].id",
        "update-check.id.exists",
        "Unknown package id.",
        entry.id,
      );
      continue;
    }
    const expected = expectedUpdateCheckEntry(source);
    if (expected === null || !sameJson(entry, expected)) {
      addError(
        report,
        path,
        "packages[]",
        "update-check.source-values",
        "Update-check entry does not match source.",
        entry.id,
      );
    }
  }
}

function expectedListEntry(pkg: LoadedSourcePackage, locale: string): Record<string, unknown> {
  const content = pickContentForLocale(pkg, locale);
  return {
    id: pkg.meta.id,
    legacyId: pkg.meta.legacyId,
    packageType: pkg.meta.packageType,
    packageRole: pkg.meta.packageRole,
    addedAt: pkg.meta.addedAt,
    name: content.name,
    author: content.author,
    ...(content.typeLabel !== undefined ? { typeLabel: content.typeLabel } : {}),
    tags: content.tags,
    summary: content.description.summary,
    ...(content.changelog !== undefined
      ? {
          changelog: {
            markdownSource: publishedReference(pkg, locale, content.changelog.markdownSource),
          },
        }
      : {}),
    ...(pkg.meta.niconiCommonsId !== undefined
      ? { niconiCommonsId: pkg.meta.niconiCommonsId }
      : {}),
    ...(content.deprecation !== undefined ? { deprecation: content.deprecation } : {}),
    ...(content.images?.thumbnail !== undefined
      ? { images: { thumbnail: publishedReference(pkg, locale, content.images.thumbnail) } }
      : {}),
  };
}

function expectedDetailEntry(pkg: LoadedSourcePackage, locale: string): Record<string, unknown> {
  const content = pickContentForLocale(pkg, locale);
  return {
    packagePageUrl: pkg.meta.packagePageUrl,
    ...(pkg.meta.fundingUrl !== undefined ? { fundingUrl: pkg.meta.fundingUrl } : {}),
    ...(pkg.meta.isOpenSource !== undefined ? { isOpenSource: pkg.meta.isOpenSource } : {}),
    ...(content.originalAuthor !== undefined ? { originalAuthor: content.originalAuthor } : {}),
    description: {
      markdownSource: publishedReference(pkg, locale, content.description.markdownSource),
    },
    ...(content.notice !== undefined
      ? {
          notice: {
            markdownSource: publishedReference(pkg, locale, content.notice.markdownSource),
          },
        }
      : {}),
    licenses: content.licenses,
    ...(content.images?.detailImages !== undefined && content.images.detailImages.length > 0
      ? {
          images: {
            detailImages: content.images.detailImages.map((image) =>
              publishedReference(pkg, locale, image),
            ),
          },
        }
      : {}),
  };
}

function expectedUpdateCheckEntry(pkg: LoadedSourcePackage): Record<string, unknown> | null {
  return resolveUpdateCheck(pkg);
}

function publishedReference(pkg: LoadedSourcePackage, locale: string, reference: string): string {
  const localized = resolveLocalizedLocalReference(pkg.packageRoot, locale, reference);
  if (!localized.startsWith("./")) {
    return localized;
  }
  const [namespace, slug] = pkg.meta.id.split(".");
  return `../assets/${namespace}/${slug}/${localized.slice(2).replaceAll("\\", "/")}`;
}

function validatePayloadHeader(
  path: string,
  payload: { locale?: string },
  locale: string,
  report: AuditReport,
): void {
  if (payload.locale !== locale) {
    addError(
      report,
      path,
      "locale",
      "payload.locale",
      `Expected locale ${locale}, got ${payload.locale ?? "<missing>"}.`,
    );
  }
}

function validateKeySet(
  path: string,
  actual: Readonly<Record<string, unknown>>,
  expected: ReadonlyMap<string, unknown>,
  rule: string,
  report: AuditReport,
): void {
  if (!sameJson(Object.keys(actual).sort(), [...expected.keys()].sort())) {
    addError(report, path, "packages", rule, "Package id set does not match source packages.");
  }
}

function validateArtifact(previewRoot: string, artifact: Artifact, report: AuditReport): void {
  const jsonBytes = checkArtifactFile(previewRoot, artifact.json, report);
  const zstdBytes = checkArtifactFile(previewRoot, artifact.zstd, report);
  if (jsonBytes === null || zstdBytes === null) return;
  try {
    const decompressed = zstdDecompressSync(zstdBytes);
    if (!decompressed.equals(jsonBytes)) {
      addError(
        report,
        artifact.zstd.path,
        "<root>",
        "artifact.zstd-content",
        "Decompressed content does not equal the JSON artifact.",
      );
    }
  } catch (error) {
    addError(
      report,
      artifact.zstd.path,
      "<root>",
      "artifact.zstd-valid",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function checkArtifactFile(
  previewRoot: string,
  file: Artifact["json"],
  report: AuditReport,
): Buffer | null {
  const path = artifactPath(previewRoot, file.path);
  if (!existsSync(path)) {
    addError(
      report,
      path,
      "<root>",
      "manifest.path.exists",
      `Manifest path does not exist: ${file.path}`,
    );
    return null;
  }
  const bytes = readFileSync(path);
  const actualHash = sha256Hex(bytes);
  if (actualHash !== file.sha256) {
    addError(
      report,
      path,
      "<root>",
      "manifest.sha256",
      `Expected ${file.sha256}, got ${actualHash}.`,
    );
  }
  return bytes;
}

function artifactPath(previewRoot: string, relativePath: string): string {
  return resolve(previewRoot, ...relativePath.slice(2).split("/"));
}

function checkAsset(
  containingFile: string,
  reference: string | undefined,
  packageId: string,
  jsonPath: string,
  report: AuditReport,
): void {
  if (reference === undefined || (!reference.startsWith("./") && !reference.startsWith("../")))
    return;
  if (!existsSync(resolve(dirname(containingFile), reference))) {
    addError(
      report,
      containingFile,
      jsonPath,
      "preview.asset.exists",
      `Referenced asset does not exist: ${reference}`,
      packageId,
    );
  }
}

function loadJson<T>(path: string, schema: ZodType<T>, report: AuditReport): T | null {
  if (!existsSync(path)) {
    addError(report, path, "<root>", "file.exists", "Required file does not exist.");
    return null;
  }
  let raw: unknown;
  try {
    raw = readJsonFile(path);
  } catch (error) {
    addError(
      report,
      path,
      "<root>",
      "json.parse",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    report.addZodError(path, parsed.error);
    return null;
  }
  return parsed.data;
}

function addError(
  report: AuditReport,
  file: string,
  jsonPath: string,
  rule: string,
  message: string,
  packageId?: string,
): void {
  report.add({ severity: "error", file, packageId, jsonPath, rule, message });
}

function sameJson(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}

function finish(report: AuditReport, packageCount: number, locales: readonly string[]): void {
  if (report.hasIssues()) {
    report.printSummary();
    process.exitCode = 1;
    return;
  }
  console.log(`OK checked publish-preview: packages=${packageCount}, locales=${locales.join(",")}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
