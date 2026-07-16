// 旧schemaから新schema正本への変換
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { type ZodType } from "zod";
import {
  copyFileIntoRepoOutput,
  readJsonFile,
  removeDirectory,
  replaceDirectory,
  resetDirectory,
  writeJsonFile,
  writeTextFile,
} from "../shared/fs-utils.ts";
import {
  legacyDateSchema,
  legacyIndexSchema,
  legacySearchSchema,
  type LegacyIndex,
  type LegacyPackage,
  type LegacySearchEntry,
} from "./legacy-schema.ts";
import { AuditReport } from "../shared/validation-report.ts";
import { resolveUpdateCheck } from "../shared/update-check.ts";
import type { LoadedSourcePackage } from "../source/loader.ts";
import {
  deriveIdCandidate,
  LEGACY_ACTION_TO_NEW_ACTION,
  LEGACY_INSTALLER_SOURCE_TO_NEW_TYPE,
  LEGACY_LICENSE_RULES,
  LEGACY_PACKAGE_ROLE_OVERRIDES,
  LEGACY_TYPE_TO_PACKAGE_TYPE,
} from "./migration-rules.ts";
import { LEGACY_INPUT_PATHS, resolveLegacyInputReference } from "./input-paths.ts";
import type {
  CatalogPopularity,
  SourceContent,
  SourceInstall,
  SourceMeta,
  SourceUpdateCheck,
  SourceVersions,
} from "../../catalog-schema/definitions.ts";
import {
  CATALOG_SCHEMA_VERSION,
  catalogPopularitySchema,
  sourceContentSchema,
  sourceInstallSchema,
  sourceMetaSchema,
  sourceUpdateCheckSchema,
  sourceVersionsSchema,
} from "../../catalog-schema/definitions.ts";
import { sourcePopularityPath } from "../source/popularity.ts";

type PendingWrite =
  | { type: "json"; path: string; value: unknown }
  | { type: "text"; path: string; content: string }
  | { type: "copy"; from: string; to: string };

