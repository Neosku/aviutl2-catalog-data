// 正本データの検証
import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import {
  catalogPopularitySchema,
  SOURCE_LOCALE,
  SUPPORTED_LOCALES,
} from "../../catalog-schema/definitions.ts";
import { AuditReport } from "../shared/validation-report.ts";
import { readJsonFile } from "../shared/fs-utils.ts";
import { resolveUpdateCheck } from "../shared/update-check.ts";
import {
  listSourcePackageRoots,
  loadSourcePackage,
  resolveLocalizedLocalReference,
  SourceFileError,
  type LoadedSourcePackage,
} from "./loader.ts";
import { sourcePopularityPath } from "./popularity.ts";

const RELATION_LIST_KEYS = ["requires", "recommends", "conflicts", "similar", "replaces"] as const;
const ALLOWED_PLACEHOLDERS = new Set([
  "tmp",
  "appDir",
  "pluginsDir",
  "scriptsDir",
  "dataDir",
  "download",
]);

function main(): void {
  const packagesRoot = resolve(process.cwd(), "packages");
  const report = new AuditReport();

  if (!existsSync(packagesRoot)) {
    report.add({
      severity: "error",
      file: packagesRoot,
      jsonPath: "<root>",
      rule: "packages.exists",
      message: "packages/ does not exist. Run catalog:migration first.",
    });
    finish(report, 0);
    return;
  }

  const packageRoots = listSourcePackageRoots(packagesRoot);
  const packages = packageRoots
    .map((packageRoot) => loadPackageForValidation(packageRoot, report))
    .filter((pkg): pkg is LoadedSourcePackage => pkg !== null);

  validatePackageIdentity(packagesRoot, packages, report);
  const allIds = new Set(packages.map((pkg) => pkg.meta.id));
  validateSourcePopularity(process.cwd(), allIds, report);
  for (const pkg of packages) {
    validatePackage(pkg, allIds, report);
  }

  finish(report, packages.length);
}

