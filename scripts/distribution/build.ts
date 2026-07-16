// 新schema 正本から配布用を作成
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { constants as zstdConstants, zstdCompressSync } from "node:zlib";
import { sha256Hex } from "../shared/hash-utils.ts";
import {
  copyFileIntoRepoOutput,
  ensureDirectory,
  removeDirectory,
  readJsonFile,
  replaceDirectory,
  resetDirectory,
  writeBinaryFile,
  writeJsonFile,
} from "../shared/fs-utils.ts";
import {
  CATALOG_SCHEMA_VERSION,
  SUPPORTED_LOCALES,
  manifestSchema,
  type CatalogLocale,
  type CatalogManifest,
} from "../../catalog-schema/definitions.ts";
import {
  loadSourcePackages,
  compareSourcePackagesByAddedAt,
  pickContentForLocale,
  resolveContentForLocale,
  resolveLocalizedLocalReference,
  type LoadedSourcePackage,
  type SourceContentFile,
} from "../source/loader.ts";
import { loadSourcePopularity } from "../source/popularity.ts";
import { resolveUpdateCheck } from "../shared/update-check.ts";

type FileArtifact = {
  jsonPath: string;
  zstdPath: string;
  jsonSha256: string;
  zstdSha256: string;
};

type MarkdownCoverage = {
  localized: number;
  total: number;
};

type LocaleCoverage = {
  content: {
    localized: number;
    fallbackEn: number;
    fallbackJa: number;
  };
  docs: MarkdownCoverage;
  changelog: MarkdownCoverage;
  notice: MarkdownCoverage;
};

function main(): void {
  const repoRoot = process.cwd();
  const packagesRoot = resolve(repoRoot, "packages");
  const destinationRoot = resolve(repoRoot, "publish-preview");
  const previewRoot = resolve(repoRoot, ".tmp", `publish-preview-${process.pid}`);
  const now = new Date().toISOString();
  const previousManifest = loadPreviousManifest(resolve(destinationRoot, "manifest.json"));

  const sourcePackages = loadSourcePackages(packagesRoot);
  const sourcePopularity = loadSourcePopularity(repoRoot);
  const locales = [...SUPPORTED_LOCALES];
  const orderedPackages = [...sourcePackages].sort(compareSourcePackagesByAddedAt);
  assertPopularityIds(sourcePopularity.packages, orderedPackages);

  resetDirectory(previewRoot);
  try {
    buildPreview(
      previewRoot,
      orderedPackages,
      sourcePopularity.packages,
      locales,
      now,
      previousManifest,
    );
    replaceDirectory(previewRoot, destinationRoot);
  } catch (error) {
    removeDirectory(previewRoot);
    throw error;
  }

  console.log(
    `OK built publish-preview: packages=${orderedPackages.length}, locales=${locales.join(",")}, output=${destinationRoot}`,
  );
  printLocaleCoverage(orderedPackages, locales);
}

function printLocaleCoverage(
  packages: readonly LoadedSourcePackage[],
  locales: readonly CatalogLocale[],
): void {
  console.log(`Locale coverage: packages=${packages.length}`);

  for (const locale of locales) {
    const coverage = collectLocaleCoverage(packages, locale);
    console.log(
      `  ${locale}: content=${coverage.content.localized}/${packages.length}, fallback(en)=${coverage.content.fallbackEn}, fallback(ja)=${coverage.content.fallbackJa}, docs=${formatMarkdownCoverage(coverage.docs)}, changelog=${formatMarkdownCoverage(coverage.changelog)}, notice=${formatMarkdownCoverage(coverage.notice)}`,
    );
  }
}

