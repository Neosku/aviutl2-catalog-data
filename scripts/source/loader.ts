// 正本の読み込みと検証
import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { ZodError, ZodType } from "zod";
import { SOURCE_CONTENT_FALLBACK_LOCALES } from "../../catalog-schema/definitions.ts";
import { readJsonFile } from "../shared/fs-utils.ts";
import {
  sourceContentSchema,
  sourceInstallSchema,
  sourceMetaSchema,
  sourceUpdateCheckSchema,
  sourceVersionsSchema,
} from "../../catalog-schema/definitions.ts";
import type {
  SourceContent,
  SourceInstall,
  SourceMeta,
  SourceUpdateCheck,
  SourceVersions,
} from "../../catalog-schema/definitions.ts";

export type LoadedSourcePackage = {
  packageRoot: string;
  meta: SourceMeta;
  contents: Map<string, SourceContent>;
  install: SourceInstall;
  versions: SourceVersions;
  updateCheck?: SourceUpdateCheck;
};

export type SourceContentFile = SourceContent;

export class SourceFileError extends Error {
  readonly file: string;
  readonly zodError?: ZodError;

  constructor(file: string, cause: unknown, zodError?: ZodError) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to load ${file}: ${detail}`, { cause });
    this.name = "SourceFileError";
    this.file = file;
    this.zodError = zodError;
  }
}

export function listSourcePackageRoots(packagesRoot: string): string[] {
  const packageRoots: string[] = [];

  for (const namespaceEntry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!namespaceEntry.isDirectory()) {
      continue;
    }

    const namespaceRoot = resolve(packagesRoot, namespaceEntry.name);
    for (const packageEntry of readdirSync(namespaceRoot, { withFileTypes: true })) {
      if (packageEntry.isDirectory()) {
        packageRoots.push(resolve(namespaceRoot, packageEntry.name));
      }
    }
  }

  return packageRoots.sort((left, right) => left.localeCompare(right, "en"));
}

export function loadSourcePackages(packagesRoot: string): LoadedSourcePackage[] {
  return listSourcePackageRoots(packagesRoot).map(loadSourcePackage);
}

export function compareSourcePackagesByAddedAt(
  left: LoadedSourcePackage,
  right: LoadedSourcePackage,
): number {
  return (
    left.meta.addedAt.localeCompare(right.meta.addedAt, "en") ||
    left.meta.id.localeCompare(right.meta.id, "en")
  );
}

export function loadSourcePackage(packageRoot: string): LoadedSourcePackage {
  const contentRoot = join(packageRoot, "content");
  const contents = new Map<string, SourceContent>();

  try {
    for (const contentEntry of readdirSync(contentRoot, { withFileTypes: true })) {
      if (!contentEntry.isFile() || !contentEntry.name.endsWith(".json")) {
        continue;
      }

      const path = join(contentRoot, contentEntry.name);
      contents.set(basename(contentEntry.name, ".json"), parseJson(path, sourceContentSchema));
    }
  } catch (error) {
    if (error instanceof SourceFileError) {
      throw error;
    }
    throw new SourceFileError(contentRoot, error);
  }

  const updateCheckPath = join(packageRoot, "update-check.json");
  return {
    packageRoot,
    meta: parseJson(join(packageRoot, "meta.json"), sourceMetaSchema),
    contents,
    install: parseJson(join(packageRoot, "install.json"), sourceInstallSchema),
    versions: parseJson(join(packageRoot, "versions.json"), sourceVersionsSchema),
    ...(existsSync(updateCheckPath)
      ? { updateCheck: parseJson(updateCheckPath, sourceUpdateCheckSchema) }
      : {}),
  };
}

export function pickContentForLocale(
  pkg: LoadedSourcePackage,
  locale: string,
  fallbackLocales: readonly string[] = SOURCE_CONTENT_FALLBACK_LOCALES,
): SourceContent {
  return resolveContentForLocale(pkg, locale, fallbackLocales).content;
}

export function resolveContentForLocale(
  pkg: LoadedSourcePackage,
  locale: string,
  fallbackLocales: readonly string[] = SOURCE_CONTENT_FALLBACK_LOCALES,
): { content: SourceContent; sourceLocale: string } {
  for (const candidate of new Set([locale, ...fallbackLocales])) {
    const content = pkg.contents.get(candidate);
    if (content !== undefined) {
      return { content, sourceLocale: candidate };
    }
  }

  throw new Error(
    `Package ${pkg.meta.id} has none of the requested or fallback locales: ${[locale, ...fallbackLocales].join(", ")}.`,
  );
}

export function resolveLocalizedLocalReference(
  packageRoot: string,
  locale: string,
  sourcePath: string,
  fallbackLocales: readonly string[] = SOURCE_CONTENT_FALLBACK_LOCALES,
): string {
  if (!sourcePath.startsWith("./") || existsSync(resolve(packageRoot, sourcePath))) {
    return sourcePath;
  }

  const localePattern = new RegExp(`/${escapeRegExp(locale)}(?=\\.[^./]+$)`);
  for (const fallbackLocale of fallbackLocales) {
    const fallbackCandidate = sourcePath.replace(localePattern, `/${fallbackLocale}`);
    if (fallbackCandidate !== sourcePath && existsSync(resolve(packageRoot, fallbackCandidate))) {
      return fallbackCandidate;
    }
  }
  return sourcePath;
}

function parseJson<T>(path: string, schema: ZodType<T>): T {
  let raw: unknown;
  try {
    raw = readJsonFile(path);
  } catch (error) {
    throw new SourceFileError(path, error);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new SourceFileError(path, parsed.error, parsed.error);
  }
  return parsed.data;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