function main(): void {
  const repoRoot = process.cwd();
  const outputRoot = resolve(repoRoot, "packages");
  const stagingRoot = resolve(repoRoot, ".tmp", "catalog-source-next");
  const report = new AuditReport();

  const index = loadWithSchema(
    resolve(repoRoot, LEGACY_INPUT_PATHS.index),
    legacyIndexSchema,
    report,
  );
  const search = loadWithSchema(
    resolve(repoRoot, LEGACY_INPUT_PATHS.search),
    legacySearchSchema,
    report,
  );
  const dateEntries = loadWithSchema(
    resolve(repoRoot, LEGACY_INPUT_PATHS.date),
    legacyDateSchema,
    report,
  );

  if (index === null || search === null || dateEntries === null) {
    report.printSummary();
    process.exitCode = 1;
    return;
  }

  resetDirectory(stagingRoot);
  const legacyIdToNewId = buildLegacyIdMap(index, report);
  const addedAtByLegacyId = new Map(dateEntries.map((entry) => [entry.id, entry.addedDate]));
  const searchByLegacyId = new Map(search.map((entry) => [entry.id, entry]));
  const writes: PendingWrite[] = [];
  const popularityPath = sourcePopularityPath(repoRoot);
  const popularity = migratePopularity(index, legacyIdToNewId, popularityPath, report);

  for (const legacyPackage of index) {
    const newId = legacyIdToNewId.get(legacyPackage.id);
    if (newId === undefined) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: legacyPackage.id,
        jsonPath: "id",
        rule: "id.mapped",
        message: "Missing source id mapping.",
      });
      continue;
    }

    const addedAt = addedAtByLegacyId.get(legacyPackage.id);
    if (addedAt === undefined) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.date,
        packageId: legacyPackage.id,
        jsonPath: "<root>",
        rule: "date.present",
        message: "Missing addedDate for package.",
      });
      continue;
    }

    const [namespace, packageSlug] = newId.split(".");
    const packageRoot = resolve(stagingRoot, namespace, packageSlug);
    const descriptionMarkdownSource = migrateDescription(
      repoRoot,
      packageRoot,
      legacyPackage,
      writes,
      report,
    );
    const migratedImages = migrateImages(repoRoot, packageRoot, legacyPackage, writes, report);

    const meta: SourceMeta = {
      id: newId,
      legacyId: legacyPackage.id,
      packageType:
        LEGACY_TYPE_TO_PACKAGE_TYPE[legacyPackage.type as keyof typeof LEGACY_TYPE_TO_PACKAGE_TYPE],
      packageRole: LEGACY_PACKAGE_ROLE_OVERRIDES[legacyPackage.id] ?? "primaryPackage",
      addedAt,
      packagePageUrl: legacyPackage.repoURL,
      ...(legacyPackage.niconiCommonsId !== undefined
        ? { niconiCommonsId: legacyPackage.niconiCommonsId }
        : {}),
    };

    const content: SourceContent = {
      name: legacyPackage.name,
      author: legacyPackage.author,
      ...(legacyPackage.originalAuthor !== undefined
        ? { originalAuthor: legacyPackage.originalAuthor }
        : {}),
      ...(meta.packageType === "custom" ? { typeLabel: legacyPackage.type } : {}),
      tags: legacyPackage.tags,
      description: {
        summary: legacyPackage.summary,
        markdownSource: descriptionMarkdownSource,
      },
      licenses: legacyPackage.licenses.map((license) =>
        migrateLicense(legacyPackage.id, license.type, license, report),
      ),
      ...(migratedImages !== undefined ? { images: migratedImages } : {}),
    };

    const install = migrateInstall(legacyPackage, legacyIdToNewId, report);
    const versions = migrateVersions(legacyPackage);
    const updateCheck = migrateSparseUpdateCheck(
      packageRoot,
      meta,
      content,
      install,
      versions,
      searchByLegacyId.get(legacyPackage.id),
      report,
    );

    validateGeneratedFile(resolve(packageRoot, "meta.json"), meta, sourceMetaSchema, report);
    validateGeneratedFile(
      resolve(packageRoot, "content", "ja.json"),
      content,
      sourceContentSchema,
      report,
    );
    validateGeneratedFile(
      resolve(packageRoot, "install.json"),
      install,
      sourceInstallSchema,
      report,
    );
    validateGeneratedFile(
      resolve(packageRoot, "versions.json"),
      versions,
      sourceVersionsSchema,
      report,
    );
    if (updateCheck !== undefined) {
      validateGeneratedFile(
        resolve(packageRoot, "update-check.json"),
        updateCheck,
        sourceUpdateCheckSchema,
        report,
      );
    }

    writes.push(
      { type: "json", path: resolve(packageRoot, "meta.json"), value: meta },
      { type: "json", path: resolve(packageRoot, "content", "ja.json"), value: content },
      { type: "json", path: resolve(packageRoot, "install.json"), value: install },
      { type: "json", path: resolve(packageRoot, "versions.json"), value: versions },
    );

    if (updateCheck !== undefined) {
      writes.push({
        type: "json",
        path: resolve(packageRoot, "update-check.json"),
        value: updateCheck,
      });
    }
  }

  if (report.hasIssues()) {
    removeDirectory(stagingRoot);
    report.printSummary();
    process.exitCode = 1;
    return;
  }

  for (const write of writes) {
    if (write.type === "json") {
      writeJsonFile(write.path, write.value);
      continue;
    }

    if (write.type === "text") {
      writeTextFile(write.path, write.content);
      continue;
    }

    copyFileIntoRepoOutput(write.from, write.to);
  }

  replaceDirectory(stagingRoot, outputRoot);
  writeJsonFile(popularityPath, popularity);
  console.log(`OK migrated catalog source packages: ${index.length} package(s) -> ${outputRoot}`);
  console.log(`OK migrated catalog popularity -> ${popularityPath}`);
  const updateCheckWrites = writes.filter(
    (write): write is Extract<PendingWrite, { type: "json" }> =>
      write.type === "json" && write.path.endsWith("update-check.json"),
  );
  const disabledCount = updateCheckWrites.filter(
    (write) => (write.value as { enabled?: unknown }).enabled === false,
  ).length;
  const exceptionCount = updateCheckWrites.length - disabledCount;
  console.log(
    `update-check: inferred=${search.length - exceptionCount}, exceptions=${exceptionCount}, disabled=${disabledCount}`,
  );
}