function collectLocaleCoverage(
  packages: readonly LoadedSourcePackage[],
  locale: CatalogLocale,
): LocaleCoverage {
  const coverage: LocaleCoverage = {
    content: { localized: 0, fallbackEn: 0, fallbackJa: 0 },
    docs: { localized: 0, total: 0 },
    changelog: { localized: 0, total: 0 },
    notice: { localized: 0, total: 0 },
  };

  for (const pkg of packages) {
    const { content, sourceLocale } = resolveContentForLocale(pkg, locale);
    if (sourceLocale === locale) {
      coverage.content.localized += 1;
    } else if (sourceLocale === "en") {
      coverage.content.fallbackEn += 1;
    } else if (sourceLocale === "ja") {
      coverage.content.fallbackJa += 1;
    }

    countMarkdownCoverage(pkg, locale, content.description.markdownSource, coverage.docs);
    countMarkdownCoverage(pkg, locale, content.changelog?.markdownSource, coverage.changelog);
    countMarkdownCoverage(pkg, locale, content.notice?.markdownSource, coverage.notice);
  }

  return coverage;
}

function countMarkdownCoverage(
  pkg: LoadedSourcePackage,
  locale: CatalogLocale,
  reference: string | undefined,
  coverage: MarkdownCoverage,
): void {
  if (reference === undefined || !reference.startsWith("./")) {
    return;
  }

  coverage.total += 1;
  const resolvedReference = resolveLocalizedLocalReference(pkg.packageRoot, locale, reference);
  if (isReferenceForLocale(resolvedReference, locale)) {
    coverage.localized += 1;
  }
}

function isReferenceForLocale(reference: string, locale: CatalogLocale): boolean {
  const escapedLocale = locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`/${escapedLocale}(?=\\.[^./]+$)`).test(reference);
}

function formatMarkdownCoverage(coverage: MarkdownCoverage): string {
  return `${coverage.localized}/${coverage.total}`;
}

function buildPreview(
  previewRoot: string,
  orderedPackages: LoadedSourcePackage[],
  popularity: Readonly<Record<string, { popularity: number; trend: number }>>,
  locales: CatalogLocale[],
  now: string,
  previousManifest: CatalogManifest | null,
): void {
  ensureDirectory(resolve(previewRoot, "catalog-list"));
  ensureDirectory(resolve(previewRoot, "catalog-detail"));
  ensureDirectory(resolve(previewRoot, "assets"));

  const manifestPaths: {
    list: Record<string, FileArtifact>;
    versions: FileArtifact;
    popularity: FileArtifact;
    install: FileArtifact;
    updateCheck: FileArtifact;
    detail: Record<string, FileArtifact>;
  } = {
    list: {},
    versions: emptyArtifact(),
    popularity: emptyArtifact(),
    install: emptyArtifact(),
    updateCheck: emptyArtifact(),
    detail: {},
  };

  for (const locale of locales) {
    const listPayload = {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      locale,
      packages: orderedPackages.map((pkg) => buildListEntry(pkg, locale)),
    };
    manifestPaths.list[locale] = writeJsonAndZstd(
      previewRoot,
      `catalog-list/${locale}.json`,
      listPayload,
    );

    const detailPayload = {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      locale,
      packages: Object.fromEntries(
        orderedPackages.map((pkg) => [pkg.meta.id, buildDetailEntry(pkg, locale)]),
      ),
    };
    manifestPaths.detail[locale] = writeJsonAndZstd(
      previewRoot,
      `catalog-detail/${locale}.json`,
      detailPayload,
    );
  }

  manifestPaths.versions = writeJsonAndZstd(previewRoot, "catalog-versions.json", {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    packages: Object.fromEntries(
      orderedPackages.map((pkg) => [pkg.meta.id, { versions: pkg.versions.versions }]),
    ),
  });

  manifestPaths.popularity = writeJsonAndZstd(previewRoot, "catalog-popularity.json", {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    packages: Object.fromEntries(
      orderedPackages.map((pkg) => [
        pkg.meta.id,
        {
          popularity: popularity[pkg.meta.id].popularity,
          trend: popularity[pkg.meta.id].trend,
        },
      ]),
    ),
  });

  manifestPaths.install = writeJsonAndZstd(previewRoot, "catalog-install.json", {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    packages: Object.fromEntries(
      orderedPackages.map((pkg) => [
        pkg.meta.id,
        {
          ...(pkg.install.relations !== undefined ? { relations: pkg.install.relations } : {}),
          installation: pkg.install.installation,
        },
      ]),
    ),
  });

  manifestPaths.updateCheck = writeJsonAndZstd(previewRoot, "catalog-update-check.json", {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    packages: orderedPackages.map(resolveUpdateCheck).filter((entry) => entry !== null),
  });

  copyReferencedAssets(previewRoot, orderedPackages, locales);

  const manifestContent = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    locales,
    paths: {
      list: Object.fromEntries(
        locales.map((locale) => [
          locale,
          artifactToManifest(manifestPaths.list[locale], previousManifest?.paths.list[locale], now),
        ]),
      ),
      versions: artifactToManifest(manifestPaths.versions, previousManifest?.paths.versions, now),
      popularity: artifactToManifest(
        manifestPaths.popularity,
        previousManifest?.paths.popularity,
        now,
      ),
      install: artifactToManifest(manifestPaths.install, previousManifest?.paths.install, now),
      updateCheck: artifactToManifest(
        manifestPaths.updateCheck,
        previousManifest?.paths.updateCheck,
        now,
      ),
      detail: Object.fromEntries(
        locales.map((locale) => [
          locale,
          artifactToManifest(
            manifestPaths.detail[locale],
            previousManifest?.paths.detail[locale],
            now,
          ),
        ]),
      ),
    },
  };
  const previousContent =
    previousManifest === null ? null : omitManifestUpdatedAt(previousManifest);
  const updatedAt =
    previousManifest !== null &&
    previousContent !== null &&
    isDeepStrictEqual(previousContent, manifestContent)
      ? previousManifest.updatedAt
      : now;
  writeJsonFile(resolve(previewRoot, "manifest.json"), { ...manifestContent, updatedAt });
}

