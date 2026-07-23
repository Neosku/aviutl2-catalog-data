// GitHub Release assetのURL解決とETag cacheの更新
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { z } from "zod";
import { loadSourcePackages } from "../source/loader.ts";
import { readJsonFile, writeJsonFile } from "../shared/fs-utils.ts";
import { RESOLVED_GITHUB_ASSETS_PATH, type ResolvedGithubAssets } from "./resolved-assets.ts";

const CACHE_SCHEMA_VERSION = 1;
const API_ROOT = "https://api.github.com";
const CACHE_PATH = resolve(process.cwd(), ".cache", "github-release-responses.json");

const releaseAssetSchema = z.object({
  name: z.string(),
  browser_download_url: z.url({ protocol: /^https$/ }),
});
const releaseSchema = z.object({
  tag_name: z.string(),
  name: z.string().nullable().optional(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().nullable(),
  created_at: z.string(),
  assets: z.array(releaseAssetSchema),
});
const releasesSchema = z.array(releaseSchema);
const cacheEntrySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("release"),
      etag: z.string().min(1),
      value: releaseSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("releases"),
      etag: z.string().min(1),
      value: releasesSchema,
    })
    .strict(),
]);
const cacheSchema = z
  .object({
    schemaVersion: z.literal(CACHE_SCHEMA_VERSION),
    endpoints: z.record(z.string(), cacheEntrySchema),
  })
  .strict();

type Release = z.infer<typeof releaseSchema>;
type Cache = z.infer<typeof cacheSchema>;
type CacheEntry = z.infer<typeof cacheEntrySchema>;
type ResponseKind = CacheEntry["kind"];

type RequestCounters = {
  fetched: number;
  notModified: number;
};

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token === undefined || token.length === 0) {
    throw new Error(
      "GITHUB_TOKEN is required. Authenticated conditional requests are required for ETag responses not to consume the primary rate limit.",
    );
  }

  const packages = loadSourcePackages(resolve(process.cwd(), "packages"));
  const githubPackages = packages.filter(
    (pkg) => pkg.install.installation.source.type === "githubRelease",
  );
  const repositories = new Map<string, { owner: string; repo: string }>();
  for (const pkg of githubPackages) {
    const source = pkg.install.installation.source;
    if (source.type !== "githubRelease") {
      continue;
    }
    const key = `${source.owner.toLowerCase()}/${source.repo.toLowerCase()}`;
    repositories.set(key, { owner: source.owner, repo: source.repo });
  }

  const previousCache = loadCache();
  const nextCache: Cache = { schemaVersion: CACHE_SCHEMA_VERSION, endpoints: {} };
  const releasesByRepository = new Map<string, Release>();
  const counters: RequestCounters = { fetched: 0, notModified: 0 };

  for (const [key, repository] of repositories) {
    const release = await resolveRepositoryRelease(
      repository.owner,
      repository.repo,
      previousCache,
      nextCache,
      token,
      counters,
    );
    releasesByRepository.set(key, release);
  }

  const resolved: ResolvedGithubAssets = { schemaVersion: 1, packages: {} };
  for (const pkg of githubPackages) {
    const source = pkg.install.installation.source;
    if (source.type !== "githubRelease") {
      continue;
    }
    const repositoryKey = `${source.owner.toLowerCase()}/${source.repo.toLowerCase()}`;
    const release = releasesByRepository.get(repositoryKey);
    if (release === undefined) {
      throw new Error(
        `Internal error: release was not resolved for ${source.owner}/${source.repo}.`,
      );
    }
    const pattern = compilePattern(pkg.meta.id, source.pattern);
    const matchingAssets = release.assets.filter((asset) => pattern.test(asset.name));
    if (matchingAssets.length !== 1) {
      throw new Error(
        `Package ${pkg.meta.id}: pattern "${source.pattern}" matched ${matchingAssets.length} assets in ${source.owner}/${source.repo} release ${describeRelease(release)}; exactly one match is required.`,
      );
    }
    const asset = matchingAssets[0];
    validateBrowserDownloadUrl(asset.browser_download_url, source.owner, source.repo, pkg.meta.id);
    resolved.packages[pkg.meta.id] = {
      owner: source.owner,
      repo: source.repo,
      pattern: source.pattern,
      tagName: release.tag_name,
      assetName: asset.name,
      url: asset.browser_download_url,
    };
  }

  writeJsonFile(CACHE_PATH, nextCache);
  writeJsonFile(RESOLVED_GITHUB_ASSETS_PATH, resolved);
  console.log(
    `Resolved ${githubPackages.length} packages from ${repositories.size} repositories (${counters.fetched} HTTP 200, ${counters.notModified} HTTP 304).`,
  );
}