function migratePopularity(
  index: LegacyIndex,
  legacyIdToNewId: ReadonlyMap<string, string>,
  popularityPath: string,
  report: AuditReport,
): CatalogPopularity {
  const packages: CatalogPopularity["packages"] = {};

  for (const legacyPackage of index) {
    const id = legacyIdToNewId.get(legacyPackage.id);
    if (id === undefined) {
      continue;
    }
    if (legacyPackage.popularity === undefined || legacyPackage.trend === undefined) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: legacyPackage.id,
        jsonPath: "popularity/trend",
        rule: "popularity.present",
        message: "Both popularity and trend are required to migrate catalog popularity data.",
      });
      continue;
    }
    packages[id] = {
      popularity: legacyPackage.popularity,
      trend: legacyPackage.trend,
    };
  }

  const popularity: CatalogPopularity = { schemaVersion: CATALOG_SCHEMA_VERSION, packages };
  const parsed = catalogPopularitySchema.safeParse(popularity);
  if (!parsed.success) {
    report.addZodError(popularityPath, parsed.error);
  }
  return popularity;
}

function loadWithSchema<T>(path: string, schema: ZodType<T>, report: AuditReport): T | null {
  let raw: unknown;
  try {
    raw = readJsonFile(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.add({
      severity: "error",
      file: path,
      jsonPath: "<root>",
      rule: "read-json",
      message,
    });
    return null;
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    report.addZodError(path, parsed.error);
    return null;
  }

  return parsed.data;
}

function buildLegacyIdMap(index: LegacyIndex, report: AuditReport): Map<string, string> {
  const mapping = new Map<string, string>();
  const seenNewIds = new Map<string, string>();

  for (const legacyPackage of index) {
    const candidate = deriveIdCandidate(legacyPackage.id);
    if (!candidate.ok) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: legacyPackage.id,
        jsonPath: "id",
        rule: "id.mapped",
        message: candidate.reason,
      });
      continue;
    }

    const existingLegacyId = seenNewIds.get(candidate.candidate);
    if (existingLegacyId !== undefined) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: legacyPackage.id,
        jsonPath: "id",
        rule: "id.unique-after-migration",
        message: `Generated source id "${candidate.candidate}" collides with ${existingLegacyId}.`,
      });
      continue;
    }

    seenNewIds.set(candidate.candidate, legacyPackage.id);
    mapping.set(legacyPackage.id, candidate.candidate);
  }

  return mapping;
}

function migrateDescription(
  repoRoot: string,
  packageRoot: string,
  legacyPackage: LegacyPackage,
  writes: PendingWrite[],
  report: AuditReport,
): string {
  if (/^https?:\/\//.test(legacyPackage.description)) {
    return legacyPackage.description;
  }

  const targetPath = resolve(packageRoot, "docs", "ja.md");

  if (legacyPackage.description.startsWith("./") || legacyPackage.description.startsWith("../")) {
    const sourcePath = resolveLegacyInputReference(repoRoot, legacyPackage.description);
    if (!existsSync(sourcePath)) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: legacyPackage.id,
        jsonPath: "description",
        rule: "description.source-exists",
        message: `Referenced description file does not exist: ${legacyPackage.description}`,
      });
      return "./docs/ja.md";
    }

    writes.push({
      type: "text",
      path: targetPath,
      content: normalizeTrailingNewline(readFileSync(sourcePath, "utf8")),
    });
    return "./docs/ja.md";
  }

  writes.push({
    type: "text",
    path: targetPath,
    content: normalizeTrailingNewline(legacyPackage.description),
  });
  return "./docs/ja.md";
}