function buildListEntry(pkg: LoadedSourcePackage, locale: string): Record<string, unknown> {
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
            markdownSource: rewriteNestedCatalogAssetReference(
              pkg,
              resolveLocalizedLocalReference(
                pkg.packageRoot,
                locale,
                content.changelog.markdownSource,
              ),
            ),
          },
        }
      : {}),
    ...(pkg.meta.niconiCommonsId !== undefined
      ? { niconiCommonsId: pkg.meta.niconiCommonsId }
      : {}),
    ...(content.deprecation !== undefined ? { deprecation: content.deprecation } : {}),
    ...(content.images?.thumbnail !== undefined
      ? {
          images: {
            thumbnail: rewriteNestedCatalogAssetReference(
              pkg,
              resolveLocalizedLocalReference(pkg.packageRoot, locale, content.images.thumbnail),
            ),
          },
        }
      : {}),
  };
}

function buildDetailEntry(pkg: LoadedSourcePackage, locale: string): Record<string, unknown> {
  const content = pickContentForLocale(pkg, locale);
  return {
    packagePageUrl: pkg.meta.packagePageUrl,
    ...(pkg.meta.fundingUrl !== undefined ? { fundingUrl: pkg.meta.fundingUrl } : {}),
    ...(pkg.meta.isOpenSource !== undefined ? { isOpenSource: pkg.meta.isOpenSource } : {}),
    ...(content.originalAuthor !== undefined ? { originalAuthor: content.originalAuthor } : {}),
    description: {
      markdownSource: rewriteNestedCatalogAssetReference(
        pkg,
        resolveLocalizedLocalReference(pkg.packageRoot, locale, content.description.markdownSource),
      ),
    },
    ...(content.notice !== undefined
      ? {
          notice: {
            markdownSource: rewriteNestedCatalogAssetReference(
              pkg,
              resolveLocalizedLocalReference(
                pkg.packageRoot,
                locale,
                content.notice.markdownSource,
              ),
            ),
          },
        }
      : {}),
    licenses: content.licenses,
    ...(content.images?.detailImages !== undefined && content.images.detailImages.length > 0
      ? {
          images: {
            detailImages: content.images.detailImages.map((image) =>
              rewriteNestedCatalogAssetReference(
                pkg,
                resolveLocalizedLocalReference(pkg.packageRoot, locale, image),
              ),
            ),
          },
        }
      : {}),
  };
}

