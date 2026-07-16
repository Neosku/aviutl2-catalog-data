// 旧schemaの検証
import process from "node:process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type ZodType } from "zod";
import {
  legacyDateSchema,
  legacyIndexSchema,
  legacySearchSchema,
  type LegacyDate,
  type LegacyIndex,
  type LegacySearch,
} from "./legacy-schema.ts";
import { LEGACY_INPUT_PATHS, resolveLegacyInputReference } from "./input-paths.ts";
import { readJsonFile } from "../shared/fs-utils.ts";
import { AuditReport } from "../shared/validation-report.ts";
import {
  deriveIdCandidate,
  LEGACY_ACTION_TO_NEW_ACTION,
  LEGACY_HASH_EXTRACT_FORMATS,
  LEGACY_INSTALLER_SOURCE_TO_NEW_TYPE,
  LEGACY_LICENSE_RULES,
  LEGACY_SEARCH_CHECK_TYPE_TO_NEW_SOURCE,
  LEGACY_TYPE_TO_PACKAGE_TYPE,
} from "./migration-rules.ts";

type LoadedLegacyData = {
  index: LegacyIndex;
  search: LegacySearch;
  date: LegacyDate;
};

function main(): void {
  const repoRoot = process.cwd();
  const report = new AuditReport();
  const legacyData = loadLegacyData(repoRoot, report);

  if (legacyData === null) {
    report.printSummary();
    process.exit(1);
  }

  runIndexChecks(repoRoot, legacyData.index, report);
  runSearchChecks(legacyData.index, legacyData.search, report);
  runDateChecks(legacyData.index, legacyData.date, report);
  runCrossChecks(legacyData.index, legacyData.search, legacyData.date, report);
  runIdMappingChecks(legacyData.index, report);

  if (report.hasIssues()) {
    report.printSummary();
    process.exit(1);
  }

  console.log(
    `OK catalog legacy audit passed (index=${legacyData.index.length}, search=${legacyData.search.length}, date=${legacyData.date.length})`,
  );
}

function loadLegacyData(repoRoot: string, report: AuditReport): LoadedLegacyData | null {
  const index = loadJsonWithSchema(
    resolve(repoRoot, LEGACY_INPUT_PATHS.index),
    legacyIndexSchema,
    report,
  );
  const search = loadJsonWithSchema(
    resolve(repoRoot, LEGACY_INPUT_PATHS.search),
    legacySearchSchema,
    report,
  );
  const date = loadJsonWithSchema(
    resolve(repoRoot, LEGACY_INPUT_PATHS.date),
    legacyDateSchema,
    report,
  );

  if (index === null || search === null || date === null) {
    return null;
  }

  return { index, search, date };
}