function migrateImages(
  repoRoot: string,
  packageRoot: string,
  legacyPackage: LegacyPackage,
  writes: PendingWrite[],
  report: AuditReport,
): SourceContent["images"] | undefined {
  const thumbnails = legacyPackage.images.flatMap((image) =>
    image.thumbnail ? [image.thumbnail] : [],
  );
  const detailImages = legacyPackage.images.flatMap((image) => image.infoImg ?? []);

  if (thumbnails.length === 0 && detailImages.length === 0) {
    return undefined;
  }

  const migrated: NonNullable<SourceContent["images"]> = {};

  if (thumbnails.length > 0) {
    if (thumbnails.length > 1) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: legacyPackage.id,
        jsonPath: "images[].thumbnail",
        rule: "images.thumbnail.single",
        message: `Expected at most one thumbnail, found ${thumbnails.length}.`,
      });
    }
    const thumbnail = thumbnails[0];
    const extension = extname(thumbnail) || ".png";
    const targetRelativePath = `./images/thumbnail${extension}`;
    queueAssetCopy(
      repoRoot,
      thumbnail,
      resolve(packageRoot, "images", `thumbnail${extension}`),
      legacyPackage.id,
      report,
      writes,
    );
    migrated.thumbnail = targetRelativePath;
  }

  if (detailImages.length > 0) {
    migrated.detailImages = detailImages.map((detailImage, index) => {
      const extension = extname(detailImage) || ".png";
      const targetFileName = `details${index + 1}${extension}`;
      queueAssetCopy(
        repoRoot,
        detailImage,
        resolve(packageRoot, "images", targetFileName),
        legacyPackage.id,
        report,
        writes,
      );
      return `./images/${targetFileName}`;
    });
  }

  return migrated;
}

function queueAssetCopy(
  repoRoot: string,
  relativeSourcePath: string,
  targetPath: string,
  packageId: string,
  report: AuditReport,
  writes: PendingWrite[],
): void {
  const sourcePath = resolveLegacyInputReference(repoRoot, relativeSourcePath);
  if (!existsSync(sourcePath)) {
    report.add({
      severity: "error",
      file: LEGACY_INPUT_PATHS.index,
      packageId,
      jsonPath: "images",
      rule: "images.source-exists",
      message: `Referenced asset does not exist: ${relativeSourcePath}`,
    });
    return;
  }

  writes.push({
    type: "copy",
    from: sourcePath,
    to: targetPath,
  });
}

function migrateLicense(
  packageId: string,
  legacyLicenseType: string,
  legacyLicense: LegacyPackage["licenses"][number],
  report: AuditReport,
): SourceContent["licenses"][number] {
  const rule = LEGACY_LICENSE_RULES[legacyLicenseType as keyof typeof LEGACY_LICENSE_RULES];
  if (rule === undefined) {
    report.add({
      severity: "error",
      file: LEGACY_INPUT_PATHS.index,
      packageId,
      jsonPath: "licenses",
      rule: "license.mapped",
      message: `Missing license normalization rule for "${legacyLicenseType}".`,
    });
    return { type: "unknown", name: legacyLicenseType };
  }

  const licenseBody =
    legacyLicense.licenseBody !== null && legacyLicense.licenseBody.trim().length > 0
      ? legacyLicense.licenseBody
      : undefined;
  const copyrights =
    licenseBody === undefined
      ? legacyLicense.copyrights.filter(
          (copyright) => copyright.years.trim().length > 0 && copyright.holder.trim().length > 0,
        )
      : [];

  return {
    type: rule.type,
    ...("name" in rule ? { name: rule.name } : {}),
    ...(licenseBody !== undefined ? { licenseBody } : {}),
    ...(copyrights.length > 0 ? { copyrights } : {}),
  };
}