function validateSourcePopularity(
  repoRoot: string,
  packageIds: ReadonlySet<string>,
  report: AuditReport,
): void {
  const path = sourcePopularityPath(repoRoot);
  if (!existsSync(path)) {
    report.add({
      severity: "error",
      file: path,
      jsonPath: "<root>",
      rule: "source-popularity.exists",
      message: "Required source popularity file is missing.",
    });
    return;
  }

  let raw: unknown;
  try {
    raw = readJsonFile(path);
  } catch (error) {
    report.add({
      severity: "error",
      file: path,
      jsonPath: "<root>",
      rule: "source-popularity.read-json",
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const parsed = catalogPopularitySchema.safeParse(raw);
  if (!parsed.success) {
    report.addZodError(path, parsed.error);
    return;
  }

  const popularityIds = Object.keys(parsed.data.packages).sort();
  const expectedIds = [...packageIds].sort();
  if (
    popularityIds.length !== expectedIds.length ||
    popularityIds.some((id, index) => id !== expectedIds[index])
  ) {
    report.add({
      severity: "error",
      file: path,
      jsonPath: "packages",
      rule: "source-popularity.ids",
      message: "Package id set does not match source packages.",
    });
  }
}

function loadPackageForValidation(
  packageRoot: string,
  report: AuditReport,
): LoadedSourcePackage | null {
  const requiredPaths = [
    join(packageRoot, "meta.json"),
    join(packageRoot, "content"),
    join(packageRoot, "install.json"),
    join(packageRoot, "versions.json"),
  ];
  const missingPaths = requiredPaths.filter((path) => !existsSync(path));
  for (const path of missingPaths) {
    report.add({
      severity: "error",
      file: path,
      jsonPath: "<root>",
      rule: "source.required-file",
      message: "Required source file is missing.",
    });
  }
  if (missingPaths.length > 0) {
    return null;
  }

  try {
    return loadSourcePackage(packageRoot);
  } catch (error) {
    if (error instanceof SourceFileError && error.zodError !== undefined) {
      report.addZodError(error.file, error.zodError);
    } else {
      report.add({
        severity: "error",
        file: error instanceof SourceFileError ? error.file : packageRoot,
        jsonPath: "<root>",
        rule: "source.read-json",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

function validatePackageIdentity(
  packagesRoot: string,
  packages: LoadedSourcePackage[],
  report: AuditReport,
): void {
  const ids = new Map<string, LoadedSourcePackage[]>();
  const legacyIds = new Map<string, LoadedSourcePackage[]>();

  for (const pkg of packages) {
    addToGroup(ids, pkg.meta.id, pkg);
    addToGroup(legacyIds, pkg.meta.legacyId, pkg);

    const [namespace, slug] = pkg.meta.id.split(".");
    const expectedRoot = resolve(packagesRoot, namespace, slug);
    if (expectedRoot !== pkg.packageRoot) {
      report.add({
        severity: "error",
        file: pkg.packageRoot,
        packageId: pkg.meta.id,
        jsonPath: "id",
        rule: "meta.id.matches-path",
        message: `Expected ${relative(packagesRoot, expectedRoot)}, found ${relative(packagesRoot, pkg.packageRoot)}.`,
      });
    }
  }

  reportDuplicates(ids, "id", "meta.id.unique", report);
  reportDuplicates(legacyIds, "legacyId", "meta.legacy-id.unique", report);
}

function validatePackage(
  pkg: LoadedSourcePackage,
  allIds: ReadonlySet<string>,
  report: AuditReport,
): void {
  if (!pkg.contents.has(SOURCE_LOCALE)) {
    report.add({
      severity: "error",
      file: join(pkg.packageRoot, "content"),
      packageId: pkg.meta.id,
      jsonPath: "<root>",
      rule: "content.fallback-locale.exists",
      message: `Required source locale ${SOURCE_LOCALE}.json is missing.`,
    });
  }

  for (const [locale, content] of pkg.contents) {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
      report.add({
        severity: "error",
        file: join(pkg.packageRoot, "content", `${locale}.json`),
        packageId: pkg.meta.id,
        jsonPath: "<root>",
        rule: "content.locale.supported",
        message: `Unsupported locale "${locale}".`,
      });
    }

    if (pkg.meta.packageType === "custom" && content.typeLabel === undefined) {
      report.add({
        severity: "error",
        file: join(pkg.packageRoot, "content", `${locale}.json`),
        packageId: pkg.meta.id,
        jsonPath: "typeLabel",
        rule: "content.type-label.custom-required",
        message: "typeLabel is required when packageType is custom.",
      });
    } else if (pkg.meta.packageType !== "custom" && content.typeLabel !== undefined) {
      report.add({
        severity: "error",
        file: join(pkg.packageRoot, "content", `${locale}.json`),
        packageId: pkg.meta.id,
        jsonPath: "typeLabel",
        rule: "content.type-label.custom-only",
        message: "typeLabel must only be present when packageType is custom.",
      });
    }

    const references = [
      ["description.markdownSource", content.description.markdownSource],
      ["changelog.markdownSource", content.changelog?.markdownSource],
      ["notice.markdownSource", content.notice?.markdownSource],
      ["images.thumbnail", content.images?.thumbnail],
      ...(content.images?.detailImages ?? []).map(
        (path, index) => [`images.detailImages[${index}]`, path] as const,
      ),
    ] as const;
    for (const [jsonPath, reference] of references) {
      if (reference !== undefined) {
        validateReference(pkg, locale, jsonPath, reference, report);
      }
    }
  }

  validateRelations(pkg, allIds, report);
  validateVersions(pkg, report);
  validateInstallSteps(pkg, report);
  validateUpdateCheck(pkg, report);
}

function validateReference(
  pkg: LoadedSourcePackage,
  locale: string,
  jsonPath: string,
  reference: string,
  report: AuditReport,
): void {
  if (!reference.startsWith("./")) {
    return;
  }

  const resolvedReference = resolveLocalizedLocalReference(pkg.packageRoot, locale, reference);
  const fullPath = resolve(pkg.packageRoot, resolvedReference);
  const relativePath = relative(pkg.packageRoot, fullPath);
  if (
    isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    report.add({
      severity: "error",
      file: join(pkg.packageRoot, "content", `${locale}.json`),
      packageId: pkg.meta.id,
      jsonPath,
      rule: "source.local-reference.contained",
      message: `Local reference escapes the package directory: ${reference}`,
    });
    return;
  }

  if (!existsSync(fullPath)) {
    report.add({
      severity: "error",
      file: join(pkg.packageRoot, "content", `${locale}.json`),
      packageId: pkg.meta.id,
      jsonPath,
      rule: "source.local-reference.exists",
      message: `Referenced local file does not exist: ${reference}`,
    });
  }
}

function validateRelations(
  pkg: LoadedSourcePackage,
  allIds: ReadonlySet<string>,
  report: AuditReport,
): void {
  const relations = pkg.install.relations;
  if (relations === undefined) {
    return;
  }

  for (const key of RELATION_LIST_KEYS) {
    for (const [index, targetId] of (relations[key] ?? []).entries()) {
      validateRelationTarget(pkg, allIds, `relations.${key}[${index}]`, targetId, report);
    }
  }
  if (relations.forkOf !== undefined) {
    validateRelationTarget(pkg, allIds, "relations.forkOf", relations.forkOf, report);
  }
}

function validateRelationTarget(
  pkg: LoadedSourcePackage,
  allIds: ReadonlySet<string>,
  jsonPath: string,
  targetId: string,
  report: AuditReport,
): void {
  if (!allIds.has(targetId)) {
    report.add({
      severity: "error",
      file: join(pkg.packageRoot, "install.json"),
      packageId: pkg.meta.id,
      jsonPath,
      rule: "relations.target.exists",
      message: `Referenced package id does not exist: ${targetId}`,
    });
  }
}

function validateVersions(pkg: LoadedSourcePackage, report: AuditReport): void {
  let previousDate: string | undefined;

  for (const [index, version] of pkg.versions.versions.entries()) {
    if (previousDate !== undefined && version.releaseDate < previousDate) {
      report.add({
        severity: "error",
        file: join(pkg.packageRoot, "versions.json"),
        packageId: pkg.meta.id,
        jsonPath: `versions[${index}].releaseDate`,
        rule: "versions.chronological",
        message: `Versions must be oldest-first (${version.releaseDate} is before ${previousDate}).`,
      });
    }
    previousDate = version.releaseDate;
  }
}

function validateInstallSteps(pkg: LoadedSourcePackage, report: AuditReport): void {
  let hasDownloaded = false;
  for (const [index, step] of pkg.install.installation.installSteps.entries()) {
    validateStepStrings(pkg, `installation.installSteps[${index}]`, step, hasDownloaded, report);
    if (step.action === "download") {
      hasDownloaded = true;
    }
  }
  for (const [index, step] of pkg.install.installation.uninstallSteps.entries()) {
    validateStepStrings(pkg, `installation.uninstallSteps[${index}]`, step, false, report);
  }
}

function validateStepStrings(
  pkg: LoadedSourcePackage,
  jsonPath: string,
  step: object,
  downloadAvailable: boolean,
  report: AuditReport,
): void {
  const values = Object.values(step).flatMap((value) =>
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [],
  );
  for (const value of values) {
    for (const match of value.matchAll(/\{([^{}]+)\}/gu)) {
      const placeholder = match[1];
      if (!ALLOWED_PLACEHOLDERS.has(placeholder)) {
        report.add({
          severity: "error",
          file: join(pkg.packageRoot, "install.json"),
          packageId: pkg.meta.id,
          jsonPath,
          rule: "installation.placeholder.supported",
          message: `Unsupported placeholder: {${placeholder}}`,
        });
      } else if (placeholder === "download" && !downloadAvailable) {
        report.add({
          severity: "error",
          file: join(pkg.packageRoot, "install.json"),
          packageId: pkg.meta.id,
          jsonPath,
          rule: "installation.download.available",
          message: "{download} is used before a download step is available.",
        });
      }
    }
  }
}

function validateUpdateCheck(pkg: LoadedSourcePackage, report: AuditReport): void {
  try {
    resolveUpdateCheck(pkg);
  } catch (error: unknown) {
    report.add({
      severity: "error",
      file: join(pkg.packageRoot, "update-check.json"),
      packageId: pkg.meta.id,
      jsonPath: "<root>",
      rule: "update-check.resolvable",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function addToGroup(
  groups: Map<string, LoadedSourcePackage[]>,
  key: string,
  pkg: LoadedSourcePackage,
): void {
  groups.set(key, [...(groups.get(key) ?? []), pkg]);
}

function reportDuplicates(
  groups: ReadonlyMap<string, LoadedSourcePackage[]>,
  jsonPath: string,
  rule: string,
  report: AuditReport,
): void {
  for (const [value, packages] of groups) {
    if (packages.length < 2) {
      continue;
    }
    for (const pkg of packages) {
      report.add({
        severity: "error",
        file: join(pkg.packageRoot, "meta.json"),
        packageId: pkg.meta.id,
        jsonPath,
        rule,
        message: `Duplicate value "${value}" is used by ${packages.length} packages.`,
      });
    }
  }
}

function finish(report: AuditReport, packageCount: number): void {
  if (report.hasIssues()) {
    report.printSummary();
    process.exitCode = 1;
    return;
  }
  console.log(`OK validated catalog source packages: ${packageCount} package(s)`);
}

main();