function rewriteAssetReference(pkg: LoadedSourcePackage, sourcePath: string): string {
  if (!sourcePath.startsWith("./")) {
    return sourcePath;
  }

  const [namespace, slug] = pkg.meta.id.split(".");
  return `./assets/${namespace}/${slug}/${sourcePath.slice(2).replaceAll("\\", "/")}`;
}

function rewriteNestedCatalogAssetReference(pkg: LoadedSourcePackage, sourcePath: string): string {
  const assetReference = rewriteAssetReference(pkg, sourcePath);
  return assetReference.startsWith("./assets/") ? `../${assetReference.slice(2)}` : assetReference;
}

function copyReferencedAssets(
  previewRoot: string,
  sourcePackages: LoadedSourcePackage[],
  locales: string[],
): void {
  const copied = new Set<string>();

  for (const pkg of sourcePackages) {
    for (const locale of locales) {
      const content: SourceContentFile = pickContentForLocale(pkg, locale);
      const refs = [
        content.description.markdownSource,
        content.changelog?.markdownSource,
        content.notice?.markdownSource,
        content.images?.thumbnail,
        ...(content.images?.detailImages ?? []),
      ]
        .filter((value): value is string => typeof value === "string" && value.startsWith("./"))
        .map((value) => resolveLocalizedLocalReference(pkg.packageRoot, locale, value));

      for (const ref of refs) {
        const targetRelativePath = rewriteAssetReference(pkg, ref);
        if (copied.has(targetRelativePath)) {
          continue;
        }

        const sourcePath = resolve(pkg.packageRoot, ref);
        const targetPath = resolve(previewRoot, ...targetRelativePath.slice(2).split("/"));
        copyFileIntoRepoOutput(sourcePath, targetPath);
        copied.add(targetRelativePath);
      }
    }
  }
}

function writeJsonAndZstd(
  previewRoot: string,
  relativeJsonPath: string,
  payload: unknown,
): FileArtifact {
  const jsonBytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const zstdBytes = zstdCompressSync(jsonBytes, {
    params: {
      [zstdConstants.ZSTD_c_compressionLevel]: 8,
    },
  });
  const jsonPath = resolve(previewRoot, relativeJsonPath);
  const zstdPath = resolve(previewRoot, `${relativeJsonPath}.zst`);

  writeBinaryFile(jsonPath, jsonBytes);
  writeBinaryFile(zstdPath, zstdBytes);

  return {
    jsonPath: `./${relativeJsonPath.replaceAll("\\", "/")}`,
    zstdPath: `./${relativeJsonPath.replaceAll("\\", "/")}.zst`,
    jsonSha256: sha256Hex(jsonBytes),
    zstdSha256: sha256Hex(zstdBytes),
  };
}

function artifactToManifest(
  artifact: FileArtifact,
  previous: CatalogManifest["paths"]["versions"] | undefined,
  now: string,
): {
  updatedAt: string;
  json: { path: string; sha256: string };
  zstd: { path: string; sha256: string };
} {
  return {
    updatedAt: previous?.json.sha256 === artifact.jsonSha256 ? previous.updatedAt : now,
    json: {
      path: artifact.jsonPath,
      sha256: artifact.jsonSha256,
    },
    zstd: {
      path: artifact.zstdPath,
      sha256: artifact.zstdSha256,
    },
  };
}

function loadPreviousManifest(path: string): CatalogManifest | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const parsed = manifestSchema.safeParse(readJsonFile(path));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function omitManifestUpdatedAt(manifest: CatalogManifest): Omit<CatalogManifest, "updatedAt"> {
  const { updatedAt: _updatedAt, ...content } = manifest;
  return content;
}

function emptyArtifact(): FileArtifact {
  return {
    jsonPath: "",
    zstdPath: "",
    jsonSha256: "",
    zstdSha256: "",
  };
}

function assertPopularityIds(
  popularity: Readonly<Record<string, unknown>>,
  packages: readonly LoadedSourcePackage[],
): void {
  const popularityIds = Object.keys(popularity).sort();
  const packageIds = packages.map((pkg) => pkg.meta.id).sort();
  if (!isDeepStrictEqual(popularityIds, packageIds)) {
    throw new Error("catalog-popularity.json package ids do not match source packages.");
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