function loadJsonWithSchema<T>(path: string, schema: ZodType<T>, report: AuditReport): T | null {
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

function runIndexChecks(repoRoot: string, index: LegacyIndex, report: AuditReport): void {
  const idToIndexes = new Map<string, number[]>();

  for (const [packageIndex, pkg] of index.entries()) {
    const indexes = idToIndexes.get(pkg.id) ?? [];
    indexes.push(packageIndex);
    idToIndexes.set(pkg.id, indexes);

    if (pkg.version.length === 0) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: pkg.id,
        jsonPath: `[${packageIndex}].version`,
        rule: "version.non-empty",
        message: "version must contain at least one entry.",
      });
    } else {
      const latestVersion = pkg.version[pkg.version.length - 1]?.version;
      if (latestVersion !== pkg["latest-version"]) {
        report.add({
          severity: "error",
          file: LEGACY_INPUT_PATHS.index,
          packageId: pkg.id,
          jsonPath: `[${packageIndex}].latest-version`,
          rule: "latest-version.matches-last-version-entry",
          message: `latest-version (${pkg["latest-version"]}) does not match the last version entry (${latestVersion}).`,
        });
      }
    }

    if (!(pkg.type in LEGACY_TYPE_TO_PACKAGE_TYPE)) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: pkg.id,
        jsonPath: `[${packageIndex}].type`,
        rule: "type.normalization",
        message: `No packageType normalization rule is defined for legacy type "${pkg.type}".`,
      });
    }

    for (const [licenseIndex, license] of pkg.licenses.entries()) {
      if (!(license.type in LEGACY_LICENSE_RULES)) {
        report.add({
          severity: "error",
          file: LEGACY_INPUT_PATHS.index,
          packageId: pkg.id,
          jsonPath: `[${packageIndex}].licenses[${licenseIndex}].type`,
          rule: "license.normalization",
          message: `No license normalization rule is defined for "${license.type}".`,
        });
      }
    }

    const sourceKeys = Object.keys(pkg.installer.source);
    const sourceKey = sourceKeys[0];
    if (sourceKey === undefined || !(sourceKey in LEGACY_INSTALLER_SOURCE_TO_NEW_TYPE)) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: pkg.id,
        jsonPath: `[${packageIndex}].installer.source`,
        rule: "installer.source.normalization",
        message: `No installation.source.type normalization rule is defined for source "${sourceKey ?? "<missing>"}".`,
      });
    }

    const actionLists = [
      { key: "install", actions: pkg.installer.install },
      { key: "uninstall", actions: pkg.installer.uninstall },
    ] as const;

    for (const actionList of actionLists) {
      for (const [actionIndex, action] of actionList.actions.entries()) {
        if (!(action.action in LEGACY_ACTION_TO_NEW_ACTION)) {
          report.add({
            severity: "error",
            file: LEGACY_INPUT_PATHS.index,
            packageId: pkg.id,
            jsonPath: `[${packageIndex}].installer.${actionList.key}[${actionIndex}].action`,
            rule: "installer.action.normalization",
            message: `No install step normalization rule is defined for action "${action.action}".`,
          });
        }
      }
    }

    if (!isHttpUrl(pkg.description)) {
      if (
        looksLikeLocalPath(pkg.description) &&
        !existsSync(resolveLegacyInputReference(repoRoot, pkg.description))
      ) {
        report.add({
          severity: "error",
          file: LEGACY_INPUT_PATHS.index,
          packageId: pkg.id,
          jsonPath: `[${packageIndex}].description`,
          rule: "description.path.exists",
          message: `Referenced description file does not exist: ${pkg.description}`,
        });
      }
    }

    for (const [imageIndex, image] of pkg.images.entries()) {
      if (
        image.thumbnail !== undefined &&
        !existsSync(resolveLegacyInputReference(repoRoot, image.thumbnail))
      ) {
        report.add({
          severity: "error",
          file: LEGACY_INPUT_PATHS.index,
          packageId: pkg.id,
          jsonPath: `[${packageIndex}].images[${imageIndex}].thumbnail`,
          rule: "images.thumbnail.exists",
          message: `Referenced thumbnail image does not exist: ${image.thumbnail}`,
        });
      }

      for (const [infoImageIndex, infoImage] of (image.infoImg ?? []).entries()) {
        if (!existsSync(resolveLegacyInputReference(repoRoot, infoImage))) {
          report.add({
            severity: "error",
            file: LEGACY_INPUT_PATHS.index,
            packageId: pkg.id,
            jsonPath: `[${packageIndex}].images[${imageIndex}].infoImg[${infoImageIndex}]`,
            rule: "images.detail.exists",
            message: `Referenced detail image does not exist: ${infoImage}`,
          });
        }
      }
    }
  }

  for (const [id, indexes] of idToIndexes.entries()) {
    if (indexes.length < 2) {
      continue;
    }

    for (const index of indexes) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.index,
        packageId: id,
        jsonPath: `[${index}].id`,
        rule: "id.unique",
        message: `Duplicate id detected: ${id}`,
      });
    }
  }
}

function runSearchChecks(index: LegacyIndex, search: LegacySearch, report: AuditReport): void {
  const indexById = new Map(index.map((pkg) => [pkg.id, pkg]));
  const searchIdToIndexes = new Map<string, number[]>();

  for (const [searchIndex, entry] of search.entries()) {
    const indexes = searchIdToIndexes.get(entry.id) ?? [];
    indexes.push(searchIndex);
    searchIdToIndexes.set(entry.id, indexes);

    if (!(entry.checkType.type in LEGACY_SEARCH_CHECK_TYPE_TO_NEW_SOURCE)) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.search,
        packageId: entry.id,
        jsonPath: `[${searchIndex}].checkType.type`,
        rule: "update-check.source.normalization",
        message: `No update-check source normalization rule is defined for "${entry.checkType.type}".`,
      });
    }

    for (const [hashIndex, hashTarget] of entry.checkType["hash-calc"].entries()) {
      if (
        hashTarget.extract !== undefined &&
        !LEGACY_HASH_EXTRACT_FORMATS.has(hashTarget.extract)
      ) {
        report.add({
          severity: "error",
          file: LEGACY_INPUT_PATHS.search,
          packageId: entry.id,
          jsonPath: `[${searchIndex}].checkType.hash-calc[${hashIndex}].extract`,
          rule: "update-check.hash-target.archive-format",
          message: `Unsupported hash-calc extract format "${hashTarget.extract}".`,
        });
      }
    }

    const indexEntry = indexById.get(entry.id);
    if (indexEntry !== undefined && indexEntry["latest-version"] !== entry["latest-version"]) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.search,
        packageId: entry.id,
        jsonPath: `[${searchIndex}].latest-version`,
        rule: "search.latest-version.matches-index",
        message: `search.json latest-version (${entry["latest-version"]}) does not match index.json (${indexEntry["latest-version"]}).`,
      });
    }
  }

  for (const [id, indexes] of searchIdToIndexes.entries()) {
    if (indexes.length < 2) {
      continue;
    }

    for (const index of indexes) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.search,
        packageId: id,
        jsonPath: `[${index}].id`,
        rule: "search.id.unique",
        message: `Duplicate id detected in search.json: ${id}`,
      });
    }
  }
}

