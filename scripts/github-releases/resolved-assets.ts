// 解決済みGitHub Release assetの読み込みと配布用installへの変換
import { resolve } from "node:path";
import { z } from "zod";
import type { LoadedSourcePackage } from "../source/loader.ts";
import { readJsonFile } from "../shared/fs-utils.ts";
import type { CatalogInstallPackage } from "../../catalog-schema/definitions.ts";

export const RESOLVED_GITHUB_ASSETS_PATH = resolve(
  process.cwd(),
  ".tmp",
  "resolved-github-assets.json",
);

const resolvedGithubAssetSchema = z
  .object({
    owner: z.string().min(1),
    repo: z.string().min(1),
    pattern: z.string().min(1),
    tagName: z.string(),
    assetName: z.string().min(1),
    url: z.url({ protocol: /^https$/ }),
  })
  .strict();

const resolvedGithubAssetsSchema = z
  .object({
    schemaVersion: z.literal(1),
    packages: z.record(z.string(), resolvedGithubAssetSchema),
  })
  .strict();

export type ResolvedGithubAssets = z.infer<typeof resolvedGithubAssetsSchema>;

export function loadResolvedGithubAssets(
  path: string = RESOLVED_GITHUB_ASSETS_PATH,
): ResolvedGithubAssets {
  try {
    return resolvedGithubAssetsSchema.parse(readJsonFile(path));
  } catch (error) {
    throw new Error(
      `GitHub Release resolution file is missing or invalid: ${path}. Run "pnpm releases:resolve" before building.`,
      { cause: error },
    );
  }
}

export function buildPublishedInstall(
  pkg: LoadedSourcePackage,
  resolvedAssets: ResolvedGithubAssets,
): CatalogInstallPackage {
  const source = pkg.install.installation.source;
  if (source.type !== "githubRelease") {
    return {
      ...(pkg.install.relations !== undefined ? { relations: pkg.install.relations } : {}),
      installation: { ...pkg.install.installation, source },
    };
  }

  const resolvedAsset = resolvedAssets.packages[pkg.meta.id];
  if (resolvedAsset === undefined) {
    throw new Error(`GitHub Release asset was not resolved for package ${pkg.meta.id}.`);
  }
  if (
    resolvedAsset.owner !== source.owner ||
    resolvedAsset.repo !== source.repo ||
    resolvedAsset.pattern !== source.pattern
  ) {
    throw new Error(
      `GitHub Release resolution is stale for package ${pkg.meta.id}. Run "pnpm releases:resolve" again.`,
    );
  }

  return {
    ...(pkg.install.relations !== undefined ? { relations: pkg.install.relations } : {}),
    installation: {
      ...pkg.install.installation,
      source: { type: "directUrl", url: resolvedAsset.url },
    },
  };
}