function migrateInstall(
  legacyPackage: LegacyPackage,
  legacyIdToNewId: Map<string, string>,
  report: AuditReport,
): SourceInstall {
  const requires = legacyPackage.dependencies.map((dependencyId) => {
    const newId = legacyIdToNewId.get(dependencyId);
    if (newId === undefined) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: legacyPackage.id,
        jsonPath: "dependencies",
        rule: "dependency.mapped",
        message: `Missing source id mapping for dependency "${dependencyId}".`,
      });
      return dependencyId;
    }
    return newId;
  });

  return {
    ...(requires.length > 0 ? { relations: { requires } } : {}),
    installation: {
      source: migrateInstallerSource(legacyPackage),
      installSteps: legacyPackage.installer.install.map(migrateInstallerAction),
      uninstallSteps: legacyPackage.installer.uninstall.map((action) =>
        migrateUninstallerAction(legacyPackage.id, action, report),
      ),
    },
  };
}

function migrateInstallerSource(
  legacyPackage: LegacyPackage,
): SourceInstall["installation"]["source"] {
  const source = legacyPackage.installer.source;

  if (source.direct !== undefined) {
    return { type: LEGACY_INSTALLER_SOURCE_TO_NEW_TYPE.direct, url: source.direct };
  }

  if (source.booth !== undefined) {
    return { type: LEGACY_INSTALLER_SOURCE_TO_NEW_TYPE.booth, url: source.booth };
  }

  if (source.github !== undefined) {
    return {
      type: LEGACY_INSTALLER_SOURCE_TO_NEW_TYPE.github,
      owner: source.github.owner,
      repo: source.github.repo,
      pattern: source.github.pattern,
    };
  }

  if (source.GoogleDrive !== undefined) {
    return {
      type: LEGACY_INSTALLER_SOURCE_TO_NEW_TYPE.GoogleDrive,
      id: source.GoogleDrive.id,
    };
  }

  throw new Error(`Installer source is missing for ${legacyPackage.id}.`);
}

function migrateInstallerAction(
  action: LegacyPackage["installer"]["install"][number],
): SourceInstall["installation"]["installSteps"][number] {
  switch (action.action) {
    case "download":
      return { action: "download" };
    case "extract":
    case "extract_sfx":
      return {
        action: LEGACY_ACTION_TO_NEW_ACTION[action.action],
        ...(action.from !== undefined ? { from: action.from } : {}),
        ...(action.to !== undefined ? { to: action.to } : {}),
      };
    case "copy":
      return { action: "copy", from: action.from, to: action.to };
    case "delete":
      return { action: "delete", path: action.path };
    case "run":
      return {
        action: "run",
        path: action.path,
        args: action.args,
        ...(action.elevate !== undefined ? { elevate: action.elevate } : {}),
      };
    case "run_auo_setup":
      return { action: "runAuoSetup", path: action.path };
  }
}

function migrateUninstallerAction(
  packageId: string,
  action: LegacyPackage["installer"]["uninstall"][number],
  report: AuditReport,
): SourceInstall["installation"]["uninstallSteps"][number] {
  if (action.action === "delete") {
    return { action: "delete", path: action.path };
  }
  if (action.action === "run") {
    return {
      action: "run",
      path: action.path,
      args: action.args,
      ...(action.elevate !== undefined ? { elevate: action.elevate } : {}),
    };
  }

  report.add({
    severity: "error",
    file: LEGACY_INPUT_PATHS.index,
    packageId,
    jsonPath: "installer.uninstall[].action",
    rule: "uninstall.action.supported",
    message: `Action "${action.action}" is not allowed in uninstallSteps.`,
  });
  return { action: "delete", path: "<invalid>" };
}