function runDateChecks(index: LegacyIndex, dateEntries: LegacyDate, report: AuditReport): void {
  const indexIds = new Set(index.map((pkg) => pkg.id));
  const dateIdToIndexes = new Map<string, number[]>();

  for (const [dateIndex, entry] of dateEntries.entries()) {
    const indexes = dateIdToIndexes.get(entry.id) ?? [];
    indexes.push(dateIndex);
    dateIdToIndexes.set(entry.id, indexes);

    if (!indexIds.has(entry.id)) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.date,
        packageId: entry.id,
        jsonPath: `[${dateIndex}].id`,
        rule: "date.references-existing-package",
        message: "date.json contains an id that does not exist in index.json.",
      });
    }
  }

  for (const [id, indexes] of dateIdToIndexes.entries()) {
    if (indexes.length < 2) {
      continue;
    }

    for (const index of indexes) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.date,
        packageId: id,
        jsonPath: `[${index}].id`,
        rule: "date.id.unique",
        message: `Duplicate id detected in date.json: ${id}`,
      });
    }
  }
}

function runCrossChecks(
  index: LegacyIndex,
  search: LegacySearch,
  dateEntries: LegacyDate,
  report: AuditReport,
): void {
  const dateIds = new Set(dateEntries.map((entry) => entry.id));
  const indexIds = new Set(index.map((pkg) => pkg.id));

  for (const pkg of index) {
    if (!dateIds.has(pkg.id)) {
      report.add({
        severity: "manual",
        file: LEGACY_INPUT_PATHS.date,
        packageId: pkg.id,
        jsonPath: "<root>",
        rule: "date.coverage",
        message:
          "Package exists in index.json but not in date.json. addedAt must be sourced before migration can proceed.",
      });
    }
  }

  for (const entry of search) {
    if (!indexIds.has(entry.id)) {
      report.add({
        severity: "error",
        file: LEGACY_INPUT_PATHS.search,
        packageId: entry.id,
        jsonPath: "<root>",
        rule: "search.references-existing-package",
        message: "search.json contains an id that does not exist in index.json.",
      });
    }
  }
}

function runIdMappingChecks(index: LegacyIndex, report: AuditReport): void {
  const candidateToLegacyIds = new Map<string, string[]>();

  for (const pkg of index) {
    const candidate = deriveIdCandidate(pkg.id);
    if (!candidate.ok) {
      report.add({
        severity: "manual",
        file: LEGACY_INPUT_PATHS.index,
        packageId: pkg.id,
        jsonPath: "id",
        rule: "id.manual-override",
        message: candidate.reason,
      });
      continue;
    }

    const legacyIds = candidateToLegacyIds.get(candidate.candidate) ?? [];
    legacyIds.push(pkg.id);
    candidateToLegacyIds.set(candidate.candidate, legacyIds);
  }

  for (const [candidate, legacyIds] of candidateToLegacyIds.entries()) {
    if (legacyIds.length < 2) {
      continue;
    }

    for (const legacyId of legacyIds) {
      report.add({
        severity: "manual",
        file: LEGACY_INPUT_PATHS.index,
        packageId: legacyId,
        jsonPath: "id",
        rule: "id.candidate-collision",
        message: `Generated source id candidate "${candidate}" collides with: ${legacyIds.join(", ")}`,
      });
    }
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

function looksLikeLocalPath(value: string): boolean {
  return value.startsWith("./") || value.startsWith("../");
}

main();