async function resolveRepositoryRelease(
  owner: string,
  repo: string,
  previousCache: Cache,
  nextCache: Cache,
  token: string,
  counters: RequestCounters,
): Promise<Release> {
  const encodedRepository = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const latestEndpoint = `/repos/${encodedRepository}/releases/latest`;
  const latest = await requestGitHub(
    latestEndpoint,
    "release",
    previousCache,
    nextCache,
    token,
    counters,
    true,
  );
  if (latest !== null) {
    return latest;
  }

  const releasesEndpoint = `/repos/${encodedRepository}/releases?per_page=30`;
  const releases = await requestGitHub(
    releasesEndpoint,
    "releases",
    previousCache,
    nextCache,
    token,
    counters,
    false,
  );
  const candidates = releases.filter((release) => !release.draft);
  const release = candidates.reduce<Release | undefined>((newest, candidate) => {
    if (newest === undefined) {
      return candidate;
    }
    return releaseTimestamp(candidate) > releaseTimestamp(newest) ? candidate : newest;
  }, undefined);
  if (release === undefined) {
    throw new Error(`GitHub release not found: ${owner}/${repo}.`);
  }
  return release;
}

async function requestGitHub(
  endpoint: string,
  kind: "release",
  previousCache: Cache,
  nextCache: Cache,
  token: string,
  counters: RequestCounters,
  allowNotFound: boolean,
): Promise<Release | null>;
async function requestGitHub(
  endpoint: string,
  kind: "releases",
  previousCache: Cache,
  nextCache: Cache,
  token: string,
  counters: RequestCounters,
  allowNotFound: false,
): Promise<Release[]>;
async function requestGitHub(
  endpoint: string,
  kind: ResponseKind,
  previousCache: Cache,
  nextCache: Cache,
  token: string,
  counters: RequestCounters,
  allowNotFound: boolean,
): Promise<Release | Release[] | null> {
  const cached = previousCache.endpoints[endpoint];
  const compatibleCache = cached?.kind === kind ? cached : undefined;
  let response = await fetchGitHub(endpoint, token, compatibleCache?.etag);

  if (response.status === 304) {
    if (compatibleCache === undefined) {
      response = await fetchGitHub(endpoint, token);
    } else {
      counters.notModified += 1;
      nextCache.endpoints[endpoint] = compatibleCache;
      return compatibleCache.value;
    }
  }
  if (response.status === 404 && allowNotFound) {
    return null;
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API request failed: ${endpoint} returned HTTP ${response.status}${body.length > 0 ? `: ${body.slice(0, 500)}` : ""}`,
    );
  }

  const etag = response.headers.get("etag");
  if (etag === null || etag.length === 0) {
    throw new Error(`GitHub API response did not include an ETag: ${endpoint}.`);
  }
  const raw = (await response.json()) as unknown;
  counters.fetched += 1;
  if (kind === "release") {
    const value = releaseSchema.parse(raw);
    nextCache.endpoints[endpoint] = { kind, etag, value };
    return value;
  }
  const value = releasesSchema.parse(raw);
  nextCache.endpoints[endpoint] = { kind, etag, value };
  return value;
}

function fetchGitHub(endpoint: string, token: string, etag?: string): Promise<Response> {
  return fetch(`${API_ROOT}${endpoint}`, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "aviutl2-catalog-data",
      "X-GitHub-Api-Version": "2026-03-10",
      ...(etag !== undefined ? { "If-None-Match": etag } : {}),
    },
  });
}

function loadCache(): Cache {
  if (!existsSync(CACHE_PATH)) {
    return createEmptyCache();
  }
  try {
    const parsed = cacheSchema.safeParse(readJsonFile(CACHE_PATH));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // A broken cache is equivalent to a cache miss; every repository is fetched without an ETag.
  }
  console.warn(`Ignoring invalid GitHub response cache: ${CACHE_PATH}.`);
  return createEmptyCache();
}

function createEmptyCache(): Cache {
  return { schemaVersion: CACHE_SCHEMA_VERSION, endpoints: {} };
}

function compilePattern(packageId: string, pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new Error(`Package ${packageId}: invalid GitHub asset pattern "${pattern}".`, {
      cause: error,
    });
  }
}

function releaseTimestamp(release: Release): number {
  return Date.parse(release.published_at ?? release.created_at) || 0;
}

function describeRelease(release: Release): string {
  const label = release.name?.trim() || release.tag_name || "unknown";
  return release.prerelease ? `${label} (prerelease)` : label;
}

function validateBrowserDownloadUrl(
  url: string,
  owner: string,
  repo: string,
  packageId: string,
): void {
  const parsed = new URL(url);
  const expectedPrefix = `/${owner}/${repo}/releases/download/`.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== "github.com" ||
    !parsed.pathname.toLowerCase().startsWith(expectedPrefix)
  ) {
    throw new Error(
      `Package ${packageId}: GitHub returned an unexpected browser_download_url for ${owner}/${repo}: ${url}`,
    );
  }
}

await main();