function migrateVersions(legacyPackage: LegacyPackage): SourceVersions {
  return {
    versions: legacyPackage.version.map((version) => ({
      version: version.version,
      releaseDate: version.release_date,
      files: version.file.map((file) => ({
        path: file.path,
        xxh128: file.XXH3_128,
      })),
    })),
  };
}

function migrateSparseUpdateCheck(
  packageRoot: string,
  meta: SourceMeta,
  content: SourceContent,
  install: SourceInstall,
  versions: SourceVersions,
  searchEntry: LegacySearchEntry | undefined,
  report: AuditReport,
): SourceUpdateCheck | undefined {
  const basePackage: LoadedSourcePackage = {
    packageRoot,
    meta,
    contents: new Map([["ja", content]]),
    install,
    versions,
  };

  if (searchEntry === undefined) {
    return install.installation.source.type === "githubRelease" ? { enabled: false } : undefined;
  }

  const legacySetting = migrateUpdateCheck(searchEntry, report);
  const explicitPackage = { ...basePackage, updateCheck: legacySetting };
  const expected = resolveUpdateCheck(explicitPackage);

  try {
    const inferred = resolveUpdateCheck(basePackage);
    if (inferred !== null && isDeepStrictEqual(inferred, expected)) return undefined;
  } catch {
    // A non-inferable legacy setting remains as an explicit exception below.
  }

  return legacySetting;
}

function migrateUpdateCheck(
  searchEntry: LegacySearchEntry | undefined,
  report: AuditReport,
): SourceUpdateCheck | undefined {
  if (searchEntry === undefined) {
    return undefined;
  }

  return {
    enabled: true,
    source: migrateUpdateCheckSource(searchEntry, report),
    hashTargets: searchEntry.checkType["hash-calc"].map((target) => ({
      ...(target.extract !== undefined
        ? { archiveFormat: normalizeArchiveFormat(searchEntry.id, target.extract, report) }
        : {}),
      sourcePaths: target.paths,
      recordPaths: target.recordPaths,
    })),
  };
}

function normalizeArchiveFormat(
  packageId: string,
  format: string,
  report: AuditReport,
): "zip" | "7zip" {
  if (format === "zip" || format === "7zip") {
    return format;
  }
  report.add({
    severity: "error",
    file: LEGACY_INPUT_PATHS.search,
    packageId,
    jsonPath: "checkType.hash-calc[].extract",
    rule: "update-check.archive-format.supported",
    message: `Unsupported archive format "${format}".`,
  });
  return "zip";
}

function migrateUpdateCheckSource(
  searchEntry: LegacySearchEntry,
  report: AuditReport,
): NonNullable<Extract<SourceUpdateCheck, { enabled: true }>["source"]> {
  if (searchEntry.checkType.type === "GitHub") {
    const parts = searchEntry.checkType.repo.split("/");
    const [owner, repo] = parts;
    if (parts.length !== 2 || !owner || !repo) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.search,
        packageId: searchEntry.id,
        jsonPath: "checkType.repo",
        rule: "update-check.github-repo",
        message: `Expected owner/repo format but got "${searchEntry.checkType.repo}".`,
      });
      return {
        type: "githubRelease",
        owner: searchEntry.checkType.repo,
        repo: searchEntry.checkType.repo,
        pattern: searchEntry.checkType.regex,
      };
    }

    return {
      type: "githubRelease",
      owner,
      repo,
      pattern: searchEntry.checkType.regex,
    };
  }

  return {
    type: "webPage",
    url: searchEntry.checkType.url,
    assetPattern: searchEntry.checkType.regex,
    versionExtractPattern: searchEntry.checkType.version_extract,
    downloadUrlTemplate: searchEntry.checkType.directTemplate,
  };
}

function validateGeneratedFile<T>(
  path: string,
  value: unknown,
  schema: ZodType<T>,
  report: AuditReport,
): void {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    report.addZodError(path, parsed.error);
  }
}

function normalizeTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
